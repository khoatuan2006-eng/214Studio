/**
 * Easing functions for keyframe interpolation.
 * Used by the animation engine to create smooth/stylized motion.
 *
 * Each function takes a normalized progress value t (0..1) and returns
 * the eased value (0..1).
 */

export type EasingType = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'step';

/** All available easing options for UI dropdowns */
export const EASING_OPTIONS: { value: EasingType; label: string }[] = [
    { value: 'linear', label: 'Linear (Constant Speed)' },
    { value: 'easeIn', label: 'Ease In (Accelerate)' },
    { value: 'easeOut', label: 'Ease Out (Decelerate)' },
    { value: 'easeInOut', label: 'Ease In & Out (Smooth)' },
    { value: 'step', label: 'Step (Stop-motion)' },
];

const easingFunctions: Record<EasingType, (t: number) => number> = {
    linear: (t) => t,
    easeIn: (t) => t * t * t,
    easeOut: (t) => 1 - Math.pow(1 - t, 3),
    easeInOut: (t) =>
        t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
    step: (t) => (t >= 1 ? 1 : 0),
};

/**
 * Apply an easing function to a normalized progress value.
 * @param progress - Normalized value 0..1
 * @param type - Easing type (defaults to 'linear')
 * @returns Eased value 0..1
 */
export function applyEasing(progress: number, type?: EasingType): number {
    const fn = easingFunctions[type || 'linear'];
    return fn ? fn(progress) : progress;
}

/**
 * Interpolate between keyframes at a given time, applying easing.
 * Uses the easing type of keyframe A when interpolating A → B.
 */
export interface KeyframePoint {
    time: number;
    value: number;
    easing?: EasingType;
}

export function getInterpolatedValue(
    keyframes: KeyframePoint[],
    time: number,
    defaultValue: number,
): number {
    if (!keyframes || keyframes.length === 0) return defaultValue;

    const sorted = [...keyframes].sort((a, b) => a.time - b.time);
    if (time <= sorted[0].time) return sorted[0].value;
    if (time >= sorted[sorted.length - 1].time)
        return sorted[sorted.length - 1].value;

    for (let i = 0; i < sorted.length - 1; i++) {
        if (time >= sorted[i].time && time <= sorted[i + 1].time) {
            const k1 = sorted[i];
            const k2 = sorted[i + 1];
            const tRange = k2.time - k1.time;
            if (tRange === 0) return k1.value;

            let progress = (time - k1.time) / tRange;
            progress = applyEasing(progress, k1.easing);
            return k1.value + (k2.value - k1.value) * progress;
        }
    }
    return defaultValue;
}
