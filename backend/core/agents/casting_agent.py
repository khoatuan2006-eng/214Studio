"""
CastingAgent — AI-powered character-to-asset mapping.

Uses Gemini to semantically match script character names (e.g. "Nam", "Cô gái")
to the actual asset registry IDs (e.g. "Q版蓝色挑染男_1761648268637").
"""

import json
import logging
from backend.core.ai_config import get_ai_config

logger = logging.getLogger(__name__)

CASTING_PROMPT = """Bạn là Giám đốc Tuyển vai (Casting Director). Nhiệm vụ của bạn là gán các nhân vật trong Kịch bản (Script) vào danh sách các Diễn viên/Model đang có (Registry).
Bạn phải tự đoán giới tính, vai vế và tính cách dựa vào TÊN nhân vật trong kịch bản, và tìm mục tiêu PHÙ HỢP NHẤT trong Registry (có thể dùng tiếng Trung/Anh).
Không bao giờ tự bịa ID mới. CHỈ lấy ID nằm trong danh sách Registry.
Mỗi nhân vật trong kịch bản PHẢI được gán cho MỘT diễn viên duy nhất.
Nếu có nhiều nhân vật hơn diễn viên, có thể gán nhiều nhân vật cho cùng một diễn viên, nhưng ưu tiên đa dạng.

DANH SÁCH DIỄN VIÊN HIỆN CÓ:
{available_registry}

NHÂN VẬT KỊCH BẢN CẦN GÁN:
{script_characters}

BẮT BUỘC TRẢ VỀ ĐỊNH DẠNG JSON EXACTLY:
{{
    "Tên NV Kịch Bản 1": "ID Diễn viên phù hợp nhất",
    "Tên NV Kịch Bản 2": "ID Diễn viên phù hợp nhất"
}}
"""


class CastingAgent:
    @staticmethod
    def auto_cast(script_characters: list[str], available_characters: list[dict]) -> dict:
        """Map script character names to registry asset IDs using AI semantic matching.
        
        Args:
            script_characters: List of character names from the script (e.g. ["Nam", "Hoa"])
            available_characters: List of dicts with "id" and "name" keys from AssetRegistry
            
        Returns:
            Dict mapping script name → asset ID. Empty dict on failure.
        """
        if not script_characters or not available_characters:
            return {}

        config = get_ai_config()
        if not config.has_api_key:
            logger.warning("[CastingAgent] No API key configured, skipping AI casting.")
            return {}

        try:
            from google import genai
            from google.genai import types
        except ImportError as e:
            logger.error(f"[CastingAgent] google-genai package not installed: {e}")
            return {}

        registry_text = "\n".join(
            [f'- ID: "{c["id"]}", Tên: "{c.get("name", "")}"' for c in available_characters]
        )

        prompt = CASTING_PROMPT.format(
            available_registry=registry_text,
            script_characters=json.dumps(script_characters, ensure_ascii=False)
        )

        valid_ids = {c["id"] for c in available_characters}
        max_attempts = max(1, config.total_keys) * 2

        for attempt in range(max_attempts):
            try:
                target_model = config.get_rotated_model(attempt)
                logger.info(f"[CastingAgent] Using model: {target_model} (attempt {attempt})")

                client = genai.Client(api_key=config.api_key)
                response = client.models.generate_content(
                    model=target_model,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        temperature=0.3,
                        response_mime_type="application/json"
                    )
                )

                text = response.text.strip()
                if text.startswith("```json"):
                    text = text[7:]
                if text.endswith("```"):
                    text = text[:-3]

                result = json.loads(text.strip())

                # Validate: only keep entries whose values are real registry IDs
                valid_dict = {}
                for k, v in result.items():
                    if v in valid_ids:
                        valid_dict[k] = v
                    else:
                        logger.warning(f"[CastingAgent] Rejected hallucinated ID: '{k}' -> '{v}'")

                if valid_dict:
                    logger.info(f"[CastingAgent] Successfully mapped {len(valid_dict)} characters: {valid_dict}")
                    return valid_dict
                else:
                    logger.warning("[CastingAgent] AI returned no valid mappings, retrying...")

            except Exception as e:
                import time, re as _re
                msg = str(e).lower()
                delay = 5.0
                if any(x in msg for x in ["429", "quota", "resource_exhausted"]):
                    delay = 35.0
                m = _re.search(r'retry in (\d+\.?\d*)s', msg)
                if m:
                    delay = float(m.group(1)) + 1.0

                if config.rotate_key():
                    logger.warning(f"[CastingAgent] Key rotated after error: {e}")
                    time.sleep(1)
                    continue
                else:
                    logger.warning(f"[CastingAgent] All keys exhausted. Sleeping {delay:.1f}s. Error: {e}")
                    time.sleep(delay)
                    continue

        logger.error("[CastingAgent] All attempts exhausted, returning empty mapping.")
        return {}
