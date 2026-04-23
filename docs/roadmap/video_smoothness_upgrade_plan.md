# 🎬 Đánh Giá & Lộ Trình Nâng Cấp Video Mượt Mà (Không Âm Thanh)

> **Ngày tạo**: 18/04/2026 — **Cập nhật**: 18/04/2026 (v2 — Chuyển hướng Speech Bubble)  
> **Nhánh làm việc**: `feature/stage-intelligence-smoothness`  
> **Mục tiêu**: Đánh giá trung thực về những gì CẦN nâng cấp, những gì ĐÃ CÓ nhưng chưa tối ưu, và lộ trình thực thi chi tiết để Agent tạo video mượt + người dùng kiểm soát được.

> [!IMPORTANT]
> **Quyết định Phong Cách v2**: Nhân vật AnimeStudio thuộc thể loại **Q版 Chibi / Truyện tranh**, KHÔNG phải Anime 3D hay phim hoạt hình truyền thống.
> - ❌ **BỎ** Lip-sync nhép miệng (face swap 0.25s trông giả tạo trên chibi)
> - ❌ **BỎ** Blink chớp mắt (chibi biểu đạt qua pose/face swap đột ngột, không cần micro-animation mắt)
> - ✅ **THÊM** Speech Bubble (bong bóng thoại) — ngôn ngữ thị giác cốt lõi của truyện tranh
> - ✅ **GIỮ** IdleAnimator thở/sway (vẫn phù hợp với chibi — cơ thể đung đưa nhẹ)

---

## 📊 PHẦN 1: Đánh Giá Hiện Trạng — Cái Gì Đã Có, Cái Gì Thiếu?

### ✅ Đã Có Và Hoạt Động Tốt

| # | Chức năng | Trạng thái | File chính | Ghi chú |
|---|-----------|-----------|------------|---------| 
| 1 | **SceneGraph Engine** | ✅ Ổn định | `core/scene_graph/` | Keyframe interpolation, z_index animation đều hoạt động |
| 2 | **PixiJS Renderer** | ✅ Hoạt động | `SceneRenderer.tsx` | Pose+Face compositing, parallax BG, camera viewport transform |
| 3 | **CameraDirectorAgent** | ✅ Đã tích hợp | `camera_director_agent.py` | Ollama-first, fallback deterministic. Đang ghi keyframes vào CameraNode |
| 4 | **IdleAnimatorAgent** | ✅ Đã tích hợp | `idle_animator_agent.py` | Deterministic thở+sway. Đã inject vào `automation.py` L1289-1308 |
| 5 | **ActorAgent (Per-character)** | ✅ Đã tích hợp | `actor_agent.py` | Mỗi nhân vật 1 AI riêng, plan pose/face cho mọi dòng thoại |
| 6 | **SwarmNegotiator + Critic** | ✅ Đã tích hợp | `swarm_*.py` | Self-Refining Loop 2 vòng. Ollama → Gemini fallback |
| 7 | **StageAnalyzer (Vision)** | ✅ Đã tích hợp | `stage_analyzer_agent.py` | Gemini Vision → cache vĩnh viễn. Standable + Interaction points |
| 8 | **Smart Facing + Listener** | ✅ Đã tích hợp | `automation.py` | Tự quay mặt, listener phản ứng |
| 9 | **Subtitle TextNode** | ✅ Đã tích hợp | `automation.py` + `SceneRenderer.tsx` | Fade in/out, nhưng hiển thị dạng thanh ngang ở đáy — phong cách PHIM, không phải truyện tranh |
| 10 | **Video Export (WebM)** | ✅ Cơ bản | `VideoExporter.ts` | captureStream + MediaRecorder, 8Mbps VP9 |
| 11 | **Lip-sync (heuristic)** | ⚠️ Có nhưng LOẠI BỎ | `automation.py` L1354-1382 | Không phù hợp phong cách chibi Q版 → **sẽ disable** |

---

### ⚠️ Đã Có Nhưng Chưa Tối Ưu (Cần Nâng Cấp)

| # | Vấn đề | Tình trạng cụ thể | Mức ảnh hưởng |
|---|--------|--------------------|---------------|
| A1 | **ActorAgent chỉ plan 1 pose/face cho CẢ câu thoại** | Nếu câu thoại dài 10s, nhân vật giữ nguyên 1 tư thế suốt. Thiếu "mid-sentence acting" | 🔴 Cao — Video đơ |
| A2 | **CameraDirector fallback quá đơn giản** | `_fallback_plan()` chỉ alternating giữa wide/close_up theo modulo. Không xem xét emotion | 🟡 TB — Camera thiếu kịch tính khi offline |
| A3 | **Z-Index chưa dynamic theo thời gian** | Khi nhân vật "bước tới" (step_forward), Z-index cần thay đổi để hiển thị trước vật thể | 🟡 TB — Nhân vật bị "phẳng" |
| A4 | **Subtitle hiện tại = phong cách phim** | `SubtitleDisplayObject` hiển thị text nền đen ở đáy canvas. Không phù hợp truyện tranh | 🔴 Cao — Mất bản sắc thể loại |
| A5 | **Video Export chỉ WebM, không frame-accurate** | `setTimeout()` driving frame capture → timing drift | 🟡 TB |

---

### ❌ Chưa Có (Cần Xây Mới)

| # | Tính năng | Tại sao cần | Độ khó |
|---|-----------|-------------|--------|
| B1 | **🗨️ Speech Bubble System** | Bong bóng thoại gắn vào nhân vật — ngôn ngữ thị giác #1 của truyện tranh | ⭐⭐ TB |
| B2 | **Multi-keyframe Acting per line** | Câu thoại 10s cần 3-4 lần đổi pose/face theo diễn biến cảm xúc | ⭐⭐ TB |
| B3 | **Context-aware Pose (Sit/Stand)** | Nhân vật luôn đứng kể cả cạnh ghế sofa. Cần auto-sit | ⭐ Dễ |
| B4 | **Storyboard Preview UI** | Người dùng cần xem sơ đồ phân cảnh TRƯỚC khi render, cho phép chỉnh sửa | ⭐⭐ TB |
| B5 | **Undo/Redo cho AI Nudges** | AI Critic sửa vị trí nhưng user không thể hoàn tác | ⭐ Dễ (Zustand+Zundo đã có) |
| B6 | **Scene Transition (Cut/Fade/Dissolve)** | Multi-scene video cần chuyển cảnh mượt | ⭐⭐ TB |
| B7 | **Frame-accurate Export Pipeline** | Thay thế setTimeout bằng RAF + SceneGraph sync | ⭐⭐ TB |

---

## 🔍 PHẦN 2: Đánh Giá Tính Khả Thi — Nên Làm Gì, Bỏ Gì?

### ✅ NÊN LÀM (ROI cao, khả thi trong ngắn hạn)

| # | Task | Lý do | Effort | Impact |
|---|------|-------|--------|--------|
| 1 | **🗨️ Speech Bubble System (B1)** | Đây là tính năng **định danh** cho video truyện tranh. Không có nó = không phải truyện tranh. TextNode đã có sẵn, chỉ cần frontend renderer mới + backend gán vị trí gần nhân vật | TB | 🔴 Cực Cao |
| 2 | **Multi-keyframe Acting (A1+B2)** | Nút thắt lớn nhất. 1 pose cho 10s = "tượng nói". Nâng `ActorAgent` lên plan nhiều keyframe trong 1 câu | TB | 🔴 Cực Cao |
| 3 | **Context-aware Sit/Stand (B3)** | Code đã có `can_sit_on` trong StageAnalysis. Chỉ cần thêm logic check + map pose "坐着" | Thấp | 🟡 Cao |
| 4 | **Camera Fallback thông minh (A2)** | Thêm emotion awareness vào `_fallback_plan()`: giận dữ → extreme_close_up, buồn → wide_shot | Thấp | 🟡 TB |
| 5 | **Dynamic Z-Index cho chuyển động (A3)** | Khi nhân vật "step_forward", animate z_index lên | Thấp | 🟡 TB |
| 6 | **Undo/Redo AI Actions (B5)** | Zustand store + Zundo đã có sẵn. Chỉ cần wrap AI mutation calls | Thấp | 🟡 Cao |
| 7 | **Storyboard Preview (B4)** | Hiển thị timeline blocks cho user duyệt trước khi render | TB | 🟡 Cao |

### 🟡 NÊN CÂN NHẮC (ROI tốt nhưng effort cao hơn)

| # | Task | Lý do | Effort | Impact |
|---|------|-------|--------|--------|
| 8 | **Frame-accurate Export (B7)** | Thay setTimeout → RAF + manual SceneGraph.evaluateAtTime(frame/fps) | TB | 🟡 TB |
| 9 | **Scene Transition System (B6)** | TransitionRenderer đã có sẵn trong SceneRenderer.tsx (Layer 5) | TB | 🟡 TB |

### ❌ BỎ / HẠ ƯU TIÊN

| # | Task | Lý do bỏ |
|---|------|----------|
| X1 | **Lip-sync nhép miệng** | Phong cách Q版/chibi không cần nhép miệng. Face swap đột ngột (STEP) mới đúng thể loại. `_add_lipsync_frames()` sẽ được **disable/skip** |
| X2 | **Blink chớp mắt** | Tương tự — chibi biểu đạt qua swap biểu cảm toàn bộ, không cần micro-animation mắt |
| X3 | **Headless Render Loop** | Quá nặng infrastructure, chưa cần |
| X4 | **Navigation Mesh / Pathfinding** | Phức tạp, chưa cần khi nhân vật chủ yếu đứng tại chỗ |
| X5 | **Dynamic Lighting** | Effort khổng lồ, impact thấp |

---

## 📋 PHẦN 3: Lộ Trình Thực Thi Chi Tiết

### 🏁 Phase 1: "Bong Bóng Thoại — Linh Hồn Truyện Tranh" (2-3 ngày)
> Mục tiêu: Video có bong bóng thoại gắn vào nhân vật đang nói — định danh phong cách truyện tranh.

#### Task 1.1 — Speech Bubble Backend (TextNode → SpeechBubbleNode)

**Cách tiếp cận**: Mở rộng `TextNode` hiện có, KHÔNG tạo node type mới (giữ backward compat).

**File**: `backend/core/scene_graph/specialized_nodes.py` — TextNode  
**Thay đổi**:
- Thêm fields vào `TextNode`:
  ```python
  # Thêm vào TextNode:
  bubble_style: str = "none"      # "none" | "speech" | "shout" | "thought" | "whisper"
  bubble_target_id: str = ""      # ID của CharacterNode mà bubble gắn vào
  speaker_name: str = ""          # Tên nhân vật hiển thị (nếu muốn)
  ```
- `bubble_style = "none"` → render như subtitle cũ (backward compat)
- `bubble_style = "speech"` → render bong bóng tròn có đuôi
- `bubble_style = "shout"` → bong bóng gai góc (hét lên)
- `bubble_style = "thought"` → bong bóng mây (suy nghĩ)
- `bubble_style = "whisper"` → bong bóng nét đứt (thì thầm)

**File**: `backend/routers/automation.py` — vùng Subtitle (~L1195-1218)  
**Thay đổi**:
- Thay vì tạo TextNode subtitle ở đáy, tạo TextNode với `bubble_style` + `bubble_target_id`:
  ```python
  line_sub = TextNode(
      id=f"bubble_line_{idx}",
      name=f"Bubble: {line.character}",
      content=line.text,                          # CHỈ text, không có "Character: "
      speaker_name=line.character,                 # 🆕 Tên riêng
      bubble_style=_emotion_to_bubble(emotion),    # 🆕 speech/shout/thought
      bubble_target_id=char_nodes[line.character], # 🆕 Gắn vào nhân vật
      font_size=0.28,
      color="#000000",                             # Chữ đen trên nền trắng (manga style)
      z_index=9999,
  )
  # Vị trí: phía TRÊN ĐẦU nhân vật
  char_state = char_states.get(line.character, {})
  bubble_x = char_state.get("x", 9.6)
  bubble_y = char_state.get("y", 7.5) - 3.5       # Phía trên đầu
  line_sub.set_position(bubble_x, bubble_y)
  ```

**Helper function**:
```python
def _emotion_to_bubble(emotion: str) -> str:
    """Map emotion → bubble style cho truyện tranh."""
    shout_emotions = {"angry", "furious", "shocked", "giận", "hét", "sốc", "điên"}
    thought_emotions = {"thinking", "confused", "nghĩ", "phân vân", "suy nghĩ"}
    whisper_emotions = {"whisper", "thì thầm", "bí mật", "secret"}
    
    em = emotion.lower().strip() if emotion else ""
    if em in shout_emotions:
        return "shout"
    if em in thought_emotions:
        return "thought"
    if em in whisper_emotions:
        return "whisper"
    return "speech"  # Default: bong bóng thoại thường
```

---

#### Task 1.2 — Speech Bubble Frontend Renderer

**File mới**: Thêm class `SpeechBubbleDisplayObject` vào `SceneRenderer.tsx`  
**Mô tả**:

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   BUBBLE STYLES                                                 │
│                                                                 │
│   💬 speech:     ╭──────────╮        🗯️ shout:   ⚡═══════⚡  │
│                  │ Text...  │                     ‖ TEXT!! ‖    │
│                  ╰────┬─────╯                     ⚡═══════⚡  │
│                       ╲                               ╲        │
│                    [nhân vật]                       [nhân vật]  │
│                                                                 │
│   💭 thought:    ○ ╭──────╮          🤫 whisper:  ┆─────────┆  │
│                  ○ │ Hmm  │                       ┆ psst... ┆  │
│                    ╰──────╯                       ┆─────────┆  │
│                        ○                              ╲        │
│                    [nhân vật]                       [nhân vật]  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Rendering với PixiJS (PIXI.Graphics)**:
- **speech**: `roundRect()` trắng + viền đen 3px + đuôi tam giác chỉ xuống nhân vật
- **shout**: `polygon()` hình ngôi sao/gai → nền trắng, viền đỏ đậm
- **thought**: `roundRect()` + 2-3 hình tròn nhỏ nối từ bubble xuống nhân vật
- **whisper**: `roundRect()` nét đứt (dash pattern), nền nhạt hơn

**Position tracking**: 
- Đọc `bubble_target_id` → tìm CharacterNode trong snapshot → theo dõi `x, y` của nhân vật
- Offset Y lên trên đầu nhân vật (~ -3.5 units × PPU)
- Nếu nhân vật di chuyển (có keyframe x) → bubble di chuyển theo

**Text style (Manga)**:
- Font: `"Comic Sans MS", "Noto Sans SC", sans-serif` hoặc font manga custom
- Chữ đen `#000000` trên nền trắng `#FFFFFF`
- fontSize nhỏ hơn subtitle: ~22-26px
- wordWrap theo chiều rộng bubble (max ~300px)

---

#### Task 1.3 — Disable Lip-sync (Opt-out for chibi style)

**File**: `backend/routers/automation.py` ~L1224-1226  
**Thay đổi**:
```python
# TRƯỚC:
if "说话" in available_faces and "微笑" in available_faces:
    _add_lipsync_frames(node, speak_start, end_time, available_faces)

# SAU (thêm flag):
enable_lipsync = kwargs.get("enable_lipsync", False)  # Default OFF cho chibi
if enable_lipsync and "说话" in available_faces and "微笑" in available_faces:
    _add_lipsync_frames(node, speak_start, end_time, available_faces)
```
- Giữ nguyên function `_add_lipsync_frames()` (không xóa)
- Chỉ skip call bằng flag `enable_lipsync=False`
- Người dùng có thể bật lại nếu muốn (ví dụ cho phong cách anime khác)

---

### 🏁 Phase 2: "Nhân Vật Sống Động" (1-2 ngày)
> Mục tiêu: Nhân vật đổi tư thế nhiều lần trong câu thoại dài, tự ngồi khi cạnh ghế.

#### Task 2.1 — Multi-Keyframe Acting (ActorAgent upgrade)
**File**: `backend/core/agents/actor_agent.py`  
**Thay đổi**:
- Nâng prompt `ACTOR_PROMPT` để yêu cầu AI trả về **nhiều keyframe** trong 1 dòng thoại dài (>3s)
- Output format mới: mỗi entry có thêm `sub_beats: [{offset_sec, pose, face}]`
- `automation.py`: Khi inject frame_sequence, loop qua `sub_beats` để tạo nhiều `add_frame()` trong khoảng `speak_start → end_time`

```python
# Ví dụ output mới từ ActorAgent:
{
    "line_idx": 0,
    "pose": "站立",           # Pose ban đầu
    "face": "发怒",           # Face ban đầu
    "sub_beats": [            # 🆕 Mid-sentence changes
        {"offset": 1.5, "pose": "手指向前", "face": "大吼"},
        {"offset": 3.0, "pose": "抱胸", "face": "发怒"},
    ]
}
```

**Backward compatible**: Nếu `sub_beats` rỗng hoặc không có → giữ nguyên logic cũ (1 pose/face).

---

#### Task 2.2 — Context-Aware Sit/Stand
**File**: `backend/routers/automation.py` (trong vùng Smart Position, ~L700-900)  
**Thay đổi**:
- Khi `standable_regions[i].can_sit == True` VÀ nhân vật có pose "坐着" (hoặc "sitting"):
  - Tự động gán `initial_pose = "坐着"` thay vì "站立"
  - Điều chỉnh Y position nhẹ (ngồi thường thấp hơn 0.3 đơn vị)

```python
# automation.py — sau khi xác định home_x, home_y:
if region.get("can_sit") and "坐着" in available_poses:
    initial_pose = "坐着"
    home_y += 0.3  # Ngồi thấp hơn một chút
    logger.info(f"Auto-sit: '{char_name}' sitting on '{region.get('name')}'")
```

---

### 🏁 Phase 3: "Camera & Z-Depth Mượt" (1-2 ngày)
> Mục tiêu: Camera di chuyển cinematic, nhân vật có chiều sâu thực.

#### Task 3.1 — Camera Fallback Emotion-Aware
**File**: `backend/core/agents/camera_director_agent.py`, method `_fallback_plan()`  
**Thay đổi**:
- Đọc emotion từ `all_lines[i].get("emotion")` 
- Map: giận/sốc → `extreme_close_up` (zoom 1.6+), buồn → `wide_shot` (zoom 0.95), vui → `close_up` (zoom 1.25)

#### Task 3.2 — Dynamic Z-Index Animation
**File**: `backend/routers/automation.py` (vùng Cinematic Movement, ~L1090-1120)  
**Thay đổi**:
- Khi `action_type == "step_forward"`: thêm `node.add_keyframe("z_index", t, z+50, "step")`  
- Khi `action_type == "step_back"`: thêm `node.add_keyframe("z_index", t, z-30, "step")`

---

### 🏁 Phase 4: "Kiểm Soát Người Dùng" (2-3 ngày)
> Mục tiêu: Người dùng không bị "mắc kẹt" với kết quả AI. Có thể duyệt, sửa, undo.

#### Task 4.1 — Storyboard Preview UI
**File mới**: `frontend-react/src/components/studio/editor/StoryboardPreview.tsx`  
**Mô tả**:
- Sau khi `StoryboardAgent` chia cảnh, hiển thị danh sách blocks
- Mỗi block: Background thumbnail + danh sách thoại + emotion tags
- Cho phép user chỉnh sửa, sắp lại thứ tự, bỏ cảnh
- Nút "Approve & Render" để bắt đầu

#### Task 4.2 — Semantic Nudges (Giới hạn quyền AI)
**File**: `backend/core/agents/swarm_critic_agent.py`  
**Thay đổi**:
- Critic chỉ được dùng lệnh tương đối (nudge), không tọa độ tuyệt đối
- Mọi nudge đi qua Zustand store → Undo khả thi

#### Task 4.3 — Undo/Redo AI Actions
**File**: `frontend-react/src/stores/useSceneGraphStore.ts`  
**Thay đổi**:
- Zundo middleware đã có. Wrap AI mutation calls để tạo undo point
- Thêm nút "Hoàn Tác AI" vào toolbar

---

### 🏁 Phase 5: "Polish & Export" (2-3 ngày)

#### Task 5.1 — Frame-Accurate Export
**File**: `frontend-react/src/core/export/VideoExporter.ts`  
- Thay `setTimeout` → `requestAnimationFrame` + manual time stepping

#### Task 5.2 — Scene Transition System
**File**: `frontend-react/src/core/renderer/TransitionRenderer.ts` (đã có)  
- StoryboardAgent output thêm `transition_type`: cut/fade/dissolve

#### Task 5.3 — WebCodecs Export (Optional)
**File**: `frontend-react/src/core/export/WebCodecsExporter.ts` (đã có sẵn)  
- Kết nối file đã tồn tại, fallback sang MediaRecorder

---

## 📈 PHẦN 4: Ma Trận Ưu Tiên Tổng Hợp

```
                    IMPACT (Người xem nhận ra ngay)
                    ↑
              HIGH  │  [1.1] Speech Bubble 🗨️  [4.1] Storyboard UI
                    │  [2.1] Multi-Keyframe     [4.2] Semantic Nudges
                    │  [2.2] Sit/Stand          [4.3] Undo/Redo
                    │
            MEDIUM  │  [3.1] Camera Fallback    [5.2] Transitions
                    │  [3.2] Dynamic Z          [5.1] Export Accuracy
                    │  [1.3] Disable Lip-sync   [5.3] WebCodecs
                    │
               LOW  │  ❌ Lip-sync    ❌ Blink    ❌ Headless Render
                    └──────────────────────────────────────────→
                         LOW        MEDIUM        HIGH
                                EFFORT (Thời gian + Rủi ro)
```

---

## ⚡ PHẦN 5: Khuyến Nghị Bắt Đầu

> [!IMPORTANT]
> **Bắt đầu Phase 1 — Speech Bubble System**.
> Đây là tính năng **định danh phong cách** cho video truyện tranh. Khi người xem thấy bong bóng thoại xuất hiện bên cạnh nhân vật, họ ngay lập tức nhận ra "đây là truyện tranh chuyển động" — không phải phim hoạt hình nhàm chán hay slideshow PowerPoint.

### Thứ tự thực hiện đề xuất:

```
Day 1-3:   Phase 1 — Bong Bóng Thoại (Speech Bubble)
           ├── 1.1 Backend: TextNode mở rộng (bubble_style, bubble_target_id)
           ├── 1.2 Frontend: SpeechBubbleDisplayObject (4 styles)
           └── 1.3 Disable lip-sync mặc định

Day 4-5:   Phase 2 — Nhân Vật Sống Động
           ├── 2.1 Multi-Keyframe ActorAgent  
           └── 2.2 Context-aware Sit/Stand

Day 6-7:   Phase 3 — Camera & Depth
           ├── 3.1 Camera Fallback upgrade
           └── 3.2 Dynamic Z-Index

Day 8-10:  Phase 4 — User Control
           ├── 4.1 Storyboard Preview UI
           ├── 4.2 Semantic Nudges
           └── 4.3 Undo/Redo

Day 11-13: Phase 5 — Polish & Export
           ├── 5.1 Frame-accurate export
           ├── 5.2 Scene Transitions
           └── 5.3 WebCodecs (optional)
```

---

## 🧪 Kế Hoạch Kiểm Tra

| Phase | Test case | Phương pháp |
|-------|-----------|-------------|
| Phase 1 | Bong bóng hiện gần đầu nhân vật đang nói | Generate scene → play → xem bubble xuất hiện gần character |
| Phase 1 | Bong bóng "shout" gai góc khi giận | Script có `emotion: "angry"` → verify bubble style ≠ round |
| Phase 1 | Bubble di chuyển theo nhân vật | Character có keyframe x → bubble tracks theo |
| Phase 1 | Lip-sync bị skip (không có face swap nhép miệng) | Generate scene → verify frame_sequence KHÔNG có 说话 alternating |
| Phase 2 | Nhân vật đổi pose 2-3 lần trong 1 câu | Generate scene với câu 10s → kiểm tra frame_sequence |
| Phase 2 | Nhân vật tự ngồi khi cạnh ghế | Stage analysis có `can_sit_on=true` → verify pose = "坐着" |
| Phase 3 | Camera zoom vào nhân vật giận dữ | Script có `emotion: "angry"` → verify cam zoom ≥ 1.5 |
| Phase 4 | Undo hoạt động sau AI nudge | Apply nudge → click Undo → verify position reverted |
| Phase 5 | Video export đúng timing | Export 5s video → verify frame count = 150 (30fps × 5s) |

---

## 🏗️ Nguyên Tắc Thực Thi

1. **NÂNG CẤP, KHÔNG PHÁ CODE** (Rule #1): Mở rộng TextNode, KHÔNG tạo node type mới. Thêm `bubble_style` = OPTIONAL field, default `"none"` = backward compat.

2. **Test trước khi báo cáo** (Rule #3): Mỗi phase xong phải chạy `python -m py_compile` + curl test + browser verify.

3. **Tái sử dụng module** (Rule #9): TextNode đã có sẵn, SceneRenderer đã render text. Build on top.

4. **Fallback chain**: Nếu `bubble_target_id` không tìm thấy CharacterNode → fallback về vị trí cố định giữa canvas.

5. **Phong cách nhất quán**: Mọi quyết định thiết kế phải hỏi: "Cái này trông giống truyện tranh không?" Nếu giống phim live-action → sai hướng.
