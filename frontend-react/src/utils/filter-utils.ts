import * as PIXI from 'pixi.js';
import type { FilterConfig } from '@/stores/useAppStore';

/**
 * Creates a PixiJS filter from a FilterConfig
 */
export function createPixiFilter(filter: FilterConfig): PIXI.Filter | null {
    switch (filter.type) {
        case 'brightness': {
            const value = (filter.settings.value as number ?? 100) / 100;
            const f = new PIXI.ColorMatrixFilter();
            f.brightness(value, false);
            return f;
        }

        case 'contrast': {
            const value = (filter.settings.value as number ?? 100) / 100;
            const f = new PIXI.ColorMatrixFilter();
            f.contrast(value, false);
            return f;
        }

        case 'saturation': {
            const value = (filter.settings.value as number ?? 100) / 100;
            const f = new PIXI.ColorMatrixFilter();
            f.saturate(value, false);
            return f;
        }

        case 'hue': {
            const angle = (filter.settings.angle as number ?? 0);
            const f = new PIXI.ColorMatrixFilter();
            f.hue(angle, false);
            return f;
        }

        case 'blur': {
            const amount = filter.settings.amount as number ?? 0;
            if (amount <= 0) return null;
            return new PIXI.BlurFilter({ strength: amount });
        }

        case 'sharpen': {
            const amount = filter.settings.amount as number ?? 0;
            if (amount <= 0) return null;
            // PixiJS doesn't have a built-in sharpen filter, we'll use a custom approach
            // For now, return null - can be extended with custom shader
            return null;
        }

        case 'sepia': {
            const f = new PIXI.ColorMatrixFilter();
            f.sepia(false);
            return f;
        }

        case 'grayscale': {
            const amount = (filter.settings.amount as number ?? 0) / 100;
            const f = new PIXI.ColorMatrixFilter();
            f.grayscale(amount, false);
            return f;
        }

        case 'invert': {
            const f = new PIXI.ColorMatrixFilter();
            f.negative(false);
            return f;
        }

        case 'vignette': {
            // Custom vignette effect would require a custom shader
            // For now, return null - can be extended
            return null;
        }

        case 'noise': {
            const amount = (filter.settings.amount as number ?? 0) / 100;
            if (amount <= 0) return null;
            // PixiJS doesn't have a built-in noise filter
            // Can be extended with custom shader
            return null;
        }

        default:
            return null;
    }
}

/**
 * Applies multiple filters to a display object
 * Filters are combined where possible (e.g., multiple ColorMatrixFilters)
 */
export function applyFiltersToDisplayObject(
    displayObject: PIXI.Container,
    filters: FilterConfig[]
) {
    if (!displayObject) return;

    const enabledFilters = filters.filter(f => f.enabled);
    if (enabledFilters.length === 0) {
        displayObject.filters = null;
        return;
    }

    const pixiFilters: PIXI.Filter[] = [];
    let combinedColorMatrix: PIXI.ColorMatrixFilter | null = null;

    for (const filter of enabledFilters) {
        const pixiFilter = createPixiFilter(filter);
        if (!pixiFilter) continue;

        // Combine ColorMatrixFilters into one for better performance
        if (pixiFilter instanceof PIXI.ColorMatrixFilter) {
            if (!combinedColorMatrix) {
                combinedColorMatrix = pixiFilter;
            } else {
                // Apply the new filter's matrix to the combined one
                combinedColorMatrix.matrix = pixiFilter.matrix;
            }
        } else {
            pixiFilters.push(pixiFilter);
        }
    }

    // Add the combined color matrix filter first
    if (combinedColorMatrix) {
        pixiFilters.unshift(combinedColorMatrix);
    }

    displayObject.filters = pixiFilters.length > 0 ? pixiFilters : null;
}

/**
 * Enhanced brightness using ColorMatrixFilter
 */
export function createBrightnessFilter(value: number): PIXI.ColorMatrixFilter {
    const filter = new PIXI.ColorMatrixFilter();
    // Brightness adjustment: multiply RGB channels
    const brightness = value / 100;
    filter.matrix = [
        brightness, 0, 0, 0, 0,
        0, brightness, 0, 0, 0,
        0, 0, brightness, 0, 0,
        0, 0, 0, 1, 0,
    ];
    return filter;
}
