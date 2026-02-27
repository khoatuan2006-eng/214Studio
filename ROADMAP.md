# AnimeStudio — Professional Upgrade Roadmap (V2: Architecture Refocus)

> **Mục đích:** Tài liệu này liệt kê đầy đủ tất cả những cải tiến cần thiết  
> để nâng Anime Studio từ một công cụ prototype lên một phần mềm animation  
> chuyên nghiệp, có thể chạy bằng script/automation, và đủ mạnh để dùng  
> trong quy trình sản xuất thật sự.
>
> **Lịch sử:** Bản Roadmap cũ đã được dọn dẹp (các mục 10/10 đã bị phi tang). 
> Hiện tại, ưu tiên hàng đầu là **Architecture Refactor** (xem `WAKEUP_CALL_V2_TECH_LEAD.md`).
>
> **Cách dùng:** Mỗi mục đều có độ ưu tiên và ước tính độ phức tạp.  
> Contributor có thể chọn bất kỳ mục nào để làm.

> [!IMPORTANT]
> ### 📝 Quy tắc bắt buộc cho Contributor
> 
> Khi hoàn thành bất kỳ mục nào trong roadmap, contributor **BẮT BUỘC** phải ghi lại thông tin vào phần `<details>` tương ứng theo mẫu sau:
> 
> **1. Đã làm gì** — Liệt kê cụ thể các file đã tạo/sửa, tính năng đã implement.  
> **2. Cách hoạt động** — Mô tả ngắn gọn flow hoạt động để người sau hiểu nhanh.  
> **3. Tự đánh giá** — Chấm điểm trên thang 10. (Các task đánh giá 10/10 sau khi tôi review sẽ được XÓA khỏi đây để giữ file sạch sẽ).  
> **4. Người đóng góp** — Ghi rõ `contributor #N` và tên/alias.  
> **5. Hạn chế / Gợi ý cho người sau** — Những gì chưa làm được, edge cases.

---

## 🚨 P0 — ARCHITECTURE REFACTOR (Sống còn)

> **Nhận xét từ Tech Lead:** "Hệ thống vỡ vụn từ bên trong. Zustand đang gánh quá nhiều, Data đang quá sâu, và Undo/Redo tốn quá nhiều RAM. Dừng vẽ feature mới, quay lại sửa móng ngay lập tức!"

| # | Việc cần làm (Refactor) | Trạng thái |
|---|---|---|
| 0.1 | **Tách Transient State khỏi Zustand** | ✅ **HOÀN THÀNH** (Tech Lead: 9/10) |
| 0.2 | **Normalize `editorData`** | ⚠️ Infrastructure only — chưa integrate |
| 0.3 | **Command Pattern Undo/Redo** | ⚠️ Hook wired nhưng không có command nào được push |
| 0.4 | **Đẩy Logic về Backend** | ❌ Chưa bắt đầu |

---

### ✅ 0.1 — Tách Transient State (DONE — Tech Lead Approved 9/10)

> 🦅 **TECH LEAD VERDICT:** Tôi grep cả codebase. `useTransientSnapshot()` THỰC SỰ được import ở **5 consumer files**: `StudioMode.tsx`, `use-editor.ts`, `timeline/index.tsx`, `timeline-toolbar.tsx`, và re-export qua `useAppStore.ts`. `temporal()` middleware đã bị XÓA SẠCH khỏi `useAppStore`. Animation loop 60fps giờ chỉ re-render `PlayheadTimeDisplay`, KHÔNG re-render toàn bộ tree nữa.
> 
> **Score: 9/10.** Đúng như tự đánh giá. Mục này có thể xóa ở sprint sau khi đã stable 2 tuần.

**Còn lại cần làm:**
- Selection state (`selectedElements`) vẫn dùng module-level variable trong `use-editor.ts` — nên chuyển sang Valtio để consistency.

---

### ⚠️ 0.2 — Normalize `editorData` (Infrastructure Only — Tech Lead: 3/10)

> 🦅 **TECH LEAD REVIEW:** Lại dính bài cũ rồi các bạn ơi! Viết framework xong rồi... bỏ đó.
> 
> **Bằng chứng từ codebase:**
> - `useEditorDataStore` — **KHÔNG ĐƯỢC IMPORT Ở BẤT CỨ ĐÂU** ngoài file khai báo.
> - `startEditorDataSync()` — **KHÔNG ĐƯỢC GỌI Ở BẤT CỨ ĐÂU**. Không có file nào gọi hàm này. Sync engine BẤT HOẠT. Normalized store mãi mãi rỗng.
> - `use-editor.ts` vẫn dùng `.find()` truyền thống trên mảng lồng nhau. O(N) lookup y hệ cũ.
> 
> **Tự chấm 8/10 khi chưa có consumer nào dùng = ảo.**
> **Score thực tế: 3/10** (Code chất lượng tốt nhưng là dead code 100%).
>
> **Việc cần làm để đạt 8/10 thật:**
> 1. Gọi `startEditorDataSync()` trong `App.tsx` hoặc `main.tsx` khi mount.
> 2. Chuyển **ít nhất** `use-editor.ts` → dùng `useEditorDataStore.getTrack()` thay vì `editorData.find()`.
> 3. Chuyển `StudioMode.tsx` render loop → đọc từ normalized store thay vì raw `editorData`.

---

### ⚠️ 0.3 — Command Pattern Undo/Redo (Skeleton Only — Tech Lead: 4/10)

> 🦅 **TECH LEAD REVIEW:** Framework tuyệt đẹp. 9 command factories viết sạch sẽ. `useSyncExternalStore` cho reactive undo/redo badges — giỏi. NHƯNG:
> 
> **Bằng chứng từ codebase:**
> - `commandHistory.execute()` — **KHÔNG ĐƯỢC GỌI Ở BẤT CỨ ĐÂU** ngoài `useUndoRedo.ts` (chỉ expose, không ai gọi).
> - `useUndoRedo()` có đăng ký Ctrl+Z → nhưng `commandHistory.undo()` fire vào... **STACK RỖNG**. Không bao giờ có command nào được push vào stack!
> - `use-editor.ts` (nơi mutations thực sự xảy ra: moveElement, splitElement, resize, addKeyframe...) — **KHÔNG IMPORT `commandHistory`** hay bất cứ command factory nào.
> - Nghĩa là: User nhấn Ctrl+Z → Không gì xảy ra. Undo "không lỗi" nhưng cũng "không làm gì".
> 
> **Tự chấm 8/10 khi undo hoàn toàn bất hoạt trên UI = ảo.**
> **Score thực tế: 4/10** (Infrastructure excellent, integration = zero).
> 
> **Việc cần làm để đạt 8/10 thật:**
> 1. Trong `use-editor.ts`, wrap MỌI mutation (moveElement, resizeElement, addAction, deleteAction, addKeyframe...) bằng `commandHistory.execute(createXxxCommand(...))`.
> 2. Test thủ công: kéo keyframe → Ctrl+Z → keyframe phải quay lại vị trí cũ.
> 3. Xóa `zundo` khỏi `package.json` dependencies (đã remove code nhưng chưa remove package).

---

### ❌ 0.4 — Đẩy Logic về Backend (Chưa bắt đầu)

| Việc cần làm | Độ phức tạp |
|---|---|
| Frontend không tự lo check trùng asset hash hay tính toán save data nữa. Gửi payload "Cần tạo action X", Server tính toán và trả về State chuẩn nhất. | 🟡 Trung bình |

---

## 🔴 P1 — Data & Foundation

### 1. Database & Lifecycle

| # | Việc cần làm | Độ phức tạp |
|---|---|---|
| 1.1 | **Alembic Migration**: Tích hợp tool migrate DB cho backend để không cần xóa DB mỗi khi đổi schema. | 🟡 Trung bình |
| 1.2 | **Timeline Entity Setup**: Chuyển cột `data` (JSON blob) trong SQLite thành các bảng `scenes`, `tracks`, `actions` riêng lẻ để có thể query/filter. | 🔴 Cao |
| 1.3 | **Auto-save Recovery UI**: Backend đã lưu draft, nhưng Frontend cần hiện popup hỏi "Khôi phục phiên làm việc trước?" khi mở project mới/chưa save. | 🟢 Thấp |

### 2. Hệ thống Asset

| # | Việc cần làm | Độ phức tạp |
|---|---|---|
| 2.1 | **Asset Versioning Logic**: Khi upload PSD đã tồn tại (check hash), code phải tạo version mới trong DB và giữ lịch sử. (Schema đã có, chưa code route). | 🔴 Cao |
| 2.2 | **Batch Upload Progress (WebSocket)**: Báo tiến trình xử lý batch upload PSD (File 1/5...) về Frontend realtime. | 🟡 Trung bình |
| 2.3 | **Thumbnail Integration**: Frontend hiện danh sách asset (Library) bằng URL thumbnail 128x128 thay vì tải full size PNG gốc. | 🟢 Thấp |
| 2.4 | **Soft Delete & Trash Bin**: Xóa asset chỉ đánh cờ `is_deleted=True` ở Database, tạo UI thùng rác để khôi phục. | 🟡 Trung bình |

---

## 🟡 P2 — Timeline Engine Nâng Cao

### 3. Timeline Management

| # | Việc cần làm | Độ phức tạp |
|---|---|---|
| 3.1 | **Multi-scene management**: Mỗi scene có timeline độc lập. Reorder scenes bằng drag-drop. | 🔴 Cao |
| 3.2 | **Track Groups / Folders**: Gộp nhiều track vào một group, có thể collapse/expand. | 🟡 Trung bình |
| 3.3 | **Nested Compositions**: Một character có thể tham chiếu character khác làm sub-layer. | 🔴 Cao |
| 3.4 | **Speed Ramp**: Thay đổi tốc độ phát lại của một action block (0.5x, 2x). | 🔴 Cao |
| 3.5 | **Layer Blending UI Persist**: Menu Blending (Multiply, Screen) đã có ở UI nhưng cần persist state vào `editorData` để lưu lại (hiện reset khi reload). | 🟢 Thấp |

### 4. Keyframe & Automation

| # | Việc cần làm | Độ phức tạp |
|---|---|---|
| 4.1 | **Easing Curves GUI**: Bezier curve editor UI cho từng keyframe (giống After Effects Graph Editor). | 🔴 Cao |
| 4.2 | **Follow Path Animation**: Character/asset di chuyển dọc theo một path vector vẽ tay. | 🔴 Cao |
| 4.3 | **Motion Blur**: Real-time motion blur định hướng tự động tính toán theo tốc độ chuyển động di chuyển giữa 2 keyframe. | 🔴 Cực cao |

---

## 🟠 P3 — Rendering & UX

### 5. Rendering Pipeline

| # | Việc cần làm | Độ phức tạp |
|---|---|---|
| 5.1 | **WebGL 2/WebGPU Renderer**: Chuyển Konva canvas render từ 2D Context sang WebGL shader để bứt tốc render (nhất là khi scale to). | 🔴 Cao |
| 5.2 | **Resolution Preview Modes**: Dropdown chọn chất lượng khung nhìn 25%, 50%, 100% để tối ưu RAM cho máy yếu. | 🟢 Thấp |
| 5.3 | **Safe Area Overlay**: Toggle overlay khung an toàn (title safe/action safe) 16:9 / 9:16 trên canvas. | 🟢 Thấp |

### 6. Dressing Room UX

| # | Việc cần làm | Độ phức tạp |
|---|---|---|
| 6.1 | **Quick-Toggle Asset Visibility** within Dressing Room: nút eye (👁) trên từng slot. | 🟢 Thấp |
| 6.2 | **Character Save Presets**: Lưu một bộ trang phục mix-match thành preset có tên để tái sử dụng. | 🟡 Trung bình |
| 6.3 | **Character Compare View**: Split screen đặt 2 character/pose cạnh nhau để so sánh. | 🟡 Trung bình |

### 7. Studio Timeline UX

| # | Việc cần làm | Độ phức tạp |
|---|---|---|
| 7.1 | **Keyboard Shortcuts Panel & Manager**: Bảng phím tắt (hiện khi bấm `?`) + UI cho phép user config đổi phím. | 🟡 Trung bình |
| 7.2 | **Minimap Timeline**: Thanh tổng quan thu nhỏ (scroll map) phía trên timeline để dễ theo dõi project có length dài. | 🟡 Trung bình |
| 7.3 | **Grid Snapping**: Magnet/Snapping khi kéo block vào đúng vạch grid FPS (1/24s). | 🟡 Trung bình |

---

## ⚙️ P4 — Trust & Verification (TESTING)

> **Nhận xét từ Tech Lead:** "Từ giờ mọi Pull Request nắn lại logic phải đi kèm Unit/E2E test. Không có chuyện 'TypeScript 0 errors = code chạy đúng' nữa!"

| # | Việc cần làm (Lấy lại niềm tin) | Độ phức tạp |
|---|---|---|
| 8.1 | **Zustand Unit Tests (Vitest)**: Test các reducer mutations. Truyền `editorData` mock vào và expect output chuẩn. | 🟡 Trung bình |
| 8.2 | **Backend API Tests (pytest)**: Setup test client, cover tối thiểu 80% các endpoints chính. | 🟡 Trung bình |
| 8.3 | **Component Tests (RTL)**: Test render và click logic của Timeline Tracks và Auto-keyframe button. | 🟡 Trung bình |
| 8.4 | **E2E Playwright**: Giả lập click chuột upload PSD -> tạo track -> set keyframe -> export. Automation flow trọn gói. | 🔴 Cao |

---

## 📋 Script Reference Index

File tất cả script kế hoạch nằm trong `scripts/`:

```
scripts/
├── migrate_md5_to_sha256.py # ✅ DONE: Script migrate asset hash cũ
├── generate_scene.py        # ✅ DONE: Tạo scene bằng Python API
├── batch_generate.py        # ✅ DONE: Auto gen nhiều projects
├── dev.sh                   # Start dev env
├── test.sh                  # Chạy Toàn bộ Test Suite
└── benchmark.py             # Performance testing (WebGPU / Canvas2D)
```

---

*Cập nhật lần cuối: 2026-02-27. Maintainer: @khoatuan2006-eng*
