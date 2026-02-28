/**
 * Interpolation Worker
 * 
 * Offloads heavy 60fps keyframe interpolation from the main thread.
 * Receives editorData and currentTime, returns calculated transform values.
 */

type EasingType = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'step';

interface KeyframePoint {
    time: number;
    value: number;
    easing?: EasingType;
}

const easingFunctions: Record<EasingType, (t: number) => number> = {
    linear: (t) => t,
    easeIn: (t) => t * t * t,
    easeOut: (t) => 1 - Math.pow(1 - t, 3),
    easeInOut: (t) =>
        t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
    step: (t) => (t >= 1 ? 1 : 0),
};

function applyEasing(progress: number, type?: EasingType): number {
    const fn = easingFunctions[type || 'linear'];
    return fn ? fn(progress) : progress;
}

function getInterpolatedValue(
    keyframes: KeyframePoint[],
    time: number,
    defaultValue: number,
): number {
    if (!keyframes || keyframes.length === 0) return defaultValue;

    // In worker, we expect keyframes to be already sorted or we sort them once per project change
    // For now, we sort here to be safe, but can optimize later
    const sorted = keyframes.slice().sort((a, b) => a.time - b.time);
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

self.onmessage = (e: MessageEvent) => {
    const { time, editorData, logicalWidth, logicalHeight } = e.data;
    const results: Record<string, any> = {};

    if (!editorData) return;

    const BASE_EXTENT = 600;

    editorData.forEach((char: any) => {
        // P2-3.4: Speed Ramp Logic
        const speed = char.speedMultiplier ?? 1;
        const trackStart = char.actions && char.actions.length > 0
            ? Math.min(...char.actions.map((a: any) => a.start))
            : 0;
        const effectiveTime = speed !== 1 ? trackStart + (time - trackStart) * speed : time;

        const x = getInterpolatedValue(char.transform.x, effectiveTime, logicalWidth / 2);
        const y = getInterpolatedValue(char.transform.y, effectiveTime, logicalHeight / 2);
        const scale = getInterpolatedValue(char.transform.scale, effectiveTime, 1);

        // 18.1: Scale-aware frustum culling
        const scaledPadding = BASE_EXTENT * Math.max(scale, 1);
        const isInViewport =
            x > -scaledPadding && x < logicalWidth + scaledPadding &&
            y > -scaledPadding && y < logicalHeight + scaledPadding;

        results[char.id] = {
            x,
            y,
            scaleX: scale,
            scaleY: scale,
            rotation: getInterpolatedValue(char.transform.rotation, effectiveTime, 0),
            opacity: getInterpolatedValue(char.transform.opacity, effectiveTime, 100) / 100,
            anchorX: getInterpolatedValue(char.transform.anchorX, effectiveTime, 0),
            anchorY: getInterpolatedValue(char.transform.anchorY, effectiveTime, 0),
            isInViewport,
            visibleAssets: char.actions.map((action: any) => ({
                id: action.id,
                visible: isInViewport && !action.hidden && time >= action.start && time <= action.end
            }))
        };
    });

    self.postMessage(results);
};
