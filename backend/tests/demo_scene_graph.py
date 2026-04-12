"""
Scene Graph Demo — Mô phỏng AI đạo diễn một cảnh phim hoạt hình.

Kịch bản: Hai nhân vật gặp nhau trong rừng.
- Hero đi từ trái sang phải
- Villain xuất hiện từ bên phải
- Camera zoom vào khi họ gặp nhau
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from backend.core.scene_graph.scene import SceneGraph
from backend.core.scene_graph.tools import SceneToolExecutor


def main():
    # ═══════════════════════════════════════════
    #  AI Director sets up the scene
    # ═══════════════════════════════════════════

    scene = SceneGraph(name="Forest Encounter", duration=6.0)
    ai = SceneToolExecutor(scene)

    print("=" * 60)
    print("  Scene Graph Demo - AI Director")
    print("=" * 60)

    # Step 1: AI adds background layers (from FLA file)
    print("\n[1] AI adds background layers (FLA)...")
    ai.execute("add_background_layer", {
        "name": "Sky", "asset_path": "forest/sky.png",
        "z_index": -30, "parallax_speed": 0.1
    })
    ai.execute("add_background_layer", {
        "name": "Mountains", "asset_path": "forest/mountains.png",
        "z_index": -20, "parallax_speed": 0.3
    })
    ai.execute("add_background_layer", {
        "name": "Trees", "asset_path": "forest/trees.png",
        "z_index": -10, "parallax_speed": 0.7
    })
    ai.execute("add_background_layer", {
        "name": "Ground", "asset_path": "forest/ground.png",
        "z_index": -5, "parallax_speed": 1.0
    })

    # Step 2: AI adds characters (from PSD files)
    print("[2] AI adds characters (PSD)...")
    r1 = ai.execute("add_character", {
        "character_id": "hero-001", "name": "Hero",
        "x": 2.0, "y": 7.5, "scale": 1.0
    })
    hero_id = scene.characters[0].id

    r2 = ai.execute("add_character", {
        "character_id": "villain-001", "name": "Villain",
        "x": 17.0, "y": 7.5, "scale": 1.0
    })
    villain_id = scene.characters[1].id

    # Step 3: AI sets initial poses
    print("[3] AI sets character poses...")
    ai.execute("set_character_pose", {
        "object_id": hero_id,
        "layers": {"pose": "walking", "face": "determined"}
    })
    ai.execute("set_character_pose", {
        "object_id": villain_id,
        "layers": {"pose": "standing", "face": "smirk"}
    })

    # Step 4: AI creates keyframe animations
    print("[4] AI creates animations...")

    # Hero walks from left to center
    ai.execute("add_keyframe", {"object_id": hero_id, "property": "x", "time": 0.0, "value": 2.0})
    ai.execute("add_keyframe", {"object_id": hero_id, "property": "x", "time": 3.0, "value": 8.0, "easing": "easeInOut"})
    ai.execute("add_keyframe", {"object_id": hero_id, "property": "x", "time": 6.0, "value": 8.5, "easing": "easeOut"})

    # Villain approaches from right
    ai.execute("add_keyframe", {"object_id": villain_id, "property": "x", "time": 0.0, "value": 17.0})
    ai.execute("add_keyframe", {"object_id": villain_id, "property": "x", "time": 2.0, "value": 17.0})
    ai.execute("add_keyframe", {"object_id": villain_id, "property": "x", "time": 4.0, "value": 11.0, "easing": "easeInOut"})

    # Villain fades in
    ai.execute("add_keyframe", {"object_id": villain_id, "property": "opacity", "time": 0.0, "value": 0.0})
    ai.execute("add_keyframe", {"object_id": villain_id, "property": "opacity", "time": 2.0, "value": 0.0})
    ai.execute("add_keyframe", {"object_id": villain_id, "property": "opacity", "time": 3.0, "value": 1.0, "easing": "easeIn"})

    # Step 5: AI adds pose change frames
    print("[5] AI schedules pose/face changes...")
    ai.execute("add_character_frame", {
        "object_id": hero_id, "time": 0.0,
        "layers": {"pose": "walking", "face": "determined"}
    })
    ai.execute("add_character_frame", {
        "object_id": hero_id, "time": 3.0,
        "layers": {"pose": "standing", "face": "surprised"}
    })
    ai.execute("add_character_frame", {
        "object_id": hero_id, "time": 4.5,
        "layers": {"pose": "fighting_stance", "face": "angry"}
    })

    ai.execute("add_character_frame", {
        "object_id": villain_id, "time": 2.0,
        "layers": {"pose": "walking", "face": "smirk"}
    })
    ai.execute("add_character_frame", {
        "object_id": villain_id, "time": 4.0,
        "layers": {"pose": "standing", "face": "evil_laugh"}
    })

    # ═══════════════════════════════════════════
    #  AI reads the scene (what the LLM "sees")
    # ═══════════════════════════════════════════

    print("\n" + "=" * 60)
    print("  AI Scene Description (what AI 'sees')")
    print("=" * 60)
    print(scene.describe())

    print("\n" + "=" * 60)
    print("  Spatial Relationships")
    print("=" * 60)
    for rel in scene.get_spatial_relationships():
        print(f"  {rel}")

    # ═══════════════════════════════════════════
    #  Timeline playback (frame-by-frame evaluation)
    # ═══════════════════════════════════════════

    print("\n" + "=" * 60)
    print("  Timeline Playback (every 1 second)")
    print("=" * 60)

    for t in [0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0]:
        snapshot = scene.get_snapshot_at_time(t)
        hero_snap = snapshot[hero_id]
        villain_snap = snapshot[villain_id]

        hero_layers = hero_snap.get("active_layers", {})
        villain_layers = villain_snap.get("active_layers", {})

        print(f"\n  t={t:.0f}s:")
        print(f"    Hero:    x={hero_snap['x']:5.1f}  opacity={hero_snap['opacity']:.1f}  "
              f"pose={hero_layers.get('pose', '?'):<16s} face={hero_layers.get('face', '?')}")
        print(f"    Villain: x={villain_snap['x']:5.1f}  opacity={villain_snap['opacity']:.1f}  "
              f"pose={villain_layers.get('pose', '?'):<16s} face={villain_layers.get('face', '?')}")

    # ═══════════════════════════════════════════
    #  AI action log
    # ═══════════════════════════════════════════

    print(f"\n" + "=" * 60)
    print(f"  AI Action Log ({len(ai.action_log)} tool calls)")
    print("=" * 60)
    for i, action in enumerate(ai.action_log):
        status = "OK" if action["success"] else "FAIL"
        print(f"  [{i+1:2d}] {status} {action['tool']}({', '.join(f'{k}={v}' for k, v in list(action['params'].items())[:3])})")

    # ═══════════════════════════════════════════
    #  Save scene to JSON
    # ═══════════════════════════════════════════

    output_path = os.path.join(os.path.dirname(__file__), "demo_scene.json")
    scene.save(output_path)
    print(f"\n  Scene saved to: {output_path}")
    print(f"  Scene JSON size: {os.path.getsize(output_path):,} bytes")


if __name__ == "__main__":
    main()
