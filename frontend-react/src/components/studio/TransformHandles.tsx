import React, { useEffect, useRef } from 'react';
import { RotateCcw } from 'lucide-react';
import { EditorCore } from '../../core';
import { LOGICAL_WIDTH, LOGICAL_HEIGHT } from '../../constants/project-constants';

interface TransformHandlesProps {
    selectedId: string;
    editorData: any[];
    canvasScale: number;
    zoomScale: number;
    stagePos: { x: number, y: number };
    onTransientTransform: (id: string, values: any) => void;
    onTransformEnd: (id: string, values: any) => void;
}

/**
 * TransformHandles (DOM Overlay)
 * 
 * Replaces Konva's Transformer with a high-performance DOM-based UI.
 * Sub-pixel precision, CSS transitions, and zero canvas repaints.
 */
export const TransformHandles: React.FC<TransformHandlesProps> = ({
    selectedId,
    editorData,
    canvasScale,
    zoomScale,
    stagePos,
    onTransientTransform,
    onTransformEnd
}) => {
    const rect = useRef({ x: 0, y: 0, width: 200, height: 200, rotation: 0 });
    const isDragging = useRef(false);
    const startPos = useRef({ x: 0, y: 0 });
    const startLogical = useRef({ x: 0, y: 0, scale: 1, rotation: 0 }); // Logical values at start of drag
    const startRect = useRef({ x: 0, y: 0, width: 200, height: 200, rotation: 0 });
    const containerRef = useRef<HTMLDivElement>(null);

    const character = editorData.find(c => c.id === selectedId);

    // Sync with worker results for 60fps positioning
    useEffect(() => {
        const handleInterpolation = (e: any) => {
            if (!selectedId || isDragging.current) return;
            const charData = e.detail[selectedId];
            if (charData && containerRef.current) {
                const physicalScale = canvasScale * zoomScale;
                rect.current = {
                    x: charData.x * physicalScale + stagePos.x,
                    y: charData.y * physicalScale + stagePos.y,
                    width: 200 * charData.scaleX * physicalScale,
                    height: 200 * charData.scaleY * physicalScale,
                    rotation: charData.rotation
                };

                // Direct DOM update (bypass React)
                const el = containerRef.current;
                el.style.left = `${rect.current.x}px`;
                el.style.top = `${rect.current.y}px`;
                el.style.width = `${rect.current.width}px`;
                el.style.height = `${rect.current.height}px`;
                el.style.transform = `translate(-50%, -50%) rotate(${rect.current.rotation}deg)`;
            }
        };

        window.addEventListener('interpolation-results', handleInterpolation as EventListener);
        return () => window.removeEventListener('interpolation-results', handleInterpolation as EventListener);
    }, [selectedId, canvasScale, zoomScale, stagePos]);

    if (!selectedId || !character) return null;

    const handleMouseDown = (e: React.MouseEvent, type: string) => {
        e.stopPropagation();
        isDragging.current = true;
        startPos.current = { x: e.clientX, y: e.clientY };

        const core = EditorCore.getInstance();
        const transformManager = core.transform;

        const handleMouseMove = (mv: MouseEvent) => {
            import('../../utils/profiler').then(m => m.profiler.start());

            const dx = (mv.clientX - startPos.current.x) / (canvasScale * zoomScale);
            const dy = (mv.clientY - startPos.current.y) / (canvasScale * zoomScale);

            const physicalScale = canvasScale * zoomScale;
            let finalValues: any = {};

            if (type === 'move') {
                const targetX = startLogical.current.x + dx;
                const targetY = startLogical.current.y + dy;

                const snapping = transformManager.calculateSnap(targetX, targetY, LOGICAL_WIDTH, LOGICAL_HEIGHT);
                transformManager.setSmartGuides(snapping.guides);

                finalValues = { x: snapping.x, y: snapping.y };

                // Update local DOM instantly
                rect.current.x = finalValues.x * physicalScale + stagePos.x;
                rect.current.y = finalValues.y * physicalScale + stagePos.y;
            } else if (type === 'rotate') {
                const centerX = startRect.current.x;
                const centerY = startRect.current.y;
                const startAngle = Math.atan2(startPos.current.y - centerY, startPos.current.x - centerX);
                const currentAngle = Math.atan2(mv.clientY - centerY, mv.clientX - centerX);
                const deltaRotation = (currentAngle - startAngle) * 180 / Math.PI;

                finalValues = { rotation: startLogical.current.rotation + deltaRotation };
                rect.current.rotation = finalValues.rotation;
            } else if (['nw', 'ne', 'sw', 'se'].includes(type)) {
                // Pivot-based scaling
                const scaleX = 1 + (type.includes('e') ? dx : -dx) / 100;
                const scaleY = 1 + (type.includes('s') ? dy : -dy) / 100;
                const uniformScale = (Math.abs(scaleX) + Math.abs(scaleY)) / 2;

                finalValues = { scale: startLogical.current.scale * uniformScale };

                // Keep handles stable
                rect.current.width = 200 * finalValues.scale * physicalScale;
                rect.current.height = 200 * finalValues.scale * physicalScale;
            }

            // Sync DOM immediately
            if (containerRef.current) {
                const el = containerRef.current;
                el.style.left = `${rect.current.x}px`;
                el.style.top = `${rect.current.y}px`;
                el.style.width = `${rect.current.width}px`;
                el.style.height = `${rect.current.height}px`;
                el.style.transform = `translate(-50%, -50%) rotate(${rect.current.rotation}deg)`;
            }

            // Sync Konva immediately (bypassing React)
            onTransientTransform(selectedId, finalValues);

            import('../../utils/profiler').then(m => m.profiler.end('UI_Transform'));
        };

        // Initialize startRect for the drag session
        startRect.current = { ...rect.current };

        const handleMouseUp = () => {
            isDragging.current = false;
            transformManager.setSmartGuides([]);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);

            // Calculate final values one last time to commit
            const finalValues: any = {};
            if (type === 'move') {
                finalValues.x = (rect.current.x - stagePos.x) / (canvasScale * zoomScale);
                finalValues.y = (rect.current.y - stagePos.y) / (canvasScale * zoomScale);
            } else if (type === 'rotate') {
                finalValues.rotation = rect.current.rotation;
            } else if (['nw', 'ne', 'sw', 'se'].includes(type)) {
                finalValues.scale = rect.current.width / (200 * canvasScale * zoomScale);
            }

            onTransformEnd(selectedId, finalValues);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    return (
        <div
            ref={containerRef}
            className="absolute pointer-events-none z-50 transition-shadow duration-200"
            style={{
                left: rect.current.x,
                top: rect.current.y,
                width: rect.current.width,
                height: rect.current.height,
                transform: `translate(-50%, -50%) rotate(${rect.current.rotation}deg)`,
                border: '2px solid #6366f1',
                boxShadow: '0 0 20px rgba(99, 102, 241, 0.4), inset 0 0 15px rgba(99, 102, 241, 0.1)'
            }}
        >
            {/* P4-4.7: Professional Name Label */}
            <div className="absolute -top-10 left-1/2 -translate-x-1/2 px-3 py-1 bg-indigo-600 text-white text-[11px] font-bold rounded-full shadow-[0_4px_12px_rgba(99,102,241,0.5)] whitespace-nowrap uppercase tracking-widest animate-in fade-in slide-in-from-bottom-2 pointer-events-none">
                {character.name || 'Selected Item'}
            </div>
            {/* Corner Handles */}
            {['nw', 'ne', 'sw', 'se'].map(pos => (
                <div
                    key={pos}
                    onMouseDown={(e) => handleMouseDown(e, pos)}
                    className={`absolute w-3.5 h-3.5 bg-white border-2 border-indigo-500 rounded-sm pointer-events-auto hover:scale-125 hover:bg-indigo-50 transition-transform cursor-${pos === 'nw' || pos === 'se' ? 'nwse' : 'nesw'}-resize shadow-[0_0_8px_rgba(99,102,241,0.6)]`}
                    style={{
                        left: pos.includes('w') ? -7 : 'auto',
                        right: pos.includes('e') ? -7 : 'auto',
                        top: pos.includes('n') ? -7 : 'auto',
                        bottom: pos.includes('s') ? -7 : 'auto',
                    }}
                />
            ))}

            {/* Rotation Handle */}
            <div
                className="absolute -top-10 left-1/2 -translate-x-1/2 w-0.5 h-10 bg-indigo-500"
            >
                <div
                    onMouseDown={(e) => handleMouseDown(e, 'rotate')}
                    className="absolute -top-4 -left-3 w-7 h-7 bg-white border-2 border-indigo-500 rounded-full flex items-center justify-center pointer-events-auto hover:bg-indigo-50 hover:scale-110 transition-all cursor-alias shadow-lg"
                >
                    <RotateCcw className="w-3.5 h-3.5 text-indigo-600" />
                </div>
            </div>

            {/* Move Handle (Center) */}
            <div
                onMouseDown={(e) => handleMouseDown(e, 'move')}
                className="absolute inset-0 pointer-events-auto cursor-move"
            />
        </div>
    );
};
