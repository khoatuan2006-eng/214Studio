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
        
        max_attempts = config.total_keys if config.total_keys > 0 else 1
        for attempt in range(max_attempts):
            try:
                client = genai.Client(api_key=config.api_key)
                
                available_models = [m.name.split('/')[-1] for m in client.models.list() if "generateContent" in str(getattr(m, "supported_generation_methods", [])) or "generateContent" in str(getattr(m, "supported_actions", []))]
                target_model = None
                for candidate in ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.0-flash-lite"]:
                    if candidate in available_models or f"models/{candidate}" in [m.name for m in client.models.list()]:
                        target_model = candidate
                        break
                        
                if not target_model:
                    target_model = available_models[0] if available_models else "gemini-2.0-flash"

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
                if "429" in msg or "quota" in msg or "resource_exhausted" in msg:
                    if config.rotate_key() and attempt < max_attempts - 1:
                        continue
                logger.error(f"ScenePlannerAgent failed on attempt {attempt}: {e}")
                return None
        return None
