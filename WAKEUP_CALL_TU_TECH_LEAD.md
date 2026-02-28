# 🗺️ ROADMAP V2 (WAKE-UP CALL TỪ TECH LEAD)

*Tài liệu này không chỉ là định hướng phát triển tiếp theo mà còn là một bản kiểm điểm (Wake-up call) thẳng thắn về thực trạng hệ thống.*

---

## 🏆 1. GHI NHẬN: NHỮNG GÌ CHÚNG TA ĐÃ LÀM ĐƯỢC (ROADMAP V1)

Trong các Sprint vừa qua (P0 - P4), team đã giải quyết được những khoản nợ kỹ thuật (Technical Debt) ngổn ngang ban đầu:
- **Kiến trúc State Management (P0):** Áp dụng thành công Command Pattern cho Undo/Redo (tiết kiệm 99% RAM so với snapshot-based). Tách Transient State (như time cursor) sang Valtio, giảm thiểu partial re-render. Normalize cấu trúc tree của `editorData`.
- **Hạ tầng Backend API (P0 & P1):** Thiết kế thành công Intent-based API, chuyển business logic tạo node/keyframe/action về Backend. DB Schema được chuẩn hóa với Alembic. Thêm Asset Versioning chuẩn xác và Soft Delete.
- **Timeline Engine Cơ Bản (P2):** Xây dựng Multi-scene, Track Groups, Speed Ramp, và Easing Curves GUI.
- **Tiêu Chuẩn Kiểm Thử (P4):** Thiết lập nền móng Test vững chắc với Vitest (Store), RTL (Component), Pytest (Backend API) và Playwright (E2E Smoke).

*Tuy nhiên, nền móng có vững đến đâu mà ngôi nhà bên trên ẩm thấp thì người dùng vẫn sẽ bỏ đi. Đây là lúc chúng ta phải nhìn vào sự thật.*

---

## 🚨 2. WAKE-UP CALL: TOÀN BỘ NHƯỢC ĐIỂM SỐNG CÒN CỦA DỰ ÁN

Mặc dù Data Flow đã chuẩn, nhưng Trải nghiệm Người Dùng (UX) và Tối ưu Rendering (Optimization) hiện tại là một thảm họa nếu mang ra so sánh với các production-grade tools.

1. **Rendering "Mù Quáng" và Chậm Chạp:** Hệ thống đang vẽ TẤT CẢ các track và canvas elements bằng Canvas2D trên Single Thread cho dù chúng có lọt ngoài khung nhìn hiển thị hay bị che khuất. Không hề có Frustum Culling. 
2. **Main Thread Bị Bức Tử:** Frontend vẫn đang tự thân nội suy keyframe, parse JSON nặng, và track map. Nếu timeline dài, UI bị đóng băng (khựng FPS) vì trình duyệt phải dồn tài nguyên xử lý dữ liệu thay vì nhận phản hồi click/scroll của người dùng.
3. **UX Mang Nặng Tính "Kỹ Sư", Thiếu Tính Trực Quan:** Người dùng phải vất vả thao tác properties từ một Panel cố định ở góc xa màn hình. Mọi thứ phải click nhiều lần. Không có Drag-n-Drop mượt mà (Zero-Layout-Shift) và thiếu bóng dáng của Context Floating Menus.
4. **Garbage Collection (Memory VRAM) Yếu Kém:** Thao tác mount/unmount Component (đặc biệt khi Switch Scene) có nguy cơ để lại Textures rác trên VRAM của GPU. Event listeners không dọn sạch hoàn toàn, dẫn đến Memory Leak đôn RAM theo thời gian.
5. **Thiếu Sinh Khí ở Tương Tác Cấp Thấp (Micro-interactions):** Nhấc một block timeline lên, thả xuống, không có một tí "độ nảy" spring physics hay feedback trực quan nào. 

---

## 🚀 3. ROADMAP PHÁT TRIỂN TIẾP THEO (SPRINT P5)

*Mục tiêu tối thượng: Sát thủ hiệu năng & Quyến rũ người dùng.*

| # | Việc cần làm | Độ phức tạp |
|---|---|---|
| **P5.1** | **Frustum Culling & Virtualized Timeline**: Áp dụng Windowing cho Timeline (chỉ render node UI lọt vào khung viewport). Bỏ qua hoàn toàn lệnh draw trên Canvas cho các Element ngoài góc nhìn Camera `stagePos`. | 🔴 Cao |
| **P5.2** | **Web Workers cho Heavy Math**: Đẩy mọi logic xử lý vòng lặp nặng (như tính Easing nội suy, deserialization JSON lớn) xuống Background Worker Thread. Đảm bảo Main Thread rảnh rỗi đạt 60 FPS! | 🔴 Cực Cao |
| **P5.3** | **Memory Leak Profiling & Cleanup Textures**: Cơ chế tự động gọi lệnh `destroy()` chủ động dọn dẹp WebGL/Canvas Textures ngay khi element unmount hoặc switch Scene. Giữ footprint RAM là đường đi ngang. | 🟡 Trung bình |
| **P5.4** | **Contextual Floating UI & Snap**: Mọc Context Menu, Radial Tools ngay TẠI ĐIỂM CHUỘT trên Canvas khi user chọn Element. Không bắt user liếc sang Inspector góc phải để thao tác cơ bản. Tính năng nam châm Snap-to-Grid cực mượt. | 🟡 Trung bình |
| **P5.5** | **Zero-Layout-Shift (ZLS) & Spring Animations**: Mọi UI Transition/Drag/Drop phải dùng tới CSS Transform/Opacity để giao cho GPU Hardware Acceleration. Tích hợp Framer Motion tạo độ nảy đàn hồi khi Edit các block timeline. | 🟢 Thấp |

---

## ⚖️ 4. ĐỊNH VỊ SẢN PHẨM: SO SÁNH VỚI ĐỐI THỦ TRÊN THỊ TRƯỜNG

Để biết chúng ta đang ở đâu, hãy đặt Anime Studio Reborn lên bàn cân cùng các "Ông Trùm" trong ngành:

### 🏆 So với After Effects (Tiêu chuẩn công nghiệp)
- **Ưu điểm của ta:** Là nền tảng Web-based, không yêu cầu cài đặt. Cấu trúc Data được thiết kế sẵn sàng cho **AI Automation và Python Scripting** (qua Intent API & Python SDK), điều mà After Effects đòi hỏi JSX Scripting cực rối rắm và khó scale tự động hóa hàng loạt trên Server.
- **Nhược điểm của ta:** Rendering yếu kém. AE dùng Engine render C++ / GPU cực mạnh kèm theo thư viện Effects plugin khổng lồ. Chúng ta vẫn kẹt ở Canvas2D/WebGL cơ bản. Bộ công cụ thao tác vector spline/bezier của ta chỉ là bản nháp so với Graph Editor siêu đẳng của AE.

### 🎮 So với Spine 2D (Ngành công nghiệp Game Animation)
- **Ưu điểm của ta:** Spine bắt buộc mua lisence đắt đỏ và cài phần mềm Desktop. Anime Studio cho phép thiết lập và upload PSD ngay trên trình duyệt, tổ chức quản lý (CMS/Asset versioning) hoàn hảo cho một team Remote.
- **Nhược điểm của ta:** Spine 2D có Inverse Kinematics (IK), Mesh Deformation tinh xảo và tính toán Weights lưới cực đỉnh. Hiện tại chúng ta mới chỉ hỗ trợ Block-based Transform Animation (chỉ dịch chuyển khối ảnh cứng `x, y, scale, rotation`), hoàn toàn không làm được Deform chi tiết.

### 🌐 So với CapCut Web (Sản phẩm Web-based đại chúng)
- **Ưu điểm của ta:** CapCut chỉ cắt ghép video. Chúng ta điều khiển **từng thuộc tính lớp ảnh (Layer/Keyframe)**, mang sức mạnh của Animation Studio lên web thay vì chỉ là Video Video Editor đơn thuần. Khả năng lồng ghép Character / Sub-scene của chúng ta linh hoạt hơn hẳn thao tác track layer cứng ngắc của CapCut.
- **Nhược điểm của ta:** Cực kỳ lép vế về UI/UX và Tối ưu Hệ thống. CapCut đã chuyển phần lõi sang WebAssembly từ lâu, main thread của họ nhẹ tênh, asset pre-fetch siêu nhanh. Giao diện Contextual của họ làm mịn đến từng pixels, thân thiện hoàn hảo. Chúng ta thì UX đang bị "Kỹ sư" hóa nặng nề, dễ treo Main Thread khi project lớn.

> **TỔNG KẾT:** Lợi thế cạnh tranh (USP) của Anime Studio là khả năng **Headless Automation** kết hợp **Cloud Asset Management**, một Mini-MAM hoạt động trên Web có khả năng làm Animation. Nhưng để khai thác được USP đó thành thương mại, **Roadmap P5** bắt buộc phải thành công để lấp đầy hố sâu về **UX và Tối ưu RAM/Main Thread** so với các đối thủ sừng sỏ!
