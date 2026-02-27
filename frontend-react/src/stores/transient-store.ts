/**
 * Transient Store — Valtio proxy cho UI state thay đổi nhanh (60fps).
 * 
 * ĐÂY LÀ P0-0.1: Tách Transient State khỏi Zustand.
 * 
 * Valtio dùng Proxy-based reactivity: chỉ re-render component nào
 * subscribe đúng field bị thay đổi, KHÔNG re-render toàn bộ tree
 * như Zustand khi gọi set().
 * 
 * Dùng `useSnapshot(transientState)` trong React component.
 * Dùng `transientState.xxx` trực tiếp (mutate) trong event handlers / animation loops.
 */

import { proxy, useSnapshot } from 'valtio';

// --- Transient UI State ---
export const transientState = proxy({
    /** Playhead position (seconds). Updated 60fps during playback. */
    cursorTime: 0,

    /** Whether user is dragging the playhead / scrubbing. */
    isScrubbing: false,

    /** Whether timeline is playing. */
    isPlaying: false,

    /** Auto-keyframe toggle. */
    isAutoKeyframeEnabled: false,

    /** Character currently being edited in nested composition mode. null = main scene. */
    activeEditTargetId: null as string | null,
});

// --- Actions (direct mutations on proxy) ---

export function setCursorTime(time: number | ((prev: number) => number)) {
    if (typeof time === 'function') {
        transientState.cursorTime = time(transientState.cursorTime);
    } else {
        transientState.cursorTime = time;
    }
}

export function setScrubbing(val: boolean) {
    transientState.isScrubbing = val;
}

export function setPlaying(val: boolean) {
    transientState.isPlaying = val;
}

export function toggleAutoKeyframe() {
    transientState.isAutoKeyframeEnabled = !transientState.isAutoKeyframeEnabled;
}

export function setActiveEditTargetId(id: string | null) {
    transientState.activeEditTargetId = id;
}

// --- React Hook ---

/**
 * Hook to subscribe to transient state in React components.
 * Only re-renders when accessed fields change.
 * 
 * Usage:
 * ```
 * const snap = useTransientSnapshot();
 * // snap.cursorTime, snap.isPlaying, etc.
 * ```
 */
export function useTransientSnapshot() {
    return useSnapshot(transientState);
}
