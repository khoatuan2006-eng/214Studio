"""
AI Agent Team endpoints: scene analysis, generation pipeline, review, config, and automation gateway.
"""
import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(tags=["ai"])


# ── Pydantic models ──

class SceneAnalyzeRequest(BaseModel):
    """Request body for scene analysis."""
    nodes: list[dict]
    edges: list[dict]
    currentTime: float | None = None


class AIGenerateRequest(BaseModel):
    """Request to generate a scene via AI Agent Team."""
    prompt: str
    available_characters: list[dict] = []
    available_backgrounds: list[dict] = []


class AIReviewRequest(BaseModel):
    """Request to review a scene via Vision AI."""
    nodes: list[dict]
    edges: list[dict]
    original_prompt: str
    screenshot_base64: str | None = None
    review_round: int = 1


class AIConfigUpdate(BaseModel):
    """Update AI configuration."""
    api_key: str | None = None
    api_keys: list[str] | None = None
    provider: str | None = None
    model: str | None = None
    vision_model: str | None = None
    max_review_rounds: int | None = None
    temperature: float | None = None


# AI Gateway models
class CharacterAction(BaseModel):
    """A single animation action for a character (LLM-friendly)."""
    type: str  # "move", "scale", "rotate", "fade"
    start_time: float = 0.0
    end_time: float = 3.0
    # Movement
    start_x: float | None = None
    end_x: float | None = None
    start_y: float | None = None
    end_y: float | None = None
    # Scale
    start_scale: float | None = None
    end_scale: float | None = None
    # Rotation
    start_rotation: float | None = None
    end_rotation: float | None = None
    # Opacity (fade)
    start_opacity: float | None = None
    end_opacity: float | None = None
    # Easing
    easing: str = "easeInOut"


class ScriptCharacter(BaseModel):
    """A character entry in the StoryScript."""
    name: str
    asset_id: str = ""
    asset_hash: str = ""
    actions: list[CharacterAction] = []
    # Optional initial position (world units, not pixels)
    initial_x: float = 9.6
    initial_y: float = 5.4
    initial_scale: float = 1.0


class StoryScript(BaseModel):
    """
    LLM-friendly animation script format.
    Designed for easy generation by ChatGPT/Claude.
    All positions use world units (not pixels). PPU converts units → pixels.
    """
    title: str = "Untitled Scene"
    description: str = ""
    fps: int = 30
    canvas_width: int = 1920       # output resolution (px)
    canvas_height: int = 1080      # output resolution (px)
    ppu: int = 100                 # Pixels Per Unit
    characters: list[ScriptCharacter] = []


# ── Scene Analyzer ──

@router.post("/api/scene/analyze")
async def analyze_scene_endpoint(body: SceneAnalyzeRequest):
    """
    Analyze a workflow node graph and return a structured SceneContext.
    Identifies characters, positions, background, camera, layer order, etc.
    """
    from backend.core.scene_analyzer import analyze_scene

    try:
        context = analyze_scene(body.nodes, body.edges, body.currentTime)
        return JSONResponse(content=context.to_dict())
    except Exception as e:
        logger.error(f"Scene analysis failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Scene analysis failed: {str(e)}")


# ── AI Agent Team ──

@router.post("/api/ai/generate-scene")
async def ai_generate_scene(body: AIGenerateRequest):
    """
    Run the full AI Agent Team pipeline:
    Director → Builder → Review Loop → Final Workflow
    """
    from backend.core.agents.orchestrator import run_pipeline

    try:
        result = await run_pipeline(
            prompt=body.prompt,
            available_characters=body.available_characters,
            available_backgrounds=body.available_backgrounds,
        )
        return JSONResponse(content=result.to_dict())
    except Exception as e:
        logger.error(f"AI generate-scene failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Generation failed: {str(e)}")


@router.post("/api/ai/review-scene")
async def ai_review_scene(body: AIReviewRequest):
    """
    Review a scene using Vision AI (standalone, outside full pipeline).
    """
    from backend.core.scene_analyzer import analyze_scene
    from backend.core.agents.reviewer_agent import review_scene

    try:
        context = analyze_scene(body.nodes, body.edges)
        result = await review_scene(
            scene_context_text=context.arrangement_description,
            screenshot_base64=body.screenshot_base64,
            original_prompt=body.original_prompt,
            nodes=body.nodes,
            review_round=body.review_round,
        )
        return JSONResponse(content=result.to_dict())
    except Exception as e:
        logger.error(f"AI review-scene failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Review failed: {str(e)}")


@router.get("/api/ai/config")
async def ai_get_config():
    """Get current AI configuration (without exposing API key)."""
    from backend.core.ai_config import get_ai_config
    return JSONResponse(content=get_ai_config().to_dict())


@router.put("/api/ai/config")
async def ai_update_config(body: AIConfigUpdate):
    """Update AI configuration (API key, provider, model, etc.)."""
    from backend.core.ai_config import update_ai_config
    config = update_ai_config(
        api_key=body.api_key,
        api_keys=body.api_keys,
        provider=body.provider,
        model=body.model,
        vision_model=body.vision_model,
        max_review_rounds=body.max_review_rounds,
        temperature=body.temperature,
    )
    return JSONResponse(content=config.to_dict())


@router.get("/api/ai/models")
async def ai_list_models():
    """
    Load all models supported by the current API key.
    Returns real-time status for each model.
    """
    from backend.core.ai_config import get_ai_config
    config = get_ai_config()

    if not config.has_api_key:
        return JSONResponse(content={
            "models": [],
            "error": "No API key configured",
            "current_key": "",
        })

    results = []
    try:
        from google import genai
        from google.genai import types
        import asyncio

        client = genai.Client(api_key=config.api_key)

        # Fetch real model list from API
        api_models = []
        try:
            for m in client.models.list():
                model_id = m.name.replace("models/", "")
                # Only include models that support generateContent
                supported = getattr(m, "supported_actions", None) or \
                            getattr(m, "supported_generation_methods", [])
                if isinstance(supported, list):
                    supports_generate = any("generateContent" in str(s) for s in supported)
                else:
                    supports_generate = True  # Assume yes if no info

                if not supports_generate:
                    continue

                # Detect vision support
                has_vision = False
                input_limits = getattr(m, "input_token_limit", 0) or 0
                desc = (getattr(m, "description", "") or "").lower()
                display = (getattr(m, "display_name", "") or "")
                if "vision" in desc or "image" in desc or input_limits > 100000:
                    has_vision = True
                # Most gemini models support vision
                if "gemini" in model_id:
                    has_vision = True

                api_models.append({
                    "id": model_id,
                    "name": display or model_id,
                    "type": "text+vision" if has_vision else "text",
                    "description": (getattr(m, "description", "") or "")[:120],
                    "input_limit": input_limits,
                })
        except Exception as e:
            logger.error(f"ListModels failed: {e}")
            return JSONResponse(content={
                "models": [],
                "error": f"Không thể tải danh sách model: {str(e)[:100]}",
                "current_key": config.current_key_label,
            })

        # Test each model concurrently for quota
        async def test_model(model_info: dict) -> dict:
            entry = {**model_info, "status": "unknown", "status_message": ""}
            try:
                await client.aio.models.generate_content(
                    model=model_info["id"],
                    contents="Hi",
                    config=types.GenerateContentConfig(
                        max_output_tokens=5, temperature=0,
                    ),
                )
                entry["status"] = "available"
                entry["status_message"] = "✅ Sẵn sàng"
            except Exception as e:
                err = str(e)
                if "429" in err or "RESOURCE_EXHAUSTED" in err:
                    entry["status"] = "rate_limited"
                    entry["status_message"] = "⚠️ Hết quota"
                elif "403" in err or "PERMISSION" in err:
                    entry["status"] = "no_access"
                    entry["status_message"] = "🔒 Không có quyền"
                else:
                    entry["status"] = "error"
                    entry["status_message"] = f"❌ {err[:60]}"
            return entry

        tasks = [test_model(m) for m in api_models]
        results = list(await asyncio.gather(*tasks))

    except Exception as e:
        logger.error(f"Model discovery failed: {e}", exc_info=True)
        return JSONResponse(content={
            "models": [],
            "error": str(e)[:100],
            "current_key": config.current_key_label,
        })

    return JSONResponse(content={
        "models": results,
        "current_key": config.current_key_label,
        "total_models": len(results),
    })


class AddKeyRequest(BaseModel):
    api_key: str

@router.post("/api/ai/keys/add")
async def ai_add_key(body: AddKeyRequest):
    """Add an API key to the key pool for auto-rotation."""
    from backend.core.ai_config import get_ai_config
    config = get_ai_config()
    config.add_key(body.api_key)
    return JSONResponse(content=config.to_dict())


# ── AI Automation Gateway ──

@router.post("/api/automation/generate")
async def automation_generate(script: StoryScript):
    """
    AI Gateway: Translate a simple StoryScript JSON into a full
    AnimeStudio project using the Python SDK.

    Returns the created project ID.
    """
    from backend.animestudio import Project, save_to_db

    # Create project from script
    project = Project(
        name=script.title,
        description=script.description,
        canvas_width=script.canvas_width,
        canvas_height=script.canvas_height,
        fps=script.fps,
    )

    for char in script.characters:
        track = project.add_track(
            name=char.name,
            character_id=char.asset_id or None,
        )

        # Set initial position keyframes
        track.add_keyframe("x", time=0.0, value=char.initial_x)
        track.add_keyframe("y", time=0.0, value=char.initial_y)
        track.add_keyframe("scale", time=0.0, value=char.initial_scale)
        track.add_keyframe("opacity", time=0.0, value=1.0)

        # Add an action block if asset_hash is provided
        if char.asset_hash:
            # Calculate max duration from actions
            max_end = max((a.end_time for a in char.actions), default=5.0)
            track.add_action(
                asset_hash=char.asset_hash,
                start=0.0,
                end=max_end,
                z_index=0,
            )

        # Process each action into keyframes
        for action in char.actions:
            easing = action.easing or "easeInOut"

            if action.type == "move":
                if action.start_x is not None and action.end_x is not None:
                    track.add_keyframe("x", time=action.start_time, value=action.start_x, easing=easing)
                    track.add_keyframe("x", time=action.end_time, value=action.end_x, easing=easing)
                if action.start_y is not None and action.end_y is not None:
                    track.add_keyframe("y", time=action.start_time, value=action.start_y, easing=easing)
                    track.add_keyframe("y", time=action.end_time, value=action.end_y, easing=easing)

            elif action.type == "scale":
                if action.start_scale is not None and action.end_scale is not None:
                    track.add_keyframe("scale", time=action.start_time, value=action.start_scale, easing=easing)
                    track.add_keyframe("scale", time=action.end_time, value=action.end_scale, easing=easing)

            elif action.type == "rotate":
                if action.start_rotation is not None and action.end_rotation is not None:
                    track.add_keyframe("rotation", time=action.start_time, value=action.start_rotation, easing=easing)
                    track.add_keyframe("rotation", time=action.end_time, value=action.end_rotation, easing=easing)

            elif action.type == "fade":
                if action.start_opacity is not None and action.end_opacity is not None:
                    track.add_keyframe("opacity", time=action.start_time, value=action.start_opacity, easing=easing)
                    track.add_keyframe("opacity", time=action.end_time, value=action.end_opacity, easing=easing)

    # Save to database
    project_id = save_to_db(project)

    logger.info(f"[Automation] Generated project '{script.title}' with {len(script.characters)} characters → ID: {project_id}")

    return JSONResponse(content={
        "projectId": project_id,
        "title": script.title,
        "tracks": len(script.characters),
        "status": "created",
    })
