"""
IdleAnimatorAgent — Micro-animation keyframe generator.

Injects subtle "alive" keyframes for characters during silence gaps:
- Breathing (gentle y-axis oscillation ±0.05u)
- Subtle body sway (scale_x micro-variation ±0.01)
- Emotion-aware intensity (tense scene → faster breathing, calm → slow)

This is PURE DETERMINISTIC CODE — no AI required.
The emotion context is used to modulate timing parameters only.
"""

import logging
import math
from typing import Optional

logger = logging.getLogger(__name__)

# Breathing presets per emotion intensity
EMOTION_INTENSITY = {
    # High intensity (fast, shallow breathing)
    "angry": 0.9, "furious": 1.0, "rage": 1.0,
    "scared": 0.85, "fear": 0.85, "panic": 1.0,
    "excited": 0.8, "shocked": 0.9, "surprised": 0.75,
    "giận": 0.9, "sợ": 0.85, "điên": 1.0, "hét": 0.9,
    # Medium intensity
    "sad": 0.5, "happy": 0.55, "thinking": 0.4,
    "buồn": 0.5, "vui": 0.55, "nghĩ": 0.4,
    # Low intensity (slow, deep breathing — calm)
    "neutral": 0.3, "cold": 0.2, "bored": 0.25,
    "lạnh lùng": 0.2, "bình thản": 0.3,
}

DEFAULT_INTENSITY = 0.35


def _get_intensity(emotion: str) -> float:
    """Map emotion keyword to breathing intensity (0.0 = very slow, 1.0 = very fast)."""
    if not emotion:
        return DEFAULT_INTENSITY
    em = emotion.lower().strip()
    if em in EMOTION_INTENSITY:
        return EMOTION_INTENSITY[em]
    # Partial match
    for key, val in EMOTION_INTENSITY.items():
        if key in em or em in key:
            return val
    return DEFAULT_INTENSITY


def generate_idle_keyframes(
    char_id: str,
    gaps: list[dict],
    dominant_emotion: str = "",
    base_y: float = 7.5,
    base_scale_x: float = 1.0,
    base_scale_y: float = 1.0,
) -> list[dict]:
    """
    Generate micro-animation keyframes for a character during silence gaps.

    Args:
        char_id:           The character node ID in the scene graph.
        gaps:              List of {start_time, end_time} dicts representing silence windows.
        dominant_emotion:  The scene's overall emotion (for intensity modulation).
        base_y:            The character's base Y world coordinate.
        base_scale_x:      The character's base X scale.
        base_scale_y:      The character's base Y scale.

    Returns:
        List of keyframe dicts:
        [{char_id, time, y, scale_x, scale_y, type: "idle_breathe"}]
    """
    intensity = _get_intensity(dominant_emotion)

    # Breathing parameters
    breathe_period = 2.5 - (intensity * 1.2)   # 1.3s (tense) to 2.5s (calm) per breath cycle
    breathe_amplitude_y = 0.03 + (intensity * 0.04)  # 0.03–0.07u vertical oscillation
    sway_amplitude = 0.005 + (intensity * 0.005)      # subtle scale_x sway

    keyframes = []

    for gap in gaps:
        t_start = float(gap.get("start_time", 0.0))
        t_end = float(gap.get("end_time", t_start + 0.5))
        duration = t_end - t_start

        if duration < 0.3:
            continue  # Too short for idle animation

        # Sample keyframes every half-period within the gap
        sample_step = breathe_period / 2
        t = t_start
        while t <= t_end:
            # Sine wave for breathing (0 at start, peaks at mid-period)
            phase = (t - t_start) / breathe_period
            sin_val = math.sin(phase * 2 * math.pi)

            y_offset = breathe_amplitude_y * sin_val
            scale_sway = sway_amplitude * math.cos(phase * 2 * math.pi)

            # Preserve facing/flipping
            sway_dir = 1.0 if base_scale_x >= 0 else -1.0

            keyframes.append({
                "char_id": char_id,
                "time": round(t, 3),
                "y": round(base_y + y_offset, 4),
                "scale_x": round(base_scale_x + (scale_sway * sway_dir), 4),
                "scale_y": round(base_scale_y - y_offset * 0.3, 4),
                "type": "idle_breathe",
                "intensity": round(intensity, 2),
            })

            t += sample_step

    logger.debug(f"[IdleAnimator] {char_id}: {len(keyframes)} idle keyframes across {len(gaps)} gaps")
    return keyframes


class IdleAnimatorAgent:
    """
    Deterministic idle animation injector.

    After ActorAgent plans the performance, call inject_idle_keyframes()
    to make characters breathe and sway during dialogue gaps.
    """

    @staticmethod
    def compute_gaps(
        all_lines: list[dict],
        char_name: str,
        total_duration: float,
        line_durations: list[float] | None = None,
    ) -> list[dict]:
        """
        Compute silence windows for a character between their speaking turns.

        Args:
            all_lines:       All scene lines with {character, text}.
            char_name:       The character to compute gaps for.
            total_duration:  Total scene duration in seconds.
            line_durations:  Optional per-line duration list. If None, distributes evenly.

        Returns:
            List of {start_time, end_time} dicts.
        """
        n = len(all_lines)
        if not line_durations:
            each = total_duration / max(n, 1)
            line_durations = [each] * n

        # Build timeline
        timeline = []
        t = 0.0
        for i, line in enumerate(all_lines):
            dur = line_durations[i] if i < len(line_durations) else 1.5
            timeline.append({
                "start": t,
                "end": t + dur,
                "is_speaking": line.get("character") == char_name,
            })
            t += dur

        # Find gaps (windows where this char is NOT speaking)
        gaps = []
        for seg in timeline:
            if not seg["is_speaking"]:
                gap_dur = seg["end"] - seg["start"]
                if gap_dur >= 0.3:
                    gaps.append({"start_time": seg["start"], "end_time": seg["end"]})

        return gaps

    @staticmethod
    def inject_idle_keyframes_into_node(
        char_node,
        gaps: list[dict],
        dominant_emotion: str = "",
    ) -> int:
        """
        Inject idle keyframes directly into a CharacterNode's timeline.

        Args:
            char_node:         The CharacterNode instance from the SceneGraph.
            gaps:              Silence gap windows.
            dominant_emotion:  Overall scene emotion.

        Returns:
            Number of keyframes injected.
        """
        base_y = 9.6  # Default fallback
        base_scale_x = 1.0
        base_scale_y = 1.0
        
        # Try to get current values from keyframes or properties
        try:
            if "y" in char_node.keyframes and char_node.keyframes["y"]:
                base_y = char_node.keyframes["y"][0].value
            elif hasattr(char_node, 'y'):
                base_y = char_node.y
            elif hasattr(char_node, 'pos_y'):
                base_y = char_node.pos_y

            if "scale_x" in char_node.keyframes and char_node.keyframes["scale_x"]:
                base_scale_x = char_node.keyframes["scale_x"][0].value
            elif hasattr(char_node, 'scale'):
                base_scale_x = char_node.scale
                
            if "scale_y" in char_node.keyframes and char_node.keyframes["scale_y"]:
                base_scale_y = char_node.keyframes["scale_y"][0].value
            elif hasattr(char_node, 'scale'):
                base_scale_y = char_node.scale
        except Exception:
            pass

        kfs = generate_idle_keyframes(
            char_id=char_node.id,
            gaps=gaps,
            dominant_emotion=dominant_emotion,
            base_y=base_y,
            base_scale_x=base_scale_x,
            base_scale_y=base_scale_y,
        )

        injected = 0
        for kf in kfs:
            try:
                # Add y keyframe
                char_node.add_keyframe("y", kf["time"], kf["y"], easing="easeInOutSine")
                # Add scale_x for sway
                char_node.add_keyframe("scale_x", kf["time"], kf["scale_x"], easing="easeInOutSine")
                # Add scale_y for sway stretch
                char_node.add_keyframe("scale_y", kf["time"], kf["scale_y"], easing="easeInOutSine")
                injected += 1
            except Exception as e:
                logger.debug(f"[IdleAnimator] Could not inject keyframe at t={kf['time']}: {e}")

        logger.info(f"[IdleAnimator] {char_node.id}: injected {injected} idle keyframes")
        return injected
