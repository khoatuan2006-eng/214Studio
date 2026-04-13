"""
AI Tool Functions — The interface between AI agents and the Scene Graph.

These functions are designed to be called via Gemini function calling.
Instead of the AI writing raw JSON, it calls structured tools like:
  set_position("char-1", 5.0, 7.5)
  add_keyframe("char-1", "x", 2.0, 8.0, "easeInOut")

This module provides:
1. TOOL_DEFINITIONS — JSON schemas for Gemini function calling
2. execute_tool() — Dispatches tool calls to SceneGraph methods
3. SceneToolExecutor — Stateful executor bound to a SceneGraph

Architecture inspired by:
- ComfyUI execution.py (node execution dispatching)
- Gemini/OpenAI function calling schemas
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Optional

from backend.core.scene_graph.scene import SceneGraph
from backend.core.scene_graph.node import SceneNode
from backend.core.scene_graph.specialized_nodes import (
    CharacterNode,
    BackgroundLayerNode,
    CameraNode,
    PropNode,
    TextNode,
    AudioNode,
)
from backend.core.scene_graph.transform import Transform

logger = logging.getLogger(__name__)


# ══════════════════════════════════════════════
#  TOOL DEFINITIONS — For Gemini function calling
# ══════════════════════════════════════════════

TOOL_DEFINITIONS = [
    # ── Scene Query Tools ──
    {
        "name": "get_scene_summary",
        "description": "Mô tả toàn bộ scene hiện tại: có những gì, ở đâu, kích thước ra sao.",
        "parameters": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "list_objects",
        "description": "Liệt kê tất cả objects trong scene với thông tin cơ bản.",
        "parameters": {
            "type": "object",
            "properties": {
                "type_filter": {
                    "type": "string",
                    "description": "Lọc theo loại: character, background_layer, prop, camera, text, audio",
                    "enum": ["character", "background_layer", "prop", "camera", "text", "audio"],
                },
            },
            "required": [],
        },
    },
    {
        "name": "get_object_info",
        "description": "Lấy thông tin chi tiết của một object theo ID.",
        "parameters": {
            "type": "object",
            "properties": {
                "object_id": {"type": "string", "description": "ID của object"},
            },
            "required": ["object_id"],
        },
    },
    {
        "name": "get_spatial_relationships",
        "description": "Mô tả mối quan hệ không gian giữa các objects (ai ở bên trái/phải/trên/dưới ai).",
        "parameters": {"type": "object", "properties": {}, "required": []},
    },

    # ── Transform Tools ──
    {
        "name": "set_position",
        "description": "Di chuyển object tới vị trí (x, y) trong world units. Canvas: 19.2×10.8, center: (9.6, 5.4).",
        "parameters": {
            "type": "object",
            "properties": {
                "object_id": {"type": "string", "description": "ID của object"},
                "x": {"type": "number", "description": "Vị trí X (world units, 0-19.2)"},
                "y": {"type": "number", "description": "Vị trí Y (world units, 0-10.8)"},
            },
            "required": ["object_id", "x", "y"],
        },
    },
    {
        "name": "set_scale",
        "description": "Thay đổi kích thước object. 1.0 = kích thước gốc, 2.0 = gấp đôi.",
        "parameters": {
            "type": "object",
            "properties": {
                "object_id": {"type": "string", "description": "ID của object"},
                "scale": {"type": "number", "description": "Tỉ lệ (1.0 = bình thường)"},
            },
            "required": ["object_id", "scale"],
        },
    },
    {
        "name": "set_rotation",
        "description": "Xoay object theo độ (degrees). 0 = không xoay.",
        "parameters": {
            "type": "object",
            "properties": {
                "object_id": {"type": "string", "description": "ID của object"},
                "degrees": {"type": "number", "description": "Góc xoay (degrees)"},
            },
            "required": ["object_id", "degrees"],
        },
    },
    {
        "name": "set_opacity",
        "description": "Thay đổi độ trong suốt. 0.0 = hoàn toàn trong suốt, 1.0 = hoàn toàn hiện.",
        "parameters": {
            "type": "object",
            "properties": {
                "object_id": {"type": "string", "description": "ID của object"},
                "opacity": {"type": "number", "description": "Độ trong suốt (0.0-1.0)"},
            },
            "required": ["object_id", "opacity"],
        },
    },
    {
        "name": "set_z_index",
        "description": "Thay đổi thứ tự layer. Z-index cao hơn = hiển thị phía trước.",
        "parameters": {
            "type": "object",
            "properties": {
                "object_id": {"type": "string", "description": "ID của object"},
                "z_index": {"type": "integer", "description": "Thứ tự layer"},
            },
            "required": ["object_id", "z_index"],
        },
    },

    # ── Keyframe Animation Tools ──
    {
        "name": "add_keyframe",
        "description": "Thêm keyframe animation cho một property tại thời điểm cụ thể.",
        "parameters": {
            "type": "object",
            "properties": {
                "object_id": {"type": "string", "description": "ID của object"},
                "property": {
                    "type": "string",
                    "description": "Tên property cần animate",
                    "enum": ["x", "y", "scale_x", "scale_y", "rotation", "opacity"],
                },
                "time": {"type": "number", "description": "Thời điểm (seconds)"},
                "value": {"type": "number", "description": "Giá trị tại thời điểm này"},
                "easing": {
                    "type": "string",
                    "description": "Easing function",
                    "enum": ["linear", "easeIn", "easeOut", "easeInOut", "easeInCubic", "easeOutCubic", "easeInOutCubic", "step"],
                },
            },
            "required": ["object_id", "property", "time", "value"],
        },
    },
    {
        "name": "remove_keyframe",
        "description": "Xóa keyframe tại thời điểm cụ thể.",
        "parameters": {
            "type": "object",
            "properties": {
                "object_id": {"type": "string", "description": "ID của object"},
                "property": {"type": "string", "description": "Tên property"},
                "time": {"type": "number", "description": "Thời điểm (seconds)"},
            },
            "required": ["object_id", "property", "time"],
        },
    },

    # ── Character-specific Tools ──
    {
        "name": "set_character_pose",
        "description": "Thay đổi tư thế/biểu cảm nhân vật bằng cách chuyển layer. Ví dụ: pose=站立, face=微笑.",
        "parameters": {
            "type": "object",
            "properties": {
                "object_id": {"type": "string", "description": "ID của character"},
                "layers": {
                    "type": "object",
                    "description": "Layer selections: {group_name: asset_name}",
                    "additionalProperties": {"type": "string"},
                },
            },
            "required": ["object_id", "layers"],
        },
    },
    {
        "name": "add_character_frame",
        "description": "Thêm một frame vào chuỗi animation nhân vật (swap pose/face tại thời điểm T).",
        "parameters": {
            "type": "object",
            "properties": {
                "object_id": {"type": "string", "description": "ID của character"},
                "time": {"type": "number", "description": "Thời điểm (seconds)"},
                "layers": {
                    "type": "object",
                    "description": "Layer selections tại thời điểm này",
                    "additionalProperties": {"type": "string"},
                },
            },
            "required": ["object_id", "time", "layers"],
        },
    },

    # ── Scene Mutation Tools ──
    {
        "name": "add_character",
        "description": "Thêm nhân vật vào scene.",
        "parameters": {
            "type": "object",
            "properties": {
                "character_id": {"type": "string", "description": "ID nhân vật trong database"},
                "name": {"type": "string", "description": "Tên hiển thị"},
                "x": {"type": "number", "description": "Vị trí X (world units)"},
                "y": {"type": "number", "description": "Vị trí Y (world units)"},
                "scale": {"type": "number", "description": "Kích thước (mặc định 1.0)"},
            },
            "required": ["character_id", "name", "x", "y"],
        },
    },
    {
        "name": "add_background_layer",
        "description": "Thêm layer nền vào scene.",
        "parameters": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Tên layer (ví dụ: 'Bầu trời')"},
                "asset_path": {"type": "string", "description": "Đường dẫn tới file ảnh"},
                "z_index": {"type": "integer", "description": "Thứ tự layer (nhỏ = phía sau)"},
                "parallax_speed": {"type": "number", "description": "Tốc độ parallax (0=tĩnh, 1=bình thường)"},
            },
            "required": ["name", "asset_path", "z_index"],
        },
    },
    {
        "name": "remove_object",
        "description": "Xóa object khỏi scene.",
        "parameters": {
            "type": "object",
            "properties": {
                "object_id": {"type": "string", "description": "ID của object cần xóa"},
            },
            "required": ["object_id"],
        },
    },
]


# ══════════════════════════════════════════════
#  TOOL EXECUTOR
# ══════════════════════════════════════════════

@dataclass
class ToolResult:
    """Result of executing a tool call."""

    success: bool
    data: Any = None
    error: str = ""

    def to_str(self) -> str:
        """Format result as string for LLM consumption."""
        if self.success:
            if isinstance(self.data, str):
                return self.data
            elif isinstance(self.data, list):
                return "\n".join(str(item) for item in self.data)
            elif isinstance(self.data, dict):
                import json
                return json.dumps(self.data, ensure_ascii=False, indent=2)
            return str(self.data) if self.data else "OK"
        return f"Error: {self.error}"


class SceneToolExecutor:
    """Executes AI tool calls against a SceneGraph.

    Usage:
        graph = SceneGraph()
        executor = SceneToolExecutor(graph)
        result = executor.execute("set_position", {"object_id": "char-1", "x": 5.0, "y": 7.5})
    """

    def __init__(self, graph: SceneGraph, asset_registry=None):
        self.graph = graph
        self.asset_registry = asset_registry
        self._action_log: list[dict] = []

    @property
    def action_log(self) -> list[dict]:
        """Log of all tool calls executed."""
        return self._action_log

    def execute(self, tool_name: str, params: dict) -> ToolResult:
        """Execute a tool call.

        Args:
            tool_name: Name of the tool (from TOOL_DEFINITIONS).
            params: Parameters for the tool call.

        Returns:
            ToolResult with success/failure and data.
        """
        handler = getattr(self, f"_handle_{tool_name}", None)
        if handler is None:
            return ToolResult(success=False, error=f"Unknown tool: {tool_name}")

        try:
            result = handler(params)
            self._action_log.append({
                "tool": tool_name,
                "params": params,
                "success": True,
            })
            return result
        except Exception as e:
            logger.error(f"Tool '{tool_name}' failed: {e}")
            self._action_log.append({
                "tool": tool_name,
                "params": params,
                "success": False,
                "error": str(e),
            })
            return ToolResult(success=False, error=str(e))

    # ── Query Handlers ──

    def _handle_get_scene_summary(self, params: dict) -> ToolResult:
        return ToolResult(success=True, data=self.graph.describe())

    def _handle_list_objects(self, params: dict) -> ToolResult:
        type_filter = params.get("type_filter")
        if type_filter:
            nodes = self.graph.get_nodes_by_type(type_filter)
        else:
            nodes = list(self.graph.nodes.values())

        summaries = []
        for node in nodes:
            summaries.append({
                "id": node.id,
                "name": node.name,
                "type": node.node_type,
                "x": node.transform.x,
                "y": node.transform.y,
                "scale": node.transform.scale,
                "z_index": node.z_index,
            })
        return ToolResult(success=True, data=summaries)

    def _handle_get_object_info(self, params: dict) -> ToolResult:
        node = self.graph.get_node(params["object_id"])
        if not node:
            return ToolResult(success=False, error=f"Object '{params['object_id']}' not found")
        return ToolResult(success=True, data=node.describe())

    def _handle_get_spatial_relationships(self, params: dict) -> ToolResult:
        rels = self.graph.get_spatial_relationships()
        return ToolResult(success=True, data=rels)

    # ── Transform Handlers ──

    def _handle_set_position(self, params: dict) -> ToolResult:
        node = self._get_node(params["object_id"])
        if not node:
            return self._not_found(params["object_id"])
        node.set_position(params["x"], params["y"])
        return ToolResult(success=True, data=f"Moved '{node.name}' to ({params['x']:.1f}, {params['y']:.1f})")

    def _handle_set_scale(self, params: dict) -> ToolResult:
        node = self._get_node(params["object_id"])
        if not node:
            return self._not_found(params["object_id"])
        node.set_scale(params["scale"])
        return ToolResult(success=True, data=f"Scaled '{node.name}' to {params['scale']:.2f}")

    def _handle_set_rotation(self, params: dict) -> ToolResult:
        node = self._get_node(params["object_id"])
        if not node:
            return self._not_found(params["object_id"])
        node.set_rotation(params["degrees"])
        return ToolResult(success=True, data=f"Rotated '{node.name}' to {params['degrees']:.0f}°")

    def _handle_set_opacity(self, params: dict) -> ToolResult:
        node = self._get_node(params["object_id"])
        if not node:
            return self._not_found(params["object_id"])
        node.set_opacity(params["opacity"])
        return ToolResult(success=True, data=f"Set opacity of '{node.name}' to {params['opacity']:.1f}")

    def _handle_set_z_index(self, params: dict) -> ToolResult:
        node = self._get_node(params["object_id"])
        if not node:
            return self._not_found(params["object_id"])
        node.set_z_index(params["z_index"])
        return ToolResult(success=True, data=f"Set z-index of '{node.name}' to {params['z_index']}")

    # ── Keyframe Handlers ──

    def _handle_add_keyframe(self, params: dict) -> ToolResult:
        node = self._get_node(params["object_id"])
        if not node:
            return self._not_found(params["object_id"])
        easing = params.get("easing", "linear")
        node.add_keyframe(params["property"], params["time"], params["value"], easing)
        return ToolResult(
            success=True,
            data=f"Added keyframe on '{node.name}'.{params['property']} at t={params['time']:.2f}s → {params['value']:.2f} ({easing})"
        )

    def _handle_remove_keyframe(self, params: dict) -> ToolResult:
        node = self._get_node(params["object_id"])
        if not node:
            return self._not_found(params["object_id"])
        node.remove_keyframe(params["property"], params["time"])
        return ToolResult(success=True, data=f"Removed keyframe on '{node.name}'.{params['property']} at t={params['time']:.2f}s")

    # ── Character Handlers ──

    def _handle_set_character_pose(self, params: dict) -> ToolResult:
        node = self._get_node(params["object_id"])
        if not node:
            return self._not_found(params["object_id"])
        if not isinstance(node, CharacterNode):
            return ToolResult(success=False, error=f"'{params['object_id']}' is not a character")
        
        # Validate layer names against available_layers
        requested_layers = params["layers"]
        invalid = []
        for group, name in requested_layers.items():
            available = node.available_layers.get(group, [])
            if available and name not in available:
                invalid.append((group, name, available))
        
        if invalid:
            # Tell AI what's actually available so it can pick a correct one
            msgs = []
            for group, name, available in invalid:
                msgs.append(
                    f"'{name}' is not a valid {group}. "
                    f"Available {group}s: {', '.join(available)}"
                )
            return ToolResult(success=False, error=" | ".join(msgs))
        
        node.set_layers(requested_layers)
        
        # Update metadata URLs so frontend can render the new pose/face
        self._sync_character_metadata_urls(node, requested_layers)
        
        layer_str = ", ".join(f"{k}={v}" for k, v in requested_layers.items())
        return ToolResult(success=True, data=f"Set pose of '{node.name}': {layer_str}")

    def _handle_add_character_frame(self, params: dict) -> ToolResult:
        node = self._get_node(params["object_id"])
        if not node:
            return self._not_found(params["object_id"])
        if not isinstance(node, CharacterNode):
            return ToolResult(success=False, error=f"'{params['object_id']}' is not a character")
        node.add_frame(params["time"], params["layers"])
        layer_str = ", ".join(f"{k}={v}" for k, v in params["layers"].items())
        return ToolResult(success=True, data=f"Added frame at t={params['time']:.2f}s: {layer_str}")

    def _sync_character_metadata_urls(self, node: CharacterNode, layers: dict) -> None:
        """Update metadata.poseUrl/faceUrl when active layers change."""
        pose_urls = node.metadata.get("poseUrls", {})
        face_urls = node.metadata.get("faceUrls", {})
        
        if "pose" in layers and layers["pose"] in pose_urls:
            url_info = pose_urls[layers["pose"]]
            node.metadata["poseUrl"] = url_info.get("url", "") if isinstance(url_info, dict) else url_info
            logger.info(f"[ToolExecutor] Pose → {layers['pose']}: {node.metadata['poseUrl']}")
        
        if "face" in layers and layers["face"] in face_urls:
            url_info = face_urls[layers["face"]]
            node.metadata["faceUrl"] = url_info.get("url", "") if isinstance(url_info, dict) else url_info
            logger.info(f"[ToolExecutor] Face → {layers['face']}: {node.metadata['faceUrl']}")

    # ── Scene Mutation Handlers ──

    def _handle_add_character(self, params: dict) -> ToolResult:
        char_id = params["character_id"]
        
        # Look up character info from asset registry to get pose/face URLs
        char_info = None
        if self.asset_registry:
            char_info = self.asset_registry.get_character(char_id)
            if not char_info:
                # Try fuzzy match by name
                char_info = self.asset_registry.find_character(char_id)
        
        # Build metadata with asset URLs for frontend rendering
        metadata = {}
        active_layers = {}
        available_layers = {}
        
        if char_info:
            # Pose URLs: { "站立": { "url": "/static/..." }, ... }
            pose_urls = {}
            for name, asset in char_info.poses.items():
                pose_urls[name] = {"url": asset.url_path, "filename": asset.filename}
            
            # Face URLs
            face_urls = {}
            for name, asset in char_info.faces.items():
                face_urls[name] = {"url": asset.url_path, "filename": asset.filename}
            
            metadata["poseUrls"] = pose_urls
            metadata["faceUrls"] = face_urls
            metadata["characterFolder"] = char_info.relative_folder
            
            # Set default pose/face
            if char_info.default_pose:
                active_layers["pose"] = char_info.default_pose
                metadata["poseUrl"] = char_info.get_pose_url(char_info.default_pose)
            if char_info.default_face:
                active_layers["face"] = char_info.default_face
                metadata["faceUrl"] = char_info.get_face_url(char_info.default_face)
            
            # Available layers for AI to know what it can switch to
            available_layers["pose"] = char_info.pose_names
            available_layers["face"] = char_info.face_names
            
            logger.info(f"[ToolExecutor] Resolved character '{char_info.name}': "
                        f"{len(pose_urls)} poses, {len(face_urls)} faces")
        else:
            logger.warning(f"[ToolExecutor] Character '{char_id}' not found in asset registry")
        
        node = CharacterNode(
            name=params["name"],
            character_id=char_id,
            transform=Transform(
                x=params["x"],
                y=params["y"],
                scale_x=params.get("scale", 1.0),
                scale_y=params.get("scale", 1.0),
            ),
            metadata=metadata,
            active_layers=active_layers,
            available_layers=available_layers,
        )
        node_id = self.graph.add_node(node)
        return ToolResult(success=True, data=f"Added character '{params['name']}' (id: {node_id}) with {len(active_layers)} default layers")

    def _handle_add_background_layer(self, params: dict) -> ToolResult:
        node = BackgroundLayerNode(
            name=params["name"],
            asset_path=params["asset_path"],
            z_index=params["z_index"],
            parallax_speed=params.get("parallax_speed", 1.0),
        )
        node_id = self.graph.add_node(node)
        return ToolResult(success=True, data=f"Added background layer '{params['name']}' (id: {node_id})")

    def _handle_remove_object(self, params: dict) -> ToolResult:
        node = self.graph.remove_node(params["object_id"])
        if node:
            return ToolResult(success=True, data=f"Removed '{node.name}' from scene")
        return self._not_found(params["object_id"])

    # ── Helpers ──

    def _get_node(self, node_id: str) -> Optional[SceneNode]:
        return self.graph.get_node(node_id)

    def _not_found(self, node_id: str) -> ToolResult:
        return ToolResult(success=False, error=f"Object '{node_id}' not found in scene")
