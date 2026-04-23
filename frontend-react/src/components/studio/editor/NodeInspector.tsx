/**
 * NodeInspector — Premium node list with inline controls (Human Supremacy Phase 1)
 *
 * Replaces the basic SceneNodeList with:
 * - Visibility toggle (👁) per node
 * - Lock toggle (🔒) per node
 * - Z-Index badge + inline adjust
 * - Quick Pose/Face cycle buttons (◀ ▶)
 * - Drag-to-reorder Z-Index (native HTML5 Drag)
 * - Solo button for background layers
 * - Opacity mini-slider for background layers
 */

import React, { useState, useRef, useCallback } from 'react';
import { useSceneGraphStore } from '@/stores/useSceneGraphStore';
import { Eye, EyeOff, Lock, Unlock, ChevronLeft, ChevronRight, Star, GripVertical, Layers, User, Image } from 'lucide-react';
import type { CharacterNodeData, AnyNodeData } from '@/core/scene-graph/types';

// ══════════════════════════════════════════════
// Node Card — single item in the list
// ══════════════════════════════════════════════

interface NodeCardProps {
    nodeId: string;
    node: AnyNodeData;
    isSelected: boolean;
    isLocked: boolean;
    isSoloed: boolean;
    snapshot: any;
    onSelect: () => void;
}

const NodeCard: React.FC<NodeCardProps> = ({ nodeId, node, isSelected, isLocked, isSoloed, snapshot, onSelect }) => {
    const toggleVisibility = useSceneGraphStore(s => s.toggleNodeVisibility);
    const toggleLock = useSceneGraphStore(s => s.toggleNodeLock);
    const setNodeZIndex = useSceneGraphStore(s => s.setNodeZIndex);
    const soloNode = useSceneGraphStore(s => s.soloNode);
    const cyclePose = useSceneGraphStore(s => s.cyclePose);
    const cycleFace = useSceneGraphStore(s => s.cycleFace);
    const flipCharacter = useSceneGraphStore(s => s.flipCharacter);
    const manager = useSceneGraphStore(s => s.manager);
    const removeFromScene = useSceneGraphStore(s => s.removeFromScene);

    const snap = snapshot;
    const isVisible = snap?.visible !== false;
    const isCharacter = node.nodeType === 'character';
    const isBgLayer = node.nodeType === 'background_layer';
    const charNode = isCharacter ? (node as CharacterNodeData) : null;
    const currentPose = charNode?.activeLayers?.pose || '—';
    const currentFace = charNode?.activeLayers?.face || '—';
    const zIndex = snap?.zIndex ?? node.zIndex ?? 0;

    const [editingZ, setEditingZ] = useState(false);
    const [zInput, setZInput] = useState(String(zIndex));

    // Icon by type
    const TypeIcon = isCharacter ? User : isBgLayer ? Image : Layers;
    const typeColor = isCharacter ? 'text-cyan-400' : isBgLayer ? 'text-blue-400' : 'text-zinc-500';

    return (
        <div
            onClick={onSelect}
            className={`
                relative rounded-lg p-2.5 cursor-pointer transition-all duration-150 group border
                ${isSelected
                    ? 'bg-indigo-500/10 border-indigo-500/50 shadow-[0_0_15px_rgba(99,102,241,0.1)]'
                    : 'bg-white/[0.03] border-white/5 hover:bg-white/[0.06] hover:border-white/10'
                }
                ${!isVisible ? 'opacity-40' : ''}
            `}
        >
            {/* Header Row: Visibility, Lock, Name, Z-Badge */}
            <div className="flex items-center gap-1.5 mb-1.5">
                {/* Drag Handle */}
                <GripVertical className="w-3 h-3 text-zinc-700 cursor-grab active:cursor-grabbing shrink-0 opacity-0 group-hover:opacity-60 transition-opacity" />

                {/* Visibility */}
                <button
                    onClick={(e) => { e.stopPropagation(); toggleVisibility(nodeId); }}
                    className={`shrink-0 w-5 h-5 flex items-center justify-center rounded transition-colors ${isVisible ? 'text-zinc-400 hover:text-white' : 'text-red-500/60 hover:text-red-400'}`}
                    title={isVisible ? 'Hide' : 'Show'}
                >
                    {isVisible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                </button>

                {/* Lock */}
                <button
                    onClick={(e) => { e.stopPropagation(); toggleLock(nodeId); }}
                    className={`shrink-0 w-5 h-5 flex items-center justify-center rounded transition-colors ${isLocked ? 'text-amber-400 hover:text-amber-300' : 'text-zinc-600 hover:text-zinc-400'}`}
                    title={isLocked ? 'Unlock' : 'Lock'}
                >
                    {isLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                </button>

                {/* Type Icon + Name */}
                <TypeIcon className={`w-3 h-3 shrink-0 ${typeColor}`} />
                <span className="font-bold text-[10px] text-zinc-200 truncate flex-1">{node.name}</span>

                {/* Z-Index Badge */}
                {editingZ ? (
                    <input
                        autoFocus
                        type="number"
                        value={zInput}
                        onChange={e => setZInput(e.target.value)}
                        onBlur={() => {
                            const v = parseInt(zInput);
                            if (!isNaN(v)) setNodeZIndex(nodeId, v);
                            setEditingZ(false);
                        }}
                        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                        onClick={e => e.stopPropagation()}
                        className="w-10 h-5 bg-zinc-900 border border-indigo-500 rounded text-[9px] font-mono text-center text-indigo-300 focus:outline-none"
                    />
                ) : (
                    <button
                        onClick={(e) => { e.stopPropagation(); setZInput(String(zIndex)); setEditingZ(true); }}
                        className="px-1.5 py-0.5 bg-zinc-800/80 rounded text-[8px] font-mono text-zinc-500 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors shrink-0"
                        title="Click to edit Z-Index"
                    >
                        z:{zIndex}
                    </button>
                )}
            </div>

            {/* Info Row */}
            <div className="text-[9px] font-mono text-zinc-500 pl-8 mb-1">
                pos({snap?.x?.toFixed(1)}, {snap?.y?.toFixed(1)}) · α={((snap?.opacity ?? 1) * 100).toFixed(0)}%
            </div>

            {/* Character Controls */}
            {isCharacter && (
                <div className="flex items-center gap-2 pl-8 mt-1">
                    {/* Pose Cycling */}
                    <div className="flex items-center gap-0.5 bg-zinc-900/80 rounded-md border border-zinc-800/50 px-1">
                        <button
                            onClick={(e) => { e.stopPropagation(); cyclePose(nodeId, -1); }}
                            className="w-4 h-4 flex items-center justify-center text-zinc-500 hover:text-indigo-400 transition-colors"
                        >
                            <ChevronLeft className="w-3 h-3" />
                        </button>
                        <span className="text-[8px] text-indigo-300 font-bold min-w-[40px] text-center truncate" title={currentPose}>
                            🎭 {currentPose.length > 6 ? currentPose.slice(0, 6) + '..' : currentPose}
                        </span>
                        <button
                            onClick={(e) => { e.stopPropagation(); cyclePose(nodeId, 1); }}
                            className="w-4 h-4 flex items-center justify-center text-zinc-500 hover:text-indigo-400 transition-colors"
                        >
                            <ChevronRight className="w-3 h-3" />
                        </button>
                    </div>

                    {/* Face Cycling */}
                    <div className="flex items-center gap-0.5 bg-zinc-900/80 rounded-md border border-zinc-800/50 px-1">
                        <button
                            onClick={(e) => { e.stopPropagation(); cycleFace(nodeId, -1); }}
                            className="w-4 h-4 flex items-center justify-center text-zinc-500 hover:text-amber-400 transition-colors"
                        >
                            <ChevronLeft className="w-3 h-3" />
                        </button>
                        <span className="text-[8px] text-amber-300 font-bold min-w-[40px] text-center truncate" title={currentFace}>
                            😊 {currentFace.length > 6 ? currentFace.slice(0, 6) + '..' : currentFace}
                        </span>
                        <button
                            onClick={(e) => { e.stopPropagation(); cycleFace(nodeId, 1); }}
                            className="w-4 h-4 flex items-center justify-center text-zinc-500 hover:text-amber-400 transition-colors"
                        >
                            <ChevronRight className="w-3 h-3" />
                        </button>
                    </div>

                    {/* Flip */}
                    <button
                        onClick={(e) => { e.stopPropagation(); flipCharacter(nodeId); }}
                        className="w-5 h-5 flex items-center justify-center rounded bg-zinc-900/80 border border-zinc-800/50 text-zinc-500 hover:text-cyan-400 text-[10px] transition-colors"
                        title="Flip (Mirror)"
                    >
                        🔄
                    </button>
                </div>
            )}

            {/* Background Layer Controls */}
            {isBgLayer && (
                <div className="flex items-center gap-2 pl-8 mt-1">
                    {/* Opacity mini-slider */}
                    <div className="flex items-center gap-1.5 flex-1">
                        <span className="text-[8px] text-zinc-600 shrink-0">α</span>
                        <input
                            type="range"
                            min={0} max={1} step={0.05}
                            value={snap?.opacity ?? 1}
                            onChange={(e) => {
                                e.stopPropagation();
                                manager.updateNode(nodeId, { opacity: parseFloat(e.target.value) } as any);
                                useSceneGraphStore.getState().evaluate();
                            }}
                            onClick={e => e.stopPropagation()}
                            className="flex-1 h-1 accent-blue-500 cursor-pointer"
                        />
                    </div>
                    {/* Solo */}
                    <button
                        onClick={(e) => { e.stopPropagation(); soloNode(nodeId); }}
                        className={`px-1.5 py-0.5 rounded text-[8px] font-bold transition-colors ${isSoloed ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/40' : 'bg-zinc-900/80 border border-zinc-800/50 text-zinc-500 hover:text-yellow-400'}`}
                        title={isSoloed ? 'Un-Solo' : 'Solo (hide all others)'}
                    >
                        <Star className="w-3 h-3 inline" /> {isSoloed ? 'Un-Solo' : 'Solo'}
                    </button>
                </div>
            )}

            {/* Remove (on hover) */}
            <button
                onClick={(e) => { e.stopPropagation(); removeFromScene(nodeId); }}
                className="absolute top-1.5 right-1.5 text-[8px] text-red-500/40 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
            >
                ✕
            </button>
        </div>
    );
};

// ══════════════════════════════════════════════
// NodeInspector — main component
// ══════════════════════════════════════════════

const NodeInspector: React.FC = () => {
    const sceneNodeIds = useSceneGraphStore(s => s.sceneNodeIds);
    const manager = useSceneGraphStore(s => s.manager);
    const snapshot = useSceneGraphStore(s => s.snapshot);
    const scenes = useSceneGraphStore(s => s.scenes);
    const activeSceneIndex = useSceneGraphStore(s => s.activeSceneIndex);
    const setSelectedBlock = useSceneGraphStore(s => s.setSelectedBlock);
    const setSidebarTab = useSceneGraphStore(s => s.setSidebarTab);
    const selectedBlock = useSceneGraphStore(s => s.selectedBlock);
    const lockedNodes = useSceneGraphStore(s => s.lockedNodes);
    const soloedNodeId = useSceneGraphStore(s => s.soloedNodeId);
    const reorderNodesZ = useSceneGraphStore(s => s.reorderNodesZ);

    const activeSceneId = scenes[activeSceneIndex]?.id || 'unknown';

    // Drag-to-reorder state
    const [dragOverId, setDragOverId] = useState<string | null>(null);
    const dragSrcId = useRef<string | null>(null);

    // Sort nodes by z-index (ascending → bottom of list = highest Z = front)
    const sortedNodeIds = [...sceneNodeIds].sort((a, b) => {
        const zA = snapshot[a]?.zIndex ?? manager.getNode(a)?.zIndex ?? 0;
        const zB = snapshot[b]?.zIndex ?? manager.getNode(b)?.zIndex ?? 0;
        return zA - zB;
    });

    const handleDragStart = useCallback((e: React.DragEvent, nodeId: string) => {
        dragSrcId.current = nodeId;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', nodeId);
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent, nodeId: string) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (nodeId !== dragSrcId.current) setDragOverId(nodeId);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent, targetId: string) => {
        e.preventDefault();
        setDragOverId(null);
        const srcId = dragSrcId.current;
        if (!srcId || srcId === targetId) return;

        // Reorder: move src to target's position
        const ids = [...sortedNodeIds];
        const srcIdx = ids.indexOf(srcId);
        const tgtIdx = ids.indexOf(targetId);
        if (srcIdx === -1 || tgtIdx === -1) return;
        ids.splice(srcIdx, 1);
        ids.splice(tgtIdx, 0, srcId);
        reorderNodesZ(ids);
        dragSrcId.current = null;
    }, [sortedNodeIds, reorderNodesZ]);

    return (
        <div className="flex-1 flex flex-col min-h-0">
            {/* Header */}
            <div className="p-3 border-b border-white/5 flex items-center justify-between shrink-0">
                <h3 className="text-[9px] font-bold text-cyan-500 uppercase tracking-widest flex items-center gap-1.5">
                    <Layers className="w-3 h-3" /> Node Inspector
                </h3>
                <span className="text-[9px] text-zinc-600 font-mono">{sceneNodeIds.length} nodes</span>
            </div>

            {/* Hint */}
            <div className="px-3 py-1.5 text-[8px] text-zinc-600 bg-zinc-900/30 border-b border-white/5 flex items-center gap-1">
                <GripVertical className="w-2.5 h-2.5" /> Drag to reorder Z · 👁 Show/Hide · 🔒 Lock · Click z:N to edit
            </div>

            {/* Node List */}
            <div className="flex-1 overflow-y-auto min-h-[30%] p-2 space-y-1 custom-scrollbar">
                {sortedNodeIds.length > 0 ? (
                    sortedNodeIds.map(id => {
                        const node = manager.getNode(id);
                        const snap = snapshot[id];
                        if (!node) return null;
                        return (
                            <div
                                key={id}
                                draggable
                                onDragStart={(e) => handleDragStart(e, id)}
                                onDragOver={(e) => handleDragOver(e, id)}
                                onDrop={(e) => handleDrop(e, id)}
                                onDragEnd={() => setDragOverId(null)}
                                className={`${dragOverId === id ? 'border-t-2 border-indigo-500' : ''}`}
                            >
                                <NodeCard
                                    nodeId={id}
                                    node={node}
                                    isSelected={selectedBlock?.nodeId === id}
                                    isLocked={lockedNodes.has(id)}
                                    isSoloed={soloedNodeId === id}
                                    snapshot={snap}
                                    onSelect={() => {
                                        setSelectedBlock({ nodeId: id, sceneId: activeSceneId });
                                        setSidebarTab('edit');
                                    }}
                                />
                            </div>
                        );
                    })
                ) : (
                    <div className="text-center py-12 opacity-30 text-[10px] space-y-2">
                        <div className="text-3xl">🎭</div>
                        <p>No scene nodes</p>
                        <p>Add characters from sidebar</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default NodeInspector;
