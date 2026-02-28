// useAppStore removed
import { API_BASE_URL } from '../config/api';
import { yieldToMain } from './worker-utils';

export type ExportStatus = 'idle' | 'extracting' | 'uploading' | 'rendering' | 'done' | 'error';

export interface ExportProgress {
    status: ExportStatus;
    currentFrame: number;
    totalFrames: number;
    message: string;
}

/** How many frames to batch before sending a chunk to the server */
const CHUNK_SIZE = 20;

/**
 * Wait for Konva to finish rendering after a state update.
 * Uses requestAnimationFrame + a small delay to ensure the canvas is painted.
 */
function waitForRender(): Promise<void> {
    return new Promise(resolve => {
        requestAnimationFrame(() => {
            setTimeout(resolve, 16); // ~1 frame at 60fps — minimal buffer
        });
    });
}

/**
 * Export the Konva Stage as an MP4 video using chunked upload.
 * 
 * Flow (Chunked — Memory Safe):
 * 1. POST /api/export/start → get renderJobId
 * 2. Loop: capture CHUNK_SIZE frames → POST /api/export/chunk → clear buffer → repeat
 * 3. POST /api/export/finish → receive MP4 → trigger download
 * 
 * This keeps browser RAM minimal: only CHUNK_SIZE frames in memory at any time.
 * 18.2: Yields to main thread every 5 frames to prevent UI jank.
 */
export async function exportVideo(
    duration: number,
    fps: number,
    stageRef: React.RefObject<any>,
    onProgress: (progress: ExportProgress) => void
): Promise<void> {
    const totalFrames = Math.ceil(duration * fps);

    onProgress({ status: 'extracting', currentFrame: 0, totalFrames, message: 'Initializing export session...' });

    try {
        // ── Phase 1: Start render session ──────────────────────────
        const startRes = await fetch(`${API_BASE_URL}/api/export/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ totalFrames, fps }),
        });

        if (!startRes.ok) {
            const errText = await startRes.text();
            onProgress({ status: 'error', currentFrame: 0, totalFrames, message: `Failed to start session: ${errText}` });
            return;
        }

        const { renderJobId } = await startRes.json();

        // ── Phase 2: Extract & upload frames in chunks ─────────────
        let chunkBuffer: string[] = [];
        let chunkIndex = 0;
        let frameOffset = 0;

        for (let i = 0; i < totalFrames; i++) {
            const time = i / fps;

            // Set the cursor time to this frame
            import('@/stores/transient-store').then(m => m.setCursorTime(time));

            // Wait for React-Konva to re-render
            await waitForRender();

            // 18.2: Yield to main thread every 5 frames to keep UI responsive
            if (i % 5 === 0 && i > 0) {
                await yieldToMain();
            }

            if (!stageRef.current) {
                onProgress({ status: 'error', currentFrame: i, totalFrames, message: 'Stage reference lost!' });
                return;
            }

            // Capture frame as Base64 PNG
            const dataURL = stageRef.current.toDataURL({ pixelRatio: 1 });
            const base64Data = dataURL.split(',')[1];
            chunkBuffer.push(base64Data);

            onProgress({
                status: 'extracting',
                currentFrame: i + 1,
                totalFrames,
                message: `Frame ${i + 1}/${totalFrames} (chunk ${chunkIndex + 1})...`
            });

            // When buffer is full or this is the last frame → send chunk
            if (chunkBuffer.length >= CHUNK_SIZE || i === totalFrames - 1) {
                onProgress({
                    status: 'uploading',
                    currentFrame: i + 1,
                    totalFrames,
                    message: `Uploading chunk ${chunkIndex + 1} (${chunkBuffer.length} frames)...`
                });

                const chunkRes = await fetch(`${API_BASE_URL}/api/export/chunk`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        renderJobId,
                        chunkIndex,
                        frameOffset,
                        frames: chunkBuffer,
                    }),
                });

                if (!chunkRes.ok) {
                    const errText = await chunkRes.text();
                    onProgress({ status: 'error', currentFrame: i + 1, totalFrames, message: `Chunk upload failed: ${errText}` });
                    return;
                }

                // ✅ Clear buffer → free RAM immediately
                frameOffset += chunkBuffer.length;
                chunkBuffer = [];
                chunkIndex++;
            }
        }

        // ── Phase 3: Finalize — FFmpeg render ──────────────────────
        onProgress({ status: 'rendering', currentFrame: totalFrames, totalFrames, message: 'Server is rendering MP4 with FFmpeg...' });

        const finishRes = await fetch(`${API_BASE_URL}/api/export/finish`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ renderJobId, fps }),
        });

        if (!finishRes.ok) {
            const errText = await finishRes.text();
            onProgress({ status: 'error', currentFrame: totalFrames, totalFrames, message: `Render failed: ${errText}` });
            return;
        }

        const blob = await finishRes.blob();

        // Trigger browser download
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `animation_export_${Date.now()}.mp4`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        onProgress({ status: 'done', currentFrame: totalFrames, totalFrames, message: 'Export complete! File downloaded.' });

    } catch (err: any) {
        onProgress({ status: 'error', currentFrame: 0, totalFrames, message: `Network error: ${err.message}` });
    }
}
