# 08 — Video Export System

## Trạng thái hiện tại

### ✅ Hoạt động cơ bản
- `VideoExporter.ts` — canvas capture via `MediaRecorder`
- `ExportDialog.tsx` — UI modal với progress bar
- Output: WebM (VP9), 8 Mbps, 30fps
- Download qua blob URL

### 🔴 Thiếu
- **Không có audio** — video xuất ra chỉ có hình, không có tiếng
- **Playback sync** — cần step-through scene time chính xác theo fps
- **MP4 output** — browser chỉ hỗ trợ WebM native
- **Server-side render** — cho chất lượng cao hơn
- **Batch export** — nhiều scene → nhiều video

## Kiến trúc export

### Client-side (hiện tại)

```
PixiJS Canvas
    ↓
canvas.captureStream(0) → MediaStream
    ↓
MediaRecorder (VP9, 8Mbps) → Blob chunks
    ↓
Blob → URL.createObjectURL → download
```

### Client-side nâng cấp (với audio)

```
PixiJS Canvas → video stream
TTS Audio     → audio stream
    ↓
Merge streams → MediaRecorder
    ↓
WebM with audio
```

### Server-side (tương lai)

```
SceneGraph JSON → Backend
    ↓
Frame-by-frame Python renderer (Pillow/Cairo)
    ↓
FFmpeg: frames + audio → MP4/WebM
    ↓
Download URL
```

## Nhiệm vụ

### Task 8.1: Audio trong video export

**File**: `frontend-react/src/core/export/VideoExporter.ts`

```typescript
export async function exportWithAudio(
    canvas: HTMLCanvasElement,
    audioTracks: Array<{ url: string; startTime: number }>,
    duration: number,
    fps: number,
): Promise<string> {
    // 1. Create AudioContext + load all audio
    const audioCtx = new AudioContext();
    const destination = audioCtx.createMediaStreamDestination();
    
    for (const track of audioTracks) {
        const response = await fetch(track.url);
        const buffer = await audioCtx.decodeAudioData(await response.arrayBuffer());
        const source = audioCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(destination);
        // Schedule playback at correct time
        source.start(track.startTime);
    }
    
    // 2. Combine video + audio streams
    const videoStream = canvas.captureStream(0);
    const audioStream = destination.stream;
    const combined = new MediaStream([
        ...videoStream.getVideoTracks(),
        ...audioStream.getAudioTracks(),
    ]);
    
    // 3. Record combined stream
    const recorder = new MediaRecorder(combined, {
        mimeType: "video/webm;codecs=vp9,opus",
        videoBitsPerSecond: 8_000_000,
    });
    
    // ... rest of recording logic
}
```

### Task 8.2: Frame-accurate export

Hiện tại export dùng `setTimeout` → timing không chính xác.

Cải thiện: step-through từng frame bằng manual rendering:

```typescript
async function exportFrameByFrame(
    canvas: HTMLCanvasElement,
    scene: SceneGraphManager,
    duration: number,
    fps: number,
) {
    const totalFrames = Math.ceil(duration * fps);
    const frameDuration = 1 / fps;
    
    for (let i = 0; i < totalFrames; i++) {
        const time = i * frameDuration;
        
        // 1. Evaluate scene at this exact time
        const snapshot = scene.evaluateAtTime(time);
        
        // 2. Wait for PixiJS to render the snapshot
        await renderer.renderSnapshot(snapshot);
        
        // 3. Capture the frame
        const track = stream.getVideoTracks()[0] as any;
        if (track?.requestFrame) track.requestFrame();
        
        // 4. Wait for encoder
        await new Promise(r => setTimeout(r, 1000 / fps));
    }
}
```

### Task 8.3: ExportDialog nâng cấp

Thêm options:

```typescript
interface ExportOptions {
    resolution: "720p" | "1080p" | "4K";
    fps: 24 | 30 | 60;
    format: "webm" | "mp4";  // mp4 needs FFmpeg.wasm
    includeAudio: boolean;
    includeSubtitles: boolean;
    quality: "fast" | "balanced" | "high";
}
```

### Task 8.4: FFmpeg.wasm cho MP4

```typescript
import { FFmpeg } from "@ffmpeg/ffmpeg";

async function convertWebMtoMP4(webmBlob: Blob): Promise<Blob> {
    const ffmpeg = new FFmpeg();
    await ffmpeg.load();
    
    const input = new Uint8Array(await webmBlob.arrayBuffer());
    await ffmpeg.writeFile("input.webm", input);
    await ffmpeg.exec(["-i", "input.webm", "-c:v", "libx264", "-preset", "fast", "output.mp4"]);
    
    const output = await ffmpeg.readFile("output.mp4");
    return new Blob([output], { type: "video/mp4" });
}
```

### Task 8.5: Server-side export (chất lượng cao)

**File mới**: `backend/routers/video_export.py`

```python
@router.post("/api/export/render")
async def render_video(scene: dict, options: dict):
    """Server-side video rendering using FFmpeg."""
    # 1. Extract all frames as PNG sequence
    # 2. Use Pillow to composite pose+face for each frame
    # 3. FFmpeg: PNGs + audio → MP4
    # 4. Return download URL
```

Cách này cho chất lượng cao hơn và hoạt động trên mobile (không cần canvas).
