# FLA Extract Research
# ====================
# Nghiên cứu cấu trúc file .fla (Adobe Animate XFL format)
# và các phương pháp tách đối tượng (bàn, ghế, tường, sàn...)
# thành các layer PNG riêng biệt.
#
# ## Cấu trúc thư mục
#
# ```
# research/fla_extract/
# ├── README.md              ← File này
# ├── analyze_fla.py         ← Phân tích cấu trúc XML bên trong .fla
# ├── extract_fla.py         ← Extract ZIP cơ bản (test ban đầu)
# ├── batch_export_fla.jsfl  ← JSFL script cho Adobe Animate (auto-split groups → PNGs)
# └── fla_to_stage.py        ← Python: đọc PNGs + metadata → StageNodeData JSON
# ```
#
# ## Phát hiện
#
# - File .fla = ZIP chứa XML (XFL format 2008)
# - Document chính: DOMDocument.xml (~233KB)
# - Hầu hết file: 1 layer → 1 root DOMGroup → 7-14 unnamed child groups
# - Các child group = từng đối tượng (bàn, ghế, sàn, tường...)
# - Tất cả vector art (DOMShape), không có bitmap
# - ~50% file có corrupt ZIP header (chỉ Animate mở được)
# - Tổng: 4715 file .fla trong D:\tài nguyên\oss\20251021\
#
# ## Pipeline
#
# ```
# .fla → (Animate + JSFL) → PNG layers + metadata.json → (Python) → Stage JSON
# ```
