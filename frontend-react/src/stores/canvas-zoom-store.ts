import { create } from 'zustand';

interface CanvasZoomStore {
    // Zoom state
    zoom: number; // 0.25 - 4.0 (25% - 400%)
    panX: number; // X offset in pixels
    panY: number; // Y offset in pixels
    
    // Actions
    setZoom: (zoom: number) => void;
    zoomIn: () => void;
    zoomOut: () => void;
    zoomToFit: (containerWidth: number, containerHeight: number, contentWidth: number, contentHeight: number) => void;
    resetZoom: () => void;
    setPan: (x: number, y: number) => void;
    panBy: (dx: number, dy: number) => void;
    resetPan: () => void;
}

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4.0;
const ZOOM_STEP = 0.25;

export const useCanvasZoomStore = create<CanvasZoomStore>((set, get) => ({
    zoom: 1.0,
    panX: 0,
    panY: 0,
    
    setZoom: (zoom) => {
        const clamped = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom));
        set({ zoom: clamped });
    },
    
    zoomIn: () => {
        const { zoom } = get();
        set({ zoom: Math.min(ZOOM_MAX, zoom + ZOOM_STEP) });
    },
    
    zoomOut: () => {
        const { zoom } = get();
        set({ zoom: Math.max(ZOOM_MIN, zoom - ZOOM_STEP) });
    },
    
    zoomToFit: (containerWidth, containerHeight, contentWidth, contentHeight) => {
        if (contentWidth === 0 || contentHeight === 0) return;
        
        const scaleX = containerWidth / contentWidth;
        const scaleY = containerHeight / contentHeight;
        const fitZoom = Math.min(scaleX, scaleY, 1); // Don't zoom in larger than 100%
        
        set({ 
            zoom: fitZoom,
            panX: (containerWidth - contentWidth * fitZoom) / 2,
            panY: (containerHeight - contentHeight * fitZoom) / 2
        });
    },
    
    resetZoom: () => {
        set({ zoom: 1.0 });
    },
    
    setPan: (x, y) => {
        set({ panX: x, panY: y });
    },
    
    panBy: (dx, dy) => {
        const { panX, panY } = get();
        set({ panX: panX + dx, panY: panY + dy });
    },
    
    resetPan: () => {
        set({ panX: 0, panY: 0 });
    },
}));

// Preset zoom levels
export const ZOOM_PRESETS = [
    { label: '25%', value: 0.25 },
    { label: '50%', value: 0.5 },
    { label: '75%', value: 0.75 },
    { label: '100%', value: 1.0 },
    { label: '150%', value: 1.5 },
    { label: '200%', value: 2.0 },
    { label: '300%', value: 3.0 },
    { label: '400%', value: 4.0 },
];
