import * as MP4Box from 'mp4box';
import { setCursorTime } from '../../store/useAppStore';
import { getEffectiveOutPoint, getProjectFps } from '../../stores/timeline-store';

export type ExportStatus = 'idle' | 'preparing' | 'rendering' | 'muxing' | 'complete' | 'error';

class VideoExportService {
    private worker: Worker | null = null;
    private isExporting = false;
    private totalFrames = 0;
    private currentFrame = 0;
    private exportWidth = 1920;
    private exportHeight = 1080;

    // Status callbacks
    public onProgress: (progress: number) => void = () => { };
    public onStatusChange: (status: ExportStatus) => void = () => { };
    public onError: (error: string) => void = () => { };

    init() {
        if (!this.worker) {
            this.worker = new Worker(new URL('./encode_worker.ts', import.meta.url), { type: 'module' });

            this.worker.onmessage = async (msg: MessageEvent) => {
                const { action, binary, chunk_info, description } = msg.data;

                if (action === 'binary') {
                    console.log('[videoExporter] Binary received from worker', {
                        size: binary.length,
                        chunks: chunk_info?.length,
                        hasDescription: !!description
                    });
                    await this.muxAndSave(binary, chunk_info, description);
                }

                if (action === 'dequeue') {
                    // Logic to throttle encoding if queue gets too large
                }
            };
        }
    }

    startExport(canvas: HTMLCanvasElement, fps: number = 60, app?: any) {
        console.log('[videoExporter] startExport called', {
            canvasWidth: canvas.width,
            canvasHeight: canvas.height,
            fps,
            isExporting: this.isExporting
        });

        if (this.isExporting) {
            console.warn('[videoExporter] Export already in progress');
            return;
        }

        this.exportWidth = canvas.width;
        this.exportHeight = canvas.height;

        try {
            this.init();
            console.log('[videoExporter] Worker initialized');
        } catch (e) {
            console.error('[videoExporter] Init failed:', e);
            this.onError?.('Failed to initialize worker');
            return;
        }

        this.isExporting = true;
        this.currentFrame = 0;

        const actualFps = getProjectFps();
        const durationSecs = getEffectiveOutPoint();
        this.totalFrames = Math.ceil(durationSecs * actualFps);

        console.log('[videoExporter] status -> preparing', { totalFrames: this.totalFrames, durationSecs });
        this.onStatusChange('preparing');

        if (this.worker) {
            console.log('[videoExporter] configuring worker', {
                width: canvas.width,
                height: canvas.height,
                totalFrames: this.totalFrames
            });
            this.worker.postMessage({
                action: 'configure',
                width: canvas.width,
                height: canvas.height,
                bitrate: 10_000,
                timebase: actualFps,
                bitrateMode: 'quantizer',
                getChunks: false
            });
        } else {
            console.error('[videoExporter] Worker not found');
            this.onError?.('Internal Error: Worker not found');
            this.isExporting = false;
            return;
        }

        console.log('[videoExporter] status -> rendering');
        this.onStatusChange('rendering');
        this.captureFrame(canvas, actualFps, app);
    }

    private captureFrame(canvas: HTMLCanvasElement, fps: number, app?: any) {
        if (!this.isExporting || !this.worker) {
            console.warn('[videoExporter] captureFrame aborted', { isExporting: this.isExporting, hasWorker: !!this.worker });
            return;
        }

        try {
            const timestampMs = (this.currentFrame / fps) * 1000;

            // Validate canvas content
            if (canvas.width === 0 || canvas.height === 0) {
                throw new Error(`Zero-sized canvas: ${canvas.width}x${canvas.height}`);
            }

            // Sync timeline cursor first
            setCursorTime(this.currentFrame / fps);

            // Give React and PixiJS a moment to switch data and render the frame
            if (app && app.renderer) {
                app.renderer.render({ container: app.stage });
            }

            requestAnimationFrame(() => {
                if (!this.isExporting) return;

                console.log(`[videoExporter] capturing frame ${this.currentFrame}/${this.totalFrames} at ${timestampMs.toFixed(2)}ms`);

                // Use VideoFrame API (WebCodecs)
                const frame = new VideoFrame(canvas, {
                    timestamp: timestampMs * 1000, // WebCodecs uses microseconds
                    duration: (1 / fps) * 1000_000
                });

                this.worker!.postMessage({
                    action: 'encode',
                    frame
                }, [frame] as any);

                this.currentFrame++;
                this.onProgress((this.currentFrame / this.totalFrames) * 100);

                if (this.currentFrame >= this.totalFrames) {
                    console.log('[videoExporter] reached total frames, requesting binary');
                    this.worker!.postMessage({ action: 'get-binary' });
                } else {
                    this.captureFrame(canvas, fps, app);
                }
            });
        } catch (e: any) {
            console.error('[videoExporter] captureFrame failed:', e);
            this.onError?.(`Capture Error: ${e.message}`);
            this.isExporting = false;
        }
    }

    private async muxAndSave(binary: Uint8Array, chunkInfo: any[], description: Uint8Array | null) {
        console.log('[videoExporter] muxAndSave called', {
            binarySize: binary.length,
            chunkCount: chunkInfo?.length
        });

        this.onStatusChange('muxing');

        try {
            const mp4file = MP4Box.createFile();

            // Track timescale (ms)
            const timescale = 1000;

            const videoTrackId = mp4file.addTrack({
                timescale: timescale,
                width: this.exportWidth,
                height: this.exportHeight,
                avcc: description ? description.buffer : undefined,
            } as any);

            let offset = 0;
            for (let i = 0; i < chunkInfo.length; i++) {
                const info = chunkInfo[i];
                const sampleData = binary.slice(offset, offset + info.size);
                offset += info.size;

                mp4file.addSample(videoTrackId, sampleData, {
                    duration: Math.round(info.duration / 1000), // convert microseconds to ms
                    dts: Math.round(info.timestamp / 1000),
                    cts: Math.round(info.timestamp / 1000),
                    is_sync: info.is_key,
                });
            }

            console.log('[videoExporter] all samples added, generating buffer');
            const buffer = mp4file.getBuffer();
            const blob = new Blob([buffer], { type: 'video/mp4' });

            console.log('[videoExporter] download triggered');
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `AnimeStudio_${new Date().getTime()}.mp4`;
            a.click();
            URL.revokeObjectURL(url);

            this.onStatusChange('complete');
        } catch (e: any) {
            console.error('[videoExporter] Muxing failed:', e);
            this.onError?.(`Muxing Error: ${e.message}`);
        } finally {
            this.isExporting = false;
        }
    }

    cancel() {
        this.isExporting = false;
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
        this.onStatusChange('idle');
    }
}

export const videoExporter = new VideoExportService();
