/**
 * FLA Integration Utility
 *
 * Parses a .fla file using FLAParser, renders each layer to an offscreen canvas,
 * exports as PNG, uploads to /api/stages/upload, and returns StageLayer[] data.
 */
import { FLAParser } from './fla-parser';
import { FLARenderer } from './renderer';
import type { FLADocument, Layer as FLALayer } from './types';
import type { StageLayer } from '@/stores/useWorkflowStore';

const API_BASE_URL = 'http://127.0.0.1:8001';

export interface FLAImportProgress {
    phase: 'parsing' | 'rendering' | 'uploading';
    current: number;
    total: number;
    layerName?: string;
}

/**
 * Classify a FLA layer as background / foreground / prop.
 *
 * Uses the same heuristics as the research scripts:
 * 1. Name-based: keywords like bg, background, fg, foreground, 背景, 前景
 * 2. Position-based: if a layer covers >70% of the canvas height → background;
 *    if its center is in the top 30% → foreground; otherwise → prop
 * 3. Index-based fallback: last layer → background, first layer → foreground
 */
function classifyLayerType(
    layer: FLALayer,
    index: number,
    total: number,
    docWidth: number,
    docHeight: number,
): 'background' | 'foreground' | 'prop' {
    const n = layer.name.toLowerCase();

    // ── Name-based classification ──
    if (n.includes('bg') || n.includes('background') || n.includes('背景')) return 'background';
    if (n.includes('fg') || n.includes('foreground') || n.includes('前景')) return 'foreground';

    // ── Position-based classification (look at frame 0 elements) ──
    if (layer.frames.length > 0) {
        const frame0 = layer.frames[0];
        for (const el of frame0.elements) {
            if ('matrix' in el) {
                // Estimate element coverage using its matrix translation
                const tx = el.matrix.tx;
                const ty = el.matrix.ty;
                // If element is near full-canvas size, treat as background
                // (Scale a≈1 & d≈1 or larger, positioned near origin)
                const scaleX = Math.abs(el.matrix.a);
                const scaleY = Math.abs(el.matrix.d);
                if (scaleX >= 0.9 && scaleY >= 0.9 && Math.abs(tx) < docWidth * 0.15 && Math.abs(ty) < docHeight * 0.15) {
                    return 'background';
                }
                // If element center is in top 30% → foreground
                if (ty < docHeight * 0.3) {
                    return 'foreground';
                }
            }
        }
    }

    // ── Index-based fallback (matching research's _classifyLayerType) ──
    // In FLA layer order: top layer (index 0) is drawn last (highest),
    // bottom layer (last index) is drawn first (lowest / background)
    if (index === total - 1) return 'background';
    if (index === 0 && total > 1) return 'foreground';

    return 'prop';
}

function getCanvasBoundingBox(canvas: HTMLCanvasElement): [number, number, number, number] | null {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    const width = canvas.width;
    const height = canvas.height;
    const data = ctx.getImageData(0, 0, width, height).data;
    let minX = width, minY = height, maxX = 0, maxY = 0;
    let hasVisible = false;

    // Use a 32-bit view for faster scanning
    const data32 = new Uint32Array(data.buffer);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if ((data32[y * width + x] & 0xff000000) !== 0) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
                hasVisible = true;
            }
        }
    }
    if (!hasVisible) return null;
    return [minX, minY, maxX - minX + 1, maxY - minY + 1];
}

/**
 * Parse a .fla file and extract layers as StageLayer[].
 *
 * Flow:
 * 1. FLAParser.parse(file) → FLADocument
 * 2. For each visible layer at frame 0 → render to offscreen canvas → export PNG
 * 3. Upload PNG to /api/stages/upload
 * 4. Return StageLayer[] with sequential z-index and classified type
 */
export async function parseFLAToStageLayers(
    file: File,
    onProgress?: (progress: FLAImportProgress) => void,
): Promise<StageLayer[]> {
    // ── 1. Parse FLA ──
    onProgress?.({ phase: 'parsing', current: 0, total: 1 });

    const parser = new FLAParser();
    const doc: FLADocument = await parser.parse(file, (pct: unknown) => {
        onProgress?.({ phase: 'parsing', current: Math.round(Number(pct) * 100), total: 100 });
    });

    if (!doc.timelines.length) {
        throw new Error('FLA file has no timelines');
    }

    // Use the first timeline (main scene)
    const timeline = doc.timelines[0];
    const visibleLayers = timeline.layers.filter((layer, _idx) => {
        // Skip guide, folder, and camera layers
        if (layer.layerType === 'guide' || layer.layerType === 'folder' || layer.layerType === 'camera') return false;
        if (!layer.visible) return false;
        // Skip layers with no frames or no elements in frame 0
        if (!layer.frames.length) return false;
        const frame0 = layer.frames[0];
        if (!frame0.elements.length) return false;
        return true;
    }).reverse(); // Reverse: FLA stores top→bottom (fg first), we want bottom→top (bg first → z=0)

    if (!visibleLayers.length) {
        throw new Error('No visible layers with content found in FLA');
    }

    // ── 2. Render elements ──
    // Strategy: For layers with multiple elements at frame 0,
    // auto-split each element into a separate stage layer (like batch_export_fla.jsfl).
    // For single-element layers, render the whole layer as one stage layer.
    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = doc.width;
    offscreenCanvas.height = doc.height;

    const renderer = new FLARenderer(offscreenCanvas);
    await renderer.setDocument(doc, true); // skipResize = true for offscreen

    const allLayerIndices = timeline.layers.map((_, i) => i);
    const stageLayers: StageLayer[] = [];
    const scaleFactor = Math.min(1920 / doc.width, 1080 / doc.height);

    // Use transparent background for all layer PNGs so they stack correctly
    const origBg = doc.backgroundColor;
    doc.backgroundColor = 'rgba(0,0,0,0)';

    // Count total render items for progress
    let totalItems = 0;
    for (const layer of visibleLayers) {
        const frame0 = layer.frames[0];
        totalItems += Math.max(1, frame0.elements.length);
    }
    let currentItem = 0;

    for (let li = 0; li < visibleLayers.length; li++) {
        const layer = visibleLayers[li];
        const layerIndex = timeline.layers.indexOf(layer);
        const frame0 = layer.frames[0];
        const elementCount = frame0.elements.length;

        // Hide all layers except the current one
        const hiddenLayerSet = new Set(allLayerIndices.filter(i => i !== layerIndex));
        renderer.setHiddenLayers(hiddenLayerSet);

        // Determine if we should auto-split this layer
        const shouldSplit = elementCount > 1;

        if (shouldSplit) {
            // ── AUTO-SPLIT: render each element individually ──
            for (let ei = 0; ei < elementCount; ei++) {
                currentItem++;
                const el = frame0.elements[ei];

                // Build element label from libraryItemName (symbols) or fallback
                let elementLabel: string;
                if ('libraryItemName' in el && el.libraryItemName) {
                    // Use the last part of the library path as the name
                    const parts = el.libraryItemName.split('/');
                    elementLabel = parts[parts.length - 1];
                } else {
                    elementLabel = `${layer.name}_element_${ei + 1}`;
                }

                onProgress?.({
                    phase: 'rendering',
                    current: currentItem,
                    total: totalItems,
                    layerName: elementLabel,
                });

                // Hide all elements in this layer except the current one
                const hiddenEls = new Map<number, Set<number>>();
                const hideSet = new Set<number>();
                for (let j = 0; j < elementCount; j++) {
                    if (j !== ei) hideSet.add(j);
                }
                hiddenEls.set(layerIndex, hideSet);
                renderer.setHiddenElements(hiddenEls);

                // Render frame 0 with only this element visible
                renderer.renderFrame(0);

                const bbox = getCanvasBoundingBox(offscreenCanvas);
                if (!bbox) continue; // Skip completely transparent/empty element

                // Export to PNG blob
                const blob = await new Promise<Blob | null>((resolve) => {
                    offscreenCanvas.toBlob(resolve, 'image/png');
                });

                if (!blob || blob.size < 100) continue; // Skip empty

                // ── Upload ──
                onProgress?.({
                    phase: 'uploading',
                    current: currentItem,
                    total: totalItems,
                    layerName: elementLabel,
                });

                const safeName = `${file.name.replace(/\.fla$/i, '')}_${elementLabel.replace(/[^a-zA-Z0-9_-]/g, '_')}.png`;
                const formData = new FormData();
                formData.append('files', blob, safeName);

                try {
                    const res = await fetch(`${API_BASE_URL}/api/stages/upload`, {
                        method: 'POST',
                        body: formData,
                    });

                    if (res.ok) {
                        const data = await res.json();
                        if (data.uploaded?.length > 0) {
                            const uploaded = data.uploaded[0];

                            // Classify element type by position
                            let elType: 'background' | 'foreground' | 'prop' = 'prop';
                            if ('matrix' in el) {
                                const scaleX = Math.abs(el.matrix.a);
                                const scaleY = Math.abs(el.matrix.d);
                                if (scaleX >= 0.9 && scaleY >= 0.9 &&
                                    Math.abs(el.matrix.tx) < doc.width * 0.15 &&
                                    Math.abs(el.matrix.ty) < doc.height * 0.15) {
                                    elType = 'background';
                                } else if (el.matrix.ty < doc.height * 0.3) {
                                    elType = 'foreground';
                                }
                            }

                            // Each PNG is full-canvas-sized (doc.width × doc.height)
                            // with the element at its correct position baked in.
                            // Position at origin — no offset needed.
                            stageLayers.push({
                                id: `layer-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                                type: elType,
                                source: 'fla',
                                label: elementLabel,
                                assetPath: uploaded.path,
                                posX: 0,
                                posY: 0,
                                zIndex: currentItem - 1,
                                width: doc.width,
                                height: doc.height,
                                bbox: bbox,
                                opacity: layer.alphaPercent !== undefined ? layer.alphaPercent / 100 : 1,
                                rotation: 0,
                                blur: 0,
                                visible: true,
                            });
                        }
                    }
                } catch (err) {
                    console.warn(`Failed to upload element "${elementLabel}":`, err);
                }
            }
        } else {
            // ── SINGLE ELEMENT: render whole layer as before ──
            currentItem++;
            onProgress?.({
                phase: 'rendering',
                current: currentItem,
                total: totalItems,
                layerName: layer.name,
            });

            // Clear any element-level hiding
            // Clear any element-level hiding
            renderer.setHiddenElements(new Map());
            renderer.renderFrame(0);

            const bbox = getCanvasBoundingBox(offscreenCanvas);
            if (!bbox) continue; // Skip completely transparent layer

            const blob = await new Promise<Blob | null>((resolve) => {
                offscreenCanvas.toBlob(resolve, 'image/png');
            });

            if (!blob || blob.size < 100) continue;

            onProgress?.({
                phase: 'uploading',
                current: currentItem,
                total: totalItems,
                layerName: layer.name,
            });

            const safeName = `${file.name.replace(/\.fla$/i, '')}_${layer.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.png`;
            const formData = new FormData();
            formData.append('files', blob, safeName);

            try {
                const res = await fetch(`${API_BASE_URL}/api/stages/upload`, {
                    method: 'POST',
                    body: formData,
                });

                if (res.ok) {
                    const data = await res.json();
                    if (data.uploaded?.length > 0) {
                        const uploaded = data.uploaded[0];

                        const layerType = classifyLayerType(
                            layer, li, visibleLayers.length, doc.width, doc.height,
                        );

                        stageLayers.push({
                            id: `layer-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                            type: layerType,
                            source: 'fla',
                            label: layer.name,
                            assetPath: uploaded.path,
                            posX: 0,
                            posY: 0,
                            zIndex: currentItem - 1,
                            width: doc.width,
                            height: doc.height,
                            bbox: bbox,
                            opacity: layer.alphaPercent !== undefined ? layer.alphaPercent / 100 : 1,
                            rotation: 0,
                            blur: 0,
                            visible: true,
                        });
                    }
                }
            } catch (err) {
                console.warn(`Failed to upload layer "${layer.name}":`, err);
            }
        }
    }

    // Restore original background color & clean up
    doc.backgroundColor = origBg;
    offscreenCanvas.width = 0;
    offscreenCanvas.height = 0;

    return stageLayers;
}
