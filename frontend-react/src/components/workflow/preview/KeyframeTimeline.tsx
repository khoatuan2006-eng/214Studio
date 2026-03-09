import React from 'react';
import { useWorkflowStore, type CharacterNodeData, type PoseFrame } from '@/stores/useWorkflowStore';
import { Plus, Trash2 } from 'lucide-react';
import type { PreviewTrack } from './types';

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

    return (
        <div className="border-t border-white/5 bg-neutral-950/80">
            {/* Time ruler */}
            <div className="relative h-5 border-b border-white/5 ml-28">
                {totalDuration > 0 && Array.from({ length: Math.ceil(totalDuration) + 1 }, (_, i) => (
                    <div
                        key={i}
                        className="absolute top-0 h-full flex flex-col justify-end"
                        style={{ left: `${(i / totalDuration) * 100}%` }}
                    >
                        <div className="w-px h-2 bg-white/20" />
                        <span className="text-[8px] text-neutral-600 font-mono -translate-x-1/2 select-none">{i}s</span>
                    </div>
                ))}
                {/* Clickable ruler to scrub */}
                <div
                    className="absolute inset-0 cursor-pointer"
                    onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                        setCurrentTime(pct * totalDuration);
                    }}
                />
            </div>

            {/* Track rows */}
            <div className="relative">
                {tracks.length === 0 ? (
                    <div className="px-4 py-3 text-center text-neutral-600 text-[10px]">
                        No tracks — connect Character nodes to Scene Output
                    </div>
                ) : (
                    tracks.map((track) => {
                        const isTrackSelected = selectedNodeId === track.nodeId;
                        const nodeData = nodes.find(n => n.id === track.nodeId)?.data as CharacterNodeData | undefined;
                        const seq = nodeData?.sequence || [];

                        // Calculate cumulative time offsets for each frame
                        let cumTime = 0;
                        const frameBlocks = seq.map((f, idx) => {
                            const start = cumTime;
                            cumTime += f.duration;
                            return { frame: f, idx, startTime: start, endTime: cumTime };
                        });

                        return (
                            <div
                                key={track.nodeId}
                                className={`flex items-stretch border-b border-white/5 group transition-colors ${isTrackSelected ? 'bg-amber-500/5' : 'hover:bg-white/[0.02]'}`}
                            >
                                {/* Track label */}
                                <div
                                    className={`w-28 shrink-0 flex items-center gap-1.5 px-2 py-1.5 border-r border-white/5 cursor-pointer transition-colors ${isTrackSelected ? 'bg-amber-500/10' : 'hover:bg-white/5'}`}
                                    onClick={() => {
                                        setSelectedNodeId(track.nodeId);
                                        setEditFrameIdx(0);
                                    }}
                                >
                                    <div className={`w-2 h-2 rounded-full ${isTrackSelected ? 'bg-amber-400' : 'bg-indigo-500'}`} />
                                    <span className="text-[9px] font-bold text-neutral-300 truncate">{track.characterName}</span>
                                </div>

                                {/* Keyframe blocks area */}
                                <div className="flex-1 relative h-8 min-h-[32px]">
                                    {frameBlocks.map(({ frame: f, idx, startTime }) => {
                                        const leftPct = totalDuration > 0 ? (startTime / totalDuration) * 100 : 0;
                                        const widthPct = totalDuration > 0 ? (f.duration / totalDuration) * 100 : 0;
                                        const isActive = isTrackSelected && editFrameIdx === idx;
                                        const hasMovement = (f.startX != null && f.endX != null && (f.startX !== f.endX || f.startY !== f.endY));

                                        return (
                                            <div
                                                key={idx}
                                                className={`absolute top-1 bottom-1 rounded cursor-pointer flex items-center justify-center gap-0.5 overflow-hidden transition-all text-[8px] font-mono select-none ${isActive
                                                    ? 'bg-amber-500/30 border border-amber-400 text-amber-200 ring-1 ring-amber-400/30 z-10'
                                                    : 'bg-indigo-500/15 border border-indigo-500/30 text-indigo-400/80 hover:bg-indigo-500/25 hover:border-indigo-400/50'
                                                    }`}
                                                style={{ left: `${leftPct}%`, width: `${Math.max(widthPct, 1.5)}%` }}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedNodeId(track.nodeId);
                                                    setEditFrameIdx(idx);
                                                }}
                                                title={`Frame ${idx + 1}: ${f.duration}s${hasMovement ? ' (moving)' : ''}`}
                                            >
                                                {widthPct > 4 && <span>F{idx + 1}</span>}
                                                {widthPct > 8 && <span className="text-[7px] opacity-60">{f.duration}s</span>}
                                                {hasMovement && widthPct > 3 && <span className="text-emerald-400 text-[7px]">→</span>}
                                            </div>
                                        );
                                    })}

                                    {/* Playhead */}
                                    <div
                                        className="absolute top-0 bottom-0 w-px bg-white/60 pointer-events-none z-20"
                                        style={{ left: `${totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0}%` }}
                                    >
                                        <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-white rounded-full" />
                                    </div>

                                    {/* Diamond markers for positionKeyframes */}
                                    {(() => {
                                        const kfs = nodeData?.positionKeyframes || [];
                                        return kfs.map((kf, ki) => {
                                            const leftPct = totalDuration > 0 ? (kf.time / totalDuration) * 100 : 0;
                                            return (
                                                <div
                                                    key={`pkf-${ki}`}
                                                    className="absolute -bottom-0.5 w-2.5 h-2.5 bg-amber-400 border border-amber-600 rotate-45 cursor-pointer hover:scale-125 transition-transform z-30"
                                                    style={{ left: `${leftPct}%`, transform: `translateX(-50%) rotate(45deg)` }}
                                                    title={`Position KF: ${kf.time.toFixed(1)}s (${kf.x}, ${kf.y})`}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setCurrentTime(kf.time);
                                                        setSelectedNodeId(track.nodeId);
                                                    }}
                                                />
                                            );
                                        });
                                    })()}
                                </div>

                                {/* Add/Delete frame buttons */}
                                <div className="shrink-0 flex items-center gap-0.5 px-1 border-l border-white/5">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (!nodeData) return;
                                            const newFrame: PoseFrame = {
                                                id: crypto.randomUUID(),
                                                layers: seq.length > 0 ? { ...seq[seq.length - 1].layers } : {},
                                                duration: 2,
                                                transition: 'cut',
                                                transitionDuration: 0.3,
                                            };
                                            const updated = [...seq, newFrame];
                                            updateNodeData(track.nodeId, { sequence: updated });
                                            setSelectedNodeId(track.nodeId);
                                            setEditFrameIdx(updated.length - 1);
                                        }}
                                        className="p-1 rounded hover:bg-emerald-500/20 text-neutral-600 hover:text-emerald-400 transition-colors"
                                        title="Add keyframe"
                                    >
                                        <Plus className="w-3 h-3" />
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
                                            title="Delete selected keyframe"
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })
                )}

                {/* Global playhead line across all tracks */}
                <div
                    className="absolute top-0 bottom-0 w-px bg-red-500/50 pointer-events-none z-20"
                    style={{ left: `calc(112px + ${totalDuration > 0 ? (currentTime / totalDuration) : 0} * (100% - 112px - 44px))` }}
                />
            </div>
        </div>
    );
};

export default KeyframeTimeline;
