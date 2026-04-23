import json
import logging
import asyncio
from typing import Dict, Any

from google import genai
from google.genai import types

from backend.core.ai_config import get_ai_config
from backend.core.ollama_client import get_ollama_client

logger = logging.getLogger(__name__)

SWARM_CRITIC_PROMPT = """Bạn là Đặc Vụ Rà Soát (Swarm Critic Agent) đóng vai trò Quality Gate (Aegis Review) cho hệ thống AnimeStudio.
Nhiệm vụ của bạn là kiểm tra xem "Đạo diễn Môi giới (Swarm Negotiator)" đã xếp vị trí nhân vật CÓ VẤN ĐỀ HAY KHÔNG.

⚠️ QUY TẮC TỌA ĐỘ (QUAN TRỌNG):
- Hệ thống sử dụng hệ tọa độ Canvas chuẩn: X từ 0 đến 19.2, Y từ 0 đến 10.8.
- Trong `stage_analysis`, hãy sử dụng các trường `canvas_cx`, `canvas_cy`, `canvas_w`, `canvas_h` để xác định vị trí vật thể.
- TUYỆT ĐỐI KHÔNG sử dụng các trường `bbox_x`, `bbox_y` (hệ %) để so sánh với vị trí nhân vật.
- `target_x` của nhân vật nằm trong khoảng [0.0, 19.2] là HOÀN TOÀN HỢP LỆ. 
- Chỉ đánh lỗi "Out of Bounds" nếu `target_x` < 0 hoặc > 19.2.

BỐI CẢNH SÂN KHẤU (SCENE BLUEPRINT):
Đây là bản đồ ASCII và lưới không gian của sân khấu mà bạn đang kiểm tra. Hãy dựa vào đây để xác định xem nhân vật có bị trôi nổi (Floating) hay đứng vô lý trên tường/trần nhà không.
{blueprint_context}

ĐẦU VÀO SÂN KHẤU (STAGE ANALYSIS):
{stage_analysis}

ĐẦU VÀO NHÂN VẬT:
{characters_info}

VỊ TRÍ ĐƯỢC CHỌN (PROPOSED POSITIONS):
{proposed_positions}

TIÊU CHÍ RÀ SOÁT CHÍNH (FAIL NẾU VI PHẠM):
1. Overlap (Đè Hình): Nếu 2 nhân vật có `target_x` cách nhau nhỏ hơn 2.5, nhưng LẠI CÓ CÙNG `z_index`.
2. Floating (Trôi Nổi): Nếu nhân vật đứng ở khu vực không có vật thể hỗ trợ (Sàn, ghế, v.v.) dựa trên `canvas_cx` và `z_index`.
3. Out of Bounds (Lố Khung Hình): `target_x` bé hơn 0 hoặc lớn hơn 19.2.

KẾT QUẢ TRẢ VỀ:
Trả về DUY NHẤT một cục JSON, định dạng:
{
  "status": "PASS" hoặc "FAIL",
  "score": Điểm số từ 1-10,
  "feedback": "Nhận xét chi tiết. Nếu Fail, nói rõ lý do dựa trên tọa độ Canvas (0-19.2)."
}
"""

class SwarmCriticAgent:
    @staticmethod
    async def review_positions_with_local(
        characters_info: list[Dict[str, Any]], 
        stage_analysis: Dict[str, Any], 
        proposed_positions: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Try local Ollama first for Aegis Review, fallback to Gemini if needed.
        Ollama is optional - system works fine without it.
        """
        try:
            ollama = get_ollama_client()
            
            # Try local first (with timeout to avoid blocking)
            if await ollama.is_available():
                logger.info("[Aegis] Using local Ollama for Critic review...")
                result = await SwarmCriticAgent._try_local_critic(
                    ollama, characters_info, stage_analysis, proposed_positions
                )
                if result:
                    return result
                logger.debug("[Aegis] Local Ollama failed, using Gemini...")
        except Exception as e:
            logger.debug(f"[Aegis] Local Ollama unavailable ({e}), using Gemini...")
        
        # Fallback to Cloud API
        return SwarmCriticAgent.review_positions(characters_info, stage_analysis, proposed_positions)

    @staticmethod
    async def _try_local_critic(
        ollama,
        characters_info: list[Dict[str, Any]], 
        stage_analysis: Dict[str, Any], 
        proposed_positions: Dict[str, Any]
    ) -> Dict[str, Any] | None:
        """Internal method to call local Ollama for Critic."""
        try:
            stage_desc = json.dumps(stage_analysis, ensure_ascii=False, indent=2)
            char_desc = json.dumps(characters_info, ensure_ascii=False, indent=2)
            pos_desc = json.dumps(proposed_positions, ensure_ascii=False, indent=2)

            blueprint_data = {
                "ascii_map": stage_analysis.get("ascii_map", []),
                "spatial_grid": stage_analysis.get("spatial_grid", {})
            } if stage_analysis else {}
            blueprint_desc = json.dumps(blueprint_data, ensure_ascii=False, indent=2) if blueprint_data else "Không có dữ liệu bản đồ."

            full_prompt = SWARM_CRITIC_PROMPT.replace(
                "{stage_analysis}", stage_desc
            ).replace(
                "{characters_info}", char_desc
            ).replace(
                "{proposed_positions}", pos_desc
            ).replace(
                "{blueprint_context}", blueprint_desc
            )
            
            response = await ollama.generate(
                prompt=full_prompt,
                temperature=0.2,
                json_mode=True
            )
            
            if response:
                try:
                    import re
                    clean_text = response.strip()
                    # Try to extract from markdown blocks first
                    match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", clean_text, re.DOTALL)
                    if match:
                        clean_text = match.group(1)
                    else:
                        # Fallback to finding anything that looks like a JSON object
                        match = re.search(r"(\{.*?\})", clean_text, re.DOTALL)
                        if match:
                            clean_text = match.group(1)
                            
                    result = json.loads(clean_text)
                    logger.info(f"[Aegis] Local Critic Review Complete: {result.get('status')} (Score: {result.get('score')})")
                    return result
                except json.JSONDecodeError:
                    logger.warning(f"[Aegis] Local Critic returned invalid JSON: {response}")
                    return None
        except Exception as e:
            logger.error(f"[Aegis] Local Critic failed: {e}")
            return None

    @staticmethod
    def review_positions(
        characters_info: list[Dict[str, Any]], 
        stage_analysis: Dict[str, Any], 
        proposed_positions: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Runs a Quality Gate check on the proposed positions using Gemini.
        Returns a dictionary with 'status', 'score', and 'feedback'.
        """
        config = get_ai_config()

        import json
        stage_desc = json.dumps(stage_analysis, ensure_ascii=False, indent=2)
        char_desc = json.dumps(characters_info, ensure_ascii=False, indent=2)
        pos_desc = json.dumps(proposed_positions, ensure_ascii=False, indent=2)

        blueprint_data = {
            "ascii_map": stage_analysis.get("ascii_map", []),
            "spatial_grid": stage_analysis.get("spatial_grid", {})
        } if stage_analysis else {}
        blueprint_desc = json.dumps(blueprint_data, ensure_ascii=False, indent=2) if blueprint_data else "Không có dữ liệu bản đồ."

        full_prompt = SWARM_CRITIC_PROMPT.replace(
            "{stage_analysis}", stage_desc
        ).replace(
            "{characters_info}", char_desc
        ).replace(
            "{proposed_positions}", pos_desc
        ).replace(
            "{blueprint_context}", blueprint_desc
        )

        max_attempts = max(1, config.total_keys)
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
                        temperature=0.2, # Low temperature for strict QA rating
                        response_mime_type="application/json"
                    )
                )
                
                text = response.text.strip()
                if text.startswith("```json"):
                    text = text[7:]
                if text.endswith("```"):
                    text = text[:-3]
                    
                result = json.loads(text.strip())
                logger.info(f"Critic Review Complete: {result.get('status')} (Score: {result.get('score')})")
                return result
                
            except Exception as e:
                msg = str(e).lower()
                if "429" in msg or "quota" in msg or "resource_exhausted" in msg or "503" in msg or "unavailable" in msg or "ssl" in msg or "network" in msg or "connection" in msg:
                    # try to extract retry delay
                    import re
                    delay = 60.0
                    match = re.search(r"retry\s+in\s+(\d+(?:\.\d+)?)s", msg)
                    if match:
                        delay = float(match.group(1)) + 1.0
                        
                    if config.rotate_key():
                        logger.warning(f"Key rate limited/unavailable/network error. Rotating... Next attempt: {attempt + 1}")
                        import time
                        time.sleep(1)
                        continue
                    else:
                        if attempt < max_attempts - 1:
                            import time
                            logger.warning(f"All keys exhausted or network error. Sleeping {delay:.1f}s before retrying for SwarmCritic...")
                            time.sleep(delay)
                            continue
                        else:
                            logger.error(f"Max retries reached for SwarmCritic.")
                            return {"status": "PASS", "feedback": "Max retries reached, fallback to local/bypass.", "score": 5}
                else:
                    logger.error(f"SwarmCriticAgent failed on attempt {attempt}: {e}")
                    # Fail open to prevent blocking the pipeline if AI is down
                    return {"status": "PASS", "feedback": f"Critic failed, falling back to bypass: {e}", "score": 5}
        
        return {"status": "PASS", "feedback": "All attempts failed.", "score": 5}

