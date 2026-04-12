import { create } from 'zustand';

export interface StudioLayer {
    id: string;
    name: string;
    type: 'video' | 'image' | 'audio' | 'text';
    sourceUrl: string;
    x: number;
    y: number;
    width: number;
    height: number;
    origWidth: number;
    origHeight: number;
    cropX: number;
    cropY: number;
    rotation: number;
    opacity: number;
    zIndex: number;
    startFrame: number;
    durationInFrames: number;
    characterId?: string;
    layerGroup?: string;
    // Visual Filters
    blur?: number;
    brightness?: number;
    contrast?: number;
    grayscale?: number;
}

interface StudioStore {
    layers: StudioLayer[];
    durationInFrames: number;
    selectedLayerId: string | null;
    
    addLayer: (layer: StudioLayer) => void;
    addMultipleLayers: (layers: StudioLayer[]) => void;
    clearLayers: () => void;
    setSelectedLayer: (id: string | null) => void;
    updateLayer: (id: string, updates: Partial<StudioLayer>) => void;
}

export const useStudioStore = create<StudioStore>((set) => ({
    layers: [],
    durationInFrames: 300,
    selectedLayerId: null,

    addLayer: (layer) => set((state) => ({ layers: [...state.layers, layer] })),
    
    addMultipleLayers: (newLayers) => set((state) => ({ 
        layers: [...state.layers, ...newLayers].sort((a, b) => a.zIndex - b.zIndex)
    })),

    clearLayers: () => set({ layers: [], selectedLayerId: null }),
    
    setSelectedLayer: (id) => set({ selectedLayerId: id }),
    
    updateLayer: (id, updates) => set((state) => ({
        layers: state.layers.map(l => l.id === id ? { ...l, ...updates } : l)
    }))
}));
