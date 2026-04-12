"""
Tests for the Scene Graph (Video DOM) module.

Tests cover:
1. Transform creation and operations
2. Keyframe interpolation with all easing types
3. SceneNode CRUD operations
4. CharacterNode pose/face swapping
5. SceneGraph container operations
6. AI Tool execution
7. Serialization round-trip (to_dict → from_dict)
"""

import json
import sys
import os

# Add the project root to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from backend.core.scene_graph.transform import Transform, BoundingBox
from backend.core.scene_graph.keyframe import (
    Keyframe, interpolate_keyframes, Easing, _apply_easing
)
from backend.core.scene_graph.node import SceneNode
from backend.core.scene_graph.specialized_nodes import (
    CharacterNode, BackgroundLayerNode, CameraNode,
    PropNode, TextNode, AudioNode, node_from_dict
)
from backend.core.scene_graph.scene import SceneGraph
from backend.core.scene_graph.tools import SceneToolExecutor, TOOL_DEFINITIONS


def test_transform():
    """Test Transform creation, properties, and operations."""
    print("  ✓ Transform creation...")
    t = Transform(x=5.0, y=7.5, scale_x=1.5, scale_y=1.5, rotation=45.0)
    assert t.x == 5.0
    assert t.y == 7.5
    assert t.scale == 1.5  # uniform scale
    assert t.rotation == 45.0

    print("  ✓ Transform uniform scale setter...")
    t.scale = 2.0
    assert t.scale_x == 2.0
    assert t.scale_y == 2.0

    print("  ✓ Transform position property...")
    t.position = (10.0, 20.0)
    assert t.position == (10.0, 20.0)

    print("  ✓ Transform distance...")
    t1 = Transform(x=0, y=0)
    t2 = Transform(x=3, y=4)
    assert abs(t1.distance_to(t2) - 5.0) < 0.001

    print("  ✓ Transform lerp...")
    a = Transform(x=0, y=0, scale_x=1, scale_y=1, rotation=0)
    b = Transform(x=10, y=10, scale_x=2, scale_y=2, rotation=90)
    mid = a.lerp(b, 0.5)
    assert abs(mid.x - 5.0) < 0.001
    assert abs(mid.y - 5.0) < 0.001
    assert abs(mid.scale_x - 1.5) < 0.001
    assert abs(mid.rotation - 45.0) < 0.001

    print("  ✓ Transform serialization...")
    d = t.to_dict()
    t_restored = Transform.from_dict(d)
    assert t_restored.x == t.x
    assert t_restored.scale_x == t.scale_x


def test_bounding_box():
    """Test BoundingBox."""
    print("  ✓ BoundingBox properties...")
    bb = BoundingBox(left=2, top=3, width=10, height=5)
    assert bb.right == 12
    assert bb.bottom == 8
    assert bb.center == (7.0, 5.5)
    assert bb.contains_point(5, 5)
    assert not bb.contains_point(15, 5)


def test_keyframe_interpolation():
    """Test keyframe interpolation with various easing types."""
    print("  ✓ Empty keyframes...")
    assert interpolate_keyframes([], 1.0) == 0.0

    print("  ✓ Single keyframe (hold)...")
    kfs = [Keyframe(time=1.0, value=5.0)]
    assert interpolate_keyframes(kfs, 0.5) == 5.0  # before → hold
    assert interpolate_keyframes(kfs, 1.0) == 5.0  # at
    assert interpolate_keyframes(kfs, 2.0) == 5.0  # after → hold

    print("  ✓ Two keyframes, linear...")
    kfs = [
        Keyframe(time=0.0, value=0.0, easing="linear"),
        Keyframe(time=1.0, value=10.0),
    ]
    assert abs(interpolate_keyframes(kfs, 0.0) - 0.0) < 0.001
    assert abs(interpolate_keyframes(kfs, 0.5) - 5.0) < 0.001
    assert abs(interpolate_keyframes(kfs, 1.0) - 10.0) < 0.001

    print("  ✓ Three keyframes...")
    kfs = [
        Keyframe(time=0.0, value=0.0),
        Keyframe(time=1.0, value=10.0),
        Keyframe(time=2.0, value=0.0),
    ]
    assert abs(interpolate_keyframes(kfs, 1.5) - 5.0) < 0.001

    print("  ✓ STEP easing (instant jump)...")
    kfs = [
        Keyframe(time=0.0, value=0.0, easing="step"),
        Keyframe(time=1.0, value=10.0),
    ]
    assert interpolate_keyframes(kfs, 0.5) == 0.0  # step = hold until end
    assert interpolate_keyframes(kfs, 1.0) == 10.0  # at end = target value

    print("  ✓ Easing functions...")
    for easing in Easing:
        val_0 = _apply_easing(0.0, easing)
        val_1 = _apply_easing(1.0, easing)
        assert 0.0 <= val_0 <= 1.0 or easing == Easing.STEP, f"{easing} failed at t=0"
        assert abs(val_1 - 1.0) < 0.001, f"{easing} failed at t=1"


def test_scene_node():
    """Test SceneNode CRUD and animation."""
    print("  ✓ SceneNode creation...")
    node = SceneNode(name="TestObj", node_type="generic")
    assert node.name == "TestObj"
    assert node.id.startswith("generic-")

    print("  ✓ SceneNode set_position...")
    node.set_position(5.0, 7.5)
    assert node.transform.x == 5.0
    assert node.transform.y == 7.5

    print("  ✓ SceneNode set_scale...")
    node.set_scale(2.0)
    assert node.transform.scale_x == 2.0
    assert node.transform.scale_y == 2.0

    print("  ✓ SceneNode keyframes...")
    node.add_keyframe("x", 0.0, 0.0)
    node.add_keyframe("x", 2.0, 10.0, "easeInOut")
    assert node.has_animation
    assert node.total_keyframes == 2
    assert abs(node.get_value_at_time("x", 1.0) - 5.0) < 0.5

    print("  ✓ SceneNode snapshot...")
    snap = node.get_snapshot_at_time(1.0)
    assert "x" in snap
    assert "opacity" in snap

    print("  ✓ SceneNode describe...")
    desc = node.describe()
    assert "TestObj" in desc
    assert "Animated" in desc

    print("  ✓ SceneNode hierarchy...")
    child = SceneNode(name="Child")
    node.add_child(child)
    assert len(node.children) == 1
    assert child.parent_id == node.id
    family = node.get_family()
    assert len(family) == 2


def test_character_node():
    """Test CharacterNode with pose/face swapping."""
    print("  ✓ CharacterNode creation...")
    char = CharacterNode(
        name="Hero",
        character_id="hero-001",
        active_layers={"pose": "standing", "face": "smile"},
        available_layers={
            "pose": ["standing", "walking", "waving"],
            "face": ["smile", "laugh", "surprise"],
        },
    )
    assert char.node_type == "character"
    assert char.active_layers["pose"] == "standing"

    print("  ✓ CharacterNode set_pose...")
    char.set_pose("walking")
    assert char.active_layers["pose"] == "walking"

    print("  ✓ CharacterNode set_face...")
    char.set_face("laugh")
    assert char.active_layers["face"] == "laugh"

    print("  ✓ CharacterNode frame sequence (animation)...")
    char.add_frame(0.0, {"pose": "standing", "face": "smile"})
    char.add_frame(2.0, {"pose": "waving", "face": "laugh"})
    char.add_frame(4.0, {"pose": "standing", "face": "surprise"})

    layers_at_1 = char.get_layers_at_time(1.0)
    assert layers_at_1["pose"] == "standing"
    assert layers_at_1["face"] == "smile"

    layers_at_3 = char.get_layers_at_time(3.0)
    assert layers_at_3["pose"] == "waving"
    assert layers_at_3["face"] == "laugh"

    print("  ✓ CharacterNode describe...")
    desc = char.describe()
    assert "character" in desc
    assert "Hero" in desc
    assert "Frame Sequence:" in desc


def test_background_layer():
    """Test BackgroundLayerNode."""
    print("  ✓ BackgroundLayerNode creation...")
    bg = BackgroundLayerNode(
        name="Sky",
        asset_path="/assets/bg/sky.png",
        parallax_speed=0.3,
        blur=2.0,
        z_index=-10,
    )
    assert bg.node_type == "background_layer"
    assert bg.parallax_speed == 0.3
    assert bg.blur == 2.0


def test_scene_graph():
    """Test SceneGraph container operations."""
    print("  ✓ SceneGraph creation...")
    scene = SceneGraph(name="Test Scene", duration=8.0)
    assert scene.world_width == 19.2
    assert scene.world_height == 10.8

    print("  ✓ SceneGraph add nodes...")
    camera = CameraNode(name="Main Camera")
    bg_sky = BackgroundLayerNode(name="Sky", asset_path="sky.png", z_index=-20)
    bg_ground = BackgroundLayerNode(name="Ground", asset_path="ground.png", z_index=-10)
    hero = CharacterNode(
        name="Hero",
        character_id="hero-001",
        transform=Transform(x=5.0, y=7.5),
        active_layers={"pose": "standing", "face": "smile"},
    )
    villain = CharacterNode(
        name="Villain",
        character_id="villain-001",
        transform=Transform(x=14.0, y=7.5),
        active_layers={"pose": "standing", "face": "angry"},
    )

    scene.add_node(camera)
    scene.add_node(bg_sky)
    scene.add_node(bg_ground)
    scene.add_node(hero)
    scene.add_node(villain)

    assert len(scene.nodes) == 5
    assert len(scene.characters) == 2
    assert len(scene.backgrounds) == 2
    assert scene.camera is not None

    print("  ✓ SceneGraph query by type...")
    chars = scene.get_nodes_by_type("character")
    assert len(chars) == 2

    print("  ✓ SceneGraph query by name...")
    h = scene.get_node_by_name("Hero")
    assert h is not None
    assert h.name == "Hero"

    print("  ✓ SceneGraph spatial relationships...")
    rels = scene.get_spatial_relationships()
    assert len(rels) > 0
    assert "Hero" in rels[0]

    print("  ✓ SceneGraph describe...")
    desc = scene.describe()
    assert "Test Scene" in desc
    assert "Hero" in desc
    assert "Villain" in desc

    print("  ✓ SceneGraph snapshot at time...")
    hero.add_keyframe("x", 0.0, 5.0)
    hero.add_keyframe("x", 4.0, 14.0, "easeInOut")
    snapshot = scene.get_snapshot_at_time(2.0)
    assert hero.id in snapshot
    assert snapshot[hero.id]["x"] != 5.0  # should be interpolated

    print("  ✓ SceneGraph coordinate conversion...")
    px, py = scene.world_to_pixel(9.6, 5.4)
    assert px == 960.0
    assert py == 540.0

    print("  ✓ SceneGraph remove node...")
    scene.remove_node(villain.id)
    assert len(scene.nodes) == 4
    assert len(scene.characters) == 1


def test_serialization():
    """Test JSON round-trip serialization."""
    print("  ✓ Create complex scene...")
    scene = SceneGraph(name="Serialization Test", duration=5.0)

    hero = CharacterNode(
        name="Hero",
        character_id="hero-001",
        transform=Transform(x=5.0, y=7.5, scale_x=1.2, scale_y=1.2),
        active_layers={"pose": "standing", "face": "smile"},
        available_layers={
            "pose": ["standing", "walking"],
            "face": ["smile", "laugh"],
        },
    )
    hero.add_keyframe("x", 0.0, 5.0)
    hero.add_keyframe("x", 3.0, 15.0, "easeInOutCubic")
    hero.add_frame(0.0, {"pose": "standing", "face": "smile"})
    hero.add_frame(2.0, {"pose": "walking", "face": "laugh"})

    bg = BackgroundLayerNode(name="Sky", asset_path="sky.png", parallax_speed=0.3, z_index=-10)
    camera = CameraNode(name="Cam", zoom=1.5)

    scene.add_node(hero)
    scene.add_node(bg)
    scene.add_node(camera)

    print("  ✓ Serialize to JSON...")
    json_str = scene.to_json()
    data = json.loads(json_str)
    assert "nodes" in data
    assert len(data["nodes"]) == 3

    print("  ✓ Deserialize from JSON...")
    scene2 = SceneGraph.from_json(json_str)
    assert scene2.name == "Serialization Test"
    assert len(scene2.nodes) == 3

    # Verify character data survived
    hero2 = scene2.get_node_by_name("Hero")
    assert hero2 is not None
    assert isinstance(hero2, CharacterNode)
    assert hero2.active_layers["pose"] == "standing"
    assert len(hero2.frame_sequence) == 2
    assert len(hero2.keyframes.get("x", [])) == 2

    print("  ✓ Verify keyframe values match after round-trip...")
    assert abs(hero2.get_value_at_time("x", 0.0) - 5.0) < 0.001
    assert abs(hero2.get_value_at_time("x", 3.0) - 15.0) < 0.001


def test_tool_executor():
    """Test AI Tool execution against SceneGraph."""
    print("  ✓ Setup scene with tool executor...")
    scene = SceneGraph(name="Tool Test")
    executor = SceneToolExecutor(scene)

    print("  ✓ Tool: add_character...")
    result = executor.execute("add_character", {
        "character_id": "hero-001",
        "name": "Hero",
        "x": 5.0,
        "y": 7.5,
        "scale": 1.2,
    })
    assert result.success
    assert len(scene.characters) == 1
    hero_id = scene.characters[0].id

    print("  ✓ Tool: add_background_layer...")
    result = executor.execute("add_background_layer", {
        "name": "Sky",
        "asset_path": "sky.png",
        "z_index": -10,
        "parallax_speed": 0.3,
    })
    assert result.success

    print("  ✓ Tool: get_scene_summary...")
    result = executor.execute("get_scene_summary", {})
    assert result.success
    assert "Hero" in result.data

    print("  ✓ Tool: list_objects...")
    result = executor.execute("list_objects", {})
    assert result.success
    assert len(result.data) == 2

    print("  ✓ Tool: set_position...")
    result = executor.execute("set_position", {
        "object_id": hero_id,
        "x": 10.0,
        "y": 8.0,
    })
    assert result.success
    hero = scene.get_node(hero_id)
    assert hero.transform.x == 10.0

    print("  ✓ Tool: set_scale...")
    result = executor.execute("set_scale", {
        "object_id": hero_id,
        "scale": 2.0,
    })
    assert result.success
    assert hero.transform.scale_x == 2.0

    print("  ✓ Tool: set_rotation...")
    result = executor.execute("set_rotation", {
        "object_id": hero_id,
        "degrees": 45.0,
    })
    assert result.success
    assert hero.transform.rotation == 45.0

    print("  ✓ Tool: add_keyframe...")
    result = executor.execute("add_keyframe", {
        "object_id": hero_id,
        "property": "x",
        "time": 0.0,
        "value": 5.0,
    })
    assert result.success
    result = executor.execute("add_keyframe", {
        "object_id": hero_id,
        "property": "x",
        "time": 3.0,
        "value": 15.0,
        "easing": "easeInOut",
    })
    assert result.success
    assert hero.has_animation

    print("  ✓ Tool: set_character_pose...")
    result = executor.execute("set_character_pose", {
        "object_id": hero_id,
        "layers": {"pose": "waving", "face": "laugh"},
    })
    assert result.success

    print("  ✓ Tool: add_character_frame...")
    result = executor.execute("add_character_frame", {
        "object_id": hero_id,
        "time": 2.0,
        "layers": {"pose": "walking", "face": "surprise"},
    })
    assert result.success

    print("  ✓ Tool: error handling (not found)...")
    result = executor.execute("set_position", {
        "object_id": "nonexistent",
        "x": 0,
        "y": 0,
    })
    assert not result.success
    assert "not found" in result.error

    print("  ✓ Tool: error handling (wrong type)...")
    bg_id = scene.backgrounds[0].id
    result = executor.execute("set_character_pose", {
        "object_id": bg_id,
        "layers": {"pose": "standing"},
    })
    assert not result.success
    assert "not a character" in result.error

    print("  ✓ Tool: action log...")
    assert len(executor.action_log) > 5

    print("  ✓ Tool definitions count...")
    assert len(TOOL_DEFINITIONS) >= 15


def test_node_factory():
    """Test node_from_dict factory dispatches correctly."""
    print("  ✓ Factory: character...")
    data = {
        "id": "char-1",
        "name": "Test",
        "node_type": "character",
        "character_id": "test-001",
        "transform": {"x": 5, "y": 7},
        "active_layers": {"pose": "standing"},
        "available_layers": {},
        "frame_sequence": [],
    }
    node = node_from_dict(data)
    assert isinstance(node, CharacterNode)
    assert node.character_id == "test-001"

    print("  ✓ Factory: background_layer...")
    data = {
        "id": "bg-1",
        "name": "Sky",
        "node_type": "background_layer",
        "asset_path": "sky.png",
        "transform": {},
    }
    node = node_from_dict(data)
    assert isinstance(node, BackgroundLayerNode)

    print("  ✓ Factory: generic (fallback)...")
    data = {"id": "x-1", "name": "Unknown", "node_type": "generic", "transform": {}}
    node = node_from_dict(data)
    assert isinstance(node, SceneNode)


# ══════════════════════════════════════════════
#  MAIN
# ══════════════════════════════════════════════

if __name__ == "__main__":
    tests = [
        ("Transform", test_transform),
        ("BoundingBox", test_bounding_box),
        ("Keyframe Interpolation", test_keyframe_interpolation),
        ("SceneNode", test_scene_node),
        ("CharacterNode", test_character_node),
        ("BackgroundLayerNode", test_background_layer),
        ("SceneGraph", test_scene_graph),
        ("Serialization Round-trip", test_serialization),
        ("AI Tool Executor", test_tool_executor),
        ("Node Factory", test_node_factory),
    ]

    print("=" * 60)
    print("🎬 AnimeStudio Scene Graph — Unit Tests")
    print("=" * 60)

    passed = 0
    failed = 0
    for name, test_func in tests:
        try:
            print(f"\n▶ {name}")
            test_func()
            print(f"  ✅ {name} PASSED")
            passed += 1
        except Exception as e:
            print(f"  ❌ {name} FAILED: {e}")
            import traceback
            traceback.print_exc()
            failed += 1

    print("\n" + "=" * 60)
    print(f"Results: {passed} passed, {failed} failed, {passed + failed} total")
    print("=" * 60)

    sys.exit(1 if failed > 0 else 0)
