import { useEffect, useState, useRef, useCallback } from 'react';

/**
 * Performance optimization hooks for AnimeStudio
 */

/**
 * Debounce hook - delays value update
 * Use for: search inputs, filter inputs, resize handlers
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
    const [debouncedValue, setDebouncedValue] = useState<T>(value);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedValue(value), delay);
        return () => clearTimeout(timer);
    }, [value, delay]);

    return debouncedValue;
}

/**
 * Throttle hook - limits update frequency
 * Use for: scroll handlers, mouse move, playhead updates
 */
export function useThrottle<T>(value: T, interval: number = 100): T {
    const [throttledValue, setThrottledValue] = useState<T>(value);
    const lastUpdateRef = useRef<number>(0);

    useEffect(() => {
        const now = performance.now();
        if (now - lastUpdateRef.current >= interval) {
            setThrottledValue(value);
            lastUpdateRef.current = now;
        } else {
            const timer = setTimeout(() => {
                setThrottledValue(value);
                lastUpdateRef.current = performance.now();
            }, interval - (now - lastUpdateRef.current));
            return () => clearTimeout(timer);
        }
    }, [value, interval]);

    return throttledValue;
}

/**
 * RequestAnimationFrame hook for smooth animations
 * Use for: playhead updates, scrubbing
 */
export function useRafCallback(callback: (time: number) => void) {
    const callbackRef = useRef(callback);
    const rafIdRef = useRef<number | null>(null);

    useEffect(() => {
        callbackRef.current = callback;
    }, [callback]);

    useEffect(() => {
        const loop = (time: number) => {
            callbackRef.current(time);
            rafIdRef.current = requestAnimationFrame(loop);
        };

        rafIdRef.current = requestAnimationFrame(loop);
        return () => {
            if (rafIdRef.current !== null) {
                cancelAnimationFrame(rafIdRef.current);
            }
        };
    }, []);

    return rafIdRef.current;
}

/**
 * Intersection Observer hook for lazy loading
 * Use for: lazy loading images, infinite scroll
 */
export function useIntersectionObserver<T extends Element>(
    options: IntersectionObserverInit = {}
) {
    const [isIntersecting, setIsIntersecting] = useState(false);
    const ref = useRef<T | null>(null);

    useEffect(() => {
        if (!ref.current) return;

        const observer = new IntersectionObserver(([entry]) => {
            setIsIntersecting(entry.isIntersecting);
        }, options);

        observer.observe(ref.current);
        return () => observer.disconnect();
    }, [options]);

    return [ref, isIntersecting] as const;
}

/**
 * Memoize array items for React.memo lists
 * Use for: preventing unnecessary re-renders in lists
 */
export function useStableArray<T>(array: T[]): T[] {
    const ref = useRef<T[]>(array);

    if (array.length !== ref.current.length ||
        array.some((item, i) => item !== ref.current[i])) {
        ref.current = array;
    }

    return ref.current;
}

/**
 * Cache expensive computations
 * Use for: filtering, sorting, transforming large datasets
 */
export function useCachedValue<T, D>(
    value: T,
    compute: (value: T) => D,
    deps: any[] = []
): D {
    const cacheRef = useRef<Map<string, { value: T; result: D }>>(new Map());

    const key = JSON.stringify(deps);

    const cached = cacheRef.current.get(key);
    if (cached && cached.value === value) {
        return cached.result;
    }

    const result = compute(value);
    cacheRef.current.set(key, { value, result });

    // Limit cache size
    if (cacheRef.current.size > 100) {
        const firstKey = cacheRef.current.keys().next().value;
        if (firstKey !== undefined) {
            cacheRef.current.delete(firstKey);
        }
    }

    return result;
}

/**
 * Track previous value
 * Use for: animations, transitions
 */
export function usePrevious<T>(value: T): T | undefined {
    const ref = useRef<T | undefined>(undefined);

    useEffect(() => {
        ref.current = value;
    }, [value]);

    return ref.current;
}

/**
 * Detect if component is mounted
 * Use for: preventing state updates on unmounted components
 */
export function useMounted() {
    const mountedRef = useRef(false);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    return mountedRef;
}

/**
 * Safe state update (prevents updates on unmounted components)
 */
export function useSafeState<S>(initialState: S | (() => S)) {
    const [state, setState] = useState(initialState);
    const mountedRef = useMounted();

    const setSafeState = useCallback((newState: S | ((prev: S) => S)) => {
        if (!mountedRef.current) return;
        setState(newState);
    }, [mountedRef]);

    return [state, setSafeState] as const;
}
