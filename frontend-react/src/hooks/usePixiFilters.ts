import React, { useEffect, useRef } from 'react';
import * as PIXI from 'pixi.js';
import { createPixiFilter } from '@/utils/filter-utils';
import { useAppStore } from '@/store/useAppStore';
import type { FilterConfig } from '@/store/useAppStore';

/**
 * Custom hook to apply filters to a PixiJS display object
 */
export function usePixiFilters(filters: FilterConfig[]) {
    const displayObjectRef = useRef<PIXI.Container | null>(null);

    useEffect(() => {
        if (!displayObjectRef.current) return;

        const enabledFilters = filters.filter(f => f.enabled);

        if (enabledFilters.length === 0) {
            displayObjectRef.current.filters = null;
            return;
        }

        // Combine ColorMatrixFilters for better performance
        const colorMatrixFilters: PIXI.ColorMatrixFilter[] = [];
        const otherFilters: PIXI.Filter[] = [];

        for (const filter of enabledFilters) {
            const pixiFilter = createPixiFilter(filter);
            if (!pixiFilter) continue;

            if (pixiFilter instanceof PIXI.ColorMatrixFilter) {
                colorMatrixFilters.push(pixiFilter);
            } else {
                otherFilters.push(pixiFilter);
            }
        }

        // Combine all color matrix filters into one
        let combinedColorMatrix: PIXI.ColorMatrixFilter | null = null;
        if (colorMatrixFilters.length > 0) {
            // Use the last color matrix filter (most recent adjustments)
            combinedColorMatrix = colorMatrixFilters[colorMatrixFilters.length - 1];
            otherFilters.unshift(combinedColorMatrix);
        }

        displayObjectRef.current.filters = otherFilters.length > 0 ? otherFilters : null;

    }, [filters]);

    return displayObjectRef;
}

/**
 * HOC to wrap a PixiJS component with filter support
 */
export function withFilters<P extends object>(
    Component: React.ComponentType<P>,
    trackIdProp: keyof P
) {
    return function WithFiltersComponent(props: P) {
        const trackId = props[trackIdProp] as string | undefined;
        const editorData = useAppStore((s: any) => s.editorData);
        const track = editorData.find((t: any) => t.id === trackId);
        const filters = track?.filters ?? [];

        const ref = useRef<PIXI.Container | null>(null);

        useEffect(() => {
            if (!ref.current || filters.length === 0) {
                if (ref.current) ref.current.filters = null;
                return;
            }

            const enabledFilters = filters.filter((f: FilterConfig) => f.enabled);
            if (enabledFilters.length === 0) {
                ref.current.filters = null;
                return;
            }

            const pixiFilters: PIXI.Filter[] = [];
            let combinedColorMatrix: PIXI.ColorMatrixFilter | null = null;

            for (const filter of enabledFilters) {
                const pixiFilter = createPixiFilter(filter);
                if (!pixiFilter) continue;

                if (pixiFilter instanceof PIXI.ColorMatrixFilter) {
                    combinedColorMatrix = pixiFilter;
                } else {
                    pixiFilters.push(pixiFilter);
                }
            }

            if (combinedColorMatrix) {
                pixiFilters.unshift(combinedColorMatrix);
            }

            ref.current.filters = pixiFilters.length > 0 ? pixiFilters : null;

        }, [filters, trackId]);

        return React.createElement(Component, { ...props, ref });
    };
}
