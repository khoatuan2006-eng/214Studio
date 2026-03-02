import React from 'react';
import { RotateCw, GripVertical } from 'lucide-react';

interface TransformHandleProps {
    position: 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
    onHandleMouseDown: (e: React.MouseEvent, position: string) => void;
    rotation?: number;
    showRotationHandle?: boolean;
    onRotateMouseDown?: (e: React.MouseEvent) => void;
    anchorX?: number;
    anchorY?: number;
    onAnchorMouseDown?: (e: React.MouseEvent) => void;
}

/**
 * Enhanced Transform Handles
 * - Larger handles (10px)
 * - Rotation handle outside bounding box
 * - Visible anchor point
 * - Better visual design
 */
export function TransformHandles({
    position,
    onHandleMouseDown,
    rotation = 0,
    showRotationHandle = true,
    onRotateMouseDown,
    anchorX = 0.5,
    anchorY = 0.5,
    onAnchorMouseDown,
}: TransformHandleProps) {
    // Handle positions relative to bounding box
    const handlePositions = {
        nw: { top: 0, left: 0, cursor: 'nw-resize' },
        n: { top: 0, left: '50%', cursor: 'n-resize' },
        ne: { top: 0, right: 0, cursor: 'ne-resize' },
        e: { top: '50%', right: 0, cursor: 'e-resize' },
        se: { bottom: 0, right: 0, cursor: 'se-resize' },
        s: { bottom: 0, left: '50%', cursor: 's-resize' },
        sw: { bottom: 0, left: 0, cursor: 'sw-resize' },
        w: { top: '50%', left: 0, cursor: 'w-resize' },
    };

    const handleStyle: React.CSSProperties = {
        position: 'absolute',
        width: '10px',
        height: '10px',
        backgroundColor: '#ffffff',
        border: '2px solid #6366f1',
        borderRadius: '2px',
        transform: 'translate(-50%, -50%)',
        cursor: 'crosshair',
        zIndex: 100,
        transition: 'all 0.1s ease',
    };

    const rotationHandleStyle: React.CSSProperties = {
        position: 'absolute',
        top: '-40px',
        left: '50%',
        width: '24px',
        height: '24px',
        backgroundColor: '#6366f1',
        border: '2px solid #ffffff',
        borderRadius: '50%',
        transform: 'translate(-50%, -50%)',
        cursor: 'grab',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.1s ease',
    };

    const anchorStyle: React.CSSProperties = {
        position: 'absolute',
        width: '12px',
        height: '12px',
        backgroundColor: '#f59e0b',
        border: '2px solid #ffffff',
        borderRadius: '50%',
        transform: 'translate(-50%, -50%)',
        cursor: 'move',
        zIndex: 100,
        transition: 'all 0.1s ease',
    };

    return (
        <>
            {/* Corner and Edge Handles */}
            {(Object.keys(handlePositions) as Array<keyof typeof handlePositions>).map((pos) => (
                <div
                    key={pos}
                    style={{
                        ...handleStyle,
                        ...handlePositions[pos],
                    }}
                    onMouseDown={(e) => onHandleMouseDown(e, pos)}
                    className="transform-handle hover:scale-125 hover:bg-indigo-400 transition-all"
                    title={`Resize ${pos}`}
                />
            ))}

            {/* Rotation Handle */}
            {showRotationHandle && onRotateMouseDown && (
                <>
                    {/* Rotation Line */}
                    <div
                        style={{
                            position: 'absolute',
                            top: '-30px',
                            left: '50%',
                            width: '2px',
                            height: '30px',
                            backgroundColor: '#6366f1',
                            transform: 'translateX(-50%)',
                            zIndex: 99,
                        }}
                    />
                    
                    {/* Rotation Handle */}
                    <div
                        style={rotationHandleStyle}
                        onMouseDown={onRotateMouseDown}
                        className="rotation-handle hover:scale-110 hover:bg-indigo-500 transition-all"
                        title="Rotate"
                    >
                        <RotateCw className="w-4 h-4 text-white" />
                    </div>
                </>
            )}

            {/* Anchor Point */}
            {onAnchorMouseDown && (
                <div
                    style={{
                        ...anchorStyle,
                        left: `${anchorX * 100}%`,
                        top: `${anchorY * 100}%`,
                    }}
                    onMouseDown={onAnchorMouseDown}
                    className="anchor-point hover:scale-125 hover:bg-amber-500 transition-all"
                    title="Anchor Point (drag to change transform origin)"
                >
                    <GripVertical className="w-3 h-3 text-white" />
                </div>
            )}
        </>
    );
}

interface BoundingBoxProps {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation?: number;
    isSelected?: boolean;
    onHandleMouseDown?: (e: React.MouseEvent, position: string) => void;
    onRotateMouseDown?: (e: React.MouseEvent) => void;
    onAnchorMouseDown?: (e: React.MouseEvent) => void;
    anchorX?: number;
    anchorY?: number;
    showHandles?: boolean;
}

/**
 * Bounding Box with Transform Handles
 */
export function BoundingBox({
    x,
    y,
    width,
    height,
    rotation = 0,
    isSelected = true,
    onHandleMouseDown,
    onRotateMouseDown,
    onAnchorMouseDown,
    anchorX = 0.5,
    anchorY = 0.5,
    showHandles = true,
}: BoundingBoxProps) {
    if (!isSelected) return null;

    const boundingBoxStyle: React.CSSProperties = {
        position: 'absolute',
        left: x,
        top: y,
        width,
        height,
        transform: `rotate(${rotation}deg)`,
        transformOrigin: `${anchorX * 100}% ${anchorY * 100}%`,
        pointerEvents: 'none', // Allow clicks to pass through
        zIndex: 1000,
    };

    return (
        <div style={boundingBoxStyle}>
            {/* Bounding Box Border */}
            <div
                style={{
                    position: 'absolute',
                    inset: 0,
                    border: '2px solid #6366f1',
                    pointerEvents: 'none',
                }}
            />

            {/* Transform Handles */}
            {showHandles && (
                <TransformHandles
                    position="nw"
                    onHandleMouseDown={onHandleMouseDown || (() => {})}
                    rotation={rotation}
                    showRotationHandle={true}
                    onRotateMouseDown={onRotateMouseDown || undefined}
                    anchorX={anchorX}
                    anchorY={anchorY}
                    onAnchorMouseDown={onAnchorMouseDown || undefined}
                />
            )}
        </div>
    );
}
