#!/usr/bin/env python3
"""Extract FLA XML content to file and analyze shapes."""
import zipfile
import os

FLA_PATH = r"D:\tài nguyên\oss\20251021\一乐拉面店内（座位）_1760983420697.fla"
OUT = r"D:\AnimeStudio_Project\fla_extracted"

os.makedirs(OUT, exist_ok=True)

z = zipfile.ZipFile(FLA_PATH, 'r')

# Extract all files
z.extractall(OUT)
print(f"Extracted to: {OUT}")

# Show what was extracted
for root, dirs, files in os.walk(OUT):
    for f in files:
        fp = os.path.join(root, f)
        sz = os.path.getsize(fp)
        rp = os.path.relpath(fp, OUT)
        print(f"  {rp} ({sz} bytes)")

z.close()
print("Done!")
