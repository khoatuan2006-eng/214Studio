# AnimeStudio — Workflow Roadmap

> **Mục tiêu:** Xây dựng hệ thống **Workflow** (node-based video pipeline) hoàn chỉnh —  
> từ tạo storyboard bằng node graph → preview realtime → export video chất lượng cao.  
> Phát triển theo từng giai đoạn, ưu tiên UX trực quan và hiệu năng.

> **Kiến trúc:** React Flow (node graph) + Zustand store + Canvas preview + FFmpeg export

---

## ✅ Đã hoàn thành

### Core Pipeline
- [x] **Node Graph Editor** — WorkflowMode.tsx với React Flow (Character node, Background node, Scene Output node)
- [x] **Character Node** — chọn nhân vật, cấu hình pose sequence (PoseFrame[]), vị trí, scale, opacity
- [x] **Background Node** — chọn background asset, blur, parallax
- [x] **Scene Output Node** — compositor kết nối character + background
- [x] **Preview Canvas** — render realtime 800×450 với layer stacking, playback controls
- [x] **Export MP4** — FFmpeg-based server-side render từ workflow data

### Inline Editing (Preview Sidebar)
- [x] **Character Selection** — click nhân vật trên canvas → sidebar mở ra
- [x] **Pose/Face Swap** — sidebar hiện layer thumbnails, click để swap
- [x] **Duration Input** — sửa duration từng pose frame
- [x] **Drag-to-Move** — kéo nhân vật trên canvas

### Keyframe Timeline
- [x] **Multi-track Timeline** — thay progress bar cũ bằng timeline chuyên nghiệp
- [x] **Time Ruler** — thanh thước thời gian (0s, 1s, 2s...), click để scrub
- [x] **Track Rows** — mỗi nhân vật 1 hàng với keyframe blocks proportional
- [x] **Add/Delete Keyframes** — nút + / 🗑️ trên mỗi track
- [x] **Playhead** — đường dọc trắng chạy theo thời gian

### CapCut-Style Position Animation
- [x] **PositionKeyframe System** — `positionKeyframes[]` trên CharacterNodeData
- [x] **Auto-Create Keyframe** — scrub timeline + drag character → tự động tạo KF tại currentTime
- [x] **Smooth Interpolation** — `getInterpolatedPos()` nội suy mượt giữa các KF
- [x] **Diamond Markers** ◇ — hiển thị trên timeline, click để nhảy đến KF
- [x] **Path Preview** — chấm tròn + đường nét đứt nối các vị trí KF trên canvas
- [x] **Sidebar KF List** — danh sách keyframe với thời gian, tọa độ, nút xóa

---

## 🔥 P1 — Animation Quality (Ưu tiên cao nhất)

> Mục tiêu: Nâng chất lượng animation từ "cứng" lên "mượt chuyên nghiệp"

| # | Việc cần làm | Độ phức tạp | Trạng thái |
|---|---|---|---|
| 1.1 | **Easing Curves cho Position KF** — thêm ease-in/out/cubic-bezier cho chuyển động (hiện tại chỉ linear) | 🟡 Trung bình | ⏳ |
| 1.2 | **Scale Keyframes** — CapCut-style thu phóng nhân vật theo thời gian (zoom in/out) | 🟡 Trung bình | ⏳ |
| 1.3 | **Opacity Keyframes** — fade in/out nhân vật theo thời gian | 🟢 Thấp | ⏳ |
| 1.4 | **Transition Effects** — crossfade giữa các pose frame (hiện chỉ có cut) | 🟡 Trung bình | ⏳ |
| 1.5 | **Rotation Keyframes** — xoay nhân vật theo thời gian | 🟢 Thấp | ⏳ |

---

## 🟡 P2 — Timeline & Editing UX

> Mục tiêu: Timeline chuyên nghiệp hơn, UX mượt mà

| # | Việc cần làm | Độ phức tạp | Trạng thái |
|---|---|---|---|
| 2.1 | **Drag Keyframe Diamonds** — kéo ◇ trên timeline để đổi thời gian KF | 🟡 Trung bình | ⏳ |
| 2.2 | **Drag Pose Blocks** — kéo resize block duration trên timeline | 🟡 Trung bình | ⏳ |
| 2.3 | **Timeline Zoom** — scroll wheel zoom in/out timeline (giống Premiere) | 🟡 Trung bình | ⏳ |
| 2.4 | **Snap-to-Grid** — KF snap vào grid thời gian (0.25s, 0.5s, 1s) | 🟢 Thấp | ⏳ |
| 2.5 | **Undo/Redo** — Ctrl+Z / Ctrl+Shift+Z cho mọi thao tác trên timeline | 🟡 Trung bình | ⏳ |
| 2.6 | **Multi-select KF** — chọn nhiều keyframe, di chuyển cùng lúc | 🟡 Trung bình | ⏳ |
| 2.7 | **Copy/Paste Pose Frame** — sao chép pose frame giữa các keyframe | 🟢 Thấp | ⏳ |

---

## 🔵 P3 — Multi-Scene & Storyboard

> Mục tiêu: Hỗ trợ video nhiều cảnh, storyboard trực quan

| # | Việc cần làm | Độ phức tạp | Trạng thái |
|---|---|---|---|
| 3.1 | **Scene Tabs** — nhiều scene/cut trong 1 project, tab bar để chuyển đổi | 🟡 Trung bình | ⏳ |
| 3.2 | **Scene Transition** — cut, crossfade, wipe giữa các scene | 🟡 Trung bình | ⏳ |
| 3.3 | **Storyboard View** — grid thumbnails tất cả scene, drag reorder | 🟡 Trung bình | ⏳ |
| 3.4 | **Duplicate Scene** — nhân bản scene nhanh để iterate | 🟢 Thấp | ⏳ |
| 3.5 | **Global Timeline** — timeline tổng hợp tất cả scene liên tiếp | 🔴 Cao | ⏳ |

---

## 🟠 P4 — Node System mở rộng

> Mục tiêu: Thêm các loại node mới cho pipeline phong phú hơn

| # | Việc cần làm | Độ phức tạp | Trạng thái |
|---|---|---|---|
| 4.1 | **Audio Node** — import nhạc/SFX, hiển thị waveform trên timeline | 🟡 Trung bình | ⏳ |
| 4.2 | **Text/Subtitle Node** — thêm text overlay với font, color, animation | 🟡 Trung bình | ⏳ |
| 4.3 | **Effect Node** — particle, screen shake, flash, vignette | 🔴 Cao | ⏳ |
| 4.4 | **Camera Node** — pan, zoom, shake (virtual camera movement) | 🟡 Trung bình | ⏳ |
| 4.5 | **Group/Composition Node** — gộp nhiều character thành 1 group | 🔴 Cao | ⏳ |

---

## ⚡ P5 — Export & Performance

> Mục tiêu: Export chất lượng cao, preview mượt 60fps

| # | Việc cần làm | Độ phức tạp | Trạng thái |
|---|---|---|---|
| 5.1 | **Export tích hợp PositionKeyframes** — đảm bảo animation di chuyển xuất hiện trong MP4 | 🟡 Trung bình | ⏳ |
| 5.2 | **Export Resolution** — chọn 720p / 1080p / 4K | 🟢 Thấp | ⏳ |
| 5.3 | **GIF / WebM Export** — format nhẹ cho social media | 🟡 Trung bình | ⏳ |
| 5.4 | **Preview Performance** — WebGL/OffscreenCanvas cho preview 60fps | 🔴 Cao | ⏳ |
| 5.5 | **Asset Lazy Loading** — load thumbnail trước, stream texture theo nhu cầu | 🟡 Trung bình | ⏳ |

---

## 🎨 P6 — UX Premium

> Mục tiêu: Trải nghiệm người dùng đẳng cấp chuyên nghiệp

| # | Việc cần làm | Độ phức tạp | Trạng thái |
|---|---|---|---|
| 6.1 | **Contextual Menu** — right-click trên canvas/timeline hiện menu context | 🟢 Thấp | ⏳ |
| 6.2 | **Keyboard Shortcuts** — Space=play, S=split, D=delete, K=add KF, số=speed | 🟢 Thấp | ⏳ |
| 6.3 | **Character Presets** — lưu bộ trang phục mix-match để tái sử dụng | 🟡 Trung bình | ⏳ |
| 6.4 | **Onion Skinning** — hiện ghost frame trước/sau trên canvas | 🟡 Trung bình | ⏳ |
| 6.5 | **Auto-Save & Version History** — lưu tự động + quay lại phiên bản cũ | 🟡 Trung bình | ⏳ |
| 6.6 | **Dark/Light Theme** — hỗ trợ theme cho editor | 🟢 Thấp | ⏳ |

---

## 📁 File Structure

```
frontend-react/src/
├── store/
│   └── useWorkflowStore.ts      # Zustand store: nodes, edges, PoseFrame, PositionKeyframe
├── components/workflow/
│   ├── WorkflowMode.tsx          # Node graph editor (React Flow)
│   └── WorkflowPreview.tsx       # Preview canvas + sidebar + timeline
└── core/
    └── workflowExecutor.ts       # Logic resolve workflow → render data
```

---

*Cập nhật: 2026-03-02. Maintainer: @khoatuan2006-eng*
