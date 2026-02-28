import React from 'react';
import { Copy, Scissors, Trash2, Lock, Unlock, Eye, EyeOff, Layers, MousePointer2 } from 'lucide-react';

interface ContextMenuItem {
    label: string;
    icon: React.ReactNode;
    shortcut?: string;
    onClick: () => void;
    danger?: boolean;
    disabled?: boolean;
}

interface ProfessionalContextMenuProps {
    x: number;
    y: number;
    items: ContextMenuItem[];
    onClose: () => void;
}

/**
 * ProfessionalContextMenu (Premium UX)
 * 
 * Features glassmorphism, smooth entrance, and desktop-grade interactions.
 * Replaces basic browser-like menus with an "Editor" feel.
 */
export const ProfessionalContextMenu: React.FC<ProfessionalContextMenuProps> = ({ x, y, items, onClose }) => {
    // Prevent menu from going off-screen
    const menuWidth = 220;
    const menuHeight = items.length * 36 + 16;

    const posX = Math.min(x, window.innerWidth - menuWidth - 20);
    const posY = Math.min(y, window.innerHeight - menuHeight - 20);

    return (
        <div
            className="fixed inset-0 z-[100] pointer-events-auto"
            onClick={onClose}
            onContextMenu={(e) => { e.preventDefault(); onClose(); }}
        >
            <div
                className="absolute bg-neutral-900/80 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
                style={{
                    left: posX,
                    top: posY,
                    width: menuWidth,
                    boxShadow: '0 20px 50px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)'
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-1.5 space-y-0.5">
                    {items.map((item, i) => (
                        <button
                            key={i}
                            disabled={item.disabled}
                            onClick={() => { item.onClick(); onClose(); }}
                            className={`
                                w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all
                                ${item.danger
                                    ? 'text-red-400 hover:bg-red-500/10'
                                    : 'text-neutral-300 hover:bg-white/10 hover:text-white'}
                                ${item.disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}
                            `}
                        >
                            <div className="flex items-center gap-3">
                                <span className={`${item.danger ? 'text-red-400' : 'text-neutral-400'}`}>
                                    {item.icon}
                                </span>
                                <span className="font-medium">{item.label}</span>
                            </div>
                            {item.shortcut && (
                                <span className="text-[10px] font-mono text-neutral-500 bg-neutral-800 px-1.5 py-0.5 rounded uppercase">
                                    {item.shortcut}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};
