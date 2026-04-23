"""
ActorAgent — Per-Character AI Performance Planner.

Each character in the scene gets their OWN ActorAgent instance running on Ollama (Colab).
This eliminates pose/face confusion between characters because each agent only knows
about its own character's available poses and faces.

Architecture:
    DirectorAgent (future) → ActorAgent("Hoa") + ActorAgent("Nam")
    Each ActorAgent plans ALL poses, faces, and movements for every line their character speaks or listens to.
"""

import json
import logging
import asyncio
from typing import Optional

logger = logging.getLogger(__name__)


ACTOR_PROMPT = """Bạn là Diễn viên AI chuyên nghiệp đang nhập vai nhân vật "{char_name}" trong một bộ phim hoạt hình truyện tranh Q版/Chibi.

═══ NHÂN VẬT CỦA BẠN ═══
Tên: {char_name}

DANH SÁCH POSE (tư thế cơ thể — HÃY DÙNG ĐA DẠNG):
{poses_list}

DANH SÁCH FACE (biểu cảm khuôn mặt — HÃY DÙNG ĐA DẠNG):
{faces_list}

═══ SÂN KHẤU ═══
{blueprint_context}

{stage_context}

═══ KỊCH BẢN ═══
{script_context}

═══ NHIỆM VỤ ═══
Bạn quyết định TOÀN BỘ diễn xuất cho nhân vật "{char_name}":

1. **Tư thế ban đầu (initial_pose)**: Nhân vật nên đứng hay ngồi? Nếu sân khấu có ghế/sofa và nhân vật có pose ngồi trong danh sách, hãy chọn ngồi.

2. **Mỗi dòng thoại**:
   - Chọn pose và face PHÙ HỢP với nội dung và cảm xúc.
   - Chọn **bubble_style** cho bong bóng thoại truyện tranh:
     • "speech" = nói bình thường (bong bóng tròn)
     • "shout" = hét/giận/sốc (bong bóng gai góc)
     • "thought" = suy nghĩ (bong bóng mây)
     • "whisper" = thì thầm/rụt rè (bong bóng nét đứt)
   - Nếu câu thoại DÀI (trên 30 ký tự và đang nói), thêm sub_beats — thay đổi pose/face GIỮA câu.

QUY TẮC:
- PHẢI dùng TÊN ĐÚNGtừ danh sách pose/face. KHÔNG bịa tên mới.
- Đừng lặp lại pose/face giữa các dòng. Đa dạng!
- Khi nghe người khác, chọn face **phản ứng** phù hợp.
- sub_beats chỉ cho câu dài. Câu ngắn bỏ trống.

TRẢ VỀ JSON với format:
{{
  "initial_pose": "tên pose từ danh sách (hoặc null nếu đứng mặc định)",
  "lines": [
    {{
      "line_idx": 0,
      "role": "speaking" hoặc "listening",
      "pose": "tên pose",
      "face": "tên face",
      "bubble_style": "speech",
      "sub_beats": []
    }},
    {{
      "line_idx": 1,
      "role": "listening",
      "pose": "tên pose",
      "face": "tên face",
      "bubble_style": "speech",
      "sub_beats": [{{"offset": 2.0, "pose": "pose khác", "face": "face khác"}}]
    }}
  ]
}}

CHỈ TRẢ VỀ JSON, KHÔNG GIẢI THÍCH."""


class ActorAgent:
    """AI Actor that plans performance for a single character.
    
    Each instance is bound to one character and knows only that character's
    available poses and faces, preventing cross-character confusion.
    """

    def __init__(
        self,
        char_name: str,
        available_poses: list[str],
        available_faces: list[str],
        blueprint_context: str = "",
        stage_context: str = "",
    ):
        self.char_name = char_name
        self.available_poses = available_poses
        self.available_faces = available_faces
        self.blueprint_context = blueprint_context or "Sân khấu mặc định, không có thông tin chi tiết."
        self.stage_context = stage_context or ""
    
    async def plan_performance(
        self,
        all_lines: list[dict],
        timeout: float = 30.0,
    ) -> list[dict] | None:
        """Plan poses and faces for every line in the script.
        
        Args:
            all_lines: ALL dialogue lines in the scene (not just this character's).
                       Each item: {"character": str, "text": str, "emotion": str, "action": str}
            timeout: Max seconds to wait for Ollama response.
            
        Returns:
            List of performance decisions, one per line:
            [{"line_idx": 0, "role": "speaking"|"listening", "pose": str, "face": str}, ...]
        """
        try:
            from backend.core.ollama_client import get_ollama_client
            ollama = get_ollama_client()
            
            if not await ollama.is_available():
                logger.warning(f"[Actor:{self.char_name}] Ollama unavailable, using fallback")
                return self._fallback_plan(all_lines)
            
            # Build script context
            script_lines = []
            for i, line in enumerate(all_lines):
                char = line.get("character", "?")
                text = line.get("text", "")
                emotion = line.get("emotion", "")
                action = line.get("action", "")
                hint = f" [{emotion}]" if emotion else ""
                hint += f" ({action})" if action else ""
                marker = "👉" if char == self.char_name else "  "
                script_lines.append(f"{marker} Dòng {i}: {char}{hint}: \"{text}\"")
            
            script_context = "\n".join(script_lines)
            
            # Build the prompt
            prompt = ACTOR_PROMPT.format(
                char_name=self.char_name,
                poses_list=", ".join(self.available_poses),
                faces_list=", ".join(self.available_faces),
                blueprint_context=self.blueprint_context,
                stage_context=self.stage_context,
                script_context=script_context,
            )
            
            # Call Ollama with timeout
            logger.info(f"[Actor:{self.char_name}] Planning performance for {len(all_lines)} lines "
                       f"({len(self.available_poses)} poses, {len(self.available_faces)} faces)...")
            
            response = await asyncio.wait_for(
                ollama.generate(prompt=prompt, temperature=0.4),
                timeout=timeout,
            )
            
            if not response:
                logger.warning(f"[Actor:{self.char_name}] Empty response, using fallback")
                return self._fallback_plan(all_lines)
            
            # Parse the JSON response
            plan = self._parse_response(response, all_lines)
            if plan:
                # Log the decisions
                unique_poses = set(p["pose"] for p in plan)
                unique_faces = set(p["face"] for p in plan)
                logger.info(f"[Actor:{self.char_name}] Performance planned: "
                           f"{len(unique_poses)} unique poses, {len(unique_faces)} unique faces")
                return plan
            
            logger.warning(f"[Actor:{self.char_name}] Failed to parse response, using fallback")
            return self._fallback_plan(all_lines)
            
        except asyncio.TimeoutError:
            logger.warning(f"[Actor:{self.char_name}] Ollama timeout ({timeout}s), using fallback")
            return self._fallback_plan(all_lines)
        except Exception as e:
            logger.error(f"[Actor:{self.char_name}] Error: {e}")
            return self._fallback_plan(all_lines)
    
    def _parse_response(self, response: str, all_lines: list[dict]) -> list[dict] | None:
        """Parse Ollama response into structured performance plan."""
        import re
        
        clean = response.strip()
        
        # Try to extract JSON array from markdown blocks
        match = re.search(r"```(?:json)?\s*(\[.*?\])\s*```", clean, re.DOTALL)
        if match:
            clean = match.group(1)
        else:
            # Try to find raw JSON array
            match = re.search(r"(\[.*\])", clean, re.DOTALL)
            if match:
                clean = match.group(1)
        
        try:
            raw_plan = json.loads(clean)
        except json.JSONDecodeError:
            logger.warning(f"[Actor:{self.char_name}] Could not parse JSON from: {clean[:200]}...")
            return None
        
        # Support both old format (array) and new format ({initial_pose, lines: [...]})
        initial_pose = None
        if isinstance(raw_plan, dict):
            initial_pose = raw_plan.get("initial_pose")
            raw_plan = raw_plan.get("lines", [])
        
        if not isinstance(raw_plan, list):
            return None
        
        # Validate and sanitize each entry
        validated = []
        for i, entry in enumerate(raw_plan):
            if not isinstance(entry, dict):
                continue
            
            pose = entry.get("pose", "")
            face = entry.get("face", "")
            
            # Validate pose exists in available list (fuzzy match if needed)
            pose = self._validate_name(pose, self.available_poses, "站立")
            face = self._validate_name(face, self.available_faces, "微笑")
            
            # Validate sub_beats if present
            raw_sub_beats = entry.get("sub_beats", [])
            sub_beats = []
            if isinstance(raw_sub_beats, list):
                for sb in raw_sub_beats:
                    if not isinstance(sb, dict):
                        continue
                    sb_pose = self._validate_name(sb.get("pose", pose), self.available_poses, pose)
                    sb_face = self._validate_name(sb.get("face", face), self.available_faces, face)
                    try:
                        sb_offset = float(sb.get("offset", 0))
                    except (ValueError, TypeError):
                        sb_offset = 0
                    if sb_offset > 0:
                        sub_beats.append({"offset": sb_offset, "pose": sb_pose, "face": sb_face})
            # Sort by offset
            sub_beats.sort(key=lambda x: x["offset"])
            
            validated.append({
                "line_idx": entry.get("line_idx", i),
                "speaker": entry.get("speaker", ""),
                "role": entry.get("role", "listening"),
                "pose": pose,
                "face": face,
                "reason": entry.get("reason", ""),
                "bubble_style": entry.get("bubble_style", "speech"),
                "sub_beats": sub_beats,
            })
        
        # Ensure we have an entry for every line
        while len(validated) < len(all_lines):
            idx = len(validated)
            is_speaking = all_lines[idx].get("character") == self.char_name
            validated.append({
                "line_idx": idx,
                "speaker": all_lines[idx].get("character", ""),
                "role": "speaking" if is_speaking else "listening",
                "pose": self.available_poses[idx % len(self.available_poses)] if self.available_poses else "站立",
                "face": self.available_faces[idx % len(self.available_faces)] if self.available_faces else "微笑",
                "reason": "auto-filled",
                "bubble_style": "speech",
                "sub_beats": [],
            })
        
        # Inject initial_pose from AI into the first entry's metadata
        if initial_pose:
            initial_pose = self._validate_name(initial_pose, self.available_poses, "站立")
        if validated:
            validated[0]["__initial_pose__"] = initial_pose
        
        return validated
    
    def _validate_name(self, name: str, available: list[str], fallback: str) -> str:
        """Validate that name exists in available list, fuzzy match if needed."""
        if not name or not available:
            return fallback if fallback in available else (available[0] if available else fallback)
        
        # Exact match
        if name in available:
            return name
        
        # Partial match (contains)
        name_lower = name.strip().lower()
        for a in available:
            if name_lower in a.lower() or a.lower() in name_lower:
                return a
        
        # Fallback
        return fallback if fallback in available else available[0]
    
    def _fallback_plan(self, all_lines: list[dict]) -> list[dict]:
        """Generate a deterministic fallback plan without AI.
        
        For long lines (>30 chars when speaking), generates sub_beats
        to create mid-sentence pose/face changes every ~2 seconds.
        Uses emotion-based bubble_style selection as fallback.
        """
        from backend.routers.automation import EMOTION_FACE_MAP, ACTION_POSE_MAP
        
        # Determine initial_pose: check if any sittable context mentioned
        initial_pose = None
        if self.stage_context and any(kw in self.stage_context.lower() for kw in
                ["can_sit", "sofa", "ghế", "chair", "bench", "bàn", "stool"]):
            for p in self.available_poses:
                if any(s in p.lower() for s in ["坐", "sit", "ngồi"]):
                    initial_pose = p
                    break
        
        plan = []
        for i, line in enumerate(all_lines):
            is_speaking = line.get("character") == self.char_name
            emotion = line.get("emotion", "")
            action = line.get("action", "")
            text = line.get("text", "")
            
            if is_speaking:
                # Use emotion/action maps + cycling for variety
                pose = ACTION_POSE_MAP.get(action.lower(), "") if action else ""
                face = EMOTION_FACE_MAP.get(emotion.lower(), "") if emotion else ""
                
                if not pose or pose not in self.available_poses:
                    pose = self.available_poses[i % len(self.available_poses)] if self.available_poses else "站立"
                if not face or face not in self.available_faces:
                    face = self.available_faces[(i * 3 + 1) % len(self.available_faces)] if self.available_faces else "微笑"
            else:
                # Listener: react to speaker's emotion
                pose = self.available_poses[(i * 2) % len(self.available_poses)] if self.available_poses else "站立"
                face = self.available_faces[(i * 5 + 2) % len(self.available_faces)] if self.available_faces else "微笑"
            
            # Generate sub_beats for long speaking lines
            sub_beats = []
            if is_speaking and len(text) > 30 and len(self.available_poses) > 1:
                est_duration = max(1.5, len(text) * 0.1)
                beat_interval = 2.0
                t = beat_interval
                beat_idx = 0
                while t < est_duration - 0.5:
                    beat_idx += 1
                    sb_pose = self.available_poses[(i + beat_idx) % len(self.available_poses)] if self.available_poses else pose
                    sb_face = self.available_faces[(i * 3 + beat_idx * 2) % len(self.available_faces)] if self.available_faces else face
                    sub_beats.append({"offset": t, "pose": sb_pose, "face": sb_face})
                    t += beat_interval
            
            # Determine bubble_style from emotion (fallback heuristic)
            bubble_style = "speech"  # default
            if is_speaking and emotion:
                em = emotion.lower().strip()
                if em in {"angry", "furious", "shocked", "surprised", "scared",
                          "giận", "hét", "sốc", "kinh ngạc", "điên", "hoảng", "phẫn nộ"}:
                    bubble_style = "shout"
                elif em in {"thinking", "confused", "pensive",
                            "nghĩ", "phân vân", "suy nghĩ", "bối rối", "trầm ngâm"}:
                    bubble_style = "thought"
                elif em in {"whisper", "shy", "embarrassed", "nervous",
                            "thì thầm", "bí mật", "ngại", "xấu hổ", "rụt rè"}:
                    bubble_style = "whisper"
            
            plan.append({
                "line_idx": i,
                "speaker": line.get("character", ""),
                "role": "speaking" if is_speaking else "listening",
                "pose": pose,
                "face": face,
                "reason": "fallback",
                "bubble_style": bubble_style,
                "sub_beats": sub_beats,
            })
        
        # Inject initial_pose into metadata
        if plan:
            plan[0]["__initial_pose__"] = initial_pose
        
        logger.info(f"[Actor:{self.char_name}] Fallback plan ({len(plan)} entries"
                    f"{f', initial_pose={initial_pose}' if initial_pose else ''})")
        return plan
