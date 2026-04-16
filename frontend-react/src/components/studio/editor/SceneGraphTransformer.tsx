import React, { useRef, useEffect } from 'react';
import { useSceneGraphStore } from '@/stores/useSceneGraphStore';

const PPU = 100;

export const SceneGraphTransformer: React.FC<{ scale: number }> = ({ scale }) => {
    const selectedBlock = useSceneGraphStore(s => s.selectedBlock);
    const scenes = useSceneGraphStore(s => s.scenes);
    const isAutoKeyframe = useSceneGraphStore(s => s.isAutoKeyframe);
    const localTime = useSceneGraphStore(s => s.localTime);
    const snapshot = useSceneGraphStore(s => s.snapshot);

    const isDragging = useRef(false);
    const startPos = useRef({ x: 0, y: 0 });
    const startNodePos = useRef({ x: 0, y: 0 });

    if (!selectedBlock) return null;

    const scene = scenes.find(s => s.id === selectedBlock.sceneId);
    if (!scene) return null;

    const snap = snapshot[selectedBlock.nodeId];
    if (!snap) return null;

    // Use current snapshot bounds if available (camera parallax might mess this up, 
    // but for simple characters it works well enough, or we fallback to pure transform)
    const px = snap.x * PPU;
    const py = snap.y * PPU;
    
    // Approximate bounds for character or text
    let w = 200;
    let h = 200;
    if (snap.nodeType === 'text') {
        w = 400; h = 100;
    } else if (snap.nodeType === 'character') {
        w = 300 * Math.abs(snap.scaleX || 1);
        h = 500 * Math.abs(snap.scaleY || 1);
    }

    const handlePointerDown = (e: React.PointerEvent) => {
        if (e.button !== 0) return; // Only left click
        e.stopPropagation();
        e.preventDefault();
        
        isDragging.current = true;
        // The coordinates are in the 1920x1080 space because this component is inside the scaled div,
        // but clientX/Y are screen space. We need to divide by the viewer's scale to get local movement.
        startPos.current = { x: e.clientX, y: e.clientY };
        startNodePos.current = { x: snap.x, y: snap.y };
        
        const handlePointerMove = (ev: PointerEvent) => {
            if (!isDragging.current) return;
            ev.preventDefault();

            const dx = (ev.clientX - startPos.current.x) / scale / PPU;
            const dy = (ev.clientY - startPos.current.y) / scale / PPU;

            const newX = startNodePos.current.x + dx;
            const newY = startNodePos.current.y + dy;

            if (isAutoKeyframe) {
                // Auto keyframe creates continuous keyframes
                scene.manager.addKeyframe(selectedBlock.nodeId, 'x', { time: localTime, value: newX, easing: 'linear' });
                scene.manager.addKeyframe(selectedBlock.nodeId, 'y', { time: localTime, value: newY, easing: 'linear' });
                useSceneGraphStore.getState().evaluate(); // Trigger reactivity
            } else {
                // Modify base transform
                scene.manager.updateTransform(selectedBlock.nodeId, { x: newX, y: newY });
            }
        };

        const handlePointerUp = (ev: PointerEvent) => {
            isDragging.current = false;
            document.removeEventListener('pointermove', handlePointerMove);
            document.removeEventListener('pointerup', handlePointerUp);
        };

        document.addEventListener('pointermove', handlePointerMove);
        document.addEventListener('pointerup', handlePointerUp);
    };

    return (
        <div
            style={{
                position: 'absolute',
                left: px,
                top: py,
                width: w,
                height: h,
                transform: `translate(-50%, -100%)`, // Characters are bottom-anchored usually, but SceneRenderer uses pivot 0,0 ? Wait. SceneRenderer sets `app.stage` or characters... Actually Characters in SceneRenderer don't change anchor.
                pointerEvents: 'auto',
                cursor: 'move',
            }}
            onPointerDown={handlePointerDown}
        >
            <div className="absolute inset-0 border-2 border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.5)]">
                {/* 4 Corner Handles */}
                <div className="absolute w-3 h-3 bg-white border-2 border-indigo-500 pointer-events-none" style={{ top: -6, left: -6 }} />
                <div className="absolute w-3 h-3 bg-white border-2 border-indigo-500 pointer-events-none" style={{ top: -6, right: -6 }} />
                <div className="absolute w-3 h-3 bg-white border-2 border-indigo-500 pointer-events-none" style={{ bottom: -6, left: -6 }} />
                <div className="absolute w-3 h-3 bg-white border-2 border-indigo-500 pointer-events-none" style={{ bottom: -6, right: -6 }} />
            </div>
            
            {/* Auto Keyframe glowing indicator */}
            {isAutoKeyframe && (
                <div className="absolute -top-6 bg-red-500 text-white text-[10px] px-2 py-0.5 rounded font-bold whitespace-nowrap shadow-[0_0_10px_rgba(239,68,68,0.8)] animate-pulse">
                    🔴 Auto-KF ON
                </div>
            )}
        </div>
    );
};
