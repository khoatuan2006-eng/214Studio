import React, { useCallback, useRef, useState } from 'react';
import { useWorkflowStore, type CharacterNodeData, type PoseFrame } from '@/stores/useWorkflowStore';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import type { PreviewTrack } from './types';
import { getInterpolatedZIndex } from './types';

/** Inline editable z-index badge */
const ZBadge: React.FC<{
    value: number;
    color: string;
    onChange: (v: number) => void;
}> = ({ value, color, onChange }) => {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(String(value));

    const commit = () => {
        const n = Math.max(0, Math.min(100, parseInt(draft) || 0));
        onChange(n);
        setEditing(false);
    };

    if (editing) {
        return (
            <input
                autoFocus
                type="number"
                min={0}
                max={100}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') commit();
                    if (e.key === 'Escape') setEditing(false);
                }}
                onClick={(e) => e.stopPropagation()}
                className="w-10 text-[8px] font-mono text-center rounded border-none outline-none bg-black/80 shrink-0"
                style={{ color: `${color}cc`, caretColor: color }}
            />
        );
    }

    return (
        <span
            className="text-[8px] font-mono px-1.5 py-0.5 rounded shrink-0 cursor-pointer hover:brightness-125 transition-all"
            style={{
                backgroundColor: `${color}20`,
                color: `${color}cc`,
                border: `1px solid ${color}30`,
            }}
            title="Click to edit Z-Index"
            onClick={(e) => {
                e.stopPropagation();
                setDraft(String(value));
                setEditing(true);
            }}
        >
            z{value}
        </span>
    );
};

interface KeyframeTimelineProps {
    tracks: PreviewTrack[];
    totalDuration: number;
    currentTime: number;
    setCurrentTime: (time: number) => void;
    selectedNodeId: string | null;
    setSelectedNodeId: (id: string | null) => void;
    editFrameIdx: number;
    setEditFrameIdx: (idx: number) => void;

}

const TRACK_LABEL_W = 140;
const TRACK_H = 56;
const RULER_H = 28;
const ACTIONS_W = 48;

const KeyframeTimeline: React.FC<KeyframeTimelineProps> = ({
    tracks,
    totalDuration,
    currentTime,
    setCurrentTime,
    selectedNodeId,
    setSelectedNodeId,
    editFrameIdx,
    setEditFrameIdx,
}) => {
    const { nodes, updateNodeData } = useWorkflowStore();
    const rulerRef = useRef<HTMLDivElement>(null);
    const [scrubbing, setScrubbing] = useState(false);
    const [resizing, setResizing] = useState<{
        trackNodeId: string;
        frameIdx: number;
        startX: number;
        startDuration: number;
    } | null>(null);
    const [hoverEdge, setHoverEdge] = useState<string | null>(null); // "trackId-frameIdx"

    // ── Scrub helpers ──
    const scrubFromEvent = useCallback((e: React.MouseEvent | MouseEvent) => {
        if (!rulerRef.current) return;
        const rect = rulerRef.current.getBoundingClientRect();
        const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        setCurrentTime(+(pct * totalDuration).toFixed(2));
    }, [totalDuration, setCurrentTime]);

    const handleRulerMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setScrubbing(true);
        scrubFromEvent(e);

        const onMove = (ev: MouseEvent) => scrubFromEvent(ev);
        const onUp = () => {
            setScrubbing(false);
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    }, [scrubFromEvent]);

    // ── Resize frame duration ──
    const handleResizeStart = useCallback((
        e: React.MouseEvent,
        trackNodeId: string,
        frameIdx: number,
        currentDuration: number,
    ) => {
        e.preventDefault();
        e.stopPropagation();
        setResizing({ trackNodeId, frameIdx, startX: e.clientX, startDuration: currentDuration });

        const nodeData = nodes.find(n => n.id === trackNodeId)?.data as CharacterNodeData | undefined;
        if (!nodeData) return;

        const trackArea = rulerRef.current;
        if (!trackArea) return;
        const trackWidth = trackArea.getBoundingClientRect().width;
        const pxPerSecond = trackWidth / totalDuration;

        const onMove = (ev: MouseEvent) => {
            const dx = ev.clientX - e.clientX;
            const dtSeconds = dx / pxPerSecond;
            const newDuration = Math.max(0.2, +(currentDuration + dtSeconds).toFixed(2));

            const seq = [...(nodeData.sequence || [])];
            if (seq[frameIdx]) {
                seq[frameIdx] = { ...seq[frameIdx], duration: newDuration };
                updateNodeData(trackNodeId, { sequence: seq });
            }
        };

        const onUp = () => {
            setResizing(null);
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    }, [nodes, totalDuration, updateNodeData]);

    // ── Build ruler ticks ──
    const rulerTicks = [];
    if (totalDuration > 0) {
        const step = totalDuration <= 5 ? 0.5 : totalDuration <= 15 ? 1 : 2;
        for (let t = 0; t <= totalDuration + 0.01; t += step) {
            const isMajor = Math.abs(t - Math.round(t)) < 0.01;
            rulerTicks.push({ time: t, isMajor });
        }
    }

    const playheadPct = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

    return (
        <div
            className="border-t border-white/10 select-none"
            style={{ background: 'linear-gradient(180deg, #0d0d14 0%, #111118 100%)' }}
        >
            {/* ═══ TIME RULER ═══ */}
            <div className="flex">
                {/* Ruler label spacer */}
                <div
                    className="shrink-0 flex items-end justify-center pb-0.5 border-r border-white/5"
                    style={{ width: TRACK_LABEL_W }}
                >
                    <span className="text-[8px] text-neutral-600 font-mono">TIME</span>
                </div>

                {/* Ruler area */}
                <div
                    ref={rulerRef}
                    className="flex-1 relative cursor-pointer"
                    style={{ height: RULER_H }}
                    onMouseDown={handleRulerMouseDown}
                >
                    {/* Ruler background */}
                    <div className="absolute inset-0 bg-gradient-to-b from-white/[0.03] to-transparent" />

                    {/* Ticks */}
                    {rulerTicks.map(({ time, isMajor }) => (
                        <div
                            key={time}
                            className="absolute bottom-0 flex flex-col items-center"
                            style={{ left: `${(time / totalDuration) * 100}%` }}
                        >
                            <span
                                className={`text-[8px] font-mono mb-0.5 select-none ${isMajor ? 'text-neutral-400' : 'text-neutral-600'
                                    }`}
                                style={{ transform: 'translateX(-50%)' }}
                            >
                                {isMajor ? `${Math.round(time)}s` : ''}
                            </span>
                            <div
                                className={`w-px ${isMajor ? 'h-2.5 bg-white/20' : 'h-1.5 bg-white/10'}`}
                            />
                        </div>
                    ))}

                    {/* Playhead triangle */}
                    <div
                        className="absolute bottom-0 z-30 pointer-events-none"
                        style={{ left: `${playheadPct}%`, transform: 'translateX(-50%)' }}
                    >
                        <div
                            className="w-0 h-0"
                            style={{
                                borderLeft: '5px solid transparent',
                                borderRight: '5px solid transparent',
                                borderBottom: '7px solid #f59e0b',
                                filter: 'drop-shadow(0 0 4px rgba(245,158,11,0.6))',
                            }}
                        />
                    </div>
                </div>

                {/* Actions spacer */}
                <div className="shrink-0 border-l border-white/5" style={{ width: ACTIONS_W }} />
            </div>

            {/* ═══ UNIFIED Z-SORTED TRACKS ═══ */}
            <div className="relative overflow-y-auto" style={{ maxHeight: 280 }}>
                {(() => {
                    // Build draw list: characters only (stage layers shown in left panel)
                    type TimelineItem =
                        { kind: 'character'; zIndex: number; track: PreviewTrack; trackIndex: number };

                    const items: TimelineItem[] = [];

                    tracks.forEach((track, trackIndex) => {
                        const nodeData = nodes.find(n => n.id === track.nodeId)?.data as CharacterNodeData | undefined;
                        items.push({ kind: 'character', zIndex: nodeData?.zIndex ?? 10, track, trackIndex });
                    });

                    // Sort by z-index (low = behind = top of list, high = front = bottom)
                    items.sort((a, b) => a.zIndex - b.zIndex);

                    if (items.length === 0) {
                        return (
                            <div className="px-4 py-4 text-center text-neutral-600 text-[10px]">
                                No tracks — connect Character / Stage nodes to Scene Output
                            </div>
                        );
                    }

                    const trackColors = ['#6366f1', '#8b5cf6', '#ec4899', '#06b6d4', '#10b981', '#f59e0b'];

                    return items.map((item) => {
                        if (item.kind === 'character') {
                            // ── CHARACTER TRACK ROW ──
                            const { track, trackIndex } = item;
                            const isTrackSelected = selectedNodeId === track.nodeId;
                            const nodeData = nodes.find(n => n.id === track.nodeId)?.data as CharacterNodeData | undefined;
                            const seq = nodeData?.sequence || [];
                            const trackColor = trackColors[trackIndex % trackColors.length];

                            let cumTime = 0;
                            const frameBlocks = seq.map((f, idx) => {
                                const start = cumTime;
                                cumTime += f.duration;
                                return { frame: f, idx, startTime: start, endTime: cumTime };
                            });

                            return (
                                <div
                                    key={`char-${track.nodeId}`}
                                    className={`flex items-stretch border-b border-white/5 transition-colors ${isTrackSelected ? 'bg-white/[0.03]' : 'hover:bg-white/[0.015]'}`}
                                >
                                    {/* Track label */}
                                    <div
                                        className={`shrink-0 flex items-center gap-2 px-3 border-r border-white/5 cursor-pointer transition-all ${isTrackSelected
                                            ? 'bg-gradient-to-r from-amber-500/10 to-transparent'
                                            : 'hover:bg-white/[0.03]'
                                            }`}
                                        style={{ width: TRACK_LABEL_W, height: TRACK_H }}
                                        onClick={() => {
                                            setSelectedNodeId(track.nodeId);
                                            setEditFrameIdx(0);
                                        }}
                                    >
                                        <GripVertical className="w-3 h-3 text-neutral-700 shrink-0" />
                                        <div
                                            className="w-2.5 h-2.5 rounded-full shrink-0"
                                            style={{ backgroundColor: trackColor, boxShadow: `0 0 6px ${trackColor}40` }}
                                        />
                                        <div className="flex flex-col min-w-0 flex-1">
                                            <span className="text-[10px] font-bold text-neutral-200 truncate">
                                                {track.characterName}
                                            </span>
                                            <span className="text-[8px] text-neutral-600 font-mono">
                                                {seq.length} frames
                                            </span>
                                        </div>
                                        <ZBadge
                                            value={nodeData ? getInterpolatedZIndex(nodeData, currentTime) : 10}
                                            color={trackColor}
                                            onChange={(v) => updateNodeData(track.nodeId, { zIndex: v })}
                                        />
                                    </div>

                                    {/* Keyframe blocks */}
                                    <div className="flex-1 relative" style={{ height: TRACK_H }}>
                                        {frameBlocks.map(({ frame: f, idx, startTime }) => {
                                            const leftPct = totalDuration > 0 ? (startTime / totalDuration) * 100 : 0;
                                            const widthPct = totalDuration > 0 ? (f.duration / totalDuration) * 100 : 0;
                                            const isActive = isTrackSelected && editFrameIdx === idx;
                                            const hasMovement = f.startX != null && f.endX != null &&
                                                (f.startX !== f.endX || f.startY !== f.endY);
                                            const edgeKey = `${track.nodeId}-${idx}`;
                                            const isEdgeHovered = hoverEdge === edgeKey;
                                            const isBeingResized = resizing?.trackNodeId === track.nodeId && resizing?.frameIdx === idx;

                                            return (
                                                <div
                                                    key={idx}
                                                    className={`absolute flex items-center overflow-hidden transition-all duration-100 ${isBeingResized ? 'z-20' : isActive ? 'z-10' : 'z-0'}`}
                                                    style={{
                                                        left: `${leftPct}%`,
                                                        width: `${Math.max(widthPct, 1.5)}%`,
                                                        top: 4, bottom: 4, borderRadius: 6,
                                                        background: isActive
                                                            ? `linear-gradient(135deg, ${trackColor}50, ${trackColor}30)`
                                                            : `linear-gradient(135deg, ${trackColor}20, ${trackColor}10)`,
                                                        border: isActive
                                                            ? `1.5px solid ${trackColor}`
                                                            : `1px solid ${trackColor}40`,
                                                        boxShadow: isActive
                                                            ? `0 0 12px ${trackColor}25, inset 0 1px 0 rgba(255,255,255,0.05)`
                                                            : 'inset 0 1px 0 rgba(255,255,255,0.02)',
                                                        cursor: 'pointer',
                                                    }}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setSelectedNodeId(track.nodeId);
                                                        setEditFrameIdx(idx);
                                                    }}
                                                >
                                                    <div className="flex items-center gap-1 px-2 flex-1 min-w-0">
                                                        {widthPct > 3 && (
                                                            <span className="text-[9px] font-bold shrink-0"
                                                                style={{ color: isActive ? '#fff' : `${trackColor}cc` }}>
                                                                F{idx + 1}
                                                            </span>
                                                        )}
                                                        {widthPct > 7 && (
                                                            <span className="text-[8px] text-white/30 font-mono">{f.duration}s</span>
                                                        )}
                                                        {hasMovement && widthPct > 4 && (
                                                            <span className="text-emerald-400/70 text-[8px]">→</span>
                                                        )}
                                                        {f.transition === 'crossfade' && widthPct > 4 && (
                                                            <span className="text-purple-400/70 text-[7px]">⤳</span>
                                                        )}
                                                    </div>
                                                    <div
                                                        className={`absolute right-0 top-0 bottom-0 w-2 cursor-col-resize z-10 transition-all ${isEdgeHovered || isBeingResized ? 'bg-white/20' : 'bg-transparent hover:bg-white/10'}`}
                                                        style={{ borderRadius: '0 6px 6px 0' }}
                                                        onMouseEnter={() => setHoverEdge(edgeKey)}
                                                        onMouseLeave={() => !resizing && setHoverEdge(null)}
                                                        onMouseDown={(e) => handleResizeStart(e, track.nodeId, idx, f.duration)}
                                                    />
                                                </div>
                                            );
                                        })}

                                        {/* Playhead */}
                                        <div className="absolute top-0 bottom-0 pointer-events-none z-20" style={{ left: `${playheadPct}%` }}>
                                            <div className="w-px h-full" style={{
                                                background: 'linear-gradient(180deg, #f59e0b, #f59e0b80)',
                                                boxShadow: '0 0 6px rgba(245,158,11,0.4)',
                                            }} />
                                        </div>

                                        {/* Position keyframe diamonds */}
                                        {(nodeData?.positionKeyframes || []).map((kf, ki) => (
                                            <div
                                                key={`pkf-${ki}`}
                                                className="absolute z-30 cursor-pointer group"
                                                style={{ left: `${totalDuration > 0 ? (kf.time / totalDuration) * 100 : 0}%`, bottom: 2, transform: 'translateX(-50%)' }}
                                                title={`Position KF: ${kf.time.toFixed(1)}s (${kf.x}, ${kf.y})`}
                                                onClick={(e) => { e.stopPropagation(); setCurrentTime(kf.time); setSelectedNodeId(track.nodeId); }}
                                            >
                                                <div className="w-2.5 h-2.5 rotate-45 border transition-transform group-hover:scale-125"
                                                    style={{ backgroundColor: '#f59e0b', borderColor: '#d97706', boxShadow: '0 0 4px rgba(245,158,11,0.5)' }} />
                                            </div>
                                        ))}

                                        {/* Z-Index keyframe diamonds (cyan, top) */}
                                        {(nodeData?.zIndexKeyframes || []).map((kf, ki) => (
                                            <div
                                                key={`zkf-${ki}`}
                                                className="absolute z-30 cursor-pointer group"
                                                style={{ left: `${totalDuration > 0 ? (kf.time / totalDuration) * 100 : 0}%`, top: 2, transform: 'translateX(-50%)' }}
                                                title={`Z-Index KF: ${kf.time.toFixed(1)}s → z=${kf.z}`}
                                                onClick={(e) => { e.stopPropagation(); setCurrentTime(kf.time); setSelectedNodeId(track.nodeId); }}
                                            >
                                                <div className="w-2 h-2 rotate-45 border transition-transform group-hover:scale-125"
                                                    style={{ backgroundColor: '#06b6d4', borderColor: '#0891b2', boxShadow: '0 0 4px rgba(6,182,212,0.5)' }} />
                                            </div>
                                        ))}

                                        {/* Scale keyframe diamonds (emerald) */}
                                        {(nodeData?.scaleKeyframes || []).map((kf, ki) => (
                                            <div
                                                key={`skf-${ki}`}
                                                className="absolute z-30 cursor-pointer group"
                                                style={{ left: `${totalDuration > 0 ? (kf.time / totalDuration) * 100 : 0}%`, top: '35%', transform: 'translateX(-50%)' }}
                                                title={`Scale KF: ${kf.time.toFixed(1)}s → ${kf.scale}`}
                                                onClick={(e) => { e.stopPropagation(); setCurrentTime(kf.time); setSelectedNodeId(track.nodeId); }}
                                            >
                                                <div className="w-2 h-2 rotate-45 border transition-transform group-hover:scale-125"
                                                    style={{ backgroundColor: '#10b981', borderColor: '#059669', boxShadow: '0 0 4px rgba(16,185,129,0.5)' }} />
                                            </div>
                                        ))}

                                        {/* Rotation keyframe diamonds (pink) */}
                                        {(nodeData?.rotationKeyframes || []).map((kf, ki) => (
                                            <div
                                                key={`rkf-${ki}`}
                                                className="absolute z-30 cursor-pointer group"
                                                style={{ left: `${totalDuration > 0 ? (kf.time / totalDuration) * 100 : 0}%`, top: '55%', transform: 'translateX(-50%)' }}
                                                title={`Rotation KF: ${kf.time.toFixed(1)}s → ${kf.rotation}°`}
                                                onClick={(e) => { e.stopPropagation(); setCurrentTime(kf.time); setSelectedNodeId(track.nodeId); }}
                                            >
                                                <div className="w-2 h-2 rotate-45 border transition-transform group-hover:scale-125"
                                                    style={{ backgroundColor: '#f472b6', borderColor: '#ec4899', boxShadow: '0 0 4px rgba(244,114,182,0.5)' }} />
                                            </div>
                                        ))}
                                    </div>

                                    {/* Actions */}
                                    <div className="shrink-0 flex items-center justify-center gap-0.5 border-l border-white/5" style={{ width: ACTIONS_W }}>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (!nodeData) return;
                                                const newFrame: PoseFrame = {
                                                    id: crypto.randomUUID(),
                                                    layers: seq.length > 0 ? { ...seq[seq.length - 1].layers } : {},
                                                    duration: 2, transition: 'cut', transitionDuration: 0.3,
                                                };
                                                const updated = [...seq, newFrame];
                                                updateNodeData(track.nodeId, { sequence: updated });
                                                setSelectedNodeId(track.nodeId);
                                                setEditFrameIdx(updated.length - 1);
                                            }}
                                            className="p-1 rounded hover:bg-emerald-500/20 text-neutral-600 hover:text-emerald-400 transition-colors"
                                            title="Add frame"
                                        >
                                            <Plus className="w-3.5 h-3.5" />
                                        </button>
                                        {isTrackSelected && seq.length > 1 && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    const fi = Math.min(editFrameIdx, seq.length - 1);
                                                    const updated = seq.filter((_, i) => i !== fi);
                                                    updateNodeData(track.nodeId, { sequence: updated });
                                                    setEditFrameIdx(Math.max(0, fi - 1));
                                                }}
                                                className="p-1 rounded hover:bg-red-500/20 text-neutral-600 hover:text-red-400 transition-colors"
                                                title="Delete selected frame"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        }
                    });
                })()}
            </div>
        </div>
    );
};

export default KeyframeTimeline;
