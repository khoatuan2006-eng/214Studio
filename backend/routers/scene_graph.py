"""
Scene Graph API Router — Exposes SceneGraph + Asset Registry via REST.

Provides endpoints for:
- Character asset discovery (from scanner)
- Scene Graph operations (for frontend sync)
"""

import os
import logging
from fastapi import APIRouter, HTTPException

from backend.core.scene_graph.asset_scanner import AssetRegistry
from backend.core.scene_graph.scene import SceneGraph
from backend.core.scene_graph.tools import SceneToolExecutor, TOOL_DEFINITIONS

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/scene-graph", tags=["scene-graph"])

# Initialize the asset registry
# Path: backend/routers/scene_graph.py → backend/ → backend/storage
STORAGE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "storage")
_registry = AssetRegistry(STORAGE_DIR)
_registry.scan()


@router.get("/characters")
async def list_characters():
    """List all available characters with their poses and faces."""
    return _registry.list_characters()


@router.get("/characters/{char_id}")
async def get_character(char_id: str):
    """Get detailed info for a specific character."""
    char = _registry.get_character(char_id)
    if not char:
        raise HTTPException(status_code=404, detail=f"Character '{char_id}' not found")
    return char.to_dict()


@router.get("/characters/{char_id}/describe")
async def describe_character(char_id: str):
    """Get AI-readable description of a character."""
    char = _registry.get_character(char_id)
    if not char:
        raise HTTPException(status_code=404, detail=f"Character '{char_id}' not found")
    return {"description": char.describe()}


@router.post("/rescan")
async def rescan_assets():
    """Rescan the storage directory for new characters."""
    count = _registry.scan()
    return {"characters_found": count}


@router.get("/tools")
async def get_tool_definitions():
    """Get all available AI tool definitions for function calling."""
    return TOOL_DEFINITIONS
