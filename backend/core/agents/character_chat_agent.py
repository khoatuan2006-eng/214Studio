"""
Character Chat Agent — Conversational AI for editing character animation.

Users chat in natural language (e.g. "Make the character fly up at second 5")
and the AI returns structured updates (keyframes, poses, expressions) that
can be applied directly to the character node.

Reuses the same output format as character_agent.py so the frontend can
apply updates using existing handleAISuggest logic.
"""

from __future__ import annotations
import json
import logging
from dataclasses import dataclass, field
from typing import Any

from ..ai_config import get_ai_config

logger = logging.getLogger(__name__)


# ══════════════════════════════════════════════
#  RESULT TYPE
# ══════════════════════════════════════════════

@dataclass
class CharacterChatResult:
    """Result from a chat interaction — partial updates + AI message."""
    ai_message: str = ""
    updates: dict = field(default_factory=dict)  # Same format as CharacterSuggestionResult
    validation_warnings: list[dict] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "ai_message": self.ai_message,
            "updates": self.updates,
            "validation_warnings": self.validation_warnings,
        }


# ══════════════════════════════════════════════
#  SYSTEM PROMPT
# ══════════════════════════════════════════════

CHARACTER_CHAT_SYSTEM_PROMPT = """Bạn là trợ lý đạo diễn riêng cho nhân vật trong phim hoạt hình 2D.
Người dùng sẽ yêu cầu thay đổi animation bằng ngôn ngữ tự nhiên.

## NHIỆM VỤ
1. HIỂU yêu cầu người dùng (di chuyển, đổi pose, thay biểu cảm, thêm keyframe...)
2. Phân tích TRẠNG THÁI HIỆN TẠI của nhân vật
3. Trả về JSON chứa CHỈ CÁC THAY ĐỔI cần thiết (partial update)

## HỆ TỌA ĐỘ
Canvas: {canvas_width}×{canvas_height} pixel. Gốc (0,0) ở góc TRÊN-TRÁI.
- x: 0=trái, {canvas_width}=phải, {mid_x}=giữa
- y: 0=trên, {canvas_height}=dưới (y là VỊ TRÍ CHÂN nhân vật, bottom anchor)
- scale: kích thước (pixel). scale=960 → nhân vật cao ~480px. Phổ biến: 500-900

## DANH SÁCH POSE/BIỂU CẢM CÓ SẴN
{layer_catalog}

## QUY TẮC CHỌN POSE/BIỂU CẢM
- PHẢI chọn ĐÚNG TÊN từ danh sách trên, KHÔNG tự nghĩ ra
- Mỗi PoseFrame chọn 1 asset từ MỖI nhóm
- Nếu nhóm có cả "表情" và "豆豆眼表情" → chỉ chọn 1 trong 2

## HỆ THỐNG KEYFRAME (5 TRACK ĐỘC LẬP)
1. position_keyframes: [{{"time": giây, "x": px, "y": px}}]
2. scale_keyframes: [{{"time": giây, "scale": px}}]
3. rotation_keyframes: [{{"time": giây, "rotation": độ}}]
4. z_index_keyframes: [{{"time": giây, "z": 0-100}}]
5. flip_x_keyframes: [{{"time": giây, "flipX": bool}}]

## OUTPUT FORMAT
Trả về JSON gồm 2 phần:
{{
  "ai_message": "Giải thích ngắn gọn những gì đã thay đổi (tiếng Việt)",
  "updates": {{
    // CHỈ bao gồm những field CẦN THAY ĐỔI, bỏ qua field không đổi
    "suggested_position": {{"x": 500, "y": 864, "z": 15, "scale": 900}},
    "flip_x": false,
    "pose_frames": [
      {{
        "duration": 3.0,
        "layers": {{"动作": "tên_pose", "表情": "tên_biểu_cảm"}},
        "transition": "cut",
        "description": "Mô tả hành động"
      }}
    ],
    "position_keyframes": [...],
    "scale_keyframes": [...],
    "rotation_keyframes": [...],
    "z_index_keyframes": [...],
    "flip_x_keyframes": [...]
  }}
}}

## QUY TẮC QUAN TRỌNG
- CHỈ trả về fields cần thay đổi trong "updates". VD: nếu chỉ đổi biểu cảm → chỉ trả "pose_frames"
- Nếu người dùng hỏi chung (ví dụ: "có gì sửa được?") → trả ai_message giải thích, updates rỗng {{}}
- Khi sửa keyframes → trả lại TOÀN BỘ mảng keyframe (không partial)
- Khi sửa pose_frames → trả lại TOÀN BỘ sequence
- Luôn trả JSON hợp lệ, KHÔNG text nào khác ngoài JSON
"""


# ══════════════════════════════════════════════
#  MAIN FUNCTION
# ══════════════════════════════════════════════

async def chat_with_character(
    message: str,
    character_name: str,
    current_state: dict,
    layer_catalog: dict[str, list[str]],
    chat_history: list[dict] | None = None,
    canvas_width: int = 1920,
    canvas_height: int = 1080,
    model: str | None = None,
) -> CharacterChatResult:
    """
    Process a chat message about a character and return structured updates.

    Args:
        message: User's natural language request
        character_name: Name of the character
        current_state: Current node data (posX, posY, scale, sequence, keyframes, etc.)
        layer_catalog: {groupName: [assetName1, assetName2, ...]}
        chat_history: Previous messages [{role, content}, ...]
        canvas_width/height: Canvas dimensions
        model: Override AI model

    Returns:
        CharacterChatResult with ai_message and structured updates
    """
    config = get_ai_config()
    api_key = config.api_key
    if not api_key:
        return CharacterChatResult(
            ai_message="Chưa cấu hình API key. Vào Settings → AI để thêm key.",
            updates={},
        )

    use_model = model or config.model_name or "gemini-2.0-flash"

    # Build layer catalog text
    catalog_text = ""
    for group_name, assets in layer_catalog.items():
        catalog_text += f"\n### [{group_name}]\n"
        catalog_text += ", ".join(assets)
        catalog_text += "\n"

    # Build system prompt
    system_prompt = CHARACTER_CHAT_SYSTEM_PROMPT.format(
        canvas_width=canvas_width,
        canvas_height=canvas_height,
        mid_x=canvas_width // 2,
        layer_catalog=catalog_text,
    )

    # Build current state description
    state_text = f"""## TRẠNG THÁI HIỆN TẠI CỦA NHÂN VẬT: {character_name}
- Vị trí: x={current_state.get('posX', 960)}, y={current_state.get('posY', 540)}
- Scale: {current_state.get('scale', 960)}
- zIndex: {current_state.get('zIndex', 10)}
- FlipX: {current_state.get('flipX', False)}
- StartDelay: {current_state.get('startDelay', 0)}s
- Opacity: {current_state.get('opacity', 1)}
"""

    # Add current keyframes
    if current_state.get('positionKeyframes'):
        state_text += f"\n### Position Keyframes:\n{json.dumps(current_state['positionKeyframes'], ensure_ascii=False)}\n"
    if current_state.get('scaleKeyframes'):
        state_text += f"\n### Scale Keyframes:\n{json.dumps(current_state['scaleKeyframes'], ensure_ascii=False)}\n"
    if current_state.get('rotationKeyframes'):
        state_text += f"\n### Rotation Keyframes:\n{json.dumps(current_state['rotationKeyframes'], ensure_ascii=False)}\n"
    if current_state.get('flipXKeyframes'):
        state_text += f"\n### FlipX Keyframes:\n{json.dumps(current_state['flipXKeyframes'], ensure_ascii=False)}\n"

    # Add current sequence (pose frames)
    if current_state.get('sequence'):
        seq_summary = []
        for i, frame in enumerate(current_state['sequence']):
            desc = frame.get('description', '')
            dur = frame.get('duration', 1)
            seq_summary.append(f"  Frame {i+1}: {dur}s - {desc}")
        state_text += f"\n### Pose Sequence:\n" + "\n".join(seq_summary) + "\n"

    # Add script actions
    if current_state.get('scriptActions'):
        state_text += f"\n### Script Actions:\n{json.dumps(current_state['scriptActions'], ensure_ascii=False, indent=2)}\n"

    # Build messages for Gemini
    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)

        contents = []

        # Add chat history
        if chat_history:
            for msg in chat_history[-10:]:  # Keep last 10 messages
                role = "user" if msg.get("role") == "user" else "model"
                contents.append(types.Content(
                    role=role,
                    parts=[types.Part.from_text(text=msg.get("content", ""))],
                ))

        # Add current user message with state context
        user_content = f"{state_text}\n\n## YÊU CẦU CỦA NGƯỜI DÙNG:\n{message}"
        contents.append(types.Content(
            role="user",
            parts=[types.Part.from_text(text=user_content)],
        ))

        response = await client.aio.models.generate_content(
            model=use_model,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                temperature=0.3,
                max_output_tokens=4096,
            ),
        )

        raw = response.text.strip()
        return _parse_response(raw)

    except Exception as e:
        logger.error(f"Character chat failed: {e}", exc_info=True)
        return CharacterChatResult(
            ai_message=f"Lỗi AI: {str(e)[:200]}",
            updates={},
        )


def _parse_response(raw: str) -> CharacterChatResult:
    """Parse AI response into CharacterChatResult."""
    # Clean up markdown code blocks
    text = raw
    if "```json" in text:
        text = text.split("```json", 1)[1]
        if "```" in text:
            text = text.split("```", 1)[0]
    elif "```" in text:
        text = text.split("```", 1)[1]
        if "```" in text:
            text = text.split("```", 1)[0]

    text = text.strip()

    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        # Try to extract JSON from the response
        import re
        json_match = re.search(r'\{[\s\S]*\}', text)
        if json_match:
            try:
                data = json.loads(json_match.group())
            except json.JSONDecodeError:
                return CharacterChatResult(
                    ai_message=raw[:500],
                    updates={},
                )
        else:
            return CharacterChatResult(
                ai_message=raw[:500],
                updates={},
            )

    ai_message = data.get("ai_message", "Đã cập nhật.")
    updates = data.get("updates", {})

    return CharacterChatResult(
        ai_message=ai_message,
        updates=updates,
    )
