import * as PIXI from 'pixi.js';
import type { CharacterTrack, TimelineKeyframe } from '../../../store/useAppStore';
import { ImageManager } from './ImageManager';

export class AnimationManager {
    private imageManager: ImageManager;

    constructor(imageManager: ImageManager) {
        this.imageManager = imageManager;
    }

    public evaluateTransforms(tracks: CharacterTrack[], currentTime: number) {
        // Z-Index ordering (reverse order of array to match HTML DOM standard, or manual zIndex sort)
        // PixiJS sortableChildren handles zIndex, let's assign it.

        tracks.forEach((track, index) => {
            const group = this.imageManager.getGroup(track.id);
            if (!group) return;

            group.zIndex = track.actions.length > 0 ? (track.actions[0].zIndex || index * 10) : index * 10;

            const transform = track.transform;
            if (!transform) return;

            // Evaluate properties
            group.x = this.interpolate(transform.x, currentTime, 960);
            group.y = this.interpolate(transform.y, currentTime, 540);
            group.scale.set(this.interpolate(transform.scale, currentTime, 1.0));
            // PixiJS uses radians for rotation, store usually keeps degrees. Convert if necessary.
            group.angle = this.interpolate(transform.rotation, currentTime, 0);
            group.alpha = this.interpolate(transform.opacity, currentTime, 1.0);

            // Anchor changes
            if (transform.anchorX && transform.anchorY && track.actions.length > 0) {
                const currentSprite = group.children[0] as PIXI.Sprite | undefined;
                if (currentSprite && currentSprite.anchor) {
                    const ax = this.interpolate(transform.anchorX, currentTime, 0.5);
                    const ay = this.interpolate(transform.anchorY, currentTime, 0.5);
                    currentSprite.anchor.set(ax, ay);
                }
            }

            // Speed multiplier not directly applicable to static images, 
            // but if we had VideoManager it would scale the playback rate.
        });
    }

    private interpolate(keyframes: TimelineKeyframe[], time: number, defaultValue: number): number {
        if (!keyframes || keyframes.length === 0) return defaultValue;
        if (keyframes.length === 1) return keyframes[0].value;

        // Find immediately preceding and succeeding keyframes
        let prev = keyframes[0];
        let next = keyframes[keyframes.length - 1];

        if (time <= prev.time) return prev.value;
        if (time >= next.time) return next.value;

        for (let i = 0; i < keyframes.length - 1; i++) {
            if (time >= keyframes[i].time && time < keyframes[i + 1].time) {
                prev = keyframes[i];
                next = keyframes[i + 1];
                break;
            }
        }

        const t = (time - prev.time) / (next.time - prev.time);

        // Apply easing (Linear by default, can expand to Bezier later)
        let easedT = t;
        switch (prev.easing) {
            case 'step': easedT = 0; break;
            case 'easeIn': easedT = t * t; break;
            case 'easeOut': easedT = t * (2 - t); break;
            case 'easeInOut': easedT = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; break;
            // linear is default
        }

        return prev.value + (next.value - prev.value) * easedT;
    }
}
