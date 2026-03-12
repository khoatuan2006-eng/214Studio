"""
Character Agent — AI-powered character positioning and pose/face selection.

Uses Gemini Vision to SEE the actual stage image for precise placement.

Receives:
1. Stage IMAGE (base64 PNG) — the actual rendered stage
2. Stage semantic info (from Stage Analyzer) — furniture, floors, interaction points
3. Script actions (from Script Analyzer) — dialogue, emotions, poses per timestamp
4. Character's REAL layer catalog — group names + asset names per group
5. Character info — name, current position

Uses Gemini to:
- LOOK at the stage image to determine correct standing/sitting positions
- Select ACTUAL poses and face expressions from available PSD layers
- Generate PoseFrame sequence with real asset selections
"""

from __future__ import annotations
import base64
import json
import logging
from dataclasses import dataclass, field
from typing import Any

from ..ai_config import get_ai_config

logger = logging.getLogger(__name__)


# ══════════════════════════════════════════════
#  DATA TYPES
# ══════════════════════════════════════════════

@dataclass
class SuggestedPoseFrame:
    """A single PoseFrame suggestion — mirrors frontend PoseFrame."""
    duration: float = 1.0
    layers: dict = field(default_factory=dict)  # groupName → assetName
    transition: str = "cut"
    description: str = ""

    def to_dict(self) -> dict:
        return {
            "duration": self.duration,
            "layers": self.layers,
            "transition": self.transition,
            "description": self.description,
        }


@dataclass
class PositionKeyframeSuggestion:
    """A position keyframe for animated movement."""
    time: float = 0.0       # seconds from start
    x: float = 960.0        # canvas X
    y: float = 540.0        # canvas Y

    def to_dict(self) -> dict:
        return {"time": self.time, "x": self.x, "y": self.y}


@dataclass
class ScaleKeyframeSuggestion:
    """A scale keyframe for animated size changes."""
    time: float = 0.0
    scale: float = 960.0

    def to_dict(self) -> dict:
        return {"time": self.time, "scale": self.scale}


@dataclass
class RotationKeyframeSuggestion:
    """A rotation keyframe for animated rotation."""
    time: float = 0.0
    rotation: float = 0.0  # degrees

    def to_dict(self) -> dict:
        return {"time": self.time, "rotation": self.rotation}


@dataclass
class ZIndexKeyframeSuggestion:
    """A z-index keyframe for animated depth ordering."""
    time: float = 0.0
    z: int = 10

    def to_dict(self) -> dict:
        return {"time": self.time, "z": self.z}


@dataclass
class FlipXKeyframeSuggestion:
    """A flipX keyframe for animated horizontal flipping."""
    time: float = 0.0
    flip_x: bool = False

    def to_dict(self) -> dict:
        return {"time": self.time, "flipX": self.flip_x}


@dataclass
class CharacterSuggestionResult:
    """Full suggestion result for a character."""
    suggested_x: float = 960.0
    suggested_y: float = 540.0
    suggested_z: int = 10
    suggested_scale: float = 960.0
    flip_x: bool = False
    position_reason: str = ""
    pose_frames: list[SuggestedPoseFrame] = field(default_factory=list)
    position_keyframes: list[PositionKeyframeSuggestion] = field(default_factory=list)
    scale_keyframes: list[ScaleKeyframeSuggestion] = field(default_factory=list)
    rotation_keyframes: list[RotationKeyframeSuggestion] = field(default_factory=list)
    z_index_keyframes: list[ZIndexKeyframeSuggestion] = field(default_factory=list)
    flip_x_keyframes: list[FlipXKeyframeSuggestion] = field(default_factory=list)
    validation_warnings: list[dict] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "suggested_position": {
                "x": self.suggested_x,
                "y": self.suggested_y,
                "z": self.suggested_z,
                "scale": self.suggested_scale,
            },
            "flip_x": self.flip_x,
            "position_reason": self.position_reason,
            "pose_frames": [f.to_dict() for f in self.pose_frames],
            "position_keyframes": [k.to_dict() for k in self.position_keyframes],
            "scale_keyframes": [k.to_dict() for k in self.scale_keyframes],
            "rotation_keyframes": [k.to_dict() for k in self.rotation_keyframes],
            "z_index_keyframes": [k.to_dict() for k in self.z_index_keyframes],
            "flip_x_keyframes": [k.to_dict() for k in self.flip_x_keyframes],
            "validation_warnings": self.validation_warnings,
        }


# ══════════════════════════════════════════════
#  SYSTEM PROMPT
# ══════════════════════════════════════════════

CHARACTER_AGENT_PROMPT = """Bạn là đạo diễn phim hoạt hình 2D chuyên nghiệp.

## NHIỆM VỤ
Bạn sẽ NHÌN THẤY hình ảnh sân khấu thực tế. Dựa vào hình ảnh + kịch bản:
1. ĐẶT VỊ TRÍ nhân vật CHÍNH XÁC trên canvas — chân nhân vật phải chạm sàn/mặt đất
2. CHỌN POSE + BIỂU CẢM từ danh sách có sẵn

## HỆ TỌA ĐỘ — RENDERING ENGINE (CỰC KỲ QUAN TRỌNG)

Canvas: 1920×1080 pixel. Gốc tọa độ (0,0) ở góc TRÊN-TRÁI.

### suggested_x = TÂM NGANG nhân vật (pixel)
- 0 = mép trái, 1920 = mép phải, 960 = giữa

### suggested_y = VỊ TRÍ CHÂN nhân vật (BOTTOM ANCHOR, pixel)
- ĐÂY LÀ CHÂN/ĐÁY NHÂN VẬT — engine vẽ nhân vật NGƯỢC LÊN từ điểm này
- 0 = mép trên canvas, 1080 = mép dưới canvas
- VÍ DỤ: nếu sàn nhà ở y=850 trong hình → suggested_y = 850

### ĐẶC BIỆT: Nếu có "ground_y" trong dữ liệu → ĐÓ LÀ VỊ TRÍ SÀN CHÍNH XÁC
- Dùng ground_y làm suggested_y (hoặc gần đó) để chân chạm đất!

### suggested_scale = KÍCH THƯỚC nhân vật (pixel)
- Engine tính: scaleFactor = scale / 1920
- Chiều cao hiển thị = scaleFactor × 960 pixel
- VÍ DỤ CỤ THỂ:
  * scale=960  → scaleFactor=0.50 → cao 480px (nửa canvas, khá to)
  * scale=700  → scaleFactor=0.37 → cao 355px (trung bình, phù hợp đứng trên sân khấu)
  * scale=500  → scaleFactor=0.26 → cao 250px (nhỏ, nhân vật ở xa)
  * scale=400  → scaleFactor=0.21 → cao 200px (rất nhỏ)
- ĐỂ NHÂN VẬT TOÀN THÂN TRÊN SÂN KHẤU: dùng scale 500-750
- CÔNG THỨC KIỂM TRA: nhân vật chiếm từ y=(suggested_y - chiều_cao) đến y=suggested_y
  VD: scale=700, suggested_y=850 → nhân vật từ y=495 đến y=850

### z, flipX
- z: 10-20 (trước background, sau foreground)
- flipX: true nếu nhân vật nên quay mặt sang phải (ví dụ: hướng về nhân vật khác)

## CÁCH CHỌN POSE/BIỂU CẢM
Nhân vật PSD có các nhóm layer. Mỗi nhóm chứa nhiều lựa chọn.
Bạn PHẢI chọn **đúng tên** từ danh sách được cung cấp. KHÔNG tự nghĩ ra.
Mỗi PoseFrame chọn 1 asset từ MỖI nhóm (hoặc bỏ trống nếu không cần).

## QUY TẮC CHỌN POSE
- "站立" (đứng) cho trạng thái mặc định
- "打招呼" (chào) khi nhân vật vừa xuất hiện
- "叉腰"/"抱胸" khi tự tin
- "坐着" khi ngồi ghế
- "出拳"/"举起拳头" khi tức giận
- "逃跑" khi sợ hãi
- Match biểu cảm: vui → "微笑"/"大笑", buồn → "难过"/"流泪", giận → "发怒"/"生气"

## OUTPUT FORMAT
Trả về JSON (KHÔNG text khác):
{
  "suggested_x": 480,
  "suggested_y": 850,
  "suggested_z": 12,
  "suggested_scale": 700,
  "flip_x": false,
  "position_reason": "Giải thích vị trí",
  "pose_frames": [
    {
      "duration": 2.0,
      "layers": {"动作": "站立", "表情": "微笑"},
      "transition": "cut",
      "description": "Nhân vật đứng mỉm cười"
    }
  ],
  "position_keyframes": [
    {"time": 0.0, "x": 480, "y": 850},
    {"time": 3.0, "x": 600, "y": 850}
  ],
  "scale_keyframes": [
    {"time": 0.0, "scale": 700},
    {"time": 5.0, "scale": 650}
  ],
  "rotation_keyframes": [
    {"time": 0.0, "rotation": 0},
    {"time": 2.0, "rotation": -5}
  ],
  "z_index_keyframes": [
    {"time": 0.0, "z": 12}
  ],
  "flip_x_keyframes": [
    {"time": 0.0, "flipX": false},
    {"time": 3.0, "flipX": true}
  ]
}

## HỆ THỐNG KEYFRAME ANIMATION (5 TRACK)
Engine hỗ trợ 5 loại keyframe độc lập, mỗi loại được nội suy riêng:

### 1. position_keyframes — DI CHUYỂN
- {"time": giây, "x": pixel, "y": pixel}
- Nội suy MƯỢT (linear interpolation) giữa 2 keyframe
- PHẢI có ít nhất 1 keyframe tại time=0
- KHÔNG tạo nếu nhân vật ĐỨNG YÊN suốt scene
- Di chuyển TỰ NHIÊN: bước nhỏ 50-200px theo x, giữ y cố định (trừ khi ngồi/nhảy)

### 2. scale_keyframes — THAY ĐỔI KÍCH THƯỚC
- {"time": giây, "scale": pixel} (960=nửa canvas, 700=trung bình)
- CHỈ tạo nếu nhân vật thay đổi kích thước (tiến/lùi, phóng to/thu nhỏ)
- KHÔNG tạo nếu scale không đổi

### 3. rotation_keyframes — XOAY
- {"time": giây, "rotation": độ} (0=thẳng, dương=xoay phải)
- Dùng khi nhân vật nghiêng (-5 đến 5° cho nhẹ), ngã, hoặc quay
- KHÔNG tạo nếu nhân vật đứng thẳng suốt

### 4. z_index_keyframes — ĐỘ SÂU
- {"time": giây, "z": 0-100} (0=phía sau, 100=phía trước)
- CHỈ tạo nếu nhân vật cần chuyển từ trước ra sau hoặc ngược lại
- KHÔNG tạo nếu z không đổi

### 5. flip_x_keyframes — LẬT NGANG
- {"time": giây, "flipX": boolean}
- Step interpolation: giữ trạng thái cho đến keyframe tiếp theo
- Dùng khi nhân vật quay mặt: false=mặc định, true=lật ngang
- VÍ DỤ: nhân vật nói chuyện với người bên phải → flipX=true, quay lại → flipX=false

## QUY TẮC CHUNG CHO TẤT CẢ KEYFRAME
- CHỈ tạo keyframe khi giá trị THỰC SỰ thay đổi
- Mảng rỗng [] = dùng giá trị tĩnh (suggested_x/y/z/scale/flip_x)
- Nếu không có script, CHỈ tạo position keyframe nếu cần di chuyển
- TRÁNH lạm dụng: không tạo keyframe thừa nếu giá trị không đổi

QUAN TRỌNG:
- suggested_y = VỊ TRÍ CHÂN (bottom anchor), KHÔNG phải tâm nhân vật!
- NẾU CÓ ground_y → dùng nó (đã tính sẵn vị trí sàn chính xác)!
- Luôn tính chiều_cao = (scale/1920)*960 và KIỂM TRA nhân vật không vượt ra ngoài canvas
- layers key PHẢI là tên nhóm CHÍNH XÁC, value PHẢI là tên asset CHÍNH XÁC
- Chỉ chọn 1 trong 2 nhóm biểu cảm (表情 HOẶC 豆豆眼表情), KHÔNG chọn cả 2
- Nếu không có script, tạo 2-3 frames mặc định
"""


# ══════════════════════════════════════════════
#  MAIN FUNCTION
# ══════════════════════════════════════════════

async def analyze_character(
    character_name: str,
    layer_catalog: dict[str, list[str]],
    stage_elements: list[dict],
    script_actions: list[dict],
    canvas_width: int = 1920,
    canvas_height: int = 1080,
    other_characters: list[dict] | None = None,
    stage_image_base64: str | None = None,
    model: str | None = None,
    ground_y: float | None = None,
) -> CharacterSuggestionResult:
    """
    Analyze stage context + script to suggest character pose sequence and position.
    Uses Gemini Vision if stage_image_base64 is provided.
    """
    config = get_ai_config()
    api_key = config.api_key
    if not api_key:
        raise ValueError("No API key configured. Add a key via /api/ai/keys/add first.")

    # Auto-detect ground_y from stage elements if not provided
    if ground_y is None:
        ground_y = _compute_ground_y(stage_elements, canvas_height)

    user_text = _build_user_message(
        character_name, layer_catalog, stage_elements, script_actions,
        canvas_width, canvas_height, other_characters,
        has_image=bool(stage_image_base64),
        ground_y=ground_y,
    )

    model_name = model or config.model or "gemini-2.0-flash"
    logger.info(f"Character AI suggest for '{character_name}' with model: {model_name}, "
                f"has_image: {bool(stage_image_base64)}, ground_y: {ground_y}")

    raw_json = await _call_gemini(
        CHARACTER_AGENT_PROMPT, user_text, config, model_name,
        image_base64=stage_image_base64,
    )
    return _parse_result(raw_json, layer_catalog, canvas_width, canvas_height)


def _compute_ground_y(
    stage_elements: list[dict],
    canvas_height: int,
) -> float:
    """
    Compute the ground Y pixel position from stage elements.

    Stage layers are drawn CENTERED at (posX, posY), so:
    - Top of layer = posY - height/2 (where character feet would touch)
    - Bottom of layer = posY + height/2

    For a floor/ground element, characters stand on the TOP of it.
    """
    ground_candidates = []
    for el in stage_elements:
        if not isinstance(el, dict):
            continue
        if el.get("can_stand_on"):
            # Prefer actual layer pixel position (sent from frontend)
            layer_posY = el.get("layer_posY")
            layer_height = el.get("layer_height")
            if layer_posY is not None and layer_height is not None:
                # TOP of centered layer = posY - height/2
                ground_y = layer_posY - layer_height / 2
                ground_candidates.append(ground_y)
            else:
                # Fallback: use semantic bbox_y (% of canvas)
                bbox_y_pct = el.get("bbox_y", 0)
                if bbox_y_pct > 0:
                    ground_candidates.append(bbox_y_pct / 100.0 * canvas_height)

    if ground_candidates:
        # Use the highest standable surface (smallest y = highest on screen)
        ground_y = min(ground_candidates)
        # Clamp: don't place above 40% of canvas
        ground_y = max(ground_y, canvas_height * 0.4)
        return ground_y

    # Default: 80% of canvas height
    return canvas_height * 0.80


def _build_user_message(
    character_name: str,
    layer_catalog: dict[str, list[str]],
    stage_elements: list[dict],
    script_actions: list[dict],
    canvas_width: int,
    canvas_height: int,
    other_characters: list[dict] | None,
    has_image: bool = False,
    ground_y: float | None = None,
) -> str:
    """Build the user message with all context."""
    parts = [f"Canvas: {canvas_width}×{canvas_height}px"]
    parts.append(f"Nhân vật: {character_name}")

    # Ground Y — THE MOST IMPORTANT POSITIONING INFO
    if ground_y is not None:
        parts.append(f"\n🎯 GROUND_Y = {ground_y:.0f}px ← Đặt suggested_y = {ground_y:.0f} để chân chạm đất!")
        # Also provide scale guidance
        available_height = ground_y * 0.65  # character shouldn't fill more than 65% from ground up
        recommended_scale = int(available_height / 960 * 1920)
        recommended_scale = max(400, min(900, recommended_scale))  # clamp
        parts.append(f"   → Scale gợi ý: {recommended_scale} (cao ≈{int(recommended_scale/1920*960)}px, "
                     f"nhân vật từ y={int(ground_y - recommended_scale/1920*960)} đến y={int(ground_y)})")

    if has_image:
        parts.append("\n⚠️ HÌNH ẢNH SÂN KHẤU ĐÃ ĐÍNH KÈM — hãy NHÌN hình để xác nhận vị trí sàn!")
        parts.append("   Nếu hình ảnh cho thấy sàn ở vị trí khác ground_y, hãy ưu tiên hình ảnh.")

    # Layer catalog — THE KEY DATA
    parts.append(f"\n═══ LAYER CATALOG (chọn từ đây) ═══")
    for group_name, asset_names in layer_catalog.items():
        parts.append(f"  【{group_name}】({len(asset_names)} options):")
        parts.append(f"    {', '.join(asset_names)}")

    # Stage elements — convert bbox from % to pixels for clarity
    if stage_elements:
        parts.append(f"\n═══ SÂN KHẤU ({len(stage_elements)} elements, tọa độ pixel) ═══")
        for el in stage_elements:
            if not isinstance(el, dict):
                continue
            flags = []
            if el.get("can_stand_on"):
                flags.append("🦶ĐỨNG ĐƯỢC")
            if el.get("can_sit_on"):
                flags.append("🪑NGỒI ĐƯỢC")
            # Convert % → pixels for clear AI understanding
            bx = el.get('bbox_x', 0) / 100.0 * canvas_width
            by = el.get('bbox_y', 0) / 100.0 * canvas_height
            bw = el.get('bbox_w', 100) / 100.0 * canvas_width
            bh = el.get('bbox_h', 100) / 100.0 * canvas_height
            parts.append(
                f"  • {el.get('name_vi', 'unknown')} [{el.get('category', 'other')}] "
                f"z={el.get('suggested_z', 0)} "
                f"pos({bx:.0f},{by:.0f}) size({bw:.0f}×{bh:.0f}px) "
                f"{' '.join(flags)}"
            )

    # Script actions
    if script_actions:
        parts.append(f"\n═══ KỊCH BẢN ({len(script_actions)} actions) ═══")
        for act in script_actions[:20]:
            if not isinstance(act, dict):
                continue
            emotion = act.get("emotion", "neutral")
            pose = act.get("pose", "standing")
            dialogue = act.get("dialogue", "")
            t = act.get("start_time", 0)
            end_t = act.get("end_time", t + 1)
            desc = act.get("description", act.get("action", ""))
            line = f"  • [{t:.1f}s-{end_t:.1f}s] {emotion}/{pose}"
            if dialogue:
                line += f' — "{dialogue[:60]}"'
            if desc:
                line += f" ({desc[:40]})"
            parts.append(line)
    else:
        parts.append("\n═══ KỊCH BẢN: Không có (tạo 2-3 frames mặc định) ═══")

    # Other characters — always in pixels
    if other_characters:
        parts.append(f"\n═══ NHÂN VẬT KHÁC ({len(other_characters)}) ═══")
        for oc in other_characters:
            parts.append(
                f"  • {oc.get('name', '?')} tại x={oc.get('x', 960):.0f}px, y={oc.get('y', 540):.0f}px"
            )
        parts.append("→ Tránh đặt trùng vị trí! Cách nhau ít nhất 200px theo trục x.")

    return "\n".join(parts)


async def _call_gemini(
    system_prompt: str,
    user_message: str,
    config: Any,
    model_name: str,
    image_base64: str | None = None,
) -> str:
    """Call Gemini API with optional vision. Auto-rotates keys on 429 rate limit."""
    import asyncio
    from google import genai
    from google.genai import types

    # Build contents: text + optional image (reusable across retries)
    if image_base64:
        if "," in image_base64:
            image_base64 = image_base64.split(",", 1)[1]
        image_bytes = base64.b64decode(image_base64)
        contents = [
            types.Part.from_bytes(data=image_bytes, mime_type="image/png"),
            types.Part.from_text(text=user_message),
        ]
        logger.info(f"Sending multimodal request with image ({len(image_bytes)} bytes) + text")
    else:
        contents = user_message

    gen_config = types.GenerateContentConfig(
        system_instruction=system_prompt,
        temperature=0.4,
        response_mime_type="application/json",
    )

    # Retry with key rotation: try each key before sleeping
    total_keys = config.total_keys or 1
    max_attempts = max(3, total_keys + 1)  # At least try each key + 1 retry
    last_error = None
    keys_tried_this_round = 0

    for attempt in range(max_attempts):
        # Create client with CURRENT key (may have been rotated)
        current_key = config.api_key
        if not current_key:
            raise ValueError("No API key configured.")

        client = genai.Client(api_key=current_key)
        try:
            response = await client.aio.models.generate_content(
                model=model_name,
                contents=contents,
                config=gen_config,
            )
            return response.text
        except Exception as e:
            last_error = e
            err_str = str(e)
            is_rate_limited = any(k in err_str for k in ["429", "RESOURCE_EXHAUSTED"])
            is_unavailable = any(k in err_str for k in ["503", "UNAVAILABLE"])

            if is_rate_limited:
                keys_tried_this_round += 1
                # Try rotating to another key first
                rotated = config.rotate_key()
                if rotated and keys_tried_this_round < total_keys:
                    logger.info(f"429 on {current_key[:8]}..., rotating to {config.current_key_label}")
                    continue  # Immediately try next key, no wait

                # All keys exhausted this round — wait then retry
                keys_tried_this_round = 0
                import re
                delay_match = re.search(r'retry in (\d+)', err_str, re.IGNORECASE)
                wait = int(delay_match.group(1)) + 2 if delay_match else 15
                logger.warning(f"All {total_keys} keys rate-limited, waiting {wait}s (attempt {attempt + 1}/{max_attempts})")
                await asyncio.sleep(wait)

            elif is_unavailable:
                wait = 5 * (attempt + 1)
                logger.warning(f"503 UNAVAILABLE, retry {attempt + 1}/{max_attempts} after {wait}s")
                await asyncio.sleep(wait)
            else:
                raise

    raise last_error


def _parse_result(
    raw_json: str,
    layer_catalog: dict[str, list[str]],
    canvas_width: int,
    canvas_height: int,
) -> CharacterSuggestionResult:
    """Parse Gemini JSON response, validating asset names against catalog."""
    logger.info(f"Raw Gemini response ({len(raw_json)} chars): {raw_json[:300]}")

    try:
        data = json.loads(raw_json)
    except json.JSONDecodeError:
        import re
        match = re.search(r'```(?:json)?\s*([\s\S]*?)```', raw_json)
        if match:
            data = json.loads(match.group(1))
        else:
            raise ValueError(f"Could not parse JSON response: {raw_json[:200]}")

    # Handle case where Gemini returns an array instead of object
    if isinstance(data, list):
        logger.warning(f"Gemini returned array with {len(data)} items, using first element")
        if data:
            data = data[0]
        else:
            data = {}
    
    if not isinstance(data, dict):
        logger.error(f"Unexpected response type: {type(data)}, raw: {raw_json[:200]}")
        data = {}

    result = CharacterSuggestionResult(
        suggested_x=_clamp(data.get("suggested_x", 960), 0, canvas_width),
        suggested_y=_clamp(data.get("suggested_y", 540), 0, canvas_height),
        suggested_z=int(data.get("suggested_z", 10)),
        suggested_scale=data.get("suggested_scale", 960),
        flip_x=bool(data.get("flip_x", False)),
        position_reason=data.get("position_reason", ""),
    )

    # ── Position bounds validation ──
    scale_factor = result.suggested_scale / 1920
    char_height = scale_factor * 960
    char_top = result.suggested_y - char_height
    if char_top < -50:
        result.validation_warnings.append({
            "type": "warning",
            "field": "position",
            "message": f"Đầu nhân vật vượt trên canvas (top={char_top:.0f}px). Cần giảm scale hoặc tăng y.",
        })
    if result.suggested_y > canvas_height + 50:
        result.validation_warnings.append({
            "type": "warning",
            "field": "position",
            "message": f"Chân nhân vật dưới canvas (y={result.suggested_y:.0f}px > {canvas_height}px).",
        })

    for frame_idx, frame_data in enumerate(data.get("pose_frames", [])):
        layers = {}
        raw_layers = frame_data.get("layers", {})

        # Validate each layer selection against catalog
        for group_name, asset_name in raw_layers.items():
            if group_name in layer_catalog:
                if asset_name in layer_catalog[group_name]:
                    layers[group_name] = asset_name
                    result.validation_warnings.append({
                        "type": "ok",
                        "field": "layer",
                        "frame": frame_idx,
                        "message": f"{group_name}: '{asset_name}' ✓",
                    })
                else:
                    matched = _fuzzy_match(asset_name, layer_catalog[group_name])
                    if matched:
                        layers[group_name] = matched
                        result.validation_warnings.append({
                            "type": "fuzzy",
                            "field": "layer",
                            "frame": frame_idx,
                            "message": f"{group_name}: '{asset_name}' → fuzzy matched to '{matched}'",
                        })
                        logger.warning(f"Fuzzy matched '{asset_name}' → '{matched}' in group '{group_name}'")
                    else:
                        result.validation_warnings.append({
                            "type": "error",
                            "field": "layer",
                            "frame": frame_idx,
                            "message": f"{group_name}: '{asset_name}' not found, skipped",
                        })
                        logger.warning(f"AI selected '{asset_name}' not found in group '{group_name}', skipping")
            else:
                result.validation_warnings.append({
                    "type": "error",
                    "field": "layer",
                    "frame": frame_idx,
                    "message": f"Group '{group_name}' not in catalog, skipped",
                })
                logger.warning(f"Group '{group_name}' not found in catalog, skipping")

        frame = SuggestedPoseFrame(
            duration=float(frame_data.get("duration", 1.0)),
            layers=layers,
            transition=frame_data.get("transition", "cut"),
            description=frame_data.get("description", ""),
        )
        result.pose_frames.append(frame)

    # Parse position_keyframes (animated movement)
    for kf_data in data.get("position_keyframes", []):
        if not isinstance(kf_data, dict):
            continue
        kf = PositionKeyframeSuggestion(
            time=float(kf_data.get("time", 0)),
            x=_clamp(float(kf_data.get("x", result.suggested_x)), 0, canvas_width),
            y=_clamp(float(kf_data.get("y", result.suggested_y)), 0, canvas_height),
        )
        result.position_keyframes.append(kf)
    result.position_keyframes.sort(key=lambda k: k.time)

    # Remove redundant position_keyframes (all same position = no actual movement)
    if len(result.position_keyframes) > 1:
        positions = set((round(k.x), round(k.y)) for k in result.position_keyframes)
        if len(positions) == 1:
            logger.info("All position_keyframes at same (x,y) — removing redundant keyframes")
            result.position_keyframes = []

    # Parse scale_keyframes
    for kf_data in data.get("scale_keyframes", []):
        if not isinstance(kf_data, dict):
            continue
        result.scale_keyframes.append(ScaleKeyframeSuggestion(
            time=float(kf_data.get("time", 0)),
            scale=float(kf_data.get("scale", result.suggested_scale)),
        ))
    result.scale_keyframes.sort(key=lambda k: k.time)
    # Remove redundant scale keyframes
    if len(result.scale_keyframes) > 1:
        scales = set(round(k.scale) for k in result.scale_keyframes)
        if len(scales) == 1:
            result.scale_keyframes = []

    # Parse rotation_keyframes
    for kf_data in data.get("rotation_keyframes", []):
        if not isinstance(kf_data, dict):
            continue
        result.rotation_keyframes.append(RotationKeyframeSuggestion(
            time=float(kf_data.get("time", 0)),
            rotation=float(kf_data.get("rotation", 0)),
        ))
    result.rotation_keyframes.sort(key=lambda k: k.time)
    # Remove redundant rotation keyframes (all zero = no rotation)
    if len(result.rotation_keyframes) > 1:
        rots = set(round(k.rotation, 1) for k in result.rotation_keyframes)
        if len(rots) == 1 and 0.0 in rots:
            result.rotation_keyframes = []

    # Parse z_index_keyframes
    for kf_data in data.get("z_index_keyframes", []):
        if not isinstance(kf_data, dict):
            continue
        result.z_index_keyframes.append(ZIndexKeyframeSuggestion(
            time=float(kf_data.get("time", 0)),
            z=int(kf_data.get("z", result.suggested_z)),
        ))
    result.z_index_keyframes.sort(key=lambda k: k.time)
    # Remove redundant z_index keyframes
    if len(result.z_index_keyframes) > 1:
        zs = set(k.z for k in result.z_index_keyframes)
        if len(zs) == 1:
            result.z_index_keyframes = []

    # Parse flip_x_keyframes
    for kf_data in data.get("flip_x_keyframes", []):
        if not isinstance(kf_data, dict):
            continue
        result.flip_x_keyframes.append(FlipXKeyframeSuggestion(
            time=float(kf_data.get("time", 0)),
            flip_x=bool(kf_data.get("flipX", kf_data.get("flip_x", False))),
        ))
    result.flip_x_keyframes.sort(key=lambda k: k.time)
    # Remove redundant flip keyframes (all same value)
    if len(result.flip_x_keyframes) > 1:
        flips = set(k.flip_x for k in result.flip_x_keyframes)
        if len(flips) == 1:
            result.flip_x_keyframes = []

    # Ensure at least one frame
    if not result.pose_frames:
        default_layers = {}
        for group_name, assets in layer_catalog.items():
            if assets:
                default = _find_default(group_name, assets)
                default_layers[group_name] = default
        result.pose_frames.append(SuggestedPoseFrame(
            duration=2.0,
            layers=default_layers,
            description="Khung mặc định",
        ))

    return result


def _fuzzy_match(target: str, options: list[str]) -> str | None:
    """Try to fuzzy match an asset name."""
    for opt in options:
        if target in opt or opt in target:
            return opt
    return None


def _find_default(group_name: str, assets: list[str]) -> str:
    """Find a sensible default asset for a group."""
    standing_names = ["站立", "待机", "默认", "idle", "standing"]
    neutral_faces = ["无表情", "微笑", "默认", "neutral"]
    search_list = standing_names if "动作" in group_name or "pose" in group_name.lower() else neutral_faces
    for name in search_list:
        if name in assets:
            return name
    return assets[0]


def _clamp(value: float, min_val: float, max_val: float) -> float:
    return max(min_val, min(max_val, value))
