# 03 — Scene Graph Engine

## Tổng quan

Scene Graph là **trung tâm thần kinh** của AnimeStudio. Mọi thứ — nhân vật, bối cảnh, camera, âm thanh, phụ đề — đều là Node trong 1 cây.

```
SceneGraph
├── BackgroundLayerNode "bg-1"  (z=-50, sky)
├── BackgroundLayerNode "bg-2"  (z=-35, wall)
├── BackgroundLayerNode "bg-3"  (z=-20, floor)
├── CharacterNode "char-1"      (z=10, hero)
│   └── frameSequence: [
│         {t=0, pose="站立", face="微笑"},
│         {t=1, pose="打招呼", face="大笑"},
│       ]
│   └── keyframes: {
│         x: [{t=0, v=5.0}, {t=1, v=9.6}],
│         y: [{t=0, v=7.5}],
│       }
├── CharacterNode "char-2"      (z=15, villain)
├── BackgroundLayerNode "bg-8"  (z=55, foreground table)
├── TextNode "sub-1"            (z=100, subtitle)
├── AudioNode "tts-1"           (z=N/A, voice)
└── CameraNode "cam-1"         (z=N/A, viewport)
```

---

## Backend: SceneNode (node.py)

Base class cho tất cả nodes.

```python
@dataclass
class SceneNode:
    id: str                          # "character-1804a50e"
    name: str                        # "Cô gái"
    node_type: str                   # "character", "background_layer", ...
    transform: Transform             # x, y, scale_x, scale_y, rotation
    opacity: float = 1.0
    z_index: int = 0
    visible: bool = True
    parent_id: str | None = None
    children: list[str] = []
    keyframes: dict[str, list] = {}  # property_name → [{time, value, easing}]
    metadata: dict = {}

    # Key methods:
    def get_value_at_time(prop, time) -> float
        # Interpolate keyframes for a property at given time
        # Supports: x, y, scale_x, scale_y, rotation, opacity, z_index
    
    def get_computed_state(time) -> dict
        # Returns full state at time: {x, y, scale_x, scale_y, rotation, opacity, z_index}
```

### Keyframe Format

```python
# Continuous properties (interpolated):
node.keyframes["x"] = [
    {"time": 0.0, "value": 5.0, "easing": "linear"},
    {"time": 1.5, "value": 9.6, "easing": "ease_out"},
]
# → At t=0.75: x = lerp(5.0, 9.6, ease_out(0.5)) ≈ 8.5

# Animatable z_index:
node.keyframes["z_index"] = [
    {"time": 0.0, "value": 10.0, "easing": "step"},
    {"time": 2.0, "value": 60.0, "easing": "step"},
]
# → At t=0.0-1.99: z_index = 10
# → At t=2.0+: z_index = 60 (character stepped forward, now in front of table)
```

---

## Backend: CharacterNode (specialized_nodes.py)

```python
@dataclass
class CharacterNode(SceneNode):
    character_id: str = ""
    active_layers: dict[str, str] = {}          # {"pose": "站立", "face": "微笑"}
    available_layers: dict[str, list[str]] = {}  # {"pose": ["站立","打招呼",...], "face": [...]}
    frame_sequence: list[FrameSelection] = []    # Timeline of layer swaps

    def set_pose(name):  # active_layers["pose"] = name
    def set_face(name):  # active_layers["face"] = name
    def add_frame(time, layers_dict):  # Append to frame_sequence
    def get_active_layers_at_time(time):  # STEP evaluation → which pose/face at time t
```

### FrameSequence vs Keyframes

Hai hệ thống animation TÁCH BIỆT, KHÔNG lẫn lộn:

```python
# 1. KEYFRAMES — cho thuộc tính SỐ, CÓ interpolation
#    x, y, scale_x, scale_y, rotation, opacity, z_index
node.keyframes["x"] = [...]  # Smooth transition

# 2. FRAME SEQUENCE — cho LAYER SWAP, STEP (không interpolation)
#    pose, face
node.frame_sequence = [
    FrameSelection(time=0.0, layers={"pose": "站立", "face": "微笑"}),
    FrameSelection(time=1.0, layers={"pose": "打招呼", "face": "大笑"}),
    # → At t=0.5: STILL "站立"+"微笑" (STEP, not interpolated)
    # → At t=1.0: SNAP to "打招呼"+"大笑"
]
```

---

## Backend: BackgroundLayerNode (specialized_nodes.py)

```python
@dataclass
class BackgroundLayerNode(SceneNode):
    asset_path: str = ""          # "/static/stages/4S店_..._element_1.png"
    parallax_speed: float = 1.0   # 0.05 (far, barely moves) → 1.0 (near, full speed)
    blur: float = 0.0             # Depth of field blur (for future)
    
    # z_index determines render order:
    # z=-50 → rendered BEHIND everything
    # z=+85 → rendered IN FRONT of characters
```

---

## Backend: SceneGraph (scene.py)

```python
@dataclass
class SceneGraph:
    id: str
    name: str
    canvas_width: int = 1920
    canvas_height: int = 1080
    ppu: int = 100
    fps: int = 30
    duration: float = 10.0
    nodes: dict[str, SceneNode] = {}
    root_order: list[str] = []  # Rendering order of root-level nodes

    # Key methods:
    def add_node(node): ...
    def remove_node(node_id): ...
    def get_node(node_id): ...
    def get_nodes_by_type(type_str): ...
    
    def describe() -> str:
        # Human-readable description for AI context
        # "Scene has 2 characters and 10 background layers..."
    
    def get_snapshot_at_time(time) -> dict:
        # Evaluate ALL nodes at time → complete scene state
    
    def to_dict() / from_dict():
        # Serialize ↔ deserialize for API transport
```

---

## Backend: SceneToolExecutor (tools.py)

16 AI tools available via Gemini Function Calling:

```python
TOOL_DEFINITIONS = [
    # Scene Query
    "get_scene_summary",       # Mô tả scene hiện tại
    "list_objects",            # List all nodes
    
    # Node Management
    "add_character",           # Thêm nhân vật từ registry
    "add_background",          # Thêm background layer
    "remove_object",           # Xóa node
    
    # Transform
    "set_position",            # Di chuyển node
    "set_scale",               # Thay đổi kích thước
    "set_rotation",            # Xoay
    "set_opacity",             # Đổi độ trong suốt
    "set_z_index",             # Đổi depth
    
    # Animation
    "add_keyframe",            # Thêm keyframe cho property
    "remove_keyframe",         # Xóa keyframe
    
    # Character-specific
    "set_character_pose",      # Đổi tư thế
    "set_character_face",      # Đổi biểu cảm
    "add_character_frame",     # Thêm frame vào sequence
    
    # Camera
    "set_camera",              # Điều chỉnh camera
]

# Usage:
executor = SceneToolExecutor(graph, registry)
result = executor.execute("set_position", {"node_id": "char-1", "x": 9.6, "y": 7.5})
# result = {"success": True, "message": "..."}
```

---

## Frontend: SceneGraphManager.ts

Mirror của backend SceneGraph, chạy trên browser:

```typescript
class SceneGraphManager {
    private data: SceneGraphData;  // Nodes, canvas settings, etc.
    
    // Load từ backend response
    loadFromBackendResponse(json: any): void;
    
    // Evaluate tại thời điểm t → snapshot cho renderer
    evaluateAtTime(time: number): SceneSnapshot;
    // Returns: { nodes: Map<nodeId, NodeSnapshot> }
    // NodeSnapshot = { x, y, scaleX, scaleY, rotation, opacity, zIndex, visible,
    //                  activePose?, activeFace?, assetPath? }
    
    // Keyframe helper (backend→frontend easing normalization)
    // "ease_out" → "easeOut"
    // "ease_in" → "easeIn"
    
    // Mutation methods
    addKeyframe(nodeId, prop, time, value, easing): void;
    removeKeyframe(nodeId, prop, time): void;
    
    // Serialization
    toJSON(): SceneGraphData;
}
```

### Frontend Rendering Loop

```typescript
// In SceneRenderer.tsx / PixiStage.tsx:
function onTick(time: number) {
    const snapshot = sceneGraphManager.evaluateAtTime(time);
    
    for (const [nodeId, nodeState] of snapshot.nodes) {
        const pixiSprite = spriteMap.get(nodeId);
        
        // Update position
        pixiSprite.x = nodeState.x * PPU;
        pixiSprite.y = nodeState.y * PPU;
        pixiSprite.scale.set(nodeState.scaleX, nodeState.scaleY);
        pixiSprite.rotation = nodeState.rotation;
        pixiSprite.alpha = nodeState.opacity;
        pixiSprite.zIndex = nodeState.zIndex;
        pixiSprite.visible = nodeState.visible;
        
        // Character: swap pose+face textures
        if (nodeState.activePose !== currentPose[nodeId]) {
            loadPoseTexture(nodeState.activePose);
        }
        if (nodeState.activeFace !== currentFace[nodeId]) {
            loadFaceTexture(nodeState.activeFace);
        }
    }
}
```

---

## Lưu ý khi mở rộng

### Thêm Node Type mới

```python
# 1. Tạo class trong specialized_nodes.py
@dataclass
class EffectNode(SceneNode):
    effect_type: str = "particle"
    ...
    def __post_init__(self):
        self.node_type = "effect"
        super().__post_init__()

# 2. Thêm tool mới vào tools.py
TOOL_DEFINITIONS.append({
    "name": "add_effect",
    "description": "...",
    "parameters": {...},
})

# 3. Frontend: thêm type vào types.ts
interface EffectNodeData extends AnyNodeData {
    effectType: string;
}

# 4. Frontend: thêm rendering logic vào SceneRenderer.tsx
```

### Thêm Property Animatable mới

```python
# Backend node.py — thêm vào prop_map:
prop_map = {
    ...,
    "new_prop": lambda: self.new_prop,
}

# Frontend SceneGraphManager.ts — thêm vào defaults + interpolation:
defaults = {
    ...,
    new_prop: node.newProp ?? defaultValue,
}
```

### ⚠️ CRITICAL: Domain Field Access Pattern

Khi backend serialize `BackgroundLayerNode`, các field như `asset_path`, `parallax_speed`, `blur` là **TOP-LEVEL fields trong JSON**, KHÔNG nằm trong `metadata`:

```json
{
  "node_type": "background_layer",
  "asset_path": "/static/stages/xxx.png",   // ← TOP-LEVEL
  "parallax_speed": 0.75,                    // ← TOP-LEVEL
  "metadata": {}                             // ← EMPTY!
}
```

Frontend `nodeFromBackend()` map chúng thành **direct properties** trên node object:

```typescript
// SceneGraphManager.ts:
...(raw.asset_path !== undefined && { assetPath: raw.asset_path }),
...(raw.parallax_speed !== undefined && { parallaxSpeed: raw.parallax_speed }),
```

**Khi truy cập trong renderer**: PHẢI dùng `(node as any).assetPath`, KHÔNG dùng `node.metadata.assetPath`.

Xem chi tiết: [06_FLA_BACKGROUND_RENDERING.md](./06_FLA_BACKGROUND_RENDERING.md)

