import { useState, useEffect, useCallback, useRef } from 'react';

interface UsePlaybackOptions {
    totalDuration: number;
    onClose: () => void;
}

interface UsePlaybackReturn {
    isPlaying: boolean;
    currentTime: number;
    playbackSpeed: number;
    setCurrentTime: React.Dispatch<React.SetStateAction<number>>;
    setPlaybackSpeed: React.Dispatch<React.SetStateAction<number>>;
    play: () => void;
    pause: () => void;
    stop: () => void;
    skipBack: () => void;
    skipForward: () => void;
}

export function usePlayback({ totalDuration, onClose }: UsePlaybackOptions): UsePlaybackReturn {
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [playbackSpeed, setPlaybackSpeed] = useState(1);
    const animFrameRef = useRef<number>(0);
    const lastTimeRef = useRef<number>(0);

    const play = useCallback(() => {
        setIsPlaying(true);
        lastTimeRef.current = performance.now();
    }, []);

    const pause = useCallback(() => {
        setIsPlaying(false);
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    }, []);

    const stop = useCallback(() => {
        setIsPlaying(false);
        setCurrentTime(0);
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    }, []);

    const skipBack = useCallback(() => setCurrentTime(0), []);
    const skipForward = useCallback(() => setCurrentTime(totalDuration), [totalDuration]);

    // Animation frame loop
    useEffect(() => {
        if (!isPlaying) return;

        const tick = (now: number) => {
            const delta = (now - lastTimeRef.current) / 1000 * playbackSpeed;
            lastTimeRef.current = now;

            setCurrentTime((prev) => {
                const next = prev + delta;
                if (next >= totalDuration) return 0;
                return next;
            });

            animFrameRef.current = requestAnimationFrame(tick);
        };

        lastTimeRef.current = performance.now();
        animFrameRef.current = requestAnimationFrame(tick);

        return () => {
            if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        };
    }, [isPlaying, totalDuration, playbackSpeed]);

    // Keyboard shortcuts: Escape to close, Space to toggle play
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
            if (e.key === ' ') { e.preventDefault(); isPlaying ? pause() : play(); }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose, isPlaying, play, pause]);

    return {
        isPlaying,
        currentTime,
        playbackSpeed,
        setCurrentTime,
        setPlaybackSpeed,
        play,
        pause,
        stop,
        skipBack,
        skipForward,
    };
}
