"""
Keyframe — Animation keyframe system with easing interpolation.

Inspired by:
- Motion Canvas tweening module (easeInOutCubic, spring, etc.)
- Theatre.js Sheet/Sequence model (keyframes on properties)
- OpenCut PropertyTrack (animate x, y, scale, rotation, opacity)
- CSS animation timing functions

Each animatable property (x, y, scale, rotation, opacity) has its own
keyframe track. At any time T, we interpolate between the surrounding
keyframes using the specified easing function.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from enum import Enum


class Easing(str, Enum):
    """Easing functions for keyframe interpolation."""

    LINEAR = "linear"
    EASE_IN = "easeIn"
    EASE_OUT = "easeOut"
    EASE_IN_OUT = "easeInOut"
    EASE_IN_CUBIC = "easeInCubic"
    EASE_OUT_CUBIC = "easeOutCubic"
    EASE_IN_OUT_CUBIC = "easeInOutCubic"
    STEP = "step"  # Instant jump — useful for pose/face swaps


def _apply_easing(t: float, easing: Easing) -> float:
    """Apply easing function to normalized time t (0.0 → 1.0)."""
    t = max(0.0, min(1.0, t))

    if easing == Easing.LINEAR:
        return t
    elif easing == Easing.EASE_IN:
        return t * t
    elif easing == Easing.EASE_OUT:
        return 1 - (1 - t) * (1 - t)
    elif easing == Easing.EASE_IN_OUT:
        return 3 * t * t - 2 * t * t * t  # smoothstep
    elif easing == Easing.EASE_IN_CUBIC:
        return t * t * t
    elif easing == Easing.EASE_OUT_CUBIC:
        inv = 1 - t
        return 1 - inv * inv * inv
    elif easing == Easing.EASE_IN_OUT_CUBIC:
        if t < 0.5:
            return 4 * t * t * t
        else:
            inv = -2 * t + 2
            return 1 - inv * inv * inv / 2
    elif easing == Easing.STEP:
        return 0.0 if t < 1.0 else 1.0
    else:
        return t


@dataclass
class Keyframe:
    """A single keyframe for an animatable property.

    Attributes:
        time: Time in seconds when this keyframe occurs.
        value: The property value at this time.
        easing: How to interpolate FROM this keyframe TO the next one.
    """

    time: float
    value: float
    easing: str = "linear"

    def to_dict(self) -> dict:
        return {
            "time": self.time,
            "value": self.value,
            "easing": self.easing,
        }

    @classmethod
    def from_dict(cls, data: dict) -> Keyframe:
        return cls(
            time=data.get("time", 0.0),
            value=data.get("value", 0.0),
            easing=data.get("easing", "linear"),
        )

    def __repr__(self) -> str:
        return f"KF(t={self.time:.2f}, v={self.value:.2f}, {self.easing})"


def interpolate_keyframes(keyframes: list[Keyframe], time: float) -> float:
    """Evaluate a keyframe track at a given time.

    Args:
        keyframes: Sorted list of keyframes (by time).
        time: The time to evaluate at (seconds).

    Returns:
        Interpolated value at the given time.

    Behavior:
        - If no keyframes: returns 0.0
        - If before first keyframe: returns first keyframe's value (hold)
        - If after last keyframe: returns last keyframe's value (hold)
        - Otherwise: interpolates between surrounding keyframes
    """
    if not keyframes:
        return 0.0

    # Before first keyframe — hold first value
    if time <= keyframes[0].time:
        return keyframes[0].value

    # After last keyframe — hold last value
    if time >= keyframes[-1].time:
        return keyframes[-1].value

    # Find surrounding keyframes
    for i in range(len(keyframes) - 1):
        kf_a = keyframes[i]
        kf_b = keyframes[i + 1]

        if kf_a.time <= time <= kf_b.time:
            # Compute normalized time within this segment
            segment_duration = kf_b.time - kf_a.time
            if segment_duration <= 0:
                return kf_b.value

            local_t = (time - kf_a.time) / segment_duration

            # Apply easing (from kf_a's easing)
            try:
                easing = Easing(kf_a.easing)
            except ValueError:
                easing = Easing.LINEAR

            eased_t = _apply_easing(local_t, easing)

            # Lerp between values
            return kf_a.value + (kf_b.value - kf_a.value) * eased_t

    # Fallback — shouldn't reach here if keyframes are sorted
    return keyframes[-1].value


# ══════════════════════════════════════════════
#  ANIMATABLE PROPERTIES — Standard property names
# ══════════════════════════════════════════════

ANIMATABLE_PROPERTIES = {
    "x",          # Transform position X (world units)
    "y",          # Transform position Y (world units)
    "scale_x",    # Scale X
    "scale_y",    # Scale Y
    "rotation",   # Rotation (degrees)
    "opacity",    # Opacity (0.0 - 1.0)
    "blur",       # Blur amount
    "fov",        # Camera field of view
    "zoom",       # Camera zoom
    "volume",     # Audio volume
}
