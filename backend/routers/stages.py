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


# ══════════════════════════════════════════════
#  Stage Analysis (Vision AI)
# ══════════════════════════════════════════════

ANALYSIS_CACHE_DIR = os.path.join(STORAGE_DIR, "stage_analysis")
os.makedirs(ANALYSIS_CACHE_DIR, exist_ok=True)


def get_cached_analysis(stage_id: str) -> dict | None:
    """Load cached analysis for a stage, or None if not cached."""
    cache_file = os.path.join(ANALYSIS_CACHE_DIR, f"{stage_id}.json")
    if os.path.exists(cache_file):
        import json
        with open(cache_file, "r", encoding="utf-8") as f:
            return json.load(f)
    return None


def save_analysis_cache(stage_id: str, data: dict):
    """Save analysis result to cache."""
    import json
    cache_file = os.path.join(ANALYSIS_CACHE_DIR, f"{stage_id}.json")
    with open(cache_file, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    logger.info(f"Saved stage analysis cache: {stage_id}")


@router.get("/{stage_id}/analysis")
async def get_stage_analysis(stage_id: str):
    """Get cached analysis for a stage. Returns 404 if not analyzed yet."""
    cached = get_cached_analysis(stage_id)
    if cached:
        return JSONResponse(content=cached)
    raise HTTPException(status_code=404, detail="Stage not analyzed yet. Call POST /{stage_id}/analyze first.")


@router.post("/{stage_id}/analyze")
async def analyze_stage(stage_id: str):
    """Analyze a stage's layers using Vision AI. Results are cached.
    
    Identifies objects, positions, interaction points (can_stand_on, can_sit_on),
    and semantic z-index ordering for each layer element.
    """
    import base64
    import re
    from backend.core.agents.stage_analyzer_agent import analyze_stage_elements

    # Check cache first
    cached = get_cached_analysis(stage_id)
    if cached:
        return JSONResponse(content={"cached": True, **cached})

    # Find element files for this stage
    if not os.path.exists(STAGES_DIR):
        raise HTTPException(status_code=404, detail="Stages directory not found")

    all_files = os.listdir(STAGES_DIR)
    # Prefer sub-crop files (_element_X_1.png) which have correct per-layer transparency
    element_files = [
        f for f in all_files
        if f.startswith(stage_id) and f.endswith(".png")
        and "_element_" in f
        and re.search(r'_element_\d+_1\.png$', f)
    ]
    # Fallback to base elements if no sub-crops exist
    if not element_files:
        element_files = [
            f for f in all_files
            if f.startswith(stage_id) and f.endswith(".png")
            and "_element_" in f
            and not re.search(r'_element_\d+_\d+\.png$', f)
        ]

    if not element_files:
        raise HTTPException(status_code=404, detail=f"No element files found for stage: {stage_id}")

    # Sort by element index
    def get_idx(fname):
        m = re.search(r'element_(\d+)', fname)
        return int(m.group(1)) if m else 0

    element_files.sort(key=get_idx)

    # Read images as base64
    layer_images = []
    for fname in element_files:
        fpath = os.path.join(STAGES_DIR, fname)
        with open(fpath, "rb") as f:
            img_b64 = base64.b64encode(f.read()).decode("utf-8")
        
        idx = get_idx(fname)
        layer_images.append({
            "id": f"element_{idx}",
            "label": f"Layer {idx}",
            "image_base64": img_b64,
            "type": "background" if idx <= 2 else "prop",
            "zIndex": idx,
        })

    # Call Vision AI analyzer
    try:
        result = await analyze_stage_elements(layer_images)
        result_dict = result.to_dict()
        result_dict["stage_id"] = stage_id
        result_dict["num_layers"] = len(element_files)
        result_dict["layer_files"] = element_files

        # Save to cache
        save_analysis_cache(stage_id, result_dict)

        return JSONResponse(content={"cached": False, **result_dict})
    except Exception as e:
        logger.error(f"Stage analysis failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

