"""
Stage Analyzer Agent — Vision AI Stage Element Identification

Receives a stage layer image (PNG) and uses Vision AI to:
1. Identify what the element is (chair, table, floor, window, etc.)
2. Classify category (furniture, wall, floor, ceiling, decor, nature, etc.)
3. Suggest interaction points (where characters can stand/sit)
4. Generate semantic labels in Vietnamese and English
"""

from __future__ import annotations
import base64
import json
import logging
from dataclasses import dataclass, field
from typing import Any

from ..ai_config import get_ai_config

logger = logging.getLogger(__name__)


# ══════════════════════════════════════════════
#  DATA TYPES
# ══════════════════════════════════════════════

@dataclass
class ElementInfo:
    """Semantic info for a single stage layer element."""
    layer_id: str = ""
    name_vi: str = ""          # Vietnamese name: "ghế sofa"
    name_en: str = ""          # English name: "sofa"
    category: str = ""         # furniture, wall, floor, ceiling, decor, nature, vehicle, etc.
    description: str = ""      # Brief description
    can_stand_on: bool = False # Characters can stand on this
    can_sit_on: bool = False   # Characters can sit on this
    is_background: bool = False  # Full background element
    suggested_z: int = 0       # Suggested z-index for proper layering
    # Bounding box (percentage 0-100 of image dimensions)
    bbox_x: float = 0.0       # left edge %
    bbox_y: float = 0.0       # top edge %
    bbox_w: float = 100.0     # width %
    bbox_h: float = 100.0     # height %

    def to_dict(self) -> dict:
        return {
            "layer_id": self.layer_id,
            "name_vi": self.name_vi,
            "name_en": self.name_en,
            "category": self.category,
            "description": self.description,
            "can_stand_on": self.can_stand_on,
            "can_sit_on": self.can_sit_on,
            "is_background": self.is_background,
            "suggested_z": self.suggested_z,
            "bbox_x": self.bbox_x,
            "bbox_y": self.bbox_y,
            "bbox_w": self.bbox_w,
            "bbox_h": self.bbox_h,
        }


@dataclass
class StageAnalysisResult:
    """Result of analyzing all elements in a stage."""
    elements: list[ElementInfo] = field(default_factory=list)
    scene_description: str = ""  # Overall scene description
    scene_type: str = ""         # "interior", "exterior", "abstract"
    mood: str = ""               # "warm", "cold", "dramatic", etc.

    def to_dict(self) -> dict:
        return {
            "elements": [e.to_dict() for e in self.elements],
            "scene_description": self.scene_description,
            "scene_type": self.scene_type,
            "mood": self.mood,
        }


# ══════════════════════════════════════════════
#  SYSTEM PROMPT
# ══════════════════════════════════════════════

STAGE_ANALYZER_SYSTEM_PROMPT = """You are a Stage Element Analyzer for an Anime Studio application.
You receive images of individual stage layer elements extracted from animation scenes.

Your job is to identify each element and provide semantic information about it.

You MUST respond with valid JSON matching this schema:
{
  "elements": [
    {
      "index": 0,
      "name_vi": "Vietnamese name (e.g. ghế sofa, bàn gỗ, sàn nhà)",
      "name_en": "English name (e.g. sofa, wooden table, floor)",
      "category": "one of: furniture, wall, floor, ceiling, decor, nature, vehicle, building, prop, character_prop, background, sky, water, door, window, stairs, light, other",
      "description": "Brief description including color, material, style",
      "can_stand_on": true/false,
      "can_sit_on": true/false,
      "is_background": true/false,
      "suggested_z": 0,
      "bbox_x": 0,
      "bbox_y": 0,
      "bbox_w": 100,
      "bbox_h": 100
    }
  ],
  "scene_description": "Overall description of the scene/location",
  "scene_type": "interior or exterior or abstract",
  "mood": "warm, cold, dramatic, cheerful, mysterious, etc."
}

Rules for bbox (bounding box as percentage of image 0-100):
- bbox_x: left edge position as % of image width
- bbox_y: top edge position as % of image height
- bbox_w: element width as % of image width
- bbox_h: element height as % of image height
- For full-image backgrounds: bbox_x=0, bbox_y=0, bbox_w=100, bbox_h=100
- Estimate the tightest bounding box around the visible element

Rules for suggested_z:
- Sky/ceiling/far background: 0
- Walls/backdrop: 1
- Far objects: 2
- Mid-ground furniture/objects: 3-5
- Close/foreground objects: 6-8
- Overlay/frame elements: 9-10

Rules for can_stand_on:
- Floors, ground, platforms, bridges, rooftops → true
- Everything else → false

Rules for can_sit_on:
- Chairs, sofas, benches, beds, stools, desks (edge) → true
- Everything else → false

Respond ONLY with the JSON, no extra text."""


# ══════════════════════════════════════════════
#  MAIN ANALYSIS FUNCTION
# ══════════════════════════════════════════════

async def analyze_stage_elements(
    layer_images: list[dict],
    vision_model: str | None = None,
) -> StageAnalysisResult:
    """
    Analyze stage layer images using Vision AI.
    
    Args:
        layer_images: List of dicts with keys:
            - id: layer ID
            - label: current label
            - image_base64: base64-encoded PNG of the layer
            - type: "background" | "foreground" | "prop"
            - zIndex: current z-index
        vision_model: Optional model override (e.g. "gemini-2.0-flash")
    
    Returns:
        StageAnalysisResult with semantic info for each element
    """
    config = get_ai_config()
    
    if not config.has_api_key:
        raise ValueError("No API key configured. Set GOOGLE_API_KEY or configure via /api/ai/config")

    # Temporarily override vision model if specified
    original_model = config.vision_model
    if vision_model:
        config.vision_model = vision_model

    # Build the user message with context
    layer_context = []
    for i, layer in enumerate(layer_images):
        layer_context.append(
            f"Element {i}: id='{layer.get('id', '')}', "
            f"current_label='{layer.get('label', 'unknown')}', "
            f"type='{layer.get('type', 'prop')}', "
            f"zIndex={layer.get('zIndex', 0)}"
        )

    user_message = (
        f"I have {len(layer_images)} stage layer elements from an anime scene. "
        f"Please identify each element.\n\n"
        f"Current layer info:\n" + "\n".join(layer_context)
    )

    # Call Vision AI with key rotation on 429
    images_b64 = [layer.get("image_base64", "") for layer in layer_images]
    max_attempts = max(config.total_keys, 2)
    last_error = None

    for attempt in range(max_attempts):
        try:
            if config.provider == "gemini":
                raw_json = await _call_gemini_multi_image(
                    STAGE_ANALYZER_SYSTEM_PROMPT,
                    user_message,
                    images_b64,
                    config,
                )
            elif config.provider == "openai":
                raw_json = await _call_openai_multi_image(
                    STAGE_ANALYZER_SYSTEM_PROMPT,
                    user_message,
                    images_b64,
                    config,
                )
            else:
                raise ValueError(f"Unsupported provider: {config.provider}")

            config.vision_model = original_model
            return _parse_analysis_result(raw_json, layer_images)

        except Exception as e:
            last_error = e
            err_str = str(e)
            # Rotate key on quota/rate errors
            if "429" in err_str or "quota" in err_str.lower() or "RESOURCE_EXHAUSTED" in err_str:
                config.rotate_key()
                logger.warning(f"Stage analysis attempt {attempt+1}/{max_attempts}: quota hit, rotated key")
                import asyncio
                await asyncio.sleep(2)  # Brief pause before retry
                continue
            else:
                logger.error(f"Stage analysis failed (non-quota error): {e}", exc_info=True)
                break

    # All retries exhausted — return fallback
    logger.error(f"Stage analysis failed after {max_attempts} attempts: {last_error}")
    result = StageAnalysisResult(scene_description="Analysis failed")
    for layer in layer_images:
        result.elements.append(ElementInfo(
            layer_id=layer.get("id", ""),
            name_vi=layer.get("label", "unknown"),
            name_en=layer.get("label", "unknown"),
            category="other",
        ))
    # Restore original model
    config.vision_model = original_model
    return result


# ══════════════════════════════════════════════
#  VISION AI CALLS
# ══════════════════════════════════════════════

async def _call_gemini_multi_image(
    system_prompt: str,
    user_message: str,
    images_base64: list[str],
    config: Any,
) -> str:
    """Call Gemini Vision API with multiple images."""
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=config.api_key)

    # Build multimodal content: text + all images
    contents = [user_message]
    for i, img_b64 in enumerate(images_base64):
        if img_b64:
            image_data = base64.b64decode(img_b64)
            image_part = types.Part.from_bytes(data=image_data, mime_type="image/png")
            contents.append(f"Element {i}:")
            contents.append(image_part)

    response = await client.aio.models.generate_content(
        model=config.vision_model,
        contents=contents,
        config=types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=0.3,
            response_mime_type="application/json",
        ),
    )

    return response.text


async def _call_openai_multi_image(
    system_prompt: str,
    user_message: str,
    images_base64: list[str],
    config: Any,
) -> str:
    """Call OpenAI Vision API with multiple images."""
    import openai

    client = openai.AsyncOpenAI(api_key=config.api_key)

    # Build content with images
    content = [{"type": "text", "text": user_message}]
    for img_b64 in images_base64:
        if img_b64:
            content.append({
                "type": "image_url",
                "image_url": {"url": f"data:image/png;base64,{img_b64}", "detail": "low"},
            })

    response = await client.chat.completions.create(
        model=config.vision_model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": content},
        ],
        temperature=0.3,
        response_format={"type": "json_object"},
    )

    return response.choices[0].message.content


# ══════════════════════════════════════════════
#  PARSER
# ══════════════════════════════════════════════

def _parse_analysis_result(
    raw_json: str,
    layer_images: list[dict],
) -> StageAnalysisResult:
    """Parse LLM JSON response into StageAnalysisResult."""
    try:
        data = json.loads(raw_json)
    except json.JSONDecodeError:
        # Try to extract JSON from markdown code block
        import re
        match = re.search(r'```(?:json)?\s*([\s\S]*?)```', raw_json)
        if match:
            data = json.loads(match.group(1))
        else:
            raise ValueError(f"Could not parse JSON response: {raw_json[:200]}")

    result = StageAnalysisResult(
        scene_description=data.get("scene_description", ""),
        scene_type=data.get("scene_type", ""),
        mood=data.get("mood", ""),
    )

    elements = data.get("elements", [])
    for i, el_data in enumerate(elements):
        layer_id = ""
        if i < len(layer_images):
            layer_id = layer_images[i].get("id", "")

        result.elements.append(ElementInfo(
            layer_id=el_data.get("layer_id", layer_id),
            name_vi=el_data.get("name_vi", ""),
            name_en=el_data.get("name_en", ""),
            category=el_data.get("category", "other"),
            description=el_data.get("description", ""),
            can_stand_on=el_data.get("can_stand_on", False),
            can_sit_on=el_data.get("can_sit_on", False),
            is_background=el_data.get("is_background", False),
            suggested_z=el_data.get("suggested_z", i),
            bbox_x=el_data.get("bbox_x", 0.0),
            bbox_y=el_data.get("bbox_y", 0.0),
            bbox_w=el_data.get("bbox_w", 100.0),
            bbox_h=el_data.get("bbox_h", 100.0),
        ))

    return result
