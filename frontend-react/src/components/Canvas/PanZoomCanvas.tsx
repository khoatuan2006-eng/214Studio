import React, { useRef, useCallback, useEffect } from 'react';
import { useCanvasZoomStore } from '@/stores/canvas-zoom-store';

interface PanZoomCanvasProps {
    children: React.ReactNode;
    className?: string;
    contentWidth?: number;
    contentHeight?: number;
    onZoomChange?: (zoom: number) => void;
    onPanChange?: (x: number, y: number) => void;
}

/**
 * PanZoom Canvas Wrapper
 * Provides zoom and pan functionality for the preview canvas
 */
export function PanZoomCanvas({
    children,
    className = '',
    contentWidth = 1920,
    contentHeight = 1080,
    onZoomChange,
    onPanChange,
}: PanZoomCanvasProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const { zoom, panX, panY, setZoom, setPan } = useCanvasZoomStore();
    const isPanningRef = useRef(false);
    const lastMousePosRef = useRef({ x: 0, y: 0 });

    // Handle wheel zoom
    const handleWheel = useCallback((e: WheelEvent) => {
        e.preventDefault();
        
        if (e.ctrlKey || e.metaKey) {
            // Zoom with Ctrl/Cmd + Scroll
            const delta = e.deltaY > 0 ? -0.25 : 0.25;
            const newZoom = Math.max(0.25, Math.min(4.0, zoom + delta));
            setZoom(newZoom);
            onZoomChange?.(newZoom);
        } else {
            // Pan with scroll
            setPan(panX - e.deltaX, panY - e.deltaY);
            onPanChange?.(panX - e.deltaX, panY - e.deltaY);
        }
    }, [zoom, panX, panY, setZoom, setPan, onZoomChange, onPanChange]);

    // Handle mouse down for panning
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        // Middle click or Space + Click for panning
        if (e.button === 1 || (e.button === 0 && e.altKey)) {
            isPanningRef.current = true;
            lastMousePosRef.current = { x: e.clientX, y: e.clientY };
            e.preventDefault();
        }
    }, []);

    // Handle mouse move for panning
    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (!isPanningRef.current) return;
        
        const dx = e.clientX - lastMousePosRef.current.x;
        const dy = e.clientY - lastMousePosRef.current.y;
        
        setPan(panX + dx, panY + dy);
        onPanChange?.(panX + dx, panY + dy);
        
        lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    }, [panX, panY, setPan, onPanChange]);

    // Handle mouse up
    const handleMouseUp = useCallback(() => {
        isPanningRef.current = false;
    }, []);

    // Handle double click to reset
    const handleDoubleClick = useCallback(() => {
        setZoom(1.0);
        setPan(0, 0);
        onZoomChange?.(1.0);
        onPanChange?.(0, 0);
    }, [setZoom, setPan, onZoomChange, onPanChange]);

    // Attach wheel listener
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        container.addEventListener('wheel', handleWheel, { passive: false });
        return () => container.removeEventListener('wheel', handleWheel);
    }, [handleWheel]);

    return (
        <div
            ref={containerRef}
            className={`relative overflow-hidden ${className}`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onDoubleClick={handleDoubleClick}
            style={{
                cursor: isPanningRef.current ? 'grabbing' : 'default',
            }}
        >
            <div
                style={{
                    transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
                    transformOrigin: 'center center',
                    width: contentWidth,
                    height: contentHeight,
                    transition: isPanningRef.current ? 'none' : 'transform 0.1s ease-out',
                }}
            >
                {children}
            </div>

            {/* Zoom Level Indicator */}
            <div className="absolute bottom-4 right-4 bg-neutral-900/90 backdrop-blur px-3 py-1.5 rounded-lg text-xs text-neutral-400 border border-neutral-700 pointer-events-none">
                {Math.round(zoom * 100)}%
            </div>

            {/* Pan Hint */}
            {!isPanningRef.current && (
                <div className="absolute bottom-4 left-4 bg-neutral-900/90 backdrop-blur px-3 py-1.5 rounded-lg text-xs text-neutral-400 border border-neutral-700 pointer-events-none">
                    <kbd className="bg-neutral-800 px-1.5 py-0.5 rounded text-neutral-300">Alt</kbd>
                    <span className="ml-1.5">+ Drag to Pan</span>
                </div>
            )}
        </div>
    );
}
