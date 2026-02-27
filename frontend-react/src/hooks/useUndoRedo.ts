/**
 * useUndoRedo — React hook for Command Pattern Undo/Redo (P0-0.3)
 * 
 * Provides undo/redo state and keyboard shortcut handling.
 * Uses the singleton commandHistory instance.
 */

import { useEffect, useSyncExternalStore } from 'react';
import { commandHistory } from '@/stores/command-history';

/**
 * Hook to subscribe to command history state.
 * Provides canUndo, canRedo, and action descriptions.
 * 
 * Registers Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y keyboard shortcuts.
 */
export function useUndoRedo(options?: { enableKeyboardShortcuts?: boolean }) {
    const enableKB = options?.enableKeyboardShortcuts ?? true;

    // Subscribe to command history changes for reactive UI
    const snapshot = useSyncExternalStore(
        (onStoreChange) => commandHistory.subscribe(onStoreChange),
        () => ({
            canUndo: commandHistory.canUndo(),
            canRedo: commandHistory.canRedo(),
            undoDescription: commandHistory.getUndoDescription(),
            redoDescription: commandHistory.getRedoDescription(),
        }),
    );

    // Keyboard shortcuts
    useEffect(() => {
        if (!enableKB) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

            if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                e.preventDefault();
                if (e.shiftKey) {
                    commandHistory.redo();
                } else {
                    commandHistory.undo();
                }
            } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
                e.preventDefault();
                commandHistory.redo();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [enableKB]);

    return {
        undo: () => commandHistory.undo(),
        redo: () => commandHistory.redo(),
        canUndo: snapshot.canUndo,
        canRedo: snapshot.canRedo,
        undoDescription: snapshot.undoDescription,
        redoDescription: snapshot.redoDescription,
        execute: (cmd: Parameters<typeof commandHistory.execute>[0]) => commandHistory.execute(cmd),
        clear: () => commandHistory.clear(),
    };
}
