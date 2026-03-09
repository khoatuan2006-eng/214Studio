"""
Foreground Library API: list, upload, and delete foreground overlay images.
Supports PSD files — automatically flattened to PNG on upload.
Same pattern as backgrounds.py, renders on top of characters.
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
FOREGROUNDS_DIR = os.path.join(STORAGE_DIR, "foregrounds")
os.makedirs(FOREGROUNDS_DIR, exist_ok=True)

ALLOWED_FG_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".psd"}


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


router = APIRouter(prefix="/api/foregrounds", tags=["foregrounds"])


@router.get("")
async def list_foregrounds():
    """List all foreground overlay images."""
    foregrounds = []
    if os.path.exists(FOREGROUNDS_DIR):
        for fname in sorted(os.listdir(FOREGROUNDS_DIR)):
            ext = os.path.splitext(fname)[1].lower()
            if ext in {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"}:
                fpath = os.path.join(FOREGROUNDS_DIR, fname)
                foregrounds.append({
                    "name": fname,
                    "path": f"foregrounds/{fname}",
                    "url": f"/static/foregrounds/{fname}",
                    "size": os.path.getsize(fpath),
                })
    return JSONResponse(content=foregrounds)


@router.post("/upload")
async def upload_foreground(files: List[UploadFile] = File(...)):
    """Upload one or more foreground overlay images."""
    uploaded = []
    errors = []

    for file in files:
        ext = os.path.splitext(file.filename)[1].lower()
        if ext not in ALLOWED_FG_EXTENSIONS:
            errors.append({"filename": file.filename, "error": f"Invalid format. Allowed: {', '.join(ALLOWED_FG_EXTENSIONS)}"})
            continue

        safe_name = file.filename.replace(" ", "_")

        try:
            if ext == ".psd":
                temp_path = os.path.join(FOREGROUNDS_DIR, f"_temp_{safe_name}")
                with open(temp_path, "wb") as f:
                    shutil.copyfileobj(file.file, f)
                try:
                    png_name = _flatten_psd_to_png(temp_path, FOREGROUNDS_DIR)
                    dest = os.path.join(FOREGROUNDS_DIR, png_name)
                    uploaded.append({
                        "name": png_name,
                        "path": f"foregrounds/{png_name}",
                        "url": f"/static/foregrounds/{png_name}",
                        "size": os.path.getsize(dest),
                    })
                    logger.info(f"PSD foreground uploaded: {file.filename} → {png_name}")
                finally:
                    if os.path.exists(temp_path):
                        os.remove(temp_path)
            else:
                dest = os.path.join(FOREGROUNDS_DIR, safe_name)
                counter = 1
                base, ext_part = os.path.splitext(safe_name)
                while os.path.exists(dest):
                    safe_name = f"{base}_{counter}{ext_part}"
                    dest = os.path.join(FOREGROUNDS_DIR, safe_name)
                    counter += 1

                with open(dest, "wb") as f:
                    shutil.copyfileobj(file.file, f)
                uploaded.append({
                    "name": safe_name,
                    "path": f"foregrounds/{safe_name}",
                    "url": f"/static/foregrounds/{safe_name}",
                    "size": os.path.getsize(dest),
                })
                logger.info(f"Foreground uploaded: {safe_name}")
        except Exception as e:
            errors.append({"filename": file.filename, "error": str(e)})

    return JSONResponse(content={"uploaded": uploaded, "errors": errors})


@router.delete("/{filename}")
async def delete_foreground(filename: str):
    """Delete a foreground overlay image."""
    fpath = os.path.join(FOREGROUNDS_DIR, filename)
    if not os.path.exists(fpath):
        raise HTTPException(status_code=404, detail="Foreground not found")
    os.remove(fpath)
    logger.info(f"Foreground deleted: {filename}")
    return JSONResponse(content={"message": "Deleted", "filename": filename})
