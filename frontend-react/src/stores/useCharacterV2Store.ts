import { create } from 'zustand';
import axios from 'axios';
import { API_BASE } from '@/config/api';

// ── V2 Character Data Types ─────────────────────────────────

export interface PartVariant {
    name: string;
    layer_path: string;
    bbox: number[];
    hash: string;
    asset_path: string;
    visible: boolean;
}

export interface BodyPartData {
    name: string;
    z_order: number;
    variants: PartVariant[];
}

export interface HeadData {
    expression_type: 'combinable' | 'pre_composed';
    face_shapes: PartVariant[];
    hairstyles: PartVariant[];
    // Combinable
    mouths?: PartVariant[];
    eyes?: PartVariant[];
    eyebrows?: PartVariant[];
    // Pre-composed
    expressions?: PartVariant[];
    merged_expressions?: PartVariant[];
}

export interface ViewpointData {
    name: string;
    body_parts: Record<string, BodyPartData>;
    head: HeadData | null;
}

export interface CharacterV2 {
    id: string;
    name: string;
    psd_type: 'jointed' | 'flat';
    timestamp: string;
    canvas_size: number[];
    body_parts: Record<string, BodyPartData> | null;
    head: HeadData | null;
    viewpoints: Record<string, ViewpointData> | null;
    // Backward compat
    group_order: string[];
    layer_groups: Record<string, { name: string; path: string; hash: string }[]>;
}

// ── Store ────────────────────────────────────────────────────

interface CharacterV2Store {
    characters: CharacterV2[];
    isLoading: boolean;
    error: string | null;
    fetchCharacters: () => Promise<void>;
    getCharacter: (id: string) => CharacterV2 | undefined;
}

export const useCharacterV2Store = create<CharacterV2Store>()((set, get) => ({
    characters: [],
    isLoading: false,
    error: null,

    fetchCharacters: async () => {
        set({ isLoading: true, error: null });
        try {
            const res = await axios.get(`${API_BASE}/v2/characters/`);
            set({ characters: res.data, isLoading: false });
        } catch (error: any) {
            set({ error: error.message, isLoading: false });
        }
    },

    getCharacter: (id: string) => {
        return get().characters.find((c) => c.id === id);
    },
}));
