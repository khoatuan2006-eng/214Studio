"""
Builder Agent — ScenePlan → Workflow Nodes + Edges

Converts a ScenePlan (from Director Agent) into the exact JSON format
expected by the frontend useWorkflowStore (React Flow nodes + edges).
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Any

from backend.core.agents.director_agent import (
    ScenePlan,
    CharacterPlan,
    BackgroundPlan,
    CameraPlan,
    ForegroundPlan,
    PropPlan,
    AudioPlan,
)

logger = logging.getLogger(__name__)

# ══════════════════════════════════════════════
#  WORKFLOW RESULT
# ══════════════════════════════════════════════

@dataclass
class WorkflowResult:
    nodes: list[dict] = field(default_factory=list)
    edges: list[dict] = field(default_factory=list)
    scene_id: str = ""

    def to_dict(self) -> dict:
        return {
            "nodes": self.nodes,
            "edges": self.edges,
            "sceneId": self.scene_id,
        }


# ══════════════════════════════════════════════
#  ID GENERATORS
# ══════════════════════════════════════════════

_id_counter = 0

def _next_id(prefix: str = "ai") -> str:
    global _id_counter
    _id_counter += 1
    return f"{prefix}-{int(time.time())}-{_id_counter}"


def _edge_id(source: str, target: str) -> str:
    return f"e-{source}-{target}"


# ══════════════════════════════════════════════
#  NODE LAYOUT (auto-arrange nodes on canvas)
# ══════════════════════════════════════════════

# React Flow grid positions for a clean layout
_LAYOUT = {
    "scene":      {"x": 800, "y": 400},
    "background": {"x": 200, "y": 100},
    "camera":     {"x": 200, "y": 300},
    "foreground":  {"x": 200, "y": 500},
    "char_start": {"x": 500, "y": 50},
    "char_gap_y": 180,
    "prop_start": {"x": 1100, "y": 100},
    "prop_gap_y": 150,
    "audio_start": {"x": 1100, "y": 500},
    "audio_gap_y": 120,
}


# ══════════════════════════════════════════════
#  MAIN BUILDER
# ══════════════════════════════════════════════

def build_workflow(
    plan: ScenePlan,
    available_characters: list[dict] | None = None,
) -> WorkflowResult:
    """
    Convert a ScenePlan into workflow nodes + edges.

    Args:
        plan: The scene plan from Director Agent
        available_characters: Character asset data from library with layer_groups

    Returns a WorkflowResult ready to be sent to the frontend.
    """
    result = WorkflowResult()

    # Build character lookup for frame auto-population
    char_catalog: dict[str, dict] = {}
    for c in (available_characters or []):
        cid = c.get("id", "")
        if cid:
            char_catalog[cid] = c

    # 1. Scene Output node
    scene_id = _next_id("scene")
    result.scene_id = scene_id
    result.nodes.append({
        "id": scene_id,
        "type": "scene",
        "position": _LAYOUT["scene"],
        "data": {
            "label": plan.title or "Scene Output",
            "fps": plan.canvas.fps,
            "canvasWidth": plan.canvas.width,
            "canvasHeight": plan.canvas.height,
            "totalDuration": plan.canvas.total_duration,
        },
    })

    # 2. Background
    if plan.background:
        bg_id = _next_id("bg")
        result.nodes.append(_build_background_node(bg_id, plan.background))
        result.edges.append(_make_edge(bg_id, scene_id))

    # 3. Characters
    for i, char_plan in enumerate(plan.characters):
        char_id = _next_id("char")
        y_pos = _LAYOUT["char_start"]["y"] + i * _LAYOUT["char_gap_y"]
        char_data = char_catalog.get(char_plan.character_id, {})
        result.nodes.append(_build_character_node(char_id, char_plan, y_pos, char_data))
        result.edges.append(_make_edge(char_id, scene_id))

    # 4. Camera
    if plan.camera and plan.camera.action != "static":
        cam_id = _next_id("cam")
        result.nodes.append(_build_camera_node(cam_id, plan.camera))
        result.edges.append(_make_edge(cam_id, scene_id))

    # 5. Foreground
    if plan.foreground and plan.foreground.effect_type != "none":
        fg_id = _next_id("fg")
        result.nodes.append(_build_foreground_node(fg_id, plan.foreground))
        result.edges.append(_make_edge(fg_id, scene_id))

    # 6. Props
    for i, prop_plan in enumerate(plan.props):
        prop_id = _next_id("prop")
        y_pos = _LAYOUT["prop_start"]["y"] + i * _LAYOUT["prop_gap_y"]
        result.nodes.append(_build_prop_node(prop_id, prop_plan, y_pos))
        result.edges.append(_make_edge(prop_id, scene_id))

    # 7. Audio
    for i, audio_plan in enumerate(plan.audio):
        audio_id = _next_id("audio")
        y_pos = _LAYOUT["audio_start"]["y"] + i * _LAYOUT["audio_gap_y"]
        result.nodes.append(_build_audio_node(audio_id, audio_plan, y_pos))
        result.edges.append(_make_edge(audio_id, scene_id))

    logger.info(
        f"[Builder] Created workflow: {len(result.nodes)} nodes, "
        f"{len(result.edges)} edges"
    )

    return result


# ══════════════════════════════════════════════
#  APPLY CORRECTIONS (from Reviewer)
# ══════════════════════════════════════════════

def apply_corrections(
    workflow: WorkflowResult,
    corrections: list[dict],
) -> WorkflowResult:
    """
    Apply corrections from the Reviewer Agent to an existing workflow.

    corrections: list of {node_id, field, new_value}
    """
    node_map = {n["id"]: n for n in workflow.nodes}

    for corr in corrections:
        node_id = corr.get("node_id", "")
        field_name = corr.get("field", "")
        new_value = corr.get("new_value")

        if node_id not in node_map:
            logger.warning(f"[Builder] Correction for unknown node: {node_id}")
            continue

        node = node_map[node_id]
        data = node.get("data", {})

        if field_name in data:
            old_val = data[field_name]
            data[field_name] = new_value
            logger.info(
                f"[Builder] Correction: {node_id}.{field_name}: "
                f"{old_val} → {new_value} ({corr.get('reason', '')})"
            )
        else:
            logger.warning(f"[Builder] Field '{field_name}' not found in node {node_id}")

    return workflow


# ══════════════════════════════════════════════
#  NODE BUILDERS
# ══════════════════════════════════════════════

def _build_character_node(
    node_id: str, plan: CharacterPlan, y_offset: float, char_data: dict | None = None
) -> dict:
    kfs = [
        {"time": kf.time, "x": kf.x, "y": kf.y}
        for kf in plan.position_keyframes
    ]

    # ── Resolve AI frame_selections → PoseFrames ──
    sequence: list[dict] = []
    layer_groups = (char_data or {}).get("layer_groups", {})

    if plan.frame_selections and layer_groups:
        for i, fs in enumerate(plan.frame_selections):
            resolved_layers: dict[str, str] = {}

            for group_name, chosen_name in fs.layers.items():
                assets = layer_groups.get(group_name, [])
                if not isinstance(assets, list) or not assets:
                    continue

                # Try exact match first, then partial match, then fallback to first
                matched = None
                for a in assets:
                    aname = a.get("name", "")
                    if aname == chosen_name:
                        matched = a
                        break
                if not matched:
                    # Partial match (AI might say "站立" but asset is "站立_正面")
                    for a in assets:
                        aname = a.get("name", "")
                        if chosen_name in aname or aname in chosen_name:
                            matched = a
                            break
                if not matched:
                    # Fallback to first asset in group
                    matched = assets[0]
                    logger.warning(
                        f"[Builder] '{plan.name}': No match for '{chosen_name}' in "
                        f"'{group_name}', using '{matched.get('name', '?')}'"
                    )

                if matched:
                    ahash = matched.get("hash", "") or matched.get("name", "")
                    if ahash:
                        resolved_layers[group_name] = ahash

            if resolved_layers:
                sequence.append({
                    "id": f"frame-{node_id}-{i}",
                    "duration": fs.duration,
                    "layers": resolved_layers,
                    "transition": fs.transition,
                    "transitionDuration": fs.transition_duration,
                })

        if sequence:
            selected_info = " → ".join(
                f"[{len(s['layers'])} layers, {s['duration']}s]"
                for s in sequence
            )
            logger.info(
                f"[Builder] AI frames for '{plan.name}': {len(sequence)} frames "
                f"({selected_info})"
            )

    # Fallback: if no frames from AI, create one with first asset from each group
    if not sequence and layer_groups:
        default_layers: dict[str, str] = {}
        for group_name, assets in layer_groups.items():
            if isinstance(assets, list) and len(assets) > 0:
                ahash = assets[0].get("hash", "") or assets[0].get("name", "")
                if ahash:
                    default_layers[group_name] = ahash
        if default_layers:
            sequence.append({
                "id": f"frame-{node_id}-0",
                "duration": 5.0,
                "layers": default_layers,
                "transition": "cut",
                "transitionDuration": 0,
            })
            logger.info(f"[Builder] Fallback frame for '{plan.name}': {len(default_layers)} layers")

    return {
        "id": node_id,
        "type": "character",
        "position": {"x": _LAYOUT["char_start"]["x"], "y": y_offset},
        "data": {
            "label": plan.name,
            "characterId": plan.character_id,
            "characterName": plan.name,
            "posX": plan.pos_x,
            "posY": plan.pos_y,
            "zIndex": plan.z_index,
            "scale": plan.scale,
            "opacity": plan.opacity,
            "sequence": sequence,
            "positionKeyframes": kfs,
        },
    }


def _build_background_node(node_id: str, plan: BackgroundPlan) -> dict:
    return {
        "id": node_id,
        "type": "background",
        "position": _LAYOUT["background"],
        "data": {
            "label": plan.label or "Background",
            "assetHash": "",
            "assetPath": plan.asset_path,
            "blur": plan.blur,
            "parallaxSpeed": plan.parallax_speed,
        },
    }


def _build_camera_node(node_id: str, plan: CameraPlan) -> dict:
    """Build camera node with CameraNodeData format (keyframes, fov, viewport)."""
    import uuid

    keyframes = []

    # Start keyframe
    keyframes.append({
        "id": str(uuid.uuid4())[:8],
        "time": 0,
        "x": plan.start_x,      # world units
        "y": plan.start_y,      # world units
        "zoom": plan.start_zoom,
        "easing": plan.easing,
    })

    # End keyframe (if camera moves or zooms)
    if (plan.action != "static" and
        (plan.start_x != plan.end_x or plan.start_y != plan.end_y or
         plan.start_zoom != plan.end_zoom)):
        keyframes.append({
            "id": str(uuid.uuid4())[:8],
            "time": plan.duration,
            "x": plan.end_x,    # world units
            "y": plan.end_y,    # world units
            "zoom": plan.end_zoom,
            "easing": plan.easing,
        })

    return {
        "id": node_id,
        "type": "camera",
        "position": _LAYOUT["camera"],
        "data": {
            "label": "Camera",
            "fov": plan.fov,            # field of view in world units
            "viewportWidth": 1920,       # output resolution (px)
            "viewportHeight": 1080,      # output resolution (px)
            "keyframes": keyframes,
        },
    }


def _build_foreground_node(node_id: str, plan: ForegroundPlan) -> dict:
    return {
        "id": node_id,
        "type": "foreground",
        "position": _LAYOUT["foreground"],
        "data": {
            "label": f"FX: {plan.effect_type}",
            "effectType": plan.effect_type,
            "intensity": plan.intensity,
            "speed": plan.speed,
            "opacity": plan.opacity,
            "zIndex": 50,
            "assetPath": "",
        },
    }


def _build_prop_node(node_id: str, plan: PropPlan, y_offset: float) -> dict:
    return {
        "id": node_id,
        "type": "prop",
        "position": {"x": _LAYOUT["prop_start"]["x"], "y": y_offset},
        "data": {
            "label": plan.label,
            "assetHash": "",
            "assetPath": plan.asset_path,
            "posX": plan.pos_x,
            "posY": plan.pos_y,
            "zIndex": plan.z_index,
            "scale": plan.scale,
            "opacity": 1.0,
            "rotation": plan.rotation,
        },
    }


def _build_audio_node(node_id: str, plan: AudioPlan, y_offset: float) -> dict:
    return {
        "id": node_id,
        "type": "audio",
        "position": {"x": _LAYOUT["audio_start"]["x"], "y": y_offset},
        "data": {
            "label": plan.label,
            "audioType": plan.audio_type,
            "assetPath": "",
            "volume": plan.volume,
            "startTime": 0,
            "loop": plan.loop,
            "fadeIn": 0,
            "fadeOut": 0,
        },
    }


def _make_edge(source: str, target: str) -> dict:
    return {
        "id": _edge_id(source, target),
        "source": source,
        "target": target,
    }
