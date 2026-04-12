"""
AnimeStudio Backend — FastAPI Application Entry Point.

All API endpoints are organized into router modules under backend/routers/.
This file handles: app creation, lifespan, CORS, static file mounts, and router registration.
"""
import os
import sys
import logging

# Absolute paths setup first to fix import errors when running directly
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(BASE_DIR))

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager

from backend.core.database import init_db
from backend.core.psd_processor import load_db

# Import routers
from backend.routers import projects, psd, psd_v2, assets, library, export, ai, backgrounds, foregrounds, stages, tts, scene_graph

# Set up logging configuration
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(os.path.join(BASE_DIR, "data", "app.log"), encoding='utf-8'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Absolute paths
UPLOADS_DIR = os.path.join(BASE_DIR, "uploads")
STORAGE_DIR = os.path.join(BASE_DIR, "storage")
AUTOSAVE_DIR = os.path.join(BASE_DIR, ".autosave")
THUMBNAILS_DIR = os.path.join(STORAGE_DIR, "thumbnails")
FRONTEND_DIR = os.path.join(os.path.dirname(BASE_DIR), "frontend")

os.makedirs(UPLOADS_DIR, exist_ok=True)
os.makedirs(STORAGE_DIR, exist_ok=True)
os.makedirs(AUTOSAVE_DIR, exist_ok=True)
os.makedirs(THUMBNAILS_DIR, exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize database on startup
    init_db()
    logger.info("Database initialized successfully")
    yield
    # Cleanup
    psd.shutdown_psd_executor()
    psd_v2.shutdown_psd_v2_executor()

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
app.mount("/s_assets", StaticFiles(directory=os.path.join(STORAGE_DIR, "assets")), name="s_assets_bypass")

# Mount thumbnails
app.mount("/thumbnails", StaticFiles(directory=THUMBNAILS_DIR), name="thumbnails")


# ── Core endpoints (kept in main) ──

@app.get("/")
async def serve_frontend():
    """Serve the main frontend HTML file at the root URL."""
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))

@app.get("/api/characters/")
async def get_characters():
    """Returns the database.json array."""
    data = load_db()
    return JSONResponse(content=data)


# ── Register all routers ──

app.include_router(projects.router)
app.include_router(psd.router)
app.include_router(psd_v2.router)
app.include_router(assets.router)
app.include_router(library.router)
app.include_router(export.router)
app.include_router(ai.router)
app.include_router(backgrounds.router)
app.include_router(foregrounds.router)
app.include_router(stages.router)
app.include_router(tts.router)
app.include_router(scene_graph.router)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8001, reload=True)
