"""
Script Analyzer Agent — AI-powered dialogue/script analysis.

Takes SRT content and uses Gemini to:
1. Identify characters from dialogue context
2. Assign each dialogue line to a character
3. Suggest poses/actions/emotions per timestamp
"""

from __future__ import annotations
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
class CharacterAction:
    """A single action/pose suggestion for a character at a specific time."""
    start_time: float = 0.0
    end_time: float = 0.0
    dialogue: str = ""
    emotion: str = "neutral"
    pose: str = "standing"
    action: str = "idle"
    face_direction: str = "front"
    description: str = ""

    def to_dict(self) -> dict:
        return {
            "start_time": self.start_time,
            "end_time": self.end_time,
            "dialogue": self.dialogue,
            "emotion": self.emotion,
            "pose": self.pose,
            "action": self.action,
            "face_direction": self.face_direction,
            "description": self.description,
        }


@dataclass
class ScriptCharacter:
    """A character identified from the script."""
    id: str = ""
    name: str = ""
    role: str = ""  # narrator, protagonist, antagonist, supporting, etc.
    gender: str = "unknown"
    description: str = ""
    actions: list[CharacterAction] = field(default_factory=list)
    color: str = "#6366f1"  # UI color for this character

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "role": self.role,
            "gender": self.gender,
            "description": self.description,
            "color": self.color,
            "actions": [a.to_dict() for a in self.actions],
        }


@dataclass
class ScriptAnalysisResult:
    """Full analysis result for a script."""
    title: str = ""
    summary: str = ""
    characters: list[ScriptCharacter] = field(default_factory=list)
    scene_description: str = ""
    total_duration: float = 0.0

    def to_dict(self) -> dict:
        return {
            "title": self.title,
            "summary": self.summary,
            "characters": [c.to_dict() for c in self.characters],
            "scene_description": self.scene_description,
            "total_duration": self.total_duration,
        }


# ══════════════════════════════════════════════
#  SYSTEM PROMPT
# ══════════════════════════════════════════════

SCRIPT_ANALYZER_PROMPT = """Bạn là một đạo diễn phim hoạt hình chuyên nghiệp. Nhiệm vụ của bạn là phân tích kịch bản (dạng SRT subtitle) và xác định:

1. **Nhân vật**: Ai đang nói trong mỗi câu thoại (dựa vào ngữ cảnh, nội dung, giọng điệu)
2. **Hành động/Tư thế**: Đề xuất tư thế, hành động, biểu cảm cho từng nhân vật ở từng đoạn thời gian
3. **Cảm xúc**: Nhận diện cảm xúc từ nội dung lời thoại

## QUY TẮC NHẬN DIỆN NHÂN VẬT (CỰC KỲ QUAN TRỌNG)

### PHẢI TÁCH TỪNG CÁ NHÂN — KHÔNG GỘP NHÓM
- Nếu kịch bản nhắc "Akatsuki" → PHẢI liệt kê từng thành viên xuất hiện (Pain, Itachi, Konan, Deidara...)
- Nếu kịch bản nhắc "3 anh em" → tạo 3 nhân vật riêng (Anh cả, Anh hai, Em út hoặc tên cụ thể nếu có)
- Nếu kịch bản nhắc "nhóm bạn" → liệt kê từng người bạn xuất hiện
- MỖI NGƯỜI NÓI là MỘT nhân vật riêng biệt

### CÁCH XÁC ĐỊNH NHÂN VẬT
- Phân tích NỘI DUNG câu thoại: ai nói gì, xưng hô gì (tôi/ta/bọn ta, anh/em/con)
- Tìm MANH MỐI tên: "Naruto nói...", "Theo lời Pain..."
- Đếm SỐ GIỌNG NÓI khác nhau (giọng điệu, cách xưng hô)
- Nếu 1 câu thoại có nhiều người nói → tách thành actions riêng
- Khi nghi ngờ → tạo nhân vật mới thay vì gộp vào nhân vật cũ

### NHÂN VẬT KHÔNG NÓI
- Nhân vật được nhắc đến trong lời thoại CŨNG là nhân vật (tạo với actions "listening"/"idle")
- Nhân vật phản ứng (gật đầu, cười...) nhưng không nói → vẫn tạo riêng

### GÁN TÊN
- Nếu biết tên nhân vật → dùng tên chính xác
- Nếu không biết tên → gán tên mô tả cụ thể: "Cậu bé tóc vàng", "Cô gái áo đỏ", "Người đàn ông già"
- KHÔNG gán tên chung chung như "Nhân vật 1", "Người nói A" trừ khi hoàn toàn không có manh mối
- "Narrator" CHỈ dùng cho phần kể chuyện bên ngoài (người dẫn chuyện), KHÔNG phải nhân vật nói thoại

QUAN TRỌNG:
- File SRT KHÔNG có tên nhân vật, bạn phải tự suy luận từ nội dung
- ƯU TIÊN tách nhiều nhân vật hơn là gộp — sai số nhiều nhân vật < sai số ít nhân vật
- Mỗi nhân vật cần có danh sách hành động theo thời gian

Trả về JSON đúng format sau (KHÔNG có text nào khác ngoài JSON):
{
  "title": "Tên cảnh/tập",
  "summary": "Tóm tắt ngắn nội dung",
  "scene_description": "Mô tả bối cảnh, không gian",
  "characters": [
    {
      "id": "char_1",
      "name": "Tên nhân vật CỤ THỂ (không dùng tên nhóm)",
      "role": "narrator|protagonist|antagonist|supporting",
      "gender": "male|female|unknown",
      "description": "Mô tả ngắn về nhân vật, đặc điểm nhận dạng",
      "color": "#hex_color",
      "actions": [
        {
          "start_time": 0.0,
          "end_time": 2.5,
          "dialogue": "Câu thoại gốc",
          "emotion": "happy|sad|angry|surprised|neutral|scared|serious|excited",
          "pose": "standing|sitting|walking|running|pointing|arms_crossed|hands_on_hips",
          "action": "talking|listening|thinking|laughing|crying|nodding|waving|idle",
          "face_direction": "front|left|right|back",
          "description": "Mô tả hành động bằng tiếng Việt"
        }
      ]
    }
  ]
}

Quy tắc cho actions:
- Các actions phải cover toàn bộ timeline từ đầu đến cuối
- Khi nhân vật không nói, vẫn gán action "listening" hoặc "idle"
- Mỗi nhân vật có thể có nhiều actions liên tiếp
- emotion và pose phải đổi theo nội dung thoại
- Dùng màu khác nhau cho mỗi nhân vật (color)
"""


# ══════════════════════════════════════════════
#  MAIN FUNCTION
# ══════════════════════════════════════════════

async def analyze_script(srt_content: str, model: str | None = None) -> ScriptAnalysisResult:
    """Analyze SRT script using Gemini AI."""
    import google.generativeai as genai

    config = get_ai_config()
    api_key = config.api_key
    if not api_key:
        raise ValueError("No API key configured. Add a key via /api/ai/keys/add first.")

    genai.configure(api_key=api_key)

    model_name = model or config.model or "gemini-2.0-flash"
    logger.info(f"Analyzing script with model: {model_name}")

    gen_model = genai.GenerativeModel(model_name)
    prompt = f"{SCRIPT_ANALYZER_PROMPT}\n\n--- SRT CONTENT ---\n{srt_content}\n--- END ---"

    response = gen_model.generate_content(prompt)
    raw_text = response.text.strip()

    # Parse JSON from response
    result = _parse_analysis(raw_text, srt_content)
    return result


def _parse_analysis(raw_text: str, srt_content: str) -> ScriptAnalysisResult:
    """Parse AI response into ScriptAnalysisResult."""
    # Extract JSON from markdown code blocks if present
    text = raw_text
    if "```json" in text:
        text = text.split("```json")[1].split("```")[0].strip()
    elif "```" in text:
        text = text.split("```")[1].split("```")[0].strip()

    try:
        data = json.loads(text)
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse AI response: {e}\nRaw: {raw_text[:500]}")
        raise ValueError(f"AI returned invalid JSON: {e}")

    # Build result
    result = ScriptAnalysisResult(
        title=data.get("title", "Untitled"),
        summary=data.get("summary", ""),
        scene_description=data.get("scene_description", ""),
    )

    # Parse characters
    colors = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16"]
    for i, char_data in enumerate(data.get("characters", [])):
        char = ScriptCharacter(
            id=char_data.get("id", f"char_{i+1}"),
            name=char_data.get("name", f"Nhân vật {i+1}"),
            role=char_data.get("role", "supporting"),
            gender=char_data.get("gender", "unknown"),
            description=char_data.get("description", ""),
            color=char_data.get("color", colors[i % len(colors)]),
        )

        for act_data in char_data.get("actions", []):
            action = CharacterAction(
                start_time=float(act_data.get("start_time", 0)),
                end_time=float(act_data.get("end_time", 0)),
                dialogue=act_data.get("dialogue", ""),
                emotion=act_data.get("emotion", "neutral"),
                pose=act_data.get("pose", "standing"),
                action=act_data.get("action", "idle"),
                face_direction=act_data.get("face_direction", "front"),
                description=act_data.get("description", ""),
            )
            char.actions.append(action)
            if action.end_time > result.total_duration:
                result.total_duration = action.end_time

        result.characters.append(char)

    return result
