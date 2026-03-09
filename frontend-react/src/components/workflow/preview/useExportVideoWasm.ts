/**
 * useExportVideoWasm — Client-side video export using ffmpeg.wasm
 *
 * Uses shared renderScene() for frame rendering (same as PreviewCanvas),
 * then encodes to MP4 via ffmpeg.wasm. No server required.
 */
import { useState, useCallback, useRef } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import type { PreviewTrack } from './types';
import type { CharacterNodeData } from '@/stores/useWorkflowStore';
import { renderScene, type SceneLayer, type CameraExportData } from './renderScene';

interface UseExportVideoWasmOptions {
    tracks: PreviewTrack[];
    totalDuration: number;
    backgroundUrl: string;
    backgroundBlur?: number;
    overlayLayers?: SceneLayer[];
    cameraData?: CameraExportData | null;
    charNodeDataMap?: Map<string, CharacterNodeData>;
    ppu?: number;
}

interface UseExportVideoWasmReturn {
    exporting: boolean;
    exportProgress: number;
    exportStatus: string;
    ffmpegLoaded: boolean;
    loadFfmpeg: () => Promise<void>;
    exportVideo: () => Promise<void>;
}

const FFMPEG_CDN = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core-mt@0.12.10/dist/esm';

export function useExportVideoWasm({
    tracks,
    totalDuration,
    backgroundUrl,
    backgroundBlur = 0,
    overlayLayers = [],
    cameraData = null,
    charNodeDataMap,
    ppu = 100,
}: UseExportVideoWasmOptions): UseExportVideoWasmReturn {
    const [exporting, setExporting] = useState(false);
    const [exportProgress, setExportProgress] = useState(0);
    const [exportStatus, setExportStatus] = useState('');
    const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
    const ffmpegRef = useRef<FFmpeg | null>(null);

    const loadFfmpeg = useCallback(async () => {
        if (ffmpegLoaded) return;
        setExportStatus('Đang tải ffmpeg.wasm (~31MB)...');
        const ffmpeg = new FFmpeg();
        ffmpeg.on('progress', ({ progress }) => setExportProgress(Math.round(progress * 100)));
        ffmpeg.on('log', ({ message }) => console.log('[ffmpeg.wasm]', message));
        await ffmpeg.load({
            coreURL: await toBlobURL(`${FFMPEG_CDN}/ffmpeg-core.js`, 'text/javascript'),
            wasmURL: await toBlobURL(`${FFMPEG_CDN}/ffmpeg-core.wasm`, 'application/wasm'),
            workerURL: await toBlobURL(`${FFMPEG_CDN}/ffmpeg-core.worker.js`, 'text/javascript'),
        });
        ffmpegRef.current = ffmpeg;
        setFfmpegLoaded(true);
        setExportStatus('ffmpeg.wasm sẵn sàng ✅');
    }, [ffmpegLoaded]);

    const exportVideo = useCallback(async () => {
        if (exporting) return;
        if (!ffmpegRef.current) await loadFfmpeg();
        const ffmpeg = ffmpegRef.current!;

        setExporting(true);
        setExportProgress(0);

        const FPS = 24;
        const W = cameraData?.viewportWidth || 1920;
        const H = cameraData?.viewportHeight || 1080;
        const totalFrames = Math.max(1, Math.ceil(totalDuration * FPS));

        try {
            // 1. Pre-load images
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

            // 2. Render frames using shared renderScene()
            const canvas = document.createElement('canvas');
            canvas.width = W;
            canvas.height = H;
            const ctx = canvas.getContext('2d')!;

            for (let fi = 0; fi < totalFrames; fi++) {
                const t = fi / FPS;

                // ★ SHARED RENDERING — same function as PreviewCanvas ★
                renderScene({
                    ctx, W, H, time: t, tracks,
                    backgroundImg: bgImg,
                    backgroundBlur,
                    overlayLayers,
                    cameraData,
                    charNodeDataMap: charNodeDataMap ?? new Map(),
                    imageCache,
                    ppu,
                });

                // Write frame to ffmpeg FS
                const blob = await new Promise<Blob>((resolve) =>
                    canvas.toBlob((b) => resolve(b!), 'image/png')
                );
                const frameData = new Uint8Array(await blob.arrayBuffer());
                await ffmpeg.writeFile(`frame${String(fi).padStart(6, '0')}.png`, frameData);

                if (fi % 10 === 0 || fi === totalFrames - 1) {
                    setExportProgress(Math.round((fi / totalFrames) * 70));
                    setExportStatus(`Đang render frame ${fi + 1} / ${totalFrames}`);
                    await new Promise(r => setTimeout(r, 0));
                }
            }

            // 3. Encode
            setExportStatus('Đang encode video (ffmpeg.wasm)...');
            setExportProgress(75);

            await ffmpeg.exec([
                '-framerate', String(FPS),
                '-i', 'frame%06d.png',
                '-c:v', 'libx264',
                '-pix_fmt', 'yuv420p',
                '-preset', 'fast',
                '-crf', '23',
                '-movflags', '+faststart',
                'output.mp4',
            ]);

            // 4. Download
            setExportProgress(95);
            setExportStatus('Đang tải xuống...');
            const outputData = await ffmpeg.readFile('output.mp4');
            const mp4Blob = new Blob([outputData as unknown as BlobPart], { type: 'video/mp4' });
            const url = URL.createObjectURL(mp4Blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `animation_${Date.now()}.mp4`;
            a.click();
            URL.revokeObjectURL(url);

            // 5. Cleanup
            for (let fi = 0; fi < totalFrames; fi++) {
                try { await ffmpeg.deleteFile(`frame${String(fi).padStart(6, '0')}.png`); } catch { /* */ }
            }
            try { await ffmpeg.deleteFile('output.mp4'); } catch { /* */ }

            setExportProgress(100);
            setExportStatus('✅ Hoàn thành! (Client-side)');
            setTimeout(() => setExporting(false), 1500);

        } catch (err) {
            console.error('WASM Export error:', err);
            setExportStatus(`❌ Lỗi: ${(err as Error).message}`);
            setTimeout(() => setExporting(false), 3000);
        }
    }, [tracks, totalDuration, backgroundUrl, backgroundBlur, overlayLayers, cameraData, charNodeDataMap, exporting, loadFfmpeg, ppu]);

    return { exporting, exportProgress, exportStatus, ffmpegLoaded, loadFfmpeg, exportVideo };
}
