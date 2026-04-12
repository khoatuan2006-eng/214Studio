# Báo Cáo Cập Nhật Hệ Thống & Lộ Trình Lõi AI: AnimeStudio 2.2

Tài liệu này tổng hợp lại các bản vá phục hồi tầng Render PixiJS V8 (Màn hình đen, lẩn tránh AdBlocker) và đặc biệt **cập nhật lại Lộ Trình Phát Triển (Master Roadmap) tập trung 100% vào hệ sinh thái AI Automation** để biến AnimeStudio thành một phim trường tự hành hóa hoàn toàn.

---

## 1. Hệ Sinh Thái Đồ Họa Nền Tảng (Đã Khắc Phục)

- **Vá Lỗ Hổng Reconciler (React-Pixi):** Ép buộc khởi tạo API `<sprite>`, chấm dứt kỉ nguyên "Màn Hình Đen" của PixiJS v8.
- **Tàng Hình Trước Máy Quét Quảng Cáo (AdBlock Bypasser):** Ngụy trang Endpoint `/assets/{hash}` về bí danh bảo mật `/s_assets`.

Những nền tảng trên giúp giao diện Timeline & Canvas sẵn sàng 100% để tiếp nhận ma trận tọa độ từ não bộ Đại Ngôn Ngữ (LLM).

---

## 2. Kiến Trúc Phát Triển Máy Sản Xuất Tự Động (AI Roadmap)

Với việc sáp nhập hệ sinh thái Agents (`backend/core/agents/`) và mạng xử lý Endpoint AI (`backend/routers/ai.py`), đây là 4 Phase để biến AnimeStudio thành một con quái vật tự kết xuất Video rảnh tay.

### 🟢 Phase 1: Zero-to-Scene & Sinh Kịch Bản (Script Analyzer Automation)
*Tự động hóa luồng chuyển đổi từ đoạn Văn Bản kịch bản (Script/SRT) thành Project Code Cấu trúc.*
- **Toàn Rút & Phân Rã Kịch Bản (`analyze_script`):** Sử dụng các mô hình Qwen/Gemini để trích xuất từng khung thoại SRT, nhận diện nhân vật nào cần xuất hiện, trạng thái cảm xúc, hành động (vui, buồn, nhảy, đi lại).
- **Trình Kết Phối Động (`automation_generate`):** Gateway API biến đổi toàn bộ Object Action (X, Y, Mờ độ, Dịch chuyển) từ LLM thành một bản phác thảo Database Project thực thụ. Tự động dàn Keyframes vào Timeline mà sếp không cần đụng chuột.

### 🟡 Phase 2: Đạo Diễn Ảo & Phản Hồi Thị Giác (Vision AI Review Loop)
*Biến Camera thành đôi mắt của Nhóm AI (Agent Team) để tự sửa lỗi bố cục.*
- **Stage Analyzer (`analyze_stage`):** Các mô hình Vision sẽ quét ảnh màn hình (Screenshot) Snapshot của sân khấu PixiJS WebGL để định vị và hiểu được ngữ nghĩa "Đâu là mặt đất", "Nhân vật có bị lọt thỏm xuống nền không?".
- **Trình Duyệt Lại Cảnh Phim (`review_scene`):** Vòng lặp đệ quy. LLM Director tự động đọc nhận xét bức ảnh → điều chỉnh tọa độ keyframe X, Y (VD: Xích sang phải một chút) liên tục cho tới khi Reviewer AI đánh giá bối cảnh điểm tỷ lệ Đạt 9/10.

### 🟠 Phase 3: Công Ty Tương Tác Hành Động Điện Ảnh (Conversational Character Chat)
*Điều hướng thời gian thực màn hình Animation bằng ChatBot ngôn ngữ tự nhiên.*
- Thay vì kéo thả Transformer, người dùng bật cửa sổ Chat và nhập: `"Thằng màu xanh lùi lại 200px, mờ dần đi và lắc đầu bực bội lúc giây thứ 2"`.
- **Character Chat Agent (`chat_with_character`):** Thuật toán nạp bối cảnh Layer hiện hành, lập tức diễn dịch câu lệnh trên thành gói thao tác thay đổi `Layer X/Y` và chèn các Keypoints vào `Track.duration`. Hành động thị giác cập nhật live trước mắt sếp.

### 🔴 Phase 4: Gắn Khớp Tự Nhận Dạng Dữ Liệu Thị Giác (Agentic Autonomous Rigger)
*Tự động chuẩn hóa Asset PSD thành nhân vật có cấu trúc Xương hoàn mỹ.*
- **Phân Loại Thành Phần Thượng Tầng:** Mô hình AI Vision quét qua tệp layer thô từ Photoshop (còn gọi là "Layer 1", "Layer 2 copy") và tự động gắn nhãn (Tóc, Mắt, TayTrái, Lưng) siêu tốc.
- **Tọa Độ Lõi Điểm Gốc Xác Định (Pivot Auto-detection):** AI tự động tính toán ra tâm điểm xoay hợp lý. Biết chính xác cánh tay thì Pivot phải đưa lên nách (thay vì tâm chính giữa), chân phải ghim tại hông. Khôi phục khả năng diễn hoạt như một con rối (Puppet) chỉ qua một nút bấm.
