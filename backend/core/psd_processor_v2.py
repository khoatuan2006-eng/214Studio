"""
PSD Processor V2 — Jointed-limb aware processing.

Uses psd_smart_parser to auto-detect PSD structure and extract
body parts, expressions, viewpoints. Stores results in a separate
v2 database (database_v2.json) to avoid conflicts with v1.

v1 (psd_processor.py) remains untouched and fully functional.
"""

import os
import json
import uuid
import logging
from datetime import datetime, timezone

from psd_tools import PSDImage

from backend.core.psd_smart_parser import (
    detect_psd_type,
    parse_jointed_psd,
    jointed_char_to_dict,
)

logger = logging.getLogger(__name__)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_V2_PATH = os.path.join(BASE_DIR, "data", "database_v2.json")
STORAGE_DIR = os.path.join(BASE_DIR, "storage")

os.makedirs(os.path.join(BASE_DIR, "data"), exist_ok=True)


# ── V2 Database helpers ──────────────────────────────────────

def load_db_v2() -> list:
    """Load the v2 character database."""
    if not os.path.exists(DB_V2_PATH):
        return []
    try:
        with open(DB_V2_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []


def save_db_v2(data: list):
    """Save the v2 character database."""
    with open(DB_V2_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


# ── Name extraction ──────────────────────────────────────────

def _extract_char_name(file_path: str) -> str:
    """Extract a human-readable character name from a PSD filename."""
    import re
    basename = os.path.splitext(os.path.basename(file_path))[0]

    # Try to match Chinese character names in the filename
    chinese_match = re.findall(r'[\u4e00-\u9fff]+', basename)
    if chinese_match:
        # Join all Chinese segments (e.g. "中世纪学者男" from "d__CTF_characters_中世纪学者男_source")
        return "".join(chinese_match)

    # Fall back to the full basename (strip common prefixes/suffixes)
    cleaned = re.sub(r'^[a-f0-9]{32}$', '', basename)  # skip pure hashes
    return cleaned or basename


def _sanitize_name(name: str) -> str:
    """Sanitize a name for use as a filesystem directory."""
    invalid = '<>:"/\\|?*'
    for c in invalid:
        name = name.replace(c, '_')
    return name.strip()


# ── Main V2 processing ──────────────────────────────────────

def process_psd_v2(file_path: str) -> dict:
    """
    Process a PSD file using the V2 pipeline.

    Smart-detects whether the PSD is jointed or flat:
    - Jointed: uses psd_smart_parser for body-part/expression/viewpoint extraction
    - Flat: still processes it but wraps in v2 data model with psd_type="flat"

    Results are stored in database_v2.json (separate from v1).

    Returns the character dict that was stored.
    """
    char_name = _extract_char_name(file_path)
    safe_name = _sanitize_name(char_name)

    logger.info(f"[V2] Opening PSD: {file_path}")

    try:
        psd = PSDImage.open(file_path)
    except Exception as e:
        logger.error(f"[V2] Failed to open PSD {file_path}: {e}")
        raise ValueError(f"Corrupted or invalid PSD file: {e}")

    psd_type = detect_psd_type(psd)
    logger.info(f"[V2] Detected type: {psd_type} for '{char_name}'")

    if psd_type == "jointed":
        char_entry = _process_jointed(psd, char_name, safe_name)
    else:
        char_entry = _process_flat_v2(psd, char_name, safe_name)

    # ── Persist to v2 database ──
    db = load_db_v2()
    existing = next((c for c in db if c["name"] == char_name), None)

    if existing:
        # Merge: replace with new data but keep the same ID
        char_entry["id"] = existing["id"]
        idx = db.index(existing)
        db[idx] = char_entry
        logger.info(f"[V2] Updated existing character: {char_name}")
    else:
        db.append(char_entry)
        logger.info(f"[V2] Created new character: {char_name}")

    save_db_v2(db)
    return char_entry


def _process_jointed(psd: PSDImage, char_name: str, safe_name: str) -> dict:
    """Process a jointed-limb PSD."""
    jointed_char = parse_jointed_psd(psd, safe_name, STORAGE_DIR)
    jointed_dict = jointed_char_to_dict(jointed_char)

    return {
        "id": jointed_dict["id"],
        "name": char_name,
        "psd_type": "jointed",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "canvas_size": jointed_dict["canvas_size"],
        # V2 structured data
        "body_parts": jointed_dict["body_parts"],
        "head": jointed_dict["head"],
        "viewpoints": jointed_dict["viewpoints"],
        # Backward compat for v1 consumers
        "group_order": jointed_dict["group_order"],
        "layer_groups": jointed_dict["layer_groups"],
    }


def _process_flat_v2(psd: PSDImage, char_name: str, safe_name: str) -> dict:
    """
    Process a flat PSD through v2 pipeline.
    Still extracts layers the same way as v1 but wraps in v2 format.
    """
    from backend.core.psd_processor import export_layer_recursive, sanitize_filename

    EXTRACTED_DIR = os.path.join(STORAGE_DIR, "extracted_psds")
    os.makedirs(EXTRACTED_DIR, exist_ok=True)

    char_fs_path = os.path.join(EXTRACTED_DIR, sanitize_filename(char_name))
    os.makedirs(char_fs_path, exist_ok=True)

    layer_groups = {}
    group_order = []

    for layer in psd:
        export_layer_recursive(
            layer, [], char_fs_path, sanitize_filename(char_name),
            layer_groups, group_order, psd.width, psd.height
        )

    return {
        "id": str(uuid.uuid4()),
        "name": char_name,
        "psd_type": "flat",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "canvas_size": [psd.width, psd.height],
        "body_parts": None,
        "head": None,
        "viewpoints": None,
        "group_order": group_order,
        "layer_groups": layer_groups,
    }
