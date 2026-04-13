# 06 — TTS & Audio System

## Trạng thái hiện tại

### ✅ Đã hoạt động
- Volcengine TTS API tại `backend/routers/tts.py`
- Endpoint `POST /api/tts/synthesize` — text → MP3
- Endpoint `POST /api/tts/batch` — nhiều câu → 1 file ghép
- Hỗ trợ tiếng Việt + nhiều giọng nói
- FFmpeg concatenation cho ghép audio

### 🔴 Chưa tích hợp với Scene
- Audio node chưa render (không phát âm thanh)
- TTS result chưa gắn vào timeline
- Lip-sync timestamps chưa lấy từ TTS API thật (đang estimate)
- Không có waveform hiển thị trên timeline
- Không có BGM/SFX system

## Kiến trúc Audio

```
Script line "Chào bạn, hôm nay trời đẹp quá!"
    ↓
TTS API (Volcengine)
    ↓
MP3 file + timestamps per word/sentence
    ↓
AudioNode gắn vào SceneGraph (start_time, duration)
    ↓
Frontend: <audio> hoặc Web Audio API phát theo timeline
    ↓
Lip-sync: timestamps → face swap keyframes
```

## Nhiệm vụ

### Task 6.1: AudioNode phát âm thanh trong playback

**File**: `frontend-react/src/components/studio/editor/SceneRenderer.tsx`

Thêm audio playback vào render loop:

```typescript
// Audio Manager class
class SceneAudioManager {
    private audioElements: Map<string, HTMLAudioElement> = new Map();
    
    preloadAudio(nodeId: string, url: string) {
        const audio = new Audio(url);
        audio.preload = "auto";
        this.audioElements.set(nodeId, audio);
    }
    
    syncToTime(time: number, isPlaying: boolean) {
        for (const [nodeId, audio] of this.audioElements) {
            const node = getAudioNode(nodeId); // from snapshot
            if (!node) continue;
            
            const audioStart = node.startTime ?? 0;
            const audioDuration = node.duration ?? audio.duration;
            
            if (time >= audioStart && time <= audioStart + audioDuration) {
                if (isPlaying && audio.paused) {
                    audio.currentTime = time - audioStart;
                    audio.play();
                }
            } else {
                audio.pause();
            }
        }
    }
    
    stopAll() {
        this.audioElements.forEach(a => { a.pause(); a.currentTime = 0; });
    }
}
```

### Task 6.2: TTS tích hợp vào Script-to-Scene

**File**: `backend/routers/automation.py`

Cải thiện `_generate_tts_for_script()`:

```python
async def _generate_tts_for_script(lines, voice_map, pause_ms):
    """Generate TTS for each line separately to get accurate timestamps."""
    results = []
    current_offset = 0.0
    
    for line in lines:
        voice = voice_map.get(line.character, "BV074")
        
        # Call TTS for individual line
        resp = await client.post("/api/tts/synthesize", json={
            "text": line.text,
            "voice": voice,
        })
        
        data = resp.json()
        audio_duration = data.get("duration", 2.0)
        audio_url = data.get("audio_url", "")
        
        results.append({
            "character": line.character,
            "text": line.text,
            "start_time": current_offset,
            "end_time": current_offset + audio_duration,
            "audio_url": audio_url,
        })
        
        current_offset += audio_duration + (pause_ms / 1000.0)
    
    return results
```

Sau đó, tạo `AudioNode` cho mỗi line trong `build_scene_from_script()`:

```python
# Thêm AudioNode cho TTS
if tts_line.get("audio_url"):
    audio_node = AudioNode(
        name=f"voice_{line.character}_{idx}",
        audio_type="voice",
        start_time=tts_line["start_time"],
        duration=tts_line["end_time"] - tts_line["start_time"],
    )
    audio_node.metadata["audio_url"] = tts_line["audio_url"]
    graph.add_node(audio_node)
```

### Task 6.3: TTS timestamps → chính xác hơn cho lip-sync

Hiện tại lip-sync swap face đều đặn mỗi 250ms. Nâng cấp:

```python
def _add_lipsync_from_tts_timestamps(node, word_timestamps, available_faces):
    """Use actual word-level timestamps for lip-sync."""
    for word in word_timestamps:
        # Each word: {start_ms, end_ms, text}
        word_start = word["start_ms"] / 1000.0
        word_end = word["end_ms"] / 1000.0
        
        # Mouth open at word start
        node.add_frame(word_start, {"face": "说话"})
        # Mouth closed at word end
        node.add_frame(word_end, {"face": "微笑"})
        # Small pause between words → neutral
```

### Task 6.4: BGM system

```python
# Thêm tool "add_bgm" vào SceneToolExecutor
def add_bgm(self, params):
    """Add background music to scene."""
    bgm_node = AudioNode(
        name=params.get("name", "bgm"),
        audio_type="bgm",
        volume=params.get("volume", 0.3),
        loop=True,
        start_time=0,
    )
    bgm_node.metadata["audio_url"] = params["url"]
    self.graph.add_node(bgm_node)
```

### Task 6.5: Audio waveform trên timeline

**File mới**: `frontend-react/src/components/studio/editor/AudioWaveform.tsx`

```typescript
// Render waveform using Web Audio API
async function generateWaveformData(audioUrl: string): Promise<Float32Array> {
    const ctx = new AudioContext();
    const response = await fetch(audioUrl);
    const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
    // Downsample to ~100 samples per second for visualization
    return downsample(buffer.getChannelData(0), 100);
}
```

Hiện waveform dưới dạng canvas overlay trên timeline bar.

## Voice Map mặt định (Volcengine)

| Giọng | Code | Ngôn ngữ |
|-------|------|----------|
| Nữ trẻ Việt | BV074 | Vietnamese |
| Nam trẻ Việt | BV075 | Vietnamese |
| Nữ trẻ CN | BV001 | Chinese |
| Nam trẻ CN | BV002 | Chinese |
