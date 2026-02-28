import { EditorCore } from '../index';
import { setCursorTime } from '../../stores/transient-store';
import { useAppStore } from '../../store/useAppStore';
import { interpolationService } from '../services/interpolation-service';

/**
 * PlaybackManager
 * 
 * Manages the playhead time, play/pause state, and animation loop.
 * Decouples the 60fps timer from React state updates using CustomEvents.
 */
export class PlaybackManager {
    private isPlaying = false;
    private currentTime = 0;
    private lastUpdate = 0;
    private animFrameId: number | null = null;
    private listeners = new Set<() => void>();

    constructor(_core: EditorCore) {
        // Core reference can be used here for future cross-manager coordination
    }

    play(): void {
        if (this.isPlaying) return;
        this.isPlaying = true;
        this.lastUpdate = performance.now();
        this.startLoop();
        this.notify();
    }

    pause(): void {
        this.isPlaying = false;
        if (this.animFrameId !== null) {
            cancelAnimationFrame(this.animFrameId);
            this.animFrameId = null;
        }
        this.notify();
    }

    toggle(): void {
        if (this.isPlaying) this.pause();
        else this.play();
    }

    seek(time: number): void {
        this.currentTime = Math.max(0, time);
        setCursorTime(this.currentTime);
        this.notify();

        // Trigger off-main-thread interpolation calculation
        interpolationService.requestCalculation(this.currentTime, useAppStore.getState().editorData);

        // Dispatch event for components that need high-freq updates without re-render
        window.dispatchEvent(new CustomEvent('playback-seek', { detail: { time: this.currentTime } }));
    }

    getIsPlaying(): boolean {
        return this.isPlaying;
    }

    getCurrentTime(): number {
        return this.currentTime;
    }

    subscribe(fn: () => void): () => void {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    }

    private notify(): void {
        this.listeners.forEach(fn => fn());
    }

    private startLoop(): void {
        const loop = () => {
            if (!this.isPlaying) return;

            const now = performance.now();
            const delta = (now - this.lastUpdate) / 1000;
            this.lastUpdate = now;

            this.currentTime += delta;

            // Sync with transient-store (Valtio) for global access
            setCursorTime(this.currentTime);

            // Trigger off-main-thread interpolation calculation
            interpolationService.requestCalculation(this.currentTime, useAppStore.getState().editorData);

            // Notify listeners (UI)
            this.notify();

            // Dispatch global event for high-performance canvas syncing
            window.dispatchEvent(new CustomEvent('playback-update', { detail: { time: this.currentTime } }));

            this.animFrameId = requestAnimationFrame(loop);
        };
        this.animFrameId = requestAnimationFrame(loop);
    }
}
