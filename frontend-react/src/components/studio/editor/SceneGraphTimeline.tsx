import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { Timeline } from '@xzdarcy/react-timeline-editor';
import type { TimelineState, TimelineRow, TimelineAction } from '@xzdarcy/react-timeline-editor';
import '@xzdarcy/react-timeline-editor/dist/react-timeline-editor.css';
import { useSceneGraphStore } from '@/stores/useSceneGraphStore';
import { SceneTabs } from '@/components/SceneTabs';
import {
    TimelineContextMenu,
    buildActionMenuItems,
    buildRowMenuItems,
    type ContextMenuProps,
} from './TimelineContextMenu';

export const SceneGraphTimeline: React.FC = () => {
    const manager = useSceneGraphStore(s => s.manager);
    const currentTime = useSceneGraphStore(s => s.currentTime);
    const globalDuration = useSceneGraphStore(s => s.globalDuration);
    const duration = useSceneGraphStore(s => s.duration);
    const localTime = useSceneGraphStore(s => s.localTime);
    const isPlaying = useSceneGraphStore(s => s.isPlaying);
    const togglePlay = useSceneGraphStore(s => s.togglePlay);
    const setGlobalTime = useSceneGraphStore(s => s.setGlobalTime);
    const setTime = useSceneGraphStore(s => s.setTime);
    const scenes = useSceneGraphStore(s => s.scenes);
    const activeSceneIndex = useSceneGraphStore(s => s.activeSceneIndex);
    const setSelectedBlock = useSceneGraphStore(s => s.setSelectedBlock);
    const setSidebarTab = useSceneGraphStore(s => s.setSidebarTab);
    const selectedBlock = useSceneGraphStore(s => s.selectedBlock);

    // Auto-keyframe 
    const isAutoKeyframe = useSceneGraphStore(s => s.isAutoKeyframe);
    const toggleAutoKeyframe = useSceneGraphStore(s => s.toggleAutoKeyframe);

    // CRUD actions
    const addCharacterFrame = useSceneGraphStore(s => s.addCharacterFrame);
    const removeCharacterFrame = useSceneGraphStore(s => s.removeCharacterFrame);
    const duplicateCharacterFrame = useSceneGraphStore(s => s.duplicateCharacterFrame);
    const removeFromScene = useSceneGraphStore(s => s.removeFromScene);

    const sceneBoundaries = useSceneGraphStore(s => s.sceneBoundaries);

    // Keep reactivity tightly bound
    useSceneGraphStore(s => s.sceneNodeIds);
    useSceneGraphStore(s => s.snapshot);

    // Timeline internal state
    const [scale, setScale] = useState(2);
    const timelineState = useRef<TimelineState>(null);

    // Toolbar toggle states
    const [gridSnap, setGridSnap] = useState(false);
    const [dragLine, setDragLine] = useState(true);

    // Context menu state
    const [contextMenu, setContextMenu] = useState<ContextMenuProps | null>(null);

    const isMultiScene = scenes.length > 1;
    const totalDur = isMultiScene ? Math.max(1, globalDuration) : Math.max(1, duration);
    const displayTime = isMultiScene ? currentTime : localTime;

    // ── Build timeline rows ──
    const editorData: TimelineRow[] = useMemo(() => {
        const rowsMap = new Map<string, TimelineRow>();

        scenes.forEach((scene, sceneIndex) => {
            const boundary = sceneBoundaries[sceneIndex];
            const offset = isMultiScene && boundary ? boundary.start : 0;
            const nodes = Object.values(scene.manager.graph.nodes);
            const nodeDur = scene.duration;

            nodes.forEach(node => {
                const trackId = node.name || node.id;
                if (!rowsMap.has(trackId)) {
                    rowsMap.set(trackId, { id: trackId, actions: [] });
                }
                const row = rowsMap.get(trackId)!;

                if (node.nodeType === 'character') {
                    const charNode = node as any;
                    const frames = charNode.frameSequence || [];
                    
                    if (frames.length > 0) {
                        for (let i = 0; i < frames.length; i++) {
                            const frame = frames[i];
                            const nextFrame = frames[i + 1];
                            
                            const startObj = offset + frame.time;
                            const endObj = offset + (nextFrame ? nextFrame.time : nodeDur);
                            
                            if (endObj <= startObj) continue;

                            row.actions.push({
                                id: `frame_${scene.id}_${node.id}_${i}`,
                                start: startObj,
                                end: endObj,
                                effectId: "poseLayer",
                                data: {
                                    sceneId: scene.id,
                                    nodeId: node.id,
                                    frameIndex: i,
                                    totalFrames: frames.length,
                                    pose: frame.layers?.pose || '—',
                                    face: frame.layers?.face || '—'
                                }
                            } as any);
                        }
                    } else {
                        row.actions.push({
                             id: `static_${scene.id}_${node.id}`,
                             start: offset,
                             end: offset + nodeDur,
                             effectId: "static",
                             data: { sceneId: scene.id, nodeId: node.id }
                        } as any);
                    }
                } else if (node.nodeType === 'background_layer') {
                    row.actions.push({
                         id: `bg_${scene.id}_${node.id}`,
                         start: offset,
                         end: offset + nodeDur,
                         effectId: "background",
                         data: { sceneId: scene.id, nodeId: node.id }
                    } as any);
                } else if (node.nodeType === 'text') {
                    const textDur = Math.min(nodeDur, 3.0); 
                    row.actions.push({
                         id: `text_${scene.id}_${node.id}`,
                         start: offset,
                         end: offset + textDur,
                         effectId: "text",
                         data: { sceneId: scene.id, nodeId: node.id }
                    } as any);
                } else {
                    row.actions.push({
                         id: `base_${scene.id}_${node.id}`,
                         start: offset,
                         end: offset + nodeDur,
                         effectId: "static",
                         data: { sceneId: scene.id, nodeId: node.id }
                    } as any);
                }
            });
        });

        const rows = Array.from(rowsMap.values());
        
        rows.sort((a, b) => {
            const hasBgA = a.actions.some(ac => ac.effectId === 'background');
            const hasBgB = b.actions.some(ac => ac.effectId === 'background');
            const hasCharA = a.actions.some(ac => ac.effectId === 'poseLayer');
            const hasCharB = b.actions.some(ac => ac.effectId === 'poseLayer');
            
            if (hasCharA && !hasCharB) return -1;
            if (!hasCharA && hasCharB) return 1;
            
            if (hasBgA && !hasBgB) return 1;
            if (!hasBgA && hasBgB) return -1;
            
            return a.id.localeCompare(b.id);
        });

        return rows;
    }, [scenes, sceneBoundaries, isMultiScene]);

    // ── Handle drag updates ──
    const handleActionUpdate = (action: TimelineAction, row: TimelineRow) => {
        if (action.id.startsWith('frame_')) {
            const data = (action as any).data;
            if (data && data.frameIndex !== undefined && data.sceneId && data.nodeId) {
                const scene = scenes.find(s => s.id === data.sceneId);
                if (scene) {
                    const boundary = sceneBoundaries.find(b => b.sceneIndex === scenes.indexOf(scene));
                    const offset = isMultiScene && boundary ? boundary.start : 0;
                    const newLocalTime = action.start - offset;
                    scene.manager.updateCharacterFrameTime(data.nodeId, data.frameIndex, newLocalTime);
                }
            }
        }
    };

    // ── Parse action data helper ──
    const parseActionData = useCallback((action: TimelineAction, row: TimelineRow) => {
        let frameIndex: number | undefined;
        let sceneId: string = scenes[0]?.id || '';
        let nodeId: string = row.id;
        let totalFrames: number = 1;

        const data = (action as any).data;
        if (data) {
            sceneId = data.sceneId || sceneId;
            nodeId = data.nodeId || nodeId;
            frameIndex = data.frameIndex;
            totalFrames = data.totalFrames || 1;
        }

        return { frameIndex, sceneId, nodeId, totalFrames };
    }, [scenes]);

    // ── Context menu: right-click on action block ──
    const handleContextMenuAction = useCallback((e: React.MouseEvent, { action, row, time }: { action: TimelineAction; row: TimelineRow; time: number }) => {
        e.preventDefault();
        const { frameIndex, sceneId, nodeId, totalFrames } = parseActionData(action, row);

        const isCharFrame = action.id.startsWith('frame_') && frameIndex !== undefined;

        const items = buildActionMenuItems({
            onEdit: () => {
                setSelectedBlock({ nodeId, frameIndex, sceneId });
                setSidebarTab('edit');
            },
            onDuplicate: () => {
                if (isCharFrame) {
                    duplicateCharacterFrame(nodeId, sceneId, frameIndex!);
                }
            },
            onDelete: () => {
                if (isCharFrame) {
                    removeCharacterFrame(nodeId, sceneId, frameIndex!);
                    setSelectedBlock(null);
                }
            },
            onSetTime: isCharFrame ? () => {
                const current = action.start;
                const boundary = sceneBoundaries.find(b => scenes[scenes.indexOf(scenes.find(s => s.id === sceneId)!)]?.id === sceneId);
                const offset = isMultiScene && boundary ? boundary.start : 0;
                const localT = current - offset;
                const input = prompt(`Set frame time (seconds, current: ${localT.toFixed(2)}s):`, localT.toFixed(2));
                if (input !== null) {
                    const newTime = parseFloat(input);
                    if (!isNaN(newTime) && newTime >= 0) {
                        const scene = scenes.find(s => s.id === sceneId);
                        if (scene) {
                            scene.manager.updateCharacterFrameTime(nodeId, frameIndex!, newTime);
                        }
                    }
                }
            } : undefined,
            isLastFrame: isCharFrame && totalFrames <= 1,
        });

        setContextMenu({ x: e.clientX, y: e.clientY, items, onClose: () => setContextMenu(null) });
    }, [scenes, sceneBoundaries, isMultiScene, parseActionData, setSelectedBlock, setSidebarTab, duplicateCharacterFrame, removeCharacterFrame]);

    // ── Context menu: right-click on row ──
    const handleContextMenuRow = useCallback((e: React.MouseEvent, { row, time }: { row: TimelineRow; time: number }) => {
        e.preventDefault();

        // Find which scene/node this row belongs to
        const firstAction = row.actions[0];
        const data = firstAction ? (firstAction as any).data : null;
        const sceneId = data?.sceneId || scenes[activeSceneIndex]?.id;
        const nodeId = data?.nodeId || row.id;

        // Check if we can add frames (character nodes only)
        const scene = scenes.find(s => s.id === sceneId);
        const node = scene?.manager.getNode(nodeId);
        const isChar = node?.nodeType === 'character';

        const boundary = sceneBoundaries.find(b => scenes.indexOf(scene!) === b.sceneIndex);
        const offset = isMultiScene && boundary ? boundary.start : 0;
        const localT = Math.max(0, time - offset);

        const items = buildRowMenuItems({
            onAddFrame: () => {
                if (isChar) {
                    addCharacterFrame(nodeId, sceneId, localT);
                }
            },
            onRemoveTrack: () => {
                if (confirm(`Remove "${row.id}" from scene?`)) {
                    removeFromScene(nodeId);
                    setSelectedBlock(null);
                }
            },
            trackName: row.id,
        });

        // Disable "Add Frame" for non-character tracks
        if (!isChar) {
            items[0].disabled = true;
            items[0].label = 'Add Frame (characters only)';
        }

        setContextMenu({ x: e.clientX, y: e.clientY, items, onClose: () => setContextMenu(null) });
    }, [scenes, activeSceneIndex, sceneBoundaries, isMultiScene, addCharacterFrame, removeFromScene, setSelectedBlock]);

    // ── Toolbar actions ──
    const handleAddFrameAtCursor = useCallback(() => {
        if (!selectedBlock) return;
        const { nodeId, sceneId } = selectedBlock;
        const boundary = sceneBoundaries.find(b => {
            const scene = scenes.find(s => s.id === sceneId);
            return scene && b.sceneIndex === scenes.indexOf(scene);
        });
        const offset = isMultiScene && boundary ? boundary.start : 0;
        const localT = Math.max(0, displayTime - offset);
        addCharacterFrame(nodeId, sceneId, localT);
    }, [selectedBlock, sceneBoundaries, scenes, isMultiScene, displayTime, addCharacterFrame]);

    const handleDeleteSelected = useCallback(() => {
        if (!selectedBlock || selectedBlock.frameIndex === undefined) return;
        removeCharacterFrame(selectedBlock.nodeId, selectedBlock.sceneId, selectedBlock.frameIndex);
        setSelectedBlock(null);
    }, [selectedBlock, removeCharacterFrame, setSelectedBlock]);

    const handleDuplicateSelected = useCallback(() => {
        if (!selectedBlock || selectedBlock.frameIndex === undefined) return;
        duplicateCharacterFrame(selectedBlock.nodeId, selectedBlock.sceneId, selectedBlock.frameIndex);
    }, [selectedBlock, duplicateCharacterFrame]);

    // ── Keyboard shortcuts ──
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            
            if (e.key === 'Delete' && selectedBlock?.frameIndex !== undefined) {
                e.preventDefault();
                handleDeleteSelected();
            }
            if (e.ctrlKey && e.key === 'd' && selectedBlock?.frameIndex !== undefined) {
                e.preventDefault();
                handleDuplicateSelected();
            }
            if (e.key === ' ') {
                e.preventDefault();
                togglePlay();
            }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [selectedBlock, handleDeleteSelected, handleDuplicateSelected, togglePlay]);

    const effects = useMemo(() => ({
        "poseLayer": { id: "poseLayer", name: "Pose Clip" },
        "background": { id: "background", name: "Bg Clip" },
        "text": { id: "text", name: "Subtitle" },
        "static": { id: "static", name: "Static Asset" },
    }), []);

    // Sync external playhead changes back to timeline library
    useEffect(() => {
        if (timelineState.current) {
            timelineState.current.setTime(displayTime);
        }
    }, [displayTime]);

    // Check if an action is currently selected
    const isActionSelected = useCallback((action: TimelineAction) => {
        if (!selectedBlock) return false;
        const data = (action as any).data;
        if (!data) return false;
        return data.nodeId === selectedBlock.nodeId && 
               data.sceneId === selectedBlock.sceneId && 
               data.frameIndex === selectedBlock.frameIndex;
    }, [selectedBlock]);

    return (
        <div className="h-64 flex flex-col border-t border-cyan-500/20" style={{ backgroundColor: 'var(--surface-sunken)' }}>
            {isMultiScene && <SceneTabs mode="scene" />}

            {/* Playback Controls + Toolbar */}
            <div className="h-10 flex items-center px-3 gap-2 bg-black/40 border-b border-white/5">
                {/* Play/Pause */}
                <button
                    onClick={togglePlay}
                    className="px-3 py-1 rounded-md text-[10px] font-bold uppercase transition shrink-0"
                    style={{
                        background: isPlaying ? 'linear-gradient(135deg, #ef4444, #f97316)' : 'linear-gradient(135deg, #06b6d4, #8b5cf6)',
                        boxShadow: isPlaying ? '0 2px 10px rgba(239,68,68,0.3)' : '0 2px 10px rgba(6,182,212,0.3)',
                    }}
                >
                    {isPlaying ? '⏸' : '▶'}
                </button>

                {/* Divider */}
                <div className="w-px h-5 bg-white/10" />

                {/* Zoom controls */}
                <div className="flex gap-1 items-center shrink-0">
                    <button onClick={() => setScale(s => Math.max(1, s - 1))} className="w-5 h-5 flex items-center justify-center bg-white/5 rounded hover:bg-white/15 text-[10px]">−</button>
                    <span className="text-[9px] font-mono text-cyan-400 w-8 text-center">{scale}x</span>
                    <button onClick={() => setScale(s => Math.min(20, s + 1))} className="w-5 h-5 flex items-center justify-center bg-white/5 rounded hover:bg-white/15 text-[10px]">+</button>
                </div>

                {/* Divider */}
                <div className="w-px h-5 bg-white/10" />

                {/* Snap toggles */}
                <button
                    onClick={() => setGridSnap(v => !v)}
                    className={`px-2 py-1 rounded text-[9px] font-bold transition ${gridSnap ? 'bg-indigo-500/30 text-indigo-300 border border-indigo-500/40' : 'bg-white/5 text-neutral-500 hover:text-neutral-300'}`}
                    title="Grid Snap"
                >
                    🔲 Grid
                </button>
                <button
                    onClick={() => setDragLine(v => !v)}
                    className={`px-2 py-1 rounded text-[9px] font-bold transition ${dragLine ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-500/40' : 'bg-white/5 text-neutral-500 hover:text-neutral-300'}`}
                    title="Drag Line Snap"
                >
                    📏 Snap
                </button>

                {/* Divider */}
                <div className="w-px h-5 bg-white/10" />

                {/* Auto Keyframe Toggle */}
                <button
                    onClick={toggleAutoKeyframe}
                    className={`px-2 py-1 rounded text-[9px] font-bold transition flex items-center gap-1 ${
                        isAutoKeyframe 
                            ? 'bg-red-500/20 text-red-400 border border-red-500/50 shadow-[0_0_10px_rgba(239,68,68,0.4)] animate-pulse' 
                            : 'bg-white/5 text-neutral-500 hover:text-neutral-300'
                    }`}
                    title="Toggle Auto Keyframing (Canvas dragging records animation automatically)"
                >
                    <span className="text-[10px]">{isAutoKeyframe ? '🔴 REC' : '⚪ Auto KF'}</span>
                </button>

                {/* Divider */}
                <div className="w-px h-5 bg-white/10" />

                {/* CRUD Toolbar */}
                <button
                    onClick={handleAddFrameAtCursor}
                    disabled={!selectedBlock}
                    className="px-2 py-1 rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition"
                    title="Add Frame at Cursor (selected track)"
                >
                    ➕ Add
                </button>
                <button
                    onClick={handleDuplicateSelected}
                    disabled={!selectedBlock || selectedBlock.frameIndex === undefined}
                    className="px-2 py-1 rounded text-[9px] font-bold bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition"
                    title="Duplicate Selected Frame (Ctrl+D)"
                >
                    📋 Dup
                </button>
                <button
                    onClick={handleDeleteSelected}
                    disabled={!selectedBlock || selectedBlock.frameIndex === undefined}
                    className="px-2 py-1 rounded text-[9px] font-bold bg-red-500/10 text-red-400 hover:bg-red-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition"
                    title="Delete Selected Frame (Del)"
                >
                    🗑️ Del
                </button>

                {/* Seek slider */}
                <div className="flex-1 mx-2 flex items-center min-w-[60px]">
                    <input
                        type="range"
                        min={0}
                        max={totalDur}
                        step={0.01}
                        value={displayTime}
                        onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            isMultiScene ? setGlobalTime(val) : setTime(val);
                        }}
                        className="w-full accent-cyan-500 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                        title="Seek Time"
                    />
                </div>

                {/* Time display */}
                <div className="text-[10px] font-mono text-cyan-200 shrink-0">
                    {displayTime.toFixed(2)} / {totalDur.toFixed(2)}s
                </div>
            </div>

            {/* Timeline Editor */}
            <div className="flex-1 relative overflow-hidden bg-black/40">
                <Timeline
                    ref={timelineState}
                    editorData={editorData}
                    effects={effects}
                    scale={scale}
                    scaleSplitCount={10}
                    autoScroll={isPlaying}
                    gridSnap={gridSnap}
                    dragLine={dragLine}
                    onChange={(data) => {
                        // Not rigorously implemented as it overwrites entire tree
                    }}
                    onActionResizing={({ action, row }) => handleActionUpdate(action, row)}
                    onActionResizeEnd={({ action, row }) => handleActionUpdate(action, row)}
                    onActionMoving={({ action, row }) => handleActionUpdate(action, row)}
                    onActionMoveEnd={({ action, row }) => handleActionUpdate(action, row)}
                    onClickAction={(e, { action, row }) => {
                        const { frameIndex, sceneId, nodeId } = parseActionData(action, row);
                        setSelectedBlock({ nodeId, frameIndex, sceneId });
                        setSidebarTab('edit');
                    }}
                    onDoubleClickAction={(e, { action, row }) => {
                        const { frameIndex, sceneId, nodeId } = parseActionData(action, row);
                        setSelectedBlock({ nodeId, frameIndex, sceneId });
                        setSidebarTab('edit');
                    }}
                    onContextMenuAction={handleContextMenuAction}
                    onContextMenuRow={handleContextMenuRow}
                    onClickTimeArea={(t) => {
                        isMultiScene ? setGlobalTime(t) : setTime(t);
                    }}
                    onCursorDrag={(t) => {
                        isMultiScene ? setGlobalTime(t) : setTime(t);
                    }}
                    getActionRender={(action, row) => {
                        const effectId = action.effectId as string;
                        const selected = isActionSelected(action);
                        let bg = "bg-neutral-600";
                        let label = row.id;

                        if (effectId === "poseLayer") {
                            bg = selected
                                ? "bg-indigo-400/90 border-2 border-white shadow-[0_0_12px_rgba(99,102,241,0.6)]"
                                : "bg-indigo-500/80 border border-indigo-400";
                            const d = (action as any).data;
                            if (d) label = `[${d.pose}] ${d.face}`;
                        } else if (effectId === "background") {
                            bg = selected
                                ? "bg-blue-700/70 border-2 border-white shadow-[0_0_12px_rgba(59,130,246,0.6)]"
                                : "bg-blue-900/60 border border-blue-500 text-blue-300";
                        } else if (effectId === "text") {
                            bg = selected
                                ? "bg-green-500/70 border-2 border-white shadow-[0_0_12px_rgba(34,197,94,0.6)]"
                                : "bg-green-600/60 border border-green-500";
                        } else if (selected) {
                            bg = "bg-neutral-500 border-2 border-white shadow-[0_0_12px_rgba(255,255,255,0.4)]";
                        }

                        const d = (action as any).data;
                        let kfDots: React.ReactNode[] = [];

                        if (d && d.nodeId && d.sceneId) {
                            const sc = scenes.find(s => s.id === d.sceneId);
                            const nd = sc?.manager.getNode(d.nodeId);
                            if (nd && nd.keyframes) {
                                const actionDur = action.end - action.start;
                                const boundary = sceneBoundaries.find(b => b.sceneIndex === scenes.indexOf(sc!));
                                const offset = isMultiScene && boundary ? boundary.start : 0;
                                
                                Object.entries(nd.keyframes).forEach(([prop, frameList]) => {
                                    (frameList as any[]).forEach(kf => {
                                        const globalT = kf.time + offset;
                                        if (globalT >= action.start && globalT <= action.end) {
                                            const pct = ((globalT - action.start) / actionDur) * 100;
                                            kfDots.push(
                                                <div 
                                                    key={`${prop}_${kf.time}`}
                                                    className="absolute w-2 h-2 bg-amber-400 border border-black rotate-45 transform -translate-y-1/2 -translate-x-1/2 shadow-sm"
                                                    style={{ 
                                                        left: `${Math.max(0, Math.min(100, pct))}%`, 
                                                        top: '100%', 
                                                        zIndex: 10 
                                                    }}
                                                    title={`Keyframe: ${prop} @ ${kf.time}s`}
                                                />
                                            );
                                        }
                                    });
                                });
                            }
                        }

                        return (
                            <div className={`h-full w-full ${bg} rounded-sm px-2 text-[9px] overflow-hidden text-white font-mono shadow-md whitespace-nowrap flex items-center transition-all duration-150 relative`}>
                                {selected && <span className="mr-1 opacity-70">◆</span>}
                                {label}
                                {kfDots}
                            </div>
                        );
                    }}
                />
            </div>

            {/* Context Menu Overlay */}
            {contextMenu && (
                <TimelineContextMenu {...contextMenu} />
            )}
        </div>
    );
};
