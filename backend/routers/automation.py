"""
Automation Router — Script-to-Scene-to-Video pipeline.

Endpoints:
  POST /api/automation/script-to-scene — Convert script lines → SceneGraph + TTS audio.
  POST /api/automation/lipsync        — Add lip-sync face keyframes to existing scene.
"""

import asyncio
import json
import logging
import os
import re
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.core.scene_graph.scene import SceneGraph
from backend.core.scene_graph.specialized_nodes import CharacterNode
from backend.core.scene_graph.asset_scanner import AssetRegistry

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/automation", tags=["automation"])

# ── Shared registry (will be set from main.py) ──
_registry: Optional[AssetRegistry] = None


def set_registry(registry: AssetRegistry):
    """Called from app startup to share the asset registry."""
    global _registry
    _registry = registry


# ══════════════════════════════════════════════
#  Models
# ══════════════════════════════════════════════

class ScriptLine(BaseModel):
    """A single line of dialogue in the script."""
    character: str          # Character name/id
    text: str               # Dialogue text
    emotion: str = ""       # Optional emotion hint (happy, sad, angry...)
    action: str = ""        # Optional action hint (walk, wave, sit...)


class ScriptToSceneRequest(BaseModel):
    """Request to convert a script into a SceneGraph."""
    lines: list[ScriptLine]
    character_map: dict[str, str]  # script character name → asset registry char_id
    background_id: Optional[str] = None
    voice_map: dict[str, str] = {}  # script character name → TTS voice code
    pause_ms: int = 500
    generate_tts: bool = True


class LipsyncRequest(BaseModel):
    """Request to add lip-sync keyframes to an existing scene."""
    scene: dict                     # Current SceneGraph JSON
    tts_lines: list[dict]           # TTS result lines with start_time/end_time
    character_node_map: dict[str, str]  # character name → node_id in scene


# ══════════════════════════════════════════════
#  Emotion → Face mapping
# ══════════════════════════════════════════════

# Map emotion keywords → best face expression names from the PSD assets
EMOTION_FACE_MAP = {
    # Positive
    "happy": "微笑", "joy": "大笑", "laugh": "大笑", "smile": "微笑",
    "excited": "笑嘻嘻", "proud": "自信", "relieved": "舒坦",
    "confident": "自信", "grateful": "感动", "worship": "崇拜",
    "vui": "微笑", "cười": "大笑", "hạnh phúc": "笑脸", "tuyệt": "开怀", "thích": "笑脸", "sung sướng": "笑嘻嘻", "đỉnh": "自信", "tự hào": "自信",
    # Negative
    "sad": "难过", "cry": "大哭", "tears": "流泪", "depressed": "委屈",
    "angry": "发怒", "furious": "愤怒", "rage": "大骂",
    "scared": "害怕", "fear": "恐吓", "shock": "震惊",
    "disgusted": "恶心", "sick": "呕吐",
    "buồn": "难过", "khóc": "大哭", "giận": "发怒", "sợ": "害怕", "tức": "不爽", "điên": "愤怒", "kinh tởm": "恶心", "chán": "无聊", "đau": "难过", "thất vọng": "委屈", "hận": "大骂",
    # Neutral/Complex
    "neutral": "无表情", "thinking": "疑惑", "confused": "迷惑",
    "surprised": "惊讶", "embarrassed": "尴尬", "shy": "害羞",
    "cold": "冷漠", "doubt": "怀疑", "bored": "打哈欠",
    "ngạc nhiên": "惊讶", "bối rối": "困扰", "xấu hổ": "害羞", "chảnh": "傲娇", "kiêu": "傲娇", "khó hiểu": "疑惑", "lạnh lùng": "冷漠", "bất ngờ": "震惊", "nghi ngờ": "怀疑", "buồn ngủ": "打哈欠",
    # Speaking
    "talking": "说话", "speaking": "说话", "yelling": "大吼",
    "nói": "说话", "la": "大吼", "hét": "大吼", "chửi": "大骂",
}

# Map action keywords → best pose names (expanded with all available poses)
ACTION_POSE_MAP = {
    # English
    "stand": "站立", "idle": "站立", "standing": "站立",
    "walk": "走路", "walking": "走路",
    "wave": "打招呼", "greet": "打招呼", "hello": "打招呼",
    "sit": "坐着", "sitting": "坐着",
    "run": "逃跑", "running": "逃跑", "flee": "逃跑",
    "think": "坐姿思考", "thinking": "疑惑", "wonder": "疑惑",
    "point": "手指向前", "pointing": "手指向前", "accuse": "指责",
    "introduce": "介绍", "explain": "介绍", "present": "介绍",
    "raise_hand": "举手", "hand_up": "举手",
    "fist": "举起拳头", "punch": "出拳", "fight": "出拳",
    "cross_arms": "抱胸", "arms_crossed": "抱胸", "serious": "抱胸",
    "hands_on_hips": "叉腰", "confident": "叉腰", "proud": "叉腰",
    "open_hands": "摊开手", "shrug": "摊开手", "gesture": "摊开手",
    "cover_mouth": "捂嘴", "shy": "捂嘴", "giggle": "偷笑",
    "scratch_head": "摸摸头", "embarrassed": "摸摸头",
    "pray": "祈祷", "please": "祈祷", "beg": "祈祷",
    "bow": "拱手", "salute": "拱手", "respect": "拱手",
    "phone": "接电话", "call": "接电话",
    "welcome": "请进", "invite": "请进",
    "sneak": "偷笑", "sneaky": "偷笑",
    "head_hold": "抱头", "despair": "抱头", "stressed": "抱头",
    "beckon": "勾手指", "come_here": "勾手指",
    # Vietnamese extended
    "đứng": "站立", "đi": "走路", "chào": "打招呼", "ngồi": "坐着", "chạy": "逃跑", "trốn": "逃跑", "nghĩ": "疑惑", "suy nghĩ": "坐姿思考", "chỉ trích": "指责", "giới thiệu": "介绍", 
    "giơ tay": "举手", "đấm": "出拳", "tức giận": "举起拳头", "khoanh tay": "抱胸", "chống nách": "叉腰", "bó tay": "摊开手", "bịt miệng": "捂嘴",
    "gãi đầu": "摸摸头", "cầu xin": "祈祷", "gọi điện": "接电话", "mời": "请进", "ôm đầu": "抱头", "tuyệt vọng": "抱头", "khiêu khích": "勾手指", "lại đây": "勾手指", "xin chào": "打招呼"
}

# Text analysis: detect emotion/action from dialogue text content
TEXT_EMOTION_HINTS = {
    # Vietnamese
    "chào": "happy", "xin chào": "happy", "hello": "happy",
    "vui": "happy", "tốt": "happy", "tuyệt": "excited",
    "buồn": "sad", "tiếc": "sad", "đau": "sad",
    "giận": "angry", "tức": "angry", "khó chịu": "angry",
    "sợ": "scared", "kinh": "scared",
    "ngạc nhiên": "surprised", "thật sao": "surprised", "không thể": "surprised",
    "cảm ơn": "grateful", "biết ơn": "grateful",
    "xin lỗi": "embarrassed", "sorry": "embarrassed",
    "đi": "walk", "đi thôi": "walk", "đi nào": "excited",
    "nghĩ": "thinking", "sao nhỉ": "thinking",
    "haha": "laugh", "hehe": "laugh",
    # Chinese / English
    "happy": "happy", "sad": "sad", "angry": "angry",
    "love": "shy", "sorry": "embarrassed",
    "wow": "surprised", "what": "surprised",
    "help": "scared", "run": "scared",
    "think": "thinking", "hmm": "thinking",
    "let's go": "excited", "come on": "excited",
}

TEXT_ACTION_HINTS = {
    # Vietnamese
    "chào": "greet", "xin chào": "greet",
    "đi": "walk", "đi thôi": "walk", "đi nào": "walk",
    "ngồi": "sit", "ngồi xuống": "sit",
    "chạy": "run", "nhanh": "run",
    "nghĩ": "think", "suy nghĩ": "think",
    "xem": "introduce", "giới thiệu": "introduce",
    "mời": "welcome", "vào đây": "welcome",
    "đánh": "punch", "chiến": "fight",
    "xin": "pray", "làm ơn": "pray",
    "gọi": "phone", "điện": "phone",
    # English
    "hello": "greet", "hi": "greet", "hey": "greet",
    "walk": "walk", "go": "walk", "let's go": "walk",
    "sit": "sit", "sit down": "sit",
    "run": "run", "hurry": "run",
    "think": "think", "wonder": "think",
    "look": "introduce", "see": "introduce",
    "fight": "fight", "punch": "punch",
    "please": "pray", "help": "pray",
}

# Listener reaction map: what the non-speaking character does
LISTENER_POSES = ["站立", "抱胸", "叉腰", "坐着", "疑惑"]
LISTENER_FACES_MAP = {
    "happy": "微笑", "sad": "难过", "angry": "皱眉",
    "excited": "惊讶", "scared": "害怕", "laugh": "笑嘻嘻",
    "surprised": "惊讶", "thinking": "疑惑", "embarrassed": "尴尬",
    "default": "微笑",
}

# Face expressions used for lip-sync (mouth movement simulation)
LIPSYNC_FACES = {
    "mouth_open": "说话",
    "mouth_closed": "微笑",
    "mouth_wide": "大吼",
}


def analyze_text_emotion(text: str) -> str:
    """Auto-detect emotion from dialogue text content."""
    text_lower = text.lower()
    # Check punctuation patterns
    if text.count("!") >= 2 or text.count("！") >= 2:
        return "excited"
    if text.endswith("?") or text.endswith("？"):
        return "thinking"

    for keyword, emotion in TEXT_EMOTION_HINTS.items():
        if keyword in text_lower:
            return emotion
    return ""


def analyze_text_action(text: str) -> str:
    """Auto-detect action from dialogue text content."""
    text_lower = text.lower()
    for keyword, action in TEXT_ACTION_HINTS.items():
        if keyword in text_lower:
            return action
    return ""


_LLM_FACE_CACHE = {}

async def resolve_face(emotion: str, text: str, available_faces: list[str]) -> str:
    """Resolve emotion string to best matching face name. Try local Ollama first, then Cloud."""
    fallback = "微笑" if "微笑" in available_faces else available_faces[0] if available_faces else "微笑"
    
    emotion_lower = emotion.lower().strip() if emotion else ""
    
    # 1. Bypass AI if perfect exact match
    if emotion_lower in available_faces:
        return emotion_lower
    mapped = EMOTION_FACE_MAP.get(emotion_lower)
    if mapped and mapped in available_faces:
        return mapped

    # 2. Check cache
    cache_key = f"face_{emotion_lower}_{hash(text)}_{len(available_faces)}"
    if cache_key in _LLM_FACE_CACHE:
        return _LLM_FACE_CACHE[cache_key]

    # 3. Try local Ollama first (non-blocking, fast)
    try:
        from backend.core.ollama_client import get_ollama_client
        ollama = get_ollama_client()
        if await ollama.is_available():
            logger.debug("[FaceResolver] Trying local Ollama for face resolution...")
            result = await _resolve_face_local(ollama, emotion, text, available_faces, fallback)
            if result:
                _LLM_FACE_CACHE[cache_key] = result
                return result
    except Exception as e:
        logger.debug(f"[FaceResolver] Local attempt failed: {e}")

    # 4. Fallback to Cloud API (Gemini)
    try:
        from google import genai
        from backend.core.ai_config import get_ai_config
        config = get_ai_config()
        
        if config.has_api_key and config.has_valid_quota:
            max_attempts = max(1, config.total_keys)
            for attempt in range(max_attempts):
                try:
                    def _call_llm():
                        client = genai.Client(api_key=config.api_key)
                        prompt = (
                            "Bạn là Trợ lý Đạo diễn. Hãy chọn CHÍNH XÁC một tên Face tiếng Trung từ danh sách có sẵn để diễn tả biểu cảm phù hợp nhất.\n"
                            f"Gợi ý cảm xúc (nếu có): '{emotion}'\n"
                            f"Câu thoại nhân vật đang nói: '{text}'\n"
                            f"Danh sách Face: {available_faces}\n"
                            "CHỈ trả về đúng 1 tên Face từ danh sách, không ngoặc kép, không giải thích."
                        )
                        target_model = config.get_rotated_model(attempt)
                        response = client.models.generate_content(model=target_model, contents=prompt)
                        return response.text.strip()
                        
                    res = await asyncio.to_thread(_call_llm)
                    
                    if res in available_faces:
                        _LLM_FACE_CACHE[cache_key] = res
                        return res
                    else:
                        import difflib
                        matches = difflib.get_close_matches(res, available_faces, n=1, cutoff=0.3)
                        if matches:
                            _LLM_FACE_CACHE[cache_key] = matches[0]
                            return matches[0]
                    break # Success, exit retry loop
                    
                except Exception as e:
                    msg = str(e).lower()
                    if "429" in msg or "quota" in msg or "resource_exhausted" in msg or "503" in msg or "unavailable" in msg:
                        if config.rotate_key() and attempt < max_attempts - 1:
                            import time
                            time.sleep(1.5)
                            continue
                    logger.warning(f"Face resolving LLM failed on attempt {attempt}: {e}")
                    break # Critical failure, exit retry loop
    except Exception as e:
        logger.warning(f"Face resolving outer loop failed: {e}")

    # 5. Fallback to basic keyword matching
    search_corpus = f"{emotion_lower} {text.lower()}"
    for keyword, face in EMOTION_FACE_MAP.items():
        if keyword in search_corpus and face in available_faces:
            _LLM_FACE_CACHE[cache_key] = face
            return face

    # 6. Pseudo-random safe face based on text length
    safe_faces = ["说话", "微笑", "自信", "无表情", "疑惑", "叹气", "严肃"]
    available_safe = [f for f in safe_faces if f in available_faces]
    if available_safe and text:
        chosen = available_safe[hash(text) % len(available_safe)]
        _LLM_FACE_CACHE[cache_key] = chosen
        return chosen

    _LLM_FACE_CACHE[cache_key] = fallback
    return fallback


async def _resolve_face_local(ollama, emotion: str, text: str, available_faces: list[str], fallback: str) -> str | None:
    """Helper to resolve face using local Ollama (with short timeout)."""
    try:
        prompt = (
            "Bạn là Trợ lý Đạo diễn. Hãy chọn CHÍNH XÁC một tên Face từ danh sách.\n"
            f"Cảm xúc: '{emotion}'\n"
            f"Câu thoại: '{text}'\n"
            f"Danh sách Face: {available_faces}\n"
            "Chỉ trả về tên Face, không giải thích."
        )
        # Timeout after 5 seconds if Ollama is slow
        import asyncio
        result = await asyncio.wait_for(
            ollama.generate(prompt, temperature=0.2),
            timeout=5.0
        )
        if result and result.strip() in available_faces:
            logger.debug(f"[FaceResolver] Local: {result.strip()}")
            return result.strip()
    except asyncio.TimeoutError:
        logger.debug("[FaceResolver] Local timeout, using Cloud API")
    except Exception as e:
        logger.debug(f"[FaceResolver] Local failed: {e}")
    return None


_LLM_POSE_CACHE = {}

async def resolve_pose(action: str, text: str, available_poses: list[str]) -> str:
    """Resolve action to best matching pose. Try local Ollama (optional), fallback to Cloud."""
    fallback = "站立" if "站立" in available_poses else available_poses[0] if available_poses else "站立"
    
    action_lower = action.lower().strip() if action else ""
    
    # 1. Exact match
    if action_lower in available_poses:
        return action_lower
    mapped = ACTION_POSE_MAP.get(action_lower)
    if mapped and mapped in available_poses:
        return mapped

    # 2. Check cache
    cache_key = f"pose_{action_lower}_{hash(text)}_{len(available_poses)}"
    if cache_key in _LLM_POSE_CACHE:
        return _LLM_POSE_CACHE[cache_key]

    # 3. Try local Ollama first (skip quickly if unavailable)
    try:
        from backend.core.ollama_client import get_ollama_client
        ollama = get_ollama_client()
        # Health check already done, skip if offline
        if ollama._is_healthy:
            logger.debug("[PoseResolver] Trying local Ollama...")
            result = await _resolve_pose_local(ollama, action, text, available_poses, fallback)
            if result:
                _LLM_POSE_CACHE[cache_key] = result
                return result
    except Exception as e:
        logger.debug(f"[PoseResolver] Local skip: {e}")

    # 4. Fallback to Cloud API (Gemini)
    try:
        from google import genai
        from backend.core.ai_config import get_ai_config
        config = get_ai_config()
        if config.has_api_key and config.has_valid_quota:
            max_attempts = max(1, config.total_keys)
            for attempt in range(max_attempts):
                try:
                    def _call_llm():
                        client = genai.Client(api_key=config.api_key)
                        prompt = (
                            "Bạn là Trợ lý Đạo diễn. Hãy chọn CHÍNH XÁC một tên Pose (hành động/tư thế) tiếng Trung từ danh sách có sẵn để phù hợp nhất với ngữ cảnh.\n"
                            f"Gợi ý hành động (nếu có): '{action}'\n"
                            f"Câu thoại nhân vật đang nói: '{text}'\n"
                            f"Danh sách Pose: {available_poses}\n"
                            "CHỈ trả về đúng 1 tên Pose từ danh sách, không ngoặc kép, không giải thích."
                        )
                        target_model = config.get_rotated_model(attempt)
                        response = client.models.generate_content(model=target_model, contents=prompt)
                        return response.text.strip()
                        
                    res = await asyncio.to_thread(_call_llm)
                    
                    if res in available_poses:
                        _LLM_POSE_CACHE[cache_key] = res
                        return res
                    else:
                        import difflib
                        matches = difflib.get_close_matches(res, available_poses, n=1, cutoff=0.3)
                        if matches:
                            _LLM_POSE_CACHE[cache_key] = matches[0]
                            return matches[0]
                    break
                except Exception as e:
                    msg = str(e).lower()
                    if "429" in msg or "quota" in msg or "resource_exhausted" in msg or "503" in msg or "unavailable" in msg:
                        if config.rotate_key() and attempt < max_attempts - 1:
                            import time
                            time.sleep(1.5)
                            continue
                    logger.warning(f"Pose resolving LLM failed on attempt {attempt}: {e}")
                    break
    except Exception as e:
        logger.warning(f"Pose resolving outer loop failed: {e}")

    # 5. Fallback to basic keyword matching
    search_corpus = f"{action_lower} {text.lower()}"
    for keyword, pose in ACTION_POSE_MAP.items():
        if keyword in search_corpus and pose in available_poses:
            _LLM_POSE_CACHE[cache_key] = pose
            return pose

    # 6. Pseudo-randomly pick safe idle poses
    safe_poses = ["站立", "手指向前", "叉腰", "摊开手", "疑惑", "抱胸", "介绍"]
    available_safe_poses = [p for p in safe_poses if p in available_poses]
    if available_safe_poses and text:
        chosen_pose = available_safe_poses[len(text) % len(available_safe_poses)]
        _LLM_POSE_CACHE[cache_key] = chosen_pose
        return chosen_pose

    _LLM_POSE_CACHE[cache_key] = fallback
    return fallback


async def _resolve_pose_local(ollama, action: str, text: str, available_poses: list[str], fallback: str) -> str | None:
    """Helper to resolve pose using local Ollama (with short timeout)."""
    try:
        prompt = (
            "Bạn là Trợ lý Đạo diễn. Hãy chọn CHÍNH XÁC một tên Pose từ danh sách.\n"
            f"Hành động: '{action}'\n"
            f"Câu thoại: '{text}'\n"
            f"Danh sách Pose: {available_poses}\n"
            "Chỉ trả về tên Pose, không giải thích."
        )
        # Timeout after 5 seconds if Ollama is slow
        import asyncio
        result = await asyncio.wait_for(
            ollama.generate(prompt, temperature=0.2),
            timeout=5.0
        )
        if result and result.strip() in available_poses:
            logger.debug(f"[PoseResolver] Local: {result.strip()}")
            return result.strip()
    except asyncio.TimeoutError:
        logger.debug("[PoseResolver] Local timeout, using Cloud API")
    except Exception as e:
        logger.debug(f"[PoseResolver] Local failed: {e}")
    return None


def _emotion_to_bubble(emotion: str) -> str:
    """Map emotion → comic speech bubble style.
    
    Used to select the visual style of speech bubbles in manga/comic rendering:
    - speech: Normal rounded bubble (default)
    - shout: Spiky/jagged bubble for yelling or strong emotions
    - thought: Cloud-shaped bubble for internal monologue
    - whisper: Dashed-outline bubble for quiet speech
    """
    shout_emotions = {
        "angry", "furious", "shocked", "surprised", "scared",
        "giận", "hét", "sốc", "kinh ngạc", "điên", "tức giận",
        "hoảng", "la hét", "phẫn nộ",
    }
    thought_emotions = {
        "thinking", "confused", "pensive", "wondering",
        "nghĩ", "phân vân", "suy nghĩ", "bối rối", "trầm ngâm",
    }
    whisper_emotions = {
        "whisper", "shy", "embarrassed", "nervous",
        "thì thầm", "bí mật", "ngại", "xấu hổ", "rụt rè",
    }
    
    em = emotion.lower().strip() if emotion else ""
    if em in shout_emotions:
        return "shout"
    if em in thought_emotions:
        return "thought"
    if em in whisper_emotions:
        return "whisper"
    return "speech"


def _pick_available(name: str, available: list[str], fallback: str = "站立") -> str:
    """Return name if available, otherwise fallback."""
    if name in available:
        return name
    return fallback if fallback in available else (available[0] if available else fallback)


# ══════════════════════════════════════════════
#  Script-to-Scene Engine (Cinematic Staging)
# ══════════════════════════════════════════════

async def build_scene_from_script(
    lines: list[ScriptLine],
    character_map: dict[str, str],
    tts_lines: list[dict] | None = None,
    registry: AssetRegistry | None = None,
    background_id: str | None = None,
    world_memory: dict[str, dict] | None = None,
) -> SceneGraph:
    """
    Build a cinematic SceneGraph from script lines.

    Features:
    1. Characters positioned on stage, move to center when speaking
    2. Pose changes based on text analysis + action hints
    3. Face changes based on emotion hints + text analysis
    4. Lip-sync face swaps during speaking
    5. Listener reactions (non-speaking chars react)
    6. Smooth position transitions via x/y keyframes
    """
    graph = SceneGraph()

    if not registry:
        raise ValueError("AssetRegistry required")

    from backend.core.scene_graph.node import SceneNode
    from backend.core.scene_graph.specialized_nodes import BackgroundLayerNode, CameraNode, TextNode
    import re

    # ── Add Main Camera ──
    camera_node = CameraNode(id="camera_main", name="Main Camera", z_index=0)
    camera_node.set_position(9.6, 5.4)
    camera_node.set_scale(1.0)
    graph.add_node(camera_node)
    # ── Step 0: Add Background (Supports FLA Extracted Layers) ──
    if background_id:
        stages_dir = os.path.join(registry.storage_dir, "stages")
        bg_files = []
        if os.path.exists(stages_dir):
            bg_files = [f for f in os.listdir(stages_dir) if f.startswith(background_id) and f.endswith(".png")]
        
        def get_element_idx(fname):
            m = re.search(r'element_(\d+)', fname)
            return int(m.group(1)) if m else 0
        
        # ── Strategy: Use sub-crop files (_element_X_1.png) which have CORRECT per-layer
        #    transparency. The base _element_X.png files are fully opaque canvas composites
        #    (100% opaque) created by Adobe Animate's exportPNG, which flattens ALL visible
        #    layers. Sub-crops have proper alpha (e.g. element_2_1.png is only 5% opaque,
        #    containing just one small prop with transparent surroundings).
        #
        #    For each unique element index, pick the first animation frame (_1.png) as
        #    the static layer to display.
        
        # Collect sub-crop files: _element_X_1.png (first animation frame per element)
        sub_crop_files = [
            f for f in bg_files
            if "_element_" in f and re.search(r'_element_\d+_1\.png$', f)
        ]
        
        # Also gather base element files as fallback
        base_element_files = [
            f for f in bg_files
            if "_element_" in f and not re.search(r'_element_\d+_\d+\.png$', f)
        ]
        
        # Decide which set to use:
        # If sub-crops exist, use them (they have correct transparency)
        # Otherwise fall back to base elements
        if sub_crop_files:
            element_files = sub_crop_files
            logger.info(f"Using sub-crop layer files (with transparency) for {background_id}")
        elif base_element_files:
            element_files = base_element_files
            logger.info(f"Using base element files (may be opaque) for {background_id}")
        else:
            element_files = []
        
        layer_z_map = {}
        if element_files:
            # Sort by element index (1 = back, 10 = front)
            element_files.sort(key=get_element_idx)
            num_layers = len(element_files)
            
            # Smart Z-Index Distribution for 2.5D:
            # Back layers < 0 (Sky, Wall)
            # Fore layers > 10, 20 (Props, Trees) so characters (z=10,20) can stand behind them!
            start_z = -50
            z_step = 15
            
            for i, fname in enumerate(element_files):
                idx = get_element_idx(fname)
                layer_z = start_z + (i * z_step)
                layer_z_map[f"element_{idx}"] = layer_z
                bg_node = BackgroundLayerNode(
                    id=f"bg-{background_id}-{idx}",
                    name=f"Layer {idx}",
                    asset_path=f"/static/stages/{fname}",
                    parallax_speed=max(0.05, 1.0 - (num_layers - i)*0.1),
                    z_index=layer_z
                )
                bg_node.set_position(9.6, 5.4) 
                bg_node.set_scale(1.0)
                graph.add_node(bg_node)
            logger.info(f"Added FLA Background {background_id}: {num_layers} layers with Z-indexes")
        else:
            # Fallback to single static background
            bg_url = f"/static/stages/{background_id}.png"
            if bg_files:
                bg_url = f"/static/stages/{bg_files[0]}"
                
            bg_node = BackgroundLayerNode(
                id=f"bg-{background_id}",
                asset_path=bg_url,
                parallax_speed=1.0, # Must be 1.0 to track the camera perfectly alongside characters
                z_index=-100
            )
            bg_node.set_position(9.6, 5.4) 
            bg_node.set_scale(1.0)
            graph.add_node(bg_node)
            logger.info(f"Added flat background {background_id} -> {bg_url}")

    # ── Step 1: Add characters (with Stage-Aware Positioning) ──
    unique_chars = list(dict.fromkeys(line.character for line in lines))
    char_nodes: dict[str, str] = {}  # character name → node_id
    char_home_x: dict[str, float] = {}  # character name → home X position
    char_infos: dict[str, object] = {}

    # State tracking for continuity
    # state: {x, y, scale, z_index}
    char_states: dict[str, dict] = {}

    # ── Load or auto-generate stage analysis for smart positioning ──
    stage_analysis = None
    standable_regions = []   # [{x, y, name, can_sit}] where characters can stand
    interaction_points = []  # [{x, y, name}] interesting objects to stand NEAR (tables, counters, cars)
    if background_id:
        from backend.routers.stages import get_cached_analysis, save_analysis_cache, STAGES_DIR
        stage_analysis = get_cached_analysis(background_id)

        # Auto-analyze if no cache exists (one-time Vision AI call, then cached forever)
        if not stage_analysis:
            logger.info(f"No cached analysis for '{background_id}' — running auto-analysis...")
            try:
                import base64 as b64mod
                from backend.core.agents.stage_analyzer_agent import analyze_stage_elements

                all_stage_files = os.listdir(STAGES_DIR)
                # Prefer sub-crop files (_element_X_1.png) with correct transparency
                element_files = [
                    f for f in all_stage_files
                    if f.startswith(background_id) and f.endswith(".png")
                    and "_element_" in f
                    and re.search(r'_element_\d+_1\.png$', f)
                ]
                # Fallback to base elements if no sub-crops
                if not element_files:
                    element_files = [
                        f for f in all_stage_files
                        if f.startswith(background_id) and f.endswith(".png")
                        and "_element_" in f
                        and not re.search(r'_element_\d+_\d+\.png$', f)
                    ]
                if element_files:
                    def get_idx(fname):
                        m = re.search(r'element_(\d+)', fname)
                        return int(m.group(1)) if m else 0
                    element_files.sort(key=get_idx)

                    layer_images = []
                    
                    # Try to find the composite preview image (____1.png) to use as Image 0
                    composite_file = f"{background_id}____1.png"
                    composite_path = os.path.join(STAGES_DIR, composite_file)
                    if os.path.exists(composite_path):
                        with open(composite_path, "rb") as f:
                            comp_b64 = b64mod.b64encode(f.read()).decode("utf-8")
                        layer_images.append({
                            "id": "composite_preview",
                            "label": "Full Scene Composite",
                            "image_base64": comp_b64,
                            "type": "background",
                            "zIndex": -100
                        })
                    for fname in element_files:
                        fpath = os.path.join(STAGES_DIR, fname)
                        with open(fpath, "rb") as f:
                            img_b64 = b64mod.b64encode(f.read()).decode("utf-8")
                        idx = get_idx(fname)
                        layer_images.append({
                            "id": f"element_{idx}",
                            "label": f"Layer {idx}",
                            "image_base64": img_b64,
                            "type": "background" if idx <= 2 else "prop",
                            "zIndex": idx,
                        })

                    # Await the Vision API cleanly
                    result = await analyze_stage_elements(layer_images)
                    stage_analysis = result.to_dict()
                    stage_analysis["stage_id"] = background_id
                    stage_analysis["num_layers"] = len(element_files)
                    stage_analysis["layer_files"] = element_files
                    save_analysis_cache(background_id, stage_analysis)
                    logger.info(f"Auto-analysis complete: {stage_analysis.get('scene_description', '')}")
            except Exception as e:
                logger.warning(f"Auto stage analysis failed (continuing with fallback): {e}")

        if stage_analysis:
            logger.info(f"Using stage analysis for '{background_id}': "
                        f"scene_type={stage_analysis.get('scene_type', '?')}, "
                        f"mood={stage_analysis.get('mood', '?')}")
            for elem in stage_analysis.get("elements", []):
                # Convert bbox percentages to world coordinates (canvas = 19.2 x 10.8 units)
                # We add these to the element dict so the AI Agents receive normalized units
                elem["canvas_cx"] = round((elem.get("bbox_x", 0) + elem.get("bbox_w", 100) / 2) / 100 * 19.2, 2)
                elem["canvas_cy"] = round((elem.get("bbox_y", 0) + elem.get("bbox_h", 100) / 2) / 100 * 10.8, 2)
                elem["canvas_w"] = round((elem.get("bbox_w", 100) / 100 * 19.2), 2)
                elem["canvas_h"] = round((elem.get("bbox_h", 100) / 100 * 10.8), 2)

                bbox_cx = elem["canvas_cx"]
                bbox_cy = elem["canvas_cy"]

                layer_id = elem.get("layer_id", "")
                actual_z = layer_z_map.get(layer_id, 0)

                if elem.get("can_stand_on") or elem.get("can_sit_on"):
                    standable_regions.append({
                        "x": bbox_cx,
                        "y": bbox_cy,
                        "name": elem.get("name_en", ""),
                        "can_sit": elem.get("can_sit_on", False),
                        "z_index": actual_z + 2
                    })
                    logger.info(f"  Standable: '{elem.get('name_en')}' at ({bbox_cx:.1f}, {bbox_cy:.1f}, z={actual_z+2})")

                # Collect interaction points: objects characters should stand NEAR
                cat = elem.get("category", "")
                if cat in ("furniture", "vehicle", "prop", "door", "window", "stairs"):
                    interaction_points.append({
                        "x": bbox_cx,
                        "y": bbox_cy,
                        "name": elem.get("name_en", ""),
                        "category": cat,
                        "z_index": actual_z + 5
                    })
                    logger.info(f"  Interaction: '{elem.get('name_en')}' ({cat}) at ({bbox_cx:.1f}, {bbox_cy:.1f}, z={actual_z+5})")

    num_chars = len(unique_chars)
    
    # ── Swarm Intelligence Framework (MiroFish style) ──
    negotiated_positions = {}
    if unique_chars:
        # Collect characters info for negotiation
        characters_info = []
        for cname in unique_chars:
            chint = ""
            for line in lines:
                if getattr(line, "character", "") == cname:
                    chint = getattr(line, "position_hint", "")
                    if not chint:
                        emotion_str = getattr(line, "emotion", "")
                        text_str = getattr(line, "text", "")
                        chint = f"[{emotion_str}] {text_str}" if emotion_str else text_str
                    break
            characters_info.append({"name": cname, "hint": chint})
            
        from backend.core.agents.swarm_negotiator_agent import SwarmNegotiatorAgent
        from backend.core.agents.swarm_critic_agent import SwarmCriticAgent

        # Self-Refining Loop (Mission Control's Aegis Review concept)
        # negotiate_positions_async: 🏠 Ollama first → ☁️ Gemini fallback
        max_retries = 2
        for attempt in range(max_retries):
            negotiated_positions = await SwarmNegotiatorAgent.negotiate_positions_async(
                characters_info, stage_analysis, layer_z_map, world_memory
            ) or {}
            
            if not negotiated_positions:
                break
            
            # Try local Critic first (Ollama optional), fallback to Cloud API
            try:
                review = await SwarmCriticAgent.review_positions_with_local(
                    characters_info, stage_analysis, negotiated_positions
                )
            except Exception as e:
                logger.warning(f"[Aegis] Critic review error: {e}, using sync fallback")
                review = SwarmCriticAgent.review_positions(
                    characters_info, stage_analysis, negotiated_positions
                )
            
            if review.get("status") == "PASS":
                logger.info("[Aegis] Positions passed Critic review.")
                break
            else:
                logger.warning(f"[Aegis] Critic rejected positions (Attempt {attempt+1}/{max_retries}): {review.get('feedback')}")
                if attempt < max_retries - 1:
                    # Inject feedback into next iteration's world memory as a hint
                    world_memory["__CRITIC_FEEDBACK__"] = {"note": review.get("feedback")}

    for i, char_name in enumerate(unique_chars):
        char_id = character_map.get(char_name)
        if not char_id:
            logger.warning(f"No mapping for character '{char_name}', skipping")
            continue

        char_info = registry.get_character(char_id)
        if not char_info:
            char_info = registry.find_character(char_id)
        if not char_info:
            logger.warning(f"Character '{char_id}' not found in registry")
            continue

        char_infos[char_name] = char_info

        # ── Smart Position: use stage analysis if available ──
        home_x = 9.6  # Default center
        home_y = 7.5  # Default y
        home_z = i * 10 # Default fallback z

        if char_name in negotiated_positions:
            np = negotiated_positions[char_name]
            home_x = float(np.get("start_x", np.get("x", 9.6)))
            home_z = float(np.get("z_index", i * 10))
            
            # Action Trajectory Memory
            target_x = float(np.get("target_x", home_x))
            action_type = np.get("action", "stand")
            effects = np.get("effects", [])
            char_states[char_name] = {"target_x": target_x, "action": action_type, "effects": effects}
            
            logger.info(f"[Swarm] Placed '{char_name}' at x={home_x}, z={home_z} (Trajectory to {target_x})")
        elif world_memory and char_name in world_memory:
            # Revert to last known position
            home_x = float(world_memory[char_name].get("x", 9.6))
            home_z = float(world_memory[char_name].get("z_index", i * 10))
            logger.info(f"[Memory] Relocated '{char_name}' to x={home_x}, z={home_z}")
        elif standable_regions:
            # Thuật toán: So khớp Ngữ nghĩa giữa "position_hint" của kịch bản và "name" của Background
            char_hint = ""
            for line in lines:
                if getattr(line, "character", "") == char_name:
                    char_hint = getattr(line, "position_hint", "").lower()
                    break

            best_pt = standable_regions[i % len(standable_regions)] # Backup: Round Robin
            best_score = -1
            if char_hint:
                # Tìm point có độ tương đồng từ vựng cao nhất
                import string
                clean_hint = char_hint.translate(str.maketrans('', '', string.punctuation))
                hint_words = set(w for w in clean_hint.split() if len(w) > 2)
                
                for pt in standable_regions:
                    desc = pt.get("name", "").lower()
                    clean_desc = desc.translate(str.maketrans('', '', string.punctuation))
                    desc_words = set(w for w in clean_desc.split() if len(w) > 2)
                    
                    score = len(hint_words.intersection(desc_words))
                    if score > best_score:
                        best_score = score
                        best_pt = pt
            
            # Chọn Semantic Standing Point xuất sắc nhất
            pt = best_pt

            # pt is already in WebM world space (19.2 x 10.8) from stage analysis
            home_x = pt.get("x", 9.6)
            home_y = pt.get("y", 7.5)
            
            # Kẹp bánh mỳ vào Z-Index của Layer AI đã scan
            home_z = pt.get("z_index", i * 10)
            
            logger.info(f"  Visual Director Placed '{char_name}' at {pt.get('description', '')} ({home_x:.1f}, {home_y:.1f}, z={home_z}) MatchScore: {best_score}")
            
        elif standable_regions or interaction_points:
            # Strategy: place characters at standable positions,
            # preferring locations NEAR interaction objects (tables, doors, cars).
            
            if standable_regions:
                # Pick a standable region for this character
                region = standable_regions[i % len(standable_regions)]
                home_x = region["x"]
                home_y = region["y"]
                home_z = region["z_index"]

                # If there are interaction points, nudge toward the nearest one
                if interaction_points:
                    nearest_ip = min(interaction_points, 
                                     key=lambda ip: abs(ip["x"] - region["x"]) + abs(ip["y"] - region["y"]))
                    # Stand halfway between the standable surface and the interaction object
                    home_x = (region["x"] + nearest_ip["x"]) / 2
                    # But stay at the standable surface's Y (don't float)
                    home_y = region["y"]
                    logger.info(f"  Nudging '{char_name}' toward '{nearest_ip['name']}' ({nearest_ip['category']})")

            elif interaction_points:
                # No standable regions found, but we have interaction points
                # Place character slightly in front of the interaction object
                ip = interaction_points[i % len(interaction_points)]
                home_x = ip["x"]
                home_y = min(ip["y"] + 2.0, 9.5)  # Stand below/in-front of object
                home_z = ip["z_index"]
                logger.info(f"  Placing '{char_name}' near interaction: '{ip['name']}'")

            # Spread multiple characters to avoid overlap and stagger Z-Depth
            if num_chars > 1:
                # Total spread width: ensure at least 2.5 units per character space
                spread = max(4.0, (num_chars - 1) * 2.5)
                offset = (i - (num_chars - 1) / 2) * spread / max(num_chars - 1, 1)
                home_x = max(2.0, min(17.2, home_x + offset))
                
                # Z-Depth Sandwiching: Stagger Z-index to prevent flat overlap
                # if characters end up sharing the same standable region.
                z_stagger = 10 if (i % 2 == 1) else 0
                home_z = home_z + z_stagger

            # Clamp to safe zone (don't go off-screen)
            home_x = max(2.0, min(17.2, home_x))
            home_y = max(3.0, min(9.5, home_y))

            logger.info(f"Stage-aware: '{char_name}' final position ({home_x:.1f}, {home_y:.1f})")
        else:
            # Fallback: no analysis available — spread evenly
            if num_chars == 1:
                home_x = 9.6
            elif num_chars == 2:
                home_x = 5.0 + (i * 9.2)  # 5.0 and 14.2
            else:
                home_x = 3.0 + (i * 13.2 / max(num_chars - 1, 1))
            home_y = 7.5


        char_home_x[char_name] = home_x
        # Initial Facing: if x > 9.6, face left (-0.25). if x <= 9.6, face right (0.25)
        initial_scale_x = -0.25 if home_x > 9.6 else 0.25

        state = char_states.get(char_name, {})
        state.update({
            "x": home_x,
            "y": home_y,
            "home_x": home_x,
            "scale_x": initial_scale_x,
            "scale_y": 0.25,
            "z_index": home_z
        })
        char_states[char_name] = state

        from backend.core.scene_graph.tools import SceneToolExecutor
        executor = SceneToolExecutor(graph, asset_registry=registry)
        result = executor.execute("add_character", {
            "character_id": char_info.id,
            "name": char_name,
            "x": home_x,
            "y": home_y,
            "scale": 0.25,
        })

        if result.success:
            import re as _re
            match = _re.search(r'id:\s*(\S+)\)', result.to_str())
            if match:

                char_nodes[char_name] = match.group(1)
                
                # Update initial properties cleanly
                node = graph.get_node(char_nodes[char_name])
                if node:
                    node.set_z_index(char_states[char_name]["z_index"])
                    node.set_scale_xy(initial_scale_x, 0.25)
                    
                    # Apply Swarm VFX Skills if available
                    effects = char_states[char_name].get("effects", [])
                    if "camera_shake" in effects:
                        graph.metadata["camera_shake"] = True
                        logger.info(f"  [Swarm Skill] {char_name} triggered 'camera_shake' effect")
                    if "flash_screen" in effects:
                        graph.metadata["flash_screen"] = True
                        logger.info(f"  [Swarm Skill] {char_name} triggered 'flash_screen' effect")
                    if "explosion" in effects:
                        graph.metadata["explosions"] = True
                        logger.info(f"  [Swarm Skill] {char_name} triggered 'explosion' effect")
                    if "rain" in effects:
                        graph.metadata["weather"] = "rain"
                        logger.info(f"  [Swarm Skill] {char_name} triggered 'rain' effect")
                    if "dark_vignette" in effects:
                         graph.metadata["vignette"] = True
                logger.info(f"Added character '{char_name}' at x={home_x:.1f}")

    # ── Step 2: Cinematic staging per line ──
    # XÓA BỎ Lệnh "Kéo diễn viên vào giữa sân khấu" (SPEAKER_PULL). Nhân vật phải đứng yên tại vị trí ngữ nghĩa.
    current_time = 0.0
    last_speaker = None
    line_idx_per_char: dict[str, int] = {}  # Count lines spoken per character

    # ══ CM1: Per-Character ActorAgent — Each character gets its OWN AI agent ══
    from backend.core.agents.actor_agent import ActorAgent

    # ── Build line dicts (base) ──
    all_lines_dict = []
    for line in lines:
        all_lines_dict.append({
            "character": line.character,
            "text": line.text,
            "emotion": getattr(line, 'emotion', '') or analyze_text_emotion(line.text),
            "action": getattr(line, 'action', '') or analyze_text_action(line.text),
        })

    # ── 🆕 StageDirectionAgent: Enrich script with emotion/action/stage_note ──
    # Runs on Ollama. Falls back gracefully if Ollama is down.
    try:
        from backend.core.agents.stage_direction_agent import StageDirectionAgent
        scene_ctx = stage_analysis.get('scene_description', '') if stage_analysis else ''
        all_lines_dict = await StageDirectionAgent.enrich_lines(all_lines_dict, scene_context=scene_ctx)
    except Exception as _sde:
        logger.warning(f"[StageDirectionAgent] Skipped enrichment: {_sde}")
    
    # Create one ActorAgent per character and plan performances in parallel
    actor_plans: dict[str, list[dict]] = {}  # char_name → performance plan
    for cname in unique_chars:
        cinfo = char_infos.get(cname)
        if not cinfo:
            continue
        blueprint_data = {}
        if stage_analysis:
            blueprint_data = {
                "ascii_map": stage_analysis.get("ascii_map", []),
                "spatial_grid": stage_analysis.get("spatial_grid", {})
            }
            
        actor = ActorAgent(
            char_name=cname,
            available_poses=cinfo.pose_names,
            available_faces=cinfo.face_names,
            blueprint_context=json.dumps(blueprint_data, ensure_ascii=False, indent=2) if blueprint_data else "",
        )
        plan = await actor.plan_performance(all_lines_dict)
        if plan:
            actor_plans[cname] = plan
    
    logger.info(f"[CM1 ActorAgent] Planned performances for {len(actor_plans)} characters")

    # ══ CM3: Special Agent Army — Camera Director ══
    from backend.core.agents.camera_director_agent import CameraDirectorAgent
    blueprint_desc = json.dumps(blueprint_data, ensure_ascii=False, indent=2) if stage_analysis else ""
    camera_plan = await CameraDirectorAgent.generate_camera_plan(
        all_lines=all_lines_dict,
        negotiated_positions=negotiated_positions,
        blueprint_context=blueprint_desc
    )
    logger.info(f"[CM3 CameraDirectorAgent] Generated {len(camera_plan)} camera keyframes")

    # ── 🆕 SoundDirectorAgent: Plan BGM + SFX for the scene ──
    sound_plan = {"bgm": [], "sfx": []}
    try:
        from backend.core.agents.sound_director_agent import SoundDirectorAgent
        dominant_emotion = all_lines_dict[0].get('emotion', 'neutral') if all_lines_dict else 'neutral'
        sound_plan = await SoundDirectorAgent.plan_audio(
            all_lines=all_lines_dict,
            dominant_emotion=dominant_emotion,
        )
    except Exception as _snd:
        logger.warning(f"[SoundDirectorAgent] Skipped: {_snd}")

    for idx, line in enumerate(lines):
        node_id = char_nodes.get(line.character)
        if not node_id:
            continue

        char_info = char_infos.get(line.character)
        available_poses = char_info.pose_names if char_info else []
        available_faces = char_info.face_names if char_info else []

        movement = "idle"

        # Track line count per character
        line_idx_per_char[line.character] = line_idx_per_char.get(line.character, 0) + 1
        char_line_num = line_idx_per_char[line.character]

        # ── Auto-detect emotion & action from text ──
        emotion = line.emotion or analyze_text_emotion(line.text)
        action = line.action or analyze_text_action(line.text)

        # ── CM1: Use ActorAgent's pre-planned pose/face for THIS character ──
        speaker_plan = actor_plans.get(line.character, [])
        if idx < len(speaker_plan):
            pose = speaker_plan[idx].get("pose", "站立")
            face = speaker_plan[idx].get("face", "微笑")
        else:
            # Fallback if plan is short
            pose = available_poses[idx % len(available_poses)] if available_poses else "站立"
            face = available_faces[idx % len(available_faces)] if available_faces else "微笑"

        # ── Timing ──
        if tts_lines and idx < len(tts_lines):
            start_time = tts_lines[idx].get("start_time", current_time)
            end_time = tts_lines[idx].get("end_time", start_time + 2.0)
        else:
            duration = max(1.5, len(line.text) * 0.1)
            start_time = current_time
            end_time = start_time + duration

        # Small transition time before speaking
        transition_time = 0.3
        speak_start = start_time + transition_time


        # ── Depth, Scale, Position Logic ──
        node = graph.get_node(node_id)
        if isinstance(node, CharacterNode):
            st = char_states[line.character]
            # Set up tracks
            for prop in ["x", "y", "scale_x", "scale_y", "z_index"]:
                node.keyframes.setdefault(prop, [])

            abs_scale = abs(st["scale_x"])
            
            # Apply Swarm movement logic (Action Trajectories)
            action_type = st.get("action", "stand")
            target_x = st.get("target_x", st["x"])
            
            if action_type == "walk" and target_x != st["x"]:
                # Pathfinding Trajectory - Walk
                pose = _pick_available("走路", available_poses)
                node.add_keyframe("x", start_time - 0.5, st["x"], "linear")
                node.add_keyframe("x", start_time + 1.5, target_x, "linear")
                st["x"] = target_x
            elif action_type == "run" and target_x != st["x"]:
                # Pathfinding Trajectory - Run
                pose = _pick_available("逃跑", available_poses)
                node.add_keyframe("x", start_time - 0.5, st["x"], "linear")
                node.add_keyframe("x", start_time + 0.8, target_x, "ease_out")
                st["x"] = target_x
            else:
                if num_chars > 1:
                    # Semantic Acting: Speaker stays firmly on their spot
                    if last_speaker and last_speaker != line.character:
                        prev_node_id = char_nodes.get(last_speaker)
                        prev_home = char_home_x.get(last_speaker, 9.6)
                        if prev_node_id:
                            # Simply keep them at their home
                            l_st = char_states.get(last_speaker)
                            if l_st:
                                l_st["x"] = l_st.get("target_x", prev_home)
                    
                    # Speaker stays firmly
                    node.add_keyframe("x", start_time, st["x"], "linear")
                    node.add_keyframe("x", speak_start, st["x"], "linear")

            # SMART FACING: Evaluate against other characters
            other_x_sum = 0
            count = 0
            for o_name, o_st in char_states.items():
                if o_name != line.character and o_st["y"] > 0:
                    other_x_sum += o_st["x"]
                    count += 1
            if count > 0:
                avg_other_x = other_x_sum / count
                if st["x"] < avg_other_x and st["scale_x"] < 0:
                    st["scale_x"] = abs(st["scale_x"])
                    node.add_keyframe("scale_x", start_time, st["scale_x"], "step")
                elif st["x"] > avg_other_x and st["scale_x"] > 0:
                    st["scale_x"] = -abs(st["scale_x"])
                    node.add_keyframe("scale_x", start_time, st["scale_x"], "step")

            # Always emit static or updated transform base keys
            node.add_keyframe("x", end_time + 0.1, st["x"], "linear")
            node.add_keyframe("y", end_time + 0.1, st["y"], "linear")
            node.add_keyframe("scale_x", end_time + 0.1, st["scale_x"], "linear")
            node.add_keyframe("scale_y", end_time + 0.1, st["scale_y"], "linear")
        
        # ── Camera Auto-Tracking ──
        camera_node.keyframes.setdefault("x", [])
        camera_node.keyframes.setdefault("y", [])
        camera_node.keyframes.setdefault("scale_x", [])
        camera_node.keyframes.setdefault("scale_y", [])

        # ── CM3: AI Camera Director ──
        cam_step = camera_plan[idx] if idx < len(camera_plan) else {}
        cam_type = cam_step.get("type", "wide_shot")
        # Safe parsing helper to handle AI LLM hallucinating lists instead of floats
        def _safe_float(val, default):
            if isinstance(val, list):
                if len(val) > 0:
                    try: return float(val[0])
                    except (ValueError, TypeError): pass
                return default
            try: return float(val)
            except (ValueError, TypeError): return default

        # Use AI suggested coordinates, limit to safe logical bounds just in case
        cam_x = _safe_float(cam_step.get("x", 9.6), 9.6)
        cam_y = _safe_float(cam_step.get("y", 5.4), 5.4)
        cam_scale = _safe_float(cam_step.get("zoom", 1.0), 1.0)
        cam_shake = cam_step.get("shake", False)
        # Clamp bounds
        cam_x = max(2.0, min(17.2, cam_x))
        cam_y = max(2.0, min(8.8, cam_y))
        cam_scale = max(0.8, min(2.5, cam_scale))
        
        logger.info(f"  -> Camera Director: {cam_type.upper()} target='{cam_step.get('target', '')}' (x={cam_x:.1f}, zoom={cam_scale:.2f})")

        # Apply shake effect if determined by AI
        if cam_shake and camera_node:
            camera_node.add_keyframe("x", speak_start + 0.1, cam_x + 0.2, "linear")
            camera_node.add_keyframe("y", speak_start + 0.1, cam_y + 0.2, "linear")
            camera_node.add_keyframe("x", speak_start + 0.2, cam_x - 0.2, "linear")
            camera_node.add_keyframe("y", speak_start + 0.2, cam_y - 0.2, "linear")

        prev_cam_x = camera_node.keyframes["x"][-1].value if camera_node.keyframes["x"] else 9.6
        prev_cam_y = camera_node.keyframes["y"][-1].value if camera_node.keyframes["y"] else 5.4
        prev_cam_scale = camera_node.keyframes["scale_x"][-1].value if camera_node.keyframes["scale_x"] else 1.0

        camera_node.add_keyframe("x", start_time, prev_cam_x, "linear")
        camera_node.add_keyframe("x", speak_start, cam_x, "easeOut")
        camera_node.add_keyframe("y", start_time, prev_cam_y, "linear")
        camera_node.add_keyframe("y", speak_start, cam_y, "easeOut")
        camera_node.add_keyframe("scale_x", start_time, prev_cam_scale, "linear")
        camera_node.add_keyframe("scale_x", speak_start, cam_scale, "easeOut")
        camera_node.add_keyframe("scale_y", start_time, prev_cam_scale, "linear")
        camera_node.add_keyframe("scale_y", speak_start, cam_scale, "easeOut")

        # ── Speech Bubble: Create comic-style bubble attached to speaking character ──
        # Uses bubble_style based on emotion for manga/comic visual identity.
        # The bubble follows the character's position via bubble_target_id.
        bubble_style = _emotion_to_bubble(emotion)
        bubble_node_id = char_nodes.get(line.character, "")
        
        # Position above the speaking character's head
        _bst = char_states.get(line.character, {})
        bubble_x = _bst.get("x", 9.6)
        bubble_y = max(1.0, _bst.get("y", 7.5) - 3.8)  # Above head, clamp to canvas
        
        line_sub_id = f"bubble_line_{idx}"
        line_sub = TextNode(
            id=line_sub_id,
            name=f"Bubble: {line.character}",
            content=line.text,
            speaker_name=line.character,
            bubble_style=bubble_style,
            bubble_target_id=bubble_node_id,
            font_size=0.28,
            color="#000000",
            text_align="center",
            z_index=9999,
        )
        line_sub.set_position(bubble_x, bubble_y)
        line_sub.set_scale(1.0)
        line_sub.opacity = 0.0
        # Timing: hidden → pop in at speak_start → visible → pop out at end
        line_sub.add_keyframe("opacity", max(0, speak_start - 0.1), 0.0, "step")
        line_sub.add_keyframe("opacity", speak_start, 1.0, "step")
        line_sub.add_keyframe("opacity", end_time, 1.0, "linear")
        line_sub.add_keyframe("opacity", end_time + 0.15, 0.0, "step")
        graph.add_node(line_sub)

        if isinstance(node, CharacterNode):
            # Set speaking pose + face
            node.add_frame(speak_start, {"pose": pose, "face": face})

            # Lip-sync during speaking (disabled by default for chibi/comic style)
            # Set enable_lipsync=True in metadata to re-enable for anime style
            _enable_lipsync = graph.metadata.get("enable_lipsync", False)
            if _enable_lipsync and "说话" in available_faces and "微笑" in available_faces:
                _add_lipsync_frames(node, speak_start, end_time, available_faces)

            # After speaking: neutral face + standard pose
            neutral_face = await resolve_face("neutral", "", available_faces)
            idle_pose = _pick_available("站立", available_poses)
            node.add_frame(end_time + 0.1, {"face": neutral_face, "pose": idle_pose})

        # ── Listener Reactions ──
        for other_name, other_node_id in char_nodes.items():
            if other_name == line.character:
                continue

            other_node = graph.get_node(other_node_id)
            other_info = char_infos.get(other_name)
            if not isinstance(other_node, CharacterNode) or not other_info:
                continue


            # Smart Facing for listeners too
            l_st = char_states.get(other_name)
            active_spkr_st = char_states.get(line.character)
            if l_st and active_spkr_st:
                if l_st["x"] < active_spkr_st["x"] and l_st["scale_x"] < 0:
                    l_st["scale_x"] = abs(l_st["scale_x"])
                    other_node.keyframes.setdefault("scale_x", [])
                    other_node.add_keyframe("scale_x", start_time, l_st["scale_x"], "step")
                elif l_st["x"] > active_spkr_st["x"] and l_st["scale_x"] > 0:
                    l_st["scale_x"] = -abs(l_st["scale_x"])
                    other_node.keyframes.setdefault("scale_x", [])
                    other_node.add_keyframe("scale_x", start_time, l_st["scale_x"], "step")
            other_poses = other_info.pose_names if other_info else []
            other_faces = other_info.face_names if other_info else []

            # ── CM1: Use ActorAgent's pre-planned LISTENER reaction ──
            listener_plan = actor_plans.get(other_name, [])
            if idx < len(listener_plan):
                listener_pose = listener_plan[idx].get("pose", "站立")
                listener_face = listener_plan[idx].get("face", "微笑")
            else:
                # Fallback
                listener_pose = other_poses[(idx + hash(other_name)) % len(other_poses)] if other_poses else "站立"
                listener_face = other_faces[(idx * 3) % len(other_faces)] if other_faces else "微笑"

            other_node.add_frame(speak_start, {"face": listener_face, "pose": listener_pose})

        last_speaker = line.character
        current_time = end_time + 0.4

    # ── Step 3: Return all characters to home at end ──
    for char_name, node_id in char_nodes.items():
        node = graph.get_node(node_id)
        if isinstance(node, CharacterNode):
            home_x = char_home_x.get(char_name, 9.6)
            node.keyframes.setdefault("x", [])
            node.add_keyframe("x", current_time, home_x, "ease_out",)
            # Final idle pose
            avail_poses = char_infos[char_name].pose_names if char_name in char_infos else []
            avail_faces = char_infos[char_name].face_names if char_name in char_infos else []
            node.add_frame(current_time, {
                "pose": _pick_available("站立", avail_poses),
                "face": _pick_available("微笑", avail_faces, "微笑"),
            })

    # ── 🆕 IdleAnimatorAgent: Inject breathing keyframes into silence gaps ──
    try:
        from backend.core.agents.idle_animator_agent import IdleAnimatorAgent
        # Compute per-line durations from TTS if available
        _line_durs = None
        if tts_lines and len(tts_lines) == len(all_lines_dict):
            _line_durs = [max(0.5, tl.get('end_time', 0) - tl.get('start_time', 0)) for tl in tts_lines]
        _dominant_emo = all_lines_dict[0].get('emotion', 'neutral') if all_lines_dict else 'neutral'
        for _cname, _nid in char_nodes.items():
            _cnode = graph.get_node(_nid)
            if isinstance(_cnode, CharacterNode):
                _gaps = IdleAnimatorAgent.compute_gaps(
                    all_lines=all_lines_dict,
                    char_name=_cname,
                    total_duration=graph.duration or current_time + 1.5,
                    line_durations=_line_durs,
                )
                IdleAnimatorAgent.inject_idle_keyframes_into_node(_cnode, _gaps, _dominant_emo)
    except Exception as _idle_e:
        logger.warning(f"[IdleAnimatorAgent] Skipped: {_idle_e}")

    # ── 🆕 SoundDirectorAgent: Inject AudioNodes from sound plan ──
    try:
        from backend.core.scene_graph.specialized_nodes import AudioNode
        for _cue in sound_plan.get('bgm', []):
            _anode = AudioNode(
                id=f"audio_bgm_{_cue.get('time', 0):.0f}",
                name=_cue.get('track', 'bgm'),
                audio_type='bgm',
                volume=float(_cue.get('volume', 0.7)),
                loop=True,
                z_index=-9999,
            )
            _anode.set_position(0, 0)
            _anode.start_time = float(_cue.get('time', 0))
            _anode.metadata['fade_in'] = float(_cue.get('fade_in', 1.0))
            graph.add_node(_anode)
        for _cue in sound_plan.get('sfx', []):
            _anode = AudioNode(
                id=f"audio_sfx_{_cue.get('time', 0):.1f}",
                name=_cue.get('track', 'sfx'),
                audio_type='sfx',
                volume=float(_cue.get('volume', 1.0)),
                loop=False,
                z_index=-9998,
            )
            _anode.set_position(0, 0)
            _anode.start_time = float(_cue.get('time', 0))
            graph.add_node(_anode)
        if sound_plan.get('bgm') or sound_plan.get('sfx'):
            logger.info(f"[SoundDirector] Injected {len(sound_plan['bgm'])} BGM + {len(sound_plan['sfx'])} SFX nodes")
    except Exception as _snd2:
        logger.warning(f"[SoundDirectorAgent] AudioNode injection failed: {_snd2}")

    # Zoom out camera at the end
    camera_node.add_keyframe("x", current_time, 9.6, "easeOut")
    camera_node.add_keyframe("y", current_time, 5.4, "easeOut")
    camera_node.add_keyframe("scale_x", current_time, 1.0, "easeOut")
    camera_node.add_keyframe("scale_y", current_time, 1.0, "easeOut")

    graph.duration = current_time + 1.5

    return graph


def _add_lipsync_frames(
    node: CharacterNode,
    start_time: float,
    end_time: float,
    available_faces: list[str],
    interval: float = 0.25,
):
    """
    Add lip-sync face swap keyframes during a speaking period.
    Alternates between 'talking' and 'closed mouth' faces.
    """
    mouth_open = LIPSYNC_FACES["mouth_open"]
    mouth_closed = LIPSYNC_FACES["mouth_closed"]
    mouth_wide = LIPSYNC_FACES.get("mouth_wide", mouth_open)

    if mouth_open not in available_faces:
        mouth_open = "大吼" if "大吼" in available_faces else available_faces[0]
    if mouth_closed not in available_faces:
        mouth_closed = "微笑" if "微笑" in available_faces else available_faces[0]

    t = start_time
    toggle = True
    while t < end_time - 0.05:
        face = mouth_open if toggle else mouth_closed
        if toggle and (int(t * 10) % 7 == 0) and mouth_wide in available_faces:
            face = mouth_wide
        node.add_frame(t, {"face": face})
        t += interval
        toggle = not toggle


# ══════════════════════════════════════════════
#  SRT Parser
# ══════════════════════════════════════════════

def parse_srt(srt_text: str) -> list[dict]:
    """Parse SRT subtitle text into structured lines.

    Returns list of {index, start_time, end_time, text, character}
    """
    blocks = re.split(r'\n\s*\n', srt_text.strip())
    results = []

    for block in blocks:
        lines = block.strip().split('\n')
        if len(lines) < 3:
            continue

        # Line 1: index number
        try:
            index = int(lines[0].strip())
        except ValueError:
            continue

        # Line 2: timestamps
        time_match = re.match(
            r'(\d{2}:\d{2}:\d{2}[,\.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,\.]\d{3})',
            lines[1].strip()
        )
        if not time_match:
            continue

        start_str, end_str = time_match.groups()
        start_time = _srt_time_to_seconds(start_str)
        end_time = _srt_time_to_seconds(end_str)

        # Line 3+: text (may have character prefix like "Character: text")
        text = ' '.join(lines[2:]).strip()
        character = ""

        # Try to extract character name (format: "Name: dialogue")
        colon_match = re.match(r'^([^:：]{1,20})[:\s：]\s*(.+)$', text)
        if colon_match:
            character = colon_match.group(1).strip()
            text = colon_match.group(2).strip()

        results.append({
            "index": index,
            "start_time": start_time,
            "end_time": end_time,
            "text": text,
            "character": character,
        })

    return results


def _srt_time_to_seconds(time_str: str) -> float:
    """Convert SRT timestamp '00:01:23,456' to seconds."""
    time_str = time_str.replace(',', '.')
    parts = time_str.split(':')
    return int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])


# ══════════════════════════════════════════════
#  API Endpoints
# ══════════════════════════════════════════════

class ScriptToSceneResponse(BaseModel):
    success: bool
    scene: dict
    duration: float
    characters_added: int
    keyframes_added: int
    tts_audio_url: str = ""
    tts_lines: list[dict] = []
    message: str = ""


@router.post("/script-to-scene", response_model=ScriptToSceneResponse)
async def script_to_scene(req: ScriptToSceneRequest):
    """
    Convert script lines → complete SceneGraph with characters, poses, faces, and keyframes.

    Flow:
    1. Optionally generate TTS audio for each line → get timestamps
    2. Build SceneGraph with characters positioned on stage
    3. Set pose/face keyframes based on emotion/action hints
    4. Add lip-sync face swaps during speaking periods
    """
    if not _registry:
        raise HTTPException(500, "Asset registry not initialized")

    if not req.lines:
        raise HTTPException(400, "No script lines provided")

    tts_lines = None

    # ── Step 1: Generate TTS (optional) ──
    if req.generate_tts and req.lines:
        try:
            tts_lines = await _generate_tts_for_script(req.lines, req.voice_map, req.pause_ms)
        except Exception as e:
            logger.warning(f"TTS generation failed, continuing without audio: {e}")

    # ── Step 2: Build scene ──
    try:
        graph = build_scene_from_script(
            lines=req.lines,
            character_map=req.character_map,
            tts_lines=tts_lines,
            registry=_registry,
            background_id=req.background_id,
        )
    except Exception as e:
        logger.error(f"Scene build failed: {e}", exc_info=True)
        raise HTTPException(500, f"Scene build failed: {e}")

    # Count keyframes
    total_kf = 0
    for node in graph.nodes.values():
        if isinstance(node, CharacterNode):
            total_kf += len(node.frame_sequence)
            for kf_list in node.keyframes.values():
                total_kf += len(kf_list)

    return ScriptToSceneResponse(
        success=True,
        scene=graph.to_dict(),
        duration=graph.duration,
        characters_added=len([n for n in graph.nodes.values() if isinstance(n, CharacterNode)]),
        keyframes_added=total_kf,
        tts_lines=tts_lines or [],
        message=f"Scene created with {len(graph.nodes)} nodes and {total_kf} keyframes",
    )


# ══════════════════════════════════════════════
#  Multi-Scene Endpoint
# ══════════════════════════════════════════════

class MultiSceneScriptSection(BaseModel):
    """A single scene section parsed from multi-scene script."""
    background_id: str = ""
    lines: list[ScriptLine] = []
    transition: str = "fade"  # "cut", "fade", "dissolve"


class MultiSceneRequest(BaseModel):
    """Request to build a multi-scene VideoProject from script with --- separators."""
    script_text: str  # Full script with --- scene separators
    character_map: dict[str, str]  # character name → char_id
    generate_tts: bool = False
    default_background: str = ""  # fallback background for scenes without [Background:]


class MultiSceneResponse(BaseModel):
    success: bool
    project: dict
    total_scenes: int
    total_duration: float
    scene_boundaries: list[dict]
    message: str = ""


def _parse_multi_scene_script(script_text: str) -> list[dict]:
    """Parse a multi-scene script text into scene sections.
    
    Format:
        [Background: bg_id_here]
        [Transition: fade]
        Character: dialogue text [emotion:happy] [action:wave]
        ---
        [Background: another_bg_id]
        Character: more dialogue
    
    Returns list of {"background_id": str, "lines": [ScriptLine], "transition": str}
    """
    sections = []
    current_bg = ""
    current_transition = "fade"
    current_lines = []

    for raw_line in script_text.strip().split("\n"):
        line = raw_line.strip()
        if not line:
            continue

        # Scene separator
        if line.startswith("---"):
            if current_lines:
                sections.append({
                    "background_id": current_bg,
                    "lines": current_lines,
                    "transition": current_transition,
                })
                current_lines = []
                current_transition = "fade"
            continue

        # Background directive
        bg_match = re.match(r'\[(?:Background|BG|Bối cảnh)\s*:\s*(.+?)\]', line, re.IGNORECASE)
        if bg_match:
            current_bg = bg_match.group(1).strip()
            continue

        # Transition directive
        trans_match = re.match(r'\[(?:Transition|Chuyển cảnh)\s*:\s*(.+?)\]', line, re.IGNORECASE)
        if trans_match:
            current_transition = trans_match.group(1).strip().lower()
            continue

        # Script line: "Character: text [emotion:xxx] [action:xxx]"
        char_match = re.match(r'^([^:]+?):\s*(.+)$', line)
        if char_match:
            character = char_match.group(1).strip()
            rest = char_match.group(2).strip()

            emotion = ""
            action = ""
            
            # Extract (emotion/action) prefix like "(Tức giận) Anh nói gì cơ?"
            m_paren = re.match(r'^\s*\((.*?)\)\s*(.*)$', rest)
            if m_paren:
                emotion = m_paren.group(1).strip()
                action = emotion # pass to both so resolvers can figure it out
                rest = m_paren.group(2).strip()

            # Extract [emotion:xxx]
            em = re.search(r'\[emotion\s*:\s*(.+?)\]', rest, re.IGNORECASE)
            if em:
                emotion = em.group(1).strip()
                rest = rest[:em.start()] + rest[em.end():]
            # Extract [action:xxx]
            ac = re.search(r'\[action\s*:\s*(.+?)\]', rest, re.IGNORECASE)
            if ac:
                action = ac.group(1).strip()
                rest = rest[:ac.start()] + rest[ac.end():]

            text = rest.strip()
            if text:
                current_lines.append(ScriptLine(
                    character=character,
                    text=text,
                    emotion=emotion,
                    action=action,
                ))

    # Don't forget the last section
    if current_lines:
        sections.append({
            "background_id": current_bg,
            "lines": current_lines,
            "transition": current_transition,
        })

    return sections


@router.post("/multi-scene")
async def multi_scene(req: MultiSceneRequest):
    """Build a multi-scene VideoProject from script with --- scene separators.
    
    Script format:
        [Background: bg_id]
        Hoa: Hello!
        Nam: Hi there!
        ---
        [Background: another_bg_id]
        [Transition: fade]
        Hoa: This is scene 2!
    """
    from backend.core.scene_graph.video_project import VideoProject, SceneTransition

    if not _registry:
        raise HTTPException(500, "Asset registry not initialized")

    # Parse multi-scene script
    sections = _parse_multi_scene_script(req.script_text)
    if not sections:
        raise HTTPException(400, "No scenes found in script. Use --- to separate scenes.")

    # Build each scene
    scenes = []
    transitions = []
    for i, section in enumerate(sections):
        bg_id = section["background_id"] or req.default_background
        lines = section["lines"]

        try:
            graph = build_scene_from_script(
                lines=lines,
                character_map=req.character_map,
                tts_lines=None,
                registry=_registry,
                background_id=bg_id if bg_id else None,
            )
            graph.name = f"Scene {i + 1}"
            if bg_id:
                graph.metadata = {"background_id": bg_id}
            scenes.append(graph)
        except Exception as e:
            logger.error(f"Multi-scene: scene {i+1} build failed: {e}", exc_info=True)
            raise HTTPException(500, f"Scene {i+1} build failed: {e}")

        # Add transition (except after last scene)
        if i < len(sections) - 1:
            trans_type = section.get("transition", "fade")
            transitions.append(SceneTransition(type=trans_type, duration=0.5))

    project = VideoProject(
        name="Multi-Scene Project",
        scenes=scenes,
        transitions=transitions,
    )

    return MultiSceneResponse(
        success=True,
        project=project.to_dict(),
        total_scenes=project.num_scenes,
        total_duration=project.total_duration,
        scene_boundaries=project.get_scene_boundaries(),
        message=f"Project created: {project.num_scenes} scenes, {project.total_duration:.1f}s total",
    )


class SRTToSceneRequest(BaseModel):
    """Parse SRT text and convert to scene."""
    srt_text: str
    character_map: dict[str, str]  # character name → char_id
    default_character: str = ""     # char_id for lines without character prefix
    background_id: Optional[str] = None
    generate_tts: bool = False      # Usually SRT already has audio


@router.post("/srt-to-scene", response_model=ScriptToSceneResponse)
async def srt_to_scene(req: SRTToSceneRequest):
    """Parse SRT subtitle file and build a SceneGraph from it."""
    if not _registry:
        raise HTTPException(500, "Asset registry not initialized")

    parsed = parse_srt(req.srt_text)
    if not parsed:
        raise HTTPException(400, "Could not parse SRT text")

    # Convert parsed SRT to ScriptLines
    script_lines = []
    tts_lines = []
    for p in parsed:
        char_name = p["character"] or req.default_character
        if not char_name:
            # Use first character in map as default
            char_name = next(iter(req.character_map.keys()), "narrator")

        script_lines.append(ScriptLine(
            character=char_name,
            text=p["text"],
        ))
        tts_lines.append({
            "start_time": p["start_time"],
            "end_time": p["end_time"],
            "text": p["text"],
        })

    try:
        graph = build_scene_from_script(
            lines=script_lines,
            character_map=req.character_map,
            tts_lines=tts_lines,
            registry=_registry,
            background_id=req.background_id,
        )
    except Exception as e:
        logger.error(f"SRT scene build failed: {e}", exc_info=True)
        raise HTTPException(500, f"Scene build failed: {e}")

    total_kf = sum(
        len(n.frame_sequence) + sum(len(kf) for kf in n.keyframes.values())
        for n in graph.nodes.values() if isinstance(n, CharacterNode)
    )

    return ScriptToSceneResponse(
        success=True,
        scene=graph.to_dict(),
        duration=graph.duration,
        characters_added=len([n for n in graph.nodes.values() if isinstance(n, CharacterNode)]),
        keyframes_added=total_kf,
        tts_lines=tts_lines,
        message=f"SRT parsed: {len(parsed)} lines → {len(graph.nodes)} nodes",
    )


@router.post("/lipsync")
async def add_lipsync(req: LipsyncRequest):
    """Add lip-sync face keyframes to an existing scene based on TTS timestamps."""
    if not _registry:
        raise HTTPException(500, "Asset registry not initialized")

    try:
        graph = SceneGraph.from_dict(req.scene)
    except Exception as e:
        raise HTTPException(400, f"Invalid scene data: {e}")

    frames_added = 0
    for tts_line in req.tts_lines:
        char_name = tts_line.get("character", "")
        node_id = req.character_node_map.get(char_name)
        if not node_id:
            continue

        node = graph.get_node(node_id)
        if not isinstance(node, CharacterNode):
            continue

        available_faces = node.available_layers.get("face", [])
        start = tts_line.get("start_time", 0)
        end = tts_line.get("end_time", start + 1)

        before = len(node.frame_sequence)
        _add_lipsync_frames(node, start, end, available_faces)
        frames_added += len(node.frame_sequence) - before

    return {
        "success": True,
        "scene": graph.to_dict(),
        "frames_added": frames_added,
    }


# ══════════════════════════════════════════════
#  Internal TTS helper
# ══════════════════════════════════════════════

async def _generate_tts_for_script(
    lines: list[ScriptLine],
    voice_map: dict[str, str],
    pause_ms: int,
) -> list[dict]:
    """Generate TTS audio and return timing info for each line.

    This calls the TTS synthesize endpoint internally.
    """
    import httpx

    # Combine all lines into one TTS request, with character voice grouping
    # For simplicity, use default voice for all
    all_text = "\n".join(line.text for line in lines)
    default_voice = next(iter(voice_map.values()), "BV074") if voice_map else "BV074"

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "http://localhost:8000/api/tts/synthesize",
            json={
                "text": all_text,
                "voice": default_voice,
                "pause_ms": pause_ms,
            },
            timeout=120.0,
        )

        if resp.status_code != 200:
            raise RuntimeError(f"TTS failed: HTTP {resp.status_code}")

        data = resp.json()
        return data.get("lines", [])
