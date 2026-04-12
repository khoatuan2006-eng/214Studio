/**
 * Keyframe Interpolation — Client-side animation evaluation.
 *
 * Mirrors backend keyframe.py for consistent interpolation on both sides.
 * The frontend evaluates keyframes in real-time for preview playback,
 * while the backend evaluates them for AI scene analysis.
 */

import type { Keyframe, EasingType } from "./types";

// ══════════════════════════════════════════════
//  EASING FUNCTIONS
// ══════════════════════════════════════════════

/**
 * Apply easing function to normalized time t (0.0 → 1.0).
 * Must match backend _apply_easing() exactly.
 */
export function applyEasing(t: number, easing: EasingType): number {
  t = Math.max(0, Math.min(1, t));

  switch (easing) {
    case "linear":
      return t;

    case "easeIn":
      return t * t;

    case "easeOut":
      return 1 - (1 - t) * (1 - t);

    case "easeInOut":
      return 3 * t * t - 2 * t * t * t; // smoothstep

    case "easeInCubic":
      return t * t * t;

    case "easeOutCubic": {
      const inv = 1 - t;
      return 1 - inv * inv * inv;
    }

    case "easeInOutCubic":
      if (t < 0.5) {
        return 4 * t * t * t;
      } else {
        const inv = -2 * t + 2;
        return 1 - (inv * inv * inv) / 2;
      }

    case "step":
      return t < 1.0 ? 0.0 : 1.0;

    default:
      return t;
  }
}

// ══════════════════════════════════════════════
//  KEYFRAME INTERPOLATION
// ══════════════════════════════════════════════

/**
 * Evaluate a keyframe track at a given time.
 *
 * Behavior matches backend interpolate_keyframes():
 * - No keyframes → returns defaultValue
 * - Before first keyframe → hold first value
 * - After last keyframe → hold last value
 * - Between keyframes → interpolate with easing
 *
 * @param keyframes - Sorted list of keyframes (by time)
 * @param time - Current time in seconds
 * @param defaultValue - Fallback value if no keyframes
 */
export function interpolateKeyframes(
  keyframes: Keyframe[],
  time: number,
  defaultValue: number = 0
): number {
  if (!keyframes || keyframes.length === 0) {
    return defaultValue;
  }

  // Before first keyframe — hold
  if (time <= keyframes[0].time) {
    return keyframes[0].value;
  }

  // After last keyframe — hold
  if (time >= keyframes[keyframes.length - 1].time) {
    return keyframes[keyframes.length - 1].value;
  }

  // Find surrounding keyframes and interpolate
  for (let i = 0; i < keyframes.length - 1; i++) {
    const kfA = keyframes[i];
    const kfB = keyframes[i + 1];

    if (kfA.time <= time && time <= kfB.time) {
      const segmentDuration = kfB.time - kfA.time;
      if (segmentDuration <= 0) return kfB.value;

      const localT = (time - kfA.time) / segmentDuration;
      const easedT = applyEasing(localT, kfA.easing);

      return kfA.value + (kfB.value - kfA.value) * easedT;
    }
  }

  // Fallback
  return keyframes[keyframes.length - 1].value;
}

/**
 * Evaluate all keyframe tracks for a node at a given time.
 *
 * @param keyframeTracks - Map of property name → keyframes
 * @param time - Current time in seconds
 * @param defaults - Default values for each property
 */
export function evaluateAllTracks(
  keyframeTracks: Record<string, Keyframe[]>,
  time: number,
  defaults: Record<string, number> = {}
): Record<string, number> {
  const result: Record<string, number> = {};

  for (const [prop, keyframes] of Object.entries(keyframeTracks)) {
    result[prop] = interpolateKeyframes(
      keyframes,
      time,
      defaults[prop] ?? 0
    );
  }

  return result;
}

/**
 * Insert a keyframe into a sorted track (immutable — returns new array).
 * Replaces existing keyframe at the same time (within 1ms tolerance).
 */
export function insertKeyframe(
  track: Keyframe[],
  newKf: Keyframe
): Keyframe[] {
  const filtered = track.filter(
    (kf) => Math.abs(kf.time - newKf.time) > 0.001
  );
  filtered.push(newKf);
  filtered.sort((a, b) => a.time - b.time);
  return filtered;
}

/**
 * Remove a keyframe at a specific time (within 1ms tolerance).
 */
export function removeKeyframe(
  track: Keyframe[],
  time: number
): Keyframe[] {
  return track.filter((kf) => Math.abs(kf.time - time) > 0.001);
}
