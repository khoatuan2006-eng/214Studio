# 🦅 WAKE-UP CALL V2: TỪ PROTOTYPE ĐẾN PHẦN MỀM THỰC CHIẾN (2026-02-28)

*Từ: Tech Lead (Chuyên gia System Design & UX/Tester)*  
*Gửi: Toàn bộ team Anime Studio*

Giai đoạn vừa qua, các cậu đã làm rất tốt việc dọn rác kiến trúc (Architecture Refactor P0-P4). Từ Zustand bị hành hạ cho đến Undo "hàng mã", các vấn đề cốt lõi về hệ thống Flow Dữ Liệu đã được xoa dịu. Tôi ghi nhận nỗ lực này. Những điểm **ĐÃ ĐẠT** cực kì tốt, như việc áp dụng Command Pattern, API backend intent-based, Normalize cấu trúc Data và việc tích hợp Test Runner bài bản (Vitest/Playwright). 

**NHƯNG... HÃY NHÌN THẲNG VÀO SỰ THẬT! Đừng ngủ quên trên một vài feature pass test.**

Hệ thống của chúng ta hiện tại nếu vứt ra thị trường để đọ với After Effects, Spine 2D, Live2D hay thậm chí là CapCut Web... thì nó vẫn chỉ là một sản phẩm "đồ chơi" của sinh viên đi làm đồ án. Tại sao ư? Vì hệ thống thiếu đi hai thứ quyết định sự sống còn của môi trường chuyên nghiệp: **Trải nghiệm Người Dùng (UX) Đỉnh Cao** và **Tối Ưu Hóa Hệ Thống (System Optimization) Chạm Đáy.**

Dưới đây là hàng loạt CHƯA ĐẠT (nhược điểm chí mạng) mà nếu không fix, chúng ta mãi làm phần mềm hobbysist. Cứ đọc cho kỹ, đau thì mới lớn, để định hướng lại cho cái Roadmap sắp nổ tung kia.

---

### 🚨 BÁO ĐỘNG ĐỎ 1: RENDERING HIỆN TẠI LÀ SỰ LỪA DỐI (So với AE / Spine)
**Thực trạng (Chưa đạt):**
Các cậu tự cho rằng tạo "Resolution Preview" bằng CSS scale sẽ giải quyết giật lag? Lừa dối người dùng! Cốt lõi của chúng ta hiện tại vẫn đang render bằng Canvas2D trên Single Thread một cách cục súc. Lắp 100 character/asset lên timeline, zoom in pan ra vào, hệ thống sẽ khóc thét và rớt FPS thảm hại.
- **So với After Effects / Spine 2D:** Bọn họ sử dụng GPU acceleration thuần (WebGL/OpenGL/WebGPU) kết hợp kiến trúc **Frustum Culling** bẩm sinh (chỉ thực sự tính toán/vẽ Pixel của những thứ xuất hiện lọt thỏm trong Viewport hiển thị).
- **Wake-up:** Phải đập đi xây lại renderer hoặc tận dụng PixiJS/WebGPU. Áp dụng ngay Frustum Culling không chỉ cho Canvas mà cho cả Timeline Render. Đừng bắt Browser nhai những timeline-block/pixel đang nằm che khuất ngoài màn hình!

### 🚨 BÁO ĐỘNG ĐỎ 2: MAIN THREAD ĐANG CHẾT NGẠT (System Optimization)
**Thực trạng (Chưa đạt):**
Khi load một dự án có file PSD 50MB, hay khi tính toán mảng nội suy cực lớn kiểu Follow Path, Easing Curve phức tạp... UI của các cậu đang bị khựng (freeze) vài nhịp rõ rệt.
- **So với Figma / CapCut Web:** Bọn họ offload (đẩy) toàn bộ việc cày cuốc logic sang background qua Web Workers, WebAssembly. Main Thread của họ dạo chơi ở 60FPS để vuốt, click mượt mà.
- **Wake-up:** Tách TẤT CẢ các tính toán nặng (Parsing JSON, Deserialize, Easing Interpolation, Track mapping) ném cho Web Worker lo. Main thread chỉ dành để nhận tín hiệu và nháy màn hình hiển thị. Nhìn thấy con trỏ chuột quay quay là một tội ác UX. 

### 🚨 BÁO ĐỘNG ĐỎ 3: TRẢI NGHIỆM NGƯỜI DÙNG CÒN QUÁ "KỸ SƯ"
**Thực trạng (Chưa đạt):**
Một người dựng phim ghét cay ghét đắng việc phải "chu du" bằng chuột. Muốn đổi blending mode? Nhìn sang panel phải. Muốn đổi speed ramp? Click sang phải. Muốn edit track name? Phải mở property. Dăm ba cái keyboard shortcuts là không đủ chữa cháy cho một cái UI thừa thãi bước thao tác.
- **So với After Effects / Blender:** UI của họ là dạng Contextual (theo đúng ngữ cảnh). Mọi thao tác cần thiết nổ ra ngay dưới trỏ chuột bằng Floating Menu, Radial Menu. Những panel property có thể dock/undock, pin gọn gàng. Cảm giác tương tác phải như tay chạm vào vật thể.
- **Wake-up:** Cung cấp Context Menu Toolbars chuẩn xác trồi lên theo điểm click element. Code lại hiệu ứng Snap/Hút dính nam châm mượt tay cả ở Timeline (snap frame/bờ cản) lẫn lúc di chuyển trên Stage. UX mà không "sướng" thì vứt.

### 🚨 BÁO ĐỘNG ĐỎ 4: MẢNG VỆ SINH BỘ NHỚ VẪN DƠ BẨN CẤP ĐỘ DOM & EVENT
**Thực trạng (Chưa đạt):**
Tạo Scene, Hủy Scene... thao tác liên tọi. Nhưng với cái kiểu gọi React Node và mount/unmount tràn lan như hiện tại, các cậu chắc chắn để lại Memory Leak khổng lồ ở các textures Canvas cũ và Event Listeners nằm ẩn.
- **So với chuẩn Enterprise (PixiJS apps):** Tài nguyên phải bị hủy (destruct) thủ công và sạch sẽ. Memory footprint luôn phẳng theo thời gian chứ không phải hình đồ thị leo núi mỗi khi đổi Scene.
- **Wake-up:** Xóa hoàn toàn Textures khỏi VRAM (GPU) NGAY LẬP TỨC khi Element/Scene không còn tồn tại... Cleanup toàn bộ subscriber ở cleanup step của các Hook cực sạch sẽ, không cho rớt 1 byte bộ nhớ.

### 🚨 BÁO ĐỘNG ĐỎ 5: LACK OF MICRO-INTERACTIONS (Giao diện vô hồn)
**Thực trạng (Chưa đạt):**
Nắm và ném một action block, kéo điểm đầu cuối keyframe, hệ thống phản hồi quá khô khốc (trạng thái tắt/phát cứng nhắc).
- **So với các Web App hiện đại / Live2D:** Bất kì một trạng thái tương tác click/hover nào cũng có Micro-animations (CSS properties transition, spring physics khi drag, glow hover state). Sự tỉ mỉ tạo cảm giác "hàng hiệu" chứ không phải hàng mã. 
- **Wake-up:** Áp dụng thiết kế **Zero-Layout-Shift (ZLS)**. Kéo thả dài ngắn track không làm giật cả Layout. Toàn bộ hiệu ứng hover, focus, drag-drop phải đưa vào CSS Transform/Opacity để nhét lên GPU chạy, cấm tuyệt đối trigger repaint bằng thay đổi width/margin.

---

> **LỜI KẾT TỪ TECH LEAD KÉP (SYSTEM/UX):**
> Các cậu đã ráp xong cái khung xương để cái xe chạy được, đạt chứng chỉ đăng kiểm. Bây giờ tôi cấm không cho mang cái xe chở gạch này ra rước khách, mà chúng ta phải độ nó thành SIÊU XE. Tôi ghi nhận những nỗ lực đã qua trong Roadmap, nhưng để hướng tầm nhìn, hãy ngó sang con đường **'P5 — Đỉnh Cao Trải Nghiệm & Hiệu Năng'**. Đổ nền xong rồi, giờ là lúc xây công trình hạng A! 
