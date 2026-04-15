# 02 — Asset Pipeline: Từ FLA/PSD → Asset PNG → Scene Graph

## Tổng quan pipeline

AnimeStudio có 2 loại asset chính: **Nhân vật** (từ PSD) và **Bối cảnh** (từ FLA).

```
┌──────────────────────────────────────────────────────────────┐
│                    ASSET PIPELINE                            │
│                                                              │
│  ┌──────────┐     ┌───────────────┐     ┌────────────────┐  │
│  │ .psd     │ ──→ │ psd_processor │ ──→ │ extracted_psds/│  │
│  │ (Nhân vật)│     │ psd_smart    │     │  ├── 动作/*.png │  │
│  └──────────┘     │ _parser.py    │     │  └── 表情/*.png │  │
│                   └───────────────┘     └───────┬────────┘  │
│                                                 │            │
│  ┌──────────┐     ┌───────────────┐     ┌───────▼────────┐  │
│  │ .fla     │ ──→ │ export_fla_to │ ──→ │ stages/        │  │
│  │ (Bối cảnh)│     │ _psd.jsfl     │     │ *_element_N.png│  │
│  └──────────┘     └───────────────┘     └───────┬────────┘  │
│                                                 │            │
│                   ┌───────────────┐     ┌───────▼────────┐  │
│                   │ AssetRegistry │ ←── │ asset_scanner  │  │
│                   │ (runtime)     │     │ .py            │  │
│                   └───────┬───────┘     └────────────────┘  │
│                           │                                  │
│                   ┌───────▼───────┐                          │
│                   │ SceneGraph    │                          │
│                   │ nodes         │                          │
│                   └───────────────┘                          │
└──────────────────────────────────────────────────────────────┘
```

---

## A. Nhân vật (PSD → Character Assets)

### Nguồn gốc

Nhân vật được thiết kế trên website **简笔奇迹 (Jianbiqiji)** hoặc vẽ tay, export ra file `.psd`.

Mỗi file PSD chứa:
- **28 tư thế (动作/pose)**: Toàn thân nhân vật trong các tư thế khác nhau
- **97 biểu cảm (表情/face)**: Chỉ phần mặt, overlay lên tư thế
- **94 biểu cảm đậu đậu mắt (豆豆眼表情)**: Style mắt thay thế (optional)

### Quá trình extract

```python
# Backend tự động extract khi upload PSD:
# 1. psd_smart_parser.py phân tích layer groups
# 2. Tách từng layer thành file PNG riêng
# 3. Đặt tên: {tên_pose}_{hash6}.png

# Kết quả:
storage/extracted_psds/
└── Q版花店姐姐长裙_1761648249312/
    ├── 动作/                    # 28 poses
    │   ├── 站立_4e39e4.png     # Đứng
    │   ├── 打招呼_a8b2f1.png   # Vẫy tay
    │   ├── 坐着_c3d1e5.png     # Ngồi
    │   ├── 逃跑_f7a2b3.png     # Chạy trốn
    │   └── ...
    ├── 表情/                    # 97 faces
    │   ├── 微笑_1a2b3c.png     # Cười nhẹ
    │   ├── 大笑_d4e5f6.png     # Cười lớn
    │   ├── 惊讶_7g8h9i.png     # Ngạc nhiên
    │   ├── 说话_j1k2l3.png     # Đang nói (lip-sync)
    │   └── ...
    └── 豆豆眼表情/              # 94 dot-eye faces (optional)
        └── ...
```

### AssetRegistry (runtime)

Khi backend khởi động, `asset_scanner.py` quét toàn bộ thư mục:

```python
# asset_scanner.py tự động build:
registry = AssetRegistry()
# registry.characters = {
#   "Q版花店姐姐长裙_1761648249312": CharacterInfo(
#     id="Q版花店姐姐长裙_1761648249312",
#     poses={"站立": CharacterAsset(...), "打招呼": ...},
#     faces={"微笑": CharacterAsset(...), "大笑": ...},
#   )
# }

# Truy vấn:
char_info = registry.get_character("Q版花店姐姐长裙_1761648249312")
print(char_info.pose_names)  # ["站立", "打招呼", "坐着", ...]
print(char_info.face_names)  # ["微笑", "大笑", "惊讶", ...]
```

### Sử dụng trong Scene Graph

```python
# automation.py gọi SceneToolExecutor:
executor.execute("add_character", {
    "character_id": "Q版花店姐姐长裙_1761648249312",
    "name": "Cô gái",
    "x": 5.0,
    "y": 7.5,
})
# → Tạo CharacterNode với available_layers từ registry
# → Frontend load pose+face PNGs, composite bằng PixiJS
```

---

## B. Bối cảnh (FLA → Background Layers)

### Nguồn gốc

Bối cảnh được thiết kế trong **Adobe Animate** (file `.fla`). Mỗi scene chứa nhiều layers:
- Layer 1: Bầu trời / tường xa
- Layer 2-4: Tường, cửa sổ, sàn
- Layer 5-7: Nội thất (bàn, ghế, tủ)
- Layer 8-10: Tiền cảnh (chậu cây, bàn gần camera)

### Quá trình extract

```
1. Mở file .fla trong Adobe Animate
2. Chạy tools/export_fla_to_psd.jsfl (Commands → Run Command)
3. Script tự động xuất từng layer thành PNG riêng
4. Copy PNGs vào backend/storage/stages/

Kết quả:
storage/stages/
├── 4S店_1760984889936____1_element_1.png   # Layer 1 (xa nhất)
├── 4S店_1760984889936____1_element_2.png   # Layer 2
├── ...
├── 4S店_1760984889936____1_element_10.png  # Layer 10 (gần nhất)
├── 木屋内部_xxx_element_1.png             # Khác background
└── ...
```

### Sử dụng trong automation.py

```python
# automation.py tự động xử lý khi build_scene_from_script():
if background_id:
    stages_dir = os.path.join(registry.storage_dir, "stages")
    bg_files = [f for f in os.listdir(stages_dir) 
                if f.startswith(background_id) and f.endswith(".png")]
    
    # Filter: chỉ lấy _element_N.png, bỏ sub-crops _element_N_M.png
    element_files = [f for f in bg_files 
                     if "_element_" in f 
                     and not re.search(r'_element_\d+_\d+\.png$', f)]
    
    # Sort by element index
    element_files.sort(key=lambda f: int(re.search(r'element_(\d+)', f).group(1)))
    
    # Create BackgroundLayerNode for each layer
    for i, fname in enumerate(element_files):
        bg_node = BackgroundLayerNode(
            asset_path=f"/static/stages/{fname}",
            z_index=start_z + (i * z_step),        # -50, -35, -20, ... 
            parallax_speed=max(0.05, 1.0 - ...),   # xa=chậm, gần=nhanh
        )
        graph.add_node(bg_node)
```

### StageAnalyzerAgent (nâng cao)

Dự án đã có sẵn AI agent phân tích từng layer:

```python
# stage_analyzer_agent.py — dùng Vision AI
# Input:  ảnh PNG của 1 layer
# Output: ElementInfo(name_vi="bàn tiếp khách", suggested_z=15, can_sit_on=True)

# Chưa tích hợp vào pipeline tự động, nhưng đã sẵn sàng.
# Khi tích hợp, z_index sẽ dựa trên semantic analysis thay vì heuristic.
```

---

## C. Bảng tài nguyên hiện có

### Characters (đã extract)

| Nhân vật | Poses | Faces | Dot-eye |
|----------|-------|-------|---------|
| Q版花店姐姐长裙 | 28 | 97 | 94 |
| Q版蓝色挑染男 | 28 | 97 | 94 |
| 青蛙哥 | 28 | 73 | — |
| + ~24 nhân vật khác | (chưa extract) | | |

### Backgrounds (đã extract)

| Stage | Elements | Mô tả |
|-------|----------|-------|
| 4S店 (4S Shop) | 10 layers | Showroom ô tô sang trọng |
| 4S店内 | 6 layers | Bên trong cửa hàng |
| 80年代家门口 | 7 layers | Trước cửa nhà thập niên 80 |
| 木屋内部 | 29 layers | Bên trong cabin gỗ (nhiều chi tiết) |
| 末日废墟 | 4-5 layers | Phế tích ngày tận thế |
| 火影忍者忍里村 | 4 layers | Làng ninja Naruto |

---

## D. Thêm asset mới — Checklist

### Thêm nhân vật mới

```
1. Upload file .psd qua API /api/psd/upload
2. Backend tự động:
   - Parse PSD layers
   - Extract pose + face PNGs vào storage/extracted_psds/
   - Generate thumbnail
3. AssetRegistry tự động detect khi restart (hoặc gọi _registry.rescan())
4. Frontend /api/scene-graph/characters sẽ list nhân vật mới
5. automation.py character_map có thể reference nhân vật mới
```

### Thêm bối cảnh mới

```
1. Mở file .fla trong Adobe Animate
2. Chạy tools/export_fla_to_psd.jsfl
3. Copy *_element_N.png vào backend/storage/stages/
4. automation.py tự động detect (based on filename prefix)
5. Có thể chạy StageAnalyzerAgent để get semantic z_index (optional)
```
