# AnimeStudio — AI Code Assistant Onboarding Guide

> **Ai đọc tài liệu này?** Bất kỳ AI Code Agent nào (Gemini, Claude, GPT...) được giao task phát triển dự án AnimeStudio.  
> **Đọc xong rồi mới được phép code.** Nếu bạn code mà không đọc, bạn SẼ phá hỏng kiến trúc.

---

## 🎯 Mục tiêu dự án

AnimeStudio là công cụ **sản xuất phim hoạt hình 2D tự động**, lấy cảm hứng từ quy trình studio chuyên nghiệp nhưng được thiết kế để **một AI agent có thể vận hành toàn bộ**.

```
Input:  "Làm video 30 giây về 2 bạn trẻ gặp nhau ở cửa hàng 4S, nói chuyện vui vẻ"
Output: video.mp4 hoàn chỉnh với nhân vật, bối cảnh, thoại, phụ đề, nhạc nền
```

---

## 📁 Cấu trúc tài liệu

| File | Nội dung | Bắt buộc đọc? |
|------|----------|----------------|
| [00_RULES.md](00_RULES.md) | **Nguyên tắc bất di bất dịch** — ĐỌC TRƯỚC TIÊN | ⭐⭐⭐ |
| [01_ARCHITECTURE.md](01_ARCHITECTURE.md) | Kiến trúc hệ thống, data flow, file map | ⭐⭐⭐ |
| [02_ASSET_PIPELINE.md](02_ASSET_PIPELINE.md) | Quy trình từ FLA/PSD → asset PNG → Scene Graph | ⭐⭐⭐ |
| [03_SCENE_GRAPH_ENGINE.md](03_SCENE_GRAPH_ENGINE.md) | Scene Graph engine (backend + frontend) | ⭐⭐ |
| [04_AUTOMATION_PIPELINE.md](04_AUTOMATION_PIPELINE.md) | Script-to-Scene pipeline chi tiết | ⭐⭐ |
| [05_ROADMAP.md](05_ROADMAP.md) | Hướng phát triển — milestones rõ ràng | ⭐⭐ |
| [06_FLA_BACKGROUND_RENDERING.md](06_FLA_BACKGROUND_RENDERING.md) | Pipeline FLA → Canvas, bugs đã fix, checklist debug | ⭐⭐⭐ |
| [07_STAGE_INTELLIGENCE.md](07_STAGE_INTELLIGENCE.md) | Vision AI phân tích bối cảnh, smart positioning, upgrade guide | ⭐⭐⭐ |

---

## ⚡ Quick Context (30 giây)

- **Backend**: Python FastAPI (port 8001)
- **Frontend**: React + PixiJS v8 + Zustand + TailwindCSS  
- **AI**: Google Gemini API (function calling)
- **Assets**: PSD characters (pose/face swap), FLA backgrounds (multi-layer parallax)
- **Kiến trúc nhân vật**: 2 layers — `pose` (thân) + `face` (mặt). KHÔNG skeletal rigging.
- **Animation**: Keyframe interpolation cho x/y/scale/opacity + STEP swap cho pose/face
- **Tọa độ**: World units (1 unit = 100px, PPU=100). Canvas = 19.2 × 10.8 units.
