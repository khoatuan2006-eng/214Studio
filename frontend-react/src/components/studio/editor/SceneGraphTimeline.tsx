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
    const sceneNodeIds = useSceneGraphStore(s => s.sceneNodeIds);
    const snapshot = useSceneGraphStore(s => s.snapshot);

    // Timeline internal state
    const [scale, setScale] = useState(2);
    const timelineState = useRef<TimelineState>(null);

    // Toolbar toggle states
    const [gridSnap, setGridSnap] = useState(false);
    const [dragLine, setDragLine] = useState(true);

    // Context menu state
    const [contextMenu, setContextMenu] = useState<ContextMenuProps | null>(null);

    // UI Local State: Track expanded character nodes
    const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

    const toggleNodeExpansion = useCallback((nodeId: string) => {
        setExpandedNodes(prev => {
            const next = new Set(prev);
            if (next.has(nodeId)) next.delete(nodeId);
            else next.add(nodeId);
            return next;
        });
    }, []);

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
                    const isExpanded = expandedNodes.has(node.id);

                    // Master Track (Always present)
                    row.actions.push({
                        id: `char_master_${scene.id}_${node.id}`,
                        start: offset,
                        end: offset + nodeDur,
                        effectId: "characterMaster",
                        data: { sceneId: scene.id, nodeId: node.id, isExpanded, name: node.name }
                    } as any);

                    // Sub-tracks when expanded
                    if (isExpanded) {
                        const poseTrackId = `↳ ${node.name || node.id} [Pose]`;
                        const faceTrackId = `↳ ${node.name || node.id} [Face]`;

                        rowsMap.set(poseTrackId, { id: poseTrackId, actions: [] });
                        rowsMap.set(faceTrackId, { id: faceTrackId, actions: [] });

                        const poseRow = rowsMap.get(poseTrackId)!;
                        const faceRow = rowsMap.get(faceTrackId)!;

                        if (frames.length > 0) {
                            for (let i = 0; i < frames.length; i++) {
                                const frame = frames[i];
                                const nextFrame = frames[i + 1];
                                
                                const startObj = offset + frame.time;
                                const endObj = offset + (nextFrame ? nextFrame.time : nodeDur);
                                
                                if (endObj <= startObj) continue;

                                poseRow.actions.push({
                                    id: `frame_pose_${scene.id}_${node.id}_${i}`,
                                    start: startObj,
                                    end: endObj,
                                    effectId: "poseLayer",
                                    data: {
                                        sceneId: scene.id, nodeId: node.id, frameIndex: i, totalFrames: frames.length,
                                        value: frame.layers?.pose || '—'
                                    }
                                } as any);

                                faceRow.actions.push({
                                    id: `frame_face_${scene.id}_${node.id}_${i}`,
                                    start: startObj,
                                    end: endObj,
                                    effectId: "faceLayer",
                                    data: {
                                        sceneId: scene.id, nodeId: node.id, frameIndex: i, totalFrames: frames.length,
                                        value: frame.layers?.face || '—'
                                    }
                                } as any);
                            }
                        } else {
                            // If no frames exist yet, show a placeholder
                            poseRow.actions.push({
                                id: `frame_pose_empty_${scene.id}_${node.id}`,
                                start: offset, end: offset + nodeDur, effectId: "staticExt",
                                data: { sceneId: scene.id, nodeId: node.id }
                            } as any);
                            faceRow.actions.push({
                                id: `frame_face_empty_${scene.id}_${node.id}`,
                                start: offset, end: offset + nodeDur, effectId: "staticExt",
                                data: { sceneId: scene.id, nodeId: node.id }
                            } as any);
                        }
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
        
        // Sorting logic to keep sub-tracks immediately under their parent tracks
        rows.sort((a, b) => {
            const getParentId = (rt: string) => rt.startsWith('↳') ? rt.substring(2, rt.indexOf('[')).trim() : rt;
            const parentA = getParentId(a.id);
            const parentB = getParentId(b.id);

            // Group by parent
            if (parentA !== parentB) {
                return parentA.localeCompare(parentB);
            }

            // Inside same group
            if (a.id === parentA && b.id !== parentA) return -1; // Parent comes first
            if (b.id === parentA && a.id !== parentA) return 1;

            return a.id.localeCompare(b.id);
        });

        return rows;
    }, [scenes, sceneBoundaries, isMultiScene, expandedNodes, sceneNodeIds]);

    // ── Handle drag updates ──
    const handleActionUpdate = (action: TimelineAction, row: TimelineRow) => {
        if (action.id.startsWith('frame_pose_') || action.id.startsWith('frame_face_')) {
            const data = (action as any).data;
            if (data && data.frameIndex !== undefined && data.sceneId && data.nodeId) {
                const scene = scenes.find(s => s.id === data.sceneId);
                if (scene) {
                    const boundary = sceneBoundaries.find(b => b.sceneIndex === scenes.indexOf(scene));
                    const offset = isMultiScene && boundary ? boundary.start : 0;
                    const newLocalTime = action.start - offset;
                    // Updating one will implicitly update the other as they share the same frameIndex
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

        const isCharFrame = (action.id.startsWith('frame_pose_') || action.id.startsWith('frame_face_')) && frameIndex !== undefined;

        const items = buildActionMenuItems({
            onEdit: () => {
                setSelectedBlock({ nodeId, frameIndex, sceneId });
                setSidebarTab('edit');
            },
            onDuplicate: () => {
                if (isCharFrame) duplicateCharacterFrame(nodeId, sceneId, frameIndex!);
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
                        if (scene) scene.manager.updateCharacterFrameTime(nodeId, frameIndex!, newTime);
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

        const firstAction = row.actions[0];
        const data = firstAction ? (firstAction as any).data : null;
        const sceneId = data?.sceneId || scenes[activeSceneIndex]?.id;
        const nodeId = data?.nodeId || row.id.replace('↳ ', '').split(' [')[0];

        const scene = scenes.find(s => s.id === sceneId);
        const node = scene?.manager.getNode(nodeId);
        const isChar = node?.nodeType === 'character';
        const isSubTrack = row.id.startsWith('↳ ');

        const boundary = sceneBoundaries.find(b => scenes.indexOf(scene!) === b.sceneIndex);
        const offset = isMultiScene && boundary ? boundary.start : 0;
        const localT = Math.max(0, time - offset);

        const items = buildRowMenuItems({
            onAddFrame: () => {
                if (isChar) addCharacterFrame(nodeId, sceneId, localT);
            },
            onRemoveTrack: () => {
                if (!isSubTrack && confirm(`Remove "${node?.name || nodeId}" from scene?`)) {
                    removeFromScene(nodeId);
                    setSelectedBlock(null);
                }
            },
            trackName: row.id,
        });

        // Add Expansion Toggle Option
        if (isChar && !isSubTrack) {
            items.unshift({
                label: expandedNodes.has(nodeId) ? '▼ Thu gọn Group' : '▶ Nhấn mở xem Poses/Faces',
                onClick: () => toggleNodeExpansion(nodeId),
            });
        }

        if (!isChar || isSubTrack) {
            items.find(i => i.label.includes('Add Frame'))!.disabled = true;
        }

        if (isSubTrack) {
            items.find(i => i.label.includes('Remove'))!.disabled = true;
        }

        setContextMenu({ x: e.clientX, y: e.clientY, items, onClose: () => setContextMenu(null) });
    }, [scenes, activeSceneIndex, sceneBoundaries, isMultiScene, addCharacterFrame, removeFromScene, setSelectedBlock, expandedNodes, toggleNodeExpansion]);

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

    // ── Keyboard shortcuts (extended — Human Supremacy) ──
    const cyclePose = useSceneGraphStore(s => s.cyclePose);
    const cycleFace = useSceneGraphStore(s => s.cycleFace);
    const flipCharacter = useSceneGraphStore(s => s.flipCharacter);
    const toggleNodeVisibility = useSceneGraphStore(s => s.toggleNodeVisibility);
    const toggleNodeLock = useSceneGraphStore(s => s.toggleNodeLock);
    const setNodeZIndex = useSceneGraphStore(s => s.setNodeZIndex);

    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            
            const nodeId = selectedBlock?.nodeId;
            
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

            // Human Supremacy shortcuts
            if (nodeId) {
                if (e.key === ']') { e.preventDefault(); cyclePose(nodeId, 1); }
                if (e.key === '[') { e.preventDefault(); cyclePose(nodeId, -1); }
                if (e.key === '}') { e.preventDefault(); cycleFace(nodeId, 1); }
                if (e.key === '{') { e.preventDefault(); cycleFace(nodeId, -1); }
                if (e.key === 'h' || e.key === 'H') { e.preventDefault(); toggleNodeVisibility(nodeId); }
                if (e.key === 'l' || e.key === 'L') { e.preventDefault(); toggleNodeLock(nodeId); }
                if (e.key === 'f' || e.key === 'F') { e.preventDefault(); flipCharacter(nodeId); }
                if (e.key === 'PageUp') { e.preventDefault(); const z = snapshot[nodeId]?.zIndex ?? 0; setNodeZIndex(nodeId, z + 5); }
                if (e.key === 'PageDown') { e.preventDefault(); const z = snapshot[nodeId]?.zIndex ?? 0; setNodeZIndex(nodeId, z - 5); }
            }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [selectedBlock, handleDeleteSelected, handleDuplicateSelected, togglePlay, cyclePose, cycleFace, flipCharacter, toggleNodeVisibility, toggleNodeLock, setNodeZIndex, snapshot]);

    const effects = useMemo(() => ({
        "poseLayer": { id: "poseLayer", name: "Pose" },
        "faceLayer": { id: "faceLayer", name: "Face" },
        "characterMaster": { id: "characterMaster", name: "Character Group" },
        "background": { id: "background", name: "Bg" },
        "text": { id: "text", name: "Text" },
        "static": { id: "static", name: "Static Asset" },
        "staticExt": { id: "staticExt", name: "Empty Layer" }
    }), []);

    useEffect(() => {
        if (timelineState.current) {
            timelineState.current.setTime(displayTime);
        }
    }, [displayTime]);

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
                <div className="w-px h-5 bg-white/10" />
                <div className="flex gap-1 items-center shrink-0">
                    <button onClick={() => setScale(s => Math.max(1, s - 1))} className="w-5 h-5 flex items-center justify-center bg-white/5 rounded hover:bg-white/15 text-[10px]">−</button>
                    <span className="text-[9px] font-mono text-cyan-400 w-8 text-center">{scale}x</span>
                    <button onClick={() => setScale(s => Math.min(20, s + 1))} className="w-5 h-5 flex items-center justify-center bg-white/5 rounded hover:bg-white/15 text-[10px]">+</button>
                </div>
                <div className="w-px h-5 bg-white/10" />
                <button onClick={() => setGridSnap(v => !v)} className={`px-2 py-1 rounded text-[9px] font-bold transition ${gridSnap ? 'bg-indigo-500/30 text-indigo-300 border border-indigo-500/40' : 'bg-white/5 text-neutral-500'}`}>🔲 Grid</button>
                <button onClick={() => setDragLine(v => !v)} className={`px-2 py-1 rounded text-[9px] font-bold transition ${dragLine ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-500/40' : 'bg-white/5 text-neutral-500'}`}>📏 Snap</button>
                <div className="w-px h-5 bg-white/10" />
                <button onClick={toggleAutoKeyframe} className={`px-2 py-1 rounded text-[9px] font-bold flex items-center gap-1 ${isAutoKeyframe ? 'bg-red-500/20 text-red-400 border border-red-500/50 animate-pulse' : 'bg-white/5 text-neutral-500'}`}>
                    <span className="text-[10px]">{isAutoKeyframe ? '🔴 REC' : '⚪ Auto KF'}</span>
                </button>
                <div className="w-px h-5 bg-white/10" />
                <button onClick={handleAddFrameAtCursor} disabled={!selectedBlock} className="px-2 py-1 rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-30 transition">➕ Add</button>
                <button onClick={handleDuplicateSelected} disabled={!selectedBlock || selectedBlock.frameIndex === undefined} className="px-2 py-1 rounded text-[9px] font-bold bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 disabled:opacity-30 transition">📋 Dup</button>
                <button onClick={handleDeleteSelected} disabled={!selectedBlock || selectedBlock.frameIndex === undefined} className="px-2 py-1 rounded text-[9px] font-bold bg-red-500/10 text-red-400 hover:bg-red-500/20 disabled:opacity-30 transition">🗑️ Del</button>
                <div className="flex-1 mx-2">
                    <input type="range" min={0} max={totalDur} step={0.01} value={displayTime} 
                        onChange={(e) => { isMultiScene ? setGlobalTime(parseFloat(e.target.value)) : setTime(parseFloat(e.target.value)) }}
                        className="w-full accent-cyan-500 h-1 bg-white/10 rounded-lg cursor-pointer" />
                </div>
                <div className="text-[10px] font-mono text-cyan-200 shrink-0">{displayTime.toFixed(2)} / {totalDur.toFixed(2)}s</div>
            </div>

            {/* Timeline Editor */}
            <div className="flex-1 relative overflow-hidden bg-black/40 timeline-wrapper">
                <Timeline
                    ref={timelineState}
                    editorData={editorData}
                    effects={effects}
                    scale={scale}
                    scaleSplitCount={10}
                    autoScroll={isPlaying}
                    gridSnap={gridSnap}
                    dragLine={dragLine}
                    onChange={() => {}}
                    onActionResizing={({ action, row }) => handleActionUpdate(action, row)}
                    onActionResizeEnd={({ action, row }) => handleActionUpdate(action, row)}
                    onActionMoving={({ action, row }) => handleActionUpdate(action, row)}
                    onActionMoveEnd={({ action, row }) => handleActionUpdate(action, row)}
                    onClickAction={(e, { action, row }) => {
                        if (action.effectId === 'characterMaster') {
                            const data = (action as any).data;
                            if (data && data.nodeId) toggleNodeExpansion(data.nodeId);
                        } else {
                            const { frameIndex, sceneId, nodeId } = parseActionData(action, row);
                            if (frameIndex !== undefined) {
                                setSelectedBlock({ nodeId, frameIndex, sceneId });
                                setSidebarTab('edit');
                            }
                        }
                    }}
                    onDoubleClickAction={(e, { action, row }) => {
                        const data = (action as any).data;
                        if (data && data.nodeId) toggleNodeExpansion(data.nodeId);
                    }}
                    onContextMenuAction={handleContextMenuAction}
                    onContextMenuRow={handleContextMenuRow}
                    onClickTimeArea={(t) => { isMultiScene ? setGlobalTime(t) : setTime(t) }}
                    onCursorDrag={(t) => { isMultiScene ? setGlobalTime(t) : setTime(t) }}
                    
                    getActionRender={(action, row) => {
                        const effectId = action.effectId as string;
                        const selected = isActionSelected(action);
                        let bg = "bg-neutral-600";
                        let label = row.id;

                        if (effectId === "characterMaster") {
                            const data = (action as any).data;
                            const isExpanded = data?.isExpanded;
                            bg = "bg-zinc-800 border border-zinc-600 text-zinc-300 shadow-[inset_0_1px_rgba(255,255,255,0.1)]";
                            label = `${isExpanded ? '▼' : '▶'} ${data?.name || 'Character'} Block`;
                        } else if (effectId === "poseLayer") {
                            bg = selected ? "bg-indigo-500/90 border border-white" : "bg-indigo-600/80 border border-indigo-400 text-indigo-100";
                            label = (action as any).data?.value || "—";
                        } else if (effectId === "faceLayer") {
                            bg = selected ? "bg-amber-500/90 border border-white" : "bg-amber-600/80 border border-amber-400 text-amber-100";
                            label = (action as any).data?.value || "—";
                        } else if (effectId === "background") {
                            bg = "bg-blue-900/60 border border-blue-500 text-blue-300";
                        } else if (effectId === "staticExt") {
                            bg = "bg-neutral-800 border border-dashed border-neutral-600 text-neutral-500";
                            label = "Empty";
                        }

                        // Render Keyframe Indicators for Master Block
                        let kfDots: React.ReactNode[] = [];
                        if (effectId === "characterMaster") {
                            const d = (action as any).data;
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
                                                    <div key={`${prop}_${kf.time}`}
                                                        className="absolute w-2 h-2 bg-yellow-400 border border-black rotate-45 transform -translate-y-1/2 -translate-x-1/2 shadow-sm"
                                                        style={{ left: `${Math.max(0, Math.min(100, pct))}%`, top: '100%', zIndex: 10 }}
                                                        title={`Keyframe: ${prop} @ ${kf.time}s`} />
                                                );
                                            }
                                        });
                                    });
                                }
                            }
                        }

                        return (
                            <div className={`h-full w-full ${bg} rounded px-2 overflow-hidden hover:brightness-110 font-bold shadow-md whitespace-nowrap text-[9px] flex items-center transition-all duration-150 relative cursor-pointer`}>
                                {selected && <span className="mr-1 opacity-70">◆</span>}
                                {label}
                                {kfDots}
                            </div>
                        );
                    }}
                />
            </div>

            {contextMenu && (
                <TimelineContextMenu {...contextMenu} />
            )}
        </div>
    );
};
