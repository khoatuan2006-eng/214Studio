"""
SceneNode — Base class for all scene objects.

Inspired by:
- Motion Canvas Node.ts (1950 lines): position, rotation, scale, opacity,
  zIndex, children, parent, localToWorld matrix, absolutePosition
- Manim Mobject: submobjects, bounding_box, describe(), updaters
- OpenCut TimelineElement: id, name, duration, transform, keyframes

Every object in the scene (character, background layer, prop, camera, etc.)
inherits from SceneNode. The AI interacts with nodes via tool functions
(set_position, set_scale, etc.) and reads them via describe().
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Any, Optional

from backend.core.scene_graph.transform import Transform, BoundingBox
from backend.core.scene_graph.keyframe import (
    Keyframe,
    interpolate_keyframes,
    ANIMATABLE_PROPERTIES,
)


@dataclass
class SceneNode:
    """Base class for all objects in the scene graph.

    Like Motion Canvas's Node, every SceneNode has:
    - A unique ID (AI-addressable)
    - Transform (x, y, scale, rotation)
    - Opacity, z_index, visible
    - Parent-child relationships
    - Keyframe tracks for animation
    - Metadata for type-specific data
    """

    id: str = ""
    name: str = ""
    node_type: str = "generic"  # "character", "background_layer", "prop", etc.

    # ── Transform (like Motion Canvas position/scale/rotation) ──
    transform: Transform = field(default_factory=Transform)

    # ── Visual properties ──
    opacity: float = 1.0
    z_index: int = 0
    visible: bool = True

    # ── Hierarchy (like Motion Canvas children/parent) ──
    children: list[SceneNode] = field(default_factory=list)
    parent_id: Optional[str] = None

    # ── Animation (like Theatre.js Sheet, OpenCut PropertyTrack) ──
    # Maps property name → sorted list of keyframes
    # Property names: "x", "y", "scale_x", "scale_y", "rotation", "opacity"
    keyframes: dict[str, list[Keyframe]] = field(default_factory=dict)

    # ── Type-specific metadata ──
    metadata: dict[str, Any] = field(default_factory=dict)

    # ── Auto-computed (like Manim bounding_box) ──
    bounding_box: Optional[BoundingBox] = None

    def __post_init__(self):
        if not self.id:
            self.id = f"{self.node_type}-{uuid.uuid4().hex[:8]}"

    # ══════════════════════════════════════════════
    #  POSITION / TRANSFORM (AI mutation targets)
    # ══════════════════════════════════════════════

    def set_position(self, x: float, y: float) -> None:
        """Set object position in world units."""
        self.transform.x = x
        self.transform.y = y

    def set_scale(self, scale: float) -> None:
        """Set uniform scale."""
        self.transform.scale = scale

    def set_scale_xy(self, scale_x: float, scale_y: float) -> None:
        """Set non-uniform scale."""
        self.transform.scale_x = scale_x
        self.transform.scale_y = scale_y

    def set_rotation(self, degrees: float) -> None:
        """Set rotation in degrees."""
        self.transform.rotation = degrees

    def set_opacity(self, opacity: float) -> None:
        """Set opacity (clamped 0.0 - 1.0)."""
        self.opacity = max(0.0, min(1.0, opacity))

    def set_z_index(self, z_index: int) -> None:
        """Set layer order."""
        self.z_index = z_index

    # ══════════════════════════════════════════════
    #  KEYFRAME ANIMATION
    # ══════════════════════════════════════════════

    def add_keyframe(
        self,
        property_name: str,
        time: float,
        value: float,
        easing: str = "linear",
    ) -> None:
        """Add or update a keyframe on a property.

        Args:
            property_name: One of ANIMATABLE_PROPERTIES (x, y, scale_x, etc.)
            time: Time in seconds
            value: Property value at this time
            easing: Easing function name
        """
        if property_name not in self.keyframes:
            self.keyframes[property_name] = []

        track = self.keyframes[property_name]

        # Replace existing keyframe at same time
        track = [kf for kf in track if abs(kf.time - time) > 0.001]
        track.append(Keyframe(time=time, value=value, easing=easing))
        track.sort(key=lambda kf: kf.time)

        self.keyframes[property_name] = track

    def remove_keyframe(self, property_name: str, time: float) -> None:
        """Remove a keyframe at a specific time."""
        if property_name in self.keyframes:
            self.keyframes[property_name] = [
                kf for kf in self.keyframes[property_name]
                if abs(kf.time - time) > 0.001
            ]

    def get_value_at_time(self, property_name: str, time: float) -> float:
        """Get interpolated property value at a given time.

        If the property has keyframes, interpolate. Otherwise return
        the current static value.
        """
        if property_name in self.keyframes and self.keyframes[property_name]:
            return interpolate_keyframes(self.keyframes[property_name], time)

        # Fall back to static value
        return self._get_static_value(property_name)

    def _get_static_value(self, property_name: str) -> float:
        """Get the current static value of a property."""
        prop_map = {
            "x": lambda: self.transform.x,
            "y": lambda: self.transform.y,
            "scale_x": lambda: self.transform.scale_x,
            "scale_y": lambda: self.transform.scale_y,
            "rotation": lambda: self.transform.rotation,
            "opacity": lambda: self.opacity,
            "z_index": lambda: float(self.z_index),
        }
        getter = prop_map.get(property_name)
        return getter() if getter else 0.0

    def get_snapshot_at_time(self, time: float) -> dict:
        """Get all property values at a specific time."""
        return {
            "id": self.id,
            "name": self.name,
            "node_type": self.node_type,
            "x": self.get_value_at_time("x", time),
            "y": self.get_value_at_time("y", time),
            "scale_x": self.get_value_at_time("scale_x", time),
            "scale_y": self.get_value_at_time("scale_y", time),
            "rotation": self.get_value_at_time("rotation", time),
            "opacity": self.get_value_at_time("opacity", time),
            "z_index": int(round(self.get_value_at_time("z_index", time))),
            "visible": self.visible,
        }

    @property
    def has_animation(self) -> bool:
        """Check if this node has any keyframe animations."""
        return any(len(kfs) > 0 for kfs in self.keyframes.values())

    @property
    def total_keyframes(self) -> int:
        """Total number of keyframes across all properties."""
        return sum(len(kfs) for kfs in self.keyframes.values())

    # ══════════════════════════════════════════════
    #  HIERARCHY
    # ══════════════════════════════════════════════

    def add_child(self, child: SceneNode) -> None:
        """Add a child node."""
        child.parent_id = self.id
        if child not in self.children:
            self.children.append(child)

    def remove_child(self, child_id: str) -> Optional[SceneNode]:
        """Remove and return a child node by ID."""
        for i, child in enumerate(self.children):
            if child.id == child_id:
                child.parent_id = None
                return self.children.pop(i)
        return None

    def get_family(self) -> list[SceneNode]:
        """Get this node and all descendants (like Manim get_family)."""
        family = [self]
        for child in self.children:
            family.extend(child.get_family())
        return family

    # ══════════════════════════════════════════════
    #  AI DESCRIPTION (for LLM consumption)
    # ══════════════════════════════════════════════

    def describe(self) -> str:
        """Generate a human/AI-readable description of this node.

        This is what the AI "sees" when querying the scene.
        """
        parts = [f"[{self.node_type}] {self.name} (id: {self.id})"]
        parts.append(f"  Position: ({self.transform.x:.1f}, {self.transform.y:.1f})")
        parts.append(f"  Scale: {self.transform.scale:.2f}")

        if self.transform.rotation != 0:
            parts.append(f"  Rotation: {self.transform.rotation:.0f}°")

        if self.opacity < 1.0:
            parts.append(f"  Opacity: {self.opacity:.1f}")

        parts.append(f"  Z-Index: {self.z_index}")

        if self.has_animation:
            animated_props = [p for p, kfs in self.keyframes.items() if kfs]
            parts.append(f"  Animated: {', '.join(animated_props)} ({self.total_keyframes} keyframes)")

        if self.children:
            parts.append(f"  Children: {len(self.children)}")

        if not self.visible:
            parts.append("  ⚠ HIDDEN")

        return "\n".join(parts)

    # ══════════════════════════════════════════════
    #  SERIALIZATION
    # ══════════════════════════════════════════════

    def to_dict(self) -> dict:
        """Serialize to JSON-compatible dict."""
        result = {
            "id": self.id,
            "name": self.name,
            "node_type": self.node_type,
            "transform": self.transform.to_dict(),
            "opacity": self.opacity,
            "z_index": self.z_index,
            "visible": self.visible,
            "parent_id": self.parent_id,
            "keyframes": {
                prop: [kf.to_dict() for kf in kfs]
                for prop, kfs in self.keyframes.items()
            },
            "metadata": self.metadata,
            "children": [child.to_dict() for child in self.children],
        }
        if self.bounding_box:
            result["bounding_box"] = self.bounding_box.to_dict()
        return result

    @classmethod
    def from_dict(cls, data: dict) -> SceneNode:
        """Deserialize from dict. Subclasses should override for their fields."""
        node = cls(
            id=data.get("id", ""),
            name=data.get("name", ""),
            node_type=data.get("node_type", "generic"),
            transform=Transform.from_dict(data.get("transform", {})),
            opacity=data.get("opacity", 1.0),
            z_index=data.get("z_index", 0),
            visible=data.get("visible", True),
            parent_id=data.get("parent_id"),
            metadata=data.get("metadata", {}),
        )

        # Deserialize keyframes
        for prop, kf_list in data.get("keyframes", {}).items():
            node.keyframes[prop] = [Keyframe.from_dict(kf) for kf in kf_list]

        # Deserialize children
        for child_data in data.get("children", []):
            child = SceneNode.from_dict(child_data)
            node.add_child(child)

        if "bounding_box" in data:
            node.bounding_box = BoundingBox.from_dict(data["bounding_box"])

        return node

    def __repr__(self) -> str:
        return f"<{self.node_type}:{self.name} id={self.id} pos=({self.transform.x:.1f},{self.transform.y:.1f})>"
