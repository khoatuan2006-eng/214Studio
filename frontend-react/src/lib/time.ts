export function getSnappedSeekTime(params: {
    time?: number;
    rawTime?: number;
    fps: number;
    duration: number;
    currentSnapPoint?: any;
    snappingEnabled?: boolean;
}): number {
    return params.time ?? params.rawTime ?? 0;
}

export function snapTimeToFrame({ time, fps }: { time: number; fps: number }): number {
    const frameDuration = 1 / Math.max(1, fps);
    return Math.round(time / frameDuration) * frameDuration;
}
