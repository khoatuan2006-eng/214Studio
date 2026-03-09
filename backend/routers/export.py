"""
Video Export Engine: chunked frame upload + FFmpeg stitching.
"""
import os
import shutil
import logging
import subprocess

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel

logger = logging.getLogger(__name__)

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXPORTS_DIR = os.path.join(BACKEND_DIR, "exports")
TEMP_RENDER_DIR = os.path.join(BACKEND_DIR, "temp_render")
FFMPEG_PATH = os.path.join(BACKEND_DIR, "bin", "ffmpeg", "ffmpeg.exe")
os.makedirs(EXPORTS_DIR, exist_ok=True)

router = APIRouter(prefix="/api/export", tags=["export"])


# ── Pydantic models ──

class ExportStartRequest(BaseModel):
    totalFrames: int
    fps: int = 30


class ExportChunkRequest(BaseModel):
    renderJobId: str
    chunkIndex: int
    frameOffset: int  # Global index of the first frame in this chunk
    frames: list[str]  # Base64-encoded PNG data (batch of ~10-20 frames)


class ExportFinishRequest(BaseModel):
    renderJobId: str
    fps: int = 30


# ── Endpoints ──

@router.post("/start")
async def export_start(body: ExportStartRequest):
    """
    Phase 1: Initialize a render session.
    Creates a unique job directory to receive frame chunks.
    """
    import uuid
    job_id = str(uuid.uuid4())[:12]
    job_dir = os.path.join(TEMP_RENDER_DIR, job_id)
    os.makedirs(job_dir, exist_ok=True)

    logger.info(f"[Export {job_id}] Session started: {body.totalFrames} frames at {body.fps} FPS")

    return JSONResponse(content={
        "renderJobId": job_id,
        "totalFrames": body.totalFrames,
        "fps": body.fps,
        "status": "ready"
    })


@router.post("/chunk")
async def export_chunk(body: ExportChunkRequest):
    """
    Phase 2: Receive a batch of Base64 frames, decode and write to disk immediately.
    Each chunk contains ~10-20 frames to keep memory usage minimal.
    """
    import base64

    job_dir = os.path.join(TEMP_RENDER_DIR, body.renderJobId)
    if not os.path.exists(job_dir):
        raise HTTPException(status_code=404, detail=f"Render job {body.renderJobId} not found")

    frames_written = 0
    for i, frame_b64 in enumerate(body.frames):
        global_index = body.frameOffset + i
        frame_data = base64.b64decode(frame_b64)
        frame_path = os.path.join(job_dir, f"frame_{global_index:04d}.png")
        with open(frame_path, "wb") as f:
            f.write(frame_data)
        frames_written += 1

    logger.info(f"[Export {body.renderJobId}] Chunk {body.chunkIndex}: wrote {frames_written} frames")

    return JSONResponse(content={
        "renderJobId": body.renderJobId,
        "chunkIndex": body.chunkIndex,
        "framesWritten": frames_written,
        "status": "ok"
    })


@router.post("/finish")
async def export_finish(body: ExportFinishRequest):
    """
    Phase 3: All chunks received. Run FFmpeg to stitch PNGs into MP4.
    Returns the MP4 file for download and cleans up temp frames.
    """
    job_dir = os.path.join(TEMP_RENDER_DIR, body.renderJobId)
    if not os.path.exists(job_dir):
        raise HTTPException(status_code=404, detail=f"Render job {body.renderJobId} not found")

    output_path = os.path.join(EXPORTS_DIR, f"export_{body.renderJobId}.mp4")

    try:
        # Count frames on disk
        frame_files = sorted([f for f in os.listdir(job_dir) if f.endswith('.png')])
        logger.info(f"[Export {body.renderJobId}] Rendering {len(frame_files)} frames at {body.fps} FPS...")

        ffmpeg_cmd = [
            FFMPEG_PATH, "-y",
            "-framerate", str(body.fps),
            "-i", os.path.join(job_dir, "frame_%04d.png"),
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-preset", "fast",
            output_path
        ]
        result = subprocess.run(
            ffmpeg_cmd, capture_output=True, text=True, timeout=300
        )

        if result.returncode != 0:
            logger.error(f"[Export {body.renderJobId}] FFmpeg error: {result.stderr}")
            raise HTTPException(status_code=500, detail=f"FFmpeg failed: {result.stderr[:500]}")

        logger.info(f"[Export {body.renderJobId}] Export complete: {output_path}")

        return FileResponse(
            output_path,
            media_type="video/mp4",
            filename=f"animation_export_{body.renderJobId}.mp4"
        )

    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=500, detail="FFmpeg timed out (5 min limit)")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Export {body.renderJobId}] Error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Export failed: {str(e)}")
    finally:
        # Cleanup temp directory (frames only — MP4 stays until downloaded)
        if os.path.exists(job_dir):
            shutil.rmtree(job_dir, ignore_errors=True)
