import { PlaybackManager } from './managers/playback-manager';
import { SelectionManager } from './managers/selection-manager';
import { TransformManager } from './managers/transform-manager';

/**
 * EditorCore (Inspired by OpenCut)
 * 
 * Central singleton that manages all editor business logic.
 * Decouples logic from React components to improve performance and maintainability.
 */
export class EditorCore {
    private static instance: EditorCore | null = null;

    public readonly playback: PlaybackManager;
    public readonly selection: SelectionManager;
    public readonly transform: TransformManager;

    constructor() {
        this.playback = new PlaybackManager(this);
        this.selection = new SelectionManager(this);
        this.transform = new TransformManager(this);
        console.log('[EditorCore] Initialized');
    }

    static getInstance(): EditorCore {
        if (!EditorCore.instance) {
            EditorCore.instance = new EditorCore();
        }
        return EditorCore.instance;
    }

    /**
     * Helper for React hooks to get the core
     */
    static useCore(): EditorCore {
        return EditorCore.getInstance();
    }
}
