"""
Auto Video Router — One-Click Full Pipeline.

Endpoint:
  POST /api/auto-video/generate — Takes a script → returns complete VideoProject.

Pipeline:
  1. Parse multi-scene script (---  separators)
  2. Auto-detect character names from dialogue
  3. Auto-map characters to available assets (fuzzy match)
  4. Auto-select backgrounds (or use defaults)
  5. Build SceneGraph for each scene (positions, poses, camera, etc.)
  6. Generate TTS audio for dialogue (optional)
  7. Add lip-sync keyframes
  8. Return VideoProject JSON (ready for frontend rendering + export)
"""

import asyncio
import logging
import os
import re
import time
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from backend.core.scene_graph.scene import SceneGraph
from backend.core.scene_graph.specialized_nodes import CharacterNode
from backend.core.scene_graph.asset_scanner import AssetRegistry

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auto-video", tags=["auto-video"])

# ── Shared registry (set from main.py at startup) ──
_registry: Optional[AssetRegistry] = None


def set_registry(registry: AssetRegistry):
    """Called from app startup to share the asset registry."""
    global _registry
    _registry = registry


# ══════════════════════════════════════════════
#  Request / Response Models
# ══════════════════════════════════════════════

class AutoVideoRequest(BaseModel):
    """One-click video generation request."""
    script_text: str                         # Multi-scene script (--- separators)
    voice: str = "BV074"                    # TTS voice code
    generate_tts: bool = True               # Whether to generate TTS audio
    pause_ms: int = 500                     # Pause between TTS lines (ms)
    auto_select_characters: bool = True     # Auto-map character names → assets
    auto_select_background: bool = True     # Auto-select background for each scene
    default_background: str = ""            # Fallback background if auto-select fails
    character_map: dict[str, str] = {}      # Manual override: name → char_id


class AutoVideoProgress(BaseModel):
    """Progress update for streaming responses."""
    step: str
    message: str
    progress: float  # 0.0 → 1.0


class AutoVideoResponse(BaseModel):
    success: bool
    project: dict                            # VideoProject JSON (multi-scene)
    total_scenes: int = 0
    total_duration: float = 0.0
    total_characters: int = 0
    tts_audio_url: str = ""
    tts_lines: list[dict] = []
    pipeline_steps: list[dict] = []          # Log of each step
    message: str = ""


# ══════════════════════════════════════════════
#  Character Auto-Matching
# ══════════════════════════════════════════════

def _auto_map_characters(
    script_names: list[str],
    registry: AssetRegistry,
    manual_map: dict[str, str],
) -> dict[str, str]:
    """
    Auto-map character names from script to available asset IDs.
    
    Strategy:
    1. Use manual_map if provided
    2. Fuzzy-match: script name "Hoa" → find asset with similar name
    3. If no match, round-robin assign from available characters
    """
    char_map: dict[str, str] = {}
    available_chars = registry.list_characters()
    
    if not available_chars:
        logger.warning("[AutoVideo] No characters available in registry!")
        return char_map

    # Build lookup index: lowercase name → char_id
    char_index: dict[str, str] = {}
    for info in available_chars:
        char_id = info["id"]
        char_name_lower = info["name"].lower().replace("_", " ")
        char_index[char_name_lower] = char_id
        # Also index by parts of name (e.g. "Hoa_NuSinh" → "hoa", "nusinh")
        for part in char_name_lower.split():
            if len(part) >= 2:
                char_index[part] = char_id

    used_chars = set()
    available_ids = [c["id"] for c in available_chars]
    round_robin_idx = 0

    for name in script_names:
        # 1. Manual override
        if name in manual_map:
            char_map[name] = manual_map[name]
            used_chars.add(manual_map[name])
            continue

        # 2. Exact/fuzzy match
        name_lower = name.lower().strip()
        matched = False
        
        # Try exact match first
        for key, char_id in char_index.items():
            if name_lower == key or name_lower in key or key in name_lower:
                char_map[name] = char_id
                used_chars.add(char_id)
                matched = True
                break
        
        if matched:
            continue

        # 3. Round-robin from unused characters
        # Try to pick one we haven't used yet
        attempts = 0
        while attempts < len(available_ids):
            candidate = available_ids[round_robin_idx % len(available_ids)]
            round_robin_idx += 1
            if candidate not in used_chars:
                char_map[name] = candidate
                used_chars.add(candidate)
                break
            attempts += 1
        else:
            # All used, just reuse round-robin
            char_map[name] = available_ids[round_robin_idx % len(available_ids)]
            round_robin_idx += 1

    return char_map


def _extract_character_names(script_text: str) -> list[str]:
    """Extract unique character names from script text."""
    names = []
    seen = set()
    for line in script_text.strip().split("\n"):
        line = line.strip()
        if not line or line.startswith("[") or line.startswith("---"):
            continue
        # Match "Character: dialogue"
        match = re.match(r'^([^:：]{1,20})[:\s：]\s*.+$', line)
        if match:
            name = match.group(1).strip()
            if name not in seen and not re.match(r'^\d', name):
                names.append(name)
                seen.add(name)
    return names


def _get_first_background(registry_or_storage: str = "") -> str:
    """Get the first available background/stage ID."""
    # Check stages directory
    backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    stages_dir = os.path.join(backend_dir, "storage", "stages")
    
    if os.path.exists(stages_dir):
        for fname in sorted(os.listdir(stages_dir)):
            if fname.endswith(".png"):
                # Always extract the base stage ID (handle both elements and basic images)
                if "_element_" in fname:
                    return fname.rsplit("_element_", 1)[0]
                else:
                    return os.path.splitext(fname)[0]
    
    return ""


# ══════════════════════════════════════════════
#  TTS Generation Helper (reuse from automation)
# ══════════════════════════════════════════════

async def _generate_tts_batch(
    all_dialogue_text: str,
    voice: str,
    pause_ms: int,
) -> dict:
    """
    Generate TTS audio for all dialogue lines.
    Returns {audio_url, lines, total_duration}.
    """
    import httpx

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "http://localhost:8001/api/tts/synthesize",
            json={
                "text": all_dialogue_text,
                "voice": voice,
                "pause_ms": pause_ms,
            },
            timeout=180.0,
        )

        if resp.status_code != 200:
            raise RuntimeError(f"TTS failed: HTTP {resp.status_code}")

        data = resp.json()
        return {
            "audio_url": data.get("audio_url", ""),
            "lines": data.get("lines", []),
            "total_duration": data.get("total_duration", 0),
        }


# ══════════════════════════════════════════════
#  Main Pipeline Endpoint
# ══════════════════════════════════════════════

@router.post("/generate", response_model=AutoVideoResponse)
async def generate_auto_video(req: AutoVideoRequest):
    """
    One-Click Auto Video: script → complete VideoProject.
    
    Pipeline Steps:
    1. 📝 Parse script → detect scenes + characters
    2. 🎭 Auto-map characters to available assets
    3. 🏞️ Auto-select backgrounds
    4. 🎬 Build SceneGraph for each scene
    5. 🔊 Generate TTS audio (optional)
    6. 👄 Add lip-sync keyframes
    7. 📦 Package into VideoProject
    """
    from backend.core.scene_graph.video_project import VideoProject, SceneTransition
    from backend.routers.automation import (
        build_scene_from_script,
        _parse_multi_scene_script,
        ScriptLine,
    )

    if not _registry:
        raise HTTPException(500, "Asset registry not initialized")

    if not req.script_text.strip():
        raise HTTPException(400, "Script text is empty")

    start_time = time.time()
    steps: list[dict] = []

    def log_step(step: str, message: str):
        elapsed = time.time() - start_time
        entry = {"step": step, "message": message, "elapsed": round(elapsed, 2)}
        steps.append(entry)
        logger.info(f"[AutoVideo] [{elapsed:.1f}s] {step}: {message}")

    # ── Step 1: Parse Script ──
    log_step("parse", "Parsing multi-scene script...")

    sections = _parse_multi_scene_script(req.script_text)
    if not sections:
        # Fallback: treat entire text as single scene
        log_step("parse", "No --- separators found, treating as single scene")
        all_lines = []
        for line in req.script_text.strip().split("\n"):
            line = line.strip()
            if not line or line.startswith("["):
                continue
            match = re.match(r'^([^:：]+?)[:\s：]\s*(.+)$', line)
            if match:
                all_lines.append(ScriptLine(
                    character=match.group(1).strip(),
                    text=match.group(2).strip(),
                ))
        if not all_lines:
            raise HTTPException(400, "No dialogue lines found in script")
        sections = [{"background_id": "", "lines": all_lines, "transition": "fade"}]

    total_lines = sum(len(s["lines"]) for s in sections)
    log_step("parse", f"Found {len(sections)} scene(s), {total_lines} dialogue lines")

    # ── Step 2: Auto-Map Characters ──
    log_step("characters", "Auto-detecting and mapping characters...")

    # Extract all unique character names across all sections
    all_char_names = []
    seen_names = set()
    for section in sections:
        for line in section["lines"]:
            name = line.character if isinstance(line, ScriptLine) else line["character"]
            if name not in seen_names:
                all_char_names.append(name)
                seen_names.add(name)

    if req.auto_select_characters:
        char_map = _auto_map_characters(all_char_names, _registry, req.character_map)
    else:
        char_map = req.character_map

    if not char_map:
        raise HTTPException(400, f"No characters could be matched. Available: {[c['id'] for c in _registry.list_characters()]}")

    log_step("characters", f"Mapped {len(char_map)} characters: {char_map}")

    # ── Step 3: Auto-Select Backgrounds ──
    log_step("backgrounds", "Selecting backgrounds for each scene...")

    default_bg = req.default_background or _get_first_background()

    for i, section in enumerate(sections):
        if not section["background_id"] and req.auto_select_background:
            section["background_id"] = default_bg
            log_step("backgrounds", f"Scene {i+1}: auto-selected '{default_bg}'")

    # ── Step 4: Generate TTS (if enabled) ──
    tts_audio_url = ""
    tts_lines_all: list[dict] = []
    tts_results_per_scene: list[list[dict] | None] = [None] * len(sections)

    if req.generate_tts:
        log_step("tts", "Generating TTS audio...")

        try:
            # Generate TTS for each scene separately for proper timing
            for i, section in enumerate(sections):
                scene_lines = section["lines"]
                dialogue_texts = []
                for line in scene_lines:
                    text = line.text if isinstance(line, ScriptLine) else line["text"]
                    dialogue_texts.append(text)

                if not dialogue_texts:
                    continue

                all_text = "\n".join(dialogue_texts)
                tts_result = await _generate_tts_batch(all_text, req.voice, req.pause_ms)
                tts_results_per_scene[i] = tts_result.get("lines", [])
                tts_lines_all.extend(tts_result.get("lines", []))

                if i == 0:
                    tts_audio_url = tts_result.get("audio_url", "")

                log_step("tts", f"Scene {i+1}: {len(dialogue_texts)} lines, {tts_result.get('total_duration', 0):.1f}s")

        except Exception as e:
            log_step("tts", f"TTS failed (continuing without audio): {e}")
            logger.warning(f"[AutoVideo] TTS generation failed: {e}")

    # ── Step 5: Build Scenes ──
    log_step("build", "Building scene graphs...")

    scenes: list[SceneGraph] = []
    transitions: list[SceneTransition] = []

    for i, section in enumerate(sections):
        bg_id = section["background_id"] or None
        lines = section["lines"]
        tts_lines = tts_results_per_scene[i] if i < len(tts_results_per_scene) else None

        try:
            graph = build_scene_from_script(
                lines=lines,
                character_map=char_map,
                tts_lines=tts_lines,
                registry=_registry,
                background_id=bg_id,
            )
            graph.name = f"Scene {i + 1}"
            if bg_id:
                graph.metadata = {"background_id": bg_id}
            scenes.append(graph)

            char_count = len([n for n in graph.nodes.values() if isinstance(n, CharacterNode)])
            kf_count = sum(
                len(n.frame_sequence) + sum(len(kf) for kf in n.keyframes.values())
                for n in graph.nodes.values() if isinstance(n, CharacterNode)
            )
            log_step("build", f"Scene {i+1}: {char_count} characters, {kf_count} keyframes, {graph.duration:.1f}s")

        except Exception as e:
            logger.error(f"[AutoVideo] Scene {i+1} build failed: {e}", exc_info=True)
            raise HTTPException(500, f"Scene {i+1} build failed: {e}")

        # Transition between scenes
        if i < len(sections) - 1:
            trans_type = section.get("transition", "fade")
            transitions.append(SceneTransition(type=trans_type, duration=0.5))

    # ── Step 6: Package VideoProject ──
    log_step("package", "Packaging VideoProject...")

    project = VideoProject(
        name="Auto Video",
        scenes=scenes,
        transitions=transitions,
    )

    total_chars = len(char_map)
    elapsed = time.time() - start_time
    log_step("done", f"Pipeline complete! {project.num_scenes} scenes, "
             f"{project.total_duration:.1f}s, {total_chars} characters, "
             f"{elapsed:.1f}s elapsed")

    return AutoVideoResponse(
        success=True,
        project=project.to_dict(),
        total_scenes=project.num_scenes,
        total_duration=project.total_duration,
        total_characters=total_chars,
        tts_audio_url=tts_audio_url,
        tts_lines=tts_lines_all,
        pipeline_steps=steps,
        message=f"🎬 Auto video created: {project.num_scenes} scenes, "
                f"{project.total_duration:.1f}s, {elapsed:.1f}s pipeline time",
    )


# ══════════════════════════════════════════════
#  Utility Endpoints
# ══════════════════════════════════════════════

@router.get("/status")
async def auto_video_status():
    """Check if auto-video pipeline is available."""
    has_registry = _registry is not None
    char_count = len(_registry.list_characters()) if _registry else 0

    # Check available backgrounds
    backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    stages_dir = os.path.join(backend_dir, "storage", "stages")
    bg_count = 0
    if os.path.exists(stages_dir):
        bg_ids = set()
        for f in os.listdir(stages_dir):
            if f.endswith(".png"):
                if "_element_" in f:
                    bg_ids.add(f.rsplit("_element_", 1)[0])
                else:
                    bg_ids.add(os.path.splitext(f)[0])
        bg_count = len(bg_ids)

    return {
        "available": has_registry and char_count > 0,
        "characters": char_count,
        "backgrounds": bg_count,
        "tts_available": True,  # Volcengine TTS is always available
        "message": f"Ready: {char_count} characters, {bg_count} backgrounds" if has_registry else "Registry not initialized",
    }
    
    # Optional Layer Tweaks for Z-index Context
    for char_id_script, layout in spatial_layout.items():
        for node in graph.nodes.values():
            if getattr(node, "node_type", "") == "character" and node.name == char_id_script:
                target_x = layout.get("default_x", 9.6)
                target_z = layout.get("default_z_index", 0)
                node.set_position(target_x, node.transform.y)
                node.z_index = target_z

    log_step("done", "Hoàn tất VideoProject.", last_time)

    project_data = {
        "scenes": [
            {
                "name": "Scene 1",
                "duration": graph.duration,
                "metadata": {"background_id": background_id},
                **graph.to_dict()
            }
        ],
        "transitions": []
    }

    return AutoVideoResponse(
        success=True,
        project=project_data,
        message="OK",
        total_scenes=1,
        total_duration=graph.duration,
        total_characters=len([n for n in graph.nodes.values() if getattr(n, "node_type", "") == "character"]),
        pipeline_steps=steps
    )
