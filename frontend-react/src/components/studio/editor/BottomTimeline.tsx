import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Timeline } from '@xzdarcy/react-timeline-editor';
import type { TimelineState, TimelineRow } from '@xzdarcy/react-timeline-editor';
import '@xzdarcy/react-timeline-editor/dist/react-timeline-editor.css';
import { useStudioStore } from '@/stores/useStudioStore';

export const BottomTimeline: React.FC<{
    currentFrame: number;
    onFrameChange: (frame: number) => void;
    isPlaying: boolean;
    onPlayingChange: (playing: boolean) => void;
}> = ({ currentFrame, onFrameChange, isPlaying, onPlayingChange }) => {
    const { layers, fps, setSelectedLayer, durationInFrames } = useStudioStore();
    const [scale, setScale] = useState(5);
    const [autoScroll, setAutoScroll] = useState(true);
    
    // Timeline ref to control player
    const timelineState = useRef<TimelineState>(null);
    const rafRef = useRef<number | null>(null);
    const lastTimeRef = useRef<number>(0);

    // Map Studio Layers into TimelineRows grouped by characterId
    const editorData: TimelineRow[] = useMemo(() => {
        const groups = new Map<string, typeof layers>();
        
        layers.forEach(l => {
            const key = l.characterId || `standalone_${l.id}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(l);
        });

        const rows: TimelineRow[] = [];
        groups.forEach((groupLayers, key) => {
            rows.push({
                id: key,
                actions: [
                    {
                        id: `action_${key}`,
                        start: 0,
                        end: 10, // Default 10 seconds duration
                        effectId: "effect0",
                    }
                ]
            });
        });
        return rows;
    }, [layers]);

    // Playback loop (legacy mode)
    useEffect(() => {
        if (!isPlaying) {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            return;
        }
        lastTimeRef.current = performance.now();
        const tick = (now: number) => {
            const delta = now - lastTimeRef.current;
            if (delta >= 1000 / (fps || 30)) {
                lastTimeRef.current = now;
                const next = currentFrame + 1;
                if (next >= durationInFrames) {
                    onPlayingChange(false);
                    onFrameChange(0);
                } else {
                    onFrameChange(next);
                }
            }
            rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    }, [isPlaying, fps, durationInFrames, currentFrame, onFrameChange, onPlayingChange]);

    const effects = useMemo(() => ({
        "effect0": {
            id: "effect0",
            name: "Default Clip",
        }
    }), []);

    return (
        <div className="h-80 flex flex-col border-t border-white/10" style={{ backgroundColor: 'var(--surface-sunken)' }}>
            {/* Playback Controls */}
            <div className="h-10 flex items-center px-4 gap-3 bg-black/40 border-b border-white/5 flex-none">
                <button
                    onClick={() => onPlayingChange(!isPlaying)}
                    className="px-3 py-1 rounded-md text-[10px] font-bold uppercase transition shrink-0"
                    style={{
                        background: isPlaying ? 'linear-gradient(135deg, #ef4444, #f97316)' : 'linear-gradient(135deg, #06b6d4, #8b5cf6)',
                        boxShadow: isPlaying ? '0 2px 10px rgba(239,68,68,0.3)' : '0 2px 10px rgba(6,182,212,0.3)',
                    }}
                >
                    {isPlaying ? '⏸ Pause' : '▶ Play'}
                </button>
                <div className="w-px h-5 bg-white/10" />
                <input
                    type="range"
                    min={0}
                    max={durationInFrames - 1}
                    step={1}
                    value={currentFrame}
                    onChange={(e) => onFrameChange(parseInt(e.target.value))}
                    className="flex-1 h-1 accent-indigo-500 cursor-pointer"
                />
                <span className="text-[10px] font-mono text-neutral-400 min-w-[60px] text-right">
                    {currentFrame} / {durationInFrames}
                </span>
            </div>
            
            {/* Timeline Label */}
            <div className="h-8 flex-none border-b border-white/5 flex items-center px-4 bg-black/20">
                <span className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Timeline Engine</span>
                <div className="ml-auto flex gap-2">
                    <button className="text-[10px] text-indigo-400 font-mono">scale: {scale}x</button>
                </div>
            </div>
            
            {/* Timeline */}
            <div className="flex-1 relative bg-black/40" style={{ overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
                    <Timeline
                        style={{ width: '100%', height: '100%' }}
                        ref={timelineState}
                        editorData={editorData}
                        effects={effects}
                        scale={scale}
                        scaleSplitCount={10}
                        autoScroll={autoScroll}
                        onChange={(data) => {
                            console.log("Timeline Data Changed", data);
                        }}
                        onClickAction={(e, { action, row }) => {
                            if (row.id.startsWith('standalone_')) {
                                setSelectedLayer(row.id.replace('standalone_', ''));
                            } else {
                                const firstLayer = layers.find(l => l.characterId === row.id);
                                if (firstLayer) setSelectedLayer(firstLayer.id);
                            }
                        }}
                        getActionRender={(action, row) => {
                            let displayName = row.id;
                            if (row.id.startsWith('standalone_')) {
                                const realId = row.id.replace('standalone_', '');
                                const layer = layers.find(l => l.id === realId);
                                displayName = layer ? layer.name : displayName;
                            } else {
                                const firstLayer = layers.find(l => l.characterId === row.id);
                                if (firstLayer) {
                                    displayName = firstLayer.name.split(' - ')[0] || `Group ${row.id.substring(0,4)}`;
                                }
                            }
                            return (
                                <div className="h-full w-full bg-indigo-500/80 rounded-sm border border-indigo-400 flex items-center px-2 text-[10px] overflow-hidden text-white font-mono shadow-md whitespace-nowrap">
                                    🎞️ {displayName}
                                </div>
                            );
                        }}
                    />
                </div>
            </div>
        </div>
    );
};
