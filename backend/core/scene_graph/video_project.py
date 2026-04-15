"""
VideoProject — Multi-scene container for cinematic video production.

A VideoProject wraps multiple SceneGraphs (scenes) with transitions
between them. Each scene is a self-contained SceneGraph with its own
nodes, keyframes, background, and camera.

Architecture:
    VideoProject
    ├── scenes: [SceneGraph, SceneGraph, ...]  ← each is independent
    ├── transitions: [Transition, ...]          ← between scene[i] and scene[i+1]
    └── metadata: {title, description, ...}
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Optional

from backend.core.scene_graph.scene import SceneGraph


@dataclass
class SceneTransition:
    """Transition effect between two adjacent scenes.
    
    Attributes:
        type: Transition type — "cut", "fade", "dissolve", "slide_left", "slide_right"
        duration: Duration of the transition in seconds.
    """
    type: str = "fade"
    duration: float = 0.5

    def to_dict(self) -> dict:
        return {
            "type": self.type,
            "duration": self.duration,
        }

    @classmethod
    def from_dict(cls, data: dict) -> SceneTransition:
        return cls(
            type=data.get("type", "fade"),
            duration=data.get("duration", 0.5),
        )


@dataclass
class VideoProject:
    """Multi-scene video project — the top-level container.
    
    Attributes:
        id: Unique project ID.
        name: Human-readable project name.
        scenes: List of SceneGraphs (one per scene).
        transitions: List of transitions (len = len(scenes) - 1).
        metadata: Optional project-level metadata.
    """
    id: str = ""
    name: str = "Untitled Project"
    scenes: list[SceneGraph] = field(default_factory=list)
    transitions: list[SceneTransition] = field(default_factory=list)
    metadata: dict = field(default_factory=dict)

    def __post_init__(self):
        if not self.id:
            self.id = f"project-{uuid.uuid4().hex[:8]}"

    @property
    def num_scenes(self) -> int:
        return len(self.scenes)

    @property
    def total_duration(self) -> float:
        """Total duration including all scenes and transitions."""
        if not self.scenes:
            return 0.0
        total = sum(s.duration for s in self.scenes)
        # Transitions overlap between scenes (don't add extra time)
        return total

    def get_scene_boundaries(self) -> list[dict]:
        """Return start/end times for each scene in global timeline.
        
        Returns list of {"scene_index": i, "start": t, "end": t, "name": str}
        """
        boundaries = []
        t = 0.0
        for i, scene in enumerate(self.scenes):
            boundaries.append({
                "scene_index": i,
                "start": t,
                "end": t + scene.duration,
                "name": scene.name,
                "background_id": scene.metadata.get("background_id", "") if hasattr(scene, 'metadata') else "",
            })
            t += scene.duration
        return boundaries

    def get_scene_at_time(self, global_time: float) -> tuple[int, float]:
        """Given a global time, return (scene_index, local_time_within_scene).
        
        Also handles transition overlap periods.
        """
        t = 0.0
        for i, scene in enumerate(self.scenes):
            if global_time < t + scene.duration or i == len(self.scenes) - 1:
                local_time = global_time - t
                return i, max(0.0, min(local_time, scene.duration))
            t += scene.duration
        return len(self.scenes) - 1, 0.0

    def get_transition_at_time(self, global_time: float) -> Optional[tuple[SceneTransition, float]]:
        """Check if global_time falls within a transition period.
        
        Returns (transition, progress 0→1) or None if not in transition.
        Transition occurs at the END of each scene (last T seconds).
        """
        t = 0.0
        for i, scene in enumerate(self.scenes):
            scene_end = t + scene.duration
            if i < len(self.transitions):
                trans = self.transitions[i]
                trans_start = scene_end - trans.duration
                if trans_start <= global_time < scene_end:
                    progress = (global_time - trans_start) / trans.duration
                    return trans, progress
            t += scene.duration
        return None

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "scenes": [s.to_dict() for s in self.scenes],
            "transitions": [t.to_dict() for t in self.transitions],
            "total_duration": self.total_duration,
            "scene_boundaries": self.get_scene_boundaries(),
            "metadata": self.metadata,
        }

    @classmethod
    def from_dict(cls, data: dict) -> VideoProject:
        scenes = [SceneGraph.from_dict(s) for s in data.get("scenes", [])]
        transitions = [SceneTransition.from_dict(t) for t in data.get("transitions", [])]
        return cls(
            id=data.get("id", ""),
            name=data.get("name", "Untitled Project"),
            scenes=scenes,
            transitions=transitions,
            metadata=data.get("metadata", {}),
        )
