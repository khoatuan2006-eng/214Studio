# 🔬 Đánh Giá Vision Model Cho AnimeStudio (Colab T4 GPU 16GB)

## Bối Cảnh

AnimeStudio đang chạy `qwen2.5:7b` (~5GB VRAM) trên Colab T4 (16GB). Còn khoảng **~10GB VRAM trống** để cài thêm Vision Model. Mục tiêu: cho Ollama có khả năng "nhìn" ảnh background/character trực tiếp thay vì phụ thuộc hoàn toàn vào Gemini Vision.

---

## Bảng So Sánh Tổng Quan

| Tiêu chí | MiniCPM-V 2.6 | Qwen2.5-VL 7B | LLaVA 1.6 7B | Llama 3.2-Vision 11B |
|---|---|---|---|---|
| **Kích thước** | ~8B params | ~8B params | ~7B params | ~11B params |
| **VRAM (Q4)** | ~5GB | ~5GB | ~4.5GB | ~7GB |
| **Chạy song song với Qwen2.5:7b?** | ✅ Vừa | ✅ Vừa | ✅ Vừa | ⚠️ Eo hẹp |
| **Ollama hỗ trợ?** | ✅ Có | ✅ Có | ✅ Có | ✅ Có |
| **OCR (đọc chữ trên ảnh)** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Mô tả ảnh chung** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Nhận dạng 2D/Anime** | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ |
| **Xuất tọa độ BBox chính xác** | ⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐ |
| **Tốc độ inference** | 🚀 Nhanh nhất | 🚀 Nhanh | 🚀 Nhanh | 🐢 Chậm hơn |

---

## Phân Tích Chi Tiết

### 1. MiniCPM-V 2.6 (OpenBMB)

**Ưu điểm:**
- 🏆 **Hiệu suất / kích thước tốt nhất** trong dòng 8B. Đạt 65.2 trên OpenCompass, ngang ngửa GPT-4V ở nhiều task.
- **Token density cực cao**: Nén ảnh rất gọn, tiết kiệm VRAM và giảm latency (first-token nhanh).
- **OCR xuất sắc**: Đọc chữ trên biển hiệu, bảng điều khiển, UI screenshot rất chính xác.
- **Hỗ trợ đa ảnh & video**: Có khả năng xem nhiều frame liên tiếp.
- Ollama hỗ trợ chính thức (`ollama run minicpm-v`).

**Nhược điểm:**
- ⚠️ **Yếu với ảnh Anime/2D stile**: Được train chủ yếu trên ảnh đời thực. Ảnh hoạt hình có tỷ lệ biến dạng, nét vẽ phóng đại → dễ nhầm vật thể.
- ⚠️ **Tọa độ Bounding Box thiếu chính xác**: Vì là Generative Model (xuất tọa độ dạng text token), không có đầu ra hồi quy (Regression Head) chuyên dụng cho object detection → tọa độ hay bị lệch ±15-20%.
- Phiên bản mới hơn (MiniCPM-o 2.6) thêm audio/streaming nhưng nặng hơn.

**Kết luận**: Rất tốt cho việc **mô tả cảnh** ("trong phòng có gì?"), nhưng **không nên dùng để xuất tọa độ chính xác** cho AnimeStudio.

---

### 2. Qwen2.5-VL 7B (Alibaba) ⭐ KHUYẾN NGHỊ

**Ưu điểm:**
- 🏆 **Đối thủ nặng ký nhất 2025-2026** trong dòng Vision mã nguồn mở cỡ trung.
- **Spatial understanding vượt trội**: Qwen2.5-VL được thiết kế với khả năng hiểu không gian tốt hơn hẳn MiniCPM-V — nó có thể xuất bounding box và tọa độ tương đối chính xác hơn đáng kể.
- **Context window lớn hơn**: Hỗ trợ cửa sổ ngữ cảnh dài hơn, phù hợp cho ảnh phân giải cao.
- **Cùng "họ" với Qwen2.5 text**: Vì bộ não text của nó cũng là Qwen2.5, nên khi kết hợp với `qwen2.5:7b` (text model đang chạy), chúng sẽ chia sẻ pattern suy luận rất nhất quán.
- Ollama hỗ trợ chính thức (`ollama run qwen2.5-vl:7b`).

**Nhược điểm:**
- VRAM tương đương MiniCPM-V (~5GB Q4), nhưng context dài sẽ ăn thêm RAM.
- Vẫn là Generative Model, nên tọa độ BBox không thể cạnh tranh với YOLO chuyên dụng.
- Dòng 3B (`qwen2.5-vl:3b`) nhẹ hơn nhưng yếu hơn đáng kể về spatial reasoning.

**Kết luận**: **Lựa chọn tối ưu nhất** nếu muốn cài Vision trên Colab. Cùng hệ sinh thái Qwen, spatial understanding mạnh, và Ollama hỗ trợ tốt.

---

### 3. LLaVA 1.6 (7B/13B)

**Ưu điểm:**
- Tiên phong trong dòng Vision mã nguồn mở, cộng đồng rất lớn.
- Nhẹ nhất (7B chỉ ~4.5GB Q4), dễ chạy song song.

**Nhược điểm:**
- ⚠️ **Đã lạc hậu** so với MiniCPM-V và Qwen2.5-VL ở hầu hết mọi benchmark.
- OCR yếu, spatial reasoning trung bình.
- Hay bị "ảo giác" (hallucination) khi mô tả chi tiết ảnh phức tạp.

**Kết luận**: Không còn khuyến nghị cho dự án mới. Chỉ phù hợp nếu cần model siêu nhẹ và task đơn giản.

---

### 4. Llama 3.2-Vision 11B (Meta)

**Ưu điểm:**
- Backbone mạnh (Meta), general reasoning rất tốt.
- Hệ sinh thái Meta ổn định, liên tục được cập nhật.

**Nhược điểm:**
- ⚠️ **11B params = ~7GB VRAM (Q4)** → Chạy song song với Qwen2.5:7b (5GB) = 12GB, còn rất ít dư cho context.
- Tốc độ inference chậm hơn đáng kể so với MiniCPM-V và Qwen2.5-VL trên T4.
- OCR không bằng 2 đối thủ trên.

**Kết luận**: Quá nặng cho setup Colab T4 hiện tại. Phù hợp hơn nếu có GPU 24GB (A10/L4).

---

## Kịch Bản Áp Dụng Cho AnimeStudio

### Phương Án A: Giữ nguyên (Không cài Vision) ✅ HIỆN TẠI
- Gemini Vision quét background 1 lần → ASCII Map + Spatial Grid
- Ollama Qwen2.5 text đọc bản đồ chữ để ra quyết định
- **Ưu điểm**: Ổn định, không tốn thêm VRAM, đã verify hoạt động tốt.
- **Nhược điểm**: Phụ thuộc Gemini cho bước ban đầu (tốn 1 API call/background).

### Phương Án B: Cài `qwen2.5-vl:7b` thay thế `qwen2.5:7b` ⭐ ĐỀ XUẤT
- Swap `qwen2.5:7b` (text-only) → `qwen2.5-vl:7b` (vision + text).
- **Ưu điểm**: Model VL vẫn có khả năng text reasoning tương đương model text-only, nhưng thêm khả năng "nhìn" ảnh. VRAM gần như không đổi (~5GB). **Một model làm tất cả**.
- **Nhược điểm**: Text-only performance *có thể* giảm ~2-5% so với bản text chuyên dụng (chưa benchmark kỹ).
- **Use case mới được mở khóa**:
  - `StageAnalyzerAgent` chạy offline hoàn toàn (không cần Gemini Vision)
  - Visual Critic: Check ảnh render cuối có đúng không
  - Character Recognition: AI tự nhận diện nhân vật trong frame

### Phương Án C: Chạy 2 model song song (text + vision riêng)
- Giữ `qwen2.5:7b` cho text + cài `minicpm-v` hoặc `qwen2.5-vl:3b` cho vision.
- **Ưu điểm**: Mỗi model chuyên biệt cho task của mình.
- **Nhược điểm**: Tốn ~8-10GB VRAM tổng → context window bị thu hẹp, dễ OOM trên T4.

---

## Khuyến Nghị Cuối

> **Phương Án B** là tối ưu nhất: Swap sang `qwen2.5-vl:7b` để vừa giữ được khả năng text reasoning, vừa mở khóa vision — tất cả trong cùng 1 model, cùng mức VRAM.

Tuy nhiên, việc này **không cấp bách** vì hệ thống Scene Blueprint Protocol hiện tại đang hoạt động rất tốt. Cài Vision Model nên được coi là **Phase 2 tương lai** khi bạn muốn:
1. Loại bỏ hoàn toàn sự phụ thuộc vào Gemini API
2. Cho AI tự kiểm tra chất lượng hình ảnh đầu ra (Visual QA)
3. Tự động nhận diện nhân vật trong frame để gán metadata
