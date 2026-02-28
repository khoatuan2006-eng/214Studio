"use client";
import { useState, useRef } from "react";
import { Plus, X, Copy, Pencil } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";

/** P2-3.1: Scene Tabs — displayed above the timeline panel */
export function SceneTabs() {
    const scenes = useAppStore(s => s.scenes);
    const activeSceneId = useAppStore(s => s.activeSceneId);
    const { addScene, removeScene, switchScene, renameScene, duplicateScene, reorderScenes } = useAppStore();

    const [editingId, setEditingId] = useState<string | null>(null);
    const [draft, setDraft] = useState("");
    const dragSrc = useRef<number | null>(null);

    // If no scenes exist yet, don't render (legacy single-scene mode)
    if (scenes.length === 0) return null;

    const commitRename = (id: string) => {
        if (draft.trim()) renameScene(id, draft.trim());
        setEditingId(null);
    };

    const handleDragStart = (idx: number) => { dragSrc.current = idx; };
    const handleDrop = (toIdx: number) => {
        if (dragSrc.current !== null && dragSrc.current !== toIdx) {
            reorderScenes(dragSrc.current, toIdx);
        }
        dragSrc.current = null;
    };

    return (
        <div className="flex items-center gap-0 border-b border-neutral-700 bg-neutral-850 overflow-x-auto shrink-0"
             style={{ background: '#141416', minHeight: '32px' }}>
            {scenes.map((scene, idx) => {
                const isActive = scene.id === activeSceneId;
                return (
                    <div
                        key={scene.id}
                        draggable
                        onDragStart={() => handleDragStart(idx)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => handleDrop(idx)}
                        className={`group flex items-center gap-1 px-3 py-1.5 text-xs cursor-pointer select-none border-r border-neutral-700 transition-colors shrink-0 ${
                            isActive
                                ? 'bg-neutral-800 text-white border-b-2 border-b-indigo-500'
                                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50'
                        }`}
                        onClick={() => !editingId && switchScene(scene.id)}
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
                            <span
                                className="max-w-[100px] truncate"
                                onDoubleClick={(e) => { e.stopPropagation(); setDraft(scene.name); setEditingId(scene.id); }}
                            >
                                {scene.name}
                            </span>
                        )}
                        {/* Actions — only visible on hover */}
                        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity ml-1">
                            <button
                                title="Rename"
                                onClick={(e) => { e.stopPropagation(); setDraft(scene.name); setEditingId(scene.id); }}
                                className="p-0.5 hover:bg-neutral-600 rounded text-neutral-500 hover:text-neutral-200"
                            >
                                <Pencil className="w-2.5 h-2.5" />
                            </button>
                            <button
                                title="Duplicate scene"
                                onClick={(e) => { e.stopPropagation(); duplicateScene(scene.id); }}
                                className="p-0.5 hover:bg-neutral-600 rounded text-neutral-500 hover:text-neutral-200"
                            >
                                <Copy className="w-2.5 h-2.5" />
                            </button>
                            {scenes.length > 1 && (
                                <button
                                    title="Delete scene"
                                    onClick={(e) => { e.stopPropagation(); removeScene(scene.id); }}
                                    className="p-0.5 hover:bg-red-600/40 rounded text-neutral-500 hover:text-red-400"
                                >
                                    <X className="w-2.5 h-2.5" />
                                </button>
                            )}
                        </div>
                    </div>
                );
            })}
            {/* Add scene button */}
            <button
                title="Add new scene"
                onClick={() => addScene()}
                className="flex items-center gap-1 px-2 py-1.5 text-xs text-neutral-500 hover:text-indigo-400 hover:bg-neutral-800 transition-colors shrink-0"
            >
                <Plus className="w-3 h-3" />
                <span>Scene</span>
            </button>
        </div>
    );
}
