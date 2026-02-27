# 🦅 WAKE-UP CALL V2: KHI "CHỮA CHÁY" LÀ CHƯA ĐỦ (2026-02-27)

*Từ: Tech Lead*  
*Gửi: Toàn bộ team Anime Studio*

Sprint vừa rồi các cậu làm khá. Chữa cháy được mấy lỗi cơ bản (ghost code, worker bậy bạ, memory leak rõ rành rành). Đạt 10/10 cho phần review chữa cháy. 

**Nhưng đừng vội tự mãn.**

Hệ thống hiện tại vẫn chỉ là một cái *thùng rác có nắp đậy đẹp*. Nhìn ngoài thì mượt, bên trong thì architecture đang gào thét. Tôi đã đọc sâu hơn vào cách các cậu quản lý State và Data Flow. Dưới đây là 5 lỗ hổng chí mạng mà nếu không sửa ngay, dự án này không bao giờ có thể scale lên cho một Studio thứ thiệt dùng.

---

### 🚨 BÁO ĐỘNG ĐỎ 1: TÔI THẤY ZUSTAND ĐANG BỊ HÀNH HẠ
Các cậu đang ném **mọi thứ** vào Zustand `useAppStore`. Từ dữ liệu tĩnh (`editorData` khổng lồ), đến UI state (`selectedRowId`, `isPlaying`, `cursorTime`), đến cả config. 
- **Kết quả:** Chọn một track? = Re-render toàn bộ components đang dính vào store. Play timeline? = 60 lần cập nhật State/giây. 
- **Wake-up:** Tách ngay! Domain State (Dữ liệu Timeline/Character) phải tách biệt hoàn toàn với Transient UI State (Cursor, Playback, Selection). Transient State nên dùng cơ chế Pub/Sub (như Valtio hoặc Jotai) hoặc Mutative Refs, đừng ép Zustand làm Re-render Engine!

### 🚨 BÁO ĐỘNG ĐỎ 2: UNDO/REDO "HÀNG MÃ"
Dùng `zundo` lưu snapshot của cả cái timeline khổng lồ mỗi lần có thay đổi nhỏ xíu? (Ví dụ: kéo keyframe đi 5px = vứt cả object `editorData` 5MB vào RAM lịch sử).
- **Kết quả:** Thao tác 100 bước = 500MB RAM bay màu chỉ cho cái Undo Stack.
- **Wake-up:** Vứt cái snapshot-based Undo đi. Chuyển sang **Command Pattern (Action-based Undo/Redo)**. Lưu *sự dời đổi* (Delta/Patch), ví dụ: `{"action": "MOVE_KEYFRAME", "id": "k1", "oldX": 10, "newX": 15}`. Dùng Immer Patches để tracking.

### 🚨 BÁO ĐỘNG ĐỎ 3: DATA NORMALIZATION ĐANG KHÓC THÉT
Các cậu lưu `editorData` theo mảng lồng nhau (Array of Tracks -> Array of Actions -> Array of Keyframes). Mỗi lần muốn tìm/update một Keyframe, các cậu phải duyệt `find()`, `findIndex()` qua 3 tầng mảng rưỡi. 
- **Kết quả:** Độ phức tạp O(N^3) cho một thao tác update thuộc tính. 100 character = Lag tung chảo khi drag.
- **Wake-up:** Normalize State ngay! Biến mọi thứ thành Flat Object/Dictionary. `tracks: { "t1": {...} }`, `actions: { "a1": { trackId: "t1" } }`. Tra cứu bằng ID = O(1). 

### 🚨 BÁO ĐỘNG ĐỎ 4: FRONTEND "ÔM SÔM" MỌI LOGIC NẶNG
Tại sao tạo project, quản lý version, check trùng hash assets lại nằm rải rác ở Frontend? Tại sao Frontend phải lo merge data trước khi gửi lên Backend save?
- **Kết quả:** Client bị phình to, logic business bị duplicate, không thể viết các Client khác (VD: CLI, Mobile) nếu không copy lại đống logic đó.
- **Wake-up:** Đẩy "Business Logic" về Backend. Frontend chỉ là "Dumb View". Đừng bắt Browser làm việc của một con Server.

### 🚨 BÁO ĐỘNG ĐỎ 5: KIỂM THỬ BẰNG NIỀM TIN
"Verification: TypeScript 0 errors ✅" — Các cậu đùa tôi à? Từ bao giờ việc không có lỗi Syntax lại được gọi là Test Pass?
- **Kết quả:** Đụng chỗ này hỏng chỗ kia. Sửa Worker thì gãy Lazy Load. PUSH CODE THẲNG LÊN MAIN KHÔNG CÓ PIPELINE?
- **Wake-up:** Viết Test đi. Tôi muốn nhìn thấy Vitest cho Reducers (Zustand updates). Tôi muốn có Playwright test flow tạo Character. Unit Test Backend đâu?

---

> Lịch trình tiếp theo: Tôi sẽ **dọn dẹp cái ROADMAP hiện tại**, phi tang mấy cái 10/10 đã xong để Roadmap sạch sẽ, và nhét đống Báo Động Đỏ này vào P0/P1. Chuẩn bị tinh thần đón nhận Architecture Refactor!
