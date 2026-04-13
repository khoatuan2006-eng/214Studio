# 01 — Kiến trúc hệ thống AnimeStudio

## Tổng quan

AnimeStudio là công cụ sản xuất video hoạt hình 2D tự động. Kiến trúc gồm 3 tầng:

```
┌─────────────────────────────────────────────────────────┐
│  FRONTEND (React + PixiJS v8 + Zustand)                 │
│  ├── SceneGraphManager.ts  — evaluator + state          │
│  ├── SceneRenderer.tsx     — PixiJS compositing          │
│  ├── StudioMode.tsx        — main editor layout          │
│  ├── ScriptImport.tsx      — script paste UI             │
│  ├── AIChatPanel.tsx       — AI chat interface           │
│  └── ExportDialog.tsx      — video export UI             │
├─────────────────────────────────────────────────────────┤
│  BACKEND (Python FastAPI)                                │
│  ├── routers/scene_graph.py  — REST API                  │
│  ├── routers/automation.py   — script-to-scene pipeline  │
│  ├── routers/tts.py          — Volcengine TTS            │
│  ├── core/scene_graph/       — engine core               │
│  │   ├── node.py             — SceneNode base class      │
│  │   ├── specialized_nodes.py — CharacterNode, etc.      │
│  │   ├── scene.py            — SceneGraph container      │
│  │   ├── tools.py            — SceneToolExecutor (16 AI tools) │
│  │   └── asset_scanner.py    — PSD asset registry        │
│  └── core/agents/            — AI agents                 │
│      └── scene_director.py   — Gemini Function Calling   │
├─────────────────────────────────────────────────────────┤
│  STORAGE                                                 │
│  ├── extracted_psds/         — character assets           │
│  │   └── {name}/動作/*.png   — pose images                │
│  │   └── {name}/表情/*.png   — face images                │
│  ├── stages/                 — background layers (FLA)    │
│  └── assets/                 — shared asset pool          │
└─────────────────────────────────────────────────────────┘
```

## File Map chi tiết

### Backend — Core Engine

| File | Chức năng | Quan trọng |
|------|-----------|------------|
| `backend/core/scene_graph/node.py` | `SceneNode` base class — transform, keyframes, z-index, visibility | ⭐⭐⭐ |
| `backend/core/scene_graph/specialized_nodes.py` | `CharacterNode` (pose/face), `CameraNode`, `TextNode`, `AudioNode`, `BackgroundLayerNode`, `PropNode` | ⭐⭐⭐ |
| `backend/core/scene_graph/scene.py` | `SceneGraph` — container giữ tất cả nodes, `describe()` cho AI, `to_dict()`/`from_dict()` | ⭐⭐⭐ |
| `backend/core/scene_graph/tools.py` | `SceneToolExecutor` — 16 tool functions cho AI: `add_character`, `set_position`, `add_keyframe`, `set_character_pose`, `set_character_face`... | ⭐⭐⭐ |
| `backend/core/scene_graph/asset_scanner.py` | `AssetRegistry` — quét thư mục PSD → build registry nhân vật + pose + face | ⭐⭐ |
| `backend/core/scene_graph/transform.py` | `Transform` dataclass (x, y, scale_x, scale_y, rotation) | ⭐ |

### Backend — Routers (API)

| File | Endpoints | Chức năng |
|------|-----------|-----------|
| `backend/routers/scene_graph.py` | `GET /api/scene-graph/characters`, `POST /api/scene-graph/ai/direct` | Asset list + AI chat |
| `backend/routers/automation.py` | `POST /api/automation/script-to-scene`, `POST /api/automation/srt-to-scene`, `POST /api/automation/lipsync` | Script-to-scene pipeline |
| `backend/routers/tts.py` | `POST /api/tts/synthesize`, `POST /api/tts/batch` | Volcengine TTS |
| `backend/main.py` | App entry, CORS, static mounts, router registration | Startup |

### Frontend — Core

| File | Chức năng |
|------|-----------|
| `frontend-react/src/core/scene-graph/SceneGraphManager.ts` | Canonical scene state, `evaluateAtTime(t)` → `SceneSnapshot`, keyframe interpolation |
| `frontend-react/src/core/scene-graph/types.ts` | TypeScript types: `AnyNodeData`, `CharacterNodeData`, `NodeSnapshot`, `SceneSnapshot` |
| `frontend-react/src/core/scene-graph/keyframe.ts` | `interpolateKeyframes()` — linear/ease interpolation |
| `frontend-react/src/core/export/VideoExporter.ts` | `exportCanvasToVideo()` — canvas capture → WebM blob |
| `frontend-react/src/stores/useSceneGraphStore.ts` | Zustand store — reactive wrapper around `SceneGraphManager` |
| `frontend-react/src/config/api.ts` | `API_BASE_URL` = `http://localhost:8001` |

### Frontend — Components

| File | Chức năng |
|------|-----------|
| `frontend-react/src/components/studio/editor/StudioMode.tsx` | Main editor: toolbar, canvas, sidebar tabs, timeline |
| `frontend-react/src/components/studio/editor/SceneRenderer.tsx` | PixiJS imperative renderer — composites pose+face layers |
| `frontend-react/src/components/studio/editor/AIChatPanel.tsx` | AI Director chat interface |
| `frontend-react/src/components/studio/editor/ScriptImport.tsx` | Script/SRT import + character mapping UI |
| `frontend-react/src/components/studio/editor/ExportDialog.tsx` | Video export modal with progress bar |
| `frontend-react/src/components/studio/editor/PixiStage.tsx` | PixiJS Application wrapper |

## Data Flow

### 1. Script → Scene (Automation)
```
User paste script text
    ↓
Frontend: ScriptImport.tsx → POST /api/automation/script-to-scene
    ↓
Backend: automation.py
    ├── parse script lines (character, text, emotion, action)
    ├── analyze_text_emotion() / analyze_text_action() — heuristic NLP
    ├── resolve_pose() / resolve_face() — map to actual asset names
    ├── build_scene_from_script()
    │   ├── add_character → SceneToolExecutor
    │   ├── add_frame() → pose/face frameSequence
    │   ├── add x/y keyframes → movement
    │   └── _add_lipsync_frames() → lip-sync face swaps
    └── return SceneGraph JSON
    ↓
Frontend: useSceneGraphStore.applySceneData(json)
    ↓
SceneGraphManager.loadFromBackendResponse()
    ↓
SceneRenderer.tsx reads evaluateAtTime(t) → renders PixiJS sprites
```

### 2. AI Chat → Scene Manipulation
```
User types "di chuyển cô gái sang trái"
    ↓
AIChatPanel.tsx → POST /api/scene-graph/ai/direct
    ↓
scene_director.py → Gemini API (Function Calling)
    ↓
Gemini returns tool_calls: [{name: "set_position", params: {x: 3, y: 7}}]
    ↓
SceneToolExecutor.execute() → mutate SceneGraph
    ↓
Return updated SceneGraph JSON → frontend applies
```

### 3. Playback
```
User clicks Play
    ↓
requestAnimationFrame loop: time += dt
    ↓
SceneGraphManager.evaluateAtTime(time)
    ├── Interpolate keyframes (x, y, scale, opacity, rotation)
    └── Evaluate frameSequence → active pose/face at time t
    ↓
SceneSnapshot → SceneRenderer updates PixiJS sprites
```

## Quy ước quan trọng

1. **World coordinates**: 1 unit = 100px (PPU=100). Canvas = 19.2 × 10.8 units.
2. **Keyframe format**: `{time: float, value: float, easing: "linear"|"ease_in"|"ease_out"|"ease_in_out"}`
3. **FrameSequence format**: `{time: float, layers: {pose: "站立", face: "微笑"}}`
4. **Node IDs**: `"{type}-{hex8}"` e.g. `"character-1804a50e"`
5. **Asset names**: Chinese characters (e.g. "站立", "微笑") — đây là tên file gốc từ PSD.
