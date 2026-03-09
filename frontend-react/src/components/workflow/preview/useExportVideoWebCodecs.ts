/**
 * useExportVideoWebCodecs — Client-side video export using WebCodecs (mediabunny)
 *
 * Uses shared renderScene() for frame rendering (same as PreviewCanvas),
 * then encodes to MP4/WebM via WebCodecs. No FFmpeg needed.
 *
 * Flow:
 *   renderScene() → Canvas2D → OffscreenCanvas → mediabunny (WebCodecs) → MP4
 */
import { useState, useCallback, useRef } from 'react';
import {
    Output,
    Mp4OutputFormat,
    BufferTarget,
    CanvasSource,
    QUALITY_HIGH,
} from 'mediabunny';
import type { PreviewTrack } from './types';
import type { CharacterNodeData } from '@/stores/useWorkflowStore';
import { renderScene, type SceneLayer, type CameraExportData } from './renderScene';

// ── Types ──

interface UseExportVideoWebCodecsOptions {
    tracks: PreviewTrack[];
    totalDuration: number;
    backgroundUrl: string;
    backgroundBlur?: number;
    overlayLayers?: SceneLayer[];
    cameraData?: CameraExportData | null;
    charNodeDataMap?: Map<string, CharacterNodeData>;
    ppu?: number;
}

interface UseExportVideoWebCodecsReturn {
    exporting: boolean;
    exportProgress: number;
    exportStatus: string;
    exportVideo: () => Promise<void>;
    cancelExport: () => void;
}

/**
 * Check if the browser supports WebCodecs.
 */
export function supportsWebCodecs(): boolean {
    return typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';
}

export function useExportVideoWebCodecs({
    tracks,
    totalDuration,
    backgroundUrl,
    backgroundBlur = 0,
    overlayLayers = [],
    cameraData = null,
    charNodeDataMap,
    ppu = 100,
}: UseExportVideoWebCodecsOptions): UseExportVideoWebCodecsReturn {
    const [exporting, setExporting] = useState(false);
    const [exportProgress, setExportProgress] = useState(0);
    const [exportStatus, setExportStatus] = useState('');
    const cancelledRef = useRef(false);

    const cancelExport = useCallback(() => {
        cancelledRef.current = true;
    }, []);

    const exportVideo = useCallback(async () => {
        if (tracks.length === 0 || exporting) return;

        // Check WebCodecs support
        if (!supportsWebCodecs()) {
            setExportStatus('❌ Trình duyệt không hỗ trợ WebCodecs. Dùng Chrome/Edge mới nhất.');
            return;
        }

        const FPS = 24;
        const W = cameraData?.viewportWidth || 1920;
        const H = cameraData?.viewportHeight || 1080;
        const totalFrames = Math.max(1, Math.ceil(totalDuration * FPS));

        setExporting(true);
        setExportProgress(0);
        cancelledRef.current = false;

        let output: Output | null = null;

        try {
            // ── 1. Pre-load all images ──
            setExportStatus('Đang tải tài nguyên...');
            const imageCache = new Map<string, HTMLImageElement>();
            const urls = new Set<string>();

            if (backgroundUrl) urls.add(backgroundUrl);
            for (const track of tracks) {
                for (const frame of track.frames) {
                    for (const layer of frame.layerImages) {
                        if (layer.url) urls.add(layer.url);
                    }
                }
            }
            for (const ol of overlayLayers) {
                if (ol.assetUrl) urls.add(ol.assetUrl);
            }

            await Promise.all(
                Array.from(urls).map(async (url) => {
                    try {
                        const res = await fetch(url);
                        const blob = await res.blob();
                        const blobUrl = URL.createObjectURL(blob);
                        const img = new Image();
                        await new Promise<void>((resolve, reject) => {
                            img.onload = () => resolve();
                            img.onerror = () => reject();
                            img.src = blobUrl;
                        });
                        imageCache.set(url, img);
                    } catch {
                        console.warn('Failed to load:', url);
                    }
                })
            );

            const bgImg = backgroundUrl ? imageCache.get(backgroundUrl) ?? null : null;

            // ── 2. Setup mediabunny WebCodecs pipeline ──
            setExportStatus('Đang khởi tạo WebCodecs encoder...');

            const offscreen = new OffscreenCanvas(W, H);
            const offCtx = offscreen.getContext('2d')!;

            // Rendering canvas (renderScene writes here)
            const renderCanvas = document.createElement('canvas');
            renderCanvas.width = W;
            renderCanvas.height = H;
            const renderCtx = renderCanvas.getContext('2d')!;

            output = new Output({
                format: new Mp4OutputFormat(),
                target: new BufferTarget(),
            });

            const videoSource = new CanvasSource(offscreen, {
                codec: 'avc',
                bitrate: QUALITY_HIGH,
            });

            output.addVideoTrack(videoSource, { frameRate: FPS });
            await output.start();

            // ── 3. Render frames using shared renderScene() ──
            for (let fi = 0; fi < totalFrames; fi++) {
                // Check cancellation
                if (cancelledRef.current) {
                    setExportStatus('⏹ Đã hủy export.');
                    await output.cancel();
                    setExporting(false);
                    return;
                }

                const t = fi / FPS;

                // ★ SHARED RENDERING — same function as PreviewCanvas ★
                renderScene({
                    ctx: renderCtx,
                    W, H,
                    time: t,
                    tracks,
                    backgroundImg: bgImg,
                    backgroundBlur,
                    overlayLayers,
                    cameraData,
                    charNodeDataMap: charNodeDataMap ?? new Map(),
                    imageCache,
                    ppu,
                });

                // Copy rendered frame to OffscreenCanvas for mediabunny
                offCtx.drawImage(renderCanvas, 0, 0);

                // Feed frame to WebCodecs encoder
                await videoSource.add(t, 1 / FPS);

                // Update progress
                if (fi % 5 === 0 || fi === totalFrames - 1) {
                    const pct = Math.round(((fi + 1) / totalFrames) * 90);
                    setExportProgress(pct);
                    setExportStatus(`Đang render frame ${fi + 1} / ${totalFrames}`);
                    // Yield to UI thread
                    await new Promise(r => setTimeout(r, 0));
                }
            }

            // ── 4. Finalize encoding ──
            setExportStatus('Đang hoàn tất encoding...');
            setExportProgress(92);

            videoSource.close();
            await output.finalize();

            setExportProgress(95);

            // ── 5. Download ──
            setExportStatus('Đang tải xuống...');
            const buffer = (output.target as BufferTarget).buffer;
            if (!buffer) {
                throw new Error('Export failed: no output buffer');
            }

            const blob = new Blob([buffer], { type: 'video/mp4' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `animation_export_${Date.now()}.mp4`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            setExportProgress(100);
            setExportStatus('✅ Hoàn thành! (WebCodecs GPU)');
            setTimeout(() => setExporting(false), 1500);

        } catch (err) {
            console.error('WebCodecs Export error:', err);
            setExportStatus(`❌ Lỗi: ${(err as Error).message}`);
            // Try to cancel output if possible
            try { if (output) await output.cancel(); } catch { /* ignore */ }
            setTimeout(() => setExporting(false), 3000);
        }
    }, [tracks, totalDuration, backgroundUrl, backgroundBlur, overlayLayers, cameraData, charNodeDataMap, exporting, ppu]);

    return { exporting, exportProgress, exportStatus, exportVideo, cancelExport };
}
