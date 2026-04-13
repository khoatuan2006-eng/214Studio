# 05 — Camera & Background Staging

## Trạng thái hiện tại

### ✅ Đã có code nhưng chưa hoạt động
- `CameraNode` class tồn tại trong `specialized_nodes.py`
- `BackgroundLayerNode` class tồn tại
- Stages đã extract từ FLA nằm trong `storage/stages/`
- `SceneToolExecutor` có tool `add_camera`

### 🔴 Hoàn toàn chưa tích hợp
- Camera KHÔNG ảnh hưởng render — PixiJS stage KHÔNG zoom/pan theo CameraNode
- Background layers chưa load vào scene
- Không có parallax effect
- Không có camera transitions (pan, zoom in/out)

## Kiến trúc cần xây

### Camera → PixiJS Viewport

```
CameraNode
├── transform.x, y → pan offset
├── zoom → PixiJS stage scale
├── fov → viewport width (optional)
└── target_node_id → follow character (optional)

evaluateAtTime(t) → camera snapshot
    ↓
SceneRenderer.tsx
    ├── stage.scale.set(zoom)
    ├── stage.position.set(-cam.x * PPU, -cam.y * PPU)
    └── All children render relative to camera
```

### Background Layers

```
storage/stages/{stage_name}/
├── layer_0_sky.png          ← furthest (parallax slowest)
├── layer_1_mountains.png
├── layer_2_ground.png
├── layer_3_foreground.png   ← closest (parallax fastest)
└── stage_info.json          ← layer metadata
```

## Nhiệm vụ

### Task 5.1: Camera ảnh hưởng PixiJS render

**File**: `frontend-react/src/components/studio/editor/SceneRenderer.tsx`

```typescript
// Trong render loop, TRƯỚC khi render nodes:
const camSnapshot = snapshot["camera-node-id"];
if (camSnapshot) {
    const zoom = camSnapshot.scaleX ?? 1;  // or từ keyframe "zoom"
    const panX = camSnapshot.x * PPU;
    const panY = camSnapshot.y * PPU;
    
    // Apply to PixiJS container (NOT the root stage)
    sceneContainer.scale.set(zoom);
    sceneContainer.position.set(
        canvasWidth/2 - panX * zoom,
        canvasHeight/2 - panY * zoom
    );
}
```

**Lưu ý**: Tạo một `Container` riêng cho scene content, camera transform áp lên container này. UI elements (timeline, HUD) KHÔNG bị camera ảnh hưởng.

### Task 5.2: Camera keyframes trong automation

**File**: `backend/routers/automation.py`

Thêm camera movement vào `build_scene_from_script()`:

```python
def _add_camera_cuts(graph, lines, char_nodes, tts_lines):
    """Add camera keyframes for cinematic effect."""
    camera = graph.add_camera("main_camera")
    
    for idx, line in enumerate(lines):
        speaker_id = char_nodes.get(line.character)
        if not speaker_id:
            continue
        speaker_node = graph.get_node(speaker_id)
        
        # Camera follows speaker
        camera.keyframes["x"].append({
            "time": start_time,
            "value": speaker_node.transform.x,
            "easing": "ease_out"
        })
        
        # Zoom in slightly when emotional
        if line.emotion in ("angry", "sad", "scared"):
            camera.keyframes["zoom"].append({
                "time": start_time, "value": 1.2, "easing": "ease_in"
            })
            camera.keyframes["zoom"].append({
                "time": end_time, "value": 1.0, "easing": "ease_out"
            })
```

### Task 5.3: Stage/Background selector

**File mới**: `backend/core/scene_graph/stage_scanner.py`

```python
class StageScanner:
    """Scan storage/stages/ for available backgrounds."""
    
    def scan(self) -> list[StageInfo]:
        """Return list of available stages with layer info."""
        # For each stage directory:
        #   - Count PNG layers
        #   - Read stage_info.json if exists
        #   - Generate thumbnail
        
    def load_stage_into_scene(self, graph: SceneGraph, stage_id: str):
        """Add BackgroundLayerNodes for each layer."""
        # For each PNG in stage:
        #   graph.add_background_layer(path, z_index, parallax_speed)
```

**API endpoint**: `GET /api/scene-graph/stages` → list of stages
**API endpoint**: `POST /api/scene-graph/stages/load` → load stage into scene

### Task 5.4: Frontend Background UI

**File mới**: `frontend-react/src/components/studio/editor/BackgroundPicker.tsx`

- Grid hiển thị thumbnail các stage có sẵn
- Click → load vào scene
- Có thể tích hợp vào ScriptImport: chọn background cho scene

### Task 5.5: Parallax effect

Khi camera pan, background layers di chuyển ở tốc độ khác nhau:

```typescript
// SceneRenderer.tsx
for (const bgLayer of backgroundLayers) {
    const parallaxSpeed = bgLayer.parallaxSpeed ?? 1.0;
    bgSprite.position.x = -cameraX * parallaxSpeed * PPU;
}
```

Tốc độ: `sky=0.1`, `mountains=0.3`, `ground=0.7`, `foreground=1.0`
