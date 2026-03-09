import { useState, useCallback } from 'react';
import { API_BASE_URL } from '@/config/api';
import type { PreviewTrack } from './types';
import type { CharacterNodeData } from '@/stores/useWorkflowStore';
import { renderScene, type SceneLayer, type CameraExportData } from './renderScene';

interface UseExportVideoOptions {
    tracks: PreviewTrack[];
    totalDuration: number;
    backgroundUrl: string;
    backgroundBlur?: number;
    overlayLayers?: SceneLayer[];
    cameraData?: CameraExportData | null;
    charNodeDataMap?: Map<string, CharacterNodeData>;
    ppu?: number;
}

interface UseExportVideoReturn {
    exporting: boolean;
    exportProgress: number;
    exportStatus: string;
    exportVideo: () => Promise<void>;
}

export function useExportVideo({
    tracks,
    totalDuration,
    backgroundUrl,
    backgroundBlur = 0,
    overlayLayers = [],
    cameraData = null,
    charNodeDataMap,
    ppu = 100,
}: UseExportVideoOptions): UseExportVideoReturn {
    const [exporting, setExporting] = useState(false);
    const [exportProgress, setExportProgress] = useState(0);
    const [exportStatus, setExportStatus] = useState('');

    const exportVideo = useCallback(async () => {
        if (tracks.length === 0 || exporting) return;

        const FPS = 24;
        const W = cameraData?.viewportWidth || 1920;
        const H = cameraData?.viewportHeight || 1080;
        const totalFrames = Math.max(1, Math.ceil(totalDuration * FPS));
        const BATCH_SIZE = 10;

        setExporting(true);
        setExportProgress(0);

        try {
            // 1. Pre-load all images
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

            // 2. Start export session
            setExportStatus('Đang khởi tạo export...');
            const startRes = await fetch(`${API_BASE_URL}/api/export/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ totalFrames, fps: FPS }),
            });
            if (!startRes.ok) throw new Error('Failed to start export');
            const { renderJobId } = await startRes.json();

            // 3. Render frames using shared renderScene()
            const canvas = document.createElement('canvas');
            canvas.width = W;
            canvas.height = H;
            const ctx = canvas.getContext('2d')!;

            let chunkIndex = 0;
            for (let start = 0; start < totalFrames; start += BATCH_SIZE) {
                const end = Math.min(start + BATCH_SIZE, totalFrames);
                const batch: string[] = [];

                for (let fi = start; fi < end; fi++) {
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

                    const dataUrl = canvas.toDataURL('image/png');
                    batch.push(dataUrl.split(',')[1]);
                }

                setExportStatus(`Đang render frame ${start + 1}–${end} / ${totalFrames}`);
                setExportProgress(Math.round((end / totalFrames) * 80));

                const chunkRes = await fetch(`${API_BASE_URL}/api/export/chunk`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        renderJobId,
                        chunkIndex: chunkIndex++,
                        frameOffset: start,
                        frames: batch,
                    }),
                });
                if (!chunkRes.ok) throw new Error('Chunk upload failed');
            }

            // 4. Finish — FFmpeg stitch
            setExportStatus('Đang ghép video bằng FFmpeg...');
            setExportProgress(90);

            const finishRes = await fetch(`${API_BASE_URL}/api/export/finish`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ renderJobId, fps: FPS }),
            });
            if (!finishRes.ok) throw new Error('FFmpeg stitching failed');

            // 5. Download
            setExportStatus('Đang tải xuống...');
            setExportProgress(100);

            const blob = await finishRes.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `workflow_export_${Date.now()}.mp4`;
            a.click();
            URL.revokeObjectURL(url);

            setExportStatus('✅ Hoàn thành!');
            setTimeout(() => setExporting(false), 1500);

        } catch (err) {
            console.error('Export error:', err);
            setExportStatus(`❌ Lỗi: ${(err as Error).message}`);
            setTimeout(() => setExporting(false), 3000);
        }
    }, [tracks, totalDuration, backgroundUrl, backgroundBlur, overlayLayers, cameraData, charNodeDataMap, exporting, ppu]);

    return { exporting, exportProgress, exportStatus, exportVideo };
}
