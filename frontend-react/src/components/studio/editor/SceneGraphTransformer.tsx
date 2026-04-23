import React, { useRef, useEffect } from 'react';
import Moveable from 'react-moveable';
import { useSceneGraphStore } from '@/stores/useSceneGraphStore';

const PPU = 100;

export const SceneGraphTransformer: React.FC<{ scale: number }> = ({ scale }) => {
    const selectedBlock = useSceneGraphStore(s => s.selectedBlock);
    const scenes = useSceneGraphStore(s => s.scenes);
    const isAutoKeyframe = useSceneGraphStore(s => s.isAutoKeyframe);
    const localTime = useSceneGraphStore(s => s.localTime);
    const snapshot = useSceneGraphStore(s => s.snapshot);

    const targetRef = useRef<HTMLDivElement>(null);
    const isDragging = useRef(false);
    
    // Internal accumulator to avoid React state lag during rapid dragging
    const trRef = useRef({ x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 });

    const scene = selectedBlock ? scenes.find(s => s.id === selectedBlock.sceneId) : null;
    const snap = selectedBlock ? snapshot[selectedBlock.nodeId] : null;
    const lockedNodes = useSceneGraphStore(s => s.lockedNodes);
    const isLocked = selectedBlock ? lockedNodes.has(selectedBlock.nodeId) : false;

    // Sync from store when NOT dragging
    useEffect(() => {
        if (!isDragging.current && snap) {
            trRef.current = {
                x: snap.x,
                y: snap.y,
                scaleX: snap.scaleX ?? 1,
                scaleY: snap.scaleY ?? 1,
                rotation: snap.rotation ?? 0
            };
        }
    }, [snap?.x, snap?.y, snap?.scaleX, snap?.scaleY, snap?.rotation]);

    if (!selectedBlock || !scene || !snap) return null;

    // Handle updates based on Auto-Keyframe check
    const handleUpdate = (patch: any) => {
        if (isAutoKeyframe) {
            if (patch.x !== undefined) scene.manager.addKeyframe(selectedBlock.nodeId, 'x', { time: localTime, value: patch.x, easing: 'linear' });
            if (patch.y !== undefined) scene.manager.addKeyframe(selectedBlock.nodeId, 'y', { time: localTime, value: patch.y, easing: 'linear' });
            if (patch.scaleX !== undefined) {
                scene.manager.addKeyframe(selectedBlock.nodeId, 'scale_x', { time: localTime, value: patch.scaleX, easing: 'linear' });
            }
            if (patch.scaleY !== undefined) {
                scene.manager.addKeyframe(selectedBlock.nodeId, 'scale_y', { time: localTime, value: patch.scaleY, easing: 'linear' });
            }
            if (patch.rotation !== undefined) {
                scene.manager.addKeyframe(selectedBlock.nodeId, 'rotation', { time: localTime, value: patch.rotation, easing: 'linear' });
            }
            useSceneGraphStore.getState().evaluate(); // Trigger reactivity
        } else {
            scene.manager.updateTransform(selectedBlock.nodeId, patch);
        }
    };

    // Calculate dimensions
    const px = trRef.current.x * PPU;
    const py = trRef.current.y * PPU;
    
    // Base dimensions before scale
    let w = 200;
    let h = 200;
    let anchorY = 0.5;

    if (snap.nodeType === 'text') {
        w = 400; 
        h = 100;
        anchorY = 1.0; // Text is usually bottom anchored
    } else if (snap.nodeType === 'character') {
        w = 300; 
        h = 600;
        anchorY = 0.85; // SceneRenderer character anchor is 0.85
    }

    return (
        <>
            {/* Global Styles for Moveable */}
            <style>{`
                .moveable-control-box {
                    --moveable-color: #6366f1 !important; /* premium indigo */
                    z-index: 100 !important;
                }
                .moveable-line {
                    background: #6366f1 !important;
                    box-shadow: 0 0 10px rgba(99,102,241,0.5);
                }
                .moveable-control {
                    background: white !important;
                    border: 2px solid #6366f1 !important;
                    box-shadow: 0 0 5px rgba(0,0,0,0.3);
                }
            `}</style>

            {/* Phantom Target for Moveable to attach to */}
            <div
                ref={targetRef}
                style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    width: `${w}px`,
                    height: `${h}px`,
                    transformOrigin: `50% ${anchorY * 100}%`,
                    transform: `translate(${px - w/2}px, ${py - h * anchorY}px) rotate(${trRef.current.rotation}deg) scale(${trRef.current.scaleX}, ${trRef.current.scaleY})`,
                    // Make it invisible, Moveable will draw the interactive lines
                    opacity: 0, 
                    pointerEvents: 'none'
                }}
            />

            <Moveable
                target={targetRef}
                zoom={1 / scale}
                
                // Allow Drag (disabled when locked)
                draggable={!isLocked}
                onDragStart={() => isDragging.current = true}
                onDrag={({ delta }) => {
                    trRef.current.x += delta[0] / PPU;
                    trRef.current.y += delta[1] / PPU;
                    handleUpdate({ x: trRef.current.x, y: trRef.current.y });
                }}
                onDragEnd={() => isDragging.current = false}

                // Allow Scale (disabled when locked)
                resizable={false}
                scalable={!isLocked}
                keepRatio={false}
                onScaleStart={() => isDragging.current = true}
                onScale={({ delta, drag }) => {
                    trRef.current.scaleX *= delta[0];
                    trRef.current.scaleY *= delta[1];
                    
                    if (drag.delta[0] || drag.delta[1]) {
                        trRef.current.x += drag.delta[0] / PPU;
                        trRef.current.y += drag.delta[1] / PPU;
                    }

                    handleUpdate({ 
                        scaleX: trRef.current.scaleX, 
                        scaleY: trRef.current.scaleY,
                        x: trRef.current.x,
                        y: trRef.current.y
                    });
                }}
                onScaleEnd={() => isDragging.current = false}

                // Allow Rotate (disabled when locked)
                rotatable={!isLocked}
                onRotateStart={() => isDragging.current = true}
                onRotate={({ delta, drag }) => {
                    trRef.current.rotation += delta;
                    
                    if (drag.delta[0] || drag.delta[1]) {
                        trRef.current.x += drag.delta[0] / PPU;
                        trRef.current.y += drag.delta[1] / PPU;
                    }

                    handleUpdate({ 
                        rotation: trRef.current.rotation,
                        x: trRef.current.x,
                        y: trRef.current.y
                    });
                }}
                onRotateEnd={() => isDragging.current = false}

                /* Visual Configuration */
                renderDirections={isLocked ? [] : ["nw","n","ne","w","e","sw","s","se"]}
                edge={false}
            />
            
            {/* Locked indicator */}
            {isLocked && (
                <div 
                    className="absolute text-white text-[10px] px-2 py-0.5 rounded font-bold whitespace-nowrap shadow-[0_0_10px_rgba(245,158,11,0.5)]"
                    style={{
                        left: px,
                        top: py - (h * anchorY) - 30,
                        transform: 'translateX(-50%)',
                        background: 'linear-gradient(90deg, #f59e0b, #d97706)'
                    }}
                >
                    🔒 LOCKED
                </div>
            )}

            {/* Auto Keyframe glowing indicator */}
            {isAutoKeyframe && !isLocked && (
                <div 
                    className="absolute text-white text-[10px] px-2 py-0.5 rounded font-bold whitespace-nowrap shadow-[0_0_10px_rgba(239,68,68,0.8)] animate-pulse"
                    style={{
                        left: px,
                        top: py - (h * anchorY) - 30,
                        transform: 'translateX(-50%)',
                        background: 'linear-gradient(90deg, #ef4444, #b91c1c)'
                    }}
                >
                    🔴 AUTO-KEYFRAME BINDING
                </div>
            )}
        </>
    );
};
