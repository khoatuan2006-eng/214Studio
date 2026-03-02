import { useEffect, useCallback } from 'react';
import { useEditor } from './use-editor';
import { useTimelineStore } from '@/stores/timeline-store';
import { useCanvasZoomStore } from '@/stores/canvas-zoom-store';

/**
 * Global Keyboard Shortcuts Hook
 * Optimized for performance with event delegation
 */

interface ShortcutConfig {
    key: string;
    handler: () => void;
    preventDefault?: boolean;
    description?: string;
    category?: string;
}

const GLOBAL_SHORTCUTS: ShortcutConfig[] = [
    // Playback
    { key: 'space', handler: () => { }, description: 'Play/Pause', category: 'Playback' },
    { key: 'k', handler: () => { }, description: 'Play/Pause', category: 'Playback' },
    { key: 'j', handler: () => { }, description: 'Rewind', category: 'Playback' },
    { key: 'l', handler: () => { }, description: 'Fast Forward', category: 'Playback' },

    // Navigation
    { key: 'home', handler: () => { }, description: 'Go to start', category: 'Navigation' },
    { key: 'end', handler: () => { }, description: 'Go to end', category: 'Navigation' },
    { key: 'arrowleft', handler: () => { }, description: 'Seek -1s', category: 'Navigation' },
    { key: 'arrowright', handler: () => { }, description: 'Seek +1s', category: 'Navigation' },
    { key: 'shift+arrowleft', handler: () => { }, description: 'Seek -5s', category: 'Navigation' },
    { key: 'shift+arrowright', handler: () => { }, description: 'Seek +5s', category: 'Navigation' },

    // Editing
    { key: 'delete', handler: () => { }, description: 'Delete selected', category: 'Editing' },
    { key: 'backspace', handler: () => { }, description: 'Delete selected', category: 'Editing' },
    { key: 'ctrl+z', handler: () => { }, description: 'Undo', category: 'Editing' },
    { key: 'ctrl+y', handler: () => { }, description: 'Redo', category: 'Editing' },
    { key: 'ctrl+c', handler: () => { }, description: 'Copy', category: 'Editing' },
    { key: 'ctrl+v', handler: () => { }, description: 'Paste', category: 'Editing' },
    { key: 'ctrl+d', handler: () => { }, description: 'Duplicate', category: 'Editing' },

    // Tools
    { key: 'q', handler: () => { }, description: 'Select tool', category: 'Tools' },
    { key: 'w', handler: () => { }, description: 'Trim tool', category: 'Tools' },
    { key: 'e', handler: () => { }, description: 'Slip tool', category: 'Tools' },
    { key: 'r', handler: () => { }, description: 'Slide tool', category: 'Tools' },
    { key: 't', handler: () => { }, description: 'Cycle trim mode', category: 'Tools' },

    // View
    { key: '=', handler: () => { }, description: 'Zoom in', category: 'View' },
    { key: '-', handler: () => { }, description: 'Zoom out', category: 'View' },
    { key: '0', handler: () => { }, description: 'Fit to screen', category: 'View' },

    // Markers
    { key: 'm', handler: () => { }, description: 'Add marker', category: 'Markers' },
    { key: 'i', handler: () => { }, description: 'Set In point', category: 'Markers' },
    { key: 'o', handler: () => { }, description: 'Set Out point', category: 'Markers' },
];

export function useGlobalShortcuts() {
    const editor = useEditor();
    const { setEditMode, setInPoint, setOutPoint } = useTimelineStore();
    const { setZoom, setPan } = useCanvasZoomStore();

    // Memoize handlers
    const handlers = useCallback(() => {
        const playback = editor.playback;
        const timeline = editor.timeline;
        const selection = editor.selection;

        return {
            // Playback
            'space': () => playback.toggle(),
            'k': () => playback.toggle(),
            'j': () => playback.seek({ time: Math.max(0, playback.getCurrentTime() - 5) }),
            'l': () => playback.seek({ time: playback.getCurrentTime() + 5 }),

            // Navigation
            'home': () => playback.seek({ time: 0 }),
            'end': () => playback.seek({ time: timeline.getDuration() }),
            'arrowleft': () => playback.seek({ time: Math.max(0, playback.getCurrentTime() - 1) }),
            'arrowright': () => playback.seek({ time: playback.getCurrentTime() + 1 }),
            'shift+arrowleft': () => playback.seek({ time: Math.max(0, playback.getCurrentTime() - 5) }),
            'shift+arrowright': () => playback.seek({ time: playback.getCurrentTime() + 5 }),

            // Editing
            'delete': () => {
                const selected = selection.getSelectedElements();
                if (selected.length > 0) {
                    timeline.deleteElements(selected);
                    selection.clearSelection();
                }
            },
            'backspace': () => {
                const selected = selection.getSelectedElements();
                if (selected.length > 0) {
                    timeline.deleteElements(selected);
                    selection.clearSelection();
                }
            },
            'ctrl+z': () => editor.undo(),
            'ctrl+y': () => editor.redo(),
            'ctrl+c': () => editor.clipboard.copy(),
            'ctrl+v': () => editor.clipboard.paste(),
            'ctrl+d': () => timeline.duplicateElement(selection.getSelectedElements()[0]?.elementId),

            // Tools
            'q': () => setEditMode('select'),
            'w': () => setEditMode('trim'),
            'e': () => setEditMode('slip'),
            'r': () => setEditMode('slide'),

            // View
            '=': () => {
                const currentZoom = useCanvasZoomStore.getState().zoom;
                setZoom(Math.min(4, currentZoom + 0.25));
            },
            '-': () => {
                const currentZoom = useCanvasZoomStore.getState().zoom;
                setZoom(Math.max(0.25, currentZoom - 0.25));
            },
            'ctrl+0': () => {
                setZoom(1.0);
                setPan(0, 0);
            },
            'ctrl+=': () => {
                const currentZoom = useCanvasZoomStore.getState().zoom;
                setZoom(Math.min(4, currentZoom + 0.25));
            },
            'ctrl+-': () => {
                const currentZoom = useCanvasZoomStore.getState().zoom;
                setZoom(Math.max(0.25, currentZoom - 0.25));
            },

            // Markers
            'm': () => timeline.addMarker(playback.getCurrentTime()),
            'i': () => setInPoint(playback.getCurrentTime()),
            'o': () => setOutPoint(playback.getCurrentTime()),
        };
    }, [editor, setEditMode, setInPoint, setOutPoint]);

    useEffect(() => {
        const shortcutMap = handlers();

        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if typing in input
            if (e.target instanceof HTMLInputElement ||
                e.target instanceof HTMLTextAreaElement) {
                return;
            }

            // Build key combination string
            const parts = [];
            if (e.ctrlKey || e.metaKey) parts.push('ctrl');
            if (e.shiftKey) parts.push('shift');
            if (e.altKey) parts.push('alt');
            parts.push(e.key.toLowerCase());

            const keyCombo = parts.join('+');

            // Try exact match first
            let handler = shortcutMap[keyCombo as keyof typeof shortcutMap];

            // Try without modifiers
            if (!handler && !e.ctrlKey && !e.metaKey && !e.altKey) {
                handler = shortcutMap[e.key.toLowerCase() as keyof typeof shortcutMap];
            }

            if (handler) {
                e.preventDefault();
                handler();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handlers]);
}

/**
 * Hook to display available shortcuts
 */
export function useShortcutsList() {
    return GLOBAL_SHORTCUTS;
}

/**
 * Component to render shortcuts modal
 */
export function ShortcutsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
    const shortcuts = useShortcutsList();

    if (!isOpen) return null;

    // Group by category
    const grouped = shortcuts.reduce((acc, s) => {
        const category = s.category || 'Other';
        if (!acc[category]) acc[category] = [];
        acc[category].push(s);
        return acc;
    }, {} as Record<string, ShortcutConfig[]>);

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
            <div
                className="bg-neutral-900 rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-white">Keyboard Shortcuts</h2>
                    <button onClick={onClose} className="text-neutral-400 hover:text-white">
                        ✕
                    </button>
                </div>

                <div className="space-y-6">
                    {Object.entries(grouped).map(([category, items]) => (
                        <div key={category}>
                            <h3 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-3">
                                {category}
                            </h3>
                            <div className="grid grid-cols-2 gap-2">
                                {items.map(shortcut => (
                                    <div
                                        key={shortcut.key}
                                        className="flex items-center justify-between bg-neutral-800 rounded px-3 py-2"
                                    >
                                        <span className="text-neutral-300 text-sm">
                                            {shortcut.description}
                                        </span>
                                        <kbd className="bg-neutral-700 px-2 py-1 rounded text-xs text-neutral-400 font-mono">
                                            {shortcut.key}
                                        </kbd>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="mt-6 pt-4 border-t border-neutral-800 text-xs text-neutral-500">
                    Tip: Press <kbd className="bg-neutral-800 px-1 rounded">?</kbd> to open this help
                </div>
            </div>
        </div>
    );
}
