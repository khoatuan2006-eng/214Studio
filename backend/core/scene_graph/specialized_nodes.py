"""
Specialized Scene Nodes — Domain-specific object types.

Each subclass adds domain data on top of SceneNode base:
- CharacterNode: PSD-based character with pose/face layers
- BackgroundLayerNode: Single layer from FLA background file
- CameraNode: Virtual camera with zoom/FOV
- PropNode: Static/animated prop object
- TextNode: Text overlay (dialogue, narration)
- AudioNode: Audio track (BGM, SFX, voice)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional

from backend.core.scene_graph.node import SceneNode
from backend.core.scene_graph.transform import Transform, BoundingBox


# ══════════════════════════════════════════════
#  CHARACTER NODE — PSD-based with pose/face
# ══════════════════════════════════════════════

@dataclass
class FrameSelection:
    """A selection of active layers for a character at a moment in time.

    Used to create animation by swapping between poses and faces:
    - time=0.0: pose="站立", face="微笑"
    - time=2.0: pose="挥手", face="大笑"

    The STEP easing in keyframes handles the instant swap.
    """

    time: float = 0.0
    layers: dict[str, str] = field(default_factory=dict)  # group_name → asset_name

    def to_dict(self) -> dict:
        return {"time": self.time, "layers": self.layers}

    @classmethod
    def from_dict(cls, data: dict) -> FrameSelection:
        return cls(
            time=data.get("time", 0.0),
            layers=data.get("layers", {}),
        )


@dataclass
class CharacterNode(SceneNode):
    """A character from a PSD file.

    PSD = nhân vật, gồm:
    - Pose layers (動作): 站立, 走路, 挥手... → swap to animate body
    - Face layers (表情): 微笑, 大笑, 惊讶... → swap to animate expression
    - The animation is created by switching between layer combinations

    Attributes:
        character_id: Reference to the character in the asset database.
        active_layers: Current visible layers { group_name: asset_name }.
        available_layers: All available layers from PSD parsing.
        frame_sequence: Timeline of layer swaps for animation.
    """

    character_id: str = ""
    active_layers: dict[str, str] = field(default_factory=dict)
    available_layers: dict[str, list[str]] = field(default_factory=dict)
    frame_sequence: list[FrameSelection] = field(default_factory=list)

    def __post_init__(self):
        self.node_type = "character"
        super().__post_init__()

    def set_pose(self, pose_name: str) -> None:
        """Change the character's body pose."""
        self.active_layers["pose"] = pose_name

    def set_face(self, face_name: str) -> None:
        """Change the character's facial expression."""
        self.active_layers["face"] = face_name

    def set_layers(self, layers: dict[str, str]) -> None:
        """Set multiple layer groups at once."""
        self.active_layers.update(layers)

    def add_frame(self, time: float, layers: dict[str, str]) -> None:
        """Add a frame to the animation sequence.

        Args:
            time: Time in seconds for this frame
            layers: Layer selections for this moment
        """
        # Remove existing frame at same time
        self.frame_sequence = [
            f for f in self.frame_sequence if abs(f.time - time) > 0.001
        ]
        self.frame_sequence.append(FrameSelection(time=time, layers=layers))
        self.frame_sequence.sort(key=lambda f: f.time)

    def get_layers_at_time(self, time: float) -> dict[str, str]:
        """Get the active layer selection at a given time.

        Uses STEP interpolation — layers snap to the last frame before time T.
        """
        if not self.frame_sequence:
            return self.active_layers.copy()

        # Find the last frame at or before the given time
        active = self.active_layers.copy()
        for frame in self.frame_sequence:
            if frame.time <= time:
                active.update(frame.layers)
            else:
                break

        return active

    def describe(self) -> str:
        """AI-readable description including pose/face state."""
        base = super().describe()
        parts = [base]

        if self.active_layers:
            layer_str = ", ".join(f"{k}={v}" for k, v in self.active_layers.items())
            parts.append(f"  Current Layers: {layer_str}")

        if self.available_layers:
            for group, names in self.available_layers.items():
                parts.append(f"  Available {group}: {', '.join(names)}")

        if self.frame_sequence:
            parts.append(f"  Frame Sequence: {len(self.frame_sequence)} frames")

        return "\n".join(parts)

    def to_dict(self) -> dict:
        result = super().to_dict()
        result.update({
            "character_id": self.character_id,
            "active_layers": self.active_layers,
            "available_layers": self.available_layers,
            "frame_sequence": [f.to_dict() for f in self.frame_sequence],
        })
        return result

    @classmethod
    def from_dict(cls, data: dict) -> CharacterNode:
        node = cls(
            id=data.get("id", ""),
            name=data.get("name", ""),
            character_id=data.get("character_id", ""),
            transform=Transform.from_dict(data.get("transform", {})),
            opacity=data.get("opacity", 1.0),
            z_index=data.get("z_index", 0),
            visible=data.get("visible", True),
            parent_id=data.get("parent_id"),
            metadata=data.get("metadata", {}),
            active_layers=data.get("active_layers", {}),
            available_layers=data.get("available_layers", {}),
            frame_sequence=[
                FrameSelection.from_dict(f)
                for f in data.get("frame_sequence", [])
            ],
        )
        # Deserialize keyframes
        for prop, kf_list in data.get("keyframes", {}).items():
            from backend.core.scene_graph.keyframe import Keyframe
            node.keyframes[prop] = [Keyframe.from_dict(kf) for kf in kf_list]
        return node


# ══════════════════════════════════════════════
#  BACKGROUND LAYER NODE — From FLA file
# ══════════════════════════════════════════════

@dataclass
class BackgroundLayerNode(SceneNode):
    """A single layer from an FLA background file.

    FLA = bối cảnh, gồm nhiều layer:
    - Bầu trời (sky)
    - Núi xa (far mountains)
    - Cây (trees)
    - Đá (rocks)
    - Mặt đất (ground)

    Each layer has its own position, scale, and parallax speed
    for camera movement effects.

    Attributes:
        asset_path: Path to the layer image asset.
        parallax_speed: Speed multiplier for parallax effect (0=static, 1=normal).
        blur: Gaussian blur amount (depth-of-field effect).
    """

    asset_path: str = ""
    parallax_speed: float = 1.0
    blur: float = 0.0

    def __post_init__(self):
        self.node_type = "background_layer"
        super().__post_init__()

    def describe(self) -> str:
        base = super().describe()
        parts = [base]
        if self.asset_path:
            parts.append(f"  Asset: {self.asset_path}")
        if self.parallax_speed != 1.0:
            parts.append(f"  Parallax: {self.parallax_speed:.1f}x")
        if self.blur > 0:
            parts.append(f"  Blur: {self.blur:.1f}")
        return "\n".join(parts)

    def to_dict(self) -> dict:
        result = super().to_dict()
        result.update({
            "asset_path": self.asset_path,
            "parallax_speed": self.parallax_speed,
            "blur": self.blur,
        })
        return result

    @classmethod
    def from_dict(cls, data: dict) -> BackgroundLayerNode:
        node = cls(
            id=data.get("id", ""),
            name=data.get("name", ""),
            asset_path=data.get("asset_path", ""),
            parallax_speed=data.get("parallax_speed", 1.0),
            blur=data.get("blur", 0.0),
            transform=Transform.from_dict(data.get("transform", {})),
            opacity=data.get("opacity", 1.0),
            z_index=data.get("z_index", 0),
            visible=data.get("visible", True),
            parent_id=data.get("parent_id"),
            metadata=data.get("metadata", {}),
        )
        for prop, kf_list in data.get("keyframes", {}).items():
            from backend.core.scene_graph.keyframe import Keyframe
            node.keyframes[prop] = [Keyframe.from_dict(kf) for kf in kf_list]
        return node


# ══════════════════════════════════════════════
#  CAMERA NODE
# ══════════════════════════════════════════════

@dataclass
class CameraNode(SceneNode):
    """Virtual camera — controls what the viewer sees.

    The camera has position (x, y), zoom, and can optionally follow
    a character (target_node_id).

    Attributes:
        zoom: Camera zoom level (1.0 = default, 2.0 = 2x zoom in).
        fov: Field of view in world units.
        target_node_id: If set, camera follows this node.
    """

    zoom: float = 1.0
    fov: float = 19.2  # Full width in world units at default zoom
    target_node_id: Optional[str] = None

    def __post_init__(self):
        self.node_type = "camera"
        super().__post_init__()

    def describe(self) -> str:
        base = super().describe()
        parts = [base]
        parts.append(f"  Zoom: {self.zoom:.2f}x")
        parts.append(f"  FOV: {self.fov:.1f}")
        if self.target_node_id:
            parts.append(f"  Following: {self.target_node_id}")
        return "\n".join(parts)

    def to_dict(self) -> dict:
        result = super().to_dict()
        result.update({
            "zoom": self.zoom,
            "fov": self.fov,
            "target_node_id": self.target_node_id,
        })
        return result

    @classmethod
    def from_dict(cls, data: dict) -> CameraNode:
        node = cls(
            id=data.get("id", ""),
            name=data.get("name", ""),
            zoom=data.get("zoom", 1.0),
            fov=data.get("fov", 19.2),
            target_node_id=data.get("target_node_id"),
            transform=Transform.from_dict(data.get("transform", {})),
            opacity=data.get("opacity", 1.0),
            z_index=data.get("z_index", 0),
            visible=data.get("visible", True),
            parent_id=data.get("parent_id"),
            metadata=data.get("metadata", {}),
        )
        for prop, kf_list in data.get("keyframes", {}).items():
            from backend.core.scene_graph.keyframe import Keyframe
            node.keyframes[prop] = [Keyframe.from_dict(kf) for kf in kf_list]
        return node


# ══════════════════════════════════════════════
#  PROP NODE
# ══════════════════════════════════════════════

@dataclass
class PropNode(SceneNode):
    """A prop object in the scene (table, sword, door, etc.).

    Attributes:
        asset_path: Path to the prop image asset.
        interactive: Whether this prop can be interacted with.
    """

    asset_path: str = ""
    interactive: bool = False

    def __post_init__(self):
        self.node_type = "prop"
        super().__post_init__()

    def to_dict(self) -> dict:
        result = super().to_dict()
        result.update({
            "asset_path": self.asset_path,
            "interactive": self.interactive,
        })
        return result

    @classmethod
    def from_dict(cls, data: dict) -> PropNode:
        node = cls(
            id=data.get("id", ""),
            name=data.get("name", ""),
            asset_path=data.get("asset_path", ""),
            interactive=data.get("interactive", False),
            transform=Transform.from_dict(data.get("transform", {})),
            opacity=data.get("opacity", 1.0),
            z_index=data.get("z_index", 0),
            visible=data.get("visible", True),
            parent_id=data.get("parent_id"),
            metadata=data.get("metadata", {}),
        )
        for prop, kf_list in data.get("keyframes", {}).items():
            from backend.core.scene_graph.keyframe import Keyframe
            node.keyframes[prop] = [Keyframe.from_dict(kf) for kf in kf_list]
        return node


# ══════════════════════════════════════════════
#  TEXT NODE
# ══════════════════════════════════════════════

@dataclass
class TextNode(SceneNode):
    """Text overlay — dialogue, narration, subtitles, and speech bubbles.

    Attributes:
        content: The text content.
        font_family: Font name.
        font_size: Font size in world units.
        color: Text color (hex string).
        text_align: Alignment ("left", "center", "right").
        bubble_style: Speech bubble style for comic/manga rendering.
            "none" = plain subtitle overlay (default, backward compat)
            "speech" = rounded speech bubble with tail
            "shout" = spiky/jagged bubble for yelling
            "thought" = cloud-shaped thought bubble
            "whisper" = dashed-outline quiet bubble
        bubble_target_id: ID of the CharacterNode this bubble is attached to.
            When set, the bubble follows the character's position.
        speaker_name: Name of the speaking character (displayed above text in bubble).
    """

    content: str = ""
    font_family: str = "Arial"
    font_size: float = 0.5
    color: str = "#FFFFFF"
    text_align: str = "center"
    bubble_style: str = "none"       # "none" | "speech" | "shout" | "thought" | "whisper"
    bubble_target_id: str = ""       # CharacterNode ID to attach to
    speaker_name: str = ""           # Character name for bubble header

    def __post_init__(self):
        self.node_type = "text"
        super().__post_init__()

    def describe(self) -> str:
        base = super().describe()
        preview = self.content[:50]
        if len(self.content) > 50:
            preview += "..."
        parts = [base, f'  Content: "{preview}"']
        if self.bubble_style != "none":
            parts.append(f"  Bubble: {self.bubble_style} → {self.bubble_target_id}")
        if self.speaker_name:
            parts.append(f"  Speaker: {self.speaker_name}")
        return "\n".join(parts)

    def to_dict(self) -> dict:
        result = super().to_dict()
        result.update({
            "content": self.content,
            "font_family": self.font_family,
            "font_size": self.font_size,
            "color": self.color,
            "text_align": self.text_align,
            "bubble_style": self.bubble_style,
            "bubble_target_id": self.bubble_target_id,
            "speaker_name": self.speaker_name,
        })
        return result

    @classmethod
    def from_dict(cls, data: dict) -> TextNode:
        node = cls(
            id=data.get("id", ""),
            name=data.get("name", ""),
            content=data.get("content", ""),
            font_family=data.get("font_family", "Arial"),
            font_size=data.get("font_size", 0.5),
            color=data.get("color", "#FFFFFF"),
            text_align=data.get("text_align", "center"),
            bubble_style=data.get("bubble_style", "none"),
            bubble_target_id=data.get("bubble_target_id", ""),
            speaker_name=data.get("speaker_name", ""),
            transform=Transform.from_dict(data.get("transform", {})),
            opacity=data.get("opacity", 1.0),
            z_index=data.get("z_index", 0),
            visible=data.get("visible", True),
            parent_id=data.get("parent_id"),
            metadata=data.get("metadata", {}),
        )
        for prop, kf_list in data.get("keyframes", {}).items():
            from backend.core.scene_graph.keyframe import Keyframe
            node.keyframes[prop] = [Keyframe.from_dict(kf) for kf in kf_list]
        return node


# ══════════════════════════════════════════════
#  AUDIO NODE
# ══════════════════════════════════════════════

@dataclass
class AudioNode(SceneNode):
    """Audio track — BGM, SFX, voice lines.

    Attributes:
        asset_path: Path to the audio file.
        volume: Volume level (0.0 - 1.0).
        loop: Whether to loop playback.
        start_time: When this audio starts playing (seconds).
        duration: How long the audio plays (seconds, 0 = full length).
        audio_type: Type of audio ("bgm", "sfx", "voice").
    """

    asset_path: str = ""
    volume: float = 1.0
    loop: bool = False
    start_time: float = 0.0
    duration: float = 0.0
    audio_type: str = "sfx"  # "bgm", "sfx", "voice"

    def __post_init__(self):
        self.node_type = "audio"
        super().__post_init__()

    def describe(self) -> str:
        base = super().describe()
        parts = [base]
        parts.append(f"  Type: {self.audio_type}")
        parts.append(f"  Volume: {self.volume:.0%}")
        if self.loop:
            parts.append("  Loop: ON")
        if self.start_time > 0:
            parts.append(f"  Starts at: {self.start_time:.1f}s")
        return "\n".join(parts)

    def to_dict(self) -> dict:
        result = super().to_dict()
        result.update({
            "asset_path": self.asset_path,
            "volume": self.volume,
            "loop": self.loop,
            "start_time": self.start_time,
            "duration": self.duration,
            "audio_type": self.audio_type,
        })
        return result

    @classmethod
    def from_dict(cls, data: dict) -> AudioNode:
        node = cls(
            id=data.get("id", ""),
            name=data.get("name", ""),
            asset_path=data.get("asset_path", ""),
            volume=data.get("volume", 1.0),
            loop=data.get("loop", False),
            start_time=data.get("start_time", 0.0),
            duration=data.get("duration", 0.0),
            audio_type=data.get("audio_type", "sfx"),
            transform=Transform.from_dict(data.get("transform", {})),
            opacity=data.get("opacity", 1.0),
            z_index=data.get("z_index", 0),
            visible=data.get("visible", True),
            parent_id=data.get("parent_id"),
            metadata=data.get("metadata", {}),
        )
        for prop, kf_list in data.get("keyframes", {}).items():
            from backend.core.scene_graph.keyframe import Keyframe
            node.keyframes[prop] = [Keyframe.from_dict(kf) for kf in kf_list]
        return node


# ══════════════════════════════════════════════
#  NODE FACTORY — Deserialize by node_type
# ══════════════════════════════════════════════

NODE_TYPE_MAP = {
    "generic": SceneNode,
    "character": CharacterNode,
    "background_layer": BackgroundLayerNode,
    "camera": CameraNode,
    "prop": PropNode,
    "text": TextNode,
    "audio": AudioNode,
}


def node_from_dict(data: dict) -> SceneNode:
    """Deserialize a node from dict, dispatching to the correct subclass."""
    node_type = data.get("node_type", "generic")
    cls = NODE_TYPE_MAP.get(node_type, SceneNode)
    return cls.from_dict(data)
