"""
Reviewer Agent — Vision AI Review + Corrections

Receives:
- SceneContext (from scene_analyzer)
- Screenshot of rendered preview (base64)
- Original user prompt

Sends to Vision AI → Gets feedback + corrections list.
"""

from __future__ import annotations

import json
import logging
import base64
from dataclasses import dataclass, field
from typing import Any

from backend.core.ai_config import get_ai_config

logger = logging.getLogger(__name__)


# ══════════════════════════════════════════════
#  REVIEW RESULT
# ══════════════════════════════════════════════

@dataclass
class Correction:
    node_id: str = ""
    field: str = ""
    old_value: Any = None
    new_value: Any = None
    reason: str = ""

    def to_dict(self) -> dict:
        return {
            "node_id": self.node_id,
            "field": self.field,
            "old_value": self.old_value,
            "new_value": self.new_value,
            "reason": self.reason,
        }


@dataclass
class ReviewResult:
    approved: bool = False
    round: int = 1
    feedback: str = ""
    corrections: list[Correction] = field(default_factory=list)
    score: int = 0  # 1-10 quality score

    def to_dict(self) -> dict:
        return {
            "approved": self.approved,
            "round": self.round,
            "feedback": self.feedback,
            "corrections": [c.to_dict() for c in self.corrections],
            "score": self.score,
        }


# ══════════════════════════════════════════════
#  REVIEW SYSTEM PROMPT
# ══════════════════════════════════════════════

REVIEWER_SYSTEM_PROMPT = """You are a professional anime scene reviewer with expert knowledge of composition, cinematography, and visual storytelling.

You are reviewing an anime scene that was automatically generated. You have:
1. A screenshot/rendering of the scene
2. The scene's technical data (character positions, z-index, camera, background)
3. The original prompt that the user wrote

## Your Tasks
1. **Evaluate** the scene composition (score 1-10)
2. **Identify issues** with character placement, scaling, overlapping, z-ordering
3. **Suggest corrections** as specific field changes

## Common Issues to Check
- Characters overlapping or too close together
- Characters positioned off-screen or partially cut off
- Incorrect z-ordering (character behind background element)
- Scale too large/small for the scene type (close-up vs wide shot)
- Unnatural character placement (floating, too low/high)
- Poor visual balance (all characters on one side)
- Camera settings not matching the scene mood

## Position Reference (1920x1080 canvas)
- Center: (960, 540)
- Standing characters feet: y ≈ 700-850
- Characters should have x between 100-1820 (at minimum 100px from edge)
- Scale 1.0 = normal, 0.5 = far away, 1.5 = close up

## Response Format
Return ONLY valid JSON (no markdown):
{
  "approved": true/false,
  "score": 1-10,
  "feedback": "Description of issues found or praise for good composition",
  "corrections": [
    {
      "node_id": "the node's id",
      "field": "posX",
      "old_value": 100,
      "new_value": 400,
      "reason": "Character was too close to the left edge"
    }
  ]
}

If the scene looks good (score >= 7), set approved=true and corrections=[].
If specific node_ids are not available, use the character name as node_id and the builder will match it.
"""


# ══════════════════════════════════════════════
#  REVIEWER AGENT
# ══════════════════════════════════════════════

async def review_scene(
    scene_context_text: str,
    screenshot_base64: str | None,
    original_prompt: str,
    nodes: list[dict],
    review_round: int = 1,
) -> ReviewResult:
    """
    Review a scene using Vision AI.

    Args:
        scene_context_text: The arrangement_description from SceneContext
        screenshot_base64: Base64-encoded screenshot of the rendered scene (optional)
        original_prompt: The user's original scene description
        nodes: Current workflow nodes (for node_id mapping)
        review_round: Current review iteration number

    Returns:
        ReviewResult with approval status, feedback, and corrections
    """
    config = get_ai_config()

    # Build the text context
    user_message = f"""## Original Scene Request
{original_prompt}

## Current Scene Layout (Round {review_round})
{scene_context_text}

## Node IDs for Corrections
{_build_node_id_reference(nodes)}

Please review the scene and provide your assessment:"""

    # Call Vision AI
    if screenshot_base64 and config.provider == "gemini":
        raw_json = await _call_gemini_vision(
            system_prompt=REVIEWER_SYSTEM_PROMPT,
            user_message=user_message,
            image_base64=screenshot_base64,
            config=config,
        )
    elif screenshot_base64 and config.provider == "openai":
        raw_json = await _call_openai_vision(
            system_prompt=REVIEWER_SYSTEM_PROMPT,
            user_message=user_message,
            image_base64=screenshot_base64,
            config=config,
        )
    else:
        # Fallback: text-only review (no screenshot)
        raw_json = await _call_text_review(
            system_prompt=REVIEWER_SYSTEM_PROMPT,
            user_message=user_message,
            config=config,
        )

    # Parse result
    result = _parse_review_result(raw_json, review_round)

    logger.info(
        f"[Reviewer] Round {review_round}: "
        f"{'✅ APPROVED' if result.approved else '❌ NEEDS CORRECTIONS'} "
        f"(score: {result.score}/10, {len(result.corrections)} corrections)"
    )

    return result


# ══════════════════════════════════════════════
#  VISION AI CALLS
# ══════════════════════════════════════════════

async def _call_gemini_vision(
    system_prompt: str,
    user_message: str,
    image_base64: str,
    config: Any,
) -> str:
    """Call Gemini Vision API with screenshot."""
    import google.generativeai as genai

    genai.configure(api_key=config.api_key)
    model = genai.GenerativeModel(
        config.vision_model,
        system_instruction=system_prompt,
    )

    # Build multimodal content
    image_data = base64.b64decode(image_base64)
    image_part = {
        "mime_type": "image/png",
        "data": image_data,
    }

    response = await model.generate_content_async(
        [user_message, image_part],
        generation_config=genai.types.GenerationConfig(
            temperature=0.3,  # Lower temp for analytical review
            response_mime_type="application/json",
        ),
    )

    return response.text


async def _call_openai_vision(
    system_prompt: str,
    user_message: str,
    image_base64: str,
    config: Any,
) -> str:
    """Call OpenAI Vision API with screenshot."""
    import openai

    client = openai.AsyncOpenAI(api_key=config.api_key)

    response = await client.chat.completions.create(
        model=config.vision_model,
        messages=[
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": user_message},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/png;base64,{image_base64}",
                            "detail": "high",
                        },
                    },
                ],
            },
        ],
        temperature=0.3,
        response_format={"type": "json_object"},
    )

    return response.choices[0].message.content or "{}"


async def _call_text_review(
    system_prompt: str,
    user_message: str,
    config: Any,
) -> str:
    """Fallback: text-only review without screenshot."""
    if config.provider == "gemini":
        import google.generativeai as genai
        genai.configure(api_key=config.api_key)
        model = genai.GenerativeModel(
            config.model,
            system_instruction=system_prompt,
        )
        response = await model.generate_content_async(
            user_message,
            generation_config=genai.types.GenerationConfig(
                temperature=0.3,
                response_mime_type="application/json",
            ),
        )
        return response.text

    elif config.provider == "openai":
        import openai
        client = openai.AsyncOpenAI(api_key=config.api_key)
        response = await client.chat.completions.create(
            model=config.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            temperature=0.3,
            response_format={"type": "json_object"},
        )
        return response.choices[0].message.content or "{}"

    return '{"approved": true, "score": 5, "feedback": "No AI configured", "corrections": []}'


# ══════════════════════════════════════════════
#  HELPERS
# ══════════════════════════════════════════════

def _build_node_id_reference(nodes: list[dict]) -> str:
    """Build a reference table of node IDs → names for the reviewer."""
    lines = []
    for node in nodes:
        node_id = node.get("id", "")
        node_type = node.get("type", "")
        label = node.get("data", {}).get("label", "")
        name = node.get("data", {}).get("characterName", "") or label
        if node_type != "scene":
            lines.append(f"  {node_id} ({node_type}): {name}")
    return "\n".join(lines) if lines else "  No nodes available"


def _parse_review_result(raw_json: str, review_round: int) -> ReviewResult:
    """Parse LLM JSON response into ReviewResult."""
    text = raw_json.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines)

    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        logger.error(f"[Reviewer] Failed to parse JSON: {text[:200]}")
        return ReviewResult(
            approved=False,
            round=review_round,
            feedback="Failed to parse review response",
            score=0,
        )

    corrections = []
    for c in data.get("corrections", []):
        corrections.append(Correction(
            node_id=c.get("node_id", ""),
            field=c.get("field", ""),
            old_value=c.get("old_value"),
            new_value=c.get("new_value"),
            reason=c.get("reason", ""),
        ))

    return ReviewResult(
        approved=data.get("approved", False),
        round=review_round,
        feedback=data.get("feedback", ""),
        corrections=corrections,
        score=data.get("score", 0),
    )
