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


# ══════════════════════════════════════════════
#  AUTO-ACTING SCRIPT ANALYZER (Task 4.1)
# ══════════════════════════════════════════════

AVAILABLE_POSES = [
    "站立", "打招呼", "坐着", "逃跑", "疑惑", "手指向前", "介绍", "举手", 
    "举起拳头", "出拳", "抱胸", "叉腰", "摊开手", "捂嘴", "摸摸头", "祈祷", 
    "拱手", "接电话", "请进", "偷笑", "抱头", "勾手指", "坐姿思考", "指责"
]

AVAILABLE_FACES = [
    "微笑", "大笑", "说话", "大吼", "难过", "害怕", "惊讶", "无表情", 
    "害羞", "自信", "疑惑", "冷漠", "感动", "尴尬", "崇拜", "打哈欠", 
    "流泪", "震惊", "笑嘻嘻", "皱眉"
]

AVAILABLE_MOVEMENTS = [
    "enter_left", "enter_right", "exit_left", "exit_right", 
    "walk_to_center", "step_forward", "step_back", "idle"
]

class ScriptAnalyzerAgent:
    @staticmethod
    def analyze(script_lines: list[dict[str, str]]) -> list[dict[str, str]]:
        try:
            from google import genai
            from google.genai import types
        except ImportError as e:
            logger.error(f"google-genai pkg not installed. Using heuristic. {e}")
            return []
        
        config = get_ai_config()
        if not config.has_api_key:
            logger.warning("No API key. Falling back to heuristic.")
            return []
            
        if not script_lines:
            return []

        prompt = "Phân tích đoạn thoại và chỉ dẫn sân khấu (trong ngoặc vuông) sau. Trả về JSON form chứa một list các object [{'target_character':'', 'emotion':'', 'action':'', 'pose_name':'', 'face_name':'', 'movement':''}]. \n"
        prompt += "1. 'target_character': Tên nhân vật đang thực hiện hành động hoặc nói trong dòng đó (quan trọng cho chỉ dẫn sân khấu như '[Hoa đi vào]').\n"
        prompt += "2. Nếu có chỉ báo sân khấu như [đi vào], [rời đi], [tiến tới], hãy gán 'movement' tương ứng. Nếu không, gán 'idle'.\n"
        prompt += f"Poses: {', '.join(AVAILABLE_POSES)}\nFaces: {', '.join(AVAILABLE_FACES)}\nMovements: {', '.join(AVAILABLE_MOVEMENTS)}\n\nThoại:\n"
        for i, line in enumerate(script_lines):
            char_part = line.get('character', '')
            text_part = line.get('text', '')
            prompt += f"{i+1} - {char_part}: {text_part}\n"

        max_attempts = config.total_keys if config.total_keys > 0 else 1
        for attempt in range(max_attempts):
            try:
                client = genai.Client(api_key=config.api_key)
                
                # Check available models
                available_models = [m.name.split('/')[-1] for m in client.models.list() if "generateContent" in str(getattr(m, "supported_generation_methods", [])) or "generateContent" in str(getattr(m, "supported_actions", []))]
                
                # Select a fast flash model that is actually supported
                target_model = None
                for candidate in ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-flash-latest"]:
                    if candidate in available_models or f"models/{candidate}" in [m.name for m in client.models.list()]:
                        target_model = candidate
                        break
                        
                if not target_model:
                    target_model = available_models[0] if available_models else "gemini-2.0-flash"
                
                logger.info(f"Using dynamically loaded model: {target_model}")
                    
                response = client.models.generate_content(
                    model=target_model,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        temperature=0.4,
                        response_mime_type="application/json"
                    )
                )
                
                result = json.loads(response.text)
                if isinstance(result, list) and len(result) == len(script_lines):
                    for item in result:
                        if item.get("pose_name") not in AVAILABLE_POSES:
                            item["pose_name"] = "站立"
                        if item.get("face_name") not in AVAILABLE_FACES:
                            item["face_name"] = "微笑"
                    return result
                return []
            except Exception as e:
                msg = str(e).lower()
                if "429" in msg or "quota" in msg or "resource_exhausted" in msg:
                    if config.rotate_key() and attempt < max_attempts - 1:
                        logger.warning(f"Key rotated due to quota limit: {e}")
                        continue
                logger.error(f"ScriptAnalyzerAgent failed on attempt {attempt}: {e}")
                return []
        return []
