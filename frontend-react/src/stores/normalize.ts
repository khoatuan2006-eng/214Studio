/**
 * Normalize / Denormalize utilities for EditorData (P0-0.2)
 * 
 * Converts between:
 * - Legacy: CharacterTrack[] (nested arrays, O(N) lookup)
 * - Normalized: NormalizedEditorState (flat dictionaries, O(1) lookup)
 * 
 * Used for:
 * - normalizeEditorData() — when loading from backend  
 * - denormalizeEditorData() — when saving to backend
 */

import type { CharacterTrack, ActionBlock, TransformData, BlendMode } from '@/store/useAppStore';

// --- Normalized Types ---

export interface NormalizedTrack {
    id: string;
    name: string;
    characterId?: string;
    transform: TransformData;
    blendMode?: BlendMode;
    isExpanded?: boolean;
}

export interface NormalizedAction {
    id: string;
    trackId: string;
    assetHash: string;
    start: number;
    end: number;
    zIndex: number;
    hidden?: boolean;
    locked?: boolean;
}

export interface NormalizedEditorState {
    /** Track data indexed by trackId — O(1) lookup */
    tracks: Record<string, NormalizedTrack>;
    /** Action data indexed by actionId — O(1) lookup */
    actions: Record<string, NormalizedAction>;
    /** Ordered track IDs for display order */
    trackOrder: string[];
    /** actionId[] indexed by trackId — O(1) to get all actions for a track */
    actionsByTrack: Record<string, string[]>;
}

// --- Normalize ---

/**
 * Convert legacy CharacterTrack[] to NormalizedEditorState.
 * O(N) one-time conversion on project load.
 */
export function normalizeEditorData(rows: CharacterTrack[]): NormalizedEditorState {
    const tracks: Record<string, NormalizedTrack> = {};
    const actions: Record<string, NormalizedAction> = {};
    const trackOrder: string[] = [];
    const actionsByTrack: Record<string, string[]> = {};

    for (const row of rows) {
        // Track
        tracks[row.id] = {
            id: row.id,
            name: row.name,
            characterId: row.characterId,
            transform: row.transform,
            blendMode: row.blendMode,
            isExpanded: row.isExpanded,
        };
        trackOrder.push(row.id);
        actionsByTrack[row.id] = [];

        // Actions
        for (const action of row.actions) {
            actions[action.id] = {
                id: action.id,
                trackId: row.id,
                assetHash: action.assetHash,
                start: action.start,
                end: action.end,
                zIndex: action.zIndex,
                hidden: action.hidden,
                locked: action.locked,
            };
            actionsByTrack[row.id].push(action.id);
        }
    }

    return { tracks, actions, trackOrder, actionsByTrack };
}

// --- Denormalize ---

/**
 * Convert NormalizedEditorState back to CharacterTrack[] for backend save.
 * O(N) one-time conversion on project save.
 */
export function denormalizeEditorData(state: NormalizedEditorState): CharacterTrack[] {
    return state.trackOrder.map(trackId => {
        const track = state.tracks[trackId];
        const actionIds = state.actionsByTrack[trackId] || [];
        const trackActions: ActionBlock[] = actionIds
            .map(id => state.actions[id])
            .filter(Boolean)
            .map(a => ({
                id: a.id,
                assetHash: a.assetHash,
                start: a.start,
                end: a.end,
                zIndex: a.zIndex,
                hidden: a.hidden,
                locked: a.locked,
            }));

        return {
            id: track.id,
            name: track.name,
            characterId: track.characterId,
            transform: track.transform,
            blendMode: track.blendMode,
            isExpanded: track.isExpanded,
            actions: trackActions,
        } as CharacterTrack;
    });
}

// --- Selectors (O(1)) ---

export function selectTrackById(state: NormalizedEditorState, trackId: string): NormalizedTrack | undefined {
    return state.tracks[trackId];
}

export function selectActionById(state: NormalizedEditorState, actionId: string): NormalizedAction | undefined {
    return state.actions[actionId];
}

export function selectActionsByTrack(state: NormalizedEditorState, trackId: string): NormalizedAction[] {
    const ids = state.actionsByTrack[trackId] || [];
    return ids.map(id => state.actions[id]).filter(Boolean);
}

export function selectAllTracks(state: NormalizedEditorState): NormalizedTrack[] {
    return state.trackOrder.map(id => state.tracks[id]).filter(Boolean);
}
