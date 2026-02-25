import os
import shutil
import sys
import logging

# Absolute paths setup first to fix import errors when running directly
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(BASE_DIR))

from fastapi import FastAPI, UploadFile, File, HTTPException, Request, Body
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
from pydantic import BaseModel
from backend.core.library_manager import (
    load_library, create_category, update_category, delete_category,
    create_subfolder, add_asset_to_subfolder, rename_subfolder, delete_subfolder
)

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

# Absolute paths setup first to fix import errors when running directly
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(BASE_DIR))

from backend.core.psd_processor import process_psd, load_db

UPLOADS_DIR = os.path.join(BASE_DIR, "uploads")
STORAGE_DIR = os.path.join(BASE_DIR, "storage")
FRONTEND_DIR = os.path.join(os.path.dirname(BASE_DIR), "frontend")

os.makedirs(UPLOADS_DIR, exist_ok=True)
os.makedirs(STORAGE_DIR, exist_ok=True)

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    # Cleanup task if needed

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

app.mount("/css", StaticFiles(directory=os.path.join(FRONTEND_DIR, "css")), name="frontend_css")
app.mount("/js", StaticFiles(directory=os.path.join(FRONTEND_DIR, "js")), name="frontend_js")

@app.get("/")
async def serve_frontend():
    """Serve the main frontend HTML file at the root URL."""
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))

@app.get("/api/characters/")
async def get_characters():
    """Returns the database.json array."""
    data = load_db()
    return JSONResponse(content=data)

@app.post("/api/upload-psd/")
async def upload_psd(file: UploadFile = File(...)):
    """Receives a PSD file, saves it, and processes it."""
    logger.info(f"Received PSD upload request: {file.filename}")
    if not file.filename.endswith(".psd"):
        logger.warning(f"Rejected invalid file type: {file.filename}")
        raise HTTPException(status_code=400, detail="Only .psd files are allowed.")
        
    temp_file_path = os.path.join(UPLOADS_DIR, file.filename)
    
    try:
        with open(temp_file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        logger.info(f"Saved PSD to temporary path: {temp_file_path}")
        
        # Process the PSD
        process_psd(temp_file_path)
        
        logger.info(f"PSD processing completed successfully for: {file.filename}")
        
        # Optionally remove the uploaded file to save space
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)
            
        return {"message": "success", "filename": file.filename}
        
    except Exception as e:
        logger.error(f"Error processing PSD {file.filename}: {str(e)}", exc_info=True)
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)
        raise HTTPException(status_code=500, detail=f"Error processing PSD: {str(e)}")

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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8001, reload=True)
