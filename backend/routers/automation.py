"""
Automation Router — Script-to-Scene-to-Video pipeline.

Endpoints:
  POST /api/automation/script-to-scene — Convert script lines → SceneGraph + TTS audio.
  POST /api/automation/lipsync        — Add lip-sync face keyframes to existing scene.
"""

import asyncio
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
    background_id: str | None = None,
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
                name=background_id,
                asset_path=bg_url,
                parallax_speed=0.0,
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

                    import asyncio
                    # Run async analysis in a new event loop (can't nest in FastAPI's loop)
                    loop = asyncio.new_event_loop()
                    try:
                        result = loop.run_until_complete(
                            analyze_stage_elements(layer_images)
                        )
                    finally:
                        loop.close()
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
                bbox_cx = (elem.get("bbox_x", 0) + elem.get("bbox_w", 100) / 2) / 100 * 19.2
                bbox_cy = (elem.get("bbox_y", 0) + elem.get("bbox_h", 100) / 2) / 100 * 10.8

                if elem.get("can_stand_on") or elem.get("can_sit_on"):
                    standable_regions.append({
                        "x": bbox_cx,
                        "y": bbox_cy,
                        "name": elem.get("name_en", ""),
                        "can_sit": elem.get("can_sit_on", False),
                    })
                    logger.info(f"  Standable: '{elem.get('name_en')}' at ({bbox_cx:.1f}, {bbox_cy:.1f})")

                # Collect interaction points: objects characters should stand NEAR
                cat = elem.get("category", "")
                if cat in ("furniture", "vehicle", "prop", "door", "window", "stairs"):
                    interaction_points.append({
                        "x": bbox_cx,
                        "y": bbox_cy,
                        "name": elem.get("name_en", ""),
                        "category": cat,
                    })
                    logger.info(f"  Interaction: '{elem.get('name_en')}' ({cat}) at ({bbox_cx:.1f}, {bbox_cy:.1f})")

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

        # ── Smart Position: use stage analysis if available ──
        home_x = 9.6  # Default center
        home_y = 7.5   # Default y

        if standable_regions or interaction_points:
            # Strategy: place characters at standable positions,
            # preferring locations NEAR interaction objects (tables, doors, cars).
            
            if standable_regions:
                # Pick a standable region for this character
                region = standable_regions[i % len(standable_regions)]
                home_x = region["x"]
                home_y = region["y"]

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
                logger.info(f"  Placing '{char_name}' near interaction: '{ip['name']}'")

            # Spread multiple characters to avoid overlap
            if num_chars > 1:
                spread = 4.0  # Total spread width in world units
                offset = (i - (num_chars - 1) / 2) * spread / max(num_chars - 1, 1)
                home_x = max(2.0, min(17.2, home_x + offset))

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

        char_states[char_name] = {
            "x": home_x,
            "y": home_y,
            "home_x": home_x,
            "scale_x": initial_scale_x,
            "scale_y": 0.25,
            "z_index": i * 10
        }

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

        movement = "idle"

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


        # ── Depth, Scale, Position Logic ──
        node = graph.get_node(node_id)
        if isinstance(node, CharacterNode):
            st = char_states[line.character]
            # Set up tracks
            for prop in ["x", "y", "scale_x", "scale_y", "z_index"]:
                node.keyframes.setdefault(prop, [])

            abs_scale = abs(st["scale_x"])
            
            # Apply movement logic
            if movement == "enter_left":
                st["x"], st["y"], st["z_index"] = 5.0, 7.5, 10
                st["scale_x"] = abs_scale # look right
                node.add_keyframe("x", start_time - 0.5, -4.0, "linear")
                node.add_keyframe("x", start_time + 0.5, st["x"], "ease_out")
            elif movement == "enter_right":
                st["x"], st["y"], st["z_index"] = 14.2, 7.5, 10
                st["scale_x"] = -abs_scale # look left
                node.add_keyframe("x", start_time - 0.5, 23.0, "linear")
                node.add_keyframe("x", start_time + 0.5, st["x"], "ease_out")
            elif movement == "exit_left":
                node.add_keyframe("x", end_time, -4.0, "ease_in")
            elif movement == "exit_right":
                node.add_keyframe("x", end_time, 23.0, "ease_in")
            elif movement == "step_forward":
                st["y"] = 8.5
                st["scale_y"] = 0.3
                st["scale_x"] = 0.3 if st["scale_x"] > 0 else -0.3
                st["z_index"] += 50
                node.add_keyframe("y", speak_start, st["y"], "ease_out")
                node.add_keyframe("scale_x", speak_start, st["scale_x"], "ease_out")
                node.add_keyframe("scale_y", speak_start, st["scale_y"], "ease_out")
                node.add_keyframe("z_index", start_time, st["z_index"], "step")
            elif movement == "step_back":
                st["y"] = 7.0
                st["scale_y"] = 0.22
                st["scale_x"] = 0.22 if st["scale_x"] > 0 else -0.22
                st["z_index"] -= 50
                node.add_keyframe("y", speak_start, st["y"], "ease_out")
                node.add_keyframe("scale_x", speak_start, st["scale_x"], "ease_out")
                node.add_keyframe("scale_y", speak_start, st["scale_y"], "ease_out")
                node.add_keyframe("z_index", start_time, st["z_index"], "step")
            elif movement == "walk_to_center":
                st["x"] = 9.6
                st["z_index"] += 10
                node.add_keyframe("x", speak_start, st["x"], "ease_out")
            else:
                if num_chars > 1:
                    # Default Speaker Moves toward center
                    speak_x = home_x + (center_x - home_x) * SPEAKER_PULL
                    if last_speaker and last_speaker != line.character:
                        prev_node_id = char_nodes.get(last_speaker)
                        prev_home = char_home_x.get(last_speaker, 9.6)
                        if prev_node_id:
                            prev_node = graph.get_node(prev_node_id)
                            if isinstance(prev_node, CharacterNode):
                                prev_node.keyframes.setdefault("x", [])
                                prev_node.add_keyframe("x", start_time, prev_home, "ease_out",)
                                # Update states back
                                l_st = char_states.get(last_speaker)
                                if l_st:
                                    l_st["x"] = prev_home
                    node.add_keyframe("x", start_time, st["x"], "linear")
                    node.add_keyframe("x", speak_start, speak_x, "ease_out")
                    st["x"] = speak_x

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
        
        # ── Camera Auto-Tracking ──
        camera_node.keyframes.setdefault("x", [])
        camera_node.keyframes.setdefault("y", [])
        camera_node.keyframes.setdefault("scale_x", [])
        camera_node.keyframes.setdefault("scale_y", [])

        # Camera moves to track speaker softly
        cam_x = 9.6 + (st["x"] - 9.6) * 0.4
        cam_y = 6.4
        cam_scale = 1.15
        
        # If it's a very short line or multiple chars, we could keep it center, 
        # but tracking individual speakers looks dynamic!
        if num_chars == 1:
            cam_x = 9.6
            cam_y = 5.4
            cam_scale = 1.0

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

        # ── Subtitle: Create TextNode for this dialogue line ──
        subtitle_text = f"{line.character}: {line.text}"
        
        # We can't change text content via keyframes, so we create separate
        # TextNodes per line and toggle their opacity
        line_sub_id = f"subtitle_line_{idx}"
        line_sub = TextNode(
            id=line_sub_id,
            name=f"Sub: {line.character}",
            content=subtitle_text,
            font_size=0.36,
            color="#FFFFFF",
            text_align="center",
            z_index=9999,
        )
        line_sub.set_position(9.6, 10.0)
        line_sub.set_scale(1.0)
        line_sub.opacity = 0.0
        # Timing: hidden → fade in at speak_start → visible → fade out at end
        line_sub.add_keyframe("opacity", max(0, speak_start - 0.15), 0.0, "linear")
        line_sub.add_keyframe("opacity", speak_start, 1.0, "easeOut")
        line_sub.add_keyframe("opacity", end_time, 1.0, "linear")
        line_sub.add_keyframe("opacity", end_time + 0.2, 0.0, "easeIn")
        graph.add_node(line_sub)

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
            node.add_keyframe("x", current_time, home_x, "ease_out",)
            # Final idle pose
            avail_poses = char_infos[char_name].pose_names if char_name in char_infos else []
            avail_faces = char_infos[char_name].face_names if char_name in char_infos else []
            node.add_frame(current_time, {
                "pose": _pick_available("站立", avail_poses),
                "face": _pick_available("微笑", avail_faces, "微笑"),
            })

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
