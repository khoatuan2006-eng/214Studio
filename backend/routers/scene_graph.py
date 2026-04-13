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


# ── AI API Endpoints ──

from pydantic import BaseModel

class AIDirectRequest(BaseModel):
    prompt: str
    current_scene: dict | None = None

@router.post("/ai/direct")
async def ai_direct_scene(body: AIDirectRequest):
    """
    Directly build a scene from text using Gemini Function Calling.
    If current_scene is provided, AI will modify it instead of starting from scratch.
    """
    from backend.core.agents.scene_director import SceneDirector
    
    try:
        if body.current_scene:
            scene_graph = SceneGraph.from_dict(body.current_scene)
        else:
            scene_graph = SceneGraph()
            
        director = SceneDirector(scene_graph=scene_graph, asset_registry=_registry)
        
        # Start AI session with available characters context
        characters_desc = _registry.describe_all()
        director.start_session(characters_desc)
        
        # Process the prompt
        response_text = director.process_message(body.prompt)
        
        return {
            "success": True,
            "scene": director.scene_graph.to_dict(),
            "message": response_text
        }
    except Exception as e:
        logger.error(f"AI Direct failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

