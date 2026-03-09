import * as PIXI from 'pixi.js';
import { ImageManager } from './managers/ImageManager';
import { AnimationManager } from './managers/AnimationManager';
import { useAppStore } from '../../stores/useAppStore';
import { subscribe } from 'valtio';

export class Compositor {
    public app: PIXI.Application;
    public imageManager: ImageManager;
    public animationManager: AnimationManager;

    private isPlaying: boolean = false;

    // Subscribe functions
    private unsubTransient: (() => void) | null = null;
    private unsubApp: (() => void) | null = null;

    constructor(canvasView: HTMLCanvasElement, width: number, height: number, bgColor: string) {
        this.app = new PIXI.Application({
            view: canvasView,
            width: width,
            height: height,
            backgroundColor: bgColor,
            preference: 'webgl',
            resolution: window.devicePixelRatio || 1,
            autoDensity: true,
        });

        // Enable sorting for zIndex
        this.app.stage.sortableChildren = true;

        this.imageManager = new ImageManager(this.app, this.app.stage);
        this.animationManager = new AnimationManager(this.imageManager);

        this.setupSubscriptions();

        // Initial manual render
        this.composeFrame(0);

        // Start dedicated loop
        this.app.ticker.add(this.update.bind(this));
    }

    private setupSubscriptions() {
        // Subscribe to transient changes (playhead scrub, play state)
        // Note: we can't use React hooks inside vanilla class like this directly if they rely on context.
        // Valtio snapshot is accessible directly from the state object.
        import('../../stores/transient-store').then(({ transientState }) => {
            this.unsubTransient = subscribe(transientState, () => {
                this.isPlaying = transientState.isPlaying;
                if (!this.isPlaying) {
                    // If scrubbing, forcefully render the exact frame.
                    this.composeFrame(transientState.cursorTime);
                }
            });
        });

        const store = useAppStore;
        this.unsubApp = store.subscribe((state, prevState) => {
            if (state.editorData !== prevState.editorData) {
                // Preload new textures
                this.imageManager.preloadTextures(state.editorData, state.characters).then(() => {
                    // Recompose current frame if paused
                    import('../../stores/transient-store').then(({ transientState }) => {
                        if (!transientState.isPlaying) {
                            this.composeFrame(transientState.cursorTime);
                        }
                    });
                });
            }
        });
    }

    private update(ticker: PIXI.Ticker) {
        if (!this.isPlaying) return;

        // In a real scenario, use actual clock Delta time converted to seconds
        // Ticker delta is relative to 60fps.
        const dt = ticker.deltaMS / 1000;

        import('../../stores/transient-store').then(({ transientState, setCursorTime }) => {
            const newTime = transientState.cursorTime + dt;
            setCursorTime(newTime); // Update transient store for UI Playhead
            this.composeFrame(newTime);
        });
    }

    private composeFrame(timecode: number) {
        const state = useAppStore.getState();

        this.imageManager.syncTracks(state.editorData, timecode);
        this.animationManager.evaluateTransforms(state.editorData, timecode);

        // PIXI handles actual rendering during its Ticker lifecycle when `this.app.render()` runs underneath.
    }

    public resize(width: number, height: number) {
        this.app.renderer.resize(width, height);
    }

    public destroy() {
        if (this.unsubApp) this.unsubApp();
        if (this.unsubTransient) this.unsubTransient();

        this.imageManager.destroy();
        this.app.destroy(false, { children: true });
    }
}
