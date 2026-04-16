/**
 * TimelineContextMenu — Professional right-click context menu for timeline blocks and rows.
 * 
 * Renders a floating menu at the mouse position with context-aware actions.
 * Auto-closes on outside click or Escape.
 */

import React, { useEffect, useRef } from 'react';
import { Copy, Trash2, Clock, Pencil, Plus, X } from 'lucide-react';

export interface ContextMenuItem {
    label: string;
    icon?: React.ReactNode;
    shortcut?: string;
    danger?: boolean;
    disabled?: boolean;
    onClick: () => void;
}

export interface ContextMenuProps {
    x: number;
    y: number;
    items: ContextMenuItem[];
    onClose: () => void;
}

export const TimelineContextMenu: React.FC<ContextMenuProps> = ({ x, y, items, onClose }) => {
    const menuRef = useRef<HTMLDivElement>(null);

    // Close on outside click or Escape
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        // Delay attaching to avoid immediate close from the triggering right-click
        const timer = setTimeout(() => {
            document.addEventListener('mousedown', handleClick);
            document.addEventListener('keydown', handleKey);
        }, 50);
        return () => {
            clearTimeout(timer);
            document.removeEventListener('mousedown', handleClick);
            document.removeEventListener('keydown', handleKey);
        };
    }, [onClose]);

    // Adjust position so menu doesn't overflow viewport
    useEffect(() => {
        if (!menuRef.current) return;
        const rect = menuRef.current.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        if (rect.right > vw) {
            menuRef.current.style.left = `${x - rect.width}px`;
        }
        if (rect.bottom > vh) {
            menuRef.current.style.top = `${y - rect.height}px`;
        }
    }, [x, y]);

    return (
        <div
            ref={menuRef}
            className="fixed z-[99999] min-w-[180px] py-1 rounded-lg shadow-2xl border border-white/10 backdrop-blur-xl"
            style={{
                left: x,
                top: y,
                background: 'linear-gradient(180deg, rgba(20,20,30,0.97), rgba(10,10,18,0.99))',
                boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 1px rgba(99,102,241,0.3)',
            }}
            onContextMenu={(e) => e.preventDefault()}
        >
            {items.map((item, i) => (
                <button
                    key={i}
                    onClick={() => {
                        if (!item.disabled) {
                            item.onClick();
                            onClose();
                        }
                    }}
                    disabled={item.disabled}
                    className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-[11px] transition-colors ${
                        item.disabled
                            ? 'text-neutral-600 cursor-not-allowed'
                            : item.danger
                            ? 'text-red-400 hover:bg-red-500/15 hover:text-red-300'
                            : 'text-neutral-300 hover:bg-white/10 hover:text-white'
                    }`}
                >
                    <span className="w-4 h-4 flex items-center justify-center shrink-0 opacity-70">
                        {item.icon}
                    </span>
                    <span className="flex-1 text-left">{item.label}</span>
                    {item.shortcut && (
                        <span className="text-[9px] text-neutral-600 font-mono ml-3">{item.shortcut}</span>
                    )}
                </button>
            ))}
        </div>
    );
};

// ══════════════════════════════════════════════
//  Pre-built menu item factories
// ══════════════════════════════════════════════

export function buildActionMenuItems(opts: {
    onEdit: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
    onSetTime?: () => void;
    isLastFrame?: boolean;
}): ContextMenuItem[] {
    const items: ContextMenuItem[] = [
        { label: 'Edit Properties', icon: <Pencil className="w-3.5 h-3.5" />, onClick: opts.onEdit, shortcut: 'Enter' },
    ];
    if (opts.onSetTime) {
        items.push({ label: 'Set Time...', icon: <Clock className="w-3.5 h-3.5" />, onClick: opts.onSetTime });
    }
    items.push(
        { label: 'Duplicate Frame', icon: <Copy className="w-3.5 h-3.5" />, onClick: opts.onDuplicate, shortcut: 'Ctrl+D' },
        { label: 'Delete Frame', icon: <Trash2 className="w-3.5 h-3.5" />, onClick: opts.onDelete, danger: true, disabled: opts.isLastFrame, shortcut: 'Del' },
    );
    return items;
}

export function buildRowMenuItems(opts: {
    onAddFrame: () => void;
    onRemoveTrack: () => void;
    trackName: string;
}): ContextMenuItem[] {
    return [
        { label: 'Add Frame at Cursor', icon: <Plus className="w-3.5 h-3.5" />, onClick: opts.onAddFrame },
        { label: `Remove "${opts.trackName}"`, icon: <Trash2 className="w-3.5 h-3.5" />, onClick: opts.onRemoveTrack, danger: true },
    ];
}
