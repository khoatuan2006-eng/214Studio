"""
SwarmNegotiatorAgent — Spatial negotiation for character placement.

Priority: 🏠 Ollama local (qwen2.5:7b) → ☁️ Gemini Cloud fallback.
This mirrors the SwarmCriticAgent pattern to minimize Gemini API quota consumption.
"""

import asyncio
import json
import logging
from typing import Any, List, Dict, Optional

logger = logging.getLogger(__name__)

SWARM_NEGOTIATION_PROMPT = """Bạn là Nhóm Đặc vụ Swarm (Swarm Intelligence) cho AnimeStudio.
Bạn đang mô phỏng quá trình "Thỏa hiệp Vị trí Không gian" (Semantic Nudging) như hệ thống MiroFish.
Bạn có một danh sách Nhân vật cụ thể và bản phân tích Môi trường Sân khấu (Stage Analysis).
Hãy ĐÓNG VAI TỪNG NHÂN VẬT và thảo luận với "Nhà sản xuất Sân khấu" để tìm ra tọa độ chuẩn xác nhất.

THÔNG SỐ SÂN KHẤU (CANVAS):
- Trục ngang (X): từ 0.0 (trái) tới 19.2 (phải). Điểm giữa là 9.6.
- Z-Index: số dương càng lớn thì càng đứng gần camera (đứng trước). Nếu muốn đứng sau một cái bàn (z=15), nhân vật phải có z = 14.

TRÍ NHỚ THẾ GIỚI (World Memory):
Đây là vị trí cũ của các nhân vật từ Cảnh trước. Trừ khi kịch bản yêu cầu họ xuất hiện từ chỗ khác, họ PHẢI BẮT ĐẦU từ chính xác vị trí cũ này.
{world_memory}

BỐI CẢNH SÂN KHẤU (SCENE BLUEPRINT):
Đây là bản đồ ASCII và lưới không gian của sân khấu mà bạn đang đứng. Bạn có thể nhìn bản đồ để dễ dàng hình dung chiều sâu (Trục Z) và chiều ngang (Trục X).
{blueprint_context}

ĐẦU VÀO MÔI TRƯỜNG PHÂN TÍCH:
{stage_analysis}

ĐẦU VÀO DANH SÁCH NHÂN VẬT (+ Lời thoại của họ làm hint hành động):
{characters_info}

BÀI TOÁN THỎA HIỆP (TÌM ĐƯỜNG & TRÁNH VA CHẠM):
1. Đọc các vật thể môi trường. Ai có hành động liên quan tới vật gì thì phải tới gần vật đó (X và Z phù hợp).
2. Từng nhân vật hãy quyết định `start_x` (vị trí hiện tại), `target_x` (nơi muốn đến), và `action` ("walk", "run", "stand"). Nếu `start_x` == `target_x`, action phải là "stand".
3. LUẬT KHOẢNG CÁCH (SOCIAL DISTANCING): Nếu 2 nhân vật đứng Ở CÙNG MỘT MỨC Z-INDEX, khoảng cách `target_x` của họ tối thiểu phải là 2.5 đơn vị để không bị dính vào nhau.
4. LUẬT CHIỀU SÂU 3D (Z-DEPTH SANDWICHING): Khuyến khích tạo chiều sâu! Nếu 2 nhân vật cần đứng sát nhau (khoảng cách X < 2.5), họ BẮT BUỘC PHẢI KHÁC Z-INDEX ít nhất 10 đơn vị (Một người đứng tiền cảnh, một người đứng hậu cảnh). Bạn có thể cho nhân vật đứng SAU cái bàn (Z_nhân_vật = Z_bàn - 1).
5. SỬ DỤNG KỸ NĂNG (SKILLS): Nếu tình huống kịch bản yêu cầu (tức giận tột độ bùng nổ, hoảng loạn, hiệu ứng thời tiết..), nhân vật có quyền kích hoạt kỹ năng VFX. Các skills có sẵn: ["camera_shake", "flash_screen", "explosion", "heart_burst", "rain", "dark_vignette"].

KẾT QUẢ TRẢ VỀ:
Trả về DUY NHẤT một cục JSON, có định dạng sau:
{
  "negotiation_log": "Tóm tắt ngắn quá trình thỏa hiệp",
  "positions": {
    "Tên_Nhân_Vật": {
      "start_x": 8.5,
      "target_x": 10.5,
      "z_index": 10,
      "action": "walk",
      "effects": ["camera_shake"], 
      "reason": "Nhân vật từ cửa đi lại gần bàn"
    }
  }
}
"""


def _build_prompt(
    characters_info: List[Dict],
    stage_analysis: Dict,
    layer_z_map: Dict[str, float],
    world_memory: Optional[Dict[str, dict]],
) -> str:
    """Build the negotiation prompt string (shared between Ollama and Gemini paths)."""
    # Build Stage Prompt String
    stage_lines = []
    if stage_analysis:
        for elem in stage_analysis.get("elements", []):
            bbox_cx = (elem.get("bbox_x", 0) + elem.get("bbox_w", 100) / 2) / 100 * 19.2
            layer_id = elem.get("layer_id", "")
            actual_z = layer_z_map.get(layer_id, 0)
            name = elem.get("name_en", "")
            cat = elem.get("category", "object")
            can_stand = "Dùng để đứng/ngồi" if elem.get("can_stand_on") or elem.get("can_sit_on") else "Vật tương tác"
            stage_lines.append(f"- Tên: '{name}', Loại: '{cat}' -> Tọa độ X: {bbox_cx:.1f}, Z-Index: {actual_z:.1f} ({can_stand})")

    stage_desc = "\n".join(stage_lines)
    if not stage_desc:
        stage_desc = "- Sân khấu trống (Trải đều từ X=2 đến X=17)."

    # Build Character Prompt String
    char_lines = []
    for c in characters_info:
        char_lines.append(f"- Tên Nhân vật: {c['name']}\n  Gợi ý/Ngữ cảnh: {c.get('hint', 'Không có')}")
    char_desc = "\n".join(char_lines)

    # Build World Memory
    mem_desc = ""
    if world_memory:
        mem_lines = []
        for name, st in world_memory.items():
            if name == "__CRITIC_FEEDBACK__":
                mem_lines.append(f"!!! CHÚ Ý (CRITIC FEEDBACK TỪ LẦN CHẠY TRƯỚC BỊ LỖI): {st.get('note')} !!!\nBẠN PHẢI SỬA LỖI NÀY!")
            else:
                mem_lines.append(f"- {name}: Đang ở X={st.get('x', 9.6):.1f}")
        mem_desc = "\n".join(mem_lines)
    else:
        mem_desc = "Không có trí nhớ cũ. (Đây là Cảnh Khai Màn)"

    # Blueprint
    blueprint_data = {}
    if stage_analysis:
        blueprint_data = {
            "ascii_map": stage_analysis.get("ascii_map", []),
            "spatial_grid": stage_analysis.get("spatial_grid", {})
        }
    blueprint_desc = json.dumps(blueprint_data, ensure_ascii=False, indent=2) if blueprint_data else "Không có dữ liệu bản đồ."

    return SWARM_NEGOTIATION_PROMPT.replace(
        "{stage_analysis}", stage_desc
    ).replace(
        "{characters_info}", char_desc
    ).replace(
        "{world_memory}", mem_desc
    ).replace(
        "{blueprint_context}", blueprint_desc
    )


def _parse_positions(text: str) -> Optional[Dict]:
    """Parse JSON positions from LLM response. Returns positions dict or None."""
    import re
    clean = text.strip()
    # Strip markdown fences
    if clean.startswith("```json"):
        clean = clean[7:]
    if clean.startswith("```"):
        clean = clean[3:]
    if clean.endswith("```"):
        clean = clean[:-3]

    clean = clean.strip()

    try:
        result = json.loads(clean)
        return result.get("positions", {})
    except json.JSONDecodeError:
        # Try to extract JSON object
        match = re.search(r'(\{.*\})', clean, re.DOTALL)
        if match:
            try:
                result = json.loads(match.group(1))
                return result.get("positions", {})
            except json.JSONDecodeError:
                pass
    return None


async def _try_ollama_negotiate(
    full_prompt: str,
    timeout: float = 45.0,
) -> Optional[Dict]:
    """Try SwarmNegotiation via local Ollama. Returns positions dict or None."""
    try:
        from backend.core.ollama_client import get_ollama_client
        ollama = get_ollama_client()

        if not await ollama.is_available():
            return None

        logger.info("[Negotiator] 🏠 Using local Ollama for position negotiation...")
        response = await asyncio.wait_for(
            ollama.generate(prompt=full_prompt, temperature=0.5),
            timeout=timeout,
        )

        if not response:
            logger.warning("[Negotiator] Ollama returned empty response.")
            return None

        positions = _parse_positions(response)
        if positions:
            logger.info(f"[Negotiator] 🏠 Ollama negotiation complete: {list(positions.keys())}")
            return positions

        logger.warning("[Negotiator] Ollama response could not be parsed as positions JSON.")
        return None

    except asyncio.TimeoutError:
        logger.warning(f"[Negotiator] Ollama timeout ({timeout}s), falling back to Gemini.")
        return None
    except Exception as e:
        logger.warning(f"[Negotiator] Ollama failed: {e}, falling back to Gemini.")
        return None


def _try_gemini_negotiate(
    full_prompt: str,
    config: Any,
) -> Optional[Dict]:
    """Fallback negotiation via Gemini Cloud API."""
    try:
        from google import genai
        from google.genai import types
    except ImportError as e:
        logger.error(f"google-genai pkg not installed: {e}")
        return None

    max_attempts = max(1, config.total_keys) * 4
    for attempt in range(max_attempts):
        try:
            client = genai.Client(api_key=config.api_key)
            target_model = config.get_rotated_model(attempt)
            logger.info(f"[Negotiator] ☁️ Gemini fallback — model: {target_model} (attempt {attempt})")

            response = client.models.generate_content(
                model=target_model,
                contents=full_prompt,
                config=types.GenerateContentConfig(
                    temperature=0.5,
                    response_mime_type="application/json"
                )
            )

            positions = _parse_positions(response.text)
            if positions:
                logger.info(f"[Negotiator] ☁️ Gemini negotiation complete: {list(positions.keys())}")
                return positions

        except Exception as e:
            msg = str(e).lower()
            if any(k in msg for k in ["429", "quota", "resource_exhausted", "503", "unavailable", "ssl", "eof", "connection", "timeout", "protocol"]):
                import re as re_mod, time
                delay = 35.0 if ("429" in msg or "quota" in msg or "resource_exhausted" in msg) else 5.0
                m = re_mod.search(r'retry in (\d+\.?\d*)s', msg)
                if m:
                    delay = float(m.group(1)) + 1.0

                if config.rotate_key():
                    logger.warning(f"[Negotiator] Key rate limited — rotating key, next attempt {attempt + 1}")
                    time.sleep(1)
                    continue
                else:
                    logger.warning(f"[Negotiator] All keys exhausted. Sleeping {delay:.1f}s...")
                    time.sleep(delay)
                    continue
            logger.error(f"[Negotiator] Gemini failed on attempt {attempt}: {e}")
            return None
    return None


class SwarmNegotiatorAgent:
    """
    Spatial negotiation agent.
    
    Strategy:
    1. 🏠 Try Ollama local first (free, unlimited, async)
    2. ☁️ Fallback to Gemini Cloud if Ollama unavailable/failed
    """

    @staticmethod
    async def negotiate_positions_async(
        characters_info: List[Dict],
        stage_analysis: Dict,
        layer_z_map: Dict[str, float],
        world_memory: Optional[Dict[str, dict]] = None,
        ollama_timeout: float = 45.0,
    ) -> Optional[Dict]:
        """
        Async version: Ollama first, Gemini fallback.
        Use this from async contexts (e.g. FastAPI endpoints).
        """
        from backend.core.ai_config import get_ai_config
        config = get_ai_config()

        full_prompt = _build_prompt(characters_info, stage_analysis, layer_z_map, world_memory)

        # 1. Try Ollama local first
        positions = await _try_ollama_negotiate(full_prompt, timeout=ollama_timeout)
        if positions:
            return positions

        # 2. Fallback to Gemini
        if not config.has_api_key:
            logger.warning("[Negotiator] No Gemini API key configured, returning None.")
            return None

        return await asyncio.to_thread(_try_gemini_negotiate, full_prompt, config)

    @staticmethod
    def negotiate_positions(
        characters_info: List[Dict],
        stage_analysis: Dict,
        layer_z_map: Dict[str, float],
        world_memory: Optional[Dict[str, dict]] = None,
    ) -> Optional[Dict]:
        """
        Sync compatibility wrapper — runs the async version in a new event loop.
        Called from automation.py (sync context). 
        Falls back to Gemini if no running loop.
        """
        try:
            # If already in an async context, use Gemini only (sync-safe)
            loop = asyncio.get_running_loop()
            # We're inside an async context but called synchronously — run Gemini fallback
            logger.info("[Negotiator] Sync call from async context — using Gemini directly.")
            from backend.core.ai_config import get_ai_config
            config = get_ai_config()
            if not config.has_api_key:
                return None
            full_prompt = _build_prompt(characters_info, stage_analysis, layer_z_map, world_memory)
            return _try_gemini_negotiate(full_prompt, config)
        except RuntimeError:
            # No running loop — safe to run async
            full_prompt = _build_prompt(characters_info, stage_analysis, layer_z_map, world_memory)
            from backend.core.ai_config import get_ai_config
            config = get_ai_config()
            if not config.has_api_key:
                return None
            return _try_gemini_negotiate(full_prompt, config)
