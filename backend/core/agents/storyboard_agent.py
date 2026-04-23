import json
import logging
import re
from typing import Any, List, Dict

from backend.core.ai_config import get_ai_config

logger = logging.getLogger(__name__)

STORYBOARD_PROMPT = """Bạn là một Đạo diễn Storyboard chuyên nghiệp cho phim hoạt hình (tương tự như hệ thống MangaGen).
Nhiệm vụ của bạn là nhận vào một kịch bản phim thô liền mạch, không được phân cảnh trước, và BÓC TÁCH nó thành các Trường đoạn (Sequences) hợp lý.
Mỗi Sequence là một Scene (Cảnh quay) có bối cảnh không gian và thời gian đồng nhất. Khi không gian hoặc thời gian thay đổi rõ rệt, hãy cắt sang Sequence mới.

CÁCH THỰC HIỆN:
1. Đọc và phân loại từng câu thoại vào Sequence phù hợp. TUYỆT ĐỐI KHÔNG nhận diện các dòng mô tả cảnh (VD: "Cảnh 1: ...") làm tên nhân vật.
2. Với mỗi Sequence, bạn PHẢI CHỌN 1 `background_id` phù hợp nhất từ DANH SÁCH BỐI CẢNH (Backgrounds) hệ thống cung cấp.
3. Tên Nhân vật (`character`) PHẢI được trích xuất SẠCH SẼ, TUYỆT ĐỐI KHÔNG chứa ngoặc đơn hoặc hành động đính kèm (Ví dụ: "Nam (buồn bã)" -> chỉ xuất "Nam"). Nội dung trong ngoặc đơn hãy dùng để suy luận `emotion` và `action`.
4. Nếu kịch bản có văn bản không phải thoại (mô tả hành động, bối cảnh), có thể biến nó thành thuộc tính `description` của Sequence.
5. VỚI MỖI CÂU THOẠI, bạn PHẢI phân tích và gán:
   - `emotion`: cảm xúc chủ đạo (ví dụ: happy, sad, angry, scared, surprised, thinking, excited, shy, cold, disgusted, cry, laugh, furious, embarrassed, confident, worried...)
   - `action`: hành động cơ thể (ví dụ: stand, walk, run, sit, wave, point, cross_arms, hands_on_hips, cover_mouth, pray, bow, phone, punch, fist, head_hold, beckon, scratch_head, sneak, welcome, introduce, raise_hand, shrug, flee...)
   Hãy phân tích kỹ ngữ cảnh, nội dung thoại, và dấu câu (!, ?, ...) để chọn emotion/action ĐA DẠNG và CHÍNH XÁC nhất.

DANH SÁCH BỐI CẢNH HIỆN CÓ CỦA HỆ THỐNG:
{bg_catalog}

ĐẦU VÀO KỊCH BẢN THÔ:
{script_text}

OUTPUT YÊU CẦU LÀ ĐỊNH DẠNG JSON MẢNG TƯƠNG ĐƯƠNG VỚI CÁC SEQUENCES:
[
  {
    "sequence_number": 1,
    "description": "Bữa sáng tại nhà Nam",
    "background_id": "Mã ID của background phù hợp nhất (ví dụ living_room_01)",
    "lines": [
      {
        "character": "Nam",
        "text": "Chào buổi sáng mọi người!",
        "emotion": "happy",
        "action": "wave",
        "position_hint": "Nam đi từ ngoài vào"
      },
      ...
    ]
  },
  {
    "sequence_number": 2,
    "description": "Cuộc gọi tại công ty",
    "background_id": "Mã ID của background phù hợp nhất",
    "lines": [ ... ]
  }
]
"""

class StoryboardAgent:
    @staticmethod
    def create_storyboard(script_text: str, available_backgrounds: List[Dict]) -> List[Dict] | None:
        """
        Splits a raw script text into multiple semantic sequences/scenes.
        Works like MangaGen's script-to-page model.
        """
        try:
            from google import genai
            from google.genai import types
        except ImportError as e:
            logger.error(f"google-genai pkg not installed. {e}")
            return None
            
        config = get_ai_config()
        if not config.has_api_key:
            logger.warning("No API key configured for Storyboard Agent.")
            return None

        # Format background list
        bg_lines = []
        for bg in available_backgrounds:
            bg_lines.append(f"- ID: {bg.get('id', '')} | Tên: {bg.get('name', '')}")
        bg_catalog = "\n".join(bg_lines)
        if not bg_catalog:
            bg_catalog = "- (Chưa có list nền nào, hãy tạo dummy background_id như 'default_bg')"

        full_prompt = STORYBOARD_PROMPT.replace("{bg_catalog}", bg_catalog).replace("{script_text}", script_text)

        max_attempts = max(1, config.total_keys) * 4
        for attempt in range(max_attempts):
            try:
                client = genai.Client(api_key=config.api_key)
                
                # Rotate models dynamically from user's API Key supported list
                target_model = config.get_rotated_model(attempt)
                logger.info(f"Using model: {target_model} (attempt {attempt})")

                response = client.models.generate_content(
                    model=target_model,
                    contents=full_prompt,
                    config=types.GenerateContentConfig(
                        temperature=0.4,
                        response_mime_type="application/json"
                    )
                )
                
                text = response.text.strip()
                if text.startswith("```json"):
                    text = text[7:]
                if text.endswith("```"):
                    text = text[:-3]
                    
                result = json.loads(text.strip())
                logger.info(f"Storyboard Agent successfully created {len(result)} sequences.")
                return result
                
            except Exception as e:
                msg = str(e).lower()
                if any(k in msg for k in ["429", "quota", "resource_exhausted", "503", "unavailable", "ssl", "eof", "connection", "timeout", "protocol"]):
                    # Parse delay time from error message, fallback to 35s for quota, 5s for network
                    import re, time
                    delay = 35.0 if ("429" in msg or "quota" in msg or "resource_exhausted" in msg) else 5.0
                    m = re.search(r'retry in (\d+\.?\d*)s', msg)
                    if m:
                        delay = float(m.group(1)) + 1.0

                    if config.rotate_key():
                        logger.warning(f"Key rate limited/unavailable/network error. Rotating... Next attempt: {attempt + 1}")
                        time.sleep(1)
                        continue
                    else:
                        logger.warning(f"All keys exhausted or network error. Sleeping {delay:.1f}s before retrying for StoryboardAgent...")
                        time.sleep(delay)
                        continue
                logger.error(f"StoryboardAgent failed on attempt {attempt}: {e}")
                return None
        return None
