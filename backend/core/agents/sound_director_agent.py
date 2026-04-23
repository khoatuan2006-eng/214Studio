"""
SoundDirectorAgent — AI-powered BGM & SFX selection.

Uses Ollama (qwen2.5:7b) to select appropriate music and sound effects
based on scene emotion and dialogue context.

AudioNode already exists in the SceneGraph — this agent fills it.
"""

import asyncio
import json
import logging
import re
from typing import Optional

logger = logging.getLogger(__name__)

# Available music tracks (organised by mood)
BGM_CATALOG = {
    "tense":       ["bgm_tension_rising.mp3", "bgm_suspense_dark.mp3", "bgm_confrontation.mp3"],
    "sad":         ["bgm_sad_piano.mp3", "bgm_melancholy.mp3", "bgm_farewell.mp3"],
    "happy":       ["bgm_upbeat_happy.mp3", "bgm_cheerful.mp3", "bgm_celebration.mp3"],
    "romantic":    ["bgm_romance_soft.mp3", "bgm_tender_moment.mp3"],
    "mysterious":  ["bgm_mystery.mp3", "bgm_ambient_dark.mp3"],
    "dramatic":    ["bgm_epic_drama.mp3", "bgm_climax.mp3"],
    "calm":        ["bgm_peaceful.mp3", "bgm_nature_breeze.mp3"],
    "neutral":     ["bgm_ambient_neutral.mp3"],
}

# Available SFX
SFX_CATALOG = {
    "explosion":   "sfx_explosion.wav",
    "thunder":     "sfx_thunder.wav",
    "door_slam":   "sfx_door_slam.wav",
    "glass_break": "sfx_glass_break.wav",
    "camera_flash":"sfx_camera_flash.wav",
    "crowd_gasp":  "sfx_crowd_gasp.wav",
    "phone_ring":  "sfx_phone_ring.wav",
    "footsteps":   "sfx_footsteps.wav",
    "wind":        "sfx_wind.wav",
    "rain":        "sfx_rain.wav",
    "heartbeat":   "sfx_heartbeat.wav",
}

# Minimal prompt — ask only for mood keyword, track selection done in Python
SOUND_DIRECTOR_PROMPT = """Music director task. Reply with ONE JSON only, no explanation.

Scene mood: {dominant_emotion}
Script: {script_context}

Choose the best mood from: tense, sad, happy, romantic, mysterious, dramatic, calm, neutral
If a special sound effect fits (explosion, door_slam, thunder, glass_break, heartbeat, phone_ring, rain), include it.

Reply ONLY this JSON:
{{"mood": "happy", "sfx": []}}

With optional sfx:
{{"mood": "tense", "sfx": [{{"time": 3.5, "key": "thunder"}}]}}"""


def _build_sound_prompt(
    all_lines: list[dict],
    dominant_emotion: str,
    line_durations: list[float] | None = None,
) -> str:
    """Build minimal sound director prompt — keeps under 400 tokens."""
    script_lines = []
    t = 0.0
    for i, line in enumerate(all_lines):
        dur = (line_durations[i] if line_durations and i < len(line_durations) else 2.5) or 2.5
        char = line.get("character", "?")
        text = line.get("text", "")[:50]  # Cap to 50 chars for brevity
        emotion = line.get("emotion", "")
        script_lines.append(f"[{t:.1f}s] {char}[{emotion}]: {text}")
        t += dur

    return SOUND_DIRECTOR_PROMPT.format(
        script_context=" | ".join(script_lines),
        dominant_emotion=dominant_emotion or "neutral",
    )


def _parse_sound_plan(response: str, dominant_emotion: str = "neutral") -> dict:
    """Parse Ollama response. Handles both new {mood, sfx} and legacy {bgm, sfx} formats."""
    clean = response.strip()

    # Strip markdown fences
    match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', clean, re.DOTALL)
    if match:
        clean = match.group(1)
    else:
        match = re.search(r'(\{.*?\})', clean, re.DOTALL)
        if match:
            clean = match.group(1)

    try:
        data = json.loads(clean)

        # New minimal format: {"mood": "happy", "sfx": [...]}
        if "mood" in data:
            mood = data.get("mood", "neutral")
            tracks = BGM_CATALOG.get(mood, BGM_CATALOG["neutral"])
            bgm = [{"time": 0.0, "track": tracks[0], "volume": 0.65, "fade_in": 1.5}]
            # Map sfx keys to actual filenames
            sfx_raw = data.get("sfx", [])
            sfx = []
            for s in sfx_raw:
                key = s.get("key", "")
                if key in SFX_CATALOG:
                    sfx.append({"time": s.get("time", 0.0), "track": SFX_CATALOG[key], "volume": s.get("volume", 1.0)})
            return {"bgm": bgm, "sfx": sfx}

        # Legacy full format: {"bgm": [...], "sfx": [...]}
        if "bgm" in data:
            return {"bgm": data.get("bgm", []), "sfx": data.get("sfx", [])}

    except json.JSONDecodeError:
        logger.warning(f"[SoundDirector] Could not parse JSON: {clean[:120]}")
    return {"bgm": [], "sfx": []}


def _fallback_sound_plan(dominant_emotion: str) -> dict:
    """Deterministic fallback: pick BGM based on emotion, no SFX."""
    em = (dominant_emotion or "neutral").lower()

    # Map dominant emotion to BGM mood
    mood_map = {
        "angry": "tense", "furious": "tense", "giận": "tense", "tức": "tense",
        "scared": "tense", "fear": "tense", "sợ": "tense",
        "sad": "sad", "cry": "sad", "buồn": "sad", "khóc": "sad",
        "happy": "happy", "excited": "happy", "vui": "happy",
        "romantic": "romantic", "shy": "romantic",
        "mysterious": "mysterious", "confused": "mysterious",
        "dramatic": "dramatic", "shocked": "dramatic",
    }

    mood = "neutral"
    for key, m in mood_map.items():
        if key in em:
            mood = m
            break

    tracks = BGM_CATALOG.get(mood, BGM_CATALOG["neutral"])
    return {
        "bgm": [{"time": 0.0, "track": tracks[0], "volume": 0.6, "fade_in": 2.0}],
        "sfx": [],
    }


class SoundDirectorAgent:
    """
    AI Sound director — selects BGM and SFX for a scene.

    Runs on Ollama (qwen2.5:7b). Falls back to deterministic selection.
    """

    @staticmethod
    async def plan_audio(
        all_lines: list[dict],
        dominant_emotion: str = "",
        line_durations: list[float] | None = None,
        timeout: float = 30.0,
    ) -> dict:
        """
        Plan audio cues for the scene.

        Returns:
            {
              "bgm": [{time, track, volume, fade_in}, ...],
              "sfx": [{time, track, volume}, ...]
            }
        """
        try:
            from backend.core.ollama_client import get_ollama_client
            ollama = get_ollama_client()

            if not await ollama.is_available():
                logger.info("[SoundDirector] Ollama unavailable, using fallback.")
                return _fallback_sound_plan(dominant_emotion)

            prompt = _build_sound_prompt(all_lines, dominant_emotion, line_durations)

            logger.info(f"[SoundDirector] 🏠 Asking Ollama to select audio for scene ({len(all_lines)} lines)...")
            response = await asyncio.wait_for(
                ollama.generate(prompt=prompt, temperature=0.3),
                timeout=timeout,
            )

            if not response:
                return _fallback_sound_plan(dominant_emotion)

            plan = _parse_sound_plan(response, dominant_emotion)
            if plan["bgm"] or plan["sfx"]:
                logger.info(f"[SoundDirector] ✅ Plan: {len(plan['bgm'])} BGM cues, {len(plan['sfx'])} SFX cues")
                return plan

            return _fallback_sound_plan(dominant_emotion)

        except asyncio.TimeoutError:
            logger.warning(f"[SoundDirector] Ollama timeout ({timeout}s), using fallback.")
            return _fallback_sound_plan(dominant_emotion)
        except Exception as e:
            logger.error(f"[SoundDirector] Error: {e}, using fallback.")
            return _fallback_sound_plan(dominant_emotion)
