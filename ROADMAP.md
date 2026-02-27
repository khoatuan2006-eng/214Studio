# AnimeStudio — Professional Upgrade Roadmap

> **Mục đích:** Tài liệu này liệt kê đầy đủ tất cả những cải tiến cần thiết  
> để nâng Anime Studio từ một công cụ prototype lên một phần mềm animation  
> chuyên nghiệp, có thể chạy bằng script/automation, và đủ mạnh để dùng  
> trong quy trình sản xuất thật sự.
>
> **Cách dùng:** Mỗi mục đều có độ ưu tiên và ước tính độ phức tạp.  
> Contributor có thể chọn bất kỳ mục nào để làm. Xem thêm CONTRIBUTING.md.

---

## 🔴 P0 — Critical Foundation (phải làm trước mọi thứ)

### 1. Kiến trúc dữ liệu & Lưu trú (Data Persistence)

| # | Việc cần làm | Độ phức tạp |
|---|---|---|
| 1.1 | Chuyển toàn bộ `editorData` từ Zustand store sang **SQLite + SQLAlchemy** (backend). Mỗi scene, track, action phải là một entity riêng biệt có ID chuẩn UUID. | 🔴 Cao |
| 1.2 | Thiết kế **schema chuẩn** cho Project file. Phải serialize/deserialize hoàn toàn thành JSON/binary. Xem `backend/studio_manager.py` để mở rộng. | 🔴 Cao |
| 1.3 | Thêm endpoint `GET /projects`, `POST /projects`, `PUT /projects/{id}`, `DELETE /projects/{id}` vào `backend/main.py`. | 🟡 Trung bình |
| 1.4 | Tạo **Auto-Save** mỗi 30s. Lưu `draft_project.json` vào thư mục `.autosave/`. | 🟡 Trung bình |
| 1.5 | Implement **Undo/Redo stack** dùng [Immer patches](https://immerjs.github.io/immer/patches/). Tối thiểu 50 bước. | 🔴 Cao |
| 1.6 | Export Project ra file `.animestudio` (zip của JSON + assets), có thể import lại. | 🟡 Trung bình |

### 2. Hệ thống Asset (Asset Pipeline)

| # | Việc cần làm | Độ phức tạp |
|---|---|---|
| 2.1 | Tạo **Asset Hash Registry** chuẩn hóa. Dùng SHA-256 thay vì MD5. Xây dựng bảng `assets` tập trung. | 🟡 Trung bình |
| 2.2 | Hỗ trợ upload **nhiều file PSD cùng lúc** (batch). Background worker queue (dùng `concurrent.futures`). | 🟡 Trung bình |
| 2.3 | Sinh **thumbnail PNG 128x128** cho mỗi asset ngay lúc parse PSD. Lưu vào `assets/thumbnails/`. | 🟡 Trung bình |
| 2.4 | Asset Search & Filter: tìm theo tên, category, z-index, character. | 🟢 Thấp |
| 2.5 | Asset versioning: giữ lịch sử khi PSD được upload lại (cùng hash key). | 🔴 Cao |
| 2.6 | Xóa asset toàn bộ: cascade delete khỏi character + timeline actions. | 🟡 Trung bình |

---

## 🟡 P1 — Timeline Core Features (trung tâm của phần mềm)

### 3. Timeline Engine Nâng Cao

| # | Việc cần làm | Độ phức tạp |
|---|---|---|
| 3.1 | **Multi-scene management**: Mỗi scene có timeline độc lập. Reorder scenes bằng drag-drop. | 🔴 Cao |
| 3.2 | **Frame-accurate seeking**: Mỗi frame tương ứng với một frame PSD nhất định, không phải interpolated. | 🔴 Cao |
| 3.3 | **Layer Blending Modes** trên canvas: Normal, Multiply, Screen, Overlay. | 🟡 Trung bình |
| 3.4 | **Track Groups / Folders**: Gộp nhiều track vào một group, có thể collapse/expand. | 🟡 Trung bình |
| 3.5 | **Nested Compositions mở rộng**: Một character có thể tham chiếu character khác làm sub-layer. | 🔴 Cao |
| 3.6 | **Copy/Paste Timeline Blocks**: Ctrl+C / Ctrl+V cho action blocks, paste đúng vị trí playhead. | 🟢 Thấp |
| 3.7 | **Batch Move**: Chọn nhiều block → kéo toàn bộ sang phải/trái đồng loạt. | 🟢 Thấp |
| 3.8 | **Timeline Markers**: Thêm text label vào bất kỳ frame nào (Chapter Marker). | 🟢 Thấp |
| 3.9 | **In/Out points**: Đặt vùng render (In Point / Out Point) để chỉ export một đoạn nhỏ trong timeline. | 🟡 Trung bình |
| 3.10 | **Speed Ramp**: Thay đổi tốc độ phát lại của một block (0.5x, 2x). | 🔴 Cao |
| 3.11 | **Playback Loop Mode**: Loop toàn bộ, loop selection, ping-pong. | 🟢 Thấp |

### 4. Keyframe & Animation System

| # | Việc cần làm | Độ phức tạp |
|---|---|---|
| 4.1 | **Easing Curves GUI**: Bezier curve editor cho từng keyframe (giống After Effects). | 🔴 Cao |
| 4.2 | **Per-Property Keyframing**: Mỗi thuộc tính (x, y, scale, opacity, rotation) có track keyframe riêng. | 🔴 Cao |
| 4.3 | **Auto-Keyframe Mode**: Bật chế độ auto → mọi thay đổi property đều tự tạo keyframe. | 🟡 Trung bình |
| 4.4 | **Keyframe Copy/Paste**: Ctrl+C keyframe → paste vào frame khác. | 🟢 Thấp |
| 4.5 | **Keyframe Curve: Linear / Ease In / Ease Out / Custom Bezier** cho từng thuộc tính. | 🔴 Cao |
| 4.6 | **Follow Path Animation**: Character/asset di chuyển dọc theo một path vẽ tay. | 🔴 Cao |
| 4.7 | **Motion Blur**: Blur theo hướng chuyển động của asset giữa 2 keyframe. | 🔴 Cao |
| 4.8 | Xuất dữ liệu keyframe ra **JSON chuẩn** có thể import vào After Effects hoặc Blender. | 🟡 Trung bình |

---

## 🟠 P2 — Rendering & Export Pipeline

### 5. Preview Rendering

| # | Việc cần làm | Độ phức tạp |
|---|---|---|
| 5.1 | **WebGL 2 Renderer**: Chuyển canvas render từ 2D Context sang WebGL tăng hiệu năng 10x. | 🔴 Cao |
| 5.2 | **Real-Time Preview**: Chạy playback mượt ≥30fps cho scene ≤5 characters. | 🔴 Cao |
| 5.3 | **Resolution Preview Modes**: 25%, 50%, 100%, 200%. | 🟢 Thấp |
| 5.4 | **Safe Area Overlay**: Hiển thị khung an toàn 16:9 / 9:16 / 1:1 trên canvas. | 🟢 Thấp |
| 5.5 | **Background Color/Gradient/Image** cho canvas khi preview và export. | 🟢 Thấp |

### 6. Export Pipeline (🌟 chạy được bằng script CLI)

| # | Việc cần làm | Độ phức tạp |
|---|---|---|
| 6.1 | **Video Export Engine** dùng `ffmpeg`. Backend nhận request export → render từng frame → ghép video. | 🔴 Cao |
| 6.2 | **Export formats**: MP4 (H.264), WebM (VP9), GIF, APNG, PNG sequence. | 🔴 Cao |
| 6.3 | **CLI Export Script**: `python scripts/export.py --project my_scene.json --format mp4 --fps 24 --out output.mp4`. | 🟡 Trung bình |
| 6.4 | **Headless Render Mode**: Chạy không cần browser, dùng `Pillow` render từng frame → ffmpeg. | 🔴 Cao |
| 6.5 | **Export Queue**: Nhiều project export song song, có progress bar từng job. | 🟡 Trung bình |
| 6.6 | **Sprite Sheet Export**: Render nhiều frame thành một sprite sheet PNG dùng cho game engine. | 🟡 Trung bình |
| 6.7 | **JSON Animation Export**: Export toàn bộ timeline ra JSON để dùng trong PixiJS / Three.js / Babylon.js. | 🟡 Trung bình |
| 6.8 | **After Effects JSX Export**: Sinh file `.jsx` import trực tiếp vào Adobe After Effects. | 🔴 Cao |

---

## 🟢 P3 — Professional UX & Collaboration

### 7. Dressing Room & Asset UX

| # | Việc cần làm | Độ phức tạp |
|---|---|---|
| 7.1 | **Quick-Toggle Asset Visibility** within Dressing Room: nút eye (👁) trên từng slot. | 🟢 Thấp |
| 7.2 | **Character Save Presets**: Lưu một bộ trang phục thành preset có tên. | 🟡 Trung bình |
| 7.3 | **Character Compare View**: Đặt 2 character cạnh nhau để so sánh outfit. | 🟡 Trung bình |
| 7.4 | **Asset Tags**: Gắn tag (summer, battle, casual) cho asset, filter theo tag. | 🟢 Thấp |
| 7.5 | **Randomize Outfit**: Nút Ra-ngẫu-nhiên trang phục. | 🟢 Thấp |
| 7.6 | **Copy Character Style**: Sao chép bộ outfit từ character này sang character khác. | 🟡 Trung bình |

### 8. Studio Timeline UX

| # | Việc cần làm | Độ phức tạp |
|---|---|---|
| 8.1 | **Zoom to Fit**: Nút fit toàn bộ timeline vào màn hình (Shift+F). | 🟢 Thấp |
| 8.2 | **Keyboard Shortcuts panel**: Hiện bảng shortcuts (phím `?`). | 🟢 Thấp |
| 8.3 | **Minimap Timeline**: Một thanh nhỏ hiển thị toàn bộ timeline, dùng để navigate nhanh. | 🟡 Trung bình |
| 8.4 | **Track Rename**: Double-click tên track để đổi tên ngay tại chỗ. | 🟢 Thấp |
| 8.5 | **Track Color Coding**: Chọn màu riêng cho từng track. | 🟢 Thấp |
| 8.6 | **Lock Track**: Khóa track để không cho chỉnh sửa nhầm. | 🟢 Thấp |
| 8.7 | **Timeline Scrubbing Preview**: Khi kéo playhead, preview cập nhật real-time. | 🟡 Trung bình |
| 8.8 | **Drag Block to new Track**: Kéo action block sang track khác hoặc tạo track mới bằng drag. | 🟡 Trung bình |
| 8.9 | **Waveform Display** (nếu có audio track): Hiện sóng âm trong track bar. | 🔴 Cao |
| 8.10 | **Grid Snapping**: Snap chính xác theo grid FPS (1/24s, 1/30s). | 🟡 Trung bình |

### 9. Scripting & Automation (🌟 Tính năng mạnh nhất)

| # | Việc cần làm | Độ phức tạp |
|---|---|---|
| 9.1 | **Python Scripting API**: `from animestudio import Project, Scene, Track, Action` → Tạo animation hoàn toàn bằng Python script. | 🔴 Cao |
| 9.2 | **Batch Scene Generator**: Script tạo hàng trăm scene từ CSV/JSON data đầu vào. | 🟡 Trung bình |
| 9.3 | **Template System**: Lưu scene thành template, áp dụng cho nhiều character khác nhau. | 🟡 Trung bình |
| 9.4 | **WebSocket Live Preview API**: Script bên ngoài push update vào studio đang mở qua WS. | 🔴 Cao |
| 9.5 | **REST API hoàn chỉnh** để điều khiển studio từ công cụ ngoài (Postman, curl, CI/CD). | 🟡 Trung bình |
| 9.6 | **Plugin System**: Cho phép load plugin `.py` vào backend để mở rộng chức năng. | 🔴 Cao |
| 9.7 | **Node-based Visual Scripting**: Graph editor cho logic animation (giống Blender Geometry Nodes). | 🔴 Cực cao |

Ví dụ script API mẫu:

```python
# scripts/generate_scene.py
from animestudio.api import Project, Scene, Track, Action, export

proj = Project.load("my_project.as")
scene = proj.scenes.create("Episode 1 - Intro")

char_a = scene.tracks.add_character("Sakura", character_id="char_001")
char_b = scene.tracks.add_character("Naruto", character_id="char_002")

# Đặt keyframe di chuyển
char_a.actions[0].keyframes.set(time=0, x=100, y=300)
char_a.actions[0].keyframes.set(time=2.5, x=600, y=300, easing="ease_in_out")

# Kéo thời lượng action
char_b.actions[0].set_range(start=1.0, end=5.0)

export(scene, format="mp4", fps=24, resolution=(1920, 1080), output="ep1_intro.mp4")
```

---

## 🔵 P4 — Collaboration & Cloud

### 10. Multi-User & Real-Time Collaboration

| # | Việc cần làm | Độ phức tạp |
|---|---|---|
| 10.1 | User Authentication: JWT + refresh tokens. Role: Admin / Editor / Viewer. | 🟡 Trung bình |
| 10.2 | **Shared Projects**: Share project URL với quyền edit/view. | 🟡 Trung bình |
| 10.3 | **Real-Time Multiplayer Edit** dùng CRDT (Conflict-free Replicated Data Type) + WebSocket. | 🔴 Cực cao |
| 10.4 | **Comment System**: Thêm comment vào từng frame cụ thể trong timeline. | 🟡 Trung bình |
| 10.5 | **Asset Library Sharing**: Thư viện asset công khai chia sẻ giữa nhiều user. | 🟡 Trung bình |
| 10.6 | Activity Log: Xem ai đã chỉnh sửa gì lúc nào trong project. | 🟡 Trung bình |

### 11. Cloud Infrastructure

| # | Việc cần làm | Độ phức tạp |
|---|---|---|
| 11.1 | **Docker Compose**: Container hóa backend + frontend. `docker-compose up` là xong. | 🟡 Trung bình |
| 11.2 | **S3-compatible Asset Storage**: Lưu asset vào MinIO (self-hosted) hoặc AWS S3. | 🟡 Trung bình |
| 11.3 | **Render Farm Integration**: Phân tán render job ra nhiều worker node (Celery + Redis). | 🔴 Cao |
| 11.4 | **CDN cho Assets**: Serve asset qua CloudFront / Cloudflare cho production. | 🟡 Trung bình |
| 11.5 | **Backup & Restore**: Tự động backup toàn bộ dữ liệu ra S3 hằng ngày. | 🟡 Trung bình |

---

## ⚙️ P5 — Testing, Quality & DevOps

### 12. Automated Testing

| # | Việc cần làm | Độ phức tạp |
|---|---|---|
| 12.1 | **Backend Unit Tests** (pytest): Cover tối thiểu 80% các endpoint. | 🟡 Trung bình |
| 12.2 | **Frontend Unit Tests** (Vitest): Cover các hook quan trọng (`use-editor`, `use-element-interaction`). | 🟡 Trung bình |
| 12.3 | **E2E Tests** (Playwright): Test các flow chính: upload PSD → organize → dressing room → studio → export. | 🔴 Cao |
| 12.4 | **Regression Tests**: Đảm bảo mọi lần refactor không phá vỡ tính năng cũ. | 🟡 Trung bình |
| 12.5 | **Performance Benchmarks**: Test thời gian render frame với 1, 5, 10, 20 character. | 🟡 Trung bình |
| 12.6 | **Script Tests**: Mỗi script automation có test riêng (`tests/scripts/`). | 🟡 Trung bình |

### 13. Developer Experience (DX)

| # | Việc cần làm | Độ phức tạp |
|---|---|---|
| 13.1 | `scripts/dev.sh`: Một lệnh duy nhất start cả backend + frontend trong dev mode. | 🟢 Thấp |
| 13.2 | `scripts/seed.py`: Seed dữ liệu mẫu (characters, scenes, assets) cho dev/testing. | 🟢 Thấp |
| 13.3 | `scripts/lint.sh`: Chạy ESLint + Prettier (FE) + ruff + mypy (BE) một lệnh. | 🟢 Thấp |
| 13.4 | `scripts/build.sh`: Build production bundle + Docker image đầy đủ. | 🟡 Trung bình |
| 13.5 | `scripts/migrate.py`: Database migration runner (Alembic tích hợp). | 🟡 Trung bình |
| 13.6 | GitHub Actions CI: Tự động chạy lint + test khi push PR. | 🟡 Trung bình |
| 13.7 | Pre-commit hooks: Chặn commit nếu code bị lỗi lint/typecheck. | 🟢 Thấp |
| 13.8 | Tài liệu API tự động (FastAPI `/docs` + `/redoc`) luôn up to date. | 🟢 Thấp |

---

## 🎨 P6 — Advanced Features (tương lai xa)

### 14. AI-Assisted Tools

| # | Việc cần làm | Độ phức tạp |
|---|---|---|
| 14.1 | **AI Auto-Lip Sync**: Phân tích file audio → tự động map miệng character vào timeline. | 🔴 Cực cao |
| 14.2 | **AI Background Remover**: Tự động xóa nền khi upload asset. | 🟡 Trung bình |
| 14.3 | **AI Motion Prediction**: Đề xuất keyframe tiếp theo dựa trên pattern hiện tại. | 🔴 Cực cao |
| 14.4 | **Text-to-Animation**: Nhập prompt tiếng Việt → AI tạo timeline animation cơ bản. | 🔴 Cực cao |
| 14.5 | **Smart Asset Categorization**: AI tự gán category khi upload PSD layer. | 🟡 Trung bình |

### 15. Audio System

| # | Việc cần làm | Độ phức tạp |
|---|---|---|
| 15.1 | **Audio Track**: Import MP3/WAV làm soundtrack trong timeline. | 🟡 Trung bình |
| 15.2 | **Audio Trim & Fade**: Trim audio clip, fade in/out. | 🟡 Trung bình |
| 15.3 | **Sound Effects Library**: Thư viện SFX tích hợp sẵn. | 🟢 Thấp |
| 15.4 | **Audio Sync Lock**: Ghim SFX vào một block nhất định, tự di chuyển khi block di chuyển. | 🔴 Cao |

### 16. Specialized Anime Features

| # | Việc cần làm | Độ phức tạp |
|---|---|---|
| 16.1 | **Dialogue Bubble Tool**: Thêm bong bóng thoại với font tùy chỉnh vào từng frame. | 🟡 Trung bình |
| 16.2 | **Transition Effects**: Fade, Wipe, Slide giữa các scene. | 🟡 Trung bình |
| 16.3 | **Particle Effects**: Hiệu ứng hạt (cherry blossom, sparkles, rain) overlay lên canvas. | 🔴 Cao |
| 16.4 | **Expression System**: Sắp xếp nhanh set biểu cảm mặt (happy, sad, angry) theo phím tắt. | 🟡 Trung bình |
| 16.5 | **IK Rigging**: Inverse Kinematics cho tay/chân để tạo animation tự nhiên hơn. | 🔴 Cực cao |
| 16.6 | **Storyboard Mode**: Layout comic/manga từ nhiều scene snapshot. | 🟡 Trung bình |

---

## 📋 Script Reference Index

File tất cả script kế hoạch nằm trong `scripts/`:

```
scripts/
├── dev.sh                  # Start toàn bộ dev environment
├── build.sh                # Build production
├── lint.sh                 # Lint tất cả code
├── test.sh                 # Chạy toàn bộ test suite
├── seed.py                 # Seed data cho development
├── migrate.py              # Database migrations
├── export.py               # CLI export: scene → video/gif/png-sequence
├── batch_export.py         # Export nhiều project từ CSV
├── generate_scene.py       # Tạo scene bằng Python API
├── import_psd.py           # CLI import PSD và tự categorize
├── benchmark.py            # Performance benchmarks
└── cleanup.py              # Xóa asset thừa, orphan records
```

---

## 📊 Priority Summary

| Priority | Khu vực | Ước tính |
|---|---|---|
| 🔴 P0 | Data Persistence, Undo/Redo, Asset Pipeline | 3–4 tháng |
| 🟡 P1 | Timeline Engine, Keyframe System | 2–3 tháng |
| 🟠 P2 | Rendering, Export CLI | 2–3 tháng |
| 🟢 P3 | UX Polish, Scripting API | 1–2 tháng |
| 🔵 P4 | Collaboration, Cloud | 3–4 tháng |
| ⚙️ P5 | Testing, DevOps | ongoing |
| 🎨 P6 | AI, Audio, Anime Features | 6+ tháng |

---

## 🤝 Cách đóng góp

Xem chi tiết tại `CONTRIBUTING.md`. Tóm tắt nhanh:

1. Chọn một mục trong roadmap này.
2. Tạo branch: `feature/timeline-undo-redo` hoặc `fix/asset-dedup`.
3. Đọc `CONTRIBUTING.md` để biết coding convention.
4. Mở PR, link đến mục roadmap tương ứng.

---

*Cập nhật lần cuối: 2026-02-27. Maintainer: @khoatuan2006-eng*
