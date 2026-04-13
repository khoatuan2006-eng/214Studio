# AnimeStudio — Auto Video Production Roadmap

> **Mục tiêu cuối cùng**: Từ 1 đoạn kịch bản text → xuất ra 1 video hoạt hình hoàn chỉnh, tự động hoàn toàn, không cần can thiệp người dùng.

## Tình trạng hiện tại (Tháng 4/2026)

### ✅ Đã hoàn thành
- **Scene Graph Engine** — Hệ thống quản lý cảnh dạng cây (node-based)
- **PixiJS WebGL Renderer** — Render nhân vật (pose+face layers) trên canvas 1920×1080
- **AI Director (Gemini Function Calling)** — Chat để điều khiển scene
- **Script Import** — Paste kịch bản → tự dàn cảnh (pose/face/lip-sync)
- **Video Export (WebM)** — Canvas capture → download file

### 🔴 Chưa hoàn thành (cần làm)
1. **Pose animation mượt** — Nhân vật chỉ swap ảnh, chưa có transition
2. **Movement animation** — Keyframes x/y đã có nhưng evaluator chưa interpolate tốt
3. **Camera system** — CameraNode tồn tại nhưng chưa ảnh hưởng render
4. **Multi-scene** — Chỉ có 1 scene, chưa có cuts/transitions giữa các cảnh
5. **Subtitle overlay** — TextNode tồn tại nhưng chưa render text lên canvas
6. **Background integration** — Stages đã extract nhưng chưa tích hợp vào pipeline
7. **TTS + audio sync** — TTS API có sẵn nhưng chưa gắn audio vào timeline
8. **Full automation** — Cần AI tự viết kịch bản, chọn background, dựng phim

## Cấu trúc tài liệu

| File | Nội dung | Độ ưu tiên |
|------|----------|------------|
| [01_ARCHITECTURE.md](01_ARCHITECTURE.md) | Kiến trúc hệ thống + file map | Đọc trước |
| [02_CHARACTER_SYSTEM.md](02_CHARACTER_SYSTEM.md) | Cách nhân vật hoạt động (pose/face) | Đọc trước |
| [03_KEYFRAME_ANIMATION.md](03_KEYFRAME_ANIMATION.md) | Hệ thống keyframe + evaluator | 🔴 Cần fix |
| [04_SCRIPT_TO_SCENE.md](04_SCRIPT_TO_SCENE.md) | Pipeline kịch bản → cảnh | 🔴 Nâng cấp |
| [05_CAMERA_AND_STAGING.md](05_CAMERA_AND_STAGING.md) | Camera, background, staging | 🔴 Chưa làm |
| [06_TTS_AND_AUDIO.md](06_TTS_AND_AUDIO.md) | TTS, lip-sync, BGM | 🟡 Cần tích hợp |
| [07_SUBTITLE_SYSTEM.md](07_SUBTITLE_SYSTEM.md) | Phụ đề trên video | 🟡 Chưa làm |
| [08_VIDEO_EXPORT.md](08_VIDEO_EXPORT.md) | Export video hoàn chỉnh | 🟡 Cần nâng cấp |
| [09_FULL_AUTOMATION.md](09_FULL_AUTOMATION.md) | AI tự động hoàn toàn | 🟢 Giai đoạn cuối |

## Quy tắc cho AI Code Assistant

> **QUAN TRỌNG**: Đọc kỹ các quy tắc sau trước khi code.

1. **Kiến trúc nhân vật = 2 layers**: `pose` (thân) + `face` (mặt). KHÔNG có skeletal rigging. Animation = swap ảnh PNG.
2. **Backend = Python FastAPI**, Frontend = React + PixiJS v8 + Zustand.
3. **Mọi mutation** phải đi qua `SceneGraphManager` (frontend) hoặc `SceneToolExecutor` (backend).
4. **Keyframes** cho properties số (x, y, scale, opacity, rotation) được interpolate. `frameSequence` cho pose/face swap thì STEP (không interpolate).
5. **API port = 8001** (frontend config tại `frontend-react/src/config/api.ts`).
6. **Asset paths** encode UTF-8 (tên file Trung Quốc). Dùng `encodeURIComponent` khi fetch.
7. **PixiJS v8** — KHÔNG dùng v7 API. Import từ `pixi.js` không phải `@pixi/xxx`.
