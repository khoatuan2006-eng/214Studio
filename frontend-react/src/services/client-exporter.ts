/**
 * Client-Side Video Export using WebCodecs (mediabunny)
 * 
 * Inspired by OpenCut's SceneExporter pattern.
 * Renders each frame from the Konva Stage to an OffscreenCanvas,
 * then encodes it via WebCodecs → MP4/WebM entirely in the browser.
 * 
 * **No backend FFmpeg needed. ~10x faster than the old chunked HTTP pipeline.**
 */
import {
    Output,
    Mp4OutputFormat,
    WebMOutputFormat,
    BufferTarget,
    CanvasSource,
    QUALITY_LOW,
    QUALITY_MEDIUM,
    QUALITY_HIGH,
    QUALITY_VERY_HIGH,
} from 'mediabunny';
import { setCursorTime } from '../stores/transient-store';

export type ExportFormat = 'mp4' | 'webm';
export type ExportQuality = 'low' | 'medium' | 'high' | 'very_high';

export interface ClientExportOptions {
    format: ExportFormat;
    quality: ExportQuality;
    fps: number;
    duration: number;
    stageRef: React.RefObject<any>;
    onProgress?: (progress: number) => void;
    onCancel?: () => boolean;
}

export interface ClientExportResult {
    success: boolean;
    error?: string;
    cancelled?: boolean;
}

const QUALITY_MAP = {
    low: QUALITY_LOW,
    medium: QUALITY_MEDIUM,
    high: QUALITY_HIGH,
    very_high: QUALITY_VERY_HIGH,
} as const;

/**
 * Check if the browser supports WebCodecs (required for mediabunny).
 */
export function supportsWebCodecs(): boolean {
    return typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';
}

/**
 * Wait one animation frame + a minimal paint buffer.
 */
function waitForPaint(): Promise<void> {
    return new Promise(resolve => {
        requestAnimationFrame(() => {
            // Internal micro-task is enough for Konva's synchronous drawing
            resolve();
        });
    });
}

/**
 * Export the Konva Stage as MP4/WebM entirely in the browser.
 * 
 * Flow:
 * 1. Create an OffscreenCanvas matching the stage size
 * 2. For each frame: set cursorTime → wait for Konva paint → copy stage pixels to OffscreenCanvas
 * 3. mediabunny encodes the OffscreenCanvas via WebCodecs (H.264 for MP4, VP9 for WebM)
 * 4. Download the resulting ArrayBuffer as a file
 */
export async function clientExportVideo(options: ClientExportOptions): Promise<ClientExportResult> {
    const { format, quality, fps, duration, stageRef, onProgress, onCancel } = options;
    const totalFrames = Math.ceil(duration * fps);

    if (!stageRef.current) {
        return { success: false, error: 'Stage reference not available' };
    }

    const stage = stageRef.current;
    const width = stage.width();
    const height = stage.height();

    try {
        // Create an OffscreenCanvas to render into
        const offscreen = new OffscreenCanvas(width, height);
        const ctx = offscreen.getContext('2d');
        if (!ctx) {
            return { success: false, error: 'Failed to create OffscreenCanvas context' };
        }

        // Configure mediabunny output
        const outputFormat = format === 'webm' ? new WebMOutputFormat() : new Mp4OutputFormat();
        const output = new Output({
            format: outputFormat,
            target: new BufferTarget(),
        });

        const videoSource = new CanvasSource(offscreen, {
            codec: format === 'webm' ? 'vp9' : 'avc',
            bitrate: QUALITY_MAP[quality],
        });

        output.addVideoTrack(videoSource, { frameRate: fps });
        await output.start();

        // Render each frame
        for (let i = 0; i < totalFrames; i++) {
            // Check cancellation
            if (onCancel?.()) {
                await output.cancel();
                return { success: false, cancelled: true };
            }

            const time = i / fps;

            // Set the playback time
            setCursorTime(time);

            // Wait for Konva to repaint asynchronously
            await waitForPaint();

            if (!stageRef.current) {
                return { success: false, error: 'Stage reference lost during export' };
            }

            // High-speed capture: direct canvas to canvas transfer
            const stageCanvas = stageRef.current.toCanvas({ pixelRatio: 1 });
            ctx.drawImage(stageCanvas, 0, 0, width, height);

            // Feed the frame to mediabunny
            await videoSource.add(time, 1 / fps);

            // Report progress
            if (i % 5 === 0) onProgress?.((i + 1) / totalFrames);
        }

        // Finalize
        videoSource.close();
        await output.finalize();
        onProgress?.(1);

        // Get the result buffer and trigger download
        const buffer = (output.target as BufferTarget).buffer;
        if (!buffer) {
            return { success: false, error: 'Export failed to produce buffer' };
        }

        const extension = format === 'webm' ? 'webm' : 'mp4';
        const mimeType = format === 'webm' ? 'video/webm' : 'video/mp4';
        const blob = new Blob([buffer], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `animation_export_${Date.now()}.${extension}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        return { success: true };
    } catch (err: any) {
        console.error('Client export failed:', err);
        return { success: false, error: err?.message || 'Unknown export error' };
    }
}
