import { create } from 'zustand';
import { temporal } from 'zundo';
import axios from 'axios';
import { API_BASE, STATIC_BASE } from '@/config/api';

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

export interface CharacterTrack {
    id: string;
    name: string;
    characterId?: string;
    transform: TransformData;
    blendMode?: BlendMode;
    actions: ActionBlock[];
    isExpanded?: boolean;
}

interface AppState {
    characters: Character[];
    customLibrary: CustomLibrary;
    isLoading: boolean;
    error: string | null;
    fetchCharacters: () => Promise<void>;
    fetchCustomLibrary: () => Promise<void>;

    // Studio Layout State
    editorData: CharacterTrack[];
    setEditorData: (data: CharacterTrack[] | ((prev: CharacterTrack[]) => CharacterTrack[])) => void;
    toggleTrackExpanded: (trackId: string) => void;
    cursorTime: number;
    setCursorTime: (time: number | ((prev: number) => number)) => void;
    isScrubbing: boolean;
    setIsScrubbing: (isScrubbing: boolean) => void;
    isAutoKeyframeEnabled: boolean;
    toggleAutoKeyframe: () => void;

    // "Chia để trị" - Character Edit Mode Context
    activeEditTargetId: string | null;
    setActiveEditTargetId: (id: string | null) => void;
}

export const useAppStore = create<AppState>()(
    temporal(
        (set) => ({
            characters: [],
            customLibrary: { categories: [] },
            isLoading: false,
            error: null,
            editorData: [],
            setEditorData: (data) => set((state) => ({
                editorData: typeof data === 'function' ? data(state.editorData) : data
            })),
            toggleTrackExpanded: (trackId) => set((state) => ({
                editorData: state.editorData.map(row =>
                    row.id === trackId ? { ...row, isExpanded: !row.isExpanded } : row
                )
            })),
            cursorTime: 0,
            setCursorTime: (time) => set((state) => ({
                cursorTime: typeof time === 'function' ? time(state.cursorTime) : time
            })),
            isScrubbing: false,
            setIsScrubbing: (isScrubbing) => set({ isScrubbing }),
            isAutoKeyframeEnabled: false,
            toggleAutoKeyframe: () => set(state => ({ isAutoKeyframeEnabled: !state.isAutoKeyframeEnabled })),
            activeEditTargetId: null,
            setActiveEditTargetId: (id) => set({ activeEditTargetId: id }),

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
        }),
        {
            partialize: (state) => ({ editorData: state.editorData }),
            limit: 100,
        }
    )
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
