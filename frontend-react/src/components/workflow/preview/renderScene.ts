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
import { getInterpolatedPos } from './types';
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
    type: 'background' | 'foreground' | 'prop';
    label: string;
    assetUrl: string;
    posX: number;
    posY: number;
    zIndex: number;
    scale: number;
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

    // ── 4. Background (fills entire scene) ──
    if (backgroundImg) {
        ctx.save();
        if (backgroundBlur > 0) ctx.filter = `blur(${backgroundBlur}px)`;
        drawObjectCover(ctx, backgroundImg, 0, 0, SCENE_W, SCENE_H);
        ctx.restore();
    }

    // ── 5. Characters ──
    // Character size: "scale" property = height in scene pixels when using
    // a 960px virtual container with object-contain + scaleFactor
    const CHAR_CONTAINER = 960;

    for (const track of tracks) {
        const frame = getFrameAtTime(track, time);
        if (!frame) continue;

        const charData = charNodeDataMap.get(track.nodeId);

        // Position in scene space
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

        const charScale = charData?.scale ?? frame.scale;
        const scaleFactor = charScale / SCENE_W;

        // Draw layers sorted by z-index
        const sorted = [...frame.layerImages].sort((a, b) => a.zIndex - b.zIndex);
        for (const layer of sorted) {
            const img = imageCache.get(layer.url);
            if (!img) continue;

            const natW = img.naturalWidth;
            const natH = img.naturalHeight;

            // Object-contain within CHAR_CONTAINER
            const fitRatio = Math.min(CHAR_CONTAINER / natW, CHAR_CONTAINER / natH);
            const fitW = natW * fitRatio;
            const fitH = natH * fitRatio;

            // Final size in scene pixels
            const drawW = fitW * scaleFactor;
            const drawH = fitH * scaleFactor;

            // Bottom-center anchor (CSS translate(-50%, -100%) on CONTAINER)
            const containerH = CHAR_CONTAINER * scaleFactor;
            const drawX = posX - drawW / 2;
            const drawY = posY - containerH + (containerH - drawH) / 2;

            ctx.drawImage(img, drawX, drawY, drawW, drawH);
        }
        ctx.restore();
    }

    // ── 6. Overlay layers (sorted by z-index) ──
    const sortedOverlays = [...overlayLayers].sort((a, b) => a.zIndex - b.zIndex);
    for (const ol of sortedOverlays) {
        const img = imageCache.get(ol.assetUrl);
        if (!img) continue;

        ctx.save();
        ctx.globalAlpha = ol.opacity;
        if (ol.blur > 0) ctx.filter = `blur(${ol.blur}px)`;

        if (ol.type === 'background') {
            // Object-cover fills entire scene
            drawObjectCover(ctx, img, 0, 0, SCENE_W, SCENE_H);
        } else {
            // FG/Prop: center-anchor at (posX, posY) in scene space
            ctx.translate(ol.posX, ol.posY);
            ctx.rotate((ol.rotation * Math.PI) / 180);

            const olScale = ol.scale / SCENE_W;
            ctx.scale(olScale, olScale);

            // Match StageCanvas constraint: maxWidth=SCENE_W/2, maxHeight=SCENE_H/2
            const natW = img.naturalWidth;
            const natH = img.naturalHeight;
            const maxW = SCENE_W / 2;  // 960
            const maxH = SCENE_H / 2;  // 540
            const constrainRatio = Math.min(1, maxW / natW, maxH / natH);
            const drawW = natW * constrainRatio;
            const drawH = natH * constrainRatio;
            ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
        }

        ctx.restore();
    }

    // ── 7. Close camera transform ──
    ctx.restore();

    // ── 8. Close global scene transform ──
    ctx.restore();
}
