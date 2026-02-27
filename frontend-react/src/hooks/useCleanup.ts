/**
 * 18.3: Memory Leak Prevention Hooks
 * 
 * Custom React hooks to ensure proper cleanup of:
 * - Zustand store subscriptions
 * - Konva node event listeners and refs  
 * - Image objects and object URLs
 * - Animation frames and timers
 */

import { useEffect, useRef, useCallback } from 'react';

/**
 * Track and auto-cleanup Zustand store subscriptions on unmount.
 * 
 * Usage:
 *   const addCleanup = useStoreCleanup();
 *   const unsub = useAppStore.subscribe(listener);
 *   addCleanup(unsub);
 */
export function useStoreCleanup() {
    const cleanupFns = useRef<Array<() => void>>([]);

    useEffect(() => {
        return () => {
            // eslint-disable-next-line react-hooks/exhaustive-deps
            cleanupFns.current.forEach(fn => {
                try { fn(); } catch { /* ignore cleanup errors */ }
            });
            cleanupFns.current = [];
        };
    }, []);

    const addCleanup = useCallback((fn: () => void) => {
        cleanupFns.current.push(fn);
    }, []);

    return addCleanup;
}

/**
 * Auto-cleanup a ref map of Konva nodes on unmount.
 * Destroys nodes and clears the ref to prevent dangling references.
 * 
 * Usage:
 *   const nodeRefs = useRef<Record<string, Konva.Node>>({});
 *   useKonvaCleanup(nodeRefs);
 */
export function useKonvaCleanup(
    ...refs: React.RefObject<Record<string, any> | null>[]
) {
    useEffect(() => {
        return () => {
            refs.forEach(ref => {
                if (ref.current) {
                    Object.values(ref.current).forEach((node: any) => {
                        try {
                            if (node && typeof node.destroy === 'function') {
                                node.off(); // Remove all event listeners
                                node.destroy();
                            }
                        } catch { /* node may already be destroyed */ }
                    });
                    ref.current = {};
                }
            });
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
}

/**
 * Track Image objects and object URLs for proper cleanup.
 * Prevents memory leaks from unreleased image bitmaps and blob URLs.
 * 
 * Usage:
 *   const { trackImage, trackObjectURL } = useImageCache();
 *   const img = new Image();
 *   trackImage(img);
 *   const url = URL.createObjectURL(blob);
 *   trackObjectURL(url);
 */
export function useImageCache() {
    const images = useRef<Set<HTMLImageElement>>(new Set());
    const objectURLs = useRef<Set<string>>(new Set());

    useEffect(() => {
        return () => {
            // eslint-disable-next-line react-hooks/exhaustive-deps
            images.current.forEach(img => {
                img.src = ''; // Release image data
                img.onload = null;
                img.onerror = null;
            });
            images.current.clear();

            // eslint-disable-next-line react-hooks/exhaustive-deps
            objectURLs.current.forEach(url => {
                try { URL.revokeObjectURL(url); } catch { /* ignore */ }
            });
            objectURLs.current.clear();
        };
    }, []);

    const trackImage = useCallback((img: HTMLImageElement) => {
        images.current.add(img);
    }, []);

    const trackObjectURL = useCallback((url: string) => {
        objectURLs.current.add(url);
    }, []);

    const releaseObjectURL = useCallback((url: string) => {
        try { URL.revokeObjectURL(url); } catch { /* ignore */ }
        objectURLs.current.delete(url);
    }, []);

    return { trackImage, trackObjectURL, releaseObjectURL };
}

/**
 * Safely manage requestAnimationFrame with auto-cancel on unmount.
 * 
 * Usage:
 *   const requestFrame = useAnimationFrame();
 *   requestFrame(() => { ... });
 */
export function useAnimationFrame() {
    const frameId = useRef<number>(0);

    useEffect(() => {
        return () => {
            if (frameId.current) {
                cancelAnimationFrame(frameId.current);
            }
        };
    }, []);

    const requestFrame = useCallback((callback: FrameRequestCallback) => {
        if (frameId.current) {
            cancelAnimationFrame(frameId.current);
        }
        frameId.current = requestAnimationFrame(callback);
    }, []);

    return requestFrame;
}
