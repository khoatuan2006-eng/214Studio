# 06 — FLA Background Rendering Pipeline (Bối cảnh từ FLA → Canvas)

## Tổng quan

Đây là tài liệu chi tiết mô tả TOÀN BỘ luồng dữ liệu từ file `.fla` → Backend SceneGraph → Frontend PixiJS Canvas. 
Mục đích: Giúp AI hiểu rõ pipeline, tránh lặp lại các bug đã xảy ra, và biết cách mở rộng hệ thống.

---

## Kiến trúc tổng quát

```
┌────────────────────────────────────────────────────────────────────────────┐
│                    FLA BACKGROUND RENDERING PIPELINE                       │
│                                                                            │
│  [1. Asset Input]                                                          │
│  ┌──────────────┐     ┌──────────────────┐     ┌────────────────────────┐  │
│  │ .fla file    │ ──→ │ JSFL / FLA       │ ──→ │ storage/stages/        │  │
│  │ (Adobe       │     │ Parser           │     │ {name}_element_N.png   │  │
│  │  Animate)    │     │ (tools/ hoặc     │     │ (mỗi layer 1 file PNG) │  │
│  └──────────────┘     │  frontend JSZip) │     └───────────┬────────────┘  │
│                       └──────────────────┘                 │               │
│                                                            │               │
│  [2. Backend Build SceneGraph]                             ▼               │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ automation.py → build_scene_from_script()                            │  │
│  │   • Scan stages/ dir ← startswith(background_id) + endswith(.png)   │  │
│  │   • Filter: _element_N.png (loại bỏ sub-crop _element_N_M.png)     │  │
│  │   • Sort by element index                                            │  │
│  │   • Tạo BackgroundLayerNode cho từng layer:                         │  │
│  │     - id:            "bg-{background_id}-{idx}"                     │  │
│  │     - node_type:     "background_layer"                             │  │
│  │     - asset_path:    "/static/stages/{filename}"  ← QUAN TRỌNG     │  │
│  │     - parallax_speed: heuristic based on layer order                │  │
│  │     - z_index:       -50, -35, -20, -5, 10, 25, ...                │  │
│  │     - transform:     {x: 9.6, y: 5.4, scale_x: 1, scale_y: 1}     │  │
│  └──────────────────────────────────────────────────────────┬──────────┘  │
│                                                              │             │
│  [3. API Transport (JSON)]                                   ▼             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ Response JSON per background_layer node:                             │  │
│  │ {                                                                    │  │
│  │   "id": "bg-4S店_xxx-1",                                            │  │
│  │   "node_type": "background_layer",    ← snake_case                  │  │
│  │   "asset_path": "/static/stages/...", ← TOP-LEVEL FIELD, NOT metadata│ │
│  │   "parallax_speed": 0.75,             ← TOP-LEVEL FIELD             │  │
│  │   "blur": 0.0,                        ← TOP-LEVEL FIELD             │  │
│  │   "transform": {"x": 9.6, "y": 5.4, "scale_x": 1, "scale_y": 1},  │  │
│  │   "metadata": {},                     ← EMPTY! Domain fields ở trên │  │
│  │   "keyframes": {},                                                   │  │
│  │   "z_index": -50                                                     │  │
│  │ }                                                                    │  │
│  └──────────────────────────────────────────────────────────┬──────────┘  │
│                                                              │             │
│  [4. Frontend Deserialization]                                ▼             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ SceneGraphManager.ts → nodeFromBackend()                             │  │
│  │   • raw.asset_path     → node.assetPath     (DIRECT PROPERTY)       │  │
│  │   • raw.parallax_speed → node.parallaxSpeed  (DIRECT PROPERTY)      │  │
│  │   • raw.blur           → node.blur           (DIRECT PROPERTY)      │  │
│  │   • raw.node_type      → node.nodeType = "background_layer"         │  │
│  │   • raw.metadata       → node.metadata = {} (EMPTY OBJECT)          │  │
│  │                                                                      │  │
│  │   ⚠️ CRITICAL: assetPath KHÔNG nằm trong metadata!                  │  │
│  │   Truy cập: (node as any).assetPath   ✅                            │  │
│  │   KHÔNG:    node.metadata.assetPath    ❌ (luôn undefined)           │  │
│  └──────────────────────────────────────────────────────────┬──────────┘  │
│                                                              │             │
│  [5. PixiJS Rendering — 3 Layer Architecture]                ▼             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ SceneRenderer.tsx — Stage/Canvas z-order:                            │  │
│  │                                                                      │  │
│  │  app.stage                                                          │  │
│  │    ├── placeholderBg (z=-2000) — HIDDEN when real BG layers exist   │  │
│  │    ├── bgContainer   (z=-1000) — FLA backgrounds, NOT camera-moved  │  │
│  │    │     ├── layer1 sprite (z=-50, anchor=0,0, cover-scaled)        │  │
│  │    │     ├── layer2 sprite (z=-35)                                  │  │
│  │    │     └── ...                                                    │  │
│  │    └── sceneContainer — Characters, camera pivot applies HERE       │  │
│  │          ├── character1 (z=10)                                      │  │
│  │          └── character2 (z=15)                                      │  │
│  │                                                                      │  │
│  │ Cover-scale: sprite.scale = max(canvasW/texW, canvasH/texH)         │  │
│  │ → Fills entire 1920x1080 canvas regardless of source image size     │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                            │
│  [6. Stage Analyzer (Vision AI)]                                           │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ POST /api/stages/{stage_id}/analyze                                  │  │
│  │   → Sends each layer PNG to Vision AI (Gemini)                      │  │
│  │   → Returns: ElementInfo per layer:                                 │  │
│  │     name_vi, name_en, category, can_stand_on, can_sit_on, bbox      │  │
│  │   → Cached at: storage/stage_analysis/{stage_id}.json               │  │
│  │   → automation.py reads cache for smart character placement          │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Bugs đã Fix & Bài học

### Bug #1: assetPath đọc sai vị trí (CRITICAL)

**Triệu chứng**: Generate Scene thành công (13 nodes, 78 keyframes) nhưng canvas chỉ hiện placeholder (núi tím + thảm cỏ xanh), KHÔNG hiện ảnh bối cảnh thật.

**Nguyên nhân gốc**: 
```typescript
// SceneRenderer.tsx — SAI ❌
const assetPath = node.metadata?.assetPath as string;
// → node.metadata = {} (rỗng) → assetPath = undefined → không load texture

// SceneRenderer.tsx — ĐÚNG ✅  
const assetPath = (node as any).assetPath as string
    || node.metadata?.assetPath as string;
// → (node as any).assetPath = "/static/stages/xxx.png" → load texture OK
```

**Lý do sâu xa**:
- Backend `BackgroundLayerNode.to_dict()` serialize `asset_path` là **top-level field**, KHÔNG nhét vào `metadata`.
- Frontend `nodeFromBackend()` map `raw.asset_path` → `node.assetPath` (spread vào object root).
- Nhưng TypeScript `AnyNodeData` interface KHÔNG có `assetPath` field (nó chỉ nằm trên `BackgroundLayerNodeData`).
- Nên phải dùng `(node as any).assetPath` để truy cập.

**Bài học**: Khi truy cập domain-specific fields của SceneNode trên frontend, LUÔN kiểm tra `nodeFromBackend()` để xem field nằm ở đâu: `metadata` hay top-level spread.

### Bug #2: File FLA corrupt

**Triệu chứng**: Frontend FLA parser (JSZip) không thể mở file, báo lỗi `Bad magic number for central directory`.

**Nguyên nhân**: File `.fla` bị hỏng cấu trúc ZIP (EOCD record). File FLA thực chất là ZIP chứa XML.

**Cách phát hiện**:
```python
import zipfile
zipfile.ZipFile('path/to/file.fla')  # BadZipFile nếu corrupt
```

**Fix**: Mở lại trong Adobe Animate → Save As → file mới sẽ có cấu trúc ZIP chuẩn.

### Bug #3: Placeholder luôn che backgrounds thật

**Triệu chứng**: Generate Scene tạo đúng nodes nhưng canvas chỉ hiện placeholder (núi tím).

**Nguyên nhân**: `drawBackground()` placeholder nằm trên `app.stage` z=-1000, còn bgcolor sprites nằm TRONG `sceneContainer` z=-50. Placeholder che hết.

**Fix**: Tạo 3 layer riêng biệt:
- `placeholderBg` (z=-2000) — auto-hide khi có real BG
- `bgContainer` (z=-1000) — chứa FLA background sprites  
- `sceneContainer` — chứa characters, chịu camera pivot

### Bug #4: Background sprites nằm sai vị trí do camera pivot

**Triệu chứng**: Background layers bị dịch chuyển khi camera pan.

**Nguyên nhân**: Backgrounds nằm trong cùng container với characters. Khi camera pivot dịch container, backgrounds cũng bị dịch.

**Fix**: Background sprites nằm trong `bgContainer` RIÊNG, camera pivot chỉ áp dụng lên `sceneContainer`.

### Bug #5: Background sprites không auto-scale

**Triệu chứng**: Nếu ảnh nguồn kích thước khác 1920x1080, background không fill canvas.

**Fix**: Auto-scale "cover" mode:
```typescript
const coverScale = Math.max(CANVAS_W / texture.width, CANVAS_H / texture.height);
sprite.scale.set(coverScale, coverScale);
```

---

## Naming Convention cho Stage Assets

```
{tên_tiếng_trung}_{timestamp_13_chữ_số}____1_element_{N}.png
│                  │                       │
│                  │                       └── Layer index (1=xa nhất, N=gần nhất)
│                  └── Unix timestamp ms (ID duy nhất)
│
└── Tên bối cảnh gốc (Unicode, ví dụ: 4S店门外, 木屋内部)

Ví dụ:
4S店门外_1760984890727____1_element_1.png    # Layer 1 (bầu trời)
4S店门外_1760984890727____1_element_2.png    # Layer 2 (tường xa)  
4S店门外_1760984890727____1_element_3.png    # Layer 3 (cửa)
4S店门外_1760984890727____1_element_4.png    # Layer 4 (mặt đất)

Sub-crops (biến thể, KHÔNG nên dùng làm background layer chính):
4S店门外_1760984890727____1_element_1_1.png  # Bản crop thứ 1 của layer 1
4S店门外_1760984890727____1_element_1_2.png  # Bản crop thứ 2 của layer 1
```

### Regex để phân biệt

```python
# Layer chính (dùng để build SceneGraph):
re.match(r'_element_\d+\.png$', filename)           # ✅ element_1.png

# Sub-crop (KHÔNG dùng):
re.search(r'_element_\d+_\d+\.png$', filename)      # ❌ element_1_2.png
```

### Background ID (dùng trong dropdown UI)

```
background_id = "4S店门外_1760984890727"
# → Regex extract: ^(.+?_\d{13})
# → Match all files: f.startswith(background_id) and f.endswith(".png")
```

---

## Frontend: 2 Cách Upload FLA

### Cách 1: Manual (JSFL Script)

```
1. Mở .fla trong Adobe Animate
2. Run tools/export_fla_to_psd.jsfl
3. Copy *_element_N.png vào backend/storage/stages/
4. Restart backend hoặc gọi refresh
```

### Cách 2: Tự động (Browser-based JSZip Parser)

```typescript
// AssetSidebar.tsx → handleUploadFLA()
// 1. User chọn file .fla qua file picker
// 2. Frontend dùng JSZip giải nén .fla (vì FLA = ZIP)
// 3. Parse DOMDocument.xml lấy layer metadata
// 4. Render mỗi layer thành Canvas → export PNG  
// 5. Upload PNGs lên backend /api/stages/upload
//
// File: frontend-react/src/lib/fla/fla-integration.ts
// File: frontend-react/src/lib/fla/fla-parser.ts
```

### Nút AUTO-TEST FLA PARSER (Debug Only)

```typescript
// AssetSidebar.tsx có chứa nút "AUTO-TEST FLA PARSER" 
// Tự động fetch /stage.fla từ public/ folder rồi parse
// ⚠️ CHỈ DÙNG ĐỂ DEBUG — cần XÓA trước khi deploy production
```

---

## Z-Index Strategy cho 2.5D Scene

```
Z-Index Layout (nhỏ → xa camera, lớn → gần camera):

  z = -50   ← Layer 1: Bầu trời, tường xa (parallax_speed = 0.05)
  z = -35   ← Layer 2: Núi, building trung (parallax_speed = 0.3)
  z = -20   ← Layer 3: Sàn nhà, đường (parallax_speed = 0.5)
  z = -5    ← Layer 4: Nội thất xa (parallax_speed = 0.7)
  ─────────────── CHARACTER ZONE ───────────────
  z = 10    ← CharacterNode "char-1" (nhân vật 1)
  z = 15    ← CharacterNode "char-2" (nhân vật 2)
  ─────────────── FOREGROUND ───────────────────
  z = 25    ← Layer 5: Bàn phía trước (parallax_speed = 0.85)
  z = 40    ← Layer 6: Chậu cây tiền cảnh (parallax_speed = 0.95)
  z = 55    ← Layer 7+: Props rất gần camera
  ─────────────── OVERLAY ──────────────────────
  z = 100   ← TextNode (subtitle/phụ đề)
  z = N/A   ← CameraNode (không render trực tiếp)
  z = N/A   ← AudioNode (không render trực tiếp)
```

### Tính toán z_index tự động

```python
# automation.py:
start_z = -50
z_step = 15
for i, fname in enumerate(element_files):
    layer_z = start_z + (i * z_step)
    # Layer 0: z = -50
    # Layer 1: z = -35
    # Layer 2: z = -20
    # Layer 3: z = -5
    # Layer 4: z = 10   ← CÓ THỂ TRÙNG VỚI NHÂN VẬT!
```

> ⚠️ **Lưu ý**: Nếu bối cảnh có **nhiều hơn 4 layers**, các layer phía trước có thể **que characters**  
> (nhân vật nằm ở z=10-20, mà layer 5+ cũng z=10+). Backend cần tính toán z_index thông minh hơn,  
> hoặc dùng StageAnalyzerAgent để xác định layer nào là foreground.

---

## Stage Analyzer Integration (ĐÃ TÍCH HỢP)

### API Endpoints

```
POST /api/stages/{stage_id}/analyze
  → Gửi ảnh từng layer lên Vision AI (Gemini)
  → Trả về: ElementInfo cho mỗi layer (name, bbox, can_stand, can_sit)
  → Tự động cache vào storage/stage_analysis/{stage_id}.json

GET /api/stages/{stage_id}/analysis
  → Đọc cache analysis. 404 nếu chưa analyze.
```

### usage trong automation.py

```python
# automation.py build_scene_from_script():
# 1. Load cached analysis nếu có
from backend.routers.stages import get_cached_analysis
analysis = get_cached_analysis(background_id)

# 2. Extract standable regions
for elem in analysis["elements"]:
    if elem["can_stand_on"] or elem["can_sit_on"]:
        # Convert bbox % → world coords (canvas = 19.2 x 10.8)
        cx = (elem["bbox_x"] + elem["bbox_w"]/2) / 100 * 19.2
        cy = (elem["bbox_y"] + elem["bbox_h"]/2) / 100 * 10.8
        standable_regions.append({"x": cx, "y": cy})

# 3. Place characters on detected surfaces
if standable_regions:
    home_x = standable_regions[i]["x"]   # Near table, door, etc.
    home_y = standable_regions[i]["y"] + 1.5  # Slightly below surface
else:
    home_x = 5.0 + i * 9.2  # Fallback: spread evenly
```

### Workflow để dùng Stage Analyzer

```
1. Upload/extract bối cảnh vào storage/stages/
2. Gọi: POST /api/stages/{stage_id}/analyze  (cần API key Gemini)
3. Kết quả cached tại storage/stage_analysis/{stage_id}.json
4. Từ giờ, mỗi lần Generate Scene, automation.py tự dùng cache
5. Nhân vật sẽ được đặt gần vị trí hợp lý (bàn, sàn, cửa...)
```

---

## Mở rộng cho tương lai

### 1. Parallax Camera Movement

Hiện tại `parallax_speed` chỉ được LƯU nhưng chưa được DÙNG trong renderer. Backgrounds nằm trong `bgContainer` riêng (không bị camera pivot ảnh hưởng), nên có thể dùng parallax_speed để tạo hiệu ứng depth khi camera pan.

```typescript
// TODO: Apply parallax offset when camera moves:
// bgObj.container.x = -cameraOffsetX * parallaxSpeed;
// bgObj.container.y = -cameraOffsetY * parallaxSpeed;
```

### 2. Depth of Field Blur

```typescript
// TODO: Dùng PIXI BlurFilter cho các layer xa:
// const blurFilter = new PIXI.BlurFilter();
// blurFilter.blur = node.blur;
// bgObj.container.filters = [blurFilter];
```

### 3. Dynamic Layer Z-Swap

Cho phép nhân vật đi TRƯỚC hoặc SAU một layer cụ thể bằng keyframe z_index:

```python
# Ví dụ: nhân vật bước từ sau bàn ra trước bàn
char_node.keyframes["z_index"] = [
    {"time": 0.0, "value": 5, "easing": "step"},    # SAU bàn (z=25)
    {"time": 2.0, "value": 30, "easing": "step"},   # TRƯỚC bàn (z=25)
]
```

### 4. Background Selector UI Enhancement

```
Hiện tại: Dropdown text ("4S店_1760984889936")  
Tương lai: Grid thumbnail với preview ảnh nhỏ của element_1.png
```

---

## Files liên quan

| File | Vai trò |
|------|---------|
| `backend/routers/automation.py` | Build SceneGraph, tạo BackgroundLayerNode, smart character placement |
| `backend/core/scene_graph/specialized_nodes.py` | BackgroundLayerNode class definition |
| `backend/core/scene_graph/scene.py` | SceneGraph container + serialize |
| `backend/routers/stages.py` | API serve stage images + analyze endpoint |
| `backend/core/agents/stage_analyzer_agent.py` | Vision AI phân tích vật thể trong bối cảnh |
| `backend/storage/stage_analysis/` | Cache kết quả Vision AI (JSON per stage) |
| `frontend-react/src/core/scene-graph/SceneGraphManager.ts` | `nodeFromBackend()` — deserialize |
| `frontend-react/src/core/scene-graph/types.ts` | `BackgroundLayerNodeData` interface |
| `frontend-react/src/components/studio/editor/SceneRenderer.tsx` | PixiJS rendering (3-layer architecture) |
| `frontend-react/src/components/studio/editor/ScriptImport.tsx` | Background dropdown UI |
| `frontend-react/src/components/studio/editor/AssetSidebar.tsx` | FLA upload + JSZip parser |
| `frontend-react/src/lib/fla/fla-parser.ts` | FLA ZIP structure parser |
| `frontend-react/src/lib/fla/fla-integration.ts` | FLA → StudioLayer converter |
| `tools/export_fla_to_psd.jsfl` | JSFL script cho Adobe Animate export |

---

## Checklist khi debug bối cảnh không hiện

```
□ 1. Kiểm tra file PNG có trong backend/storage/stages/ không?
    → ls storage/stages/ | grep "{background_id}"
    
□ 2. Kiểm tra API /api/stages có trả về danh sách không?
    → curl http://127.0.0.1:8001/api/stages
    
□ 3. ScriptImport dropdown có hiện background_id không?
    → Xem console.log trong ScriptImport.tsx fetchStages()
    
□ 4. Backend automation.py có tạo BackgroundLayerNode không?
    → Xem log: "Added FLA Background {id}: N layers with Z-indexes"
    
□ 5. Response JSON có chứa node_type: "background_layer" không?
    → Console Network tab: POST /api/automation/script-to-scene → response
    
□ 6. Frontend nodeFromBackend() có map asset_path đúng không?
    → console.log node AS-IS sau loadFromBackendResponse
    → Kiểm tra (node as any).assetPath !== undefined
    
□ 7. SceneRenderer.tsx có tạo BackgroundDisplayObject không?
    → console.log trong snapshot loop khi snap.nodeType === 'background_layer'
    
□ 8. PIXI.Assets.load(url) có thành công không?  
    → URL phải bắt đầu bằng API_BASE_URL + asset_path
    → Ví dụ: http://127.0.0.1:8001/static/stages/4S店门外_xxx_element_1.png
    → Kiểm tra CORS, 404, hoặc encoding lỗi Unicode filename
    
□ 9. Z-index có đè nhau không?
    → Layer foreground z > character z → nhân vật bị che
    → Giải pháp: Điều chỉnh z_step hoặc dùng StageAnalyzerAgent
```
