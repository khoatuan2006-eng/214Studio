/**
 * QuickActionsBar — Floating toolbar above Canvas (Human Supremacy Phase 3)
 *
 * Only visible when a node is selected. Provides one-click access to:
 * - Pose/Face cycling (◀ ▶)
 * - Flip (mirror scaleX)
 * - Z-Index adjust (↑↓)
 * - Visibility toggle
 * - Lock toggle
 */

import React from 'react';
import { useSceneGraphStore } from '@/stores/useSceneGraphStore';
import {
    Eye, EyeOff, Lock, Unlock,
    ChevronLeft, ChevronRight,
    ChevronUp, ChevronDown,
    FlipHorizontal2
} from 'lucide-react';
import type { CharacterNodeData } from '@/core/scene-graph/types';

export const QuickActionsBar: React.FC = () => {
    const selectedBlock = useSceneGraphStore(s => s.selectedBlock);
    const manager = useSceneGraphStore(s => s.manager);
    const snapshot = useSceneGraphStore(s => s.snapshot);
    const lockedNodes = useSceneGraphStore(s => s.lockedNodes);
    const cyclePose = useSceneGraphStore(s => s.cyclePose);
    const cycleFace = useSceneGraphStore(s => s.cycleFace);
    const flipCharacter = useSceneGraphStore(s => s.flipCharacter);
    const toggleNodeVisibility = useSceneGraphStore(s => s.toggleNodeVisibility);
    const toggleNodeLock = useSceneGraphStore(s => s.toggleNodeLock);
    const setNodeZIndex = useSceneGraphStore(s => s.setNodeZIndex);

    if (!selectedBlock) return null;

    const node = manager.getNode(selectedBlock.nodeId);
    const snap = snapshot[selectedBlock.nodeId];
    if (!node || !snap) return null;

    const isCharacter = node.nodeType === 'character';
    const isVisible = snap.visible !== false;
    const isLocked = lockedNodes.has(selectedBlock.nodeId);
    const zIndex = snap.zIndex ?? 0;

    const charNode = isCharacter ? (node as CharacterNodeData) : null;
    const currentPose = charNode?.activeLayers?.pose || '—';
    const currentFace = charNode?.activeLayers?.face || '—';

    const btnBase = "h-12 flex items-center justify-center gap-2 px-4 rounded-xl text-base font-bold transition-all duration-150 border";
    const btnDefault = "bg-zinc-900/90 border-zinc-700/50 text-zinc-300 hover:bg-zinc-800 hover:border-zinc-600 hover:text-white";
    const btnAccent = (color: string) => `bg-${color}-500/10 border-${color}-500/30 text-${color}-400 hover:bg-${color}-500/20 hover:text-${color}-300`;

    return (
        <div 
            className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex flex-wrap justify-center items-center gap-2.5 px-4 py-3 rounded-3xl bg-zinc-950/90 backdrop-blur-md border border-white/10 shadow-[0_12px_48px_rgba(0,0,0,0.8)] w-max max-w-[95%]"
        >
            {/* Node Name Badge */}
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
                <span className="text-lg font-bold text-indigo-300 truncate max-w-[150px]">{node.name}</span>
                <span className="text-xs text-zinc-500 uppercase tracking-widest">{node.nodeType}</span>
            </div>

            <div className="w-px h-8 bg-white/10 hidden sm:block" />

            {/* Pose Cycling (Character only) */}
            {isCharacter && (
                <>
                    <div className="flex items-center gap-1.5">
                        <button onClick={() => cyclePose(selectedBlock.nodeId, -1)} className={`${btnBase} ${btnDefault} !px-3`} title="Previous Pose (])">
                            <ChevronLeft className="w-6 h-6" />
                        </button>
                        <span className="text-base text-indigo-300 font-bold px-4 min-w-[100px] max-w-[140px] text-center bg-indigo-500/5 rounded-xl border border-indigo-500/10 h-12 flex items-center justify-center truncate" title={currentPose}>
                            🎭 {currentPose}
                        </span>
                        <button onClick={() => cyclePose(selectedBlock.nodeId, 1)} className={`${btnBase} ${btnDefault} !px-3`} title="Next Pose ([)">
                            <ChevronRight className="w-6 h-6" />
                        </button>
                    </div>

                    <div className="w-px h-8 bg-white/10 hidden sm:block" />

                    {/* Face Cycling */}
                    <div className="flex items-center gap-1.5">
                        <button onClick={() => cycleFace(selectedBlock.nodeId, -1)} className={`${btnBase} ${btnDefault} !px-3`} title="Previous Face ({)">
                            <ChevronLeft className="w-6 h-6" />
                        </button>
                        <span className="text-base text-amber-300 font-bold px-4 min-w-[100px] max-w-[140px] text-center bg-amber-500/5 rounded-xl border border-amber-500/10 h-12 flex items-center justify-center truncate" title={currentFace}>
                            😊 {currentFace}
                        </span>
                        <button onClick={() => cycleFace(selectedBlock.nodeId, 1)} className={`${btnBase} ${btnDefault} !px-3`} title="Next Face (})">
                            <ChevronRight className="w-6 h-6" />
                        </button>
                    </div>

                    <div className="w-px h-8 bg-white/10 hidden sm:block" />

                    {/* Flip */}
                    <button
                        onClick={() => flipCharacter(selectedBlock.nodeId)}
                        className={`${btnBase} ${btnDefault}`}
                        title="Flip / Mirror (F)"
                    >
                        <FlipHorizontal2 className="w-6 h-6" />
                    </button>

                    <div className="w-px h-8 bg-white/10 hidden sm:block" />
                </>
            )}

            {/* Z-Index */}
            <div className="flex items-center gap-1.5">
                <span className="text-sm text-zinc-500 font-mono px-3 tracking-widest uppercase">z:{zIndex}</span>
                <button onClick={() => setNodeZIndex(selectedBlock.nodeId, zIndex + 5)} className={`${btnBase} ${btnDefault} !px-3`} title="Z +5 (PgUp)">
                    <ChevronUp className="w-6 h-6" />
                </button>
                <button onClick={() => setNodeZIndex(selectedBlock.nodeId, zIndex - 5)} className={`${btnBase} ${btnDefault} !px-3`} title="Z -5 (PgDn)">
                    <ChevronDown className="w-6 h-6" />
                </button>
            </div>

            <div className="w-px h-8 bg-white/10 hidden sm:block" />

            {/* Visibility */}
            <button
                onClick={() => toggleNodeVisibility(selectedBlock.nodeId)}
                className={`${btnBase} ${isVisible ? btnDefault : 'bg-red-500/10 border-red-500/30 text-red-400'}`}
                title="Toggle Visibility (H)"
            >
                {isVisible ? <Eye className="w-6 h-6" /> : <EyeOff className="w-6 h-6" />}
            </button>

            {/* Lock */}
            <button
                onClick={() => toggleNodeLock(selectedBlock.nodeId)}
                className={`${btnBase} ${isLocked ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : btnDefault}`}
                title="Toggle Lock (L)"
            >
                {isLocked ? <Lock className="w-6 h-6" /> : <Unlock className="w-6 h-6" />}
            </button>
        </div>
    );
};
