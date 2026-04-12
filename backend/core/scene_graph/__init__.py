"""
Scene Graph — Video DOM for AI-controllable animation.

Provides a structured, serializable data model that:
1. AI can READ  — describe scene contents, object positions, relationships
2. AI can WRITE — set position, scale, rotation, opacity, add keyframes
3. Frontend can RENDER — from SceneGraph → PixiJS canvas
4. Can SERIALIZE — save/load as JSON, convert to/from workflow format

Architecture inspired by:
- Motion Canvas Node.ts (position, scale, rotation, children, parent)
- Manim Mobject (submobjects, bounding_box, updaters)
- OpenCut EditorCore (Manager pattern, TypeScript types)
"""

from backend.core.scene_graph.transform import Transform, BoundingBox
from backend.core.scene_graph.keyframe import Keyframe, interpolate_keyframes, Easing
from backend.core.scene_graph.node import SceneNode
from backend.core.scene_graph.specialized_nodes import (
    CharacterNode,
    BackgroundLayerNode,
    CameraNode,
    PropNode,
    TextNode,
    AudioNode,
    FrameSelection,
)
from backend.core.scene_graph.scene import SceneGraph

__all__ = [
    "Transform",
    "BoundingBox",
    "Keyframe",
    "interpolate_keyframes",
    "Easing",
    "SceneNode",
    "CharacterNode",
    "BackgroundLayerNode",
    "CameraNode",
    "PropNode",
    "TextNode",
    "AudioNode",
    "FrameSelection",
    "SceneGraph",
]
