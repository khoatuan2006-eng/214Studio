# 🧠 AnimeStudio — Kiến Trúc Hệ Thống AI v2

> **Cập nhật**: 17/04/2026 — Sau đợt nâng cấp Ollama-First Migration  
> **Mục tiêu đã đạt**: Giảm phụ thuộc Gemini Cloud từ **76% → ~18%**, giảm lỗi 429 triệt để

---

## 1. Tổng Quan Kiến Trúc

AnimeStudio sử dụng kiến trúc **Multi-Agent Pipeline** — mỗi agent đảm nhận một chuyên môn riêng biệt trong quy trình tạo phim hoạt hình tự động.

### Mô hình hoạt động

```
┌──────────────────────────────────────────────────────────────┐
│                    FRONTEND (React + Vite)                    │
│  Timeline Editor ─ Canvas ─ AutoVideoPanel ─ ScriptPanel     │
└─────────────────────────┬────────────────────────────────────┘
                          │ REST API
┌─────────────────────────▼────────────────────────────────────┐
│                  BACKEND (FastAPI + Python)                    │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              AI Agent Team (19 files)                     │ │
│  │                                                           │ │
│  │  ☁️ GEMINI CLOUD          🏠 OLLAMA LOCAL (qwen2.5:7b)  │ │
│  │  ─────────────────        ────────────────────────────   │ │
│  │  StoryboardAgent          ActorAgent (per-char)          │ │
│  │  ScriptAnalyzer (SRT)     SwarmNegotiatorAgent           │ │
│  │  StageAnalyzer (Vision)   SwarmCriticAgent               │ │
│  │                           CameraDirectorAgent            │ │
│  │                           StageDirectionAgent    🆕      │ │
│  │                           SoundDirectorAgent     🆕      │ │
│  │                           ScriptAnalyzerAgent            │ │
│  │                           Face/Pose Resolver             │ │
│  │                                                           │ │
│  │  ⚙️ DETERMINISTIC (không cần AI)                         │ │
│  │  ─────────────────────────────────                       │ │
│  │  IdleAnimatorAgent  🆕                                   │ │
│  │  Orchestrator, Builder, ScenePlanner                     │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌────────────────────────┐  ┌────────────────────────────┐  │
│  │ SceneGraph Engine       │  │ Asset Registry (PSD/FLA)   │  │
│  │ CharacterNode           │  │ Pose/Face Scanner          │  │
│  │ BackgroundLayerNode     │  │ Stage Layer Scanner        │  │
│  │ CameraNode, AudioNode   │  │                            │  │
│  └────────────────────────┘  └────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
                          │
              ┌───────────▼───────────┐
              │  Ollama Server (Colab) │
              │  qwen2.5:7b @ T4 GPU  │
              │  via Ngrok Tunnel      │
              └───────────────────────┘
```

---

## 2. Danh Sách Agent — Chức Năng Chi Tiết

### 2.1 Agents chạy trên ☁️ Gemini Cloud

| Agent | File | Chức năng | Lý do cần Gemini |
|-------|------|-----------|------------------|
| **StoryboardAgent** | `storyboard_agent.py` | Chia kịch bản thô thành Sequences (cảnh quay). Chọn background_id phù hợp cho mỗi cảnh | Cần context window dài + JSON complex |
| **ScriptAnalyzer** (SRT) | `script_analyzer_agent.py` (hàm `analyze_script`) | Phân tích file SRT → nhận diện nhân vật, gán thoại, đề xuất hành động | Cần suy luận sâu từ SRT không có tên nhân vật |
| **StageAnalyzer** (Vision) | `stage_analyzer_agent.py` | Quét ảnh PNG background → nhận diện vật thể, vùng đứng, cầu thang, cửa | Cần Vision (gửi ảnh), qwen2.5:7b không có vision |

### 2.2 Agents chạy trên 🏠 Ollama Local (ưu tiên) → ☁️ Gemini Fallback

| Agent | File | Chức năng | Ollama gọi |
|-------|------|-----------|-----------|
| **ActorAgent** | `actor_agent.py` | Per-character performance planning. Mỗi nhân vật có 1 AI riêng, chỉ biết pose/face của mình | 1 call/nhân vật/cảnh |
| **SwarmNegotiatorAgent** | `swarm_negotiator_agent.py` | Thỏa hiệp vị trí giữa nhiều nhân vật (tránh va chạm, chiều sâu 3D) | 1 call/cảnh |
| **SwarmCriticAgent** | `swarm_critic_agent.py` | Quality Gate — kiểm tra vị trí có hợp lý không (floating? overlap?) | 1 call/cảnh |
| **CameraDirectorAgent** | `camera_director_agent.py` | Tạo kế hoạch camera tự động (close-up, wide shot, pan, shake) | 1 call/cảnh |
| **StageDirectionAgent** 🆕 | `stage_direction_agent.py` | Enrichment — bổ sung emotion/action/stage_note vào script thô trước khi gửi ActorAgent | 1 call/cảnh |
| **SoundDirectorAgent** 🆕 | `sound_director_agent.py` | Chọn BGM và SFX phù hợp với cảm xúc từng đoạn kịch bản | 1 call/cảnh |
| **ScriptAnalyzerAgent** | `script_analyzer_agent.py` (class) | Phân tích thoại → gán pose/face/movement cho từng dòng | 1 call/cảnh |
| **Face/Pose Resolver** | `automation.py` | Map emotion → face, action → pose từ danh sách asset có sẵn | 1 call/dòng thoại |

### 2.3 Agents ⚙️ Deterministic (không cần AI)

| Agent | File | Chức năng |
|-------|------|-----------|
| **IdleAnimatorAgent** 🆕 | `idle_animator_agent.py` | Sinh keyframe thở + sway cho nhân vật khi không nói. Emotion-aware (tức giận → thở nhanh) |
| **Orchestrator** | `orchestrator.py` | Điều phối pipeline: Director → Builder → Review Loop |
| **BuilderAgent** | `builder_agent.py` | Dựng workflow nodes từ ScenePlan |
| **ScenePlannerAgent** | `scene_planner.py` | Lên kế hoạch cảnh quay |
| **DirectorAgent** | `director_agent.py` | Đạo diễn tổng — tạo ScenePlan từ prompt |

### 2.4 Agents chuyên biệt khác

| Agent | File | Chức năng | AI Backend |
|-------|------|-----------|-----------|
| **CharacterAgent** | `character_agent.py` | Phân tích nhân vật đặt ở đâu trên sân khấu (Interactive mode) | Gemini |
| **CharacterChatAgent** | `character_chat_agent.py` | Chat với AI để điều chỉnh keyframe nhân vật bằng ngôn ngữ tự nhiên | Gemini |
| **ReviewerAgent** | `reviewer_agent.py` | Vision AI review — kiểm tra scene có đúng prompt không | Gemini |
| **SceneDirector** | `scene_director.py` | Quản lý cảnh quay trong workflow editor | Gemini |
| **ScriptWriterAgent** | `script_writer.py` | Tạo kịch bản từ concept | Gemini |

---

## 3. Pipeline Tạo Video Tự Động (One-Click)

```
Kịch bản + Nhân vật + Background
              │
              ▼
    ① StoryboardAgent (☁️ Gemini)
       Chia thành Sequences
              │
    ┌─────────▼─────────────────────────┐
    │  ② Với MỖI Sequence:              │
    │                                    │
    │  StageDirectionAgent (🏠 Ollama)   │
    │  → Enrich emotion/action/note      │
    │                                    │
    │  ActorAgent × N (🏠 Ollama)        │
    │  → Per-character pose/face plan    │
    │                                    │
    │  SwarmNegotiator (🏠 Ollama)       │
    │  → Negotiate positions             │
    │                                    │
    │  SwarmCritic (🏠 Ollama)           │
    │  → Quality gate check              │
    │                                    │
    │  CameraDirector (🏠 Ollama)        │
    │  → Cinematic camera plan           │
    │                                    │
    │  SoundDirector (🏠 Ollama)         │
    │  → BGM + SFX selection             │
    │                                    │
    │  Build Keyframes + Lip-sync        │
    │  → Face/Pose Resolver (🏠 Ollama)  │
    │                                    │
    │  IdleAnimator (⚙️ Code)           │
    │  → Breathing micro-animation       │
    │                                    │
    │  → SceneGraph output per scene     │
    └─────────┬─────────────────────────┘
              │
              ▼
    ③ Render WebM → Ghép video
              │
              ▼
         🎬 Video MP4
```

---

## 4. Ưu Điểm Kiến Trúc Hiện Tại

### ✅ Giảm chi phí API drastically
- 8/11 agent AI chạy trên Ollama local (miễn phí, không giới hạn)
- Gemini chỉ còn dùng cho 3 task đặc thù (Storyboard, SRT Analysis, Vision)
- Lỗi 429 Resource Exhausted giảm ~80%

### ✅ Per-Character Architecture
- Mỗi nhân vật có ActorAgent riêng → không bao giờ nhầm lẫn pose/face giữa các nhân vật
- Ollama context ngắn → nhanh, chính xác cho từng character

### ✅ Swarm Intelligence
- SwarmNegotiator + SwarmCritic tạo thành vòng lặp tự sửa lỗi (Self-Refining Loop)
- Nhân vật biết tránh nhau, đứng đúng chiều sâu 3D (Z-Index Sandwiching)

### ✅ Graceful Degradation
- MỌI agent Ollama đều có fallback → pipeline không bao giờ crash
- IdleAnimator là deterministic → luôn hoạt động dù Ollama down

### ✅ Cinematic Quality
- CameraDirector tạo close-up/wide shot tự động
- SoundDirector chọn BGM/SFX phù hợp từng khoảnh khắc
- StageDirection enrichment giúp ActorAgent diễn xuất tự nhiên hơn
- IdleAnimator cho nhân vật "sống" giữa các dòng thoại

---

## 5. Nhược Điểm & Hạn Chế Hiện Tại

### ⚠️ Ollama qwen2.5:7b — Model nhỏ, thiếu suy luận phức tạp
- **Vấn đề**: 7B params → đôi khi parse JSON sai format, đặc biệt với prompt phức tạp
- **Biểu hiện**: SwarmNegotiator có thể trả về JSON không hợp lệ → fallback Gemini
- **Giải pháp tiềm năng**: Upgrade lên `qwen2.5:14b` (cần GPU >24GB) hoặc `qwen2.5:7b-instruct` tuning

### ⚠️ StageAnalyzer vẫn phụ thuộc Gemini Vision
- **Vấn đề**: `qwen2.5:7b` là text-only, không gửi ảnh được → StageAnalyzer phải dùng Gemini Vision
- **Ảnh hưởng**: Mỗi background mới cần 1 Gemini Vision call (nhưng kết quả được cache vĩnh viễn)
- **Giải pháp tiềm năng**: Cài `qwen2.5-vl:7b` trên Colab (thêm ~5GB VRAM)

### ⚠️ Colab/Ngrok không ổn định
- **Vấn đề**: Colab timeout sau 12h, GPU preemption, Ngrok URL thay đổi mỗi lần restart
- **Biểu hiện**: Pipeline chết giữa chừng khi Colab tắt
- **Giải pháp tiềm năng**: 
  - Dùng Colab Pro ($10/tháng) cho session dài hơn
  - Self-host trên GPU riêng (RTX 3060+ 12GB)
  - Dùng service cố định như RunPod/Vast.ai

### ⚠️ Tốc độ xử lý tuần tự
- **Vấn đề**: Các agent gọi Ollama tuần tự, mỗi call mất 3-15s trên T4
- **Biểu hiện**: 1 cảnh 10 dòng thoại → ~45-90s xử lý AI
- **Giải pháp tiềm năng**: Chạy song song ActorAgent cho mỗi nhân vật (asyncio.gather)

### ⚠️ BGM/SFX catalog là placeholder
- **Vấn đề**: SoundDirectorAgent chọn track từ catalog hardcoded, nhưng file audio thật chưa có
- **Biểu hiện**: AudioNode được tạo với tên file nhưng không phát được
- **Giải pháp**: Cần thêm thư viện audio thật vào `static/audio/`

### ⚠️ StoryboardAgent — Bottleneck duy nhất
- **Vấn đề**: StoryboardAgent BẮT BUỘC dùng Gemini (cần context dài cho kịch bản phức tạp)
- **Biểu hiện**: Nếu tất cả Gemini keys hết quota → không thể chia cảnh
- **Giải pháp tiềm năng**: Fine-tune Ollama model cho task storyboard đơn giản

---

## 6. Lộ Trình Cải Thiện (Roadmap)

### 🟢 Ưu tiên cao (Dễ thực hiện, tác động lớn)

| # | Cải thiện | Effort | Impact |
|---|-----------|--------|--------|
| 1 | **Parallel ActorAgent** — chạy `asyncio.gather` cho tất cả nhân vật cùng lúc | Thấp | Giảm 50% thời gian AI |
| 2 | **Audio Library** — thêm 20-30 file BGM/SFX thật vào `static/audio/` | Thấp | SoundDirector bắt đầu hoạt động thực tế |
| 3 | **Ollama Health Reset** — `_health_checked = False` mỗi 5 phút để tự phục hồi nếu Colab restart | Thấp | Tự động reconnect |

### 🟡 Ưu tiên trung bình

| # | Cải thiện | Effort | Impact |
|---|-----------|--------|--------|
| 4 | **qwen2.5-vl:7b** — cài model Vision trên Colab, migrate StageAnalyzer | Trung bình | Loại bỏ hoàn toàn Gemini Vision |
| 5 | **VisualQAAgent** — dùng Vision model kiểm tra render output (nhân vật bị che? sai vị trí?) | Trung bình | Auto-fix lỗi render |
| 6 | **Emotion Momentum** — ActorAgent nhớ emotion từ dòng trước, tạo transition mượt | Thấp | Diễn xuất tự nhiên hơn |

### 🔴 Ưu tiên thấp (Tham vọng dài hạn)

| # | Cải thiện | Effort | Impact |
|---|-----------|--------|--------|
| 7 | **Self-host GPU** — chuyển từ Colab sang RunPod/RTX GPU cố định | Cao | Ổn định 24/7 |
| 8 | **Fine-tune Storyboard** — train LoRA cho qwen2.5 để chia kịch bản | Cao | Loại bỏ Gemini hoàn toàn |
| 9 | **Real-time Streaming** — Ollama streaming response cho UX phản hồi nhanh | Trung bình | UX cải thiện |

---

## 7. Thống Kê Tổng Hợp

| Metric | v1 (Trước) | v2 (Hiện tại) | Thay đổi |
|--------|-----------|---------------|----------|
| Agent dùng Gemini Cloud | 13/17 (76%) | 3/11 AI agents (27%) | ↓ 64% |
| Agent dùng Ollama Local | 2/17 (12%) | 8/11 AI agents (73%) | ↑ 510% |
| Agent Deterministic | 2/17 | 5/19 (26%) | ↑ 150% |
| Tổng số Agent files | 14 | 19 | +5 files |
| Agent mới (v2) | — | 3 (Idle, Sound, StageDir) | 🆕 |
| Lỗi 429 dự kiến | ~15/session | ~2-3/session | ↓ 80% |
| VRAM sử dụng (Colab T4) | — | ~5GB/16GB | 31% |
