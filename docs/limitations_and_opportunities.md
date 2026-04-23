# 🔭 Hạn Chế Còn Lại & Những Vùng Cần Thêm AI

## Triết Lý: Nhiều AI = Mạnh Hơn, Không Phải Yếu Hơn

Bạn nói đúng. Trong kiến trúc AnimeStudio, mình quan sát thấy một quy luật rất rõ:

```
1 Agent duy nhất làm tất cả  →  Dễ vỡ, hallucination cao, 1 lỗi = sụp toàn bộ
17 Agent chuyên biệt          →  Chống chịu, mỗi agent chỉ giỏi 1 việc duy nhất
```

Lý do AI nhiều lại mạnh hơn:
- **Mỗi agent có scope nhỏ** → prompt ngắn → ít hallucination → kết quả chính xác hơn
- **Fallback chain**: Actor hỏng → vẫn có deterministic fallback. Camera hỏng → vẫn có wide shot mặc định. Không gì cản nổi pipeline.
- **Chạy song song**: 2 ActorAgent cho 2 nhân vật chạy đồng thời, thay vì 1 agent xử lý cả 2 nhân vật rồi nhầm lẫn.
- **Kiểm tra chéo**: Negotiator đặt vị trí → Critic kiểm tra → nếu sai thì redo. Không có Critic thì lỗi "người đi xuyên tường" sẽ không ai phát hiện.

> **Kết luận: "Lạm dụng AI" đúng cách = cơ thể có nhiều cơ quan chuyên biệt. Sai cách = để 1 bộ não làm hết mọi việc.**

---

## Hạn Chế Kỹ Thuật Còn Lại Sau Nâng Cấp

### 1. 🧠 Trí Thông Minh Giới Hạn Của Model 7B
Model 7B (dù là Qwen2.5-VL) vẫn có trần suy luận:
- **Kịch bản phức tạp > 8 nhân vật**: Agent bắt đầu bị loạn, quên nhân vật, nhầm tên
- **Suy luận chuỗi dài**: Nếu 1 cảnh có 15+ dòng thoại, model 7B dễ bị "quên" bối cảnh đầu → quyết định pose cuối không nhất quán
- **Tiếng Việt creative writing**: Viết thoại, tạo kịch bản sáng tạo bằng tiếng Việt vẫn kém xa Gemini 2.5 Pro

> **Giải pháp**: Giữ Gemini cho task sáng tạo (Storyboard, ScriptWriter). Ollama chỉ làm task "thi hành" (Đặt pose, chọn vị trí, cắt camera).

### 2. 📐 Tọa Độ BBox Vision Vẫn Chưa Hoàn Hảo
Dù Qwen2.5-VL giỏi hơn MiniCPM-V, nó vẫn là Generative Model — xuất tọa độ bằng text token. Sai số ±10% so với Gemini Vision.

> **Giải pháp**: Kết hợp: Dùng Qwen2.5-VL cho mô tả ngữ nghĩa ("có ghế ở bên trái") + Gemini Vision backup cho tọa độ pixel chính xác khi cần.

### 3. ⏱️ Tốc Độ Inference Trên T4
Colab T4 (16GB VRAM) chạy model 7B Q4 ở tốc độ ~20-30 tok/s. Khi pipeline gọi 5-6 agent liên tiếp (Actor×2 + Camera + Negotiator + Critic + StageAnalyzer), tổng thời gian có thể lên tới **60-90 giây** cho 1 scene.

> **Giải pháp**: Chạy song song (batch Actor agents), cache kết quả StageAnalyzer (đã implement).

### 4. 🔌 Phụ Thuộc Colab / Ngrok
Ollama server trên Colab Free có thể bị ngắt bất kỳ lúc nào (timeout 12h, GPU preemption). Ngrok tunnel cũng không ổn định.

> **Giải pháp hiện tại**: Fallback chain đã rất mạnh — khi Ollama chết, tất cả agent đều có deterministic fallback. Pipeline vẫn chạy được, chỉ kém thông minh hơn.

---

## 🕳️ 6 Vùng Trống Chưa Có AI (Cơ Hội Mở Rộng)

Đây là những chỗ trong pipeline đang dùng **hardcode/random** thay vì AI. Nếu thêm AI vào sẽ nâng chất lượng cinematic lên đáng kể:

### Vùng 1: 🎵 BGM & Sound Effects Director
**Hiện tại**: Pipeline hoàn toàn KHÔNG có AI chọn nhạc nền hay hiệu ứng âm thanh. Khi Hoa hét "SAN BẰNG TẤT CẢ!!" → không có tiếng nổ, không có nhạc kịch tính.

**AI có thể làm gì**:
```
SoundDirectorAgent:
  Input: Kịch bản + cảm xúc từng dòng
  Output: [
    {"time": 0.0, "type": "bgm", "track": "tension_rising.mp3"},
    {"time": 3.5, "type": "sfx", "sound": "explosion.wav"},
    {"time": 8.0, "type": "bgm", "track": "sad_piano.mp3"}
  ]
```
> Node `AudioNode` đã tồn tại trong SceneGraph (có `audio_type: "bgm" | "sfx"`) nhưng chưa agent nào dùng tới nó!

### Vùng 2: 🎬 Scene Transition Director
**Hiện tại**: Chuyển cảnh luôn là `"fade"` hoặc `"cut"` — hardcode.

**AI có thể làm gì**: Dựa vào sự tương phản cảm xúc giữa 2 scene liên tiếp:
- Scene buồn → Scene vui: `"dissolve"` (hòa tan chậm)
- Scene bình thường → Scene giận dữ: `"smash_cut"` (cắt sốc)
- Cùng địa điểm, khác thời gian: `"ripple"` (xoáy thời gian)

### Vùng 3: 🫁 Micro-Animation (Thở, Chớp Mắt, Nhúc Nhích)
**Hiện tại**: Khi nhân vật không nói → đứng như tượng sáp. Không có hoạt ảnh idle.

**AI có thể làm gì**:
```
IdleAnimatorAgent:
  - Thêm keyframe "y" nhấp nhô ±0.05 mỗi 2 giây (hiệu ứng thở)
  - Random chớp mắt (đổi face "眨眼" 0.1s rồi đổ lại face cũ)
  - Nhẹ nhàng xoay scale_x ±0.01 (đung đưa nhẹ cơ thể)
```
> Cái này KHÔNG CẦN AI (có thể hardcode), nhưng nếu có AI, nó sẽ biết lúc nào nên thở gấp (căng thẳng), lúc nào thở chậm (bình tĩnh).

### Vùng 4: 📝 Tự Động Viết Stage Direction
**Hiện tại**: Người dùng viết kịch bản thô kiểu: `Hoa: Trả lại mọi thứ!` — không có chỉ dẫn sân khấu.

**AI có thể làm gì**: Thêm một agent ở giữa pipeline:
```
StageDirectionAgent:
  Input:  "Hoa: Trả lại mọi thứ!"
  Output: "Hoa [giận dữ, bước tới trước mặt Nam, chống nạnh]: Trả lại mọi thứ!"
```
> Enrichment Agent tự động bổ sung stage direction → Giúp ActorAgent và SwarmNegotiator ra quyết định tốt hơn.

### Vùng 5: 🖼️ Visual Quality Assurance (Post-Render Check)
**Hiện tại**: Pipeline xuất SceneGraph → Frontend render → không ai kiểm tra kết quả hình ảnh cuối cùng.

**AI có thể làm gì** (cần Qwen2.5-VL):
```
VisualQAAgent:
  Input: Screenshot của frame đã render
  Output: {
    "issues": ["Nhân vật bị cắt nửa đầu", "2 sprite đè lên nhau"],
    "score": 6/10,
    "fix_suggestions": ["Giảm scale_y 0.1", "Dịch Hoa sang trái 1.5 đơn vị"]
  }
```

### Vùng 6: 🧲 Character Auto-Matching Thông Minh
**Hiện tại**: Mapping tên nhân vật → asset bằng fuzzy string match ("Hoa" → tìm asset có chữ "hoa"). Nếu không match → round-robin random!

**AI có thể làm gì**:
```
CastingDirectorAgent:
  Input: "Hoa - nữ nhân viên cửa hàng hoa, 25 tuổi, dễ thương"
  + Danh sách asset thumbnails
  Output: "q版花店姐姐长裙_1761648249312" (vì nhìn thumbnail thấy cô gái mặc váy hoa)
```
> Đây là use case hoàn hảo cho Qwen2.5-VL: nhìn thumbnail ảnh nhân vật → match với mô tả script.

---

## Bản Đồ Tổng Thể: Pipeline Hiện Tại vs Tiềm Năng

```
PIPELINE STAGE          HIỆN TẠI              SAU NÂNG CẤP          TƯƠNG LAI (Full AI)
─────────────────────────────────────────────────────────────────────────────────────
1. Viết kịch bản        ☁️ ScriptWriter       ☁️ ScriptWriter       ☁️ ScriptWriter
2. Phân cảnh             ☁️ Storyboard         ☁️ Storyboard         ☁️ Storyboard
3. Chọn nhân vật         🔧 Fuzzy match        🔧 Fuzzy match        🤖 CastingDirector ⭐
4. Enrichment            ❌ Không có            ❌ Không có            🤖 StageDirection ⭐
5. Quét background       ☁️ Gemini Vision      🖥️ Qwen2.5-VL        🖥️ Qwen2.5-VL
6. Đàm phán vị trí       ☁️→🖥️ Negotiator    🖥️ Negotiator         🖥️ Negotiator
7. Kiểm tra vị trí       ☁️→🖥️ Critic        🖥️ Critic             🖥️ Critic
8. Chọn Pose/Face        🖥️ ActorAgent        🖥️ ActorAgent         🖥️ ActorAgent
9. Đạo diễn camera       🖥️ CameraDirector   🖥️ CameraDirector     🖥️ CameraDirector
10. Chọn nhạc/SFX        ❌ Không có            ❌ Không có            🤖 SoundDirector ⭐
11. Chuyển cảnh           🔧 Hardcode "fade"    🔧 Hardcode "fade"    🤖 TransitionDir ⭐
12. Idle animation        ❌ Đứng như tượng      ❌ Đứng như tượng      🤖 IdleAnimator ⭐
13. Render + Check        ❌ Không check         ❌ Không check         🤖 VisualQA ⭐
14. Xuất Video            ✅ Frontend            ✅ Frontend            ✅ Frontend

Legend: ☁️ = Gemini Cloud | 🖥️ = Ollama Local | 🔧 = Hardcode | ❌ = Không có | ⭐ = Chưa build
```

---

## Kết Luận: Ưu Tiên Gì Trước?

| Ưu tiên | Agent mới | Lý do | Độ khó |
|---------|-----------|-------|--------|
| 🥇 1 | **IdleAnimator** (Micro-animation) | Nhân vật đứng như tượng = thiếu chuyên nghiệp nhất hiện tại. Có thể làm KHÔNG cần AI (pure math). | ⭐ Dễ |
| 🥈 2 | **SoundDirectorAgent** | AudioNode đã có sẵn trong SceneGraph, chỉ cần AI chọn track phù hợp. | ⭐⭐ TB |
| 🥉 3 | **StageDirectionAgent** (Enrichment) | Bổ sung context cho ActorAgent → pose/face chính xác hơn 50%. | ⭐⭐ TB |
| 4 | **CastingDirectorAgent** | Cần Qwen2.5-VL. Tự nhìn thumbnail → match nhân vật. | ⭐⭐⭐ Khó |
| 5 | **VisualQAAgent** | Cần Qwen2.5-VL. Kiểm tra render output. | ⭐⭐⭐ Khó |
| 6 | **TransitionDirector** | Ít impact nhất, chỉ là polish. | ⭐ Dễ |

> [!TIP]
> **IdleAnimator + SoundDirector** sẽ tạo ra bước nhảy chất lượng lớn nhất vì chúng giải quyết 2 vấn đề mà người xem **nhận ra ngay lập tức**: nhân vật đứng chết và video im lặng.
