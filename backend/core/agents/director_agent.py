"""
Director Agent — Đọc prompt → Tạo ScenePlan JSON

Gọi LLM (Gemini/OpenAI) với context gồm:
- Danh sách characters + backgrounds có sẵn
- User prompt mô tả scene mong muốn
→ Output: ScenePlan JSON mô tả đầy đủ scene
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field, asdict
from typing import Any

from backend.core.ai_config import get_ai_config

logger = logging.getLogger(__name__)


# ══════════════════════════════════════════════
#  SCENE PLAN DATA STRUCTURES
# ══════════════════════════════════════════════

@dataclass
class CanvasConfig:
    width: int = 1920
    height: int = 1080
    fps: int = 30
    total_duration: float = 5.0


@dataclass
class BackgroundPlan:
    asset_path: str = ""
    label: str = ""
    blur: float = 0
    parallax_speed: float = 0


@dataclass
class PositionKeyframePlan:
    time: float = 0.0
    x: float = 960.0
    y: float = 540.0


@dataclass
class CharacterPlan:
    name: str = ""
    character_id: str = ""
    pos_x: float = 960.0
    pos_y: float = 540.0
    z_index: int = 10
    scale: float = 1.0
    opacity: float = 1.0
    position_keyframes: list[PositionKeyframePlan] = field(default_factory=list)


@dataclass
class CameraPlan:
    action: str = "static"   # "static", "pan", "zoom", "shake"
    start_x: float = 960
    start_y: float = 540
    end_x: float = 960
    end_y: float = 540
    start_zoom: float = 1.0
    end_zoom: float = 1.0
    duration: float = 2.0
    easing: str = "easeInOut"


@dataclass
class ForegroundPlan:
    effect_type: str = "none"   # "rain", "snow", "sakura", "firefly"
    intensity: float = 0.5
    speed: float = 1.0
    opacity: float = 0.7


@dataclass
class PropPlan:
    label: str = ""
    asset_path: str = ""
    pos_x: float = 960.0
    pos_y: float = 540.0
    z_index: int = 15
    scale: float = 1.0
    rotation: float = 0.0


@dataclass
class AudioPlan:
    label: str = ""
    audio_type: str = "bgm"  # "bgm", "sfx", "voice"
    volume: float = 0.8
    loop: bool = False


@dataclass
class ScenePlan:
    title: str = "Untitled Scene"
    description: str = ""
    canvas: CanvasConfig = field(default_factory=CanvasConfig)
    background: BackgroundPlan | None = None
    characters: list[CharacterPlan] = field(default_factory=list)
    camera: CameraPlan | None = None
    foreground: ForegroundPlan | None = None
    props: list[PropPlan] = field(default_factory=list)
    audio: list[AudioPlan] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


# ══════════════════════════════════════════════
#  SYSTEM PROMPT
# ══════════════════════════════════════════════

DIRECTOR_SYSTEM_PROMPT = """You are an anime scene director AI. Your job is to create a detailed ScenePlan JSON from a user's description.

## Canvas
- Default canvas: 1920x1080 pixels
- Coordinate system: (0,0) = top-left, (1920,1080) = bottom-right
- Center: (960, 540)

## Position Guidelines
- Characters standing on ground: y ≈ 700-850 (feet near bottom third)
- Character on left side: x ≈ 300-500
- Character in center: x ≈ 800-1100
- Character on right side: x ≈ 1400-1600
- Two characters facing each other: left at x≈400, right at x≈1520
- Group of 3: left x≈300, center x≈960, right x≈1620
- Close-up shot: scale ≈ 1.5-2.0, y ≈ 400-500
- Full body shot: scale ≈ 0.8-1.0, y ≈ 750-850
- Far away: scale ≈ 0.3-0.5

## Z-Index Guidelines
- Background: z=0 (implicit)
- Far characters: z=5-8
- Main characters: z=10-15
- Foreground props: z=20-30
- Foreground effects: z=50

## Movement (Position Keyframes)
- To move character from left to right: keyframes at time 0 (x=400) → time 3 (x=1520)
- Walking toward camera: scale increases, y decreases slightly
- Character entrance: start off-screen (x < 0 or x > 1920)

## Camera Actions
- "static": no movement
- "pan": horizontal movement (change startX/endX)
- "zoom": change startZoom/endZoom
- "shake": dramatic effect

## Response Format
Return ONLY valid JSON matching this schema (no markdown):
{
  "title": "Scene title",
  "description": "Brief description",
  "canvas": { "width": 1920, "height": 1080, "fps": 30, "total_duration": 5.0 },
  "background": { "asset_path": "path or empty", "label": "name", "blur": 0, "parallax_speed": 0 } or null,
  "characters": [
    {
      "name": "Character Name",
      "character_id": "id from available list or empty",
      "pos_x": 960, "pos_y": 750,
      "z_index": 10, "scale": 1.0, "opacity": 1.0,
      "position_keyframes": [
        { "time": 0, "x": 400, "y": 750 },
        { "time": 3, "x": 1520, "y": 750 }
      ]
    }
  ],
  "camera": { "action": "static", "start_x": 960, "start_y": 540, "end_x": 960, "end_y": 540, "start_zoom": 1.0, "end_zoom": 1.0, "duration": 2, "easing": "easeInOut" } or null,
  "foreground": { "effect_type": "rain", "intensity": 0.5, "speed": 1.0, "opacity": 0.7 } or null,
  "props": [],
  "audio": []
}
"""


# ══════════════════════════════════════════════
#  DIRECTOR AGENT
# ══════════════════════════════════════════════

async def create_plan(
    prompt: str,
    available_characters: list[dict],
    available_backgrounds: list[dict],
) -> ScenePlan:
    """
    Call LLM to generate a ScenePlan from user prompt + available assets.

    Args:
        prompt: User's scene description
        available_characters: List of {id, name, poses_count} from library
        available_backgrounds: List of {name, path, url} from backgrounds API

    Returns:
        ScenePlan with all scene details
    """
    config = get_ai_config()

    # Build context message
    context_parts = []

    if available_characters:
        chars_text = "\n".join(
            f"  - id: {c.get('id', '')}, name: {c.get('name', 'Unknown')}"
            for c in available_characters
        )
        context_parts.append(f"Available Characters:\n{chars_text}")

    if available_backgrounds:
        bgs_text = "\n".join(
            f"  - path: {b.get('path', '')}, name: {b.get('name', 'Unknown')}"
            for b in available_backgrounds
        )
        context_parts.append(f"Available Backgrounds:\n{bgs_text}")

    if not context_parts:
        context_parts.append("No pre-existing assets available. Create placeholder names.")

    context_msg = "\n\n".join(context_parts)

    user_message = f"""## Available Assets
{context_msg}

## User Request
{prompt}

Generate the ScenePlan JSON:"""

    # Call LLM
    raw_json = await _call_llm(
        system_prompt=DIRECTOR_SYSTEM_PROMPT,
        user_message=user_message,
        config=config,
    )

    # Parse response
    plan = _parse_scene_plan(raw_json)
    logger.info(f"[Director] Created plan: '{plan.title}' with {len(plan.characters)} characters")
    return plan


# ══════════════════════════════════════════════
#  LLM CALL
# ══════════════════════════════════════════════

async def _call_llm(system_prompt: str, user_message: str, config: Any) -> str:
    """Call the configured LLM provider and return raw text response."""

    if config.provider == "gemini":
        return await _call_gemini(system_prompt, user_message, config)
    elif config.provider == "openai":
        return await _call_openai(system_prompt, user_message, config)
    else:
        raise ValueError(f"Unsupported AI provider: {config.provider}")


async def _call_gemini(system_prompt: str, user_message: str, config: Any) -> str:
    """Call Google Gemini API."""
    import google.generativeai as genai

    genai.configure(api_key=config.api_key)
    model = genai.GenerativeModel(
        config.model,
        system_instruction=system_prompt,
    )

    response = await model.generate_content_async(
        user_message,
        generation_config=genai.types.GenerationConfig(
            temperature=config.temperature,
            response_mime_type="application/json",
        ),
    )

    return response.text


async def _call_openai(system_prompt: str, user_message: str, config: Any) -> str:
    """Call OpenAI API."""
    import openai

    client = openai.AsyncOpenAI(api_key=config.api_key)
    response = await client.chat.completions.create(
        model=config.model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
        temperature=config.temperature,
        response_format={"type": "json_object"},
    )

    return response.choices[0].message.content or "{}"


# ══════════════════════════════════════════════
#  RESPONSE PARSER
# ══════════════════════════════════════════════

def _parse_scene_plan(raw_json: str) -> ScenePlan:
    """Parse LLM JSON response into ScenePlan dataclass."""
    # Strip markdown code fences if present
    text = raw_json.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        lines = lines[1:]  # remove opening ```json
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines)

    data = json.loads(text)

    plan = ScenePlan(
        title=data.get("title", "Untitled Scene"),
        description=data.get("description", ""),
    )

    # Canvas
    if "canvas" in data:
        c = data["canvas"]
        plan.canvas = CanvasConfig(
            width=c.get("width", 1920),
            height=c.get("height", 1080),
            fps=c.get("fps", 30),
            total_duration=c.get("total_duration", 5.0),
        )

    # Background
    if data.get("background"):
        bg = data["background"]
        plan.background = BackgroundPlan(
            asset_path=bg.get("asset_path", ""),
            label=bg.get("label", "Background"),
            blur=bg.get("blur", 0),
            parallax_speed=bg.get("parallax_speed", 0),
        )

    # Characters
    for ch in data.get("characters", []):
        kfs = []
        for kf in ch.get("position_keyframes", []):
            kfs.append(PositionKeyframePlan(
                time=kf.get("time", 0),
                x=kf.get("x", 960),
                y=kf.get("y", 540),
            ))

        plan.characters.append(CharacterPlan(
            name=ch.get("name", "Character"),
            character_id=ch.get("character_id", ""),
            pos_x=ch.get("pos_x", 960),
            pos_y=ch.get("pos_y", 540),
            z_index=ch.get("z_index", 10),
            scale=ch.get("scale", 1.0),
            opacity=ch.get("opacity", 1.0),
            position_keyframes=kfs,
        ))

    # Camera
    if data.get("camera"):
        cam = data["camera"]
        plan.camera = CameraPlan(
            action=cam.get("action", "static"),
            start_x=cam.get("start_x", 960),
            start_y=cam.get("start_y", 540),
            end_x=cam.get("end_x", 960),
            end_y=cam.get("end_y", 540),
            start_zoom=cam.get("start_zoom", 1),
            end_zoom=cam.get("end_zoom", 1),
            duration=cam.get("duration", 2),
            easing=cam.get("easing", "easeInOut"),
        )

    # Foreground
    if data.get("foreground"):
        fg = data["foreground"]
        plan.foreground = ForegroundPlan(
            effect_type=fg.get("effect_type", "none"),
            intensity=fg.get("intensity", 0.5),
            speed=fg.get("speed", 1.0),
            opacity=fg.get("opacity", 0.7),
        )

    # Props
    for p in data.get("props", []):
        plan.props.append(PropPlan(
            label=p.get("label", "Prop"),
            asset_path=p.get("asset_path", ""),
            pos_x=p.get("pos_x", 960),
            pos_y=p.get("pos_y", 540),
            z_index=p.get("z_index", 15),
            scale=p.get("scale", 1.0),
            rotation=p.get("rotation", 0),
        ))

    # Audio
    for a in data.get("audio", []):
        plan.audio.append(AudioPlan(
            label=a.get("label", "Audio"),
            audio_type=a.get("audio_type", "bgm"),
            volume=a.get("volume", 0.8),
            loop=a.get("loop", False),
        ))

    return plan
