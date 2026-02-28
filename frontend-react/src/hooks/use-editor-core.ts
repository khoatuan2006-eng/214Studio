import { useState, useEffect } from 'react';
import { useCore } from './use-core';

export function usePlayback() {
    const core = useCore();
    const [isPlaying, setIsPlaying] = useState(core.playback.getIsPlaying());
    const [currentTime, setCurrentTime] = useState(core.playback.getCurrentTime());

    useEffect(() => {
        const unsub = core.playback.subscribe(() => {
            setIsPlaying(core.playback.getIsPlaying());
            setCurrentTime(core.playback.getCurrentTime());
        });
        return unsub;
    }, [core]);

    return {
        isPlaying,
        currentTime,
        play: () => core.playback.play(),
        pause: () => core.playback.pause(),
        toggle: () => core.playback.toggle(),
        seek: (time: number) => core.playback.seek(time),
    };
}

export function useSelection() {
    const core = useCore();
    const [selectedRowId, setSelectedRowId] = useState(core.selection.getSelectedRowId());

    useEffect(() => {
        const unsub = core.selection.subscribe(() => {
            setSelectedRowId(core.selection.getSelectedRowId());
        });
        return unsub;
    }, [core]);

    return {
        selectedRowId,
        setSelectedRowId: (id: string) => core.selection.setSelectedRowId(id),
    };
}

export function useTransform() {
    const core = useCore();
    const [smartGuides, setSmartGuides] = useState(core.transform.getSmartGuides());

    useEffect(() => {
        const unsub = core.transform.subscribe(() => {
            setSmartGuides(core.transform.getSmartGuides());
        });
        return unsub;
    }, [core]);

    return {
        smartGuides,
        setSmartGuides: (guides: any[]) => core.transform.setSmartGuides(guides),
        calculateSnap: (x: number, y: number, w: number, h: number) => core.transform.calculateSnap(x, y, w, h),
    };
}
