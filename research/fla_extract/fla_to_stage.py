#!/usr/bin/env python3
"""
FLA → Stage Workflow Importer
==============================

Đọc các thư mục đã export từ batch_export_fla.jsfl
→ Copy PNG vào backend/storage/stages/
→ Tạo StageNodeData JSON tương thích với workflow editor

Cách dùng:
  python fla_to_stage.py <export_dir> [--output workflow_stages.json]
  python fla_to_stage.py D:\\path\\to\\stage_export
  python fla_to_stage.py D:\\path\\to\\stage_export\\specific_scene

Kết quả:
  1. PNG files → backend/storage/stages/<scene_name>/
  2. JSON file chứa StageNodeData cho mỗi scene
"""

import os
import sys
import json
import shutil
import hashlib
import argparse
from pathlib import Path
from datetime import datetime

# ══════════════════════════════════════
#  PATHS
# ══════════════════════════════════════

SCRIPT_DIR = Path(__file__).parent
PROJECT_DIR = SCRIPT_DIR.parent
BACKEND_STORAGE = PROJECT_DIR / "backend" / "storage"
STAGES_DIR = BACKEND_STORAGE / "stages"


# ══════════════════════════════════════
#  TYPES (matching TypeScript interfaces)
# ══════════════════════════════════════

def create_stage_layer(
    layer_id: str,
    layer_type: str,  # 'background' | 'foreground' | 'prop'
    label: str,
    asset_path: str,
    pos_x: float = 960,
    pos_y: float = 540,
    z_index: int = 0,
    scale: float = 1.0,
    opacity: float = 1.0,
    rotation: float = 0,
    blur: float = 0,
    visible: bool = True,
) -> dict:
    """Create a StageLayer object matching the TypeScript interface."""
    return {
        "id": layer_id,
        "type": layer_type,
        "label": label,
        "assetPath": asset_path,
        "posX": pos_x,
        "posY": pos_y,
        "zIndex": z_index,
        "scale": scale,
        "opacity": opacity,
        "rotation": rotation,
        "blur": blur,
        "visible": visible,
    }


def create_stage_node_data(label: str, layers: list) -> dict:
    """Create a StageNodeData object matching the TypeScript interface."""
    return {
        "label": label,
        "layers": layers,
    }


# ══════════════════════════════════════
#  IMPORT LOGIC
# ══════════════════════════════════════

def import_scene(scene_dir: Path, dest_dir: Path) -> dict | None:
    """
    Import one exported scene directory into the project.
    
    Args:
        scene_dir: Path to the exported scene (contains _metadata.json + PNGs)
        dest_dir: Destination directory in backend/storage/stages/
    
    Returns:
        StageNodeData dict or None if failed
    """
    metadata_file = scene_dir / "_metadata.json"
    if not metadata_file.exists():
        print(f"  ⚠ Không tìm thấy _metadata.json trong {scene_dir.name}")
        return None

    with open(metadata_file, "r", encoding="utf-8") as f:
        metadata = json.load(f)

    scene_name = metadata.get("sourceFLA", scene_dir.name).replace(".fla", "")
    canvas_w = metadata.get("canvasWidth", 1920)
    canvas_h = metadata.get("canvasHeight", 1080)
    layer_infos = metadata.get("layers", [])
    export_mode = metadata.get("exportMode", "unknown")

    print(f"\n  📁 {scene_name}")
    print(f"     Canvas: {canvas_w}×{canvas_h}  Mode: {export_mode}  Layers: {len(layer_infos)}")

    # Tạo thư mục đích
    safe_name = _sanitize(scene_name)
    scene_dest = dest_dir / safe_name
    scene_dest.mkdir(parents=True, exist_ok=True)

    # Copy PNG files và xây dựng StageLayer list
    stage_layers = []

    for i, layer_info in enumerate(layer_infos):
        file_name = layer_info.get("fileName", "")
        if not file_name:
            continue

        src_png = scene_dir / file_name
        if not src_png.exists():
            print(f"     ⚠ Missing PNG: {file_name}")
            continue

        # Copy PNG vào storage
        dest_png = scene_dest / file_name
        shutil.copy2(src_png, dest_png)

        # Asset path cho frontend (relative to static mount)
        asset_path = f"/static/stages/{safe_name}/{file_name}"

        # Xác định layer properties
        layer_name = layer_info.get("name", f"Layer {i + 1}")
        layer_type = layer_info.get("type", "prop")
        
        # Vị trí: nếu metadata có posX/posY (từ auto-split), dùng nó
        # Nếu không, mặc định center canvas
        pos_x = layer_info.get("posX", canvas_w // 2)
        pos_y = layer_info.get("posY", canvas_h // 2)
        
        # zIndex: background thấp, foreground cao
        if layer_type == "background":
            z_index = 0
        elif layer_type == "foreground":
            z_index = 100
        else:
            z_index = 10 + i

        layer_id = f"stage-layer-{safe_name}-{i}"

        stage_layer = create_stage_layer(
            layer_id=layer_id,
            layer_type=layer_type,
            label=layer_name,
            asset_path=asset_path,
            pos_x=pos_x,
            pos_y=pos_y,
            z_index=z_index,
            scale=1.0,
            opacity=1.0,
            visible=True,
        )
        stage_layers.append(stage_layer)
        print(f"     ✓ {layer_name} → {file_name} (type={layer_type}, z={z_index})")

    # Copy flatten image if exists
    flatten_name = metadata.get("flattenImage", "_flatten.png")
    flatten_src = scene_dir / flatten_name
    if flatten_src.exists():
        shutil.copy2(flatten_src, scene_dest / flatten_name)

    # Tạo StageNodeData
    stage_data = create_stage_node_data(
        label=scene_name,
        layers=stage_layers,
    )

    print(f"     → {len(stage_layers)} layers imported")
    return stage_data


def import_all(export_dir: Path, output_file: Path = None) -> list:
    """
    Import all exported scenes from a directory.
    
    Args:
        export_dir: Path to stage_export/ directory (or a single scene dir)
        output_file: Optional path for output JSON
    
    Returns:
        List of StageNodeData dicts
    """
    # Check if this IS a single scene (has _metadata.json)
    if (export_dir / "_metadata.json").exists():
        scenes = [export_dir]
    else:
        # It's a parent directory containing scene subdirectories
        scenes = sorted([
            d for d in export_dir.iterdir()
            if d.is_dir() and (d / "_metadata.json").exists()
        ])

    if not scenes:
        print(f"❌ Không tìm thấy scene nào trong {export_dir}")
        print("   Đảm bảo thư mục chứa _metadata.json (export từ batch_export_fla.jsfl)")
        return []

    print(f"🎬 Importing {len(scenes)} scene(s) from {export_dir}")
    print(f"   → Destination: {STAGES_DIR}")

    STAGES_DIR.mkdir(parents=True, exist_ok=True)

    results = []
    for scene_dir in scenes:
        data = import_scene(scene_dir, STAGES_DIR)
        if data:
            results.append(data)

    # Output file
    if not output_file:
        output_file = export_dir / "workflow_stages.json"

    output = {
        "version": "1.0",
        "exportedAt": datetime.now().isoformat(),
        "sourceDir": str(export_dir),
        "stages": results,
        "usage": (
            "Load this JSON in the workflow editor via: "
            "Workflow → Import Stages → select this file. "
            "Or use the API: POST /api/workflow/import-stages"
        ),
    }

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\n✅ Import hoàn tất!")
    print(f"   Scenes: {len(results)}")
    print(f"   JSON:   {output_file}")
    print(f"   Assets: {STAGES_DIR}")

    return results


# ══════════════════════════════════════
#  HELPERS
# ══════════════════════════════════════

def _sanitize(name: str) -> str:
    """Make filename safe."""
    import re
    safe = re.sub(r'[<>:"/\\|?*]', '_', name)
    safe = re.sub(r'\s+', '_', safe)
    return safe.strip('_') or "unnamed"


# ══════════════════════════════════════
#  CLI
# ══════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description="Import FLA exported PNGs into Stage workflow",
        epilog="Run batch_export_fla.jsfl in Adobe Animate first!"
    )
    parser.add_argument(
        "export_dir",
        help="Path to stage_export/ directory or single scene directory"
    )
    parser.add_argument(
        "--output", "-o",
        help="Output JSON file path (default: <export_dir>/workflow_stages.json)"
    )

    args = parser.parse_args()

    export_dir = Path(args.export_dir)
    if not export_dir.exists():
        print(f"❌ Directory not found: {export_dir}")
        sys.exit(1)

    output_file = Path(args.output) if args.output else None
    results = import_all(export_dir, output_file)

    if not results:
        sys.exit(1)


if __name__ == "__main__":
    main()
