"""
Project export/import as .animestudio files (ZIP of project.json + asset PNGs).
"""
import os
import json
import zipfile
import tempfile
import uuid
import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session
from backend.core.models import Project, Asset

logger = logging.getLogger(__name__)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STORAGE_DIR = os.path.join(BASE_DIR, "storage")
ASSETS_DIR = os.path.join(STORAGE_DIR, "assets")


def export_project(db: Session, project_id: str, output_dir: str) -> str:
    """
    Export a project to a .animestudio file (ZIP archive).
    Returns the path to the created file.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise ValueError(f"Project {project_id} not found")

    project_dict = project.to_dict()

    # Collect referenced asset hashes from project data
    asset_hashes = _extract_asset_hashes(project_dict.get("data", {}))

    # Create ZIP file
    os.makedirs(output_dir, exist_ok=True)
    safe_name = "".join(c if c.isalnum() or c in "-_ " else "_" for c in project.name)
    zip_filename = f"{safe_name}_{project_id[:8]}.animestudio"
    zip_path = os.path.join(output_dir, zip_filename)

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        # Write project JSON
        zf.writestr("project.json", json.dumps(project_dict, indent=2, ensure_ascii=False))

        # Write referenced assets
        for asset_hash in asset_hashes:
            asset_file = os.path.join(ASSETS_DIR, f"{asset_hash}.png")
            if os.path.exists(asset_file):
                zf.write(asset_file, f"assets/{asset_hash}.png")

    logger.info(f"Exported project '{project.name}' to {zip_path}")
    return zip_path


def import_project(db: Session, zip_path: str) -> Project:
    """
    Import a .animestudio ZIP file. Creates a new project and registers assets.
    Returns the new Project object.
    """
    with zipfile.ZipFile(zip_path, "r") as zf:
        # Read project JSON
        if "project.json" not in zf.namelist():
            raise ValueError("Invalid .animestudio file: missing project.json")

        project_data = json.loads(zf.read("project.json"))

        # Extract assets to storage
        for name in zf.namelist():
            if name.startswith("assets/") and name.endswith(".png"):
                asset_dest = os.path.join(ASSETS_DIR, os.path.basename(name))
                if not os.path.exists(asset_dest):
                    zf.extract(name, STORAGE_DIR)
                    # zipfile extracts to STORAGE_DIR/assets/xxx.png which is correct
                    logger.info(f"Imported asset: {os.path.basename(name)}")

    # Create new project with a new ID
    new_project = Project(
        id=str(uuid.uuid4()),
        name=project_data.get("name", "Imported Project") + " (imported)",
        description=project_data.get("description", ""),
        canvas_width=project_data.get("canvas_width", 1920),
        canvas_height=project_data.get("canvas_height", 1080),
        fps=project_data.get("fps", 24),
        data=project_data.get("data", {}),
    )

    db.add(new_project)
    db.commit()
    db.refresh(new_project)

    logger.info(f"Imported project '{new_project.name}' with id {new_project.id}")
    return new_project


def _extract_asset_hashes(data: dict) -> set[str]:
    """
    Recursively walk through project data and extract asset hash references.
    """
    hashes = set()

    def _walk(obj):
        if isinstance(obj, dict):
            for key, value in obj.items():
                if key in ("assetHash", "hash", "hash_sha256", "mediaId") and isinstance(value, str) and value:
                    # Looks like a hash (alphanumeric, reasonable length)
                    if len(value) >= 16 and value.isalnum():
                        hashes.add(value)
                _walk(value)
        elif isinstance(obj, list):
            for item in obj:
                _walk(item)

    _walk(data)
    return hashes
