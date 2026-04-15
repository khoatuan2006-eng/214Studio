/**
 * TransitionRenderer — PixiJS transition effects between scenes.
 *
 * Uses "single-render" (fade-to-black) approach for reliability and performance.
 * 
 * Supported transitions:
 * - cut: instant switch (no visual effect)
 * - fade: fade-to-black → fade-in (progress 0→0.5 = fade out, 0.5→1 = fade in)
 * - dissolve: crossfade via alpha (approximated with fade-to-black-to-new)
 * 
 * Usage:
 *   const renderer = new TransitionRenderer(app.stage);
 *   // Call every frame during transition:
 *   renderer.update(transition); // { type: 'fade', progress: 0.3 }
 *   // When transition ends:
 *   renderer.clear();
 */

import * as PIXI from 'pixi.js';
import type { ActiveTransition } from '@/stores/useSceneGraphStore';

const CANVAS_W = 1920;
const CANVAS_H = 1080;

export class TransitionRenderer {
    private overlay: PIXI.Graphics;
    private isActive = false;

    constructor(stage: PIXI.Container) {
        this.overlay = new PIXI.Graphics();
        this.overlay.zIndex = 99998; // Just below subtitles
        this.overlay.visible = false;
        stage.addChild(this.overlay);
    }

    /**
     * Update the transition overlay based on current transition state.
     * Call this every frame when a transition is active.
     */
    update(transition: ActiveTransition | null): void {
        if (!transition || transition.type === 'cut') {
            this.clear();
            return;
        }

        this.isActive = true;
        this.overlay.visible = true;

        const { type, progress } = transition;

        switch (type) {
            case 'fade':
                this.renderFade(progress);
                break;
            case 'dissolve':
                // Dissolve approximated as a softer fade
                this.renderDissolve(progress);
                break;
            case 'slide_left':
            case 'slide_right':
                // Slide approximated as fade for now
                this.renderFade(progress);
                break;
            case 'wipe':
                this.renderWipe(progress);
                break;
            default:
                this.renderFade(progress);
        }
    }

    /**
     * Fade-to-black transition.
     * progress 0→0.5: screen goes black (alpha 0→1)
     * progress 0.5→1: screen returns (alpha 1→0)
     */
    private renderFade(progress: number): void {
        let alpha: number;
        if (progress < 0.5) {
            // Fade out: 0 → 1
            alpha = progress * 2;
        } else {
            // Fade in: 1 → 0
            alpha = (1 - progress) * 2;
        }
        // Ease the alpha for smoother look
        alpha = this.easeInOut(alpha);

        this.overlay.clear();
        this.overlay.rect(0, 0, CANVAS_W, CANVAS_H);
        this.overlay.fill({ color: 0x000000, alpha: Math.max(0, Math.min(1, alpha)) });
    }

    /**
     * Dissolve: softer crossfade using partial transparency.
     * Uses a narrower black overlay with smoother easing.
     */
    private renderDissolve(progress: number): void {
        let alpha: number;
        if (progress < 0.4) {
            alpha = (progress / 0.4) * 0.7; // Max 70% opacity
        } else if (progress > 0.6) {
            alpha = ((1 - progress) / 0.4) * 0.7;
        } else {
            alpha = 0.7; // Hold at peak
        }
        alpha = this.easeInOut(alpha);

        this.overlay.clear();
        this.overlay.rect(0, 0, CANVAS_W, CANVAS_H);
        this.overlay.fill({ color: 0x000000, alpha: Math.max(0, Math.min(1, alpha)) });
    }

    /**
     * Wipe: horizontal wipe from left to right.
     */
    private renderWipe(progress: number): void {
        const wipeX = progress * CANVAS_W;

        this.overlay.clear();
        this.overlay.rect(0, 0, wipeX, CANVAS_H);
        this.overlay.fill({ color: 0x000000, alpha: 0.95 });
    }

    /**
     * Clear the transition overlay.
     */
    clear(): void {
        if (this.isActive) {
            this.overlay.clear();
            this.overlay.visible = false;
            this.isActive = false;
        }
    }

    /**
     * Destroy and clean up.
     */
    destroy(): void {
        this.clear();
        this.overlay.destroy();
    }

    /** Smooth easeInOut for transitions. */
    private easeInOut(t: number): number {
        return t < 0.5
            ? 2 * t * t
            : 1 - Math.pow(-2 * t + 2, 2) / 2;
    }
}
