"use client";

/**
 * P2-3.2: Track Group Header
 * Rendered above the first track of each group.
 * Shows group name, color swatch, collapse/expand button, and a delete button.
 */

import { useState } from "react";
import { ChevronRight, Trash2, Pencil } from "lucide-react";
import type { TrackGroup } from "@/store/useAppStore";
import { useAppStore } from "@/store/useAppStore";

interface TrackGroupHeaderProps {
    group: TrackGroup;
    trackCount: number;
}

export function TrackGroupHeader({ group, trackCount }: TrackGroupHeaderProps) {
    const { updateTrackGroup, removeTrackGroup } = useAppStore();
    const [isEditing, setIsEditing] = useState(false);
    const [draft, setDraft] = useState(group.name);

    const commitRename = () => {
        if (draft.trim()) updateTrackGroup(group.id, { name: draft.trim() });
        setIsEditing(false);
    };

    return (
        <div
            className="flex items-center gap-1.5 px-2 py-1 select-none"
            style={{ borderLeft: `3px solid ${group.color}` }}
        >
            {/* Collapse toggle */}
            <button
                onClick={() => updateTrackGroup(group.id, { isCollapsed: !group.isCollapsed })}
                className="p-0.5 hover:bg-neutral-700 rounded transition-colors flex-shrink-0"
                title={group.isCollapsed ? "Expand group" : "Collapse group"}
            >
                <ChevronRight
                    className={`w-3.5 h-3.5 text-neutral-400 transition-transform duration-150 ${group.isCollapsed ? "" : "rotate-90"}`}
                />
            </button>

            {/* Color swatch */}
            <div
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: group.color }}
            />

            {/* Name (inline editable) */}
            {isEditing ? (
                <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename();
                        if (e.key === "Escape") { setDraft(group.name); setIsEditing(false); }
                    }}
                    className="flex-1 bg-neutral-800 border border-indigo-500 rounded px-1 text-xs text-white outline-none min-w-0"
                />
            ) : (
                <span
                    className="flex-1 text-xs font-semibold text-neutral-300 truncate cursor-default"
                    onDoubleClick={() => { setDraft(group.name); setIsEditing(true); }}
                >
                    {group.name}
                    <span className="ml-1 text-neutral-500 font-normal">({trackCount})</span>
                </span>
            )}

            {/* Actions (visible on hover) */}
            <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity">
                <button
                    onClick={() => { setDraft(group.name); setIsEditing(true); }}
                    className="p-0.5 hover:bg-neutral-700 rounded text-neutral-500 hover:text-neutral-200 transition-colors"
                    title="Rename group"
                >
                    <Pencil className="w-3 h-3" />
                </button>
                <button
                    onClick={() => removeTrackGroup(group.id)}
                    className="p-0.5 hover:bg-red-600/30 rounded text-neutral-500 hover:text-red-400 transition-colors"
                    title="Delete group (ungroups tracks)"
                >
                    <Trash2 className="w-3 h-3" />
                </button>
            </div>
        </div>
    );
}
