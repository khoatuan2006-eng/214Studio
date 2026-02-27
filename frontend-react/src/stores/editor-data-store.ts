/**
 * Editor Data Store — Normalized Zustand store for domain data (P0-0.2)
 * 
 * This store provides O(1) access to tracks and actions via normalized dictionaries.
 * It wraps the existing useAppStore.editorData with normalization/denormalization
 * utilities, allowing incremental migration.
 * 
 * **Migration strategy:** 
 * - New code should use this store's selectors for reads.
 * - Writes still go through useAppStore.setEditorData for backward compatibility.
 * - When all consumers are migrated, writes can move here too.
 */

import { create } from 'zustand';
import { useAppStore } from '@/store/useAppStore';
import {
    normalizeEditorData,
    denormalizeEditorData,
    type NormalizedEditorState,
    type NormalizedTrack,
    type NormalizedAction,
} from './normalize';

interface EditorDataStore {
    /** Normalized state — sync'd from useAppStore.editorData */
    normalized: NormalizedEditorState;

    /** Sync normalized state from legacy editorData */
    syncFromLegacy: () => void;

    /** Write normalized state back to legacy editorData */
    syncToLegacy: () => void;

    // --- O(1) Selectors ---

    getTrack: (trackId: string) => NormalizedTrack | undefined;
    getAction: (actionId: string) => NormalizedAction | undefined;
    getActionsByTrack: (trackId: string) => NormalizedAction[];
    getTrackOrder: () => string[];
}

const EMPTY_STATE: NormalizedEditorState = {
    tracks: {},
    actions: {},
    trackOrder: [],
    actionsByTrack: {},
};

export const useEditorDataStore = create<EditorDataStore>()((set, get) => ({
    normalized: EMPTY_STATE,

    syncFromLegacy: () => {
        const editorData = useAppStore.getState().editorData;
        const normalized = normalizeEditorData(editorData);
        set({ normalized });
    },

    syncToLegacy: () => {
        const { normalized } = get();
        const legacy = denormalizeEditorData(normalized);
        useAppStore.getState().setEditorData(legacy);
    },

    // O(1) selectors
    getTrack: (trackId: string) => get().normalized.tracks[trackId],
    getAction: (actionId: string) => get().normalized.actions[actionId],
    getActionsByTrack: (trackId: string) => {
        const { normalized } = get();
        const ids = normalized.actionsByTrack[trackId] || [];
        return ids.map(id => normalized.actions[id]).filter(Boolean);
    },
    getTrackOrder: () => get().normalized.trackOrder,
}));

// -- Auto-sync: Keep normalized in sync with legacy editorData --
// Subscribe to useAppStore.editorData changes and auto-normalize
let unsubscribeSync: (() => void) | null = null;

export function startEditorDataSync() {
    if (unsubscribeSync) return; // Already started

    unsubscribeSync = useAppStore.subscribe((state, prevState) => {
        if (state.editorData !== prevState.editorData) {
            useEditorDataStore.getState().syncFromLegacy();
        }
    });

    // Initial sync
    useEditorDataStore.getState().syncFromLegacy();
}

export function stopEditorDataSync() {
    if (unsubscribeSync) {
        unsubscribeSync();
        unsubscribeSync = null;
    }
}
