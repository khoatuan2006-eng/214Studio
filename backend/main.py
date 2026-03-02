import os
import shutil
import sys
import json
import logging
import tempfile
from datetime import datetime, timezone
from typing import List
from concurrent.futures import ThreadPoolExecutor

# Absolute paths setup first to fix import errors when running directly
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(BASE_DIR))

from fastapi import FastAPI, UploadFile, File, HTTPException, Request, Body, Depends, Query, APIRouter, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.core.library_manager import (
    load_library, create_category, update_category, delete_category,
    create_subfolder, add_asset_to_subfolder, rename_subfolder, delete_subfolder
)
from backend.core.database import get_db, init_db
from backend.core.models import Project, Asset, AssetVersion
from backend.core.schemas import ProjectCreate, ProjectUpdate, AutoSaveRequest
from backend.core.project_exporter import export_project, import_project

# Pydantic models for custom taxonomy requests
class CategoryCreate(BaseModel):
    name: str
    z_index: int

class CategoryUpdate(BaseModel):
    cat_id: str
    name: str | None = None
    z_index: int | None = None

class SubfolderCreate(BaseModel):
    cat_id: str
    name: str

class SubfolderRename(BaseModel):
    cat_id: str
    old_name: str
    new_name: str

class AssetAdd(BaseModel):
    cat_id: str
    sub_name: str
    asset_name: str
    asset_hash: str


# Set up logging configuration
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "app.log"), encoding='utf-8'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Absolute paths
UPLOADS_DIR = os.path.join(BASE_DIR, "uploads")
STORAGE_DIR = os.path.join(BASE_DIR, "storage")
AUTOSAVE_DIR = os.path.join(BASE_DIR, ".autosave")
THUMBNAILS_DIR = os.path.join(STORAGE_DIR, "thumbnails")
FRONTEND_DIR = os.path.join(os.path.dirname(BASE_DIR), "frontend")

os.makedirs(UPLOADS_DIR, exist_ok=True)
os.makedirs(STORAGE_DIR, exist_ok=True)
os.makedirs(AUTOSAVE_DIR, exist_ok=True)
os.makedirs(THUMBNAILS_DIR, exist_ok=True)

# Thread pool for batch PSD processing
psd_executor = ThreadPoolExecutor(max_workers=3)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize database on startup
    init_db()
    logger.info("Database initialized successfully")
    yield
    # Cleanup
    psd_executor.shutdown(wait=False)

app = FastAPI(title="Anime Studio Builder API", lifespan=lifespan)

# Global exception handler to prevent server crashes on Unhandled Python exceptions
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled server error: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal Server Error: {str(exc)}"}
    )

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust this in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve static files (Faces, Bodies, Frontend, and shared Assets)
app.mount("/static", StaticFiles(directory=STORAGE_DIR), name="static")

# Mount the shared asset pool explicitly at /assets so frontend can request /assets/<hash>.png
os.makedirs(os.path.join(STORAGE_DIR, "assets"), exist_ok=True)
app.mount("/assets", StaticFiles(directory=os.path.join(STORAGE_DIR, "assets")), name="assets")

# Mount thumbnails
app.mount("/thumbnails", StaticFiles(directory=THUMBNAILS_DIR), name="thumbnails")

app.mount("/css", StaticFiles(directory=os.path.join(FRONTEND_DIR, "css")), name="frontend_css")
app.mount("/js", StaticFiles(directory=os.path.join(FRONTEND_DIR, "js")), name="frontend_js")

from backend.core.psd_processor import process_psd, load_db

@app.get("/")
async def serve_frontend():
    """Serve the main frontend HTML file at the root URL."""
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))

@app.get("/api/characters/")
async def get_characters():
    """Returns the database.json array."""
    data = load_db()
    return JSONResponse(content=data)


# ============================================================
# PROJECT CRUD API (Roadmap 1.3)
# ============================================================

@app.get("/api/projects/")
async def list_projects(db: Session = Depends(get_db)):
    """List all projects (lightweight, no data blob)."""
    projects = db.query(Project).order_by(Project.updated_at.desc()).all()
    return JSONResponse(content=[p.to_list_item() for p in projects])


@app.post("/api/projects/", status_code=201)
async def create_project(body: ProjectCreate, db: Session = Depends(get_db)):
    """Create a new project."""
    project = Project(
        name=body.name,
        description=body.description,
        canvas_width=body.canvas_width,
        canvas_height=body.canvas_height,
        fps=body.fps,
        data=body.data,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    logger.info(f"Created project: {project.name} ({project.id})")
    return JSONResponse(content=project.to_dict(), status_code=201)


@app.get("/api/projects/{project_id}")
async def get_project(project_id: str, db: Session = Depends(get_db)):
    """Get a project by ID (full data)."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return JSONResponse(content=project.to_dict())


@app.put("/api/projects/{project_id}")
async def update_project(project_id: str, body: ProjectUpdate, db: Session = Depends(get_db)):
    """Update a project."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if body.name is not None:
        project.name = body.name
    if body.description is not None:
        project.description = body.description
    if body.canvas_width is not None:
        project.canvas_width = body.canvas_width
    if body.canvas_height is not None:
        project.canvas_height = body.canvas_height
    if body.fps is not None:
        project.fps = body.fps
    if body.data is not None:
        project.data = body.data

    db.commit()
    db.refresh(project)
    logger.info(f"Updated project: {project.name} ({project.id})")
    return JSONResponse(content=project.to_dict())


@app.delete("/api/projects/{project_id}")
async def delete_project(project_id: str, db: Session = Depends(get_db)):
    """Delete a project."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Also remove autosave
    autosave_path = os.path.join(AUTOSAVE_DIR, f"draft_{project_id}.json")
    if os.path.exists(autosave_path):
        os.remove(autosave_path)

    db.delete(project)
    db.commit()
    logger.info(f"Deleted project: {project_id}")
    return JSONResponse(content={"message": "Deleted"})


# ============================================================
# AUTO-SAVE API (Roadmap 1.4)
# ============================================================

@app.post("/api/projects/{project_id}/autosave")
async def autosave_project(project_id: str, body: AutoSaveRequest, db: Session = Depends(get_db)):
    """Save a draft of the project to .autosave/ directory."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    draft_path = os.path.join(AUTOSAVE_DIR, f"draft_{project_id}.json")
    draft_data = {
        "project_id": project_id,
        "data": body.data,
        "saved_at": datetime.now(timezone.utc).isoformat(),
    }
    with open(draft_path, "w", encoding="utf-8") as f:
        json.dump(draft_data, f, ensure_ascii=False)

    return JSONResponse(content={"message": "Auto-saved", "path": draft_path})


@app.get("/api/projects/{project_id}/autosave")
async def get_autosave(project_id: str):
    """Retrieve the latest auto-save draft for a project."""
    draft_path = os.path.join(AUTOSAVE_DIR, f"draft_{project_id}.json")
    if not os.path.exists(draft_path):
        raise HTTPException(status_code=404, detail="No auto-save found")

    with open(draft_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return JSONResponse(content=data)


# ============================================================
# PROJECT EXPORT / IMPORT (Roadmap 1.6)
# ============================================================

@app.get("/api/projects/{project_id}/export")
async def export_project_endpoint(project_id: str, db: Session = Depends(get_db)):
    """Export a project as a .animestudio file (ZIP)."""
    try:
        export_dir = os.path.join(BASE_DIR, "exports")
        os.makedirs(export_dir, exist_ok=True)
        zip_path = export_project(db, project_id, export_dir)
        return FileResponse(
            zip_path,
            media_type="application/zip",
            filename=os.path.basename(zip_path)
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.post("/api/projects/import")
async def import_project_endpoint(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Import a .animestudio file and create a new project."""
    if not file.filename.endswith(".animestudio"):
        raise HTTPException(status_code=400, detail="Only .animestudio files are allowed")

    # Save uploaded file to temp
    with tempfile.NamedTemporaryFile(delete=False, suffix=".animestudio") as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name

    try:
        project = import_project(db, tmp_path)
        return JSONResponse(content=project.to_dict(), status_code=201)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Import failed: {str(e)}")
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


# ============================================================
# P1-2.2: WEBSOCKET UPLOAD PROGRESS
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


@app.websocket("/ws/upload-progress/{session_id}")
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
# PSD UPLOAD (Original + Batch support — Roadmap 2.2)
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


@app.post("/api/upload-psd/")
async def upload_psd(
    files: List[UploadFile] = File(...),
    session_id: str | None = Query(None),
):
    """
    Receives one or more PSD files, saves and processes them.
    Uses ThreadPoolExecutor for true parallel batch processing.
    Optional: pass ?session_id=<id> and connect to /ws/upload-progress/<id>
    beforehand to receive real-time progress events (P1-2.2).
    """
    import asyncio

    results = []
    errors = []
    total = sum(1 for f in files if f.filename.endswith(".psd"))
    index = 0

    loop = asyncio.get_event_loop()
    pending_tasks: list[tuple[asyncio.Future, str]] = []

    for file in files:
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


# ============================================================
# ASSET API (Roadmap 2.4, 2.6)
# ============================================================

@app.get("/api/assets/")
async def search_assets(
    name: str | None = Query(None),
    category: str | None = Query(None),
    character: str | None = Query(None),
    z_index: int | None = Query(None),
    include_deleted: bool = Query(False),
    db: Session = Depends(get_db),
):
    """Search and filter assets. By default excludes soft-deleted assets."""
    query = db.query(Asset)
    if not include_deleted:
        query = query.filter(Asset.is_deleted == False)  # noqa: E712
    if name:
        query = query.filter(Asset.original_name.ilike(f"%{name}%"))
    if category:
        query = query.filter(Asset.category == category)
    if character:
        query = query.filter(Asset.character_name.ilike(f"%{character}%"))
    if z_index is not None:
        query = query.filter(Asset.z_index == z_index)

    assets = query.order_by(Asset.created_at.desc()).limit(200).all()
    return JSONResponse(content=[a.to_dict() for a in assets])


# P1-2.4: Soft delete — move asset to trash instead of permanent delete
@app.delete("/api/assets/{asset_hash}")
async def delete_asset(asset_hash: str, db: Session = Depends(get_db)):
    """
    Soft-delete an asset: sets is_deleted=True in SQLite.
    Files and references are kept; use /api/assets/{hash}/restore to recover.
    Use /api/assets/{hash}/purge for permanent deletion.
    """
    asset = db.query(Asset).filter(Asset.hash_sha256 == asset_hash).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    asset.is_deleted = True
    db.commit()
    logger.info(f"Soft-deleted asset: {asset_hash}")
    return JSONResponse(content={"message": "Asset moved to trash", "hash": asset_hash})


# P1-2.4: Restore asset from trash
@app.post("/api/assets/{asset_hash}/restore")
async def restore_asset(asset_hash: str, db: Session = Depends(get_db)):
    """Restore a soft-deleted asset from the trash bin."""
    asset = db.query(Asset).filter(Asset.hash_sha256 == asset_hash).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    if not asset.is_deleted:
        return JSONResponse(content={"message": "Asset is not in trash"})
    asset.is_deleted = False
    db.commit()
    logger.info(f"Restored asset: {asset_hash}")
    return JSONResponse(content={"message": "Asset restored", "hash": asset_hash})


# P1-2.4: Trash bin list
@app.get("/api/assets/trash")
async def list_trash(db: Session = Depends(get_db)):
    """Return all soft-deleted assets (the trash bin)."""
    assets = db.query(Asset).filter(Asset.is_deleted == True).all()  # noqa: E712
    return JSONResponse(content=[a.to_dict() for a in assets])


# P1-2.4: Permanent purge of a trashed asset
@app.delete("/api/assets/{asset_hash}/purge")
async def purge_asset(asset_hash: str, db: Session = Depends(get_db)):
    """
    Permanently delete a trashed asset. Cascade removes:
    - SQLite row, asset file, thumbnail, database.json refs, custom_library.json refs.
    """
    asset = db.query(Asset).filter(Asset.hash_sha256 == asset_hash).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    if not asset.is_deleted:
        raise HTTPException(status_code=400, detail="Asset must be in trash before purging. Use DELETE /api/assets/{hash} first.")

    db.delete(asset)
    db.commit()

    # Remove asset file
    asset_file = os.path.join(STORAGE_DIR, "assets", f"{asset_hash}.png")
    if os.path.exists(asset_file):
        os.remove(asset_file)

    # Remove thumbnail
    thumb_file = os.path.join(THUMBNAILS_DIR, f"{asset_hash}_thumb.png")
    if os.path.exists(thumb_file):
        os.remove(thumb_file)

    # Cascade remove from database.json (characters)
    char_db = load_db()
    modified = False
    for char in char_db:
        for group_name, layers in char.get("layer_groups", {}).items():
            original_len = len(layers)
            char["layer_groups"][group_name] = [
                l for l in layers if l.get("hash") != asset_hash
            ]
            if len(char["layer_groups"][group_name]) < original_len:
                modified = True

    if modified:
        from backend.core.psd_processor import save_db as save_char_db
        save_char_db(char_db)

    # Cascade remove from custom_library.json
    lib = load_library()
    lib_modified = False
    for cat in lib.get("categories", []):
        for sub in cat.get("subfolders", []):
            original_len = len(sub.get("assets", []))
            sub["assets"] = [a for a in sub.get("assets", []) if a.get("hash") != asset_hash]
            if len(sub["assets"]) < original_len:
                lib_modified = True

    if lib_modified:
        from backend.core.library_manager import save_library
        save_library(lib)

    logger.info(f"Permanently purged asset: {asset_hash}")
    return JSONResponse(content={"message": "Asset permanently deleted"})


# P1-2.1: Get version history for an asset
@app.get("/api/assets/{asset_hash}/versions")
async def get_asset_versions(asset_hash: str, db: Session = Depends(get_db)):
    """Return all historical versions of an asset (sorted newest first)."""
    asset = db.query(Asset).filter(Asset.hash_sha256 == asset_hash).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    versions = (
        db.query(AssetVersion)
        .filter(AssetVersion.asset_id == asset.id)
        .order_by(AssetVersion.version.desc())
        .all()
    )
    return JSONResponse(content={
        "asset": asset.to_dict(),
        "versions": [v.to_dict() for v in versions],
    })


# --- Custom Library API Endpoints ---
@app.get("/api/library/")
async def get_library():
    return JSONResponse(content=load_library())

@app.post("/api/library/category/")
async def add_category(data: CategoryCreate):
    return JSONResponse(content=create_category(data.name, data.z_index))

@app.put("/api/library/category/")
async def update_category_endpoint(data: CategoryUpdate):
    cat = update_category(data.cat_id, data.name, data.z_index)
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    return JSONResponse(content=cat)

@app.delete("/api/library/category/{cat_id}")
async def delete_category_endpoint(cat_id: str):
    success = delete_category(cat_id)
    if not success:
        raise HTTPException(status_code=404, detail="Category not found")
    return JSONResponse(content={"message": "Deleted"})

@app.post("/api/library/subfolder/")
async def add_subfolder(data: SubfolderCreate):
    cat = create_subfolder(data.cat_id, data.name)
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    return JSONResponse(content=cat)

@app.put("/api/library/subfolder/")
async def rename_subfolder_endpoint(data: SubfolderRename):
    cat = rename_subfolder(data.cat_id, data.old_name, data.new_name)
    if not cat:
        raise HTTPException(status_code=404, detail="Category or Subfolder not found")
    return JSONResponse(content=cat)

@app.delete("/api/library/subfolder/{cat_id}/{sub_name}")
async def delete_subfolder_endpoint(cat_id: str, sub_name: str):
    success = delete_subfolder(cat_id, sub_name)
    if not success:
        raise HTTPException(status_code=404, detail="Subfolder not found")
    return JSONResponse(content={"message": "Deleted"})

@app.post("/api/library/asset/")
async def add_asset(data: AssetAdd):
    cat = add_asset_to_subfolder(data.cat_id, data.sub_name, data.asset_name, data.asset_hash)
    if not cat:
        raise HTTPException(status_code=404, detail="Category or Subfolder not found")
    return JSONResponse(content=cat)


# ============================================================
# VIDEO EXPORT ENGINE — Chunked Upload (P2 Sprint 2)
# ============================================================

EXPORTS_DIR = os.path.join(BASE_DIR, "exports")
TEMP_RENDER_DIR = os.path.join(BASE_DIR, "temp_render")
FFMPEG_PATH = os.path.join(BASE_DIR, "bin", "ffmpeg", "ffmpeg.exe")
os.makedirs(EXPORTS_DIR, exist_ok=True)


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


@app.post("/api/export/start")
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


@app.post("/api/export/chunk")
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


@app.post("/api/export/finish")
async def export_finish(body: ExportFinishRequest):
    """
    Phase 3: All chunks received. Run FFmpeg to stitch PNGs into MP4.
    Returns the MP4 file for download and cleans up temp frames.
    """
    import subprocess

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


# ============================================================
# AI GATEWAY — Automation API (P3 Sprint 2 — Roadmap 9.2/9.5)
# ============================================================

class CharacterAction(BaseModel):
    """A single animation action for a character (LLM-friendly)."""
    type: str  # "move", "scale", "rotate", "fade"
    start_time: float = 0.0
    end_time: float = 3.0
    # Movement
    start_x: float | None = None
    end_x: float | None = None
    start_y: float | None = None
    end_y: float | None = None
    # Scale
    start_scale: float | None = None
    end_scale: float | None = None
    # Rotation
    start_rotation: float | None = None
    end_rotation: float | None = None
    # Opacity (fade)
    start_opacity: float | None = None
    end_opacity: float | None = None
    # Easing
    easing: str = "easeInOut"


class ScriptCharacter(BaseModel):
    """A character entry in the StoryScript."""
    name: str
    asset_id: str = ""
    asset_hash: str = ""
    actions: list[CharacterAction] = []
    # Optional initial position
    initial_x: float = 960.0
    initial_y: float = 540.0
    initial_scale: float = 1.0


class StoryScript(BaseModel):
    """
    LLM-friendly animation script format.
    Designed for easy generation by ChatGPT/Claude.
    """
    title: str = "Untitled Scene"
    description: str = ""
    fps: int = 30
    canvas_width: int = 1920
    canvas_height: int = 1080
    characters: list[ScriptCharacter] = []


@app.post("/api/automation/generate")
async def automation_generate(script: StoryScript):
    """
    AI Gateway: Translate a simple StoryScript JSON into a full
    AnimeStudio project using the Python SDK.

    Returns the created project ID.
    """
    from backend.animestudio import Project, save_to_db

    # Create project from script
    project = Project(
        name=script.title,
        description=script.description,
        canvas_width=script.canvas_width,
        canvas_height=script.canvas_height,
        fps=script.fps,
    )

    for char in script.characters:
        track = project.add_track(
            name=char.name,
            character_id=char.asset_id or None,
        )

        # Set initial position keyframes
        track.add_keyframe("x", time=0.0, value=char.initial_x)
        track.add_keyframe("y", time=0.0, value=char.initial_y)
        track.add_keyframe("scale", time=0.0, value=char.initial_scale)
        track.add_keyframe("opacity", time=0.0, value=1.0)

        # Add an action block if asset_hash is provided
        if char.asset_hash:
            # Calculate max duration from actions
            max_end = max((a.end_time for a in char.actions), default=5.0)
            track.add_action(
                asset_hash=char.asset_hash,
                start=0.0,
                end=max_end,
                z_index=0,
            )

        # Process each action into keyframes
        for action in char.actions:
            easing = action.easing or "easeInOut"

            if action.type == "move":
                if action.start_x is not None and action.end_x is not None:
                    track.add_keyframe("x", time=action.start_time, value=action.start_x, easing=easing)
                    track.add_keyframe("x", time=action.end_time, value=action.end_x, easing=easing)
                if action.start_y is not None and action.end_y is not None:
                    track.add_keyframe("y", time=action.start_time, value=action.start_y, easing=easing)
                    track.add_keyframe("y", time=action.end_time, value=action.end_y, easing=easing)

            elif action.type == "scale":
                if action.start_scale is not None and action.end_scale is not None:
                    track.add_keyframe("scale", time=action.start_time, value=action.start_scale, easing=easing)
                    track.add_keyframe("scale", time=action.end_time, value=action.end_scale, easing=easing)

            elif action.type == "rotate":
                if action.start_rotation is not None and action.end_rotation is not None:
                    track.add_keyframe("rotation", time=action.start_time, value=action.start_rotation, easing=easing)
                    track.add_keyframe("rotation", time=action.end_time, value=action.end_rotation, easing=easing)

            elif action.type == "fade":
                if action.start_opacity is not None and action.end_opacity is not None:
                    track.add_keyframe("opacity", time=action.start_time, value=action.start_opacity, easing=easing)
                    track.add_keyframe("opacity", time=action.end_time, value=action.end_opacity, easing=easing)

    # Save to database
    project_id = save_to_db(project)

    logger.info(f"[Automation] Generated project '{script.title}' with {len(script.characters)} characters → ID: {project_id}")

    return JSONResponse(content={
        "projectId": project_id,
        "title": script.title,
        "tracks": len(script.characters),
        "status": "created",
    })


# ============================================================
# BACKGROUND LIBRARY API (Workflow Sprint 6)
# ============================================================

BACKGROUNDS_DIR = os.path.join(STORAGE_DIR, "backgrounds")
os.makedirs(BACKGROUNDS_DIR, exist_ok=True)

ALLOWED_BG_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"}


@app.get("/api/backgrounds")
async def list_backgrounds():
    """List all background images in the backgrounds library."""
    backgrounds = []
    if os.path.exists(BACKGROUNDS_DIR):
        for fname in sorted(os.listdir(BACKGROUNDS_DIR)):
            ext = os.path.splitext(fname)[1].lower()
            if ext in ALLOWED_BG_EXTENSIONS:
                fpath = os.path.join(BACKGROUNDS_DIR, fname)
                backgrounds.append({
                    "name": fname,
                    "path": f"backgrounds/{fname}",
                    "url": f"/static/backgrounds/{fname}",
                    "size": os.path.getsize(fpath),
                })
    return JSONResponse(content=backgrounds)


@app.post("/api/backgrounds/upload")
async def upload_background(files: List[UploadFile] = File(...)):
    """Upload one or more background images to the library."""
    uploaded = []
    errors = []

    for file in files:
        ext = os.path.splitext(file.filename)[1].lower()
        if ext not in ALLOWED_BG_EXTENSIONS:
            errors.append({"filename": file.filename, "error": f"Invalid format. Allowed: {', '.join(ALLOWED_BG_EXTENSIONS)}"})
            continue

        # Sanitize filename
        safe_name = file.filename.replace(" ", "_")
        dest = os.path.join(BACKGROUNDS_DIR, safe_name)

        # Avoid overwriting — add suffix
        counter = 1
        base, ext_part = os.path.splitext(safe_name)
        while os.path.exists(dest):
            safe_name = f"{base}_{counter}{ext_part}"
            dest = os.path.join(BACKGROUNDS_DIR, safe_name)
            counter += 1

        try:
            with open(dest, "wb") as f:
                shutil.copyfileobj(file.file, f)
            uploaded.append({
                "name": safe_name,
                "path": f"backgrounds/{safe_name}",
                "url": f"/static/backgrounds/{safe_name}",
                "size": os.path.getsize(dest),
            })
            logger.info(f"Background uploaded: {safe_name}")
        except Exception as e:
            errors.append({"filename": file.filename, "error": str(e)})

    return JSONResponse(content={"uploaded": uploaded, "errors": errors})


@app.delete("/api/backgrounds/{filename}")
async def delete_background(filename: str):
    """Delete a background image from the library."""
    fpath = os.path.join(BACKGROUNDS_DIR, filename)
    if not os.path.exists(fpath):
        raise HTTPException(status_code=404, detail="Background not found")
    os.remove(fpath)
    logger.info(f"Background deleted: {filename}")
    return JSONResponse(content={"message": "Deleted", "filename": filename})


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8001, reload=True)
