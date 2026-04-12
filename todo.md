# AnimeStudio — TODO Roadmap

> Công cụ sản xuất video hoạt hình 2D tự động, AI có thể điều khiển toàn bộ cảnh phim.
> Cập nhật: 2026-04-12

---

## Phase 1: Scene Graph — Video DOM ✅ DONE

> Nền tảng dữ liệu để AI đọc/ghi nội dung cảnh phim.

- [x] `Transform` + `BoundingBox` — hệ tọa độ world units (19.2×10.8)
- [x] `Keyframe` — animation engine, 8 easing functions (bao gồm STEP cho pose/face swap)
- [x] `SceneNode` — base class (inspired by Motion Canvas `Node.ts`)
- [x] `CharacterNode` — PSD character với pose/face layer swapping
- [x] `BackgroundLayerNode` — FLA background layer với parallax speed
- [x] `CameraNode`, `PropNode`, `TextNode`, `AudioNode`
- [x] `SceneGraph` — container, `describe()` cho AI, `get_snapshot_at_time(t)`
- [x] `SceneToolExecutor` — 16 AI Tool Functions (set_position, add_keyframe, set_character_pose...)
- [x] Frontend TypeScript mirrors — `types.ts`, `keyframe.ts`, `SceneGraphManager.ts`
- [x] Tích hợp `SceneGraphManager` vào `EditorCore` singleton
- [x] Unit tests — 10/10 PASSED
- [x] `AssetRegistry` — quét `storage/extracted_psds/` → character + pose + face registry
- [x] REST API `/api/scene-graph/characters` — serve asset info cho frontend
- [x] Demo standalone HTML — chứng minh concept với nhân vật thật

---

## Phase 2: Tích hợp vào React App chính 🔴 HIGHEST PRIORITY

> Kết nối Scene Graph engine vào PixiJS stage + timeline hiện tại.

### 2.1 — PixiJS Renderer kết nối SceneGraph
- [ ] Tạo `SceneGraphRenderer.ts` — đọc `SceneGraphManager.evaluateAtTime(t)` → update PixiJS sprites
- [ ] Character compositing trên PixiJS — load `pose.png` + overlay `face.png` (thay thế Canvas 2D demo)
- [ ] PixiJS image cache/atlas — preload tất cả pose+face khi character được thêm vào scene
- [ ] Background layer rendering — load FLA-extracted layer PNGs, sắp xếp theo z-index
- [ ] Camera node → PixiJS viewport transform (zoom, pan)

### 2.2 — Timeline UI kết nối SceneGraph
- [ ] Sync `SceneGraphManager` ↔ timeline tracks hiện tại (`useTimelineStore`)
- [ ] Hiển thị keyframe diamonds ◇ cho mỗi node property (x, y, scale, opacity)
- [ ] Hiển thị pose/face frame markers riêng biệt
- [ ] Playback controller chạy `evaluateAtTime(t)` mỗi frame

### 2.3 — Character Sidebar
- [ ] Sidebar component hiển thị danh sách nhân vật từ `AssetRegistry` API
- [ ] Drag-and-drop nhân vật từ sidebar → canvas để thêm vào scene
- [ ] Pose/face selector inline (giống demo nhưng trong React)
- [ ] Thumbnail preview cho mỗi pose/face

---

## Phase 3: AI Agent Integration 🔴 HIGH PRIORITY

> AI tự động dàn cảnh — user chỉ cần mô tả bằng text.

### 3.1 — Director Agent nâng cấp
- [ ] Cập nhật `director_agent.py` — output `SceneGraph` thay vì raw JSON workflow
- [ ] Director dùng `AssetRegistry.describe_all()` để biết nhân vật nào available
- [ ] Director dùng tên pose/face thật (站立, 微笑...) thay vì tên tiếng Anh generic
- [ ] System prompt mới với tool function schemas từ `TOOL_DEFINITIONS`

### 3.2 — Builder Agent nâng cấp
- [ ] Cập nhật `builder_agent.py` — emit tool calls thay vì raw node JSON
- [ ] SceneToolExecutor validates mỗi tool call (type check, node exists, pose available)
- [ ] Error recovery — nếu tool call fail → AI tự sửa

### 3.3 — Orchestrator nâng cấp
- [ ] `orchestrator.py` — pipeline: Director → Builder → SceneGraph → Review
- [ ] Real-time feedback loop: Reviewer xem `scene.describe()` + canvas screenshot → suggest fixes
- [ ] Action log cho user xem AI đang làm gì

### 3.4 — Conversational Scene Editing
- [ ] Chat interface — user nói "di chuyển cô gái sang phải" → AI gọi `set_position`
- [ ] Context awareness — AI biết scene hiện tại có gì qua `scene.describe()`
- [ ] Undo/redo stack cho tool calls

---

## Phase 4: Background & Stage System 🟡 MEDIUM

> Xử lý bối cảnh từ file FLA — tách layer, parallax, camera.

### 4.1 — FLA Layer Scanner
- [ ] Tạo `StageScanner` — quét `storage/stages/` → nhận diện các scene và element layers
- [ ] Parse layer positions, z-index, visibility
- [ ] API endpoint `/api/scene-graph/stages`

### 4.2 — Stage ↔ Scene Graph
- [ ] Khi chọn background → auto-add `BackgroundLayerNode` cho mỗi layer
- [ ] Parallax speed tự động dựa trên z-index (xa = slow, gần = fast)
- [ ] Camera pan → layers di chuyển khác tốc độ

### 4.3 — FLA tương tác
- [ ] User có thể show/hide từng layer
- [ ] User có thể kéo thả layer riêng biệt
- [ ] AI có thể chọn layer nào visible/hidden

---

## Phase 5: Audio & TTS 🟡 MEDIUM

> Đồng bộ lời thoại với animation.

### 5.1 — TTS Integration
- [ ] Gắn `AudioNode` vào SceneGraph cho mỗi câu thoại
- [ ] TTS API đã có (`/api/tts/`) → sync với SceneGraph timeline
- [ ] Audio waveform hiển thị trên timeline

### 5.2 — Lip Sync (optional)
- [ ] Phân tích audio → mouth shapes (visemes)
- [ ] Map visemes → face layers (nếu PSD có mouth variants)

### 5.3 — BGM & SFX
- [ ] Background music node
- [ ] Sound effect triggers tại thời điểm cụ thể

---

## Phase 6: Video Export 🟡 MEDIUM

> Render scene thành video file.

### 6.1 — Client-side Export (FFmpeg.wasm)
- [ ] Integrate `@ffmpeg/ffmpeg` vào frontend
- [ ] Capture PixiJS canvas frame-by-frame → encode MP4/WebM
- [ ] Progress bar + cancel

### 6.2 — Server-side Export (nâng cấp)
- [ ] Backend nhận `SceneGraph JSON` → render bằng FFmpeg
- [ ] Batch render multiple scenes
- [ ] Resolution selector (720p, 1080p, 4K)

### 6.3 — Subtitle Overlay
- [ ] Render `TextNode` nội dung lên video
- [ ] SRT/ASS export

---

## Phase 7: Polish & UX 🟢 LOW

> Hoàn thiện trải nghiệm người dùng.

### 7.1 — Scene Management
- [ ] Save/load scenes (SceneGraph JSON ↔ file/database)
- [ ] Scene templates (preset layouts, camera angles)
- [ ] Multi-scene project (video gồm nhiều cảnh nối tiếp)

### 7.2 — UI Improvements
- [ ] Onboarding wizard cho user mới
- [ ] Keyboard shortcuts (Space=play, K=add keyframe, Delete=remove)
- [ ] Dark/light theme toggle

### 7.3 — Performance
- [ ] Sprite atlas packing (gom nhiều pose PNG → 1 atlas để giảm draw calls)
- [ ] WebWorker cho keyframe evaluation nặng
- [ ] Lazy loading cho faces (97 faces/character → chỉ load khi cần)

### 7.4 — Collaboration
- [ ] Project sharing via URL
- [ ] Real-time collaboration (WebSocket sync)

---

## Backlog — Ideas chưa ưu tiên

- [ ] Skeletal animation (bones) thay thế pose swapping cho smooth transitions
- [ ] AI auto-generate script → full video pipeline (text → script → scene → video)
- [ ] Integration với Jianbiqiji hoặc Live2D cho advanced character animation
- [ ] Mobile responsive editor
- [ ] Plugin system cho custom nodes

---

## Tài nguyên hiện có

### Characters (PSD extracted)
| Nhân vật | Poses | Faces | Path |
|----------|-------|-------|------|
| Q版花店姐姐长裙 | 28 | 97+94 dotEye | `storage/extracted_psds/Q版花店姐姐长裙_1761648249312/` |
| Q版蓝色挑染男 | 28 | 97+94 dotEye | `storage/extracted_psds/Q版蓝色挑染男_1761648268637/` |
| 青蛙哥 | 28 | 73 | `storage/extracted_psds/青蛙哥_1761648323488/` |
| + 24 chars (chưa extract) | — | — | `storage/extracted_psds/...` |

### Backgrounds (FLA extracted)
| Stage | Layers | Path |
|-------|--------|------|
| 4S店 | ~10 elements × 21 duplicates | `storage/stages/4S店_*` |
| 4S店内 | 6 elements | `storage/stages/4S店内_*` |
| 80年代家门口 | 7 elements | `storage/stages/80年代家门口_*` |
| 木屋内部 | 29 elements | `storage/stages/木屋内部_*` |
| 末日废墟 | 4-5 elements | `storage/stages/末日废墟_*` |
| 火影忍者忍里村 | 4 elements | `storage/stages/火影忍者忍里村_*` |
| + nhiều stages khác | | |

### External Repos (reference)
| Repo | Purpose |
|------|---------|
| Motion Canvas | Scene Graph pattern |
| Theatre.js | Animation sequencing |
| react-video-editor | Timeline UI |
| manim | Mobject hierarchy |
| MoneyPrinterTurbo | Auto video pipeline |
| OpenCut | EditorCore pattern |

---

> **Bước tiếp theo được khuyến nghị: Phase 2.1** — kết nối PixiJS renderer với SceneGraph để nhân vật thật hiển thị trong editor chính.
