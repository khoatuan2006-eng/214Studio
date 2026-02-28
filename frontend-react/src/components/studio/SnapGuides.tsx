import React from 'react';
import { useTransform } from '../../hooks/use-editor-core';

interface SnapGuidesProps {
    canvasScale: number;
    zoomScale: number;
    stagePos: { x: number; y: number };
}

/**
 * SnapGuides (DOM Overlay)
 * 
 * Renders magnetic snapping lines as absolute-positioned DIVs.
 * Much faster than Konva lines during high-frequency dragging.
 */
export const SnapGuides: React.FC<SnapGuidesProps> = ({ canvasScale, zoomScale, stagePos }) => {
    const { smartGuides } = useTransform();
    const physicalScale = canvasScale * zoomScale;

    if (smartGuides.length === 0) return null;

    return (
        <div className="absolute inset-0 pointer-events-none z-[60]">
            {smartGuides.map((guide, i) => {
                const pos = guide.position * physicalScale + (guide.type === 'vertical' ? stagePos.x : stagePos.y);

                return (
                    <div
                        key={i}
                        className="absolute bg-indigo-500 shadow-[0_0_4px_rgba(99,102,241,0.5)]"
                        style={{
                            left: guide.type === 'vertical' ? pos : 0,
                            top: guide.type === 'vertical' ? 0 : pos,
                            width: guide.type === 'vertical' ? 1.5 : '100%',
                            height: guide.type === 'vertical' ? '100%' : 1.5,
                            transition: 'opacity 0.1s ease-out'
                        }}
                    />
                );
            })}
        </div>
    );
};
