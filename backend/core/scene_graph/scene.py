"""
SceneGraph — Top-level container for the animated scene.

Inspired by:
- Manim Scene: add(), remove(), mobjects list, get_state()
- Motion Canvas View2D: root container for all nodes
- OpenCut ScenesManager: multi-scene management

The SceneGraph holds ALL objects in the scene and provides:
1. Query API — AI reads the scene state
2. Mutation API — AI modifies objects
3. Time evaluation — get all object states at time T
4. Serialization — save/load as JSON
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field
from typing import Any, Optional

from backend.core.scene_graph.node import SceneNode
from backend.core.scene_graph.specialized_nodes import (
    CharacterNode,
    BackgroundLayerNode,
    CameraNode,
    PropNode,
    TextNode,
    AudioNode,
    node_from_dict,
)
from backend.core.scene_graph.transform import Transform


# ══════════════════════════════════════════════
#  WORLD / CANVAS CONSTANTS
# ══════════════════════════════════════════════

# Default canvas: 1920×1080 pixels, PPU=100 → 19.2×10.8 world units
DEFAULT_CANVAS_WIDTH = 1920
DEFAULT_CANVAS_HEIGHT = 1080
DEFAULT_FPS = 30
DEFAULT_PPU = 100  # Pixels Per Unit


@dataclass
class SceneGraph:
    """Top-level container: the "Video DOM" for the animation.

    Like HTML DOM for web pages, SceneGraph is the structured data model
    that holds everything about the scene. AI agents read and write to this
    structure, and the frontend renders it.

    Attributes:
        id: Unique scene ID.
        name: Human-readable scene name.
        canvas_width: Output width in pixels.
        canvas_height: Output height in pixels.
        ppu: Pixels per world unit (for coordinate conversion).
        fps: Frames per second.
        duration: Scene duration in seconds.
        nodes: All nodes indexed by ID.
        root_order: Ordered list of root node IDs (rendering order).
    """

    id: str = ""
    name: str = "Untitled Scene"
    canvas_width: int = DEFAULT_CANVAS_WIDTH
    canvas_height: int = DEFAULT_CANVAS_HEIGHT
    ppu: int = DEFAULT_PPU
    fps: int = DEFAULT_FPS
    duration: float = 10.0

    # All nodes in the scene, indexed by ID
    nodes: dict[str, SceneNode] = field(default_factory=dict)

    # Root-level node IDs in rendering order (back to front)
    root_order: list[str] = field(default_factory=list)

    # Scene-level metadata (e.g. background_id, mood, etc.)
    metadata: dict = field(default_factory=dict)

    def __post_init__(self):
        if not self.id:
            self.id = f"scene-{uuid.uuid4().hex[:8]}"

    # ══════════════════════════════════════════════
    #  WORLD ↔ PIXEL CONVERSION
    # ══════════════════════════════════════════════

    @property
    def world_width(self) -> float:
        """Canvas width in world units."""
        return self.canvas_width / self.ppu

    @property
    def world_height(self) -> float:
        """Canvas height in world units."""
        return self.canvas_height / self.ppu

    def world_to_pixel(self, x: float, y: float) -> tuple[float, float]:
        """Convert world coordinates to pixel coordinates."""
        return (x * self.ppu, y * self.ppu)

    def pixel_to_world(self, px: float, py: float) -> tuple[float, float]:
        """Convert pixel coordinates to world coordinates."""
        return (px / self.ppu, py / self.ppu)

    # ══════════════════════════════════════════════
    #  NODE MANAGEMENT (like Manim Scene.add/remove)
    # ══════════════════════════════════════════════

    def add_node(self, node: SceneNode) -> str:
        """Add a node to the scene.

        Args:
            node: The node to add.

        Returns:
            The node's ID.
        """
        self.nodes[node.id] = node
        if node.parent_id is None and node.id not in self.root_order:
            self.root_order.append(node.id)
        return node.id

    def remove_node(self, node_id: str) -> Optional[SceneNode]:
        """Remove a node from the scene.

        Also removes from root_order and unlinks children.
        """
        node = self.nodes.pop(node_id, None)
        if node:
            if node_id in self.root_order:
                self.root_order.remove(node_id)
            # Remove children recursively
            for child in list(node.children):
                self.remove_node(child.id)
        return node

    def get_node(self, node_id: str) -> Optional[SceneNode]:
        """Get a node by ID."""
        return self.nodes.get(node_id)

    def get_node_by_name(self, name: str) -> Optional[SceneNode]:
        """Get the first node matching a name."""
        for node in self.nodes.values():
            if node.name == name:
                return node
        return None

    def get_nodes_by_type(self, node_type: str) -> list[SceneNode]:
        """Get all nodes of a specific type."""
        return [n for n in self.nodes.values() if n.node_type == node_type]

    @property
    def characters(self) -> list[CharacterNode]:
        """All character nodes."""
        return [n for n in self.nodes.values() if isinstance(n, CharacterNode)]

    @property
    def backgrounds(self) -> list[BackgroundLayerNode]:
        """All background layer nodes."""
        return [n for n in self.nodes.values() if isinstance(n, BackgroundLayerNode)]

    @property
    def camera(self) -> Optional[CameraNode]:
        """The main camera node (first one found)."""
        cameras = [n for n in self.nodes.values() if isinstance(n, CameraNode)]
        return cameras[0] if cameras else None

    # ══════════════════════════════════════════════
    #  ORDERING / LAYERS
    # ══════════════════════════════════════════════

    def reorder_layers(self, node_ids: list[str]) -> None:
        """Set the rendering order for root-level nodes.

        Args:
            node_ids: List of node IDs in back-to-front order.
        """
        # Validate all IDs exist
        valid_ids = [nid for nid in node_ids if nid in self.nodes]
        # Add any missing root nodes at the end
        for nid in self.root_order:
            if nid not in valid_ids:
                valid_ids.append(nid)
        self.root_order = valid_ids

    def get_sorted_nodes(self) -> list[SceneNode]:
        """Get all root nodes sorted by z_index then root_order."""
        nodes = [self.nodes[nid] for nid in self.root_order if nid in self.nodes]
        return sorted(nodes, key=lambda n: (n.z_index, self.root_order.index(n.id) if n.id in self.root_order else 0))

    # ══════════════════════════════════════════════
    #  TIME EVALUATION
    # ══════════════════════════════════════════════

    def get_snapshot_at_time(self, time: float) -> dict[str, dict]:
        """Get the state of all nodes at a specific time.

        Returns:
            Dict mapping node_id → snapshot dict with evaluated properties.
        """
        snapshots = {}
        for node_id, node in self.nodes.items():
            snapshot = node.get_snapshot_at_time(time)

            # Add character-specific data
            if isinstance(node, CharacterNode):
                snapshot["active_layers"] = node.get_layers_at_time(time)

            snapshots[node_id] = snapshot
        return snapshots

    # ══════════════════════════════════════════════
    #  AI DESCRIPTION (for LLM consumption)
    # ══════════════════════════════════════════════

    def describe(self) -> str:
        """Generate a full AI-readable description of the scene.

        This is what gets sent to the LLM when it asks "what's in the scene?"
        """
        lines = [
            f"=== Scene: {self.name} ===",
            f"Canvas: {self.canvas_width}×{self.canvas_height}px ({self.world_width:.1f}×{self.world_height:.1f} world units)",
            f"Duration: {self.duration:.1f}s at {self.fps}fps",
            f"Total objects: {len(self.nodes)}",
            "",
        ]

        # Group by type for readability
        type_groups: dict[str, list[SceneNode]] = {}
        for node in self.nodes.values():
            type_groups.setdefault(node.node_type, []).append(node)

        type_order = ["camera", "background_layer", "character", "prop", "text", "audio"]
        for node_type in type_order:
            if node_type in type_groups:
                lines.append(f"--- {node_type.upper()} ---")
                for node in type_groups[node_type]:
                    lines.append(node.describe())
                    lines.append("")
                del type_groups[node_type]

        # Any remaining types
        for node_type, nodes in type_groups.items():
            lines.append(f"--- {node_type.upper()} ---")
            for node in nodes:
                lines.append(node.describe())
                lines.append("")

        return "\n".join(lines)

    def describe_brief(self) -> str:
        """Short summary for quick AI context."""
        chars = self.characters
        bgs = self.backgrounds
        parts = [f"Scene '{self.name}' ({self.duration:.0f}s)"]
        if chars:
            char_names = ", ".join(c.name for c in chars)
            parts.append(f"Characters: {char_names}")
        if bgs:
            parts.append(f"Background layers: {len(bgs)}")
        return " | ".join(parts)

    # ══════════════════════════════════════════════
    #  SPATIAL RELATIONSHIPS (AI can query)
    # ══════════════════════════════════════════════

    def get_spatial_relationships(self) -> list[str]:
        """Describe spatial relationships between objects.

        Returns descriptions like:
        - "Character A is to the left of Character B (distance: 3.2 units)"
        - "Prop 'table' is below Character A"
        """
        relationships = []
        visible_nodes = [n for n in self.nodes.values() if n.visible and n.node_type in ("character", "prop")]

        for i, a in enumerate(visible_nodes):
            for b in visible_nodes[i + 1:]:
                dx = b.transform.x - a.transform.x
                dy = b.transform.y - a.transform.y
                dist = a.transform.distance_to(b.transform)

                if abs(dx) > abs(dy):
                    direction = "right" if dx > 0 else "left"
                else:
                    direction = "below" if dy > 0 else "above"

                relationships.append(
                    f"'{a.name}' is to the {direction} of '{b.name}' "
                    f"(distance: {dist:.1f} units)"
                )

        return relationships

    # ══════════════════════════════════════════════
    #  SERIALIZATION
    # ══════════════════════════════════════════════

    def to_dict(self) -> dict:
        """Serialize the full scene graph to a JSON-compatible dict."""
        return {
            "id": self.id,
            "name": self.name,
            "canvas_width": self.canvas_width,
            "canvas_height": self.canvas_height,
            "ppu": self.ppu,
            "fps": self.fps,
            "duration": self.duration,
            "root_order": self.root_order,
            "nodes": {
                node_id: node.to_dict()
                for node_id, node in self.nodes.items()
            },
            "metadata": self.metadata,
        }

    @classmethod
    def from_dict(cls, data: dict) -> SceneGraph:
        """Deserialize from dict."""
        graph = cls(
            id=data.get("id", ""),
            name=data.get("name", "Untitled Scene"),
            canvas_width=data.get("canvas_width", DEFAULT_CANVAS_WIDTH),
            canvas_height=data.get("canvas_height", DEFAULT_CANVAS_HEIGHT),
            ppu=data.get("ppu", DEFAULT_PPU),
            fps=data.get("fps", DEFAULT_FPS),
            duration=data.get("duration", 10.0),
            root_order=data.get("root_order", []),
            metadata=data.get("metadata", {}),
        )

        for node_id, node_data in data.get("nodes", {}).items():
            node = node_from_dict(node_data)
            graph.nodes[node.id] = node

        # Rebuild root_order if missing
        if not graph.root_order:
            graph.root_order = [
                n.id for n in graph.nodes.values() if n.parent_id is None
            ]

        return graph

    def to_json(self, indent: int = 2) -> str:
        """Serialize to JSON string."""
        return json.dumps(self.to_dict(), indent=indent, ensure_ascii=False)

    @classmethod
    def from_json(cls, json_str: str) -> SceneGraph:
        """Deserialize from JSON string."""
        return cls.from_dict(json.loads(json_str))

    def save(self, path: str) -> None:
        """Save to a JSON file."""
        with open(path, "w", encoding="utf-8") as f:
            f.write(self.to_json())

    @classmethod
    def load(cls, path: str) -> SceneGraph:
        """Load from a JSON file."""
        with open(path, "r", encoding="utf-8") as f:
            return cls.from_json(f.read())

    def __repr__(self) -> str:
        return (
            f"<SceneGraph '{self.name}' "
            f"{self.canvas_width}×{self.canvas_height} "
            f"{len(self.nodes)} nodes "
            f"{self.duration:.0f}s>"
        )
