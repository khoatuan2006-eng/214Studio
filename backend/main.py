import os
import shutil
import sys
import logging
from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager

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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8001, reload=True)
