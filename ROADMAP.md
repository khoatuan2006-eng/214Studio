# AnimeStudio — Professional Upgrade Roadmap

> **Mục đích:** Tài liệu này liệt kê đầy đủ tất cả những cải tiến cần thiết  
> để nâng Anime Studio từ một công cụ prototype lên một phần mềm animation  
> chuyên nghiệp, có thể chạy bằng script/automation, và đủ mạnh để dùng  
> trong quy trình sản xuất thật sự.
>
> **Cách dùng:** Mỗi mục đều có độ ưu tiên và ước tính độ phức tạp.  
> Contributor có thể chọn bất kỳ mục nào để làm.

> [!IMPORTANT]
> ### 📝 Quy tắc bắt buộc cho Contributor
> Khi hoàn thành bất kỳ mục nào trong roadmap, contributor **BẮT BUỘC** phải ghi lại thông tin vào phần `<details>` tương ứng theo tiêu chuẩn Tech Lead. Tuy nhiên, sau mỗi giai đoạn nước rút (Sprint), Tech Lead sẽ **dọn dẹp (prune)** các mục đã hoàn thành xuất sắc để giữ Roadmap luôn sạch và tập trung vào mục tiêu tương lai.

---

## 🦅 [TECH LEAD REVIEW] Tầm Nhìn Giai Đoạn 2 (2026-02-27)

> **Nhận xét từ Tech Lead:** "Tôi vừa dọn dẹp lại toàn bộ Roadmap. Những tính năng cơ bản các cậu đã làm rất tốt (10/10 cho các đợt fix vừa rồi). Các mục đã xong tôi gạch bỏ hết.
> 
> Tuy nhiên, đừng ngủ quên trên chiến thắng. Những gì các cậu làm mới chỉ là 'chạy được'. Để cạnh tranh với các tool chuyên nghiệp như Spine2D hay After Effects, chúng ta phải đẩy chuẩn mực lên mức **Cực Hạn**. Tôi bổ sung thêm các mục về UX và Tối ưu hóa ở mức độ Hardcore. Đây mới là challenge thực sự!"

---

## 🔴 P0 — Critical Foundation (Kiến trúc lõi chưa hoàn thiện)

Dù đã có database và API, hệ thống lõi vẫn còn những mảnh ghép bắt buộc phải làm để chạy Production an toàn.

| # | Việc cần làm | Độ phức tạp |
|---|---|---|
| 1.1 | **Alembic Database Migration**: Hiện đổi schema phải xóa DB — tuyệt đối cấm trong production. Cần setup Alembic ngay. | 🟡 Trung bình |
| 1.2 | **Asset Versioning Logic**: Schema DB đã có nhưng chưa có code Python xử lý lưu version khi re-upload PSD. | 🟡 Trung bình |
| 1.3 | **Auto-save Recovery UX**: Backend có Autosave, nhưng Frontend chưa có modal màn hình chính hỏi user *"Bạn có bản nháp chưa lưu, có muốn khôi phục không?"* khi crash/tắt trình duyệt. | 🟢 Thấp |
| 1.4 | **Batch Insert Optimization**: `psd_processor.py` hiện mở 1 session/layer, làm hẹp cổ chai I/O. Phải gom thành bulk insert/batch commit. | 🟡 Trung bình |
| 1.5 | **WebSocket Progress Reporting**: Batch PSD/Video rendering đang mù thông tin. Phải có WS push tiến độ 0-100% realtime cho client. | 🔴 Cao |

---

## 🟡 P1 — Timeline Engine Nâng Cao

| # | Việc cần làm | Độ phức tạp |
|---|---|---|
| 3.1 | **Multi-scene management**: Mỗi scene có timeline độc lập. Reorder scenes bằng drag-drop. | 🔴 Cao |
| 3.2 | **Frame-accurate seeking**: Chơi đúng từng frame ảnh thực tế, loại bỏ interpolation ảo lúc dừng. | 🔴 Cao |
| 3.4 | **Track Groups / Folders**: Nhóm hàng chục track lại, collapse/expand cho gọn UI. | 🟡 Trung bình |
| 3.5 | **Nested Compositions**: Một character/scene làm sub-layer cho scene khác (như Pre-comp của After Effects). | 🔴 Cực cao |
| 3.10 | **Speed Ramp**: Kéo giãn thời gian action block làm chậm/nhanh (Time Remapping). | 🔴 Cao |
| 4.6 | **Follow Path Animation**: Vẽ đường Bezier trên màn hình, asset chạy theo đường đó quanh canvas. | 🔴 Cao |
| 4.7 | **Motion Blur**: Blur vector khi playhead chạy qua đoạn tweening tốc độ cao. | 🔴 Cao |

---

## 🟠 P2 — Rendering, Export & Hiệu năng Cực hạn

*(Mới được cập nhật bởi Tech Lead)*

| # | Việc cần làm | Độ phức tạp |
|---|---|---|
| 5.1 | **DOM Virtualization cho Timeline**: Timeline 10 phút chứa hàng ngàn DOM nodes sẽ làm treo Chrome. Phải virtualize (chỉ render nodes đang hiển thị trên màn hình). | 🔴 Cao |
| 5.2 | **IndexedDB Asset Cache**: Fetch file PNG liên tục khiến mạng lag. Cần cache Blob trực tiếp vào IndexedDB ở client-side để load instantaneous. | 🔴 Cao |
| 5.3 | **WASM Interpolation Core**: Đưa toàn bộ toán học nội suy (easing, transform matrix) viết bằng Rust/C++ compile ra WebAssembly. Main thread JS chỉ lo UI. | 🔴 Cực cao |
| 5.4 | **WebGPU/WebGL 2 Renderer**: Bỏ HTML Canvas 2D API. Tự render shader để lấy performance x10. | 🔴 Cực cao |
| 6.2 | **Export formats**: Thuật toán render thẳng ra WebM (VP9), APNG, GIF chất lượng cao có alpha channel. | 🔴 Cao |
| 6.4 | **Headless Render Mode**: Chạy render farm trên server không cần browser (Pillow/Puppeteer). | 🔴 Cao |

---

## 🟣 P3 — Professional UX & Automation

*(Mới được bổ sung bởi Tech Lead)*

| # | Việc cần làm | Độ phức tạp |
|---|---|---|
| 7.1 | **Command Palette (Ctrl+K)**: Thanh search Spotlight làm mọi thao tác: tìm asset, đổi công cụ, export, không cần mò menu. | 🟡 Trung bình |
| 7.2 | **Dockable Workspace**: Kéo thả, chia lô các cửa sổ (Timeline, Canvas, Inspector) giống hệt VSCode/Premiere. Dùng thư viện `flexlayout-react`. | 🔴 Cao |
| 7.3 | **Smart Snapping & Guides**: Khi kéo asset trên canvas, tự động bật chớp tia hồng tâm bắt dính (snap) lưới, góc cạnh tài sản khác (như Figma/Illustrator). | 🔴 Cao |
| 9.3 | **Template System**: Lưu cảnh thành mẫu, click phát ăn luôn 1 template cho char khác. | 🟡 Trung bình |
| 9.4 | **WebSocket Live Preview API**: Script Python gọi tới đâu, trình duyệt cập nhật hình ảnh trực tiếp tới đó (Live Bind). | 🔴 Cao |
| 9.6 | **Plugin System**: Cho phép user viết script tính năng nhỏ nhúng thẳng vào giao diện Studio. | 🔴 Cực cao |
| 9.7 | **Node-based Visual Scripting**: Kéo nối các node tĩnh/động thay vì viết code (Blender style). | 🔴 Cực cao |

*(Lưu ý: Mục Dressing Room 7.1-7.6 và Studio UX 8.1-8.10 đang ở mốc ưu tiên trung bình, gộp chung vào P3)*

---

## 🔵 P4 — Collaboration & Cloud

| # | Việc cần làm | Độ phức tạp |
|---|---|---|
| 10.1 | User Authentication: JWT + refresh tokens. Role: Admin / Editor / Viewer. | 🟡 Trung bình |
| 10.2 | **Shared Projects**: Share project URL với quyền edit/view. | 🟡 Trung bình |
| 10.3 | **Real-Time Multiplayer Edit** dùng CRDT (Yjs) + WebSocket (như Figma). | 🔴 Cực cao |
| 11.1 | **Docker Compose**: Container hóa backend + frontend. `docker-compose up` là xong. | 🟡 Trung bình |
| 11.2 | **S3-compatible Asset Storage**: Bỏ local storage, đổi upload sang AWS S3 / MinIO. | 🟡 Trung bình |
| 11.3 | **Render Farm Integration**: Node worker cluster bằng Celery + Redis. | 🔴 Cao |

---

## ⚙️ P5 — Testing, Quality & DevOps

| # | Việc cần làm | Độ phức tạp |
|---|---|---|
| 12.1 | **Backend Unit Tests** (pytest): Cover tối thiểu 80% các endpoint. | 🟡 Trung bình |
| 12.3 | **E2E Tests** (Playwright): Tự động test flow người dùng từ upload tới export video. | 🔴 Cao |
| 12.4 | **Performance Benchmarks**: Test frame budget (phải lọt < 16.6ms) với 20 characters. | 🟡 Trung bình |
| 13.4 | `scripts/build.sh`: Tự build production bundle + Docker images. | 🟡 Trung bình |
| 13.6 | GitHub Actions CI: Tự động chạy lint + test khi push PR. | 🟡 Trung bình |

---

## 🎨 P6 — Advanced Features (Tương lai xa)

| # | Việc cần làm | Độ phức tạp |
|---|---|---|
| 14.1 | **AI Auto-Lip Sync**: Wav -> Miệng nhép theo tự động. | 🔴 Cực cao |
| 14.2 | **AI Background Remover**: Mức độ pixel-perfect segmentation (dùng SAM model). | 🔴 Cao |
| 15.1 | **Audio Track**: Import & vẽ sóng âm (Waveform) dưới timeline. | 🔴 Cao |
| 15.4 | **Audio Sync Lock**: Ghim SFX dính vào khối hành động. | 🔴 Cao |
| 16.5 | **IK Rigging**: Bone & Inverse Kinematics thuần 2D. | 🔴 Cực cao |

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

## 🤝 Cách đóng góp

Xem chi tiết tại `CONTRIBUTING.md`. Tóm tắt nhanh:
1. Chọn một mục trong roadmap này.
2. Tạo branch: `feature/timeline-undo-redo` hoặc `fix/asset-dedup`.
3. Đọc `CONTRIBUTING.md` để biết coding convention.
4. Mở PR, link đến mục roadmap tương ứng.

---

*Cập nhật lần cuối: 2026-02-27. Maintainer: @khoatuan2006-eng*
