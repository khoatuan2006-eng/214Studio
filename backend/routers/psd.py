"""
PSD Upload endpoints with WebSocket progress reporting.
"""
import os
import shutil
import logging
from typing import List
from concurrent.futures import ThreadPoolExecutor

from fastapi import APIRouter, UploadFile, File, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse

from backend.core.psd_processor import process_psd

logger = logging.getLogger(__name__)

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPLOADS_DIR = os.path.join(BACKEND_DIR, "uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)

# Thread pool for batch PSD processing
psd_executor = ThreadPoolExecutor(max_workers=3)

router = APIRouter(tags=["psd"])


# ============================================================
# WEBSOCKET UPLOAD PROGRESS
# ============================================================

class UploadProgressManager:
    """Thread-safe manager for WebSocket clients listening to upload progress."""

    def __init__(self):
        # session_id -> list of WebSocket connections
        self._clients: dict[str, list[WebSocket]] = {}
        import threading
        self._lock = threading.Lock()

    def register(self, session_id: str, ws: WebSocket):
        with self._lock:
            self._clients.setdefault(session_id, []).append(ws)

    def unregister(self, session_id: str, ws: WebSocket):
        with self._lock:
            if session_id in self._clients:
                self._clients[session_id] = [c for c in self._clients[session_id] if c is not ws]

    async def broadcast(self, session_id: str, message: dict):
        import asyncio
        with self._lock:
            targets = list(self._clients.get(session_id, []))
        for ws in targets:
            try:
                await ws.send_json(message)
            except Exception:
                pass


upload_progress_manager = UploadProgressManager()


@router.websocket("/ws/upload-progress/{session_id}")
async def upload_progress_ws(websocket: WebSocket, session_id: str):
    """
    WebSocket endpoint for real-time batch upload progress.
    Connect before calling POST /api/upload-psd/?session_id=<id>
    Messages: { type: 'progress'|'done'|'error', filename, index, total, message }
    """
    await websocket.accept()
    upload_progress_manager.register(session_id, websocket)
    try:
        # Keep connection alive until client disconnects
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        upload_progress_manager.unregister(session_id, websocket)


# ============================================================
# PSD UPLOAD
# ============================================================

def _process_single_psd(file_path: str, filename: str) -> dict:
    """
    Blocking helper: saves, processes a single PSD file, cleans up.
    Runs inside ThreadPoolExecutor.
    """
    try:
        process_psd(file_path)
        logger.info(f"PSD processing completed successfully for: {filename}")
        return {"filename": filename, "status": "success", "error": None}
    except Exception as e:
        logger.error(f"Error processing PSD {filename}: {str(e)}", exc_info=True)
        return {"filename": filename, "status": "error", "error": str(e)}
    finally:
        if os.path.exists(file_path):
            os.remove(file_path)


@router.post("/api/upload-psd/")
async def upload_psd(
    files: List[UploadFile] = File(None),
    file: UploadFile | None = File(None),
    session_id: str | None = Query(None),
):
    """
    Receives one or more PSD files, saves and processes them.
    Uses ThreadPoolExecutor for true parallel batch processing.
    Optional: pass ?session_id=<id> and connect to /ws/upload-progress/<id>
    beforehand to receive real-time progress events.
    Accepts either 'files' (multiple) or 'file' (single) form field.
    """
    import asyncio

    # Merge both field names into a single list for processing
    all_files: List[UploadFile] = []
    if files:
        all_files.extend(files)
    if file:
        all_files.append(file)

    if not all_files:
        raise HTTPException(status_code=400, detail="No files provided. Use field name 'files' or 'file'.")

    results = []
    errors = []
    total = sum(1 for f in all_files if f.filename and f.filename.endswith(".psd"))
    index = 0

    loop = asyncio.get_event_loop()
    pending_tasks: list[tuple[asyncio.Future, str]] = []

    for file in all_files:
        if not file.filename.endswith(".psd"):
            errors.append({"filename": file.filename, "error": "Only .psd files are allowed"})
            continue

        temp_file_path = os.path.join(UPLOADS_DIR, file.filename)

        try:
            with open(temp_file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            logger.info(f"Saved PSD to temporary path: {temp_file_path}")
        except Exception as e:
            errors.append({"filename": file.filename, "error": f"Failed to save: {str(e)}"})
            continue

        pending_tasks.append((
            loop.run_in_executor(psd_executor, _process_single_psd, temp_file_path, file.filename),
            file.filename,
        ))

    # Process tasks with sequential progress reporting
    for fut, filename in pending_tasks:
        index += 1
        if session_id:
            await upload_progress_manager.broadcast(session_id, {
                "type": "progress",
                "filename": filename,
                "index": index,
                "total": total,
                "message": f"Processing {filename} ({index}/{total})...",
            })
        try:
            result = await fut
            if isinstance(result, Exception) or result.get("error"):
                err = str(result) if isinstance(result, Exception) else result["error"]
                errors.append({"filename": filename, "error": err})
                if session_id:
                    await upload_progress_manager.broadcast(session_id, {
                        "type": "error",
                        "filename": filename,
                        "index": index,
                        "total": total,
                        "message": f"❌ {filename}: {err}",
                    })
            else:
                results.append({"filename": result["filename"], "status": "success"})
                if session_id:
                    await upload_progress_manager.broadcast(session_id, {
                        "type": "progress",
                        "filename": filename,
                        "index": index,
                        "total": total,
                        "message": f"✅ {filename} done",
                    })
        except Exception as e:
            errors.append({"filename": filename, "error": str(e)})

    if session_id:
        await upload_progress_manager.broadcast(session_id, {
            "type": "done",
            "total": total,
            "success": len(results),
            "failed": len(errors),
            "message": f"Upload complete: {len(results)}/{total} succeeded.",
        })

    if errors and not results:
        raise HTTPException(status_code=400, detail={"errors": errors})

    return JSONResponse(content={
        "message": "Upload complete",
        "results": results,
        "errors": errors,
    })


def shutdown_psd_executor():
    """Call during app shutdown to clean up the thread pool."""
    psd_executor.shutdown(wait=False)
