# Kế hoạch Xây dựng D:\AnimeStudio_Project

Dự án này hướng tới việc tạo ra một hệ thống sản xuất video Anime/Truyện tranh tự động 100% bằng sức mạnh của **Code Orchestrator (Python)** kết hợp với **Render Engine (React/Remotion)**. Bỏ qua hoàn toàn sự rườm rà của các AI Agents truyền thống.

## User Review Required

> [!IMPORTANT]
> Bản thiết kế này sẽ thiết lập bộ khung vững chắc cho toàn bộ dự án Anime của bạn. Vui lòng xem kỹ cấu trúc thư mục và quy trình hoạt động ở dưới. Khi bạn `Approve` (Đồng ý), tôi sẽ bắt tay vào việc dùng code tạo tự động toàn bộ cấu trúc thư mục và các file script nền tảng này cho bạn tại `D:\AnimeStudio_Project`.

## Open Questions

> [!WARNING]
> Cần bạn xác nhận 2 điểm kỹ thuật sau trước khi tiến hành code:
> 1. **Nguồn Sinh Giọng Nói (TTS):** Bạn định dùng API trả phí (như ElevenLabs / OpenAI) hay muốn tôi tích hợp các model chạy Offline miễn phí trên máy (như VITS / RVC) để tạo giọng lồng tiếng Anime?
> 2. **Nguồn Hình Ảnh (Visuals):** Bạn đã có sẵn thư viện nhân vật (Sprites/Background) vẽ tay, hay muốn hệ thống tích hợp thêm code tự động kết nối với Stable Diffusion/Midjourney để tự vẽ nhân vật dựa trên kịch bản?

---

## Proposed Architecture (Cấu trúc thư mục)

Dự án sẽ được phân lô rõ ràng để tránh tình trạng lộn xộn, đảm bảo luồng dữ liệu chảy một chiều (One-way Data Flow) từ Text -> Audio -> Video.

### [D:\AnimeStudio_Project]

#### [NEW] [Inputs/](file:///D:/AnimeStudio_Project/Inputs)
Thư mục chứa nguyên liệu thô đầu vào.
- `scripts/`: Chứa kịch bản dạng Text hoặc JSON (tên nhân vật, câu thoại, cảm xúc).
- `assets/`: Chứa các file ảnh gốc (Background, Characters, Items).

#### [NEW] [Src_Python/](file:///D:/AnimeStudio_Project/Src_Python)
"Bộ Não" điều phối toàn bộ dự án.
- `01_tts_engine.py`: Đọc kịch bản -> Gọi API tạo file âm thanh `.wav` cho từng câu thoại.
- `02_whisper_sync.py`: Dùng Faster-Whisper đếm từ, tạo file `words.json` cực chuẩn xác để nhân vật khớp khẩu hình miệng (Lip-sync).
- `03_master_muxer.py`: Đọc file cấu hình, chèn hiệu ứng âm thanh (Kiếm chém, đấm đá, phép thuật) bằng FFmpeg `filter_complex` để xuất file MP4 cuối cùng mà không làm giảm tốc độ render.

#### [NEW] [Remotion_Engine/](file:///D:/AnimeStudio_Project/Remotion_Engine)
"Xưởng phim" - Nơi dùng GPU trình duyệt để vẽ video. (Dự án React/TypeScript).
- `src/components/Character.tsx`: Component quản lý chớp mắt, khẩu hình miệng nhấp nháy theo Audio.
- `src/components/Scene.tsx`: Component quản lý lia máy quay (Camera Pan/Zoom) và hiệu ứng thị giác (Lửa, sét, bụi).
- `package.json`: Cấu hình lệnh render (`npm run build`).

#### [NEW] [SFX_Library/](file:///D:/AnimeStudio_Project/SFX_Library)
Kho lưu trữ âm thanh chất lượng cao.
- `combat/`: Tiếng đấm, chém, nổ.
- `environment/`: Tiếng mưa, gió, bước chân.
- `bgm/`: Nhạc nền Epic/Sad.

#### [NEW] [Outputs/](file:///D:/AnimeStudio_Project/Outputs)
Nơi chứa các tập phim Anime hoàn chỉnh (Master MP4).

---

## Luồng Hoạt Động (Pipeline Workflow)

Thay vì để các Agent ngồi "cãi nhau", hệ thống sẽ chạy khép kín theo đường ống sau:

1. **Giai đoạn 1 (Audio Generation):** Bạn ném kịch bản vào `Inputs/scripts/`. Chạy `01_tts_engine.py` và `02_whisper_sync.py` để tự động đẻ ra thư mục chứa mớ âm thanh và file tọa độ khẩu hình.
2. **Giai đoạn 2 (Scene Composition):** Hệ thống Node.js của Remotion sẽ nạp file JSON vào, tự động tính toán lúc nào nhân vật A nói (mở miệng), lúc nào nhân vật B nhắm mắt, và tạo ra khung cảnh Anime sống động bằng Code React.
3. **Giai đoạn 3 (Fast Rendering):** Chạy lệnh xuất video của Remotion. Nhờ tận dụng WebGL/GPU Chrome, video xuất ra siêu nhanh và mượt (hơn đứt MoviePy).
4. **Giai đoạn 4 (Post-Production):** Chạy `03_master_muxer.py` để ép các lớp nhạc nền, âm thanh chém giết đè lên video gốc bằng FFmpeg. Hoàn tất 1 tập phim.

---

## Verification Plan

### Automated Setup
- [ ] Chạy lệnh `mkdir` để khởi tạo toàn bộ cây thư mục trên ổ `D:`.
- [ ] Khởi tạo môi trường ảo Python (`venv`) và danh sách thư viện (`requirements.txt`) chuyên dụng cho AnimeStudio.
- [ ] Dùng lệnh `npx create-video@latest` để thiết lập khung sườn Render Engine bằng Remotion ngay bên trong thư mục dự án.

### Manual Verification
- [ ] Yêu cầu người dùng (bạn) mở VSCode tại thư mục `D:\AnimeStudio_Project` để kiểm tra độ gọn gàng và khoa học của kiến trúc mới. Đảm bảo mọi thứ đã sẵn sàng để viết các dòng code điều phối đầu tiên.
