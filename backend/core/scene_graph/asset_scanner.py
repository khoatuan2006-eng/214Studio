"""
Asset Scanner — Scans extracted PSD folders to build a character registry.

Scans `storage/extracted_psds/` and discovers:
- Characters (top-level folders)
- Pose groups (动作 = body poses)
- Face groups (表情 = facial expressions, 豆豆眼表情 = dot-eye faces)

The registry maps each character to their available poses and faces,
which the SceneGraph uses when AI calls set_character_pose().

Directory structure expected:
  storage/extracted_psds/
    └── <character_name>/
        ├── 动作/          ← pose images (body without face)
        │   ├── 站立_xxxx.png
        │   ├── 打招呼_xxxx.png
        │   └── ...
        ├── 表情/          ← face images (expression overlay)
        │   ├── 微笑_xxxx.png
        │   ├── 发怒_xxxx.png
        │   └── ...
        └── 豆豆眼表情/     ← alternative face style (optional)
            └── ...
"""

from __future__ import annotations

import os
import re
import logging
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger(__name__)

# Standard folder names in extracted PSDs
POSE_FOLDER_NAMES = {"动作", "pose", "poses", "body", "bodies"}
FACE_FOLDER_NAMES = {"表情", "face", "faces", "expression", "expressions", "豆豆眼表情"}

# File name pattern: <name>_<hash>.png → extract <name>
ASSET_NAME_PATTERN = re.compile(r"^(.+?)_[a-z0-9]{6}\.png$", re.IGNORECASE)


@dataclass
class CharacterAsset:
    """A single asset (pose or face) from a character's PSD."""

    name: str  # Human-readable name (e.g. "站立", "发怒")
    filename: str  # Full filename (e.g. "站立_4e39e4.png")
    relative_path: str  # Relative to storage dir (for URL building)
    group: str  # "pose", "face", or "face_dot_eye"
    full_path: str  # Absolute filesystem path

    @property
    def url_path(self) -> str:
        """URL path for serving via FastAPI static mount."""
        # /static/extracted_psds/CharName/动作/站立_xxxx.png
        return f"/static/{self.relative_path}".replace("\\", "/")


@dataclass
class CharacterInfo:
    """Complete information about a character and their available assets."""

    id: str  # Sanitized unique ID
    name: str  # Display name (folder name)
    folder_path: str  # Absolute path to character folder
    relative_folder: str  # Relative to storage dir
    poses: dict[str, CharacterAsset] = field(default_factory=dict)  # name → asset
    faces: dict[str, CharacterAsset] = field(default_factory=dict)  # name → asset
    faces_dot_eye: dict[str, CharacterAsset] = field(default_factory=dict)  # name → asset

    @property
    def pose_names(self) -> list[str]:
        return sorted(self.poses.keys())

    @property
    def face_names(self) -> list[str]:
        return sorted(self.faces.keys())

    @property
    def total_assets(self) -> int:
        return len(self.poses) + len(self.faces) + len(self.faces_dot_eye)

    @property
    def default_pose(self) -> Optional[str]:
        """Get default pose name (prefer 站立/standing)."""
        for pref in ["站立", "standing", "idle"]:
            if pref in self.poses:
                return pref
        return self.pose_names[0] if self.pose_names else None

    @property
    def default_face(self) -> Optional[str]:
        """Get default face name (prefer 微笑/smile)."""
        for pref in ["微笑", "smile", "正常", "normal", "开心"]:
            if pref in self.faces:
                return pref
        return self.face_names[0] if self.face_names else None

    def get_pose_url(self, pose_name: str) -> Optional[str]:
        asset = self.poses.get(pose_name)
        return asset.url_path if asset else None

    def get_face_url(self, face_name: str, dot_eye: bool = False) -> Optional[str]:
        source = self.faces_dot_eye if dot_eye else self.faces
        asset = source.get(face_name)
        return asset.url_path if asset else None

    def to_dict(self) -> dict:
        """Serialize for API response / Scene Graph metadata."""
        return {
            "id": self.id,
            "name": self.name,
            "folder": self.relative_folder,
            "poses": {
                name: {"filename": a.filename, "url": a.url_path}
                for name, a in self.poses.items()
            },
            "faces": {
                name: {"filename": a.filename, "url": a.url_path}
                for name, a in self.faces.items()
            },
            "faces_dot_eye": {
                name: {"filename": a.filename, "url": a.url_path}
                for name, a in self.faces_dot_eye.items()
            },
            "total_assets": self.total_assets,
            "default_pose": self.default_pose,
            "default_face": self.default_face,
        }

    def describe(self) -> str:
        """AI-readable description."""
        lines = [
            f"Character: {self.name} (id: {self.id})",
            f"  Poses ({len(self.poses)}): {', '.join(self.pose_names[:10])}{'...' if len(self.poses) > 10 else ''}",
            f"  Faces ({len(self.faces)}): {', '.join(self.face_names[:10])}{'...' if len(self.faces) > 10 else ''}",
        ]
        if self.faces_dot_eye:
            names = sorted(self.faces_dot_eye.keys())
            lines.append(f"  Dot-eye ({len(self.faces_dot_eye)}): {', '.join(names[:10])}")
        return "\n".join(lines)


def _extract_asset_name(filename: str) -> str:
    """Extract human-readable name from filename.

    '站立_4e39e4.png' → '站立'
    'angry_face.png' → 'angry_face'
    """
    match = ASSET_NAME_PATTERN.match(filename)
    if match:
        return match.group(1)
    # Fallback: strip extension
    name = os.path.splitext(filename)[0]
    return name


def _classify_folder(folder_name: str) -> Optional[str]:
    """Classify a subfolder as 'pose', 'face', or 'face_dot_eye'."""
    lower = folder_name.lower()
    if folder_name in POSE_FOLDER_NAMES or lower in POSE_FOLDER_NAMES:
        return "pose"
    if folder_name == "豆豆眼表情":
        return "face_dot_eye"
    if folder_name in FACE_FOLDER_NAMES or lower in FACE_FOLDER_NAMES:
        return "face"
    return None


def _sanitize_id(name: str) -> str:
    """Create a URL-safe ID from a character name."""
    # Replace spaces and special chars
    safe = re.sub(r'[^\w\-]', '_', name)
    safe = re.sub(r'_+', '_', safe).strip('_')
    return safe.lower() if safe else "char"


def scan_character_folder(
    char_folder: str,
    storage_dir: str,
) -> Optional[CharacterInfo]:
    """Scan a single character folder and discover poses/faces.

    Args:
        char_folder: Absolute path to character folder
        storage_dir: Absolute path to storage root (for relative paths)

    Returns:
        CharacterInfo if valid assets found, None otherwise.
    """
    name = os.path.basename(char_folder)
    rel_folder = os.path.relpath(char_folder, storage_dir)

    char = CharacterInfo(
        id=_sanitize_id(name),
        name=name,
        folder_path=char_folder,
        relative_folder=rel_folder,
    )

    # Scan subfolders
    try:
        subfolders = [
            d for d in os.listdir(char_folder)
            if os.path.isdir(os.path.join(char_folder, d))
        ]
    except OSError:
        return None

    for subfolder in subfolders:
        group = _classify_folder(subfolder)
        if group is None:
            continue

        subfolder_path = os.path.join(char_folder, subfolder)

        try:
            files = [
                f for f in os.listdir(subfolder_path)
                if f.lower().endswith(('.png', '.jpg', '.webp'))
                and os.path.isfile(os.path.join(subfolder_path, f))
            ]
        except OSError:
            continue

        for filename in sorted(files):
            asset_name = _extract_asset_name(filename)
            rel_path = os.path.relpath(
                os.path.join(subfolder_path, filename), storage_dir
            )

            asset = CharacterAsset(
                name=asset_name,
                filename=filename,
                relative_path=rel_path,
                group=group,
                full_path=os.path.join(subfolder_path, filename),
            )

            if group == "pose":
                char.poses[asset_name] = asset
            elif group == "face":
                char.faces[asset_name] = asset
            elif group == "face_dot_eye":
                char.faces_dot_eye[asset_name] = asset

    # Only return if character has at least poses or faces
    if char.total_assets > 0:
        return char
    return None


class AssetRegistry:
    """Registry of all available characters and their assets.

    Scans the extracted_psds directory and maintains an in-memory index
    that can be queried by the AI agents and the frontend.

    Usage:
        registry = AssetRegistry("backend/storage")
        registry.scan()
        print(registry.list_characters())
        char = registry.get_character("q版花店姐姐长裙_1761648249312")
    """

    def __init__(self, storage_dir: str):
        self.storage_dir = os.path.abspath(storage_dir)
        self.extracted_dir = os.path.join(self.storage_dir, "extracted_psds")
        self.characters: dict[str, CharacterInfo] = {}

    def scan(self) -> int:
        """Scan the extracted_psds directory for characters.

        Returns:
            Number of characters discovered.
        """
        self.characters.clear()

        if not os.path.isdir(self.extracted_dir):
            logger.warning(f"Extracted PSDs directory not found: {self.extracted_dir}")
            return 0

        for folder_name in sorted(os.listdir(self.extracted_dir)):
            folder_path = os.path.join(self.extracted_dir, folder_name)
            if not os.path.isdir(folder_path):
                continue

            char = scan_character_folder(folder_path, self.storage_dir)
            if char:
                self.characters[char.id] = char
                logger.info(
                    f"Found character: {char.name} "
                    f"({len(char.poses)} poses, {len(char.faces)} faces)"
                )

        logger.info(f"Asset scan complete: {len(self.characters)} characters found")
        return len(self.characters)

    def list_characters(self) -> list[dict]:
        """List all characters with summary info."""
        return [
            {
                "id": c.id,
                "name": c.name,
                "poses": len(c.poses),
                "faces": len(c.faces),
                "total": c.total_assets,
                "default_pose": c.default_pose,
                "default_face": c.default_face,
            }
            for c in self.characters.values()
        ]

    def get_character(self, char_id: str) -> Optional[CharacterInfo]:
        """Get character info by ID."""
        return self.characters.get(char_id)

    def find_character(self, query: str) -> Optional[CharacterInfo]:
        """Find character by partial name match."""
        query_lower = query.lower()
        for char in self.characters.values():
            if query_lower in char.name.lower() or query_lower in char.id:
                return char
        return None

    def describe_all(self) -> str:
        """AI-readable description of all available characters."""
        if not self.characters:
            return "No characters available. Please upload PSD files first."

        lines = [f"Available Characters ({len(self.characters)}):", ""]
        for char in self.characters.values():
            lines.append(char.describe())
            lines.append("")
        return "\n".join(lines)

    def to_dict(self) -> dict:
        """Full registry as dict for API/JSON."""
        return {
            char_id: char.to_dict()
            for char_id, char in self.characters.items()
        }
