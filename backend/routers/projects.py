"""
Project CRUD, Auto-Save, and Export/Import API endpoints.
"""
import os
import json
import shutil
import logging
import tempfile
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Depends, File, UploadFile
from fastapi.responses import JSONResponse, FileResponse
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.core.models import Project
from backend.core.schemas import ProjectCreate, ProjectUpdate, AutoSaveRequest
from backend.core.project_exporter import export_project, import_project

logger = logging.getLogger(__name__)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUTOSAVE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".autosave")
AUTOSAVE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), os.pardir, ".autosave")
# Normalize so it resolves to backend/.autosave
AUTOSAVE_DIR = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".autosave"))

router = APIRouter(prefix="/api", tags=["projects"])


# ============================================================
# PROJECT CRUD API
# ============================================================

@router.get("/projects/")
async def list_projects(db: Session = Depends(get_db)):
    """List all projects (lightweight, no data blob)."""
    projects = db.query(Project).order_by(Project.updated_at.desc()).all()
    return JSONResponse(content=[p.to_list_item() for p in projects])


@router.post("/projects/", status_code=201)
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


@router.get("/projects/{project_id}")
async def get_project(project_id: str, db: Session = Depends(get_db)):
    """Get a project by ID (full data)."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return JSONResponse(content=project.to_dict())


@router.put("/projects/{project_id}")
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


@router.delete("/projects/{project_id}")
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
# AUTO-SAVE API
# ============================================================

@router.post("/projects/{project_id}/autosave")
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


@router.get("/projects/{project_id}/autosave")
async def get_autosave(project_id: str):
    """Retrieve the latest auto-save draft for a project."""
    draft_path = os.path.join(AUTOSAVE_DIR, f"draft_{project_id}.json")
    if not os.path.exists(draft_path):
        raise HTTPException(status_code=404, detail="No auto-save found")

    with open(draft_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return JSONResponse(content=data)


# ============================================================
# PROJECT EXPORT / IMPORT
# ============================================================

@router.get("/projects/{project_id}/export")
async def export_project_endpoint(project_id: str, db: Session = Depends(get_db)):
    """Export a project as a .animestudio file (ZIP)."""
    try:
        backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        export_dir = os.path.join(backend_dir, "exports")
        os.makedirs(export_dir, exist_ok=True)
        zip_path = export_project(db, project_id, export_dir)
        return FileResponse(
            zip_path,
            media_type="application/zip",
            filename=os.path.basename(zip_path)
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/projects/import")
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
