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
    width: int = 1920           # output resolution (px)
    height: int = 1080          # output resolution (px)
    fps: int = 30
    total_duration: float = 5.0
    ppu: int = 100              # Pixels Per Unit


@dataclass
class BackgroundPlan:
    asset_path: str = ""
    label: str = ""
    blur: float = 0
    parallax_speed: float = 0


@dataclass
class PositionKeyframePlan:
    time: float = 0.0
    x: float = 9.6       # world units (not pixels)
    y: float = 5.4       # world units (not pixels)


@dataclass
class FrameSelectionPlan:
    """AI-chosen layer selections for one animation frame."""
    duration: float = 5.0               # how long this frame is shown
    layers: dict = field(default_factory=dict)  # groupName → assetName (e.g. "动作" → "站立")
    transition: str = "cut"             # "cut" or "crossfade"
    transition_duration: float = 0.0


@dataclass
class CharacterPlan:
    name: str = ""
    character_id: str = ""
    pos_x: float = 9.6        # world units
    pos_y: float = 5.4        # world units
    z_index: int = 10
    scale: float = 1.0
    opacity: float = 1.0
    frame_selections: list[FrameSelectionPlan] = field(default_factory=list)
    position_keyframes: list[PositionKeyframePlan] = field(default_factory=list)


@dataclass
class CameraPlan:
    action: str = "static"   # "static", "pan", "zoom", "shake"
    start_x: float = 9.6     # world units
    start_y: float = 5.4     # world units
    end_x: float = 9.6       # world units
    end_y: float = 5.4       # world units
    start_zoom: float = 1.0
    end_zoom: float = 1.0
    fov: float = 19.2        # field of view width in world units
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
    pos_x: float = 9.6        # world units
    pos_y: float = 5.4        # world units
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

DIRECTOR_SYSTEM_PROMPT = """You are an anime scene director AI. Create a ScenePlan JSON with MULTIPLE animation frames per character to tell a story.

## Coordinate System — WORLD UNITS (not pixels!)
- PPU (Pixels Per Unit) = 100. All positions use world units.
- Default world: 19.2 × 10.8 units (maps to 1920×1080 px at PPU=100)
- Center: (9.6, 5.4)
- Characters on ground: y ≈ 7.0-8.5
- Left: x ≈ 3.0-5.0, Center: x ≈ 8.0-11.0, Right: x ≈ 14.0-16.0

## Camera
- Camera positions are also in world units
- `fov` is the camera's field-of-view WIDTH in world units (default 19.2 = sees full width)
- Changing output resolution only affects quality, NOT what camera sees

## 🎬 SCENE BEATS (MOST IMPORTANT!)
Every scene tells a mini-story. You MUST create **2-5 frames** per character, each showing a different moment:

**Beat structure:**
1. **Opening** (1-2s): Character enters or starts in a neutral pose
2. **Action** (1-3s): Main action happens (talking, reacting, moving)
3. **Reaction** (1-2s): Character reacts — surprise, laugh, think
4. **Resolution** (1-2s): Final pose — resolved emotion, settled position

**TIMING RULE:** The sum of all frame durations for each character MUST equal the scene's total_duration.
Example: total_duration=6 → frames: 1.5s + 2s + 1.5s + 1s = 6s

## Frame Selection
Each character has layer groups (e.g. poses, faces, accessories).
For EACH frame, choose the asset that matches that moment's action and emotion.

Example for a 6-second "two friends meeting" scene:
```
Character "Girl":
  Frame 1 (1.5s): pose=walking, face=neutral        # approaching
  Frame 2 (2.0s): pose=waving, face=smile            # seeing friend
  Frame 3 (1.5s): pose=standing, face=happy           # greeting
  Frame 4 (1.0s): pose=standing, face=laugh            # laughing together

Character "Boy":
  Frame 1 (1.5s): pose=standing, face=looking         # waiting
  Frame 2 (2.0s): pose=waving, face=surprise          # noticing friend
  Frame 3 (1.5s): pose=standing, face=smile            # greeting back
  Frame 4 (1.0s): pose=standing, face=laugh            # laughing together
```

## Response Format
Return ONLY valid JSON (all positions in WORLD UNITS, not pixels):
{
  "title": "Scene title",
  "description": "Brief scene description",
  "canvas": { "width": 1920, "height": 1080, "fps": 30, "total_duration": 6.0, "ppu": 100 },
  "background": { "asset_path": "", "label": "Park", "blur": 0, "parallax_speed": 0 },
  "characters": [
    {
      "name": "Girl",
      "character_id": "char-id",
      "pos_x": 5.0, "pos_y": 7.5,
      "z_index": 10, "scale": 1.0, "opacity": 1.0,
      "frame_selections": [
        { "duration": 1.5, "layers": {"动作": "走路", "表情": "普通"}, "transition": "cut", "transition_duration": 0 },
        { "duration": 2.0, "layers": {"动作": "挥手", "表情": "微笑"}, "transition": "crossfade", "transition_duration": 0.3 },
        { "duration": 1.5, "layers": {"动作": "站立", "表情": "开心"}, "transition": "crossfade", "transition_duration": 0.3 },
        { "duration": 1.0, "layers": {"动作": "站立", "表情": "大笑"}, "transition": "crossfade", "transition_duration": 0.2 }
      ],
      "position_keyframes": [
        { "time": 0, "x": 2.0, "y": 7.5 },
        { "time": 1.5, "x": 5.0, "y": 7.5 }
      ]
    }
  ],
  "camera": { "action": "static", "start_x": 9.6, "start_y": 5.4, "end_x": 9.6, "end_y": 5.4, "start_zoom": 1.0, "end_zoom": 1.0, "fov": 19.2, "duration": 2.0, "easing": "easeInOut" },
  "foreground": null,
  "props": [],
  "audio": []
}

## RULES
1. Use EXACT asset names from the character's layer groups list
2. Select AT LEAST one asset from EACH available layer group per frame
3. Create 2-5 frames per character (NEVER just 1!)
4. Frame durations MUST sum to total_duration
5. Use "crossfade" transition between frames for smooth animation
6. Match poses and expressions to the scene's story/mood
7. ALL positions use WORLD UNITS (not pixels!) — center is (9.6, 5.4)
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
        chars_lines = []
        for c in available_characters:
            cid = c.get('id', '')
            cname = c.get('name', 'Unknown')
            line = f"  - id: {cid}, name: {cname}"

            # Include layer groups and their asset names
            layer_groups = c.get('layer_groups', {})
            if layer_groups:
                groups_info = []
                for group_name, assets in layer_groups.items():
                    if isinstance(assets, list):
                        asset_names = [a.get('name', '') for a in assets if a.get('name')]
                        if asset_names:
                            groups_info.append(
                                f"      {group_name}: [{', '.join(asset_names)}]"
                            )
                if groups_info:
                    line += "\n    Layer Groups (choose one from each group):\n"
                    line += "\n".join(groups_info)

            chars_lines.append(line)

        context_parts.append(f"Available Characters:\n" + "\n".join(chars_lines))

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

Generate the ScenePlan JSON. IMPORTANT: Choose specific assets from each character's layer groups that match the scene mood and action."""

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
    """Call Google Gemini API with auto-retry and key rotation on rate limits."""
    import asyncio
    from google import genai
    from google.genai import types

    max_retries = 3
    retry_delays = [5, 15, 30]  # seconds

    for attempt in range(max_retries + 1):
        # Create client with current key
        client = genai.Client(api_key=config.api_key)
        try:
            response = await client.aio.models.generate_content(
                model=config.model,
                contents=user_message,
                config=types.GenerateContentConfig(
                    system_instruction=system_prompt,
                    temperature=config.temperature,
                    response_mime_type="application/json",
                ),
            )
            text = response.text
            if not text:
                logger.warning(f"[Gemini] Empty response (attempt {attempt + 1}). Candidates: {response.candidates}")
                if attempt < max_retries:
                    continue
                raise ValueError("Gemini returned empty response. Try a different prompt or model.")
            return text
        except Exception as e:
            error_str = str(e)
            if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str:
                # Try rotating to next key first
                rotated = config.rotate_key()
                if rotated:
                    logger.warning(
                        f"[Gemini] Rate-limited on {config.current_key_label}. "
                        f"Switching to next key..."
                    )
                    continue  # Retry immediately with new key

                if attempt < max_retries:
                    delay = retry_delays[attempt]
                    logger.warning(
                        f"[Gemini] Rate-limited ({config.current_key_label}), "
                        f"attempt {attempt + 1}/{max_retries + 1}. "
                        f"Retrying in {delay}s..."
                    )
                    await asyncio.sleep(delay)
                    continue
                else:
                    raise ValueError(
                        f"⚠️ API KEY RATE LIMITED: {config.current_key_label}. "
                        f"Hãy đổi key mới tại https://aistudio.google.com/apikey "
                        f"rồi gửi qua PUT /api/ai/config"
                    )
            raise


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
                x=kf.get("x", 9.6),
                y=kf.get("y", 5.4),
            ))

        # Parse AI-chosen frame selections
        frames = []
        for fs in ch.get("frame_selections", []):
            frames.append(FrameSelectionPlan(
                duration=fs.get("duration", 5.0),
                layers=fs.get("layers", {}),
                transition=fs.get("transition", "cut"),
                transition_duration=fs.get("transition_duration", 0),
            ))

        plan.characters.append(CharacterPlan(
            name=ch.get("name", "Character"),
            character_id=ch.get("character_id", ""),
            pos_x=ch.get("pos_x", 9.6),
            pos_y=ch.get("pos_y", 5.4),
            z_index=ch.get("z_index", 10),
            scale=ch.get("scale", 1.0),
            opacity=ch.get("opacity", 1.0),
            frame_selections=frames,
            position_keyframes=kfs,
        ))

    # Camera
    if data.get("camera"):
        cam = data["camera"]
        plan.camera = CameraPlan(
            action=cam.get("action", "static"),
            start_x=cam.get("start_x", 9.6),
            start_y=cam.get("start_y", 5.4),
            end_x=cam.get("end_x", 9.6),
            end_y=cam.get("end_y", 5.4),
            fov=cam.get("fov", 19.2),
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
            pos_x=p.get("pos_x", 9.6),
            pos_y=p.get("pos_y", 5.4),
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
