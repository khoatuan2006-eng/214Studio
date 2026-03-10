/**
 * renderScene — Shared Canvas2D rendering engine
 *
 * Used by BOTH PreviewCanvas (800×450) and Export (1920×1080).
 * All input coordinates are in SCENE SPACE (1920×1080).
 * The function maps everything to the target canvas dimensions internally.
 *
 * KEY DESIGN: No CSS, no DOM — pure Canvas2D math.
 * Preview and Export call this with different (W, H), everything else is identical.
 */
import type { PreviewTrack } from './types';
import { getInterpolatedPos, getInterpolatedZIndex, getInterpolatedScale, getInterpolatedRotation } from './types';
import type { CharacterNodeData } from '@/stores/useWorkflowStore';

// ── Types ──

export interface CameraKf {
    id: string;
    time: number;
    x: number;
    y: number;
    zoom: number;
    easing: string;
}

export interface CameraExportData {
    keyframes: CameraKf[];
    viewportWidth: number;   // output resolution (px)
    viewportHeight: number;  // output resolution (px)
    fov: number;             // field of view width in units
}

export interface SceneLayer {
    id: string;
    source: 'image' | 'video' | 'fla';
    type?: 'background' | 'foreground' | 'prop';
    label: string;
    assetUrl: string;
    posX: number;
    posY: number;
    zIndex: number;
    width: number;
    height: number;
    opacity: number;
    rotation: number;
    blur: number;
}

export interface RenderSceneParams {
    ctx: CanvasRenderingContext2D;
    W: number;               // canvas width (800 or 1920)
    H: number;               // canvas height (450 or 1080)
    time: number;             // current playback time in seconds
    tracks: PreviewTrack[];
    backgroundImg: HTMLImageElement | null;
    backgroundBlur: number;
    overlayLayers: SceneLayer[];
    cameraData: CameraExportData | null;
    charNodeDataMap: Map<string, CharacterNodeData>;
    imageCache: Map<string, HTMLImageElement>;
    ppu: number;             // Pixels Per Unit from Scene
    showLabels?: boolean;    // Show z-index labels (preview only, not export)
}

// ── Constants ──
const SCENE_W = 1920;
const SCENE_H = 1080;

// ── Easing ──
function camEase(t: number, type: string): number {
    switch (type) {
        case 'easeIn': return t * t;
        case 'easeOut': return t * (2 - t);
        case 'easeInOut': return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        default: return t;
    }
}

// ── Camera interpolation (keyframes in UNITS, output in PIXELS via ppu) ──
function getCameraAt(t: number, cameraData: CameraExportData | null, ppu: number) {
    if (!cameraData || !cameraData.keyframes || cameraData.keyframes.length === 0) {
        return { x: SCENE_W / 2, y: SCENE_H / 2, zoom: 1, fovPx: SCENE_W, hasCamera: false };
    }
    const kfs = cameraData.keyframes;
    const fovUnits = cameraData.fov || (SCENE_W / ppu);
    const fovPx = fovUnits * ppu;  // FOV width in pixels

    const fromKf = (kf: typeof kfs[0]) => ({
        x: kf.x * ppu,   // units → pixels
        y: kf.y * ppu,   // units → pixels
        zoom: kf.zoom,
        fovPx,
        hasCamera: true,
    });

    if (t <= kfs[0].time) return fromKf(kfs[0]);
    if (t >= kfs[kfs.length - 1].time) return fromKf(kfs[kfs.length - 1]);

    let prev = kfs[0], next = kfs[1];
    for (let i = 0; i < kfs.length - 1; i++) {
        if (t >= kfs[i].time && t < kfs[i + 1].time) {
            prev = kfs[i]; next = kfs[i + 1]; break;
        }
    }
    const seg = next.time - prev.time;
    const p = seg > 0 ? (t - prev.time) / seg : 0;
    const e = camEase(p, next.easing);
    return {
        x: (prev.x + (next.x - prev.x) * e) * ppu,
        y: (prev.y + (next.y - prev.y) * e) * ppu,
        zoom: prev.zoom + (next.zoom - prev.zoom) * e,
        fovPx,
        hasCamera: true,
    };
}

// ── Frame lookup ──
function getFrameAtTime(track: PreviewTrack, t: number) {
    let elapsed = 0;
    for (const frame of track.frames) {
        if (t >= elapsed && t < elapsed + frame.duration) return frame;
        elapsed += frame.duration;
    }
    return track.frames.length > 0 ? track.frames[track.frames.length - 1] : null;
}

// ── Draw object-cover (image fills target area, crops excess) ──
function drawObjectCover(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    dx: number, dy: number, dw: number, dh: number
) {
    const imgAR = img.naturalWidth / img.naturalHeight;
    const boxAR = dw / dh;
    let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
    if (imgAR > boxAR) {
        sw = img.naturalHeight * boxAR;
        sx = (img.naturalWidth - sw) / 2;
    } else {
        sh = img.naturalWidth / boxAR;
        sy = (img.naturalHeight - sh) / 2;
    }
    ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

// ══════════════════════════════════════════════════════════════
// ██  MAIN RENDER FUNCTION
// ══════════════════════════════════════════════════════════════

export function renderScene({
    ctx, W, H, time, tracks, backgroundImg, backgroundBlur,
    overlayLayers, cameraData, charNodeDataMap, imageCache, ppu,
    showLabels = true,
}: RenderSceneParams): void {
    //
    // STRATEGY: Apply a global transform so we can work in scene space (1920×1080).
    // After ctx.scale(sx, sy), all coordinates are scene pixels → canvas auto-maps.
    //
    const sx = W / SCENE_W;
    const sy = H / SCENE_H;

    // ── 1. Clear (in canvas space, before global transform) ──
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#111118';
    ctx.fillRect(0, 0, W, H);

    // ── 2. Global scene-to-canvas transform ──
    ctx.save();
    ctx.scale(sx, sy);
    // NOW: all drawing coordinates are in scene space (1920×1080)!

    // ── 3. Camera transform (unit-based → pixel conversion via ppu) ──
    const cam = getCameraAt(time, cameraData, ppu);
    ctx.save();
    if (cam.hasCamera) {
        ctx.translate(SCENE_W / 2, SCENE_H / 2);
        // Separate X/Y FOV scales to handle different camera aspect ratios.
        // The global transform ctx.scale(W/SCENE_W, H/SCENE_H) is non-uniform
        // when canvas aspect ≠ scene aspect. We compensate here so the combined
        // global+camera transform is uniform (no distortion).
        const cameraAspect = cameraData
            ? (cameraData.viewportWidth || 1920) / (cameraData.viewportHeight || 1080)
            : (SCENE_W / SCENE_H);
        const fovScaleX = SCENE_W / cam.fovPx;
        const fovScaleY = SCENE_H * cameraAspect / cam.fovPx;
        ctx.scale(cam.zoom * fovScaleX, cam.zoom * fovScaleY);
        ctx.translate(-cam.x, -cam.y);
    }

    // ── 4. Background image (fills entire scene) ──
    if (backgroundImg) {
        ctx.save();
        if (backgroundBlur > 0) ctx.filter = `blur(${backgroundBlur}px)`;
        drawObjectCover(ctx, backgroundImg, 0, 0, SCENE_W, SCENE_H);
        ctx.restore();
    }

    // ── 5. UNIFIED Z-INDEX: Characters + ALL overlay layers ──
    // ALL elements (characters + stage layers) are combined into one draw list
    // sorted by zIndex. No type-based split — z-index determines stacking order.
    type DrawItem =
        | { kind: 'character'; zIndex: number; track: typeof tracks[0]; charData: CharacterNodeData | undefined }
        | { kind: 'overlay'; zIndex: number; layer: SceneLayer };

    const drawList: DrawItem[] = [];

    // Add characters (z-index animated via keyframes)
    for (const track of tracks) {
        const charData = charNodeDataMap.get(track.nodeId);
        const z = charData ? getInterpolatedZIndex(charData, time) : 10;
        drawList.push({ kind: 'character', zIndex: z, track, charData });
    }

    // Add ALL overlay layers (background, foreground, prop — all use z-index)
    for (const ol of overlayLayers) {
        drawList.push({ kind: 'overlay', zIndex: ol.zIndex, layer: ol });
    }

    // Sort by zIndex (lower = behind, higher = in front)
    drawList.sort((a, b) => a.zIndex - b.zIndex);

    // Character rendering constants
    const CHAR_CONTAINER = 960;

    // Draw everything in unified z-order
    for (const item of drawList) {
        if (item.kind === 'overlay') {
            // ── Stage overlay layer ──
            const ol = item.layer;
            const img = imageCache.get(ol.assetUrl);
            if (!img) continue;

            ctx.save();
            ctx.globalAlpha = ol.opacity;
            if (ol.blur > 0) ctx.filter = `blur(${ol.blur}px)`;

            ctx.translate(ol.posX, ol.posY);
            ctx.rotate((ol.rotation * Math.PI) / 180);

            const drawW = ol.width || 960;
            const drawH = ol.height || 540;
            ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);

            ctx.restore();
        } else {
            // ── Character track ──
            const { track, charData } = item;
            const frame = getFrameAtTime(track, time);
            if (!frame) continue;

            let posX: number, posY: number;
            if (charData) {
                const pos = getInterpolatedPos(charData, time);
                posX = pos.x;
                posY = pos.y;
            } else {
                let frameElapsed = 0, frameProgress = 0;
                for (const f of track.frames) {
                    if (time >= frameElapsed && time < frameElapsed + f.duration) {
                        frameProgress = (time - frameElapsed) / f.duration; break;
                    }
                    frameElapsed += f.duration;
                }
                posX = frame.startX + (frame.endX - frame.startX) * frameProgress;
                posY = frame.startY + (frame.endY - frame.startY) * frameProgress;
            }

            ctx.save();
            ctx.globalAlpha = frame.opacity;

            const charScale = charData ? getInterpolatedScale(charData, time) : frame.scale;
            const charRotation = charData ? getInterpolatedRotation(charData, time) : 0;
            const scaleFactor = charScale / SCENE_W;

            // Apply rotation around character foot position
            if (charRotation !== 0) {
                ctx.translate(posX, posY);
                ctx.rotate((charRotation * Math.PI) / 180);
                ctx.translate(-posX, -posY);
            }

            // Apply horizontal flip
            if (charData?.flipX) {
                ctx.translate(posX, 0);
                ctx.scale(-1, 1);
                ctx.translate(-posX, 0);
            }

            const sorted = [...frame.layerImages].sort((a, b) => a.zIndex - b.zIndex);
            for (const layer of sorted) {
                const img = imageCache.get(layer.url);
                if (!img) continue;

                const natW = img.naturalWidth;
                const natH = img.naturalHeight;

                const fitRatio = Math.min(CHAR_CONTAINER / natW, CHAR_CONTAINER / natH);
                const fitW = natW * fitRatio;
                const fitH = natH * fitRatio;

                const drawW = fitW * scaleFactor;
                const drawH = fitH * scaleFactor;

                const containerH = CHAR_CONTAINER * scaleFactor;
                const drawX = posX - drawW / 2;
                const drawY = posY - containerH + (containerH - drawH) / 2;

                ctx.drawImage(img, drawX, drawY, drawW, drawH);
            }

            // ── Z-Index label above character (preview only) ──
            if (showLabels) {
                const currentZ = item.zIndex;
                const containerH = CHAR_CONTAINER * scaleFactor;
                const labelY = posY - containerH - 8;
                const labelText = `z${currentZ}`;
                ctx.font = 'bold 14px monospace';
                const textW = ctx.measureText(labelText).width;
                const padX = 5, padY = 3;
                ctx.fillStyle = 'rgba(6, 182, 212, 0.7)';
                const bx = posX - textW / 2 - padX;
                const by = labelY - 14 - padY;
                const bw = textW + padX * 2;
                const bh = 14 + padY * 2;
                ctx.beginPath();
                if (ctx.roundRect) {
                    ctx.roundRect(bx, by, bw, bh, 4);
                } else {
                    ctx.rect(bx, by, bw, bh);
                }
                ctx.fill();
                ctx.fillStyle = '#fff';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                ctx.fillText(labelText, posX, labelY);
            }

            ctx.restore();
        }
    }

    // ── 7. Close camera transform ──
    ctx.restore();

    // ── 8. Close global scene transform ──
    ctx.restore();
}
