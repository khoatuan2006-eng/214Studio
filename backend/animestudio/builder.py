"""
AnimeStudio Python Scripting SDK — Builder Module

Provides Python classes that mirror the frontend Zustand store schema,
allowing programmatic creation of Projects, Tracks, Keyframes, and
ActionBlocks without using the Web UI.

Usage:
    from backend.animestudio import Project, CharacterTrack, Keyframe, save_to_db

    project = Project(name="My Animation")
    track = project.add_track("hero", character_id="char_001")
    track.add_keyframe("x", time=0.0, value=100, easing="easeIn")
    track.add_keyframe("x", time=3.0, value=800, easing="easeOut")
    track.add_action(asset_hash="abc123", start=0.0, end=5.0, z_index=1)

    save_to_db(project)
"""

from __future__ import annotations
import uuid
from dataclasses import dataclass, field
from typing import Literal, Any


# ── Types ──────────────────────────────────────────────────────
EasingType = Literal["linear", "easeIn", "easeOut", "easeInOut", "step"]
BlendMode = Literal["source-over", "multiply", "screen", "overlay", "darken", "lighten"]
PropertyName = Literal["x", "y", "scale", "rotation", "opacity", "anchorX", "anchorY"]


# ── Keyframe ───────────────────────────────────────────────────
@dataclass
class Keyframe:
    """A single keyframe on a property timeline."""
    time: float
    value: float
    easing: EasingType = "linear"

    def to_dict(self) -> dict:
        d: dict[str, Any] = {"time": self.time, "value": self.value}
        if self.easing != "linear":
            d["easing"] = self.easing
        return d


# ── ActionBlock ────────────────────────────────────────────────
@dataclass
class ActionBlock:
    """A media clip on the timeline (references an asset by hash)."""
    asset_hash: str
    start: float
    end: float
    z_index: int = 0
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    hidden: bool = False
    locked: bool = False

    def to_dict(self) -> dict:
        d: dict[str, Any] = {
            "id": self.id,
            "assetHash": self.asset_hash,
            "start": self.start,
            "end": self.end,
            "zIndex": self.z_index,
        }
        if self.hidden:
            d["hidden"] = True
        if self.locked:
            d["locked"] = True
        return d


# ── CharacterTrack ─────────────────────────────────────────────
@dataclass
class CharacterTrack:
    """
    A character layer in the timeline.
    Contains keyframed transform properties and action blocks.
    """
    name: str
    character_id: str | None = None
    blend_mode: BlendMode = "source-over"
    id: str = field(default_factory=lambda: str(uuid.uuid4()))

    # Per-property keyframe arrays
    _keyframes: dict[str, list[Keyframe]] = field(default_factory=lambda: {
        "x": [], "y": [], "scale": [], "rotation": [],
        "opacity": [], "anchorX": [], "anchorY": [],
    })
    _actions: list[ActionBlock] = field(default_factory=list)

    # ── Builder Methods ────────────────────────────────────────
    def add_keyframe(
        self,
        prop: PropertyName,
        time: float,
        value: float,
        easing: EasingType = "linear",
    ) -> CharacterTrack:
        """Add a keyframe to a transform property. Returns self for chaining."""
        kf = Keyframe(time=time, value=value, easing=easing)
        self._keyframes[prop].append(kf)
        # Keep sorted by time
        self._keyframes[prop].sort(key=lambda k: k.time)
        return self

    def add_action(
        self,
        asset_hash: str,
        start: float,
        end: float,
        z_index: int = 0,
    ) -> CharacterTrack:
        """Add an action block (media clip) to this track. Returns self for chaining."""
        action = ActionBlock(asset_hash=asset_hash, start=start, end=end, z_index=z_index)
        self._actions.append(action)
        return self

    def to_dict(self) -> dict:
        """Serialize to the JSON format expected by the frontend."""
        transform: dict[str, list[dict]] = {}
        for prop, keyframes in self._keyframes.items():
            transform[prop] = [kf.to_dict() for kf in keyframes]

        d: dict[str, Any] = {
            "id": self.id,
            "name": self.name,
            "transform": transform,
            "actions": [a.to_dict() for a in self._actions],
        }
        if self.character_id:
            d["characterId"] = self.character_id
        if self.blend_mode != "source-over":
            d["blendMode"] = self.blend_mode
        return d


# ── Project ────────────────────────────────────────────────────
@dataclass
class Project:
    """
    Top-level container representing an animation project.
    Mirrors the SQLAlchemy Project model.
    """
    name: str = "Untitled Project"
    description: str = ""
    canvas_width: int = 1920
    canvas_height: int = 1080
    fps: int = 24
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    _tracks: list[CharacterTrack] = field(default_factory=list)

    def add_track(
        self,
        name: str,
        character_id: str | None = None,
        blend_mode: BlendMode = "source-over",
    ) -> CharacterTrack:
        """Create and add a character track. Returns the track for chaining."""
        track = CharacterTrack(name=name, character_id=character_id, blend_mode=blend_mode)
        self._tracks.append(track)
        return track

    @property
    def tracks(self) -> list[CharacterTrack]:
        return self._tracks

    def to_editor_data(self) -> list[dict]:
        """Serialize tracks to the editorData JSON array expected by the frontend."""
        return [t.to_dict() for t in self._tracks]

    def to_project_dict(self) -> dict:
        """Full project dict matching the SQLAlchemy Project model."""
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "canvas_width": self.canvas_width,
            "canvas_height": self.canvas_height,
            "fps": self.fps,
            "data": {"editorData": self.to_editor_data()},
        }


# ── Database Integration ───────────────────────────────────────
def save_to_db(project: Project, db_session=None) -> str:
    """
    Save a Project to the SQLite database.
    If no db_session is provided, creates one from the default SessionLocal.

    Returns the project ID.
    """
    from backend.core.database import SessionLocal
    from backend.core.models import Project as ProjectModel

    own_session = db_session is None
    session = db_session or SessionLocal()

    try:
        # Check if project already exists
        existing = session.query(ProjectModel).filter_by(id=project.id).first()

        if existing:
            # Update existing project
            existing.name = project.name
            existing.description = project.description
            existing.canvas_width = project.canvas_width
            existing.canvas_height = project.canvas_height
            existing.fps = project.fps
            existing.data = {"editorData": project.to_editor_data()}
        else:
            # Create new project
            db_project = ProjectModel(
                id=project.id,
                name=project.name,
                description=project.description,
                canvas_width=project.canvas_width,
                canvas_height=project.canvas_height,
                fps=project.fps,
                data={"editorData": project.to_editor_data()},
            )
            session.add(db_project)

        session.commit()
        return project.id

    except Exception:
        session.rollback()
        raise
    finally:
        if own_session:
            session.close()
