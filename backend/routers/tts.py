"""
TTS Router — Text-to-Speech using Volcengine API + ffmpeg for audio concatenation.

Endpoints:
  POST /api/tts/synthesize — Synthesize each line, concatenate with ffmpeg, return MP3 + SRT.
  GET  /api/tts/voices     — List available Vietnamese voices.
"""
import asyncio
import os
import subprocess
import uuid
import wave
import base64
import logging
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

import httpx

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/tts", tags=["tts"])

# ── ffmpeg path (bundled in project) ──
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FFMPEG = os.path.join(BACKEND_DIR, "bin", "ffmpeg", "ffmpeg.exe")
FFPROBE = os.path.join(BACKEND_DIR, "bin", "ffmpeg", "ffprobe.exe")

if not os.path.exists(FFMPEG):
    logger.error(f"ffmpeg not found at {FFMPEG}")
else:
    logger.info(f"ffmpeg found: {FFMPEG}")

# ── Vietnamese voices ──
VOICES = {
    "BV074": {"id": "tts.other.BV074_streaming", "name": "Nữ Việt", "gender": "female", "lang": "vi"},
    "BV075": {"id": "tts.other.BV075_streaming", "name": "Nam Việt", "gender": "male", "lang": "vi"},
    "BV421": {"id": "tts.other.BV421_streaming", "name": "Thiên tài thiếu nữ (đa ngữ)", "gender": "female", "lang": "vi"},
    "BV562": {"id": "tts.other.BV562_streaming", "name": "Nữ Việt 2", "gender": "female", "lang": "vi"},
}

DEFAULT_VOICE = "BV074"

VOLCENGINE_URL = "https://translate.volcengine.com/crx/tts/v1/"
VOLCENGINE_HEADERS = {
    "authority": "translate.volcengine.com",
    "origin": "chrome-extension://klgfhbdadaspgppeadghjjemk",
    "accept": "application/json, text/plain, */*",
    "cookie": "hasUserBehavior=1",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/106.0.0.0 Safari/537.36",
}

# Storage
STORAGE_DIR = os.path.join(BACKEND_DIR, "storage")
TTS_DIR = os.path.join(STORAGE_DIR, "tts")
os.makedirs(TTS_DIR, exist_ok=True)


# ── Models ──

class TTSRequest(BaseModel):
    text: str
    voice: str = DEFAULT_VOICE
    language: str = "vi"
    pause_ms: int = 500


class TTSLineResult(BaseModel):
    index: int
    text: str
    start_time: float
    end_time: float
    duration: float


class TTSResponse(BaseModel):
    audio_url: str
    srt_url: str
    srt_content: str
    lines: list[TTSLineResult]
    total_duration: float
    voice: str


# ── ffmpeg helpers ──

def ffprobe_duration(filepath: str) -> float:
    """Get audio duration in seconds using ffprobe."""
    try:
        proc = subprocess.Popen(
            [FFPROBE, "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", filepath],
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            stdin=subprocess.DEVNULL,
        )
        stdout, _ = proc.communicate(timeout=10)
        return float(stdout.decode().strip())
    except Exception as e:
        logger.warning(f"ffprobe failed for {filepath}: {e}")
        sz = os.path.getsize(filepath) if os.path.exists(filepath) else 0
        return max(0.1, sz / (16 * 1024))


def ffmpeg_mp3_to_pcm(mp3_path: str, wav_path: str):
    """Decode MP3 → WAV (16-bit PCM, 44100Hz, mono) for clean concatenation."""
    subprocess.run(
        [FFMPEG, "-y", "-loglevel", "error",
         "-i", mp3_path,
         "-ar", "44100", "-ac", "1", "-sample_fmt", "s16",
         wav_path],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        stdin=subprocess.DEVNULL, timeout=15,
    )


def generate_silence_pcm(duration_s: float, sample_rate: int = 44100) -> bytes:
    """Generate raw silence PCM bytes (16-bit mono)."""
    n_samples = int(sample_rate * duration_s)
    return bytes(n_samples * 2)  # 2 bytes per sample, all zeros = silence


def concat_audio_segments(
    segment_mp3s: list[str],
    silence_durations: list[float],
    output_mp3: str,
    batch_dir: str,
):
    """
    Concatenate MP3 segments with silence gaps.
    
    Strategy: decode each MP3 → raw PCM → join PCM + silence → encode once → MP3.
    This avoids MP3 encoder delay artifacts at segment boundaries.
    
    Args:
        segment_mp3s: ordered list of MP3 file paths
        silence_durations: silence (seconds) AFTER each segment (same length as segment_mp3s)
        output_mp3: output combined MP3 path
        batch_dir: temp directory for intermediate WAV files
    """
    SAMPLE_RATE = 44100
    combined_wav = os.path.join(batch_dir, "_combined.wav")
    
    # Collect all PCM data
    all_pcm = bytearray()
    
    for i, mp3_path in enumerate(segment_mp3s):
        # Decode MP3 → WAV
        wav_path = os.path.join(batch_dir, f"_seg_{i:03d}.wav")
        ffmpeg_mp3_to_pcm(mp3_path, wav_path)
        
        if os.path.exists(wav_path):
            # Read PCM data from WAV (skip header)
            try:
                with wave.open(wav_path, "r") as wf:
                    pcm = wf.readframes(wf.getnframes())
                    all_pcm.extend(pcm)
            except Exception as e:
                logger.warning(f"Failed to read WAV {wav_path}: {e}")
            finally:
                os.remove(wav_path)
        
        # Add silence after this segment
        if i < len(silence_durations) and silence_durations[i] > 0:
            all_pcm.extend(generate_silence_pcm(silence_durations[i], SAMPLE_RATE))
    
    # Write combined WAV
    with wave.open(combined_wav, "w") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(bytes(all_pcm))
    
    # Encode WAV → MP3 (single encode = no boundary artifacts)
    subprocess.run(
        [FFMPEG, "-y", "-loglevel", "error",
         "-i", combined_wav,
         "-c:a", "libmp3lame", "-b:a", "128k",
         output_mp3],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        stdin=subprocess.DEVNULL, timeout=60,
    )
    
    # Cleanup
    if os.path.exists(combined_wav):
        os.remove(combined_wav)
    
    if not os.path.exists(output_mp3):
        raise RuntimeError("ffmpeg encode failed — no output")


def format_srt_time(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


# ── Synthesize one line with retry ──

async def synthesize_line(
    client: httpx.AsyncClient, text: str, speaker: str, language: str, retries: int = 3
) -> bytes:
    for attempt in range(retries):
        try:
            resp = await client.post(
                VOLCENGINE_URL,
                json={"text": text, "speaker": speaker, "language": language},
                headers=VOLCENGINE_HEADERS,
                timeout=30.0,
            )
            if resp.status_code != 200:
                logger.warning(f"TTS HTTP {resp.status_code}, attempt {attempt+1}")
                if attempt < retries - 1:
                    await asyncio.sleep(1.5 * (attempt + 1))
                    continue
                raise HTTPException(500, f"API error: HTTP {resp.status_code}")

            data = resp.json()
            audio_b64 = data.get("audio", {}).get("data")
            if not audio_b64:
                logger.warning(f"No audio data, attempt {attempt+1}")
                if attempt < retries - 1:
                    await asyncio.sleep(1.0)
                    continue
                raise HTTPException(500, f"No audio data for: {text[:50]}")

            return base64.b64decode(audio_b64)
        except httpx.RequestError as e:
            logger.warning(f"Network error, attempt {attempt+1}: {e}")
            if attempt < retries - 1:
                await asyncio.sleep(2.0 * (attempt + 1))
                continue
            raise HTTPException(500, f"Network error: {e}")

    raise HTTPException(500, "All retries exhausted")


# ── Endpoints ──

@router.get("/voices")
async def list_voices():
    return JSONResponse(content={
        "voices": [{"code": code, **info} for code, info in VOICES.items()]
    })


@router.post("/synthesize")
async def synthesize(req: TTSRequest):
    """
    1. Synthesize each line → individual MP3 files
    2. Generate silence MP3 for pauses via ffmpeg
    3. Concatenate all via ffmpeg concat demuxer → combined.mp3
    4. Measure durations via ffprobe → accurate SRT
    """
    voice_info = VOICES.get(req.voice)
    if not voice_info:
        raise HTTPException(400, f"Unknown voice: {req.voice}")

    speaker = voice_info["id"]

    # Parse text lines
    raw_lines = req.text.strip().split("\n")
    lines: list[str | None] = []
    for line in raw_lines:
        stripped = line.strip()
        if stripped:
            lines.append(stripped)
        elif lines:
            lines.append(None)

    text_lines = [l for l in lines if l is not None]
    if not text_lines:
        raise HTTPException(400, "No text")

    logger.info(f"=== TTS START: {len(text_lines)} lines, voice={req.voice} ===")

    batch_id = uuid.uuid4().hex[:12]
    batch_dir = os.path.join(TTS_DIR, batch_id)
    os.makedirs(batch_dir, exist_ok=True)

    # Silence durations
    sil_short_dur = req.pause_ms / 1000.0
    sil_long_dur = (req.pause_ms * 2) / 1000.0

    # Synthesize each line → save individual MP3 files
    ordered_mp3s: list[str] = []      # MP3 file paths in order
    ordered_silences: list[float] = []  # silence AFTER each mp3
    line_file_map: dict[int, str] = {}  # line_index → filepath
    line_idx = 0

    async with httpx.AsyncClient() as client:
        for i, line_text in enumerate(lines):
            if line_text is None:
                # Paragraph break: add extra silence to previous segment
                if ordered_silences:
                    ordered_silences[-1] += sil_long_dur
                continue

            logger.info(f"  [{line_idx+1}/{len(text_lines)}] {line_text[:60]}")

            try:
                audio_bytes = await synthesize_line(client, line_text, speaker, req.language)

                fpath = os.path.join(batch_dir, f"line_{line_idx:03d}.mp3")
                with open(fpath, "wb") as f:
                    f.write(audio_bytes)

                logger.info(f"    ✓ {len(audio_bytes):,} bytes")
                ordered_mp3s.append(fpath)
                line_file_map[line_idx] = fpath

                # Determine silence after this segment
                remaining = lines[i+1:]
                next_has_text = any(l is not None for l in remaining)
                if next_has_text:
                    ordered_silences.append(sil_short_dur)
                else:
                    ordered_silences.append(0)  # last segment, no trailing silence

            except HTTPException as he:
                logger.error(f"    ✗ {he.detail}")

            line_idx += 1
            if i < len(lines) - 1:
                await asyncio.sleep(0.5)

    if not ordered_mp3s:
        raise HTTPException(500, "All lines failed")

    logger.info(f"  Synthesized {len(ordered_mp3s)}/{len(text_lines)} lines, concatenating...")

    # Concatenate: decode all MP3→PCM, join with silence, encode once
    audio_filename = f"{batch_id}.mp3"
    audio_path = os.path.join(batch_dir, audio_filename)
    concat_audio_segments(ordered_mp3s, ordered_silences, audio_path, batch_dir)

    # Measure durations with ffprobe for each line
    line_results: list[TTSLineResult] = []
    current_time = 0.0
    result_idx = 0

    for i, line_text in enumerate(lines):
        if line_text is None:
            current_time += sil_long_dur
            continue

        fpath = line_file_map.get(result_idx)
        if fpath and os.path.exists(fpath):
            dur = ffprobe_duration(fpath)
        else:
            result_idx += 1
            continue

        line_results.append(TTSLineResult(
            index=result_idx,
            text=line_text,
            start_time=round(current_time, 3),
            end_time=round(current_time + dur, 3),
            duration=round(dur, 3),
        ))
        current_time += dur

        # Add silence (matches ordered_silences logic)
        remaining = lines[i+1:]
        next_has_text = any(l is not None for l in remaining)
        if next_has_text:
            current_time += sil_short_dur

        result_idx += 1

    total_duration = ffprobe_duration(audio_path)

    # Generate SRT
    srt_entries = []
    for r in line_results:
        srt_entries.append(f"{r.index + 1}")
        srt_entries.append(f"{format_srt_time(r.start_time)} --> {format_srt_time(r.end_time)}")
        srt_entries.append(r.text)
        srt_entries.append("")

    srt_content = "\n".join(srt_entries)
    srt_filename = f"{batch_id}.srt"
    srt_path = os.path.join(batch_dir, srt_filename)
    with open(srt_path, "w", encoding="utf-8") as f:
        f.write(srt_content)

    logger.info(f"=== TTS DONE [{batch_id}]: {len(line_results)} lines, {total_duration:.1f}s ===")

    return TTSResponse(
        audio_url=f"/api/tts/audio/{batch_id}/{audio_filename}",
        srt_url=f"/api/tts/audio/{batch_id}/{srt_filename}",
        srt_content=srt_content,
        lines=line_results,
        total_duration=round(total_duration, 3),
        voice=req.voice,
    )


@router.get("/audio/{batch_id}/{filename}")
async def get_audio_file(batch_id: str, filename: str):
    filepath = os.path.join(TTS_DIR, batch_id, filename)
    if not os.path.exists(filepath):
        raise HTTPException(404, "File not found")
    if filename.endswith(".srt"):
        return FileResponse(filepath, media_type="text/plain; charset=utf-8", filename=filename)
    return FileResponse(filepath, media_type="audio/mpeg", filename=filename)
