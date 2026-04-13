"""
Automation Router — Script-to-Scene-to-Video pipeline.

Endpoints:
  POST /api/automation/script-to-scene — Convert script lines → SceneGraph + TTS audio.
  POST /api/automation/lipsync        — Add lip-sync face keyframes to existing scene.
"""

import asyncio
import logging
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
    "vui": "微笑", "cười": "大笑", "hạnh phúc": "笑脸",
    # Negative
    "sad": "难过", "cry": "大哭", "tears": "流泪", "depressed": "委屈",
    "angry": "发怒", "furious": "愤怒", "rage": "大骂",
    "scared": "害怕", "fear": "恐吓", "shock": "震惊",
    "disgusted": "恶心", "sick": "呕吐",
    "buồn": "难过", "khóc": "大哭", "giận": "发怒", "sợ": "害怕",
    # Neutral
    "neutral": "无表情", "thinking": "疑惑", "confused": "迷惑",
    "surprised": "惊讶", "embarrassed": "尴尬", "shy": "害羞",
    "cold": "冷漠", "doubt": "怀疑", "bored": "打哈欠",
    "ngạc nhiên": "惊讶", "bối rối": "困扰", "xấu hổ": "害羞",
    # Speaking
    "talking": "说话", "speaking": "说话", "yelling": "大吼",
    "nói": "说话", "la": "大吼",
}

# Map action keywords → best pose names (expanded with all available poses)
ACTION_POSE_MAP = {
    # English
    "stand": "站立", "idle": "站立", "standing": "站立",
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
    # Vietnamese
    "đứng": "站立", "vẫy": "打招呼", "chào": "打招呼",
    "ngồi": "坐着", "chạy": "逃跑", "nghĩ": "疑惑",
    "chỉ": "手指向前", "giới thiệu": "介绍",
    "tự tin": "叉腰", "xin": "祈祷", "cúi": "拱手",
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


def resolve_face(emotion: str, available_faces: list[str]) -> str:
    """Resolve emotion string to best matching face name."""
    if not emotion:
        return "微笑" if "微笑" in available_faces else available_faces[0] if available_faces else "微笑"

    emotion_lower = emotion.lower().strip()

    if emotion_lower in available_faces:
        return emotion_lower

    mapped = EMOTION_FACE_MAP.get(emotion_lower)
    if mapped and mapped in available_faces:
        return mapped

    for keyword, face in EMOTION_FACE_MAP.items():
        if keyword in emotion_lower and face in available_faces:
            return face

    return "微笑" if "微笑" in available_faces else available_faces[0] if available_faces else "微笑"


def resolve_pose(action: str, available_poses: list[str]) -> str:
    """Resolve action string to best matching pose name."""
    if not action:
        return "站立" if "站立" in available_poses else available_poses[0] if available_poses else "站立"

    action_lower = action.lower().strip()

    if action_lower in available_poses:
        return action_lower

    mapped = ACTION_POSE_MAP.get(action_lower)
    if mapped and mapped in available_poses:
        return mapped

    for keyword, pose in ACTION_POSE_MAP.items():
        if keyword in action_lower and pose in available_poses:
            return pose

    return "站立" if "站立" in available_poses else available_poses[0] if available_poses else "站立"


def _pick_available(name: str, available: list[str], fallback: str = "站立") -> str:
    """Return name if available, otherwise fallback."""
    if name in available:
        return name
    return fallback if fallback in available else (available[0] if available else fallback)


# ══════════════════════════════════════════════
#  Script-to-Scene Engine (Cinematic Staging)
# ══════════════════════════════════════════════

def build_scene_from_script(
    lines: list[ScriptLine],
    character_map: dict[str, str],
    tts_lines: list[dict] | None = None,
    registry: AssetRegistry | None = None,
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

    # ── Step 1: Add characters ──
    unique_chars = list(dict.fromkeys(line.character for line in lines))
    char_nodes: dict[str, str] = {}  # character name → node_id
    char_home_x: dict[str, float] = {}  # character name → home X position
    char_infos: dict[str, object] = {}

    num_chars = len(unique_chars)
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

        # Home position: spread evenly
        if num_chars == 1:
            home_x = 9.6
        elif num_chars == 2:
            home_x = 5.0 + (i * 9.2)  # 5.0 and 14.2
        else:
            home_x = 3.0 + (i * 13.2 / max(num_chars - 1, 1))
        home_y = 7.5

        char_home_x[char_name] = home_x

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
                logger.info(f"Added character '{char_name}' at x={home_x:.1f}")

    # Center stage X (where speaker moves towards)
    center_x = 9.6
    # Transition: how much the speaker moves toward center
    SPEAKER_PULL = 0.35  # 35% toward center

    # ── Step 2: Cinematic staging per line ──
    current_time = 0.0
    last_speaker = None
    line_idx_per_char: dict[str, int] = {}  # Count lines spoken per character

    for idx, line in enumerate(lines):
        node_id = char_nodes.get(line.character)
        if not node_id:
            continue

        char_info = char_infos.get(line.character)
        available_poses = char_info.pose_names if char_info else []
        available_faces = char_info.face_names if char_info else []

        # Track line count per character
        line_idx_per_char[line.character] = line_idx_per_char.get(line.character, 0) + 1
        char_line_num = line_idx_per_char[line.character]

        # ── Auto-detect emotion & action from text ──
        emotion = line.emotion or analyze_text_emotion(line.text)
        action = line.action or analyze_text_action(line.text)

        # Resolve pose and face
        pose = resolve_pose(action, available_poses)
        face = resolve_face(emotion, available_faces)

        # If no specific pose detected, vary poses to keep it dynamic
        if not action and not line.action:
            # Cycle through interesting poses for variety
            speaking_poses = ["介绍", "摊开手", "叉腰", "站立", "打招呼", "手指向前"]
            pose_choice = speaking_poses[char_line_num % len(speaking_poses)]
            pose = _pick_available(pose_choice, available_poses)

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

        # ── Speaker Movement: Walk toward center ──
        node = graph.get_node(node_id)
        home_x = char_home_x.get(line.character, 9.6)

        if isinstance(node, CharacterNode) and num_chars > 1:
            # Speaker moves toward center
            speak_x = home_x + (center_x - home_x) * SPEAKER_PULL

            # Move to speaking position (ease in)
            node.keyframes.setdefault("x", [])
            node.keyframes.setdefault("y", [])

            # If this is a different speaker than last, move previous speaker back
            if last_speaker and last_speaker != line.character:
                prev_node_id = char_nodes.get(last_speaker)
                prev_home = char_home_x.get(last_speaker, 9.6)
                if prev_node_id:
                    prev_node = graph.get_node(prev_node_id)
                    if isinstance(prev_node, CharacterNode):
                        prev_node.keyframes.setdefault("x", [])
                        prev_node.keyframes["x"].append({
                            "time": start_time,
                            "value": prev_home,
                            "easing": "ease_out",
                        })

            # Move speaker to stage
            node.keyframes["x"].append({
                "time": start_time,
                "value": home_x,
                "easing": "linear",
            })
            node.keyframes["x"].append({
                "time": speak_start,
                "value": speak_x,
                "easing": "ease_out",
            })

            # Slight bounce at end of speaking
            node.keyframes["x"].append({
                "time": end_time,
                "value": speak_x,
                "easing": "linear",
            })

        if isinstance(node, CharacterNode):
            # Set speaking pose + face
            node.add_frame(speak_start, {"pose": pose, "face": face})

            # Lip-sync during speaking
            if "说话" in available_faces and "微笑" in available_faces:
                _add_lipsync_frames(node, speak_start, end_time, available_faces)

            # After speaking: neutral face + standard pose
            neutral_face = resolve_face("neutral", available_faces)
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

            other_poses = other_info.pose_names if other_info else []
            other_faces = other_info.face_names if other_info else []

            # Listener face reaction based on speaker's emotion
            listener_emotion = emotion if emotion else "default"
            listener_face_name = LISTENER_FACES_MAP.get(listener_emotion, "微笑")
            listener_face = _pick_available(listener_face_name, other_faces, "微笑")

            # Listener pose: cycle through idle listening poses
            listener_pose_options = ["站立", "抱胸", "叉腰", "疑惑", "坐姿看"]
            l_pose = listener_pose_options[idx % len(listener_pose_options)]
            listener_pose = _pick_available(l_pose, other_poses)

            other_node.add_frame(speak_start, {"face": listener_face, "pose": listener_pose})

        last_speaker = line.character
        current_time = end_time + 0.4

    # ── Step 3: Return all characters to home at end ──
    for char_name, node_id in char_nodes.items():
        node = graph.get_node(node_id)
        if isinstance(node, CharacterNode):
            home_x = char_home_x.get(char_name, 9.6)
            node.keyframes.setdefault("x", [])
            node.keyframes["x"].append({
                "time": current_time,
                "value": home_x,
                "easing": "ease_out",
            })
            # Final idle pose
            avail_poses = char_infos[char_name].pose_names if char_name in char_infos else []
            avail_faces = char_infos[char_name].face_names if char_name in char_infos else []
            node.add_frame(current_time, {
                "pose": _pick_available("站立", avail_poses),
                "face": _pick_available("微笑", avail_faces, "微笑"),
            })

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


class SRTToSceneRequest(BaseModel):
    """Parse SRT text and convert to scene."""
    srt_text: str
    character_map: dict[str, str]  # character name → char_id
    default_character: str = ""     # char_id for lines without character prefix
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
