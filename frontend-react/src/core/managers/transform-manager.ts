import { EditorCore } from '../index';

export interface SnapLine {
    type: 'vertical' | 'horizontal';
    position: number;
}

/**
 * TransformManager
 * 
 * Manages element transformations, snapping logic, and smart guides.
 * Decouples complex math from the main component.
 */
export class TransformManager {
    private core: EditorCore;
    private smartGuides: SnapLine[] = [];
    private listeners = new Set<() => void>();

    constructor(core: EditorCore) {
        this.core = core;
    }

    setSmartGuides(guides: SnapLine[]): void {
        this.smartGuides = guides;
        this.notify();
    }

    getSmartGuides(): SnapLine[] {
        return this.smartGuides;
    }

    /**
     * Calculate snapping for a position based on logical canvas dimensions.
     */
    calculateSnap(x: number, y: number, width: number, height: number): { x: number, y: number, guides: SnapLine[] } {
        const SNAP_RADIUS = 15;
        const centerX = width / 2;
        const centerY = height / 2;

        let snappedX = x;
        let snappedY = y;
        const guides: SnapLine[] = [];

        if (Math.abs(x - centerX) < SNAP_RADIUS) {
            snappedX = centerX;
            guides.push({ type: 'vertical', position: centerX });
        }

        if (Math.abs(y - centerY) < SNAP_RADIUS) {
            snappedY = centerY;
            guides.push({ type: 'horizontal', position: centerY });
        }

        return { x: snappedX, y: snappedY, guides };
    }

    subscribe(fn: () => void): () => void {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    }

    private notify(): void {
        this.listeners.forEach(fn => fn());
    }
}
