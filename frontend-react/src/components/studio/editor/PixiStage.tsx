import React, { useState, useEffect, useMemo } from 'react';
import { Application, extend } from '@pixi/react';
import * as PIXI from 'pixi.js';
import type { StudioLayer } from '@/stores/useStudioStore';

// CRITICAL FIX: React Pixi V8 requires explicit extension of PIXI components to bypass tree-shaking
extend({
    Container: PIXI.Container,
    Sprite: PIXI.Sprite,
    Graphics: PIXI.Graphics
});

// CRITICAL FIX: Add typing bypasses for lower-case intrinsic PixiJS v8 components in React 19
declare global {
    namespace JSX {
        interface IntrinsicElements {
            sprite: any;
            container: any;
            graphics: any;
        }
    }
}

interface PixiStageProps {
    layers: StudioLayer[];
    onSelectLayer: (id: string | null) => void;
}

const PixiLayer: React.FC<{ layer: StudioLayer; onSelect: () => void }> = ({ layer, onSelect }) => {
    const [texture, setTexture] = useState<PIXI.Texture | null>(null);

    useEffect(() => {
        let isMounted = true;
        PIXI.Assets.load(layer.sourceUrl).then((tex: PIXI.Texture) => {
            if (!isMounted) return;
            
            if (layer.cropX !== undefined && layer.cropY !== undefined && layer.origWidth && layer.origHeight) {
                try {
                    // Critical fix: If the texture is already the exact size of the crop box, it means 
                    // the backend already sent a pre-cropped PNG. Applying a frame with high X/Y offsets 
                    // will sample transparent pixels out-of-bounds, rendering the image invisible!
                    const isAlreadyCropped = Math.abs(tex.source.width - layer.origWidth) < 2 && Math.abs(tex.source.height - layer.origHeight) < 2;
                    
                    if (isAlreadyCropped) {
                        setTexture(tex);
                    } else {
                        const frame = new PIXI.Rectangle(layer.cropX, layer.cropY, layer.origWidth, layer.origHeight);
                        const croppedTex = new PIXI.Texture({ source: tex.source, frame });
                        setTexture(croppedTex);
                    }
                } catch (e) {
                    console.error("Failed to crop texture", e);
                    setTexture(tex);
                }
            } else {
                setTexture(tex);
            }
        }).catch(err => console.error("Failed to load texture", layer.sourceUrl, err));

        return () => { isMounted = false; };
    }, [layer.sourceUrl, layer.cropX, layer.cropY, layer.origWidth, layer.origHeight]);

    // Apply multiple fragment shaders (Filters) via PixiJS natively
    const filters = useMemo(() => {
        const arr: PIXI.Filter[] = [];
        if (layer.blur && layer.blur > 0) {
            arr.push(new PIXI.BlurFilter({ strength: layer.blur, quality: 4 })); // High quality gaussian
        }
        
        if (layer.brightness !== undefined || layer.contrast !== undefined || layer.grayscale !== undefined) {
            const colorMatrix = new PIXI.ColorMatrixFilter();
            if (layer.brightness !== undefined) colorMatrix.brightness(layer.brightness, false);
            if (layer.contrast !== undefined) colorMatrix.contrast(layer.contrast, false);
            if (layer.grayscale !== undefined) colorMatrix.greyscale(layer.grayscale, false);
            arr.push(colorMatrix);
        }
        return arr;
    }, [layer.blur, layer.brightness, layer.contrast, layer.grayscale]);

    if (!texture) return null;

    // Note: Pixi uses Radians for rotation
    const rotationRad = (layer.rotation || 0) * (Math.PI / 180);

    return (
        <container zIndex={layer.zIndex ?? 0}>
            <sprite
                texture={texture}
                x={layer.x}
                y={layer.y}
                width={layer.width}
                height={layer.height}
                rotation={rotationRad}
                alpha={layer.opacity ?? 1}
                eventMode="static"
                pointerdown={(e: any) => {
                    e.stopPropagation();
                    onSelect();
                }}
            />
        </container>
    );
};

export const PixiStage: React.FC<PixiStageProps> = ({ layers, onSelectLayer }) => {
    // Sort layers by zIndex so Pixi renders them correctly
    const sortedLayers = [...layers].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

    return (
        <Application 
            width={1920} 
            height={1080} 
            backgroundAlpha={0}
            antialias={true}
            resolution={window.devicePixelRatio || 1}
            autoDensity={true}
        >
            <container 
                sortableChildren={true}
                eventMode="static" 
                pointerdown={() => onSelectLayer(null)}
            >
                {sortedLayers.map(l => (
                    <PixiLayer 
                        key={l.id} 
                        layer={l} 
                        onSelect={() => onSelectLayer(l.id)} 
                    />
                ))}
            </container>
        </Application>
    );
};
