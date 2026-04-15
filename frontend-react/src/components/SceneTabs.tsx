"use client";
import { useState, useRef } from "react";
import { Plus, X, Copy, Pencil, ChevronRight } from "lucide-react";
import { useAppStore } from "@/stores/useAppStore";
import { useSceneGraphStore } from "@/stores/useSceneGraphStore";
import type { TransitionType } from "@/core/scene-graph/types";

/** Transition type display info. */
const TRANSITION_OPTIONS: { value: TransitionType; label: string; icon: string }[] = [
    { value: 'cut', label: 'Cut', icon: '✂️' },
    { value: 'fade', label: 'Fade', icon: '🌑' },
    { value: 'dissolve', label: 'Dissolve', icon: '💫' },
];

/** P2-3.1: Scene Tabs — displayed above the timeline panel.
 *  Supports both legacy mode (useAppStore) and Scene Graph mode (useSceneGraphStore).
 */
export function SceneTabs({ mode = 'legacy' }: { mode?: 'legacy' | 'scene' }) {
    // Legacy mode state
    const legacyScenes = useAppStore(s => s.scenes);
    const legacyActiveId = useAppStore(s => s.activeSceneId);
    const legacyActions = useAppStore();

    // Scene Graph mode state
    const sgScenes = useSceneGraphStore(s => s.scenes);
    const sgActiveIndex = useSceneGraphStore(s => s.activeSceneIndex);
    const sgTransitions = useSceneGraphStore(s => s.transitions);
    const sgActions = useSceneGraphStore();

    const [editingId, setEditingId] = useState<string | null>(null);
    const [draft, setDraft] = useState("");
    const [showTransPicker, setShowTransPicker] = useState<number | null>(null);
    const dragSrc = useRef<number | null>(null);

    // ── Legacy Mode ──
    if (mode === 'legacy') {
        if (legacyScenes.length === 0) return null;

        const commitRename = (id: string) => {
            if (draft.trim()) legacyActions.renameScene(id, draft.trim());
            setEditingId(null);
        };

        return (
            <div className="flex items-center gap-0 border-b border-neutral-700 overflow-x-auto shrink-0"
                 style={{ background: '#141416', minHeight: '32px' }}>
                {legacyScenes.map((scene, idx) => {
                    const isActive = scene.id === legacyActiveId;
                    return (
                        <div
                            key={scene.id}
                            draggable
                            onDragStart={() => { dragSrc.current = idx; }}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={() => {
                                if (dragSrc.current !== null && dragSrc.current !== idx) {
                                    legacyActions.reorderScenes(dragSrc.current, idx);
                                }
                                dragSrc.current = null;
                            }}
                            className={`group flex items-center gap-1 px-3 py-1.5 text-xs cursor-pointer select-none border-r border-neutral-700 transition-colors shrink-0 ${
                                isActive
                                    ? 'bg-neutral-800 text-white border-b-2 border-b-indigo-500'
                                    : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50'
                            }`}
                            onClick={() => !editingId && legacyActions.switchScene(scene.id)}
                            style={{ borderBottom: isActive ? '2px solid #6366f1' : undefined }}
                        >
                            {editingId === scene.id ? (
                                <input
                                    autoFocus
                                    value={draft}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) => setDraft(e.target.value)}
                                    onBlur={() => commitRename(scene.id)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') commitRename(scene.id);
                                        if (e.key === 'Escape') setEditingId(null);
                                    }}
                                    className="bg-neutral-700 border border-indigo-500 rounded px-1 text-xs text-white outline-none w-24"
                                />
                            ) : (
                                <span className="max-w-[100px] truncate"
                                    onDoubleClick={(e) => { e.stopPropagation(); setDraft(scene.name); setEditingId(scene.id); }}>
                                    {scene.name}
                                </span>
                            )}
                            <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity ml-1">
                                <button title="Rename" onClick={(e) => { e.stopPropagation(); setDraft(scene.name); setEditingId(scene.id); }}
                                    className="p-0.5 hover:bg-neutral-600 rounded text-neutral-500 hover:text-neutral-200">
                                    <Pencil className="w-2.5 h-2.5" />
                                </button>
                                <button title="Duplicate scene" onClick={(e) => { e.stopPropagation(); legacyActions.duplicateScene(scene.id); }}
                                    className="p-0.5 hover:bg-neutral-600 rounded text-neutral-500 hover:text-neutral-200">
                                    <Copy className="w-2.5 h-2.5" />
                                </button>
                                {legacyScenes.length > 1 && (
                                    <button title="Delete scene" onClick={(e) => { e.stopPropagation(); legacyActions.removeScene(scene.id); }}
                                        className="p-0.5 hover:bg-red-600/40 rounded text-neutral-500 hover:text-red-400">
                                        <X className="w-2.5 h-2.5" />
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
                <button title="Add new scene" onClick={() => legacyActions.addScene()}
                    className="flex items-center gap-1 px-2 py-1.5 text-xs text-neutral-500 hover:text-indigo-400 hover:bg-neutral-800 transition-colors shrink-0">
                    <Plus className="w-3 h-3" /><span>Scene</span>
                </button>
            </div>
        );
    }

    // ══════════════════════════════════════════════
    //  Scene Graph Mode — Multi-Scene Tabs
    // ══════════════════════════════════════════════

    if (sgScenes.length <= 1 && sgScenes[0]?.name === 'Scene 1') {
        // Single scene with default name — show minimal tab bar
    }

    const commitRename = (index: number) => {
        if (draft.trim()) sgActions.renameScene(index, draft.trim());
        setEditingId(null);
    };

    const handleDragStart = (idx: number) => { dragSrc.current = idx; };
    const handleDrop = (toIdx: number) => {
        if (dragSrc.current !== null && dragSrc.current !== toIdx) {
            sgActions.reorderScenes(dragSrc.current, toIdx);
        }
        dragSrc.current = null;
    };

    return (
        <div className="flex items-center gap-0 border-b border-neutral-700 overflow-x-auto shrink-0 relative"
             style={{ background: '#0e1015', minHeight: '34px' }}>
            {sgScenes.map((scene, idx) => {
                const isActive = idx === sgActiveIndex;
                const transition = sgTransitions[idx]; // Transition AFTER this scene

                return (
                    <div key={scene.id} className="flex items-center shrink-0">
                        {/* Scene Tab */}
                        <div
                            draggable
                            onDragStart={() => handleDragStart(idx)}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={() => handleDrop(idx)}
                            className={`group flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer select-none transition-all shrink-0 ${
                                isActive
                                    ? 'text-white'
                                    : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50'
                            }`}
                            onClick={() => !editingId && sgActions.switchScene(idx)}
                            style={isActive ? {
                                background: 'linear-gradient(180deg, rgba(6,182,212,0.12) 0%, transparent 100%)',
                                borderBottom: '2px solid #06b6d4',
                            } : { borderBottom: '2px solid transparent' }}
                        >
                            {/* Scene number badge */}
                            <span className={`w-4 h-4 flex items-center justify-center rounded text-[9px] font-bold ${
                                isActive ? 'bg-cyan-500/30 text-cyan-300' : 'bg-neutral-700/50 text-neutral-500'
                            }`}>
                                {idx + 1}
                            </span>

                            {editingId === scene.id ? (
                                <input
                                    autoFocus
                                    value={draft}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) => setDraft(e.target.value)}
                                    onBlur={() => commitRename(idx)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') commitRename(idx);
                                        if (e.key === 'Escape') setEditingId(null);
                                    }}
                                    className="bg-neutral-700 border border-cyan-500 rounded px-1 text-xs text-white outline-none w-24"
                                />
                            ) : (
                                <span className="max-w-[100px] truncate"
                                    onDoubleClick={(e) => { e.stopPropagation(); setDraft(scene.name); setEditingId(scene.id); }}>
                                    {scene.name}
                                </span>
                            )}

                            {/* Duration badge */}
                            <span className="text-[9px] font-mono text-neutral-500">
                                {scene.duration.toFixed(1)}s
                            </span>

                            {/* Actions — hover */}
                            <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity ml-0.5">
                                <button title="Rename" onClick={(e) => { e.stopPropagation(); setDraft(scene.name); setEditingId(scene.id); }}
                                    className="p-0.5 hover:bg-neutral-600 rounded text-neutral-500 hover:text-neutral-200">
                                    <Pencil className="w-2.5 h-2.5" />
                                </button>
                                <button title="Duplicate" onClick={(e) => { e.stopPropagation(); sgActions.duplicateScene(idx); }}
                                    className="p-0.5 hover:bg-neutral-600 rounded text-neutral-500 hover:text-neutral-200">
                                    <Copy className="w-2.5 h-2.5" />
                                </button>
                                {sgScenes.length > 1 && (
                                    <button title="Delete" onClick={(e) => { e.stopPropagation(); sgActions.removeScene(idx); }}
                                        className="p-0.5 hover:bg-red-600/40 rounded text-neutral-500 hover:text-red-400">
                                        <X className="w-2.5 h-2.5" />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Transition indicator between scenes */}
                        {idx < sgScenes.length - 1 && (
                            <div className="relative shrink-0">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setShowTransPicker(showTransPicker === idx ? null : idx);
                                    }}
                                    className={`flex items-center gap-0.5 px-1.5 py-1 text-[9px] font-bold rounded mx-0.5 transition-all border ${
                                        showTransPicker === idx
                                            ? 'bg-violet-500/20 text-violet-300 border-violet-500/40'
                                            : 'bg-neutral-800/60 text-neutral-500 border-neutral-700/50 hover:text-violet-300 hover:border-violet-500/30'
                                    }`}
                                    title={`Transition: ${transition?.type || 'fade'}`}
                                >
                                    <ChevronRight className="w-2.5 h-2.5" />
                                    <span className="uppercase tracking-wider">{transition?.type || 'fade'}</span>
                                </button>

                                {/* Transition picker dropdown */}
                                {showTransPicker === idx && (
                                    <div className="absolute top-full left-0 mt-1 z-50 bg-neutral-800 border border-neutral-600 rounded-lg shadow-xl py-1 min-w-[120px]"
                                         onMouseLeave={() => setShowTransPicker(null)}>
                                        {TRANSITION_OPTIONS.map(opt => (
                                            <button
                                                key={opt.value}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    sgActions.setTransition(idx, opt.value, 0.5);
                                                    setShowTransPicker(null);
                                                }}
                                                className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors ${
                                                    (transition?.type || 'fade') === opt.value
                                                        ? 'text-violet-300 bg-violet-500/10'
                                                        : 'text-neutral-300 hover:bg-neutral-700'
                                                }`}
                                            >
                                                <span>{opt.icon}</span>
                                                <span>{opt.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}

            {/* Add scene button */}
            <button
                title="Add new scene"
                onClick={() => {
                    sgActions.addScene();
                }}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-neutral-500 hover:text-cyan-400 hover:bg-neutral-800 transition-colors shrink-0 ml-1"
            >
                <Plus className="w-3 h-3" />
                <span>Scene</span>
            </button>
        </div>
    );
}
