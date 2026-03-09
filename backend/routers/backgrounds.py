"""
Background Library API: list, upload, and delete background images.
Supports PSD files — automatically flattened to PNG on upload.
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
BACKGROUNDS_DIR = os.path.join(STORAGE_DIR, "backgrounds")
os.makedirs(BACKGROUNDS_DIR, exist_ok=True)

ALLOWED_BG_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".psd"}


def _flatten_psd_to_png(psd_path: str, output_dir: str) -> str:
    """Flatten all visible PSD layers into a single PNG background image."""
    from psd_tools import PSDImage

    psd = PSDImage.open(psd_path)
    composite = psd.composite()
    base_name = os.path.splitext(os.path.basename(psd_path))[0]
    # Strip _temp_ prefix if present (from temp upload files)
    if base_name.startswith("_temp_"):
        base_name = base_name[6:]
    png_name = f"{base_name}.png"
    out_path = os.path.join(output_dir, png_name)

    # Avoid overwriting existing files
    counter = 1
    while os.path.exists(out_path):
        png_name = f"{base_name}_{counter}.png"
        out_path = os.path.join(output_dir, png_name)
        counter += 1

    composite.save(out_path)
    logger.info(f"PSD flattened to PNG: {psd_path} → {png_name}")
    return png_name

router = APIRouter(prefix="/api/backgrounds", tags=["backgrounds"])


@router.get("")
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


@router.post("/upload")
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

        try:
            if ext == ".psd":
                # PSD files: save temp → flatten to PNG → remove temp
                temp_path = os.path.join(BACKGROUNDS_DIR, f"_temp_{safe_name}")
                with open(temp_path, "wb") as f:
                    shutil.copyfileobj(file.file, f)
                try:
                    png_name = _flatten_psd_to_png(temp_path, BACKGROUNDS_DIR)
                    dest = os.path.join(BACKGROUNDS_DIR, png_name)
                    uploaded.append({
                        "name": png_name,
                        "path": f"backgrounds/{png_name}",
                        "url": f"/static/backgrounds/{png_name}",
                        "size": os.path.getsize(dest),
                    })
                    logger.info(f"PSD background uploaded and flattened: {file.filename} → {png_name}")
                finally:
                    if os.path.exists(temp_path):
                        os.remove(temp_path)
            else:
                # Normal image files: copy directly
                dest = os.path.join(BACKGROUNDS_DIR, safe_name)
                counter = 1
                base, ext_part = os.path.splitext(safe_name)
                while os.path.exists(dest):
                    safe_name = f"{base}_{counter}{ext_part}"
                    dest = os.path.join(BACKGROUNDS_DIR, safe_name)
                    counter += 1

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


@router.delete("/{filename}")
async def delete_background(filename: str):
    """Delete a background image from the library."""
    fpath = os.path.join(BACKGROUNDS_DIR, filename)
    if not os.path.exists(fpath):
        raise HTTPException(status_code=404, detail="Background not found")
    os.remove(fpath)
    logger.info(f"Background deleted: {filename}")
    return JSONResponse(content={"message": "Deleted", "filename": filename})
