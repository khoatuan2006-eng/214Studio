"""
Custom Library API: categories, subfolders, and asset assignment.
"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from backend.core.library_manager import (
    load_library, create_category, update_category, delete_category,
    create_subfolder, add_asset_to_subfolder, rename_subfolder, delete_subfolder
)

router = APIRouter(prefix="/api/library", tags=["library"])


# ── Pydantic models ──

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


# ── Endpoints ──

@router.get("/")
async def get_library():
    return JSONResponse(content=load_library())

@router.post("/category/")
async def add_category(data: CategoryCreate):
    return JSONResponse(content=create_category(data.name, data.z_index))

@router.put("/category/")
async def update_category_endpoint(data: CategoryUpdate):
    cat = update_category(data.cat_id, data.name, data.z_index)
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    return JSONResponse(content=cat)

@router.delete("/category/{cat_id}")
async def delete_category_endpoint(cat_id: str):
    success = delete_category(cat_id)
    if not success:
        raise HTTPException(status_code=404, detail="Category not found")
    return JSONResponse(content={"message": "Deleted"})

@router.post("/subfolder/")
async def add_subfolder(data: SubfolderCreate):
    cat = create_subfolder(data.cat_id, data.name)
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    return JSONResponse(content=cat)

@router.put("/subfolder/")
async def rename_subfolder_endpoint(data: SubfolderRename):
    cat = rename_subfolder(data.cat_id, data.old_name, data.new_name)
    if not cat:
        raise HTTPException(status_code=404, detail="Category or Subfolder not found")
    return JSONResponse(content=cat)

@router.delete("/subfolder/{cat_id}/{sub_name}")
async def delete_subfolder_endpoint(cat_id: str, sub_name: str):
    success = delete_subfolder(cat_id, sub_name)
    if not success:
        raise HTTPException(status_code=404, detail="Subfolder not found")
    return JSONResponse(content={"message": "Deleted"})

@router.post("/asset/")
async def add_asset(data: AssetAdd):
    cat = add_asset_to_subfolder(data.cat_id, data.sub_name, data.asset_name, data.asset_hash)
    if not cat:
        raise HTTPException(status_code=404, detail="Category or Subfolder not found")
    return JSONResponse(content=cat)
