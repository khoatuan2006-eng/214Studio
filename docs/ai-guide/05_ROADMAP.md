# 05 — Roadmap: Hướng phát triển đến Auto Film Production

## Tầm nhìn cuối cùng

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│   User: "Làm video 60 giây về tình yêu của 2 bạn trẻ"      │
│                        ↓                                     │
│   AI Agent tự động:                                          │
│     1. ✍️  Viết kịch bản (dialogue + stage directions)       │
│     2. 🎭  Chọn nhân vật phù hợp (từ thư viện 27+)         │
│     3. 🏞️  Chọn bối cảnh (quán cà phê, công viên...)       │
│     4. 🎬  Dàn cảnh (vị trí, di chuyển, biểu cảm)          │
│     5. 🔊  Generate giọng nói (TTS Volcengine)               │
│     6. 👄  Lip-sync (đồng bộ miệng)                         │
│     7. 📝  Phụ đề (auto subtitle overlay)                    │
│     8. 🎵  Nhạc nền (BGM selection)                          │
│     9. 🎥  Camera movements (zoom, pan, follow)              │
│    10. 📹  Export video (MP4/WebM 1080p)                     │
│                        ↓                                     │
│   Output: video.mp4 sẵn sàng đăng TikTok/YouTube            │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Current Status (Tháng 4/2026)

### ✅ ĐÃ HOÀN THÀNH

| # | Module | Trạng thái | File chính |
|---|--------|-----------|------------|
| 1 | Scene Graph Engine | ✅ Stable | `core/scene_graph/` (7 files) |
| 2 | Character System (PSD) | ✅ Stable | `psd_processor.py`, `asset_scanner.py` |
| 3 | PixiJS WebGL Renderer | ✅ Working | `SceneRenderer.tsx`, `PixiStage.tsx` |
| 4 | Script → Scene Pipeline | ✅ Working | `routers/automation.py` |
| 5 | AI Director (Gemini FC) | ✅ Working | `agents/director_agent.py` |
| 6 | FLA Background (multi-layer) | ✅ Working | `automation.py` + `export_fla_to_psd.jsfl` |
| 7 | Cinematic Movement | ✅ Working | `automation.py` (enter/exit/step/walk) |
| 8 | Smart Facing + Listener | ✅ Working | `automation.py` |
| 9 | Z-Index Animation | ✅ Working | `node.py` + `SceneGraphManager.ts` |
| 10 | Video Export (WebM) | ✅ Basic | `VideoExporter.ts` |
| 11 | TTS API | ✅ Available | `routers/tts.py` (Volcengine) |
| 12 | AI Script Analyzer | ✅ Available | `agents/script_analyzer_agent.py` |
| 13 | Stage Analyzer (Vision AI) | ✅ **Working** | `agents/stage_analyzer_agent.py` |
| 14 | Smart Character Positioning | ✅ Working | `automation.py` (stage-aware placement) |

### 🔴 CẦN LÀM (theo thứ tự ưu tiên)

| Priority | Module | Tình trạng hiện tại |
|----------|--------|---------------------|
| P0 | Background Selector UI | Hardcoded `background_id` trong ScriptImport.tsx |
| P0 | Camera Render | CameraNode tồn tại nhưng chưa ảnh hưởng PixiJS viewport |
| P1 | Subtitle Overlay | TextNode tồn tại nhưng chưa render text lên canvas |
| P1 | Audio Playback | TTS audio chưa play trong timeline |
| P2 | Multi-scene / Cuts | Chỉ có 1 scene, chưa có transitions |
| P2 | One-Click Full Auto | Chưa có endpoint tổng hợp toàn pipeline |
| P3 | BGM Selection | Chưa có BGM library và auto-selection |

---

## Milestones hướng tới Professional Auto Film

### 🏁 Milestone 1: "Interactive Film Editor" (Hiện tại → +1 tuần)

> User paste script → xem nhân vật diễn xuất trên bối cảnh 2.5D. Có thể play, adjust, export.

**Tasks cần hoàn thành:**

| Task | Chi tiết | File |
|------|----------|------|
| M1.1 | Background Selector dropdown trong ScriptImport | `ScriptImport.tsx` |
| M1.2 | Camera render (CameraNode → PixiJS viewport transform) | `SceneRenderer.tsx` |
| M1.3 | Camera automation trong pipeline (zoom vào nhân vật đang nói) | `automation.py` |
| M1.4 | Cleanup: xóa file test rác, fix hardcoded values | Project root |

**Kết quả**: Editor hoàn chỉnh cho phép script-driven filmmaking thủ công.

---

### 🏁 Milestone 2: "Talking Film" (+2 tuần)

> Video có tiếng nói (TTS), miệng khớp thoại, và phụ đề.

**Tasks:**

| Task | Chi tiết | File |
|------|----------|------|
| M2.1 | Audio timeline playback (play TTS audio sync với animation) | `SceneRenderer.tsx`, stores |
| M2.2 | TTS auto-generate trong pipeline | `automation.py` + `tts.py` |
| M2.3 | Lip-sync cải tiến (audio-driven thay vì timing heuristic) | `automation.py` |
| M2.4 | Subtitle render (TextNode → PixiJS Text overlay) | `SceneRenderer.tsx` |
| M2.5 | Audio in video export (merge canvas + audio → MP4) | `VideoExporter.ts` |

**Kết quả**: Video xuất ra có giọng nói, lip-sync, và phụ đề — như phim hoạt hình thật.

---

### 🏁 Milestone 3: "AI Director" (+3 tuần)

> AI tự viết kịch bản, chọn nhân vật, chọn bối cảnh — user chỉ input ý tưởng.

**Tasks:**

| Task | Chi tiết | File mới |
|------|----------|----------|
| M3.1 | AI Script Writer Agent (input: idea → output: full script) | `agents/script_writer.py` |
| M3.2 | AI Scene Planner Agent (chọn characters, background, camera style) | `agents/scene_planner.py` |
| M3.3 | Stage Scanner (scan toàn bộ stages/ → registry giống AssetRegistry) | `scene_graph/stage_scanner.py` |
| M3.4 | One-Click API: `/api/auto-video/generate` | `routers/auto_video.py` |
| M3.5 | AutoVideoPanel UI (textarea + style options + generate button) | `AutoVideoPanel.tsx` |

**Pipeline:**
```
User idea → Script Writer → Scene Planner → build_scene_from_script() 
    → TTS → Lip-sync → Subtitle → SceneGraph JSON
```

**Kết quả**: User nhập 1 câu mô tả → AI sản xuất ra video hoàn chỉnh.

---

### 🏁 Milestone 4: "Professional Studio" (+5 tuần)

> Multi-scene video, camera cuts, BGM, transitions — chất lượng YouTube.

**Tasks:**

| Task | Chi tiết |
|------|----------|
| M4.1 | Multi-scene project (VideoProject class) |
| M4.2 | Scene transitions (cut, fade, dissolve) |
| M4.3 | BGM library + auto-selection based on mood |
| M4.4 | Advanced camera (dolly, tracking shot, rack focus) |
| M4.5 | Resolution selector (720p, 1080p, 4K) |
| M4.6 | Server-side render (FFmpeg backend, batch export) |
| M4.7 | SFX library (footsteps, door open, ambient) |

**Kết quả**: Video chất lượng chuyên nghiệp, nhiều cảnh, nhạc nền, hiệu ứng camera.

---

### 🏁 Milestone 5: "Content Factory" (+8 tuần)

> Sản xuất hàng loạt video tự động — content cho TikTok/YouTube/Douyin.

**Tasks:**

| Task | Chi tiết |
|------|----------|
| M5.1 | Batch video generation API |
| M5.2 | Template system (genre templates: comedy, romance, horror) |
| M5.3 | Series mode (tự động tạo tập 1, 2, 3... cùng nhân vật) |
| M5.4 | Auto thumbnail generation |
| M5.5 | Asset library expansion (100+ characters, 50+ stages) |
| M5.6 | Voice cloning integration (custom character voices) |
| M5.7 | Multi-language TTS (中文, Tiếng Việt, English, 日本語) |

---

## Nguyên tắc phát triển từng Milestone

### 1. Tư duy Studio — Linh hoạt cho Agent

```
Thiết kế mỗi module như một "phòng ban" trong studio phim:
- Script Department  → script_writer.py, script_analyzer_agent.py
- Casting Department → scene_planner.py, asset_scanner.py  
- Stage Department   → stage_analyzer_agent.py, stage_scanner.py
- Recording Studio   → tts.py, lip-sync
- Editing Room       → automation.py (director pipeline)
- Post Production    → VideoExporter, subtitle, BGM
- Distribution       → batch export, thumbnail gen

Mỗi "phòng ban" hoạt động INDEPENDENT — có thể được gọi riêng lẻ
hoặc orchestrate bởi AI agent (orchestrator.py).
```

### 2. Mỗi module phải có 3 chế độ hoạt động

```python
# 1. MANUAL — User thao tác tay
#    User chọn background từ dropdown, kéo nhân vật vào canvas

# 2. SEMI-AUTO — AI gợi ý, user duyệt
#    AI suggest background + characters, user approve/modify

# 3. FULL-AUTO — AI tự quyết định tất cả
#    AI chọn hết, user chỉ xem kết quả + fine-tune nếu muốn
```

### 3. Backward Compatibility

```
Mỗi milestone BUILD ON TOP of milestone trước:
- M2 không break M1
- M3 không break M2
- Features cũ ALWAYS work
- Thêm parameters mới = OPTIONAL với default values
```

### 4. Test-Driven

```
Mỗi feature mới phải kèm:
1. Unit test (python file test tạm)
2. API test (curl command)  
3. Browser test (screenshot/recording)
4. MỚI ĐƯỢC merge/commit
```

---

## Dependencies cần cài đặt (hiện tại)

```
# Backend
pip install fastapi uvicorn[standard] pydantic sqlalchemy
pip install google-genai          # Gemini API
pip install psd-tools pillow      # PSD processing
pip install volcengine-python-sdk # TTS (optional)

# Frontend
cd frontend-react
npm install
# Core: react, pixi.js@8, zustand, zundo
# UI: @radix-ui/*, lucide-react, tailwindcss
# Timeline: @xzdarcy/react-timeline-editor
```

---

## Schema Reference — Khi cần tạo module mới

### Tạo Agent mới

```python
# File: backend/core/agents/my_new_agent.py
import logging
from ..ai_config import get_ai_config

logger = logging.getLogger(__name__)

class MyNewAgent:
    @staticmethod
    def run(input_data):
        config = get_ai_config()
        if not config.has_api_key:
            logger.warning("No API key. Falling back to heuristic.")
            return fallback_result

        max_attempts = config.total_keys
        for attempt in range(max_attempts):
            try:
                from google import genai
                client = genai.Client(api_key=config.api_key)
                response = client.models.generate_content(
                    model="gemini-2.0-flash",
                    contents=prompt,
                )
                return parse_response(response.text)
            except Exception as e:
                if "429" in str(e) or "quota" in str(e):
                    config.rotate_key()
                    continue
                logger.error(f"Agent failed: {e}")
                return fallback_result
        return fallback_result
```

### Tạo Router mới

```python
# File: backend/routers/my_new_router.py
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/my-feature", tags=["my-feature"])

class MyRequest(BaseModel):
    param: str

@router.post("/action")
async def my_action(req: MyRequest):
    # ... logic ...
    return {"success": True, "data": result}

# Register in main.py:
# from backend.routers import my_new_router
# app.include_router(my_new_router.router)
```
