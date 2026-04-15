"""
Script Writer Agent — AI-powered auto video script generation.

Takes a user prompt and generates a short multi-character script.
"""
from __future__ import annotations
import json
import logging
from typing import Any

from backend.core.ai_config import get_ai_config

logger = logging.getLogger(__name__)

SCRIPT_WRITER_PROMPT = """Bạn là một biên kịch phim hoạt hình/anime chuyên nghiệp.
Nhiệm vụ của bạn là dựa vào phần mô tả của người dùng (Prompt) để viết ra một kịch bản ngắn (15-60 giây).

QUY ĐỊNH KỊCH BẢN:
1. Môi trường (Background Context): Xác định bối cảnh chính xác để có thể tìm được Background Asset.
2. Nhân vật tham gia: Liệt kê rõ số nhân vật cần có, đánh số NV1, NV2... kèm tính cách và vai trò.
3. Thoại và hành động:
    a) Phải được chia thành từng dòng thoại.
    b) Mỗi dòng thoại nằm trong JSON.
    c) Các hành động, biểu cảm, vị trí đứng PHẢI được xác định rõ.

LƯU Ý VỀ KHÔNG GIAN (Z-INDEX AWARENESS):
Để nhân vật có thể diễn xuất tương tác với bối cảnh, hãy thêm các chỉ dẫn sân khấu về vị trí. Ví dụ: "đứng gần xe", "ẩn sau gốc cây", "đi từ xa lại gần".

TRẢ VỀ DUY NHẤT LÀ JSON VỚI CẤU TRÚC SAU (không markdown, không text dư thừa):
{
    "title": "Tên phim/video",
    "background_context": "Từ khóa chung chung gợi ý về bối cảnh (ví dụ: bãi đỗ xe, lớp học, quán nhậu, đường phố)",
    "characters": [
        {"id": "NV1", "role": "Nhân vật chính", "description": "Nam/Nữ, trẻ/già, tính cách thế nào?"},
        {"id": "NV2", "role": "Nhân vật phụ", "description": "Nam/Nữ, đặc điểm"}
    ],
    "dialogues": [
        {
            "character_id": "NV1",
            "text": "Câu thoại sẽ được nói.",
            "emotion": "Cảm xúc (ví dụ: vui, buồn, cáu gắt, ngạc nhiên, mỉm cười)",
            "action": "Hành động (ví dụ: vẫy tay, chống nách, đứng im, bước đi)",
            "position_hint": "Gợi ý vị trí đứng. Ví dụ: 'trước xe ô tô', 'dưới gốc cây', 'đứng giữa màn hình', 'bên trái'"
        }
    ]
}

- Độ dài số lượng dòng thoại nên từ 3 đến 8 câu.
"""

class ScriptWriterAgent:
    @staticmethod
    def write_script(user_prompt: str) -> dict[str, Any] | None:
        try:
            from google import genai
            from google.genai import types
        except ImportError as e:
            logger.error(f"google-genai pkg not installed. {e}")
            return None
        
        config = get_ai_config()
        if not config.has_api_key:
            logger.warning("No API key configured for Script Writer.")
            return None
            
        full_prompt = f"{SCRIPT_WRITER_PROMPT}\n\nUSER PROMPT: {user_prompt}\n"
        
        max_attempts = config.total_keys if config.total_keys > 0 else 1
        for attempt in range(max_attempts):
            try:
                client = genai.Client(api_key=config.api_key)
                
                available_models = [m.name.split('/')[-1] for m in client.models.list() if "generateContent" in str(getattr(m, "supported_generation_methods", [])) or "generateContent" in str(getattr(m, "supported_actions", []))]
                target_model = None
                for candidate in ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-2.0-flash-lite"]:
                    if candidate in available_models or f"models/{candidate}" in [m.name for m in client.models.list()]:
                        target_model = candidate
                        break
                        
                if not target_model:
                    target_model = available_models[0] if available_models else "gemini-2.0-flash"
                    
                response = client.models.generate_content(
                    model=target_model,
                    contents=full_prompt,
                    config=types.GenerateContentConfig(
                        temperature=0.7,
                        response_mime_type="application/json"
                    )
                )
                result = json.loads(response.text)
                return result
            except Exception as e:
                msg = str(e).lower()
                if "429" in msg or "quota" in msg or "resource_exhausted" in msg:
                    if config.rotate_key() and attempt < max_attempts - 1:
                        continue
                logger.error(f"ScriptWriterAgent failed on attempt {attempt}: {e}")
                return None
        return None
