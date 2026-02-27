"""
P3 Sprint 2 — Batch Generator: Create multiple projects from a JSON file.

Reads scripts/data/episodes.json and generates one AnimeStudio project
per episode entry, saving all of them to the SQLite database.

Usage:
    python scripts/batch_generate.py
    python scripts/batch_generate.py --input scripts/data/my_episodes.json
"""
import sys
import os
import json
import argparse

# Ensure project root is on sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.animestudio import Project, save_to_db
from backend.core.database import init_db


def create_project_from_script(episode: dict) -> str:
    """Translate one StoryScript dict into a Project and save to DB."""
    project = Project(
        name=episode.get("title", "Untitled"),
        description=episode.get("description", ""),
        canvas_width=episode.get("canvas_width", 1920),
        canvas_height=episode.get("canvas_height", 1080),
        fps=episode.get("fps", 30),
    )

    for char_data in episode.get("characters", []):
        track = project.add_track(
            name=char_data.get("name", "Character"),
            character_id=char_data.get("asset_id") or None,
        )

        # Set initial position
        ix = char_data.get("initial_x", 960.0)
        iy = char_data.get("initial_y", 540.0)
        iscale = char_data.get("initial_scale", 1.0)
        track.add_keyframe("x", time=0.0, value=ix)
        track.add_keyframe("y", time=0.0, value=iy)
        track.add_keyframe("scale", time=0.0, value=iscale)
        track.add_keyframe("opacity", time=0.0, value=1.0)

        # Add action block
        asset_hash = char_data.get("asset_hash", "")
        if asset_hash:
            actions = char_data.get("actions", [])
            max_end = max((a.get("end_time", 5) for a in actions), default=5.0)
            track.add_action(asset_hash=asset_hash, start=0.0, end=max_end, z_index=0)

        # Process actions
        for action in char_data.get("actions", []):
            action_type = action.get("type", "")
            t0 = action.get("start_time", 0)
            t1 = action.get("end_time", 3)
            easing = action.get("easing", "easeInOut")

            if action_type == "move":
                if action.get("start_x") is not None and action.get("end_x") is not None:
                    track.add_keyframe("x", time=t0, value=action["start_x"], easing=easing)
                    track.add_keyframe("x", time=t1, value=action["end_x"], easing=easing)
                if action.get("start_y") is not None and action.get("end_y") is not None:
                    track.add_keyframe("y", time=t0, value=action["start_y"], easing=easing)
                    track.add_keyframe("y", time=t1, value=action["end_y"], easing=easing)

            elif action_type == "scale":
                if action.get("start_scale") is not None and action.get("end_scale") is not None:
                    track.add_keyframe("scale", time=t0, value=action["start_scale"], easing=easing)
                    track.add_keyframe("scale", time=t1, value=action["end_scale"], easing=easing)

            elif action_type == "rotate":
                if action.get("start_rotation") is not None and action.get("end_rotation") is not None:
                    track.add_keyframe("rotation", time=t0, value=action["start_rotation"], easing=easing)
                    track.add_keyframe("rotation", time=t1, value=action["end_rotation"], easing=easing)

            elif action_type == "fade":
                if action.get("start_opacity") is not None and action.get("end_opacity") is not None:
                    track.add_keyframe("opacity", time=t0, value=action["start_opacity"], easing=easing)
                    track.add_keyframe("opacity", time=t1, value=action["end_opacity"], easing=easing)

    return save_to_db(project)


def main():
    parser = argparse.ArgumentParser(description="Batch generate AnimeStudio projects from JSON")
    parser.add_argument(
        "--input", "-i",
        default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "episodes.json"),
        help="Path to the episodes JSON file",
    )
    args = parser.parse_args()

    # Initialize database
    init_db()
    print("✅ Database initialized\n")

    # Load episodes
    with open(args.input, "r", encoding="utf-8") as f:
        episodes = json.load(f)

    print(f"📂 Loaded {len(episodes)} episodes from {args.input}\n")
    print("=" * 60)

    created_ids = []
    for i, episode in enumerate(episodes, 1):
        title = episode.get("title", "Untitled")
        chars = len(episode.get("characters", []))
        project_id = create_project_from_script(episode)
        created_ids.append(project_id)
        print(f"  [{i}/{len(episodes)}] ✅ '{title}' ({chars} characters) → ID: {project_id[:8]}...")

    print("=" * 60)
    print(f"\n🎉 Batch complete! Created {len(created_ids)} projects in database.")
    print(f"   Open http://localhost:5173 to view them in the Project Manager.")


if __name__ == "__main__":
    main()
