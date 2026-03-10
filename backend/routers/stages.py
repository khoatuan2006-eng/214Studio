"""
Stage Assets API: list, upload, and delete stage layer assets.
Supports images (PNG, JPG, WebP, GIF, BMP, PSD) and videos (MP4, WebM, MOV).
PSD files are automatically flattened to PNG on upload.
"""
import os
import shutil
import logging
from typing import List

from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STORAGE_DIR = os.path.join(BACKEND_DIR, "storage")
STAGES_DIR = os.path.join(STORAGE_DIR, "stages")
os.makedirs(STAGES_DIR, exist_ok=True)

ALLOWED_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".psd"}
ALLOWED_VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov"}
ALLOWED_FLA_EXTENSIONS = {".fla", ".xfl"}
ALLOWED_EXTENSIONS = ALLOWED_IMAGE_EXTENSIONS | ALLOWED_VIDEO_EXTENSIONS | ALLOWED_FLA_EXTENSIONS


def _detect_source(ext: str) -> str:
    """Detect source type from file extension."""
    if ext in ALLOWED_VIDEO_EXTENSIONS:
        return "video"
    if ext in ALLOWED_FLA_EXTENSIONS:
        return "fla"
    return "image"


def _flatten_psd_to_png(psd_path: str, output_dir: str) -> str:
    """Flatten all visible PSD layers into a single PNG."""
    from psd_tools import PSDImage

    psd = PSDImage.open(psd_path)
    composite = psd.composite()
    base_name = os.path.splitext(os.path.basename(psd_path))[0]
    if base_name.startswith("_temp_"):
        base_name = base_name[6:]
    png_name = f"{base_name}.png"
    out_path = os.path.join(output_dir, png_name)

    counter = 1
    while os.path.exists(out_path):
        png_name = f"{base_name}_{counter}.png"
        out_path = os.path.join(output_dir, png_name)
        counter += 1

    composite.save(out_path)
    logger.info(f"PSD flattened to PNG: {psd_path} → {png_name}")
    return png_name


router = APIRouter(prefix="/api/stages", tags=["stages"])


@router.get("")
async def list_stages():
    """List all stage assets."""
    items = []
    if os.path.exists(STAGES_DIR):
        for fname in sorted(os.listdir(STAGES_DIR)):
            ext = os.path.splitext(fname)[1].lower()
            if ext in ALLOWED_EXTENSIONS:
                fpath = os.path.join(STAGES_DIR, fname)
                items.append({
                    "name": fname,
                    "path": f"stages/{fname}",
                    "url": f"/static/stages/{fname}",
                    "size": os.path.getsize(fpath),
                    "source": _detect_source(ext),
                })
    return JSONResponse(content=items)


@router.post("/upload")
async def upload_stage(files: List[UploadFile] = File(...)):
    """Upload one or more stage assets (images or videos)."""
    uploaded = []
    errors = []

    for file in files:
        ext = os.path.splitext(file.filename)[1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            errors.append({
                "filename": file.filename,
                "error": f"Invalid format. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
            })
            continue

        safe_name = file.filename.replace(" ", "_")

        try:
            if ext == ".psd":
                temp_path = os.path.join(STAGES_DIR, f"_temp_{safe_name}")
                with open(temp_path, "wb") as f:
                    shutil.copyfileobj(file.file, f)
                try:
                    png_name = _flatten_psd_to_png(temp_path, STAGES_DIR)
                    dest = os.path.join(STAGES_DIR, png_name)
                    uploaded.append({
                        "name": png_name,
                        "path": f"stages/{png_name}",
                        "url": f"/static/stages/{png_name}",
                        "size": os.path.getsize(dest),
                        "source": _detect_source(ext),
                    })
                    logger.info(f"PSD stage uploaded: {file.filename} → {png_name}")
                finally:
                    if os.path.exists(temp_path):
                        os.remove(temp_path)
            else:
                dest = os.path.join(STAGES_DIR, safe_name)
                counter = 1
                base, ext_part = os.path.splitext(safe_name)
                while os.path.exists(dest):
                    safe_name = f"{base}_{counter}{ext_part}"
                    dest = os.path.join(STAGES_DIR, safe_name)
                    counter += 1

                with open(dest, "wb") as f:
                    shutil.copyfileobj(file.file, f)

                source = _detect_source(ext)
                uploaded.append({
                    "name": safe_name,
                    "path": f"stages/{safe_name}",
                    "url": f"/static/stages/{safe_name}",
                    "size": os.path.getsize(dest),
                    "source": source,
                })
                logger.info(f"Stage asset uploaded: {safe_name} (source={source})")
        except Exception as e:
            errors.append({"filename": file.filename, "error": str(e)})

    return JSONResponse(content={"uploaded": uploaded, "errors": errors})


@router.delete("/{filename}")
async def delete_stage(filename: str):
    """Delete a stage asset."""
    fpath = os.path.join(STAGES_DIR, filename)
    if not os.path.exists(fpath):
        raise HTTPException(status_code=404, detail="Stage asset not found")
    os.remove(fpath)
    logger.info(f"Stage asset deleted: {filename}")
    return JSONResponse(content={"message": "Deleted", "filename": filename})
