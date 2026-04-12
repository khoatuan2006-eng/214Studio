import { PlaybackManager } from './managers/playback-manager';
import { SelectionManager } from './managers/selection-manager';
import { TransformManager } from './managers/transform-manager';
import { SceneGraphManager } from './scene-graph';

/**
 * EditorCore (Inspired by OpenCut)
 * 
 * Central singleton that manages all editor business logic.
 * Decouples logic from React components to improve performance and maintainability.
 * 
 * The SceneGraphManager is the "Video DOM" — the authoritative source of
 * scene state that AI agents read and write to, and the PixiJS renderer
 * evaluates for display.
 */
export class EditorCore {
    private static instance: EditorCore | null = null;

    public readonly playback: PlaybackManager;
    public readonly selection: SelectionManager;
    public readonly transform: TransformManager;
    public readonly sceneGraph: SceneGraphManager;

    constructor() {
        this.sceneGraph = new SceneGraphManager();
        this.playback = new PlaybackManager(this);
        this.selection = new SelectionManager(this);
        this.transform = new TransformManager(this);
        console.log('[EditorCore] Initialized with SceneGraph');
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
