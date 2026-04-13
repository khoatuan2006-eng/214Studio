/**
 * VideoExporter — Client-side video export using canvas capture.
 *
 * Approach:
 * 1. Create an offscreen PixiJS Application (1920×1080)
 * 2. Step through SceneGraph time frame by frame (30fps)
 * 3. Capture each frame via canvas.captureStream() + MediaRecorder
 * 4. Output WebM blob for download
 *
 * Note: WebM only (browser-native). For MP4, would need FFmpeg.wasm or server-side.
 */

export interface ExportOptions {
    width: number;
    height: number;
    fps: number;
    duration: number;  // seconds
    format: 'webm';
}

export interface ExportProgress {
    currentFrame: number;
    totalFrames: number;
    percent: number;
    status: 'idle' | 'preparing' | 'recording' | 'encoding' | 'done' | 'error';
    error?: string;
}

const DEFAULT_OPTIONS: ExportOptions = {
    width: 1920,
    height: 1080,
    fps: 30,
    duration: 10,
    format: 'webm',
};

export type ProgressCallback = (progress: ExportProgress) => void;

/**
 * Export the current scene as a WebM video.
 *
 * @param canvasElement - The PixiJS canvas element currently rendering the scene
 * @param duration - Total duration in seconds
 * @param onProgress - Progress callback
 * @returns Blob URL of the recorded video
 */
export async function exportCanvasToVideo(
    canvasElement: HTMLCanvasElement,
    duration: number,
    fps: number = 30,
    onProgress?: ProgressCallback,
): Promise<string> {
    const totalFrames = Math.ceil(duration * fps);

    const report = (p: Partial<ExportProgress>) => {
        onProgress?.({
            currentFrame: 0,
            totalFrames,
            percent: 0,
            status: 'idle',
            ...p,
        });
    };

    report({ status: 'preparing' });

    // Capture the stream from the canvas
    const stream = canvasElement.captureStream(0); // 0 = manual frame capture
    if (!stream) throw new Error('Canvas captureStream not supported');

    // Determine best available codec
    const codecs = [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
    ];
    let mimeType = codecs.find(c => MediaRecorder.isTypeSupported(c)) || 'video/webm';

    const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 8_000_000, // 8 Mbps for good quality
    });

    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
    };

    return new Promise<string>((resolve, reject) => {
        recorder.onstop = () => {
            report({ status: 'encoding', percent: 99 });
            const blob = new Blob(chunks, { type: mimeType });
            const url = URL.createObjectURL(blob);
            report({ status: 'done', percent: 100, currentFrame: totalFrames });
            resolve(url);
        };

        recorder.onerror = (e) => {
            report({ status: 'error', error: String(e) });
            reject(e);
        };

        recorder.start();
        report({ status: 'recording' });

        // Step through frames
        const frameInterval = 1000 / fps;
        let frame = 0;

        const captureFrame = () => {
            if (frame >= totalFrames) {
                recorder.stop();
                return;
            }

            // Request a new frame from the canvas stream
            const track = stream.getVideoTracks()[0] as any;
            if (track?.requestFrame) {
                track.requestFrame();
            }

            frame++;
            report({
                status: 'recording',
                currentFrame: frame,
                percent: Math.round((frame / totalFrames) * 95), // Reserve 5% for encoding
            });

            setTimeout(captureFrame, frameInterval);
        };

        captureFrame();
    });
}

/**
 * Download a blob URL as a file.
 */
export function downloadBlobUrl(url: string, filename: string): void {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 100);
}
