import { create } from 'zustand';
import axios from 'axios';
import { API_BASE, STATIC_BASE } from '@/config/api';

// P0-0.1: Transient state moved to Valtio. Re-export for gradual migration.
export {
    transientState,
    setCursorTime,
    setScrubbing,
    setPlaying,
    toggleAutoKeyframe,
    setActiveEditTargetId,
    useTransientSnapshot,
} from '@/stores/transient-store';

// Re-export for backward compatibility (other files import these from useAppStore)
export { API_BASE, STATIC_BASE };

export interface CharacterAsset {
    name: string;
    path: string;
    hash?: string;
}

export interface Character {
    id: string;
    name: string;
    group_order: string[];
    layer_groups: Record<string, CharacterAsset[]>;
    timestamp: string;
}

interface LibraryAsset {
    name: string;
    hash: string;
    path?: string; // added manually if needed
}

export interface LibrarySubfolder {
    name: string;
    assets: LibraryAsset[];
}

export interface LibraryCategory {
    id: string;
    name: string;
    z_index: number;
    subfolders: LibrarySubfolder[];
}

export interface CustomLibrary {
    categories: LibraryCategory[];
}

export interface ActionBlock {
    id: string;
    assetHash: string;
    start: number; // in seconds
    end: number;
    zIndex: number;
    hidden?: boolean;
    locked?: boolean;
}

export type EasingType = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'step';

export interface TimelineKeyframe {
    time: number;
    value: number;
    easing?: EasingType;
}

export interface TransformData {
    x: TimelineKeyframe[];
    y: TimelineKeyframe[];
    scale: TimelineKeyframe[];
    rotation: TimelineKeyframe[];
    opacity: TimelineKeyframe[];
    anchorX: TimelineKeyframe[];
    anchorY: TimelineKeyframe[];
}

export type BlendMode = "source-over" | "multiply" | "screen" | "overlay" | "darken" | "lighten";

// P2-3.2: Track Group definition
export interface TrackGroup {
    id: string;
    name: string;
    color: string;   // hex color e.g. '#6366f1'
    isCollapsed: boolean;
}

export interface CharacterTrack {
    id: string;
    name: string;
    characterId?: string;
    transform: TransformData;
    blendMode?: BlendMode;
    actions: ActionBlock[];
    isExpanded?: boolean;
    // P2-3.2: Group membership
    groupId?: string;
    // P2-3.4: Speed Ramp — playback speed multiplier (0.1 – 4.0, default 1.0)
    speedMultiplier?: number;
}

// P2-3.1: Multi-scene management
export interface Scene {
    id: string;
    name: string;
    editorData: CharacterTrack[];
    trackGroups: TrackGroup[];
    duration?: number; // optional scene-specific duration override
}

interface AppState {
    characters: Character[];
    customLibrary: CustomLibrary;
    isLoading: boolean;
    error: string | null;
    fetchCharacters: () => Promise<void>;
    fetchCustomLibrary: () => Promise<void>;

    // Studio Layout State (Domain Data only — transient state is in transient-store.ts)
    editorData: CharacterTrack[];
    setEditorData: (data: CharacterTrack[] | ((prev: CharacterTrack[]) => CharacterTrack[])) => void;
    toggleTrackExpanded: (trackId: string) => void;

    // P2-3.1: Multi-scene management
    scenes: Scene[];
    activeSceneId: string | null;
    addScene: (name?: string) => Scene;
    removeScene: (sceneId: string) => void;
    renameScene: (sceneId: string, name: string) => void;
    switchScene: (sceneId: string) => void;
    reorderScenes: (fromIdx: number, toIdx: number) => void;
    duplicateScene: (sceneId: string) => Scene;

    // P2-3.2: Track Groups
    trackGroups: TrackGroup[];
    addTrackGroup: (name: string, color?: string) => TrackGroup;
    removeTrackGroup: (groupId: string) => void;
    updateTrackGroup: (groupId: string, patch: Partial<TrackGroup>) => void;
    assignTracksToGroup: (trackIds: string[], groupId: string | null) => void;
}

export const useAppStore = create<AppState>()(
    (set, get) => ({
        characters: [],
        customLibrary: { categories: [] },
        isLoading: false,
        error: null,
        editorData: [],
        trackGroups: [],
        setEditorData: (data) => set((state) => ({
            editorData: typeof data === 'function' ? data(state.editorData) : data
        })),
        toggleTrackExpanded: (trackId) => set((state) => ({
            editorData: state.editorData.map(row =>
                row.id === trackId ? { ...row, isExpanded: !row.isExpanded } : row
            )
        })),

        // P2-3.1: Multi-scene initial state
        scenes: [],
        activeSceneId: null,

        addScene: (name) => {
            const id = `scene_${Date.now()}`;
            const state = get();
            const newScene: Scene = {
                id,
                name: name ?? `Scene ${state.scenes.length + 1}`,
                editorData: [],
                trackGroups: [],
            };
            // Save current scene data before adding new one
            const updatedScenes = state.activeSceneId
                ? state.scenes.map(s => s.id === state.activeSceneId
                    ? { ...s, editorData: state.editorData, trackGroups: state.trackGroups }
                    : s)
                : state.scenes;
            set({ scenes: [...updatedScenes, newScene], activeSceneId: id, editorData: [], trackGroups: [] });
            return newScene;
        },

        removeScene: (sceneId) => set((state) => {
            const remaining = state.scenes.filter(s => s.id !== sceneId);
            if (remaining.length === 0) {
                return { scenes: [], activeSceneId: null, editorData: [], trackGroups: [] };
            }
            const newActive = state.activeSceneId === sceneId
                ? remaining[0]
                : state.scenes.find(s => s.id === state.activeSceneId) ?? remaining[0];
            return {
                scenes: remaining,
                activeSceneId: newActive.id,
                editorData: newActive.editorData,
                trackGroups: newActive.trackGroups,
            };
        }),

        renameScene: (sceneId, name) => set((state) => ({
            scenes: state.scenes.map(s => s.id === sceneId ? { ...s, name } : s),
        })),

        switchScene: (sceneId) => set((state) => {
            if (state.activeSceneId === sceneId) return {};
            // Snapshot current scene before switching
            const updatedScenes = state.scenes.map(s =>
                s.id === state.activeSceneId
                    ? { ...s, editorData: state.editorData, trackGroups: state.trackGroups }
                    : s
            );
            const target = updatedScenes.find(s => s.id === sceneId);
            if (!target) return {};
            return {
                scenes: updatedScenes,
                activeSceneId: sceneId,
                editorData: target.editorData,
                trackGroups: target.trackGroups,
            };
        }),

        reorderScenes: (fromIdx, toIdx) => set((state) => {
            const arr = [...state.scenes];
            const [moved] = arr.splice(fromIdx, 1);
            arr.splice(toIdx, 0, moved);
            return { scenes: arr };
        }),

        duplicateScene: (sceneId) => {
            const state = get();
            const src = state.scenes.find(s => s.id === sceneId);
            if (!src) return null as any;
            const id = `scene_${Date.now()}`;
            const copy: Scene = {
                ...src,
                id,
                name: `${src.name} (copy)`,
                editorData: src.editorData.map(t => ({ ...t, id: `${t.id}_c${Date.now()}` })),
                trackGroups: [...src.trackGroups],
            };
            set((state) => ({ scenes: [...state.scenes, copy] }));
            return copy;
        },

        // P2-3.2 Track Group operations
        addTrackGroup: (name, color = '#6366f1') => {
            const id = `grp_${Date.now()}`;
            const group: TrackGroup = { id, name, color, isCollapsed: false };
            set((state) => ({ trackGroups: [...state.trackGroups, group] }));
            return group;
        },
        removeTrackGroup: (groupId) => set((state) => ({
            trackGroups: state.trackGroups.filter(g => g.id !== groupId),
            // un-assign tracks from this group
            editorData: state.editorData.map(t =>
                t.groupId === groupId ? { ...t, groupId: undefined } : t
            ),
        })),
        updateTrackGroup: (groupId, patch) => set((state) => ({
            trackGroups: state.trackGroups.map(g =>
                g.id === groupId ? { ...g, ...patch } : g
            ),
        })),
        assignTracksToGroup: (trackIds, groupId) => set((state) => ({
            editorData: state.editorData.map(t =>
                trackIds.includes(t.id)
                    ? { ...t, groupId: groupId ?? undefined }
                    : t
            ),
        })),

        fetchCharacters: async () => {
            set({ isLoading: true, error: null });
            try {
                const res = await axios.get(`${API_BASE}/characters/`);
                set({ characters: res.data, isLoading: false });
            } catch (error: any) {
                set({ error: error.message, isLoading: false });
            }
        },

        fetchCustomLibrary: async () => {
            set({ isLoading: true, error: null });
            try {
                const res = await axios.get(`${API_BASE}/library/`);
                set({ customLibrary: res.data, isLoading: false });
            } catch (error: any) {
                set({ error: error.message, isLoading: false });
            }
        }
    })
);

// Helper function to resolve asset paths like the old JS did (Fallback check via hash)
export const getAssetPath = (characters: Character[], hash: string): string => {
    if (!hash) return "";
    if (hash.includes('/') || hash.includes('\\')) return hash;

    for (const char of characters) {
        if (!char.layer_groups) continue;
        for (const group of Object.values(char.layer_groups)) {
            const found = group.find((a) => a.hash === hash || a.path.includes(hash));
            if (found && found.path) return found.path;
        }
    }
    return `assets/${hash}.png`;
};
