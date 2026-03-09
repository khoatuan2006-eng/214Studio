"""
PSD Upload V2 endpoints — jointed-limb aware processing.

Separate from v1 (psd.py) to avoid any interference.
Uploads through /api/v2/ are processed by psd_processor_v2
and stored in database_v2.json.
"""
import os
import shutil
import logging
from typing import List
from concurrent.futures import ThreadPoolExecutor

from fastapi import APIRouter, UploadFile, File, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse

from backend.core.psd_processor_v2 import process_psd_v2, load_db_v2

logger = logging.getLogger(__name__)

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPLOADS_DIR = os.path.join(BACKEND_DIR, "uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)

# Thread pool for batch V2 PSD processing
psd_v2_executor = ThreadPoolExecutor(max_workers=2)

router = APIRouter(prefix="/api/v2", tags=["psd-v2"])


# ── V2 Characters list ──────────────────────────────────────

@router.get("/characters/")
async def get_characters_v2():
    """Returns all V2 characters from database_v2.json."""
    data = load_db_v2()
    return JSONResponse(content=data)


@router.get("/characters/{char_id}")
async def get_character_v2(char_id: str):
    """Returns a single V2 character by ID."""
    data = load_db_v2()
    char = next((c for c in data if c["id"] == char_id), None)
    if not char:
        raise HTTPException(status_code=404, detail=f"Character '{char_id}' not found in V2 database")
    return JSONResponse(content=char)


# ── V2 Upload ────────────────────────────────────────────────

def _process_single_psd_v2(file_path: str, filename: str) -> dict:
    """
    Blocking helper: processes a single PSD via V2 pipeline, then cleans up.
    Runs inside ThreadPoolExecutor.
    """
    try:
        result = process_psd_v2(file_path)
        logger.info(f"[V2] PSD processing completed: {filename} -> type={result.get('psd_type')}")
        return {
            "filename": filename,
            "status": "success",
            "error": None,
            "character_id": result.get("id"),
            "psd_type": result.get("psd_type"),
        }
    except Exception as e:
        logger.error(f"[V2] Error processing PSD {filename}: {str(e)}", exc_info=True)
        return {"filename": filename, "status": "error", "error": str(e)}
    finally:
        if os.path.exists(file_path):
            os.remove(file_path)


@router.post("/upload-psd/")
async def upload_psd_v2(
    files: List[UploadFile] = File(None),
    file: UploadFile | None = File(None),
):
    """
    Upload one or more PSD files for V2 processing.
    
    Auto-detects jointed vs flat PSD and processes accordingly.
    Results are stored in database_v2.json (separate from V1).
    """
    import asyncio

    # Merge both field names
    all_files: List[UploadFile] = []
    if files:
        all_files.extend(files)
    if file:
        all_files.append(file)

    if not all_files:
        raise HTTPException(status_code=400, detail="No files provided. Use field name 'files' or 'file'.")

    results = []
    errors = []
    loop = asyncio.get_event_loop()

    for f in all_files:
        if not f.filename or not f.filename.endswith(".psd"):
            errors.append({"filename": f.filename or "(unknown)", "error": "Only .psd files are allowed"})
            continue

        temp_file_path = os.path.join(UPLOADS_DIR, f"v2_{f.filename}")

        try:
            with open(temp_file_path, "wb") as buf:
                shutil.copyfileobj(f.file, buf)
            logger.info(f"[V2] Saved PSD to temp: {temp_file_path}")
        except Exception as e:
            errors.append({"filename": f.filename, "error": f"Failed to save: {str(e)}"})
            continue

        try:
            result = await loop.run_in_executor(
                psd_v2_executor, _process_single_psd_v2, temp_file_path, f.filename
            )
            if result.get("error"):
                errors.append({"filename": f.filename, "error": result["error"]})
            else:
                results.append(result)
        except Exception as e:
            errors.append({"filename": f.filename, "error": str(e)})

    if errors and not results:
        raise HTTPException(status_code=400, detail={"errors": errors})

    return JSONResponse(content={
        "message": f"V2 upload complete: {len(results)}/{len(results)+len(errors)} succeeded",
        "results": results,
        "errors": errors,
    })


def shutdown_psd_v2_executor():
    """Call during app shutdown to clean up the v2 thread pool."""
    psd_v2_executor.shutdown(wait=False)
