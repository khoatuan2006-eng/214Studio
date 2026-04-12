import React, { useMemo, useRef, useState } from 'react';
import { Timeline } from '@xzdarcy/react-timeline-editor';
import type { TimelineState, TimelineRow } from '@xzdarcy/react-timeline-editor';
import '@xzdarcy/react-timeline-editor/dist/react-timeline-editor.css';
import { useStudioStore } from '@/stores/useStudioStore';

export const BottomTimeline: React.FC = () => {
    const { layers, fps, setSelectedLayer } = useStudioStore();
    const [scale, setScale] = useState(5);
    const [autoScroll, setAutoScroll] = useState(true);
    
    // Timeline ref to control player
    const timelineState = useRef<TimelineState>(null);

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

    const effects = useMemo(() => ({
        "effect0": {
            id: "effect0",
            name: "Default Clip",
        }
    }), []);

    return (
        <div className="h-64 flex flex-col border-t border-white/10" style={{ backgroundColor: 'var(--surface-sunken)' }}>
            <div className="h-8 flex-none border-b border-white/5 flex items-center px-4 bg-black/20">
                <span className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Timeline Engine</span>
                <div className="ml-auto flex gap-2">
                    <button className="text-[10px] text-indigo-400 font-mono">scale: {scale}x</button>
                </div>
            </div>
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
