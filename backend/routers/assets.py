"""
Asset management API: search, soft-delete, restore, purge, version history.
"""
import os
import logging

from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.core.models import Asset, AssetVersion
from backend.core.psd_processor import load_db
from backend.core.library_manager import load_library

logger = logging.getLogger(__name__)

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STORAGE_DIR = os.path.join(BACKEND_DIR, "storage")
THUMBNAILS_DIR = os.path.join(STORAGE_DIR, "thumbnails")

router = APIRouter(prefix="/api/assets", tags=["assets"])


@router.get("/")
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


@router.delete("/{asset_hash}")
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


@router.post("/{asset_hash}/restore")
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


@router.get("/trash")
async def list_trash(db: Session = Depends(get_db)):
    """Return all soft-deleted assets (the trash bin)."""
    assets = db.query(Asset).filter(Asset.is_deleted == True).all()  # noqa: E712
    return JSONResponse(content=[a.to_dict() for a in assets])


@router.delete("/{asset_hash}/purge")
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


@router.get("/{asset_hash}/versions")
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
