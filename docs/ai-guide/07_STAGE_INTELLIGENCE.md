# 07 — Stage Intelligence: Hệ thống nhận diện bối cảnh & đặt nhân vật thông minh

## Tổng quan

> **Vấn đề gốc**: Khi tạo scene tự động, nhân vật bị đặt ở vị trí cố định (x=5.0, x=14.2) — 
> bất kể bối cảnh là showroom ô tô hay quán café. Nhân vật "trơ" giữa không gian.
>
> **Giải pháp**: Dùng Vision AI phân tích bối cảnh → cache kết quả → tự động đặt nhân vật 
> gần vật thể phù hợp (gần xe, gần bàn, trước cửa...).

---

## Kiến trúc hệ thống

```
┌────────────────────────────────────────────────────────────────────────┐
│                    STAGE INTELLIGENCE PIPELINE                         │
│                                                                        │
│  ┌─────────────┐    ┌──────────────────┐    ┌─────────────────────┐   │
│  │ Upload .fla  │───→│ Extract layers   │───→│ storage/stages/     │   │
│  │              │    │ (JSZip parser)   │    │ {name}_element_N.png│   │
│  └─────────────┘    └──────────────────┘    └────────┬────────────┘   │
│                                                       │                │
│                              ┌────────────────────────┘                │
│                              ▼                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                 GENERATE SCENE (automation.py)                     │ │
│  │                                                                    │ │
│  │  1. background_id = "4S店_1760984889936"                          │ │
│  │  2. Cached analysis?                                               │ │
│  │     ├── YES → Đọc từ storage/stage_analysis/{id}.json             │ │
│  │     └── NO  → Auto-trigger Vision AI ──┐                          │ │
│  │                                         │                          │ │
│  │  ┌──────────────────────────────────────┘                          │ │
│  │  ▼                                                                 │ │
│  │  ┌────────────────────────────────────────────────────────┐       │ │
│  │  │ StageAnalyzerAgent (stage_analyzer_agent.py)            │       │ │
│  │  │  • Gửi ALL layer PNGs đến Gemini Vision API            │       │ │
│  │  │  • Model: gemini-2.5-flash (hoặc config.vision_model)  │       │ │
│  │  │  • Key rotation: tự chuyển key khi 429 quota            │       │ │
│  │  │  • Output: StageAnalysisResult (elements + metadata)    │       │ │
│  │  └───────────────────────┬────────────────────────────────┘       │ │
│  │                          ▼                                         │ │
│  │  ┌────────────────────────────────────────────────────────┐       │ │
│  │  │ Cache → storage/stage_analysis/{id}.json                │       │ │
│  │  │  • Phân tích 1 lần, cache VĨNH VIỄN                    │       │ │
│  │  │  • Xóa file cache nếu muốn re-analyze                  │       │ │
│  │  └───────────────────────┬────────────────────────────────┘       │ │
│  │                          ▼                                         │ │
│  │  ┌────────────────────────────────────────────────────────┐       │ │
│  │  │ SMART POSITIONING ALGORITHM                             │       │ │
│  │  │  • Extract standable_regions (floor, ground, platform)  │       │ │
│  │  │  • Extract interaction_points (furniture, vehicle, door) │       │ │
│  │  │  • Place characters ON standable, NEAR interaction      │       │ │
│  │  │  • Spread multiple characters to avoid overlap          │       │ │
│  │  └────────────────────────────────────────────────────────┘       │ │
│  └───────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```

---

## File liên quan

| File | Vai trò |
|------|---------|
| `backend/core/agents/stage_analyzer_agent.py` | Vision AI agent: gửi ảnh → nhận phân tích |
| `backend/routers/stages.py` | API endpoints + cache helpers |
| `backend/routers/automation.py` | Smart positioning algorithm |
| `backend/core/ai_config.py` | AI key management + model config |
| `backend/storage/stage_analysis/` | Cache JSON files (1 file per stage) |

---

## Chi tiết từng thành phần

### 1. StageAnalyzerAgent

**File**: `backend/core/agents/stage_analyzer_agent.py`

Agent gửi tất cả layer PNGs của 1 bối cảnh đến Gemini Vision API và yêu cầu phân tích:

```python
# Input: list of layer images (base64 encoded PNGs)
layer_images = [
    {"id": "element_1", "image_base64": "...", "type": "background", "zIndex": 1},
    {"id": "element_7", "image_base64": "...", "type": "prop", "zIndex": 7},
    ...
]

# Output: StageAnalysisResult
result = await analyze_stage_elements(layer_images)
# result.scene_description = "Modern car dealership showroom..."
# result.scene_type = "interior"
# result.mood = "professional"
# result.elements = [ElementInfo(...), ...]
```

**ElementInfo schema** — mỗi element trong kết quả:

```python
@dataclass
class ElementInfo:
    layer_id: str                # e.g. "element_7"
    name_vi: str                 # e.g. "Xe trưng bày trắng"
    name_en: str                 # e.g. "White display car"
    category: str                # ← KEY FIELD cho positioning
    can_stand_on: bool = False   # Nhân vật có thể ĐỨNG trên không?
    can_sit_on: bool = False     # Nhân vật có thể NGỒI trên không?
    bbox_x: float = 0           # Bounding box X (% of image width)
    bbox_y: float = 0           # Bounding box Y (% of image height)
    bbox_w: float = 100         # Bounding box Width (%)
    bbox_h: float = 100         # Bounding box Height (%)
    suggested_z: int = 0        # Recommended z-index
```

**Category values có ý nghĩa cho positioning:**

| Category | Ý nghĩa | Dùng cho |
|----------|----------|----------|
| `floor` | Sàn/mặt đất | `standable_regions` — nơi nhân vật đứng |
| `furniture` | Bàn, ghế, kệ | `interaction_points` — nhân vật đứng GẦN |
| `vehicle` | Xe, motor | `interaction_points` — nhân vật đứng GẦN |
| `door` | Cửa ra/vào | `interaction_points` — nhân vật đứng GẦN |
| `window` | Cửa sổ | `interaction_points` |
| `stairs` | Cầu thang | `interaction_points` |
| `background` | Trời, tường xa | Bỏ qua — không ảnh hưởng positioning |
| `sky` | Bầu trời | Bỏ qua |
| `ceiling` | Trần nhà | Bỏ qua |
| `decor` | Trang trí | Bỏ qua |
| `prop` | Đạo cụ nhỏ | Bỏ qua |
| `building` | Tòa nhà | Bỏ qua |
| `wall` | Tường | Bỏ qua |

### 2. API Key Rotation

**Khi Vision API trả 429 RESOURCE_EXHAUSTED:**

```python
# stage_analyzer_agent.py — retry loop:
max_attempts = max(config.total_keys, 2)

for attempt in range(max_attempts):
    try:
        response = await call_vision_api(...)
        return parse(response)
    except Exception as e:
        if "429" in str(e) or "RESOURCE_EXHAUSTED" in str(e):
            config.rotate_key()        # ← Chuyển sang key tiếp theo
            await asyncio.sleep(2)     # ← Chờ 2s
            continue                   # ← Thử lại
        else:
            break                      # ← Lỗi khác, dừng

# Nếu tất cả keys đều hết quota → trả fallback result
```

> [!IMPORTANT]
> **Quota là per-PROJECT, không per-key.** 4 keys cùng 1 Google Cloud project = chia chung quota.
> Để có quota thật sự riêng, cần keys từ PROJECTS KHÁC NHAU.

### 3. Model Configuration

**File**: `backend/data/ai_config.json`

```json
{
  "provider": "gemini",
  "model": "gemini-2.5-flash",          // ← Text + Vision model
  "api_keys": [
    "AIzaSy...",                          // Key từ project A
    "AIzaSy..."                           // Key từ project B (quota riêng)
  ]
}
```

> [!WARNING]
> `vision_model` mặc định = `model`. Nếu muốn dùng model khác cho vision,
> thêm `"vision_model": "gemini-2.0-flash"` vào config JSON.
>
> **Khi đổi model**: Xóa `vision_model` khỏi config JSON để nó tự follow theo `model`.

### 4. Cache Format

**File**: `backend/storage/stage_analysis/{stage_id}.json`

```json
{
  "scene_description": "Modern car dealership showroom with display cars",
  "scene_type": "interior",
  "mood": "professional",
  "stage_id": "4S店_1760984889936",
  "num_layers": 10,
  "elements": [
    {
      "layer_id": "element_4",
      "name_vi": "Sàn showroom",
      "name_en": "Showroom floor",
      "category": "floor",
      "can_stand_on": true,
      "can_sit_on": false,
      "bbox_x": 0, "bbox_y": 55, "bbox_w": 100, "bbox_h": 45,
      "suggested_z": -20
    },
    {
      "layer_id": "element_7",
      "name_vi": "Xe trưng bày trắng",
      "name_en": "White display car (center)",
      "category": "vehicle",
      "can_stand_on": false,
      "can_sit_on": false,
      "bbox_x": 25, "bbox_y": 25, "bbox_w": 50, "bbox_h": 50,
      "suggested_z": 10
    }
  ]
}
```

### 5. Smart Positioning Algorithm

**File**: `backend/routers/automation.py` — trong `build_scene_from_script()`

```python
# Bước 1: Extract regions từ cache
standable_regions = []    # Nơi nhân vật CÓ THỂ ĐỨNG
interaction_points = []   # Vật thể nhân vật NÊN ĐỨNG GẦN

for elem in stage_analysis["elements"]:
    # Convert bbox % → world coordinates (canvas = 19.2 x 10.8)
    cx = (elem["bbox_x"] + elem["bbox_w"] / 2) / 100 * 19.2
    cy = (elem["bbox_y"] + elem["bbox_h"] / 2) / 100 * 10.8

    if elem["can_stand_on"]:
        standable_regions.append({"x": cx, "y": cy})

    if elem["category"] in ("furniture", "vehicle", "door", "stairs"):
        interaction_points.append({"x": cx, "y": cy, "name": elem["name_en"]})

# Bước 2: Assign character positions
for i, char_name in enumerate(unique_chars):
    if standable_regions:
        region = standable_regions[i % len(standable_regions)]
        home_x, home_y = region["x"], region["y"]

        # Nudge toward nearest interaction point
        if interaction_points:
            nearest = min(interaction_points, 
                          key=lambda ip: abs(ip["x"] - home_x) + abs(ip["y"] - home_y))
            home_x = (home_x + nearest["x"]) / 2   # Halfway between
    
    elif interaction_points:
        ip = interaction_points[i % len(interaction_points)]
        home_x = ip["x"]
        home_y = ip["y"] + 2.0   # Stand in front of object

    else:
        # Fallback: spread evenly across canvas
        home_x = 3.0 + (i * 13.2 / max(num_chars - 1, 1))
        home_y = 7.5

    # Spread multiple characters to avoid overlap
    if num_chars > 1:
        offset = (i - (num_chars-1)/2) * 4.0 / max(num_chars-1, 1)
        home_x += offset

    # Clamp to safe zone
    home_x = clamp(home_x, 2.0, 17.2)
    home_y = clamp(home_y, 3.0, 9.5)
```

---

## Hướng nâng cấp (Upgrade Guide)

### 🔵 P0 — Nâng cấp gần nhất

#### 1. Auto-analyze khi upload bối cảnh mới

**Hiện tại**: Chỉ analyze khi Generate Scene (lazy).
**Nâng cấp**: Analyze ngay khi upload FLA thành công.

```python
# File: backend/routers/stages.py
@router.post("/upload-fla")
async def upload_fla(file: UploadFile):
    # ... extract layers ...
    
    # Auto-analyze ngay sau extract
    from backend.core.agents.stage_analyzer_agent import analyze_stage_elements
    layer_images = load_layers_as_base64(stage_id)
    result = await analyze_stage_elements(layer_images)
    save_analysis_cache(stage_id, result.to_dict())
    
    return {"stage_id": stage_id, "layers": len(layers), "analyzed": True}
```

#### 2. Pose tự động theo bối cảnh (Sit/Stand)

**Hiện tại**: Nhân vật luôn đứng, kể cả khi `can_sit_on = True`.
**Nâng cấp**: Tự đổi pose khi đặt gần ghế/sofa.

```python
# File: backend/routers/automation.py
if region.get("can_sit") and char_has_sitting_pose(char_info):
    # Đổi pose sang "坐着" (sitting)
    initial_pose = find_sitting_pose(char_info)  
    logger.info(f"Auto-sit: '{char_name}' sitting on '{region['name']}'")
```

**Yêu cầu**: 
- Scan PSD assets xem nhân vật nào có pose "坐着" / "sitting"
- Thêm hàm `find_sitting_pose(char_info)` vào `asset_scanner.py`

#### 3. Batch analyze tất cả backgrounds đã có

**Script chạy 1 lần** để tạo cache cho toàn bộ ~20 backgrounds:

```python
# File (tạo mới): scripts/batch_analyze_stages.py
import asyncio
from backend.routers.stages import get_all_stage_ids, get_cached_analysis
from backend.core.agents.stage_analyzer_agent import analyze_stage_elements

async def batch_analyze():
    stage_ids = get_all_stage_ids()
    for sid in stage_ids:
        if get_cached_analysis(sid):
            print(f"  SKIP {sid} (cached)")
            continue
        layers = load_layers(sid)
        result = await analyze_stage_elements(layers)
        save_cache(sid, result)
        print(f"  OK   {sid}: {result.scene_description}")
        await asyncio.sleep(3)  # Rate limit

asyncio.run(batch_analyze())
```

---

### 🟡 P1 — Nâng cấp trung hạn

#### 4. Z-Index thông minh (nhân vật đi sau/trước đồ vật)

**Hiện tại**: Z-index cố định, nhân vật luôn render trên tất cả background layers.
**Nâng cấp**: Dùng `suggested_z` từ analysis để quyết định nhân vật ở trước hay sau vật thể.

```python
# automation.py — khi đặt nhân vật:
if stage_analysis:
    # Tìm z-index layer gần nhất với nhân vật
    nearest_layer_z = find_nearest_layer_z(home_x, home_y, stage_analysis)
    char_z_index = nearest_layer_z + 1  # Đứng TRƯỚC vật thể gần nhất
```

```typescript
// SceneRenderer.tsx — z-ordering:
// Sort ALL displayObjects (backgrounds + characters) by z_index
// → Nhân vật có thể ở GIỮA 2 background layers (e.g. trước bàn, sau cây)
```

#### 5. Interaction-aware animation

**Hiện tại**: Nhân vật đứng yên tại vị trí được đặt.
**Nâng cấp**: AI Director biết vật thể trong scene → tạo animation hợp ngữ cảnh.

```python
# agents/director_agent.py — enhanced prompt:
prompt = f"""
Scene: {stage_analysis['scene_description']}
Objects: {[e['name_en'] for e in stage_analysis['elements']]}

Script line: "{line.character}: {line.dialogue}"

Based on the objects available, what should {line.character} do?
- Walk toward the {nearest_object}?
- Point at something?
- Turn to face the door?
"""
```

#### 6. Background Selector với AI description

**Hiện tại**: Dropdown text-only (`4S店_1760984889936`).
**Nâng cấp**: Grid thumbnails + AI description.

```typescript
// ScriptImport.tsx — thumbnail grid:
<div className="grid grid-cols-3 gap-2">
  {stages.map(stage => (
    <div key={stage.id} onClick={() => setBackground(stage.id)}>
      <img src={`/static/stages/${stage.id}____1_element_1.png`} />
      <p>{stage.analysis?.scene_description || stage.id}</p>
    </div>
  ))}
</div>
```

---

### 🔴 P2 — Nâng cấp dài hạn

#### 7. Multi-scene transition (nhân vật di chuyển giữa bối cảnh)

```
Scene 1: Showroom (4S店)
  → Hoa và Nam nói chuyện cạnh xe
  → TRANSITION: "đi ra ngoài"

Scene 2: Bên ngoài (4S店门外)
  → Nhân vật xuất hiện gần cửa (Vision AI biết cửa ở đâu)
  → Tiếp tục dialogue
```

**Yêu cầu**: Analysis biết vị trí CỬA RA → nhân vật exit từ đó.
Analysis scene mới biết vị trí CỬA VÀO → nhân vật enter từ đó.

#### 8. Real-time Vision re-analysis

Cho phép user kéo-thả thêm props vào scene → re-analyze chỉ vùng thay đổi.

#### 9. 3D depth estimation

Dùng depth model (MiDaS / Depth Anything) để ước tính depth map → 
parallax tự động chính xác hơn.

#### 10. Object-aware camera framing

Camera tự zoom vào vùng quan trọng dựa trên analysis:
- Dialogue scene → zoom mid-shot vào 2 nhân vật
- Nhân vật chỉ xe → camera pan theo hướng chỉ

---

## Debug Checklist — Stage Intelligence

```
□ 1. Vision AI có chạy không?
    → python -c "from backend.core.ai_config import get_ai_config; c=get_ai_config(); print(c.model, c.total_keys)"
    → Kiểm tra model = gemini-2.5-flash, keys > 0

□ 2. Cache analysis có tồn tại không?
    → ls backend/storage/stage_analysis/
    → Nếu rỗng, chạy POST /api/stages/{id}/analyze

□ 3. Cache có elements với can_stand_on/category đúng không?
    → cat backend/storage/stage_analysis/{id}.json
    → Cần ít nhất 1 element có can_stand_on=true (thường là floor)

□ 4. automation.py có đọc cache không?
    → Tìm log: "Using stage analysis for '{id}'"
    → Tìm log: "Standable:" hoặc "Interaction:"
    → Nếu không có → cache file name không match background_id

□ 5. Nhân vật có đặt đúng vị trí không?
    → Tìm log: "Stage-aware: '{char}' final position (X, Y)"
    → X nên gần interaction point, Y nên trên floor region

□ 6. Nếu auto-analysis fail?
    → Tìm log: "Auto stage analysis failed"
    → Nguyên nhân thường: 429 quota, key hết, hoặc model sai
    → Fix: đổi model, thêm key từ project khác, hoặc chờ quota reset

□ 7. Fallback positioning?
    → Nếu không có analysis → nhân vật ở vị trí cố định (center/spread)
    → Không crash, chỉ mất smart positioning
```

---

## Ví dụ kết quả thực tế

### Bối cảnh: 4S Car Dealership Showroom

**Vision AI output (10 layers):**

| Layer | Object | Category | Stand | Sit | BBox (%) |
|-------|--------|----------|-------|-----|----------|
| 1 | Sky | sky | - | - | (0,0,100,100) |
| 2 | Building facade (left) | building | - | - | (0,10,25,45) |
| 3 | Building facade (right) | building | - | - | (75,10,25,45) |
| 4 | **Tiled floor** | **floor** | **✅** | - | **(0,55,100,45)** |
| 5 | Ceiling lights | ceiling | - | - | (0,0,100,25) |
| 6 | Room with windows | wall | - | - | (0,0,100,100) |
| 7 | **Car (front view)** | **vehicle** | - | - | **(25,25,50,50)** |
| 8 | **Yellow car (left)** | **vehicle** | - | - | **(0,45,40,35)** |
| 9 | **Yellow car (right)** | **vehicle** | - | - | **(60,45,40,35)** |
| 10 | Store signage | decor | - | - | (30,40,40,15) |

**Kết quả positioning (2 nhân vật):**

```
standable_regions: [{x: 9.6, y: 8.1, name: "Tiled floor"}]
interaction_points: [
    {x: 9.6, y: 5.4, name: "Car (front view)", category: "vehicle"},
    {x: 3.8, y: 6.5, name: "Yellow car (left)", category: "vehicle"},
    {x: 15.4, y: 6.5, name: "Yellow car (right)", category: "vehicle"},
]

→ Hoa: nudged toward "Car (front view)" → (7.6, 8.1)
→ Nam: spread right, nudged toward "Yellow car (right)" → (11.6, 8.1)
→ Cả hai đứng trên sàn (y=8.1), gần xe trưng bày
```
