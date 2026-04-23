"""
Scene Planner Agent — AI Director for casting and spatial staging.

Takes the script template, scans the asset registry (Characters & Backgrounds),
and outputs concrete asset mapping coordinates and z-index assignments.
"""
from __future__ import annotations
import json
import logging
from typing import Any

from backend.core.ai_config import get_ai_config
from backend.core.scene_graph.asset_scanner import AssetRegistry

logger = logging.getLogger(__name__)

SCENE_PLANNER_PROMPT = """Bạn là Đạo diễn Sân khấu (Scene Planner).
Bạn được cung cấp một kịch bản phim hoạt hình, cùng với Danh sách Các Nhân Vật (Characters) hiện có và Các Bối Cảnh (Backgrounds) hiện có trong máy tính.

NHIỆM VỤ CỦA BẠN:
1. Gán Background: Chọn 1 'background_id' phù hợp nhất với mô tả bối cảnh.
2. Casting Diễn viên: Map từng 'character_id' trong kịch bản vào 'asset_id' thật trong danh sách nhân vật.
3. Chỉnh tọa độ KHÔNG GIAN (Layer-Aware Placement):
   - Bạn cần tính toán z_index cho nhân vật nếu có chỉ dẫn "ẩn sau xe", "trước gốc cây".
   - Background thường được sinh theo Z-Index từ -50 (xa nhất) đến +85 (gần nhất) (mỗi layer cách nhau 15 đơn vị).
   - Mặc định, nhân vật có z_index là 0.
   - Nếu kịch bản yêu cầu nấp sau một vật thể tiền cảnh (Foreground), hãy gán z_index âm (vd: -10).
   - Nếu kịch bản yêu cầu đứng thật sát màn hình, gán z_index dương lớn (vd: 30).
   - Xác định rõ x (từ 0.0 đến 19.2) và y (mặc định 8.37).

TRẢ VỀ JSON:
{
    "background_id": "Mã hash của background",
    "character_map": {
        "NV1": "Mã hash_id của nhân vật A",
        "NV2": "Mã hash_id của nhân vật B"
    },
    "spatial_layout": {
        "NV1": {
            "default_x": 7.6,
            "default_z_index": 0
        },
        "NV2": {
            "default_x": 11.6,
            "default_z_index": 0
        }
    }
}
"""

class ScenePlannerAgent:
    @staticmethod
    def plan_scene(script_data: dict, registry: AssetRegistry, bg_list: list[dict]) -> dict[str, Any] | None:
        try:
            from google import genai
            from google.genai import types
        except ImportError as e:
            logger.error(f"google-genai pkg not installed. {e}")
            return None
            
        config = get_ai_config()
        if not config.has_api_key:
            logger.warning("No API key configured for Scene Planner.")
            return None

        # Build Character Catalog String
        char_lines = []
        for c in registry.characters.values():
            char_lines.append(f"- ID: {c.id} | Tên: {c.name}")
        char_catalog = "\n".join(char_lines)

        # Build Background Catalog String
        bg_lines = []
        for bg in bg_list:
            bg_lines.append(f"- ID: {bg['id']} | Tên: {bg['name']}")
        bg_catalog = "\n".join(bg_lines)

        full_prompt = (
            f"{SCENE_PLANNER_PROMPT}\n\n"
            f"--- BỐI CẢNH CÓ SẴN ---\n{bg_catalog}\n\n"
            f"--- NHÂN VẬT CÓ SẴN ---\n{char_catalog}\n\n"
            f"--- KỊCH BẢN YÊU CẦU ---\n{json.dumps(script_data, ensure_ascii=False, indent=2)}\n"
        )
        
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
                        temperature=0.3,
                        response_mime_type="application/json"
                    )
                )
                
                return json.loads(response.text)
            except Exception as e:
                msg = str(e).lower()
                if any(k in msg for k in ["429", "quota", "resource_exhausted", "503", "unavailable", "ssl", "eof", "connection", "timeout", "protocol"]):
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
                        logger.warning(f"All keys exhausted or network error. Sleeping {delay:.1f}s before retrying for ScenePlannerAgent...")
                        time.sleep(delay)
                        continue
                logger.error(f"ScenePlannerAgent failed on attempt {attempt}: {e}")
                return None
        return None
