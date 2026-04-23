"""
CameraDirectorAgent — AI Camera tracking and composition.

Takes the scene blueprint, the timeline of characters, their emotions, and their spatial layout,
and generates a sequence of dramatic camera keyframes (x, y, zoom, and shake).
"""

import json
import logging
import asyncio

logger = logging.getLogger(__name__)

CAMERA_PROMPT = """Bạn là "Đạo diễn Máy quay" (Camera Director) ảo cho một bộ phim hoạt hình.

BỐI CẢNH SÂN KHẤU (SCENE BLUEPRINT):
{blueprint_context}

TỌA ĐỘ VÀ SẮP XẾP NHÂN VẬT (KẾT QUẢ TỪ SWARM NEGOTIATOR):
{positions_context}

KỊCH BẢN / TIMELINE CHÍNH:
{script_context}

NHIỆM VỤ:
Bạn có một chiếc camera ảo. Mặc định khung hình nằm ở X=9.6, Y=5.4 với mức Zoom=1.0.
Dựa vào mạch cảm xúc, hãy lập kế hoạch quay cho TỪNG DÒNG THOẠI.

CÁC GÓC MÁY GỢI Ý:
- "wide_shot" (Toàn cảnh): Zoom = 1.0, X = 9.6, Y = 5.4. Thường dùng khi bối cảnh thay đổi, nhân vật chạy từ xa lại, hoặc 2 nhân vật cãi nhau căng thẳng ở 2 đầu phòng.
- "close_up" (Cận cảnh): Zoom = 1.3 đến 1.5. Focus vào X của nhân vật đang nói. Y đẩy lên khoảng 6.4 để bắt cận mặt. Dùng khi nói chuyện bình thường hoặc bộc lộ tâm lý.
- "extreme_close_up" (Cận cảnh cực độ): Zoom = 1.8 đến 2.0. Focus sát mặt nhân vật. Khuyên dùng cho cảnh cực kỳ phấn khích, giận dữ, sốc tột độ.
- "pan_shot": Zoom = 1.2, X di chuyển chậm từ nhân vật này sang nhân vật khác.

TRẢ VỀ JSON ARRAY cho TỪNG DÒNG THOẠI:
[
  {{
    "line_idx": 0,
    "type": "wide_shot" hoặc "close_up" hoặc "extreme_close_up",
    "target": "Tên Nhân vật làm tâm điểm",
    "x": 9.6,        // Tọa độ X máy quay (0 - 19.2)
    "y": 5.4,        // Tọa độ Y máy quay (0 - 10.8)
    "zoom": 1.0,     // Mức phòng to (1.0 = bth, > 1.0 là zoom in)
    "shake": false,  // Bật rung lắc nếu cảm xúc bùng nổ mạnh
    "reason": "Lý do chọn góc này"
  }},
  ...
]

QUY TẮC:
- MỖI DÒNG THOẠI PHẢI CÓ 1 QUYẾT ĐỊNH CAMERA.
- KHÔNG BAO GIỜ để JSON lồng lộn hay viết sai format. Kết quả phải là mảng JSON hợp lệ.
"""

class CameraDirectorAgent:
    @staticmethod
    async def generate_camera_plan(
        all_lines: list[dict],
        negotiated_positions: dict,
        blueprint_context: str,
        timeout: float = 35.0,
    ) -> list[dict]:
        """Generate camera array for each line in the scene."""
        try:
            from backend.core.ollama_client import get_ollama_client
            ollama = get_ollama_client()
            
            if not await ollama.is_available():
                logger.warning("[Camera] Ollama unavailable, using fallback logic")
                return CameraDirectorAgent._fallback_plan(all_lines, negotiated_positions)
                
            script_lines = []
            for i, line in enumerate(all_lines):
                char = line.get("character", "?")
                text = line.get("text", "")
                emotion = line.get("emotion", "")
                script_lines.append(f"Dòng {i}: {char} [{emotion}] nói: \"{text}\"")
                
            pos_desc = json.dumps(negotiated_positions, ensure_ascii=False, indent=2)
            
            prompt = CAMERA_PROMPT.format(
                blueprint_context=blueprint_context,
                positions_context=pos_desc,
                script_context="\n".join(script_lines)
            )
            
            logger.info(f"[Camera] Calling Ollama for {len(all_lines)} beats...")
            response = await asyncio.wait_for(
                ollama.generate(prompt=prompt, temperature=0.5, json_mode=False),
                timeout=timeout
            )
            
            if not response:
                return CameraDirectorAgent._fallback_plan(all_lines, negotiated_positions)
                
            import re
            clean = response.strip()
            # extract json block
            match = re.search(r"```(?:json)?\s*(\[.*?\])\s*```", clean, re.DOTALL)
            if match:
                clean = match.group(1)
            else:
                match = re.search(r"(\[.*\])", clean, re.DOTALL)
                if match:
                    clean = match.group(1)
                    
            plan = json.loads(clean)
            if isinstance(plan, list) and len(plan) >= len(all_lines):
                logger.info("[Camera] Successfully planned AI kinematics.")
                return plan
            else:
                logger.warning("[Camera] Incomplete or invalid list length, using fallback.")
                return CameraDirectorAgent._fallback_plan(all_lines, negotiated_positions)
                
        except Exception as e:
            logger.error(f"[Camera] Error: {e}, using fallback.")
            return CameraDirectorAgent._fallback_plan(all_lines, negotiated_positions)
            
    @staticmethod
    def _fallback_plan(all_lines: list[dict], negotiated_positions: dict) -> list[dict]:
        plan = []
        is_far = False
        chars_seen = set()
        for pos in negotiated_positions.values():
            if isinstance(pos, dict):
                chars_seen.add(pos.get("start_x", 0))
        if chars_seen and max(chars_seen, default=0) - min(chars_seen, default=0) > 8:
            is_far = True
            
        for i, line in enumerate(all_lines):
            c_name = line.get("character", "")
            emotion = line.get("emotion", "").lower().strip()
            
            target_x = 9.6
            if isinstance(negotiated_positions.get(c_name), dict):
                target_x = negotiated_positions[c_name].get("target_x", 9.6)
            
            cam_x = 9.6 + (target_x - 9.6) * 0.4
            
            # Emotion-aware fallback
            if emotion in {"angry", "furious", "shocked", "surprised", "scared", "giận", "hét", "sốc", "kinh ngạc", "điên", "hoảng", "phẫn nộ"}:
                plan.append({"line_idx": i, "type": "extreme_close_up", "x": cam_x, "y": 6.8, "zoom": 1.65, "shake": True})
            elif emotion in {"sad", "depressed", "crying", "buồn", "khóc", "thất vọng"}:
                plan.append({"line_idx": i, "type": "wide_shot", "x": 9.6, "y": 5.4, "zoom": 0.95, "shake": False})
            elif emotion in {"happy", "joyful", "laughing", "vui", "cười", "hào hứng"}:
                plan.append({"line_idx": i, "type": "close_up", "x": cam_x, "y": 6.4, "zoom": 1.25, "shake": False})
            else:
                # Simple alternating logic for generic lines
                if is_far or i % 3 == 0:
                    plan.append({"line_idx": i, "type": "wide", "x": 9.6, "y": 5.4, "zoom": 1.0, "shake": False})
                else:
                    plan.append({"line_idx": i, "type": "close_up", "x": cam_x, "y": 6.4, "zoom": 1.15, "shake": False})
        return plan
