"""
Transform & BoundingBox — Core spatial data types.

Inspired by:
- Motion Canvas Node: position (Vector2), scale (Vector2), rotation, skew
- OpenCut Transform: { x, y, scale, rotation }
- Manim Mobject: bounding_box, get_center(), get_width()

We use world units (not pixels) with a configurable PPU (Pixels Per Unit).
Default world: 19.2 × 10.8 units → maps to 1920×1080 at PPU=100.
Center: (9.6, 5.4), Characters on ground: y ≈ 7.0-8.5.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field


@dataclass
class Transform:
    """2D transform for any scene object.

    All positions are in world units. Use PPU to convert to/from pixels.
    Rotation is in degrees (0-360), counterclockwise positive.
    """

    x: float = 0.0
    y: float = 0.0
    scale_x: float = 1.0
    scale_y: float = 1.0
    rotation: float = 0.0  # degrees

    # ── Convenience Properties ──

    @property
    def scale(self) -> float:
        """Uniform scale (average of scaleX and scaleY)."""
        return (self.scale_x + self.scale_y) / 2

    @scale.setter
    def scale(self, value: float) -> None:
        self.scale_x = value
        self.scale_y = value

    @property
    def position(self) -> tuple[float, float]:
        return (self.x, self.y)

    @position.setter
    def position(self, value: tuple[float, float]) -> None:
        self.x, self.y = value

    # ── Math Operations ──

    def distance_to(self, other: Transform) -> float:
        """Euclidean distance to another transform."""
        dx = other.x - self.x
        dy = other.y - self.y
        return math.sqrt(dx * dx + dy * dy)

    def lerp(self, other: Transform, t: float) -> Transform:
        """Linear interpolation between this transform and another."""
        t = max(0.0, min(1.0, t))
        return Transform(
            x=self.x + (other.x - self.x) * t,
            y=self.y + (other.y - self.y) * t,
            scale_x=self.scale_x + (other.scale_x - self.scale_x) * t,
            scale_y=self.scale_y + (other.scale_y - self.scale_y) * t,
            rotation=self.rotation + (other.rotation - self.rotation) * t,
        )

    # ── Serialization ──

    def to_dict(self) -> dict:
        return {
            "x": self.x,
            "y": self.y,
            "scale_x": self.scale_x,
            "scale_y": self.scale_y,
            "rotation": self.rotation,
        }

    @classmethod
    def from_dict(cls, data: dict) -> Transform:
        # Handle both new format (scale_x/scale_y) and legacy (scale)
        scale_x = data.get("scale_x", data.get("scale", 1.0))
        scale_y = data.get("scale_y", data.get("scale", 1.0))
        return cls(
            x=data.get("x", 0.0),
            y=data.get("y", 0.0),
            scale_x=scale_x,
            scale_y=scale_y,
            rotation=data.get("rotation", 0.0),
        )

    def __repr__(self) -> str:
        scale_str = f"{self.scale:.2f}" if self.scale_x == self.scale_y else f"{self.scale_x:.2f}×{self.scale_y:.2f}"
        return f"Transform(x={self.x:.1f}, y={self.y:.1f}, scale={scale_str}, rot={self.rotation:.0f}°)"


@dataclass
class BoundingBox:
    """Axis-aligned bounding box in world units."""

    left: float = 0.0
    top: float = 0.0
    width: float = 0.0
    height: float = 0.0

    @property
    def right(self) -> float:
        return self.left + self.width

    @property
    def bottom(self) -> float:
        return self.top + self.height

    @property
    def center_x(self) -> float:
        return self.left + self.width / 2

    @property
    def center_y(self) -> float:
        return self.top + self.height / 2

    @property
    def center(self) -> tuple[float, float]:
        return (self.center_x, self.center_y)

    def contains_point(self, x: float, y: float) -> bool:
        return self.left <= x <= self.right and self.top <= y <= self.bottom

    def overlaps(self, other: BoundingBox) -> bool:
        return not (
            self.right < other.left
            or other.right < self.left
            or self.bottom < other.top
            or other.bottom < self.top
        )

    def to_dict(self) -> dict:
        return {
            "left": self.left,
            "top": self.top,
            "width": self.width,
            "height": self.height,
        }

    @classmethod
    def from_dict(cls, data: dict) -> BoundingBox:
        return cls(
            left=data.get("left", 0.0),
            top=data.get("top", 0.0),
            width=data.get("width", 0.0),
            height=data.get("height", 0.0),
        )

    def __repr__(self) -> str:
        return f"BBox({self.left:.1f},{self.top:.1f} {self.width:.1f}×{self.height:.1f})"
