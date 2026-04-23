# 🔍 Rà Soát UI/UX — AnimeStudio Frontend

Dựa trên phân tích toàn bộ cấu trúc `StudioMode.tsx` (790 dòng, 7 component con inline) và 18 file editor, dưới đây là kết luận.

---

## 🗑️ PHẦN DƯ THỪA — Nên xoá/gộp

### 1. `QuickActionsBar.tsx` — **FILE CHẾT** (7KB)
- **Bằng chứng**: Import ở [StudioMode.tsx:21](file:///d:/AnimeStudio_Project/frontend-react/src/components/studio/editor/StudioMode.tsx#L21) nhưng **KHÔNG BAO GIỜ render** trong JSX.
- Chức năng (Flip, Pose cycle, Z-index) đã được tích hợp vào `SceneGraphPropertiesPanel` từ session trước.
- **Đề xuất**: Xoá file + xoá dòng import.

### 2. `PropertiesPanel.tsx` — **LEGACY THỪA** (24KB)
- Chỉ render trong chế độ Legacy ([StudioMode.tsx:305](file:///d:/AnimeStudio_Project/frontend-react/src/components/studio/editor/StudioMode.tsx#L305)).
- Chế độ Legacy mặc định **KHÔNG bật** (dòng 523: `useState('scene')`).
- Bị thay thế hoàn toàn bởi `SceneGraphPropertiesPanel` (40KB) trong chế độ Scene Graph.
- **Đề xuất**: Giữ lại nhưng đánh dấu deprecated. Nếu bạn không còn dùng legacy PSD workflow thì xoá luôn.

### 3. Chế độ **Legacy/Scene Graph Toggle** — **NHẦM LẪN UX**
- Top bar có nút **"Legacy" / "Scene Graph"** ([StudioMode.tsx:680-704](file:///d:/AnimeStudio_Project/frontend-react/src/components/studio/editor/StudioMode.tsx#L680-L704)).
- Người dùng mới sẽ không hiểu "Legacy mode" là gì. Bấm vào là toàn bộ canvas, sidebar, timeline đều đổi sang hệ thống cũ — rất dễ gây hoang mang.
- **Đề xuất**: Ẩn toggle này đi (hoặc chuyển vào Settings). Mặc định chỉ hiện Scene Graph.

### 4. Tab **"Nodes"** vs Tab **"Edit"** — **TRÙNG CHỨC NĂNG**
- Tab "Nodes" → render `NodeInspector` (17KB): hiện danh sách node + inline controls
- Tab "Edit" → render `SceneGraphPropertiesPanel` (40KB): hiện chi tiết transform/pose/face/variant
- Cả hai đều liên quan đến việc xem và chỉnh node. Người dùng phải nhảy qua nhảy lại giữa 2 tab.
- Ngoài ra, bên trong `StudioMode.tsx` đã có sẵn component `SceneNodeList` (dòng 180-245) cũng hiện danh sách node — tức là **3 nơi** hiện cùng 1 thông tin!
- **Đề xuất**: Gộp "Nodes" + "Edit" thành 1 tab duy nhất. `SceneGraphPropertiesPanel` đã có phần Node List ở đầu, chỉ cần mở rộng nó.

### 5. Nút **Settings ⚙️** — **KHÔNG LÀM GÌ**
- [StudioMode.tsx:733](file:///d:/AnimeStudio_Project/frontend-react/src/components/studio/editor/StudioMode.tsx#L733): `<button className="..." title="Settings">` — **không có `onClick`**.
- Nút trang trí thuần tuý, gây bực cho người dùng khi bấm mà không có phản hồi.
- **Đề xuất**: Gắn vào API Key Manager hoặc AI Config panel. Hoặc xoá.

### 6. **HUD Debug Overlay** trên Canvas
- [StudioMode.tsx:164-171](file:///d:/AnimeStudio_Project/frontend-react/src/components/studio/editor/StudioMode.tsx#L164-L171): Hiện `t=0.00s · 3 nodes · Scene Graph Mode` trên góc canvas.
- Đây là thông tin debug cho dev, không phải cho user. Làm rối giao diện chuyên nghiệp.
- **Đề xuất**: Ẩn mặc định, chỉ hiện khi bật "Developer Mode" trong settings.

---

## 🚀 PHẦN CẦN NÂNG CẤP NGAY

### 1. Tab Labels quá nhỏ — `text-[8px]`
- [StudioMode.tsx:448-500](file:///d:/AnimeStudio_Project/frontend-react/src/components/studio/editor/StudioMode.tsx#L448-L500): Tất cả 5 tab dùng `text-[8px]` — **gần như không đọc được** trên màn hình 1080p.
- 5 tab chen chúc trong 320px (`w-80`): Auto | Nodes | Chat | Script | Edit
- **Đề xuất**: 
  - Tăng lên `text-[10px]` hoặc `text-xs`
  - Giảm còn 3-4 tab sau khi gộp Nodes+Edit
  - Dùng icon-only mode khi sidebar hẹp

### 2. Thiếu **Undo/Redo** toàn cục
- Hiện tại chỉ có "↩ Hoàn Tác AI" ([StudioMode.tsx:714-720](file:///d:/AnimeStudio_Project/frontend-react/src/components/studio/editor/StudioMode.tsx#L714-L720)) — chỉ hoàn tác **1 lần** thao tác AI Review.
- Thao tác thủ công (kéo thả, đổi pose, xoá node) **KHÔNG CÓ** undo.
- **Đề xuất**: Triển khai `useHistoryStore` (stack-based undo/redo) + nút Ctrl+Z/Ctrl+Y trên toolbar.

### 3. Thiếu **Scene Tabs** ở phía trên Canvas
- `SceneTabs` đã import ([StudioMode.tsx:16](file:///d:/AnimeStudio_Project/frontend-react/src/components/studio/editor/StudioMode.tsx#L16)) nhưng **KHÔNG render** trong JSX.
- Dự án hỗ trợ multi-scene (Auto Video tạo nhiều cảnh) nhưng không có cách chuyển cảnh bằng UI.
- **Đề xuất**: Render `<SceneTabs />` ngay trên canvas hoặc dưới top bar.

### 4. `AutoVideoPanel` thiếu **Loading/Progress UI**
- [AutoVideoPanel.tsx](file:///d:/AnimeStudio_Project/frontend-react/src/components/studio/editor/AutoVideoPanel.tsx) gọi API rồi chỉ hiện `alert()` khi lỗi.
- Khi pipeline chạy (có thể 30-60s), không có progress bar, không có step indicator.
- **Đề xuất**: Thêm step-by-step progress indicator (Parse → Cast → Build → TTS → Done).

### 5. Canvas **thiếu right-click context menu**
- `ProfessionalContextMenu.tsx` (3KB) tồn tại nhưng cần kiểm tra xem đã tích hợp chưa.
- Thao tác phổ biến (copy, delete, bring to front) nên có trong right-click menu.

---

## 📊 Tóm Tắt

| Hạng mục | Số lượng | Hành động |
|----------|----------|-----------|
| 🗑️ File/Component chết | 2 | Xoá (`QuickActionsBar`, import `PropertiesPanel` nếu bỏ Legacy) |
| 🗑️ Feature thừa | 2 | Ẩn (Legacy toggle, HUD debug) |
| 🔀 Trùng chức năng | 2 | Gộp (Nodes+Edit tab, 3 danh sách node) |
| 🚀 Cần nâng cấp | 5 | Tab size, Undo/Redo, SceneTabs, Progress UI, Context Menu |

> [!IMPORTANT]
> Bạn muốn mình thực hiện luôn phần nào? Mình đề xuất ưu tiên:
> 1. **Dọn dẹp** (xoá dead code, gộp tab) — nhanh, an toàn
> 2. **SceneTabs** — đã có component, chỉ cần render
> 3. **Tab size fix** — 1 dòng CSS
> 
> Còn Undo/Redo và Progress UI thì cần lên plan riêng.
