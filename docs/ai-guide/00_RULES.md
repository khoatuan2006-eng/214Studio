# 00 — Nguyên tắc bất di bất dịch

> **Mọi AI agent phải tuân thủ 100% các nguyên tắc này. Vi phạm = phá dự án.**

---

## 🔴 Nguyên tắc #1: NÂNG CẤP, KHÔNG PHÁ CODE

```
❌ SAI:  Xóa code cũ → viết lại từ đầu
✅ ĐÚNG: Thêm code mới bao quanh code cũ, giữ nguyên logic đã hoạt động
```

Khi được yêu cầu "nâng cấp" hoặc "thêm tính năng":
1. **ĐỌC** toàn bộ file trước khi chỉnh sửa
2. **HIỂU** logic hiện tại đang làm gì
3. **THÊM** code mới — KHÔNG xóa code cũ trừ khi có lý do rõ ràng
4. **SO SÁNH** số dòng trước/sau — nếu xóa > 10 dòng, phải giải thích tại sao

### Ví dụ cụ thể

**Yêu cầu**: "Thêm multi-layer background vào automation.py"

```python
# ❌ SAI — Xóa hết logic cũ
def build_scene_from_script(...):
    # Viết lại hoàn toàn từ đầu...

# ✅ ĐÚNG — Thêm branch mới, giữ fallback cũ
def build_scene_from_script(..., background_id=None):
    # ... code cũ giữ nguyên ...
    
    # NEW: Multi-layer FLA background support
    if background_id:
        element_files = scan_fla_layers(background_id)
        if element_files:
            # New multi-layer logic
            for f in element_files:
                graph.add_node(BackgroundLayerNode(...))
        else:
            # FALLBACK: Single static background (code cũ giữ nguyên)
            graph.add_node(BackgroundLayerNode(asset_path=single_bg_url))
```

---

## 🔴 Nguyên tắc #2: ĐỌC CODE TRƯỚC KHI VIẾT

Trước khi chạm vào bất kỳ file nào, **phải đọc ít nhất**:
1. File mục tiêu (toàn bộ)
2. Các file liên quan trực tiếp (import dependencies)
3. Tài liệu docs/ai-guide/ liên quan

### Checklist bắt buộc

```
□ Đã đọc file mục tiêu từ dòng 1 đến dòng cuối?
□ Đã hiểu data flow vào/ra của function cần chỉnh?
□ Đã check xem dự án ĐÃ CÓ SẴN module/function nào làm việc tương tự chưa?
□ Đã đọc docs/ai-guide/ phần liên quan?
```

**Ví dụ thực tế đã xảy ra**: AI được yêu cầu "thêm FLA background", nhưng KHÔNG đọc `tools/export_fla_to_psd.jsfl` và `stage_analyzer_agent.py` — dẫn đến viết lại logic extract FLA từ đầu, trong khi dự án **đã có sẵn pipeline hoàn chỉnh**.

---

## 🔴 Nguyên tắc #3: TEST TRƯỚC KHI BÁO CÁO

```
❌ SAI:  "Tôi đã hoàn thành việc X" (không test)
✅ ĐÚNG: "Tôi đã hoàn thành việc X. Test results: [kèm output thật]"
```

### Mức test tối thiểu

| Loại thay đổi | Test bắt buộc |
|---------------|---------------|
| Backend Python | `python -m py_compile <file>` + unit test script tạo tạm |
| Frontend TypeScript | `npx tsc --noEmit` hoặc chạy dev server xác nhận không lỗi |
| API endpoint | `curl` hoặc browser test gọi endpoint, kèm response output |
| UI component | Mở browser, chụp screenshot, kèm vào báo cáo |
| Full pipeline | Mở web → thao tác UI → verify kết quả → chụp ảnh |

### Quy trình test

```
1. Viết code xong
2. Chạy syntax check (py_compile / tsc --noEmit)
3. Chạy unit test tạm (tạo file test_xxx.py, chạy, rồi xóa)
4. Mở browser, test trên giao diện thật
5. Chụp screenshot / ghi recording
6. MỚI ĐƯỢC BÁO CÁO "hoàn thành"
```

---

## 🔴 Nguyên tắc #4: HIỂU KIẾN TRÚC NHÂN VẬT

Đây là điều AI agent hay sai nhất. Hệ thống nhân vật KHÔNG phải skeletal animation.

```
Nhân vật = 2 lớp PNG chồng lên nhau:
┌──────────────┐
│   face.png   │  ← Biểu cảm (微笑, 大笑, 惊讶...)
│  (overlay)   │     97 biểu cảm / nhân vật
├──────────────┤
│   pose.png   │  ← Tư thế (站立, 打招呼, 坐着...)
│  (base body) │     28 tư thế / nhân vật
└──────────────┘

Animation = SWAP ảnh theo thời gian (frameSequence)
  t=0.0s → pose="站立", face="微笑"
  t=1.0s → pose="打招呼", face="大笑"
  t=2.5s → pose="站立", face="说话"
```

**KHÔNG BAO GIỜ**:
- Cố tạo bone/skeleton system
- Tween giữa 2 poses (không interpolate ảnh, chỉ STEP swap)
- Xóa bỏ hệ thống pose/face vì "lỗi thời"

---

## 🔴 Nguyên tắc #5: HIỂU HỆ THỐNG BỐI CẢNH FLA

Bối cảnh (background/stage) được tạo từ file `.fla` (Adobe Animate). Pipeline:

```
file.fla
  → Adobe Animate chạy export_fla_to_psd.jsfl
  → Xuất từng layer thành _element_N.png
  → Copy vào backend/storage/stages/
  → automation.py đọc các _element_N.png
  → Mỗi element → 1 BackgroundLayerNode với z_index + parallax
```

### Quy tắc z_index

```
z = -50..-5   → Background layers (tường, trời, sàn)
z = 0..20     → Characters (nhân vật đứng ở đây)
z = 25..85+   → Foreground layers (bàn, ghế, cây tiền cảnh)
```

### Hệ thống tên file

```
4S店_1760984889936____1_element_1.png   ← Layer 1 (xa nhất, z=-50)
4S店_1760984889936____1_element_2.png   ← Layer 2 (z=-35)
...
4S店_1760984889936____1_element_10.png  ← Layer 10 (gần nhất, z=85)

❌ 4S店_..._element_1_1.png  ← Sub-crop (BỎ QUA, regex filter)
```

---

## 🔴 Nguyên tắc #6: GIỮ TƯƠNG THÍCH

Mọi thay đổi phải giữ backward compatibility:

```python
# ✅ Thêm parameter mới với default value
def build_scene_from_script(lines, character_map, 
                            background_id=None,    # NEW (optional)
                            registry=None):

# ❌ Thay đổi signature cũ
def build_scene_from_script(lines, character_map, background_id, registry):
```

API response format: CHỈ THÊM fields mới, KHÔNG bao giờ xóa/đổi tên fields cũ.

---

## 🔴 Nguyên tắc #7: CONVENTIONS

### Naming

| Ngữ cảnh | Convention | Ví dụ |
|----------|-----------|-------|
| Python files | snake_case | `stage_analyzer_agent.py` |
| Python classes | PascalCase | `BackgroundLayerNode` |
| TypeScript files | PascalCase hoặc camelCase | `SceneGraphManager.ts` |
| API endpoints | kebab-case | `/api/automation/script-to-scene` |
| Node IDs | `{type}-{identifier}` | `bg-4S店-1`, `character-1804a50e` |
| Asset names | Chinese characters | `站立`, `微笑`, `打招呼` |

### Backend easing ↔ Frontend easing

```
Python: "ease_out"    → TypeScript: "easeOut"
Python: "ease_in"     → TypeScript: "easeIn"  
Python: "ease_in_out" → TypeScript: "easeInOut"
Python: "step"        → TypeScript: "step"
Python: "linear"      → TypeScript: "linear"
```

Frontend `SceneGraphManager.ts` đã có bộ normalize easing. Backend cứ dùng snake_case.

### Coordinates

```
World Units: 1 unit = 100 pixels (PPU = 100)
Canvas: 1920×1080 pixels = 19.2 × 10.8 units
Center: (9.6, 5.4)
Character default Y: 7.5 (đứng trên "sàn")
Character scale: 0.25 (25% kích thước gốc)
```

---

## 🟡 Nguyên tắc #8: ĐỂ DỌN RÁC

Sau khi hoàn thành task, DỌN:
- Xóa file test tạm (`test_*.py`, `test_*.js`)
- Không commit file scratch/debug vào source
- Không để `print()` debug trong code production

---

## 🟡 Nguyên tắc #9: SỬ DỤNG LẠI MODULE ĐÃ CÓ

Trước khi viết code mới, **KIỂM TRA** xem module đã tồn tại chưa:

| Cần làm gì | Module đã có |
|------------|-------------|
| Quản lý API keys Gemini, rotation | `backend/core/ai_config.py` |
| Parse PSD thành layers | `backend/core/psd_processor.py`, `psd_smart_parser.py` |
| Quét asset characters | `backend/core/scene_graph/asset_scanner.py` |
| AI phân tích stage elements | `backend/core/agents/stage_analyzer_agent.py` |
| AI phân tích script (pose/face/movement) | `backend/core/agents/script_analyzer_agent.py` |
| Export FLA thành PNG layers | `tools/export_fla_to_psd.jsfl` |
| TTS Volcengine | `backend/routers/tts.py` |
| Keyframe interpolation (backend) | `backend/core/scene_graph/keyframe.py` |
| Keyframe interpolation (frontend) | `frontend-react/src/core/scene-graph/keyframe.ts` |
| Scene Graph tools (16 AI functions) | `backend/core/scene_graph/tools.py` |
| Video export (WebM) | `frontend-react/src/core/export/VideoExporter.ts` |
