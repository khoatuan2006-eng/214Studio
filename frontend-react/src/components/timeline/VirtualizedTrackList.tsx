import React, { useMemo, useCallback } from 'react';
import { TimelineTrackContent } from './timeline-track';
import type { TimelineTrack as TimelineTrackType } from '@/types/timeline';
import type { SnapPoint } from '@/lib/timeline/snap-utils';
import type { ElementDragState } from '@/types/timeline';

interface VirtualizedTrackListProps {
    tracks: TimelineTrackType[];
    zoomLevel: number;
    dragState: ElementDragState;
    rulerScrollRef: React.RefObject<HTMLDivElement | null>;
    tracksScrollRef: React.RefObject<HTMLDivElement | null>;
    lastMouseXRef: React.RefObject<number>;
    scrollTop: number;
    containerHeight: number;
    onSnapPointChange?: (snapPoint: SnapPoint | null) => void;
    onResizeStateChange?: (params: { isResizing: boolean }) => void;
    onElementMouseDown: (params: {
        event: React.MouseEvent;
        element: TimelineTrackType['elements'][0];
        track: TimelineTrackType;
    }) => void;
    onElementClick: (params: {
        event: React.MouseEvent;
        element: TimelineTrackType['elements'][0];
        track: TimelineTrackType;
    }) => void;
    onTrackMouseDown?: (event: React.MouseEvent) => void;
    onTrackClick?: (event: React.MouseEvent) => void;
    shouldIgnoreClick?: () => boolean;
}

// Constants
const TRACK_HEIGHT = 48; // px - must match CSS
const BUFFER = 5; // Render extra tracks above/below viewport for smooth scrolling

/**
 * Virtualized Track List
 * Only renders tracks visible in viewport + buffer
 * Performance: O(1) regardless of total tracks count
 */
export function VirtualizedTrackList({
    tracks,
    zoomLevel,
    dragState,
    rulerScrollRef,
    tracksScrollRef,
    lastMouseXRef,
    scrollTop,
    containerHeight,
    onSnapPointChange,
    onResizeStateChange,
    onElementMouseDown,
    onElementClick,
    onTrackMouseDown,
    onTrackClick,
    shouldIgnoreClick,
}: VirtualizedTrackListProps) {
    // Calculate visible range with memoization
    const { visibleTracks, startIndex, totalHeight, offsetY } = useMemo(() => {
        // Calculate how many tracks fit in viewport
        const visibleCount = Math.ceil(containerHeight / TRACK_HEIGHT);
        
        // Calculate start index based on scroll position
        const start = Math.floor(scrollTop / TRACK_HEIGHT);
        
        // Add buffer above and below for smooth scrolling
        const bufferedStart = Math.max(0, start - BUFFER);
        const bufferedEnd = Math.min(tracks.length, start + visibleCount + BUFFER);
        
        // Slice only visible tracks
        const visible = tracks.slice(bufferedStart, bufferedEnd);
        
        // Calculate total height for scrollbar
        const total = tracks.length * TRACK_HEIGHT;
        
        // Calculate offset for positioning
        const offset = bufferedStart * TRACK_HEIGHT;
        
        return {
            visibleTracks: visible,
            startIndex: bufferedStart,
            totalHeight: total,
            offsetY: offset,
        };
    }, [tracks, scrollTop, containerHeight]);

    // Memoized track renderer
    const renderTrack = useCallback((track: TimelineTrackType, index: number) => {
        const actualIndex = startIndex + index;
        
        return (
            <div
                key={track.id}
                style={{
                    height: TRACK_HEIGHT,
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    transform: `translateY(${index * TRACK_HEIGHT}px)`,
                    willChange: 'transform', // Hint for GPU acceleration
                }}
            >
                <TimelineTrackContent
                    track={track}
                    zoomLevel={zoomLevel}
                    dragState={dragState}
                    rulerScrollRef={rulerScrollRef}
                    tracksScrollRef={tracksScrollRef}
                    lastMouseXRef={lastMouseXRef}
                    onSnapPointChange={onSnapPointChange}
                    onResizeStateChange={onResizeStateChange}
                    onElementMouseDown={onElementMouseDown}
                    onElementClick={onElementClick}
                    onTrackMouseDown={onTrackMouseDown}
                    onTrackClick={onTrackClick}
                    shouldIgnoreClick={shouldIgnoreClick}
                />
            </div>
        );
    }, [
        zoomLevel,
        dragState,
        rulerScrollRef,
        tracksScrollRef,
        lastMouseXRef,
        onSnapPointChange,
        onResizeStateChange,
        onElementMouseDown,
        onElementClick,
        onTrackMouseDown,
        onTrackClick,
        shouldIgnoreClick,
        startIndex,
    ]);

    return (
        <div
            style={{
                height: totalHeight,
                position: 'relative',
                minHeight: '100%',
            }}
        >
            <div
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    transform: `translateY(${offsetY}px)`,
                    willChange: 'transform',
                }}
            >
                {visibleTracks.map((track, index) => renderTrack(track, index))}
            </div>
        </div>
    );
}

// Export constants for use in parent components
export { TRACK_HEIGHT, BUFFER };
