"""
Tests for scene_analyzer module.
"""
import sys
import os

# Ensure backend module is importable
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from backend.core.scene_analyzer import (
    analyze_scene,
    SceneContext,
    _get_horizontal_position,
    _get_vertical_position,
)

# ── Helpers ──

def make_scene_node(node_id="scene-1"):
    return {
        "id": node_id,
        "type": "scene",
        "position": {"x": 0, "y": 0},
        "data": {
            "label": "Scene Output",
            "fps": 30,
            "canvasWidth": 1920,
            "canvasHeight": 1080,
            "totalDuration": 10,
        },
    }


def make_character_node(node_id="char-1", name="Hero", pos_x=960, pos_y=540, z_index=10, scale=1.0, sequence=None, kfs=None):
    return {
        "id": node_id,
        "type": "character",
        "position": {"x": 100, "y": 100},
        "data": {
            "label": name,
            "characterId": f"cid-{node_id}",
            "characterName": name,
            "posX": pos_x,
            "posY": pos_y,
            "zIndex": z_index,
            "scale": scale,
            "opacity": 1.0,
            "sequence": sequence or [],
            "positionKeyframes": kfs or [],
        },
    }


def make_background_node(node_id="bg-1", label="Forest BG", asset_hash="abc123", blur=0, parallax=0):
    return {
        "id": node_id,
        "type": "background",
        "position": {"x": 0, "y": 0},
        "data": {
            "label": label,
            "assetHash": asset_hash,
            "assetPath": f"/static/backgrounds/{asset_hash}.png",
            "blur": blur,
            "parallaxSpeed": parallax,
        },
    }


def make_camera_node(node_id="cam-1", action="pan", start_zoom=1, end_zoom=2):
    # Build keyframes: 2 keyframes = "pan", 1 keyframe = "static"
    keyframes = [
        {"id": "kf1", "time": 0, "x": 9.6, "y": 5.4, "zoom": start_zoom, "easing": "easeInOut"},
    ]
    if action != "static":
        keyframes.append(
            {"id": "kf2", "time": 3, "x": 4.0, "y": 3.0, "zoom": end_zoom, "easing": "easeInOut"},
        )
    return {
        "id": node_id,
        "type": "camera",
        "position": {"x": 0, "y": 0},
        "data": {
            "label": "Camera",
            "fov": 19.2,
            "viewportWidth": 1920,
            "viewportHeight": 1080,
            "keyframes": keyframes,
        },
    }


def make_edge(source, target):
    return {"id": f"e-{source}-{target}", "source": source, "target": target}


# ══════════════════════════════════════════════
#  TESTS
# ══════════════════════════════════════════════

class TestEmptyWorkflow:
    def test_no_nodes(self):
        ctx = analyze_scene([], [])
        assert isinstance(ctx, SceneContext)
        assert len(ctx.characters) == 0
        assert ctx.background is None
        assert ctx.camera is None
        assert "Không có nhân vật" in ctx.arrangement_description

    def test_scene_only(self):
        nodes = [make_scene_node()]
        ctx = analyze_scene(nodes, [])
        assert ctx.canvas.width == 1920
        assert ctx.canvas.height == 1080
        assert len(ctx.characters) == 0


class TestSingleCharacterScene:
    def test_one_character_center(self):
        scene = make_scene_node()
        char = make_character_node(pos_x=960, pos_y=540)
        edges = [make_edge("char-1", "scene-1")]

        ctx = analyze_scene([scene, char], edges)

        assert len(ctx.characters) == 1
        assert ctx.characters[0].name == "Hero"
        assert ctx.characters[0].position_relative == "giữa"
        assert ctx.characters[0].vertical_position == "giữa"
        assert "1 nhân vật" in ctx.arrangement_description

    def test_one_character_left(self):
        scene = make_scene_node()
        char = make_character_node(pos_x=200, pos_y=540)
        edges = [make_edge("char-1", "scene-1")]

        ctx = analyze_scene([scene, char], edges)

        assert ctx.characters[0].position_relative == "trái"

    def test_one_character_right(self):
        scene = make_scene_node()
        char = make_character_node(pos_x=1600, pos_y=540)
        edges = [make_edge("char-1", "scene-1")]

        ctx = analyze_scene([scene, char], edges)

        assert ctx.characters[0].position_relative == "phải"


class TestMultipleCharactersScene:
    def test_two_characters(self):
        scene = make_scene_node()
        char_a = make_character_node("char-1", "Alice", pos_x=300, z_index=10)
        char_b = make_character_node("char-2", "Bob", pos_x=1600, z_index=20)
        edges = [make_edge("char-1", "scene-1"), make_edge("char-2", "scene-1")]

        ctx = analyze_scene([scene, char_a, char_b], edges)

        assert len(ctx.characters) == 2
        names = {c.name for c in ctx.characters}
        assert "Alice" in names
        assert "Bob" in names
        assert "2 nhân vật" in ctx.arrangement_description

    def test_layer_order(self):
        scene = make_scene_node()
        bg = make_background_node()
        char = make_character_node(z_index=10)
        edges = [make_edge("bg-1", "scene-1"), make_edge("char-1", "scene-1")]

        ctx = analyze_scene([scene, bg, char], edges)

        assert len(ctx.layer_order) == 2
        # Background should be first (z=0), character second (z=10)
        assert ctx.layer_order[0].type == "background"
        assert ctx.layer_order[1].type == "character"


class TestWithBackground:
    def test_background_info(self):
        scene = make_scene_node()
        bg = make_background_node(label="Mountain BG", blur=2.5)
        edges = [make_edge("bg-1", "scene-1")]

        ctx = analyze_scene([scene, bg], edges)

        assert ctx.background is not None
        assert ctx.background.label == "Mountain BG"
        assert ctx.background.blur == 2.5
        assert "Mountain BG" in ctx.arrangement_description


class TestWithCamera:
    def test_camera_pan(self):
        scene = make_scene_node()
        cam = make_camera_node(action="pan", start_zoom=1, end_zoom=2)
        edges = [make_edge("cam-1", "scene-1")]

        ctx = analyze_scene([scene, cam], edges)

        assert ctx.camera is not None
        assert ctx.camera.action == "pan"
        assert ctx.camera.start_zoom == 1
        assert ctx.camera.end_zoom == 2
        assert "Camera: pan" in ctx.arrangement_description


class TestPositionKeyframes:
    def test_character_with_keyframes(self):
        scene = make_scene_node()
        kfs = [
            {"time": 0, "x": 200, "y": 540},
            {"time": 2, "x": 1600, "y": 540},
        ]
        char = make_character_node(kfs=kfs)
        edges = [make_edge("char-1", "scene-1")]

        ctx = analyze_scene([scene, char], edges)

        assert ctx.characters[0].has_position_keyframes is True
        assert ctx.characters[0].position_keyframe_count == 2


class TestPositionHelpers:
    def test_horizontal_left(self):
        assert _get_horizontal_position(100, 1920) == "trái"

    def test_horizontal_center(self):
        assert _get_horizontal_position(960, 1920) == "giữa"

    def test_horizontal_right(self):
        assert _get_horizontal_position(1500, 1920) == "phải"

    def test_vertical_top(self):
        assert _get_vertical_position(100, 1080) == "trên"

    def test_vertical_center(self):
        assert _get_vertical_position(540, 1080) == "giữa"

    def test_vertical_bottom(self):
        assert _get_vertical_position(900, 1080) == "dưới"


class TestContextSerialization:
    def test_to_dict(self):
        scene = make_scene_node()
        char = make_character_node()
        bg = make_background_node()
        edges = [make_edge("char-1", "scene-1"), make_edge("bg-1", "scene-1")]

        ctx = analyze_scene([scene, char, bg], edges)
        d = ctx.to_dict()

        assert isinstance(d, dict)
        assert "characters" in d
        assert "background" in d
        assert "canvas" in d
        assert "layer_order" in d
        assert "arrangement_description" in d
        assert len(d["characters"]) == 1
        assert d["canvas"]["width"] == 1920


class TestDisconnectedNodes:
    def test_disconnected_nodes_ignored(self):
        """Nodes not connected to the Scene node should be ignored."""
        scene = make_scene_node()
        char_connected = make_character_node("char-1", "Connected")
        char_disconnected = make_character_node("char-2", "Disconnected")
        edges = [make_edge("char-1", "scene-1")]  # only char-1 connected

        ctx = analyze_scene([scene, char_connected, char_disconnected], edges)

        assert len(ctx.characters) == 1
        assert ctx.characters[0].name == "Connected"
