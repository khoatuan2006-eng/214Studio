import React, { useEffect, useRef } from 'react';
import { useStudioStore, type StudioLayer } from '@/stores/useStudioStore';

interface StageTransformerProps {
    layer: StudioLayer;
    scale: number; // The current zoom scale of the 1920x1080 stage
}

type TransformAction =
    | 'none'
    | 'drag'
    | 'scale-tl' | 'scale-tr' | 'scale-bl' | 'scale-br'
    | 'rotate';

export const StageTransformer: React.FC<StageTransformerProps> = ({ layer, scale }) => {
    const layers = useStudioStore(s => s.layers);
    const updateLayer = useStudioStore(s => s.updateLayer);
    const setSelectedLayer = useStudioStore(s => s.setSelectedLayer);

    const stateRef = useRef<{
        action: TransformAction;
        startX: number;
        startY: number;
        origX: number;
        origY: number;
        origWidth: number;
        origHeight: number;
        origRotation: number;
        groupInitialStates?: Array<{ id: string, x: number, y: number, width: number, height: number, rotation: number }>;
    }>({
        action: 'none',
        startX: 0, startY: 0,
        origX: 0, origY: 0,
        origWidth: 0, origHeight: 0,
        origRotation: 0
    });

    useEffect(() => {
        const handlePointerMove = (e: PointerEvent) => {
            const state = stateRef.current;
            if (state.action === 'none') return;
            e.preventDefault();

            // Delta in standard canvas pixels (ignoring zoom scale)
            const deltaX = (e.clientX - state.startX) / scale;
            const deltaY = (e.clientY - state.startY) / scale;

            const applyUpdateGroup = (newX: number, newY: number, newWidth: number, newHeight: number) => {
                const shouldGroup = !!layer.characterId && !e.shiftKey;
                const scaleX = state.origWidth ? newWidth / state.origWidth : 1;
                const scaleY = state.origHeight ? newHeight / state.origHeight : 1;

                if (shouldGroup) {
                    layers.forEach(l => {
                        if (l.characterId === layer.characterId) {
                            const initL = state.groupInitialStates.find(g => g.id === l.id);
                            if (initL) {
                                // Scale position relative to anchor's original top-left point
                                const dx = initL.x - state.origX;
                                const dy = initL.y - state.origY;
                                
                                updateLayer(l.id, {
                                    x: newX + dx * scaleX,
                                    y: newY + dy * scaleY,
                                    width: initL.width * scaleX,
                                    height: initL.height * scaleY
                                });
                            }
                        }
                    });
                } else {
                    updateLayer(layer.id, {
                        x: newX,
                        y: newY,
                        width: newWidth,
                        height: newHeight
                    });
                }
            };

            if (state.action === 'drag') {
                applyUpdateGroup(
                    state.origX + deltaX,
                    state.origY + deltaY,
                    state.origWidth,
                    state.origHeight
                );
            } else if (state.action.startsWith('scale')) {
                // Simplify scaling: non-rotational bounding box direct mathematical mapping
                // OpenCut uses matrix projections, but for 2D UI this is purely algebraic
                let newX = state.origX;
                let newY = state.origY;
                let newWidth = state.origWidth;
                let newHeight = state.origHeight;

                // Lock aspect ratio scaling by default 
                // For Anime Characters, uniform aspect ratio is mandatory!
                const aspectRatio = state.origWidth / state.origHeight;
                let isUniform = true;

                if (state.action === 'scale-br') {
                    newWidth = Math.max(10, state.origWidth + deltaX);
                    if (isUniform) newHeight = newWidth / aspectRatio;
                } else if (state.action === 'scale-bl') {
                    newWidth = Math.max(10, state.origWidth - deltaX);
                    if (isUniform) newHeight = newWidth / aspectRatio;
                    newX = state.origX + (state.origWidth - newWidth);
                } else if (state.action === 'scale-tr') {
                    newWidth = Math.max(10, state.origWidth + deltaX);
                    if (isUniform) newHeight = newWidth / aspectRatio;
                    newY = state.origY + (state.origHeight - newHeight);
                } else if (state.action === 'scale-tl') {
                    newWidth = Math.max(10, state.origWidth - deltaX);
                    if (isUniform) newHeight = newWidth / aspectRatio;
                    newX = state.origX + (state.origWidth - newWidth);
                    newY = state.origY + (state.origHeight - newHeight);
                }

                applyUpdateGroup(newX, newY, newWidth, newHeight);
            } else if (state.action === 'rotate') {
                // Determine origin point (center of the layer)
                const cx = state.origX + state.origWidth / 2;
                const cy = state.origY + state.origHeight / 2;

                // Mouse absolute position mapped to canvas
                // Rotate whole character group mathematically using Orbital Math (Trigonometry)
                const rotationDelta = deltaX * 0.5; // Simple drag-to-rotate
                const newRotation = state.origRotation + rotationDelta;
                const rotDiffRad = rotationDelta * (Math.PI / 180);
                
                const pivotX = state.origX + state.origWidth / 2;
                const pivotY = state.origY + state.origHeight / 2;

                if (layer.characterId) {
                    layers.filter(l => l.characterId === layer.characterId).forEach(l => {
                        const initL = state.groupInitialStates.find(g => g.id === l.id);
                        if (initL) {
                            const initCenterX = initL.x + initL.width / 2;
                            const initCenterY = initL.y + initL.height / 2;
                            
                            const dx = initCenterX - pivotX;
                            const dy = initCenterY - pivotY;
                            
                            const rotatedDx = dx * Math.cos(rotDiffRad) - dy * Math.sin(rotDiffRad);
                            const rotatedDy = dx * Math.sin(rotDiffRad) + dy * Math.cos(rotDiffRad);
                            
                            updateLayer(l.id, { 
                                x: pivotX + rotatedDx - initL.width / 2,
                                y: pivotY + rotatedDy - initL.height / 2,
                                rotation: initL.rotation + rotationDelta 
                            });
                        }
                    });
                } else {
                    updateLayer(layer.id, {
                        rotation: newRotation
                    });
                }
            }
        };

        const handlePointerUp = () => {
            if (stateRef.current.action !== 'none') {
                stateRef.current.action = 'none';
            }
        };

        window.addEventListener('pointermove', handlePointerMove, { passive: false });
        window.addEventListener('pointerup', handlePointerUp);

        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
        };
    }, [scale, layer.id, updateLayer]);

    const startAction = (e: React.PointerEvent, action: TransformAction) => {
        e.stopPropagation();
        setSelectedLayer(layer.id);

        const el = e.currentTarget as HTMLElement;
        el.setPointerCapture(e.pointerId);

        const groupInitialStates = layers
            .filter(l => l.characterId === layer.characterId)
            .map(l => ({
                id: l.id,
                x: l.x,
                y: l.y,
                width: l.width,
                height: l.height,
                rotation: l.rotation || 0
            }));

        stateRef.current = {
            action,
            startX: e.clientX,
            startY: e.clientY,
            origX: layer.x,
            origY: layer.y,
            origWidth: layer.width,
            origHeight: layer.height,
            origRotation: layer.rotation || 0,
            groupInitialStates
        };
    };

    // UI Constants
    const HandleDot = ({ action, style }: { action: TransformAction, style: React.CSSProperties }) => (
        <div
            onPointerDown={(e) => startAction(e, action)}
            style={{
                position: 'absolute',
                width: 14, height: 14,
                backgroundColor: 'white',
                border: '2px solid #6366f1',
                borderRadius: '50%',
                pointerEvents: 'auto',
                boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                ...style
            }}
        />
    );

    return (
        <div
            style={{
                position: 'absolute',
                left: layer.x,
                top: layer.y,
                width: layer.width,
                height: layer.height,
                transform: `rotate(${layer.rotation || 0}deg)`,
                pointerEvents: 'none',
                zIndex: layer.zIndex + 1,
                border: '1.5px solid #6366f1',
                boxShadow: '0 0 15px rgba(99,102,241,0.5)',
            }}
        >
            {/* Draggable Surface Array */}
            <div
                onPointerDown={(e) => startAction(e, 'drag')}
                style={{
                    position: 'absolute',
                    inset: 0,
                    pointerEvents: 'auto',
                    cursor: 'move',
                    background: 'transparent'
                }}
            />

            {/* Corner Handles & Rotation */}
            <>
                <HandleDot action="scale-tl" style={{ left: -7, top: -7, cursor: 'nwse-resize' }} />
                <HandleDot action="scale-tr" style={{ right: -7, top: -7, cursor: 'nesw-resize' }} />
                <HandleDot action="scale-bl" style={{ left: -7, bottom: -7, cursor: 'nesw-resize' }} />
                <HandleDot action="scale-br" style={{ right: -7, bottom: -7, cursor: 'nwse-resize' }} />

                <div style={{ position: 'absolute', left: '50%', top: -24, width: 1, height: 24, backgroundColor: '#6366f1' }} />
                <HandleDot action="rotate" style={{ left: 'calc(50% - 7px)', top: -30, cursor: 'crosshair', borderRadius: '4px' }} />
            </>
        </div>
    );
};
