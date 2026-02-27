"""
P3 Sprint 1 — Proof of Concept: Generate an animation scene via Python SDK.

This script demonstrates using the AnimeStudio Scripting API to:
1. Create a Project programmatically
2. Add a character track with keyframed movement
3. Save it directly to the SQLite database

Usage:
    python scripts/generate_scene.py
"""
import sys
import os

# Ensure project root is on sys.path so we can import backend.*
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.animestudio import Project, save_to_db
from backend.core.database import init_db

# Initialize database tables (idempotent)
init_db()
print("✅ Database initialized")

# ── Step 1: Create a Project ─────────────────────────────────────
project = Project(
    name="Auto Generated Episode 1",
    description="Created via Python Scripting API (P3 Sprint 1 PoC)",
    canvas_width=1920,
    canvas_height=1080,
    fps=30,
)
print(f"📦 Project created: '{project.name}' (ID: {project.id})")

# ── Step 2: Add a Character Track ────────────────────────────────
hero = project.add_track(
    name="Hero Character",
    character_id="char_hero_001",
)
print(f"🎭 Track added: '{hero.name}'")

# ── Step 3: Animate — Move X from 100 to 800 in 3 seconds ───────
hero.add_keyframe("x", time=0.0, value=100, easing="easeIn")
hero.add_keyframe("x", time=3.0, value=800, easing="easeOut")

# Also set Y to center and scale to 1.0
hero.add_keyframe("y", time=0.0, value=540)
hero.add_keyframe("scale", time=0.0, value=1.0)
hero.add_keyframe("opacity", time=0.0, value=1.0)

print("🔑 Keyframes added: X 100→800 (0s→3s, easeIn→easeOut)")

# ── Step 4: Add an Action Block (media reference) ────────────────
hero.add_action(
    asset_hash="demo_asset_hash_001",
    start=0.0,
    end=5.0,
    z_index=1,
)
print("🎬 Action block added: 0s→5s")

# ── Step 5: Save to Database ─────────────────────────────────────
project_id = save_to_db(project)
print(f"\n🎉 SUCCESS! Project saved to database!")
print(f"   Project ID: {project_id}")
print(f"   Open http://localhost:5173 and load this project from the Project Manager.")

# ── Bonus: Print the JSON data structure ─────────────────────────
import json
print(f"\n📄 Generated JSON (editorData):")
print(json.dumps(project.to_editor_data(), indent=2))
