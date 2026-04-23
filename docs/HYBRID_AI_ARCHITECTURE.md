# Kiến Trúc AI Hybrid (Local + Cloud)

## Tổng Quan

Hệ thống đã được thiết kế lại để sử dụng **Local AI (Ollama)** để xử lý các tác vụ logic, giúp tiết kiệm **~70% quota Gemini API** và tránh bị Rate Limit (Error 429).

### Phân bổ Công việc

| Thành phần | AI | Điểm mạnh |
| :--- | :--- | :--- |
| **Storyboard** | Gemini (Cloud) | Sáng tạo kịch bản |
| **Vision Analysis** | Gemini (Cloud) | Nhìn ảnh & trích xuất tọa độ chính xác |
| **Critic Review** | Ollama (Local) ⭐ | Logic kiểm tra, không bao giờ 429 |
| **Face/Pose Resolver** | Ollama (Local) ⭐ | So sánh từ khóa, phản hồi < 1s |
| **Negotiator** | Gemini (Cloud) | Sắp xếp nhân vật phức tạp |
| **TTS** | ByteDance | Chuyển văn bản thành âm thanh |

---

## Cài Đặt Ollama

### 1. Tải Ollama
```bash
# Windows/macOS/Linux
https://ollama.ai
```

Sau khi cài đặt, Ollama sẽ chạy tại `http://localhost:11434` theo mặc định.

### 2. Chạy Model Local

Mở Terminal/PowerShell và chạy lệnh (lần đầu sẽ tải model, ~4GB):

```bash
# Model được khuyến cáo: Qwen 2.5 7B (cân bằng tốc độ & chất lượng)
ollama run qwen2.5:7b

# Hoặc, nếu máy yếu hơn, dùng phiên bản nhẹ hơn:
ollama run qwen2.5:3b

# Hoặc, nếu máy mạnh, dùng Llama 3:
ollama run llama3
```

### 3. Kiểm tra Ollama chạy đúng
```bash
curl http://localhost:11434/api/tags
```

Nếu có response JSON với danh sách model, tức là Ollama đang chạy ✓

---

## Cấu Hình Backend

### 4. Cập nhật `backend/data/ai_config.json`

```json
{
  "provider": "gemini",
  "model": "gemini-2.0-flash",
  "vision_model": "gemini-2.0-flash",
  "max_review_rounds": 3,
  "temperature": 0.7,
  "api_keys": ["YOUR_GEMINI_KEY_HERE"],
  "ollama_url": "http://localhost:11434",
  "local_model": "qwen2.5:7b"
}
```

### Giải thích các trường Ollama:
- **`ollama_url`**: Địa chỉ server Ollama (mặc định là localhost:11434)
- **`local_model`**: Tên model Ollama để sử dụng (mặc định: `qwen2.5:7b`)

---

## Cách Hoạt Động (Flow)

### Khi tạo video:

1. **Storyboard** → Gemini (tạo kịch bản)
2. **Vision Analysis** → Gemini (phân tích ảnh nền)
3. **Smart Resolver** (Chọn biểu cảm/động tác):
   - ✅ Thử **Ollama Local** trước (< 1 giây)
   - ❌ Nếu Ollama offline → Fallback sang Gemini
4. **Swarm Critic** (Rà soát vị trí):
   - ✅ Thử **Ollama Local** trước (< 5 giây)
   - ❌ Nếu Ollama offline → Fallback sang Gemini
5. **Swarm Negotiator** → Gemini (nếu Critic reject)

### Lợi ích:

- ✅ **Không bao giờ bị Rate Limit ở bước 3 & 4** vì chạy Local
- ✅ **Phản hồi cực nhanh** (< 1s) cho Face/Pose selection
- ✅ **Tiết kiệm Quota Gemini** dành cho các tác vụ sáng tạo
- ✅ **Hoàn toàn offline cho Critic** (không phụ thuộc mạng)

---

## Gỡ Lỗi

### Ollama không được phát hiện?

```
[Ollama] Health check: ✗ Unavailable
```

**Giải pháp:**
1. Kiểm tra Ollama chạy: `ollama serve`
2. Kiểm tra URL config: `http://localhost:11434`
3. Kiểm tra Firewall không chặn cổng 11434

### Model chưa tải?

```bash
ollama list
# Nếu qwen2.5:7b chưa có:
ollama run qwen2.5:7b
```

### Timeout khi gọi Ollama?

- Nếu máy yếu hoặc model lớn, CPU có thể chậm
- Đổi sang model nhỏ hơn: `ollama run qwen2.5:3b`
- Tăng timeout trong config nếu cần (hiện tại 60s)

---

## Giám Sát & Tối Ưu

### Xem log:

```bash
# Check Ollama logs
ollama serve

# Backend logs sẽ hiển thị:
[Ollama] Health check: ✓ Available
[FaceResolver] Trying local Ollama for face resolution...
[Aegis] Attempting local Ollama for Critic review...
```

### Chỉnh tiêu thụ Giới hạn

Nếu Ollama chiếm quá nhiều RAM:
```bash
# Linux/macOS: Edit OLLAMA_NUM_PARALLEL
OLLAMA_NUM_PARALLEL=1 ollama serve

# Hoặc dùng model nhỏ hơn (3B thay vì 7B)
```

---

## Chi phí tiết kiệm

**Trước:** ~0.5 API call / giây (429 error liên tục)  
**Sau:** ~0.05 API call / giây (Local xử lý phần lớn)

**Tính toán:**
- Gemini 2.0 Flash: ~$0.03 per 1M input tokens
- Nếu giảm từ 100 calls → 20 calls, tiết kiệm **80%** quota

---

## Danh sách Model hợp lệ cho Ollama

Được test & khuyến cáo:
- ✅ **Qwen 2.5 7B** (tốt nhất: cân bằng tốc độ & chất lượng)
- ✅ **Qwen 2.5 3B** (nếu máy yếu)
- ✅ **Llama 3** (nếu máy mạnh)
- ✅ **Mistral 7B** (thay thế)

Không nên dùng:
- ❌ Các model `tiny` (chất lượng quá kém cho Critic)
- ❌ Model 30B+ (cần GPU, sẽ rất chậm trên CPU)

---

**Tài liệu này sẽ được cập nhật khi có thay đổi kiến trúc mới.**
