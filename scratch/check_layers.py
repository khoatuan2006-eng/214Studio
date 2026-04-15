# -*- coding: utf-8 -*-
"""Check sub-crop element files for transparency"""
import os, re, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from PIL import Image

d = r"d:\AnimeStudio_Project\backend\storage\stages"
bg_id = "4S\u5e97_1760984889936"

all_files = os.listdir(d)

# Get BASE element files (e.g. _element_1.png) 
base_elements = [
    f for f in all_files
    if f.startswith(bg_id) and f.endswith(".png")
    and "_element_" in f
    and not re.search(r'_element_\d+_\d+\.png$', f)
]

# Get SUB-CROP element files (e.g. _element_1_1.png)
sub_elements = [
    f for f in all_files
    if f.startswith(bg_id) and f.endswith(".png")
    and "_element_" in f
    and re.search(r'_element_\d+_\d+\.png$', f)
]

def get_idx(fname):
    m = re.search(r'element_(\d+)', fname)
    return int(m.group(1)) if m else 0

print(f"=== BASE elements (used by renderer): {len(base_elements)} ===")
for f in sorted(base_elements, key=get_idx)[:3]:
    img = Image.open(os.path.join(d, f))
    has_alpha = img.mode in ('RGBA', 'LA', 'PA')
    if has_alpha:
        alpha = img.split()[-1]
        total = alpha.size[0] * alpha.size[1]
        transp = sum(1 for p in alpha.getdata() if p < 10)
        opaque_pct = ((total - transp) / total) * 100
    else:
        opaque_pct = 100.0
    print(f"  {f[:60]:60s} {img.size}  {img.mode}  opaque={opaque_pct:.1f}%")

print(f"\n=== SUB-CROP elements: {len(sub_elements)} ===")
# Check first few sub-crops for each element index
checked_indices = set()
for f in sorted(sub_elements, key=get_idx):
    idx = get_idx(f)
    if idx in checked_indices:
        continue
    checked_indices.add(idx)
    img = Image.open(os.path.join(d, f))
    has_alpha = img.mode in ('RGBA', 'LA', 'PA')
    if has_alpha:
        alpha = img.split()[-1]
        total = alpha.size[0] * alpha.size[1]
        transp = sum(1 for p in alpha.getdata() if p < 10)
        opaque_pct = ((total - transp) / total) * 100
    else:
        opaque_pct = 100.0
    print(f"  {f[:60]:60s} {img.size}  {img.mode}  opaque={opaque_pct:.1f}%")
    if len(checked_indices) >= 10:
        break

# Also check the composite images (____1.png)
composites = [f for f in all_files if f.startswith(bg_id) and "____1" in f and "_element_" not in f]
print(f"\n=== COMPOSITE files: {len(composites)} ===")
for f in sorted(composites):
    img = Image.open(os.path.join(d, f))
    print(f"  {f[:60]:60s} {img.size}  {img.mode}")

# Also check another bg_id that uses a different format (like Layer_1.png)
other_bgs = [f for f in all_files if "Layer_1" in f]
print(f"\n=== Layer_1 style files: {len(other_bgs)} ===")
for f in sorted(other_bgs)[:5]:
    img = Image.open(os.path.join(d, f))
    has_alpha = img.mode in ('RGBA','LA','PA')
    if has_alpha:
        alpha = img.split()[-1]
        total = alpha.size[0] * alpha.size[1]
        transp = sum(1 for p in alpha.getdata() if p < 10)
        opaque_pct = ((total - transp) / total) * 100
    else:
        opaque_pct = 100.0
    print(f"  {f[:60]:60s} {img.size}  {img.mode}  opaque={opaque_pct:.1f}%")
