# 🚨 GÓC NHÌN TỪ TECH LEAD: Wake-up Call Cho Toàn Bộ Team

Gửi các "code dạo" đang làm cái Anime Studio này,

Tôi vừa lướt qua codebase và bản design của dự án. Thẳng thắn mà nói: **Các cậu đang code một cái "đồ án sinh viên" chứ chưa phải là một "sản phẩm thực tế" (Production-ready).** 

Vẽ ra tính năng P1, P2 nghe rát lỗ tai (Nào là IK Rigging, AI Auto-Lip Sync), nhưng cái nền móng thì đầy lỗ hổng. Dưới đây là hàng loạt điểm yếu chí tử (Fatal Flaws) so với các phần mềm chuẩn ngành (như After Effects, Spine 2D, hay Figma) mà tôi phát hiện ra. Đọc, ngấm, và nhục một chút để mà sửa!

---

### 1. Kiến trúc State Management đang là một quả bom nổ chậm (Spaghetti State)
- **Tình trạng:** Các cậu lạm dụng Zustand một cách ngây ngô. Quăng toàn bộ `editorData` (hàng ngàn object, keyframe, track) vào một cái store duy nhất.
- **Tại sao nó dở:** Mỗi lần một frame thay đổi (playhead chạy), **toàn bộ React Tree re-render** nếu không cẩn thận. Với 10 characters và 1000 keyframes, app của các cậu sẽ lết ở 5FPS.
- **Giải pháp:** Phải tách State ra thành *Transient State* (thứ thay đổi liên tục như playhead, drag position - dùng Ref hoặc Vanilla JS subscriber) và *Persistent State* (thứ định tuyến và lưu DB). Đừng bắt React quản lý 60 lần cập nhật/giây!

### 2. Rendering Pipeline Ngây Thơ (Naive Rendering)
- **Tình trạng:** Quét toàn bộ vòng lặp để vẽ lên Canvas mọi thứ mỗi frame.
- **Tại sao nó dở:** Nếu character đi ra khỏi màn hình (out of bounds), hoặc nằm dưới 5 lớp layer khác (occluded), các cậu VẪN render nó! Không có Frustum Culling, không có Bounding Box check.
- **Giải pháp:** Học cách "Culling". Không thấy thì không vẽ (Display = none / skip draw). Chỉ render những node nằm trong Camera Viewport. Nhìn sang Figma xem họ xử lý hàng chục nghìn node trên một canvas mượt thế nào đi!

### 3. File Project "Quái Thai" (God Object JSON)
- **Tình trạng:** Lưu cả bầu trời dữ liệu vào một file JSON duy nhất hoặc một cột JSON trong SQLite.
- **Tại sao nó dở:** Khi project lớn lên (50MB json), user mở file sẽ phải parse toàn bộ 50MB đó vào RAM ngay lập tức. Tính năng Auto-save mỗi 30s sẽ block main thread (lag 2-3s) mỗi lần chạy vì hành động `JSON.stringify(50MB)` là synchronous!
- **Giải pháp:** Chia nhỏ chunk. Dùng ID reference thay vì nhét lồng nhau. SQLite phải chuẩn hóa 3NF (Scene -> Track -> Action), đừng lười biếng dùng JSON blob nữa.

### 4. Zero Error Boundaries (Chết Trong Im Lặng)
- **Tình trạng:** Bỏ qua hoàn toàn việc bắt lỗi UI (Error Boundaries).
- **Tại sao nó dở:** Gửi data tào lao hoặc state rác, component crash -> Trắng xóa toàn bộ màn hình Editor. Người dùng mất trắng công sức 3 tiếng đồng hồ, không có cách nào save lại hay reload mà vẫn giữ bài làm.
- **Giải pháp:** Cắm ngay `Error Boundary` bao quanh các component trọng yếu (Timeline, Canvas). Nếu Timeline crash, Canvas vẫn sống và hiện thông báo: "Có lỗi xảy ra tại Timeline, nhấp để khôi phục bản lưu gần nhất".

### 5. Bundle Size Béo Phì (Bloated Client)
- **Tình trạng:** Import thẳng tay mọi thư viện nặng nề vào bundle chính.
- **Tại sao nó dở:** Chờ load trang mất 5-10 giây ở mạng Việt Nam. User vào xem Dressing Room (chưa dùng Editor) cũng phải tải toàn bộ Engine về máy.
- **Giải pháp:** Code Splitting bắt buộc. Dùng `React.lazy()`, Dynamic Import. Tính năng Export hay Render Engine nặng chỉ được lazy-load vào lúc cần thiết. Điểm FCP (First Contentful Paint) mà > 1.5s là vứt!

### 6. Blocking The Main Thread (Tội Ác UI/UX)
- **Tình trạng:** Xử lý file PSD nặng, tính mã băm SHA-256, extract base64... tất cả đang có nguy cơ luộc chín Main Thread của Browser.
- **Tại sao nó dở:** Giao diện bị "đơ" không click được gì trong giây lát. Người dùng tưởng app bị treo và sẽ F5! Trải nghiệm siêu rẻ tiền!
- **Giải pháp:** Bắt buộc dùng Web Workers! Phải ném toàn bộ heavy math, hash loop, hay data parsing ra background thread. App UI phải luôn phản hồi ở 60Hz.

---

> **Túm cái quần lại:**
> Đừng ảo tưởng sức mạnh với các tính năng bề nổi nữa. Tạm dừng việc vẽ hươu vẽ vượn, tập trung giải quyết cái đống **Technical Debt (Nợ kỹ thuật)** này đi trước khi codebase thối rữa đến mức không thể đập đi xây lại được nữa. 
> 
> Một sản phẩm xịn được đánh giá qua cảm giác mượt mà khi người ta vuốt, click, và khả năng chịu tải (Stress-test), chứ không phải độ dài của cái list tính năng rác trong roadmap.
> 
> Tỉnh lại và chuyển tư duy sang Production-Grade (Tiêu chuẩn công nghiệp) đi!
> *- Tech Lead Xinh Gái / Đẹp Trai Dấu Tên -*
