"""
Scene Analyzer — Phân tích bối cảnh scene từ workflow node graph.

Nhận workflow JSON (nodes + edges) và trả về SceneContext mô tả chi tiết:
- Nhân vật nào, ở đâu, tương quan vị trí
- Background, camera, foreground, props, audio
- Layer order (z-index)
"""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Optional


# ══════════════════════════════════════════════
#  DATA CLASSES
# ══════════════════════════════════════════════

@dataclass
class CanvasInfo:
    width: int = 1920
    height: int = 1080
    fps: int = 30
    total_duration: float = 0.0


@dataclass
class CharacterInfo:
    node_id: str = ""
    name: str = ""
    position_x: float = 0.0
    position_y: float = 0.0
    scale: float = 1.0
    opacity: float = 1.0
    z_index: int = 0
    current_pose_count: int = 0
    position_relative: str = ""       # "trái", "giữa", "phải"
    vertical_position: str = ""       # "trên", "giữa", "dưới"
    has_position_keyframes: bool = False
    position_keyframe_count: int = 0


@dataclass
class BackgroundInfo:
    node_id: str = ""
    label: str = ""
    asset_hash: str = ""
    asset_path: str = ""
    blur: float = 0.0
    parallax_speed: float = 0.0


@dataclass
class CameraInfo:
    node_id: str = ""
    label: str = ""
    action: str = "static"
    start_x: float = 960.0
    start_y: float = 540.0
    end_x: float = 960.0
    end_y: float = 540.0
    start_zoom: float = 1.0
    end_zoom: float = 1.0
    duration: float = 2.0
    easing: str = "easeInOut"


@dataclass
class ForegroundInfo:
    node_id: str = ""
    label: str = ""
    effect_type: str = ""
    intensity: float = 0.5
    speed: float = 1.0
    opacity: float = 0.7
    z_index: int = 50


@dataclass
class PropInfo:
    node_id: str = ""
    label: str = ""
    asset_hash: str = ""
    position_x: float = 0.0
    position_y: float = 0.0
    scale: float = 1.0
    opacity: float = 1.0
    rotation: float = 0.0
    z_index: int = 0
    position_relative: str = ""


@dataclass
class AudioInfo:
    node_id: str = ""
    label: str = ""
    audio_type: str = "bgm"
    volume: float = 0.8
    start_time: float = 0.0
    loop: bool = False


@dataclass
class LayerEntry:
    node_id: str = ""
    name: str = ""
    type: str = ""   # "character", "background", "prop", "foreground"
    z_index: int = 0


@dataclass
class SceneContext:
    characters: list[CharacterInfo] = field(default_factory=list)
    background: Optional[BackgroundInfo] = None
    camera: Optional[CameraInfo] = None
    foreground: Optional[ForegroundInfo] = None
    props: list[PropInfo] = field(default_factory=list)
    audio: list[AudioInfo] = field(default_factory=list)
    canvas: CanvasInfo = field(default_factory=CanvasInfo)
    layer_order: list[LayerEntry] = field(default_factory=list)
    arrangement_description: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


# ══════════════════════════════════════════════
#  HELPERS
# ══════════════════════════════════════════════

def _find_node_by_type(nodes: list[dict], node_type: str) -> dict | None:
    """Find the first node matching the given type."""
    for node in nodes:
        if node.get("type") == node_type:
            return node
    return None


# ══════════════════════════════════════════════
#  MAIN ANALYZER
# ══════════════════════════════════════════════

def analyze_scene(nodes: list[dict], edges: list[dict], current_time: float | None = None) -> SceneContext:
    """
    Analyze a workflow node graph and produce a SceneContext.

    Args:
        nodes: Workflow nodes (from useWorkflowStore)
        edges: Workflow edges
        current_time: Optional time in seconds for time-based analysis

    Returns:
        SceneContext with full scene description
    """
    ctx = SceneContext()

    # 1. Find Scene node
    scene_node = _find_node_by_type(nodes, "scene")
    if scene_node:
        data = scene_node.get("data", {})
        ctx.canvas = CanvasInfo(
            width=data.get("canvasWidth", 1920),
            height=data.get("canvasHeight", 1080),
            fps=data.get("fps", 30),
            total_duration=data.get("totalDuration", 0),
        )

    # 2. Find all nodes connected to scene
    scene_id = scene_node["id"] if scene_node else None
    connected_ids = set()
    if scene_id:
        for edge in edges:
            if edge.get("target") == scene_id:
                connected_ids.add(edge.get("source"))

    # 3. Process each connected node
    all_layers: list[LayerEntry] = []

    for node in nodes:
        node_id = node.get("id", "")
        node_type = node.get("type", "")
        data = node.get("data", {})

        # Only process nodes connected to the scene (or all if no scene)
        if scene_id and node_id not in connected_ids and node_id != scene_id:
            continue

        if node_type == "character":
            char = _process_character(node, ctx.canvas)
            ctx.characters.append(char)
            all_layers.append(LayerEntry(
                node_id=node_id,
                name=char.name,
                type="character",
                z_index=char.z_index,
            ))

        elif node_type == "background":
            ctx.background = _process_background(node)
            all_layers.append(LayerEntry(
                node_id=node_id,
                name=ctx.background.label,
                type="background",
                z_index=0,
            ))

        elif node_type == "camera":
            ctx.camera = _process_camera(node)

        elif node_type == "foreground":
            ctx.foreground = _process_foreground(node)
            all_layers.append(LayerEntry(
                node_id=node_id,
                name=ctx.foreground.label,
                type="foreground",
                z_index=ctx.foreground.z_index,
            ))

        elif node_type == "prop":
            prop = _process_prop(node, ctx.canvas)
            ctx.props.append(prop)
            all_layers.append(LayerEntry(
                node_id=node_id,
                name=prop.label,
                type="prop",
                z_index=prop.z_index,
            ))

        elif node_type == "audio":
            ctx.audio.append(_process_audio(node))

    # 4. Sort layer order by z-index
    all_layers.sort(key=lambda l: l.z_index)
    ctx.layer_order = all_layers

    # 5. Build arrangement description
    ctx.arrangement_description = _build_arrangement_description(ctx)

    return ctx


# ══════════════════════════════════════════════
#  NODE PROCESSORS
# ══════════════════════════════════════════════

def _process_character(node: dict, canvas: CanvasInfo) -> CharacterInfo:
    data = node.get("data", {})
    pos_x = data.get("posX", 0)
    pos_y = data.get("posY", 0)
    pos_kfs = data.get("positionKeyframes", [])

    return CharacterInfo(
        node_id=node.get("id", ""),
        name=data.get("characterName", "") or data.get("label", "Character"),
        position_x=pos_x,
        position_y=pos_y,
        scale=data.get("scale", 1.0),
        opacity=data.get("opacity", 1.0),
        z_index=data.get("zIndex", 10),
        current_pose_count=len(data.get("sequence", [])),
        position_relative=_get_horizontal_position(pos_x, canvas.width),
        vertical_position=_get_vertical_position(pos_y, canvas.height),
        has_position_keyframes=len(pos_kfs) > 0,
        position_keyframe_count=len(pos_kfs),
    )


def _process_background(node: dict) -> BackgroundInfo:
    data = node.get("data", {})
    return BackgroundInfo(
        node_id=node.get("id", ""),
        label=data.get("label", "Background"),
        asset_hash=data.get("assetHash", ""),
        asset_path=data.get("assetPath", ""),
        blur=data.get("blur", 0),
        parallax_speed=data.get("parallaxSpeed", 0),
    )


def _process_camera(node: dict) -> CameraInfo:
    data = node.get("data", {})
    return CameraInfo(
        node_id=node.get("id", ""),
        label=data.get("label", "Camera"),
        action=data.get("cameraAction", "static"),
        start_x=data.get("startX", 960),
        start_y=data.get("startY", 540),
        end_x=data.get("endX", 960),
        end_y=data.get("endY", 540),
        start_zoom=data.get("startZoom", 1),
        end_zoom=data.get("endZoom", 1),
        duration=data.get("duration", 2),
        easing=data.get("easing", "easeInOut"),
    )


def _process_foreground(node: dict) -> ForegroundInfo:
    data = node.get("data", {})
    return ForegroundInfo(
        node_id=node.get("id", ""),
        label=data.get("label", "Foreground"),
        effect_type=data.get("effectType", ""),
        intensity=data.get("intensity", 0.5),
        speed=data.get("speed", 1.0),
        opacity=data.get("opacity", 0.7),
        z_index=data.get("zIndex", 50),
    )


def _process_prop(node: dict, canvas: CanvasInfo) -> PropInfo:
    data = node.get("data", {})
    pos_x = data.get("posX", 0)
    pos_y = data.get("posY", 0)
    return PropInfo(
        node_id=node.get("id", ""),
        label=data.get("label", "Prop"),
        asset_hash=data.get("assetHash", ""),
        position_x=pos_x,
        position_y=pos_y,
        scale=data.get("scale", 1.0),
        opacity=data.get("opacity", 1.0),
        rotation=data.get("rotation", 0),
        z_index=data.get("zIndex", 15),
        position_relative=_get_horizontal_position(pos_x, canvas.width),
    )


def _process_audio(node: dict) -> AudioInfo:
    data = node.get("data", {})
    return AudioInfo(
        node_id=node.get("id", ""),
        label=data.get("label", "Audio"),
        audio_type=data.get("audioType", "bgm"),
        volume=data.get("volume", 0.8),
        start_time=data.get("startTime", 0),
        loop=data.get("loop", False),
    )


# ══════════════════════════════════════════════
#  POSITION HELPERS
# ══════════════════════════════════════════════

def _get_horizontal_position(x: float, canvas_width: int) -> str:
    """Classify horizontal position as trái/giữa/phải."""
    third = canvas_width / 3
    if x < third:
        return "trái"
    elif x > third * 2:
        return "phải"
    return "giữa"


def _get_vertical_position(y: float, canvas_height: int) -> str:
    """Classify vertical position as trên/giữa/dưới."""
    third = canvas_height / 3
    if y < third:
        return "trên"
    elif y > third * 2:
        return "dưới"
    return "giữa"


def _get_distance(x1: float, y1: float, x2: float, y2: float) -> float:
    return ((x2 - x1) ** 2 + (y2 - y1) ** 2) ** 0.5


def _describe_relative_position(char_a: CharacterInfo, char_b: CharacterInfo) -> str:
    """Describe position of char_b relative to char_a."""
    dx = char_b.position_x - char_a.position_x
    dy = char_b.position_y - char_a.position_y

    parts = []
    if abs(dx) > 100:
        parts.append("bên phải" if dx > 0 else "bên trái")
    if abs(dy) > 100:
        parts.append("phía dưới" if dy > 0 else "phía trên")

    if not parts:
        return "cùng vị trí"

    return " ".join(parts)


# ══════════════════════════════════════════════
#  ARRANGEMENT DESCRIPTION BUILDER
# ══════════════════════════════════════════════

def _build_arrangement_description(ctx: SceneContext) -> str:
    """Build a human-readable description of the scene arrangement."""
    parts: list[str] = []

    # Canvas info
    parts.append(f"Canvas {ctx.canvas.width}×{ctx.canvas.height}")

    # Background
    if ctx.background and ctx.background.asset_hash:
        bg_desc = f"Background: {ctx.background.label}"
        if ctx.background.blur > 0:
            bg_desc += f" (blur: {ctx.background.blur})"
        if ctx.background.parallax_speed > 0:
            bg_desc += f" (parallax: {ctx.background.parallax_speed})"
        parts.append(bg_desc)
    else:
        parts.append("Không có background")

    # Characters
    n_chars = len(ctx.characters)
    if n_chars == 0:
        parts.append("Không có nhân vật")
    elif n_chars == 1:
        c = ctx.characters[0]
        parts.append(
            f"1 nhân vật: {c.name} ở {c.position_relative}-{c.vertical_position} "
            f"(x={c.position_x:.0f}, y={c.position_y:.0f}, scale={c.scale:.1f})"
        )
        if c.has_position_keyframes:
            parts.append(f"  → có {c.position_keyframe_count} position keyframes (animation)")
    else:
        parts.append(f"{n_chars} nhân vật:")
        for c in sorted(ctx.characters, key=lambda ch: ch.position_x):
            line = (
                f"  • {c.name}: {c.position_relative}-{c.vertical_position} "
                f"(x={c.position_x:.0f}, y={c.position_y:.0f}, z={c.z_index}, scale={c.scale:.1f})"
            )
            if c.has_position_keyframes:
                line += f" [{c.position_keyframe_count} KFs]"
            parts.append(line)

        # Relative positions between characters
        if n_chars == 2:
            a, b = ctx.characters[0], ctx.characters[1]
            rel = _describe_relative_position(a, b)
            dist = _get_distance(a.position_x, a.position_y, b.position_x, b.position_y)
            parts.append(f"  → {b.name} ở {rel} so với {a.name} (khoảng cách: {dist:.0f}px)")

    # Props
    if ctx.props:
        parts.append(f"{len(ctx.props)} prop(s): " + ", ".join(
            f"{p.label} ({p.position_relative})" for p in ctx.props
        ))

    # Camera
    if ctx.camera:
        if ctx.camera.action == "static":
            parts.append("Camera: tĩnh")
        else:
            parts.append(
                f"Camera: {ctx.camera.action} "
                f"(zoom {ctx.camera.start_zoom:.1f}→{ctx.camera.end_zoom:.1f}, "
                f"easing: {ctx.camera.easing})"
            )

    # Foreground
    if ctx.foreground:
        parts.append(
            f"Foreground: {ctx.foreground.effect_type} "
            f"(intensity: {ctx.foreground.intensity:.1f})"
        )

    # Audio
    if ctx.audio:
        for a in ctx.audio:
            parts.append(f"Audio ({a.audio_type}): {a.label} (vol: {a.volume:.1f})")

    # Layer order
    if ctx.layer_order:
        order_names = [f"{l.name} (z={l.z_index})" for l in ctx.layer_order]
        parts.append(f"Layer order (back→front): {' → '.join(order_names)}")

    return "\n".join(parts)
