/**
 * Command History — Delta-based Undo/Redo (P0-0.3)
 * 
 * Thay thế zundo snapshot-based undo (lưu toàn bộ editorData mỗi lần thay đổi).
 * Giờ chỉ lưu Delta/Patch: "action MOVE_KEYFRAME: id=k1, oldX=10, newX=15".
 * 
 * Giảm ~99% RAM cho Undo Stack (5MB snapshot → vài bytes delta).
 */

// --- Command Interface ---

export interface Command {
    readonly id: string;
    readonly description: string;
    /** Apply the change */
    execute(): void;
    /** Reverse the change */
    undo(): void;
}

// --- Command History Manager ---

class CommandHistoryManager {
    private undoStack: Command[] = [];
    private redoStack: Command[] = [];
    private maxSize = 200;
    private listeners = new Set<() => void>();

    /** Execute a command and push to undo stack */
    execute(cmd: Command): void {
        cmd.execute();
        this.undoStack.push(cmd);
        // Clear redo stack — new action invalidates redo history
        this.redoStack = [];
        // Trim if over limit
        if (this.undoStack.length > this.maxSize) {
            this.undoStack.shift();
        }
        this.notify();
    }

    /** Undo last command */
    undo(): void {
        const cmd = this.undoStack.pop();
        if (!cmd) return;
        cmd.undo();
        this.redoStack.push(cmd);
        this.notify();
    }

    /** Redo last undone command */
    redo(): void {
        const cmd = this.redoStack.pop();
        if (!cmd) return;
        cmd.execute();
        this.undoStack.push(cmd);
        this.notify();
    }

    canUndo(): boolean {
        return this.undoStack.length > 0;
    }

    canRedo(): boolean {
        return this.redoStack.length > 0;
    }

    /** Get description of next undo/redo action */
    getUndoDescription(): string | null {
        return this.undoStack.length > 0
            ? this.undoStack[this.undoStack.length - 1].description
            : null;
    }

    getRedoDescription(): string | null {
        return this.redoStack.length > 0
            ? this.redoStack[this.redoStack.length - 1].description
            : null;
    }

    /** Subscribe to changes */
    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    /** Clear all history */
    clear(): void {
        this.undoStack = [];
        this.redoStack = [];
        this.notify();
    }

    private notify(): void {
        this.listeners.forEach(l => l());
    }
}

// --- Singleton Instance ---
export const commandHistory = new CommandHistoryManager();

// --- Built-in Command Factories ---

import { useAppStore } from '@/store/useAppStore';
import type { ActionBlock, CharacterTrack, TimelineKeyframe } from '@/store/useAppStore';

/** Command: Move an action block (start/end shift) */
export function createMoveActionCommand(
    actionId: string,
    oldStart: number,
    oldEnd: number,
    newStart: number,
    newEnd: number,
): Command {
    return {
        id: `move_action_${Date.now()}`,
        description: `Move action ${actionId}`,
        execute() {
            useAppStore.getState().setEditorData(prev => prev.map(row => ({
                ...row,
                actions: row.actions.map(a =>
                    a.id === actionId ? { ...a, start: newStart, end: newEnd } : a
                )
            })));
        },
        undo() {
            useAppStore.getState().setEditorData(prev => prev.map(row => ({
                ...row,
                actions: row.actions.map(a =>
                    a.id === actionId ? { ...a, start: oldStart, end: oldEnd } : a
                )
            })));
        },
    };
}

/** Command: Add an action block */
export function createAddActionCommand(
    trackId: string,
    action: ActionBlock,
): Command {
    return {
        id: `add_action_${Date.now()}`,
        description: `Add action to ${trackId}`,
        execute() {
            useAppStore.getState().setEditorData(prev => prev.map(row =>
                row.id === trackId
                    ? { ...row, actions: [...row.actions, action] }
                    : row
            ));
        },
        undo() {
            useAppStore.getState().setEditorData(prev => prev.map(row =>
                row.id === trackId
                    ? { ...row, actions: row.actions.filter(a => a.id !== action.id) }
                    : row
            ));
        },
    };
}

/** Command: Delete action blocks */
export function createDeleteActionsCommand(
    deletedActions: { trackId: string; action: ActionBlock }[],
): Command {
    return {
        id: `delete_actions_${Date.now()}`,
        description: `Delete ${deletedActions.length} action(s)`,
        execute() {
            const actionIds = new Set(deletedActions.map(d => d.action.id));
            useAppStore.getState().setEditorData(prev => prev.map(row => ({
                ...row,
                actions: row.actions.filter(a => !actionIds.has(a.id))
            })));
        },
        undo() {
            useAppStore.getState().setEditorData(prev => prev.map(row => {
                const restoredForRow = deletedActions
                    .filter(d => d.trackId === row.id)
                    .map(d => d.action);
                return restoredForRow.length > 0
                    ? { ...row, actions: [...row.actions, ...restoredForRow] }
                    : row;
            }));
        },
    };
}

/** Command: Update a keyframe value/time */
export function createUpdateKeyframeCommand(
    trackId: string,
    property: string,
    oldKeyframe: TimelineKeyframe,
    newKeyframe: TimelineKeyframe,
): Command {
    return {
        id: `update_keyframe_${Date.now()}`,
        description: `Update keyframe ${property} at ${oldKeyframe.time}s`,
        execute() {
            useAppStore.getState().setEditorData(prev => prev.map(row => {
                if (row.id !== trackId) return row;
                const newTransform = { ...row.transform };
                const prop = property as keyof typeof newTransform;
                newTransform[prop] = newTransform[prop].map(k =>
                    Math.abs(k.time - oldKeyframe.time) < 0.05
                        ? { ...newKeyframe }
                        : k
                );
                newTransform[prop].sort((a, b) => a.time - b.time);
                return { ...row, transform: newTransform };
            }));
        },
        undo() {
            useAppStore.getState().setEditorData(prev => prev.map(row => {
                if (row.id !== trackId) return row;
                const newTransform = { ...row.transform };
                const prop = property as keyof typeof newTransform;
                newTransform[prop] = newTransform[prop].map(k =>
                    Math.abs(k.time - newKeyframe.time) < 0.05
                        ? { ...oldKeyframe }
                        : k
                );
                newTransform[prop].sort((a, b) => a.time - b.time);
                return { ...row, transform: newTransform };
            }));
        },
    };
}

/** Command: Add a keyframe */
export function createAddKeyframeCommand(
    trackId: string,
    property: string,
    keyframe: TimelineKeyframe,
): Command {
    return {
        id: `add_keyframe_${Date.now()}`,
        description: `Add keyframe ${property} at ${keyframe.time}s`,
        execute() {
            useAppStore.getState().setEditorData(prev => prev.map(row => {
                if (row.id !== trackId) return row;
                const newTransform = { ...row.transform };
                const prop = property as keyof typeof newTransform;
                const keys = [...newTransform[prop]];
                // Remove if already exists at this time
                const existing = keys.findIndex(k => Math.abs(k.time - keyframe.time) < 0.05);
                if (existing >= 0) keys[existing] = { ...keyframe };
                else keys.push({ ...keyframe });
                keys.sort((a, b) => a.time - b.time);
                newTransform[prop] = keys;
                return { ...row, transform: newTransform };
            }));
        },
        undo() {
            useAppStore.getState().setEditorData(prev => prev.map(row => {
                if (row.id !== trackId) return row;
                const newTransform = { ...row.transform };
                const prop = property as keyof typeof newTransform;
                newTransform[prop] = newTransform[prop].filter(k =>
                    Math.abs(k.time - keyframe.time) > 0.05
                );
                return { ...row, transform: newTransform };
            }));
        },
    };
}

/** Command: Remove a keyframe */
export function createRemoveKeyframeCommand(
    trackId: string,
    property: string,
    keyframe: TimelineKeyframe,
): Command {
    return {
        id: `remove_keyframe_${Date.now()}`,
        description: `Remove keyframe ${property} at ${keyframe.time}s`,
        execute() {
            useAppStore.getState().setEditorData(prev => prev.map(row => {
                if (row.id !== trackId) return row;
                const newTransform = { ...row.transform };
                const prop = property as keyof typeof newTransform;
                newTransform[prop] = newTransform[prop].filter(k =>
                    Math.abs(k.time - keyframe.time) > 0.05
                );
                return { ...row, transform: newTransform };
            }));
        },
        undo() {
            useAppStore.getState().setEditorData(prev => prev.map(row => {
                if (row.id !== trackId) return row;
                const newTransform = { ...row.transform };
                const prop = property as keyof typeof newTransform;
                newTransform[prop] = [...newTransform[prop], { ...keyframe }];
                newTransform[prop].sort((a, b) => a.time - b.time);
                return { ...row, transform: newTransform };
            }));
        },
    };
}

/** Command: Batch multiple commands into one undo step */
export function createBatchCommand(
    description: string,
    commands: Command[],
): Command {
    return {
        id: `batch_${Date.now()}`,
        description,
        execute() {
            commands.forEach(cmd => cmd.execute());
        },
        undo() {
            // Undo in reverse order
            for (let i = commands.length - 1; i >= 0; i--) {
                commands[i].undo();
            }
        },
    };
}

/** Command: Add a character track */
export function createAddTrackCommand(
    track: CharacterTrack,
): Command {
    return {
        id: `add_track_${Date.now()}`,
        description: `Add track "${track.name}"`,
        execute() {
            useAppStore.getState().setEditorData(prev => [...prev, track]);
        },
        undo() {
            useAppStore.getState().setEditorData(prev =>
                prev.filter(row => row.id !== track.id)
            );
        },
    };
}

/** Command: Delete a character track */
export function createDeleteTrackCommand(
    track: CharacterTrack,
    index: number,
): Command {
    return {
        id: `delete_track_${Date.now()}`,
        description: `Delete track "${track.name}"`,
        execute() {
            useAppStore.getState().setEditorData(prev =>
                prev.filter(row => row.id !== track.id)
            );
        },
        undo() {
            useAppStore.getState().setEditorData(prev => {
                const next = [...prev];
                next.splice(index, 0, track);
                return next;
            });
        },
    };
}
