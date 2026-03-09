"""
Ghép các PNG layers thành file PSD thật có layers.

Dùng sau khi chạy export_fla_to_psd.jsfl trong Adobe Animate.
Input:  thư mục chứa các PNG (mỗi file = 1 layer)
Output: file .psd có đầy đủ layers

Cài đặt: pip install psd-tools Pillow
"""

import os
import sys
import struct
from pathlib import Path
from PIL import Image


def create_psd_from_pngs(input_dir: str, output_path: str):
    """
    Đọc tất cả PNG trong folder → tạo file PSD có layers.
    Tên file PNG = tên layer trong PSD.
    """
    input_dir = Path(input_dir)
    png_files = sorted(input_dir.glob("*.png"))

    if not png_files:
        print(f"❌ Không tìm thấy file PNG nào trong: {input_dir}")
        return

    print(f"📂 Tìm thấy {len(png_files)} layers")

    # Load tất cả images
    layers = []
    max_w, max_h = 0, 0
    for png in png_files:
        img = Image.open(png).convert("RGBA")
        name = png.stem
        # Bỏ prefix số (0_, 1_, ...) nếu có
        if "_" in name and name.split("_")[0].isdigit():
            name = "_".join(name.split("_")[1:])
        layers.append({"name": name, "image": img})
        max_w = max(max_w, img.width)
        max_h = max(max_h, img.height)
        print(f"  ✓ {name} ({img.width}×{img.height})")

    # Tạo PSD file
    print(f"\n🔨 Tạo PSD: {max_w}×{max_h}, {len(layers)} layers...")
    _write_psd(output_path, max_w, max_h, layers)
    
    file_size = os.path.getsize(output_path)
    print(f"✅ Đã tạo: {output_path} ({file_size / 1024 / 1024:.1f} MB)")


def _write_psd(path: str, width: int, height: int, layers: list):
    """
    Viết file PSD thủ công (không cần psd-tools).
    Hỗ trợ RGBA layers.
    """
    num_layers = len(layers)

    with open(path, "wb") as f:
        # ══════════════════════════════════════
        # 1. FILE HEADER
        # ══════════════════════════════════════
        f.write(b"8BPS")                    # signature
        f.write(struct.pack(">H", 1))       # version
        f.write(b"\x00" * 6)                # reserved
        f.write(struct.pack(">H", 4))       # channels (RGBA)
        f.write(struct.pack(">I", height))  # height
        f.write(struct.pack(">I", width))   # width
        f.write(struct.pack(">H", 8))       # bits per channel
        f.write(struct.pack(">H", 3))       # color mode: RGB

        # ══════════════════════════════════════
        # 2. COLOR MODE DATA (empty for RGB)
        # ══════════════════════════════════════
        f.write(struct.pack(">I", 0))

        # ══════════════════════════════════════
        # 3. IMAGE RESOURCES (minimal)
        # ══════════════════════════════════════
        f.write(struct.pack(">I", 0))

        # ══════════════════════════════════════
        # 4. LAYER AND MASK INFORMATION
        # ══════════════════════════════════════
        layer_section = _build_layer_section(width, height, layers)
        f.write(struct.pack(">I", len(layer_section)))
        f.write(layer_section)

        # ══════════════════════════════════════
        # 5. IMAGE DATA (merged/flattened)
        # ══════════════════════════════════════
        # Composite all layers for the merged image
        merged = Image.new("RGBA", (width, height), (255, 255, 255, 255))
        for layer in layers:
            img = layer["image"]
            # Center the layer if smaller than canvas
            x = (width - img.width) // 2
            y = (height - img.height) // 2
            merged.paste(img, (x, y), img)

        # Write raw channel data (compression = 0, raw)
        f.write(struct.pack(">H", 0))  # compression: raw
        r, g, b, a = merged.split()
        f.write(r.tobytes())
        f.write(g.tobytes())
        f.write(b.tobytes())
        f.write(a.tobytes())


def _build_layer_section(width: int, height: int, layers: list) -> bytes:
    """Build the Layer and Mask Information section."""
    import io
    buf = io.BytesIO()

    # Layer info
    layer_info = _build_layer_info(width, height, layers)
    buf.write(struct.pack(">I", len(layer_info)))
    buf.write(layer_info)

    # Global layer mask info (empty)
    buf.write(struct.pack(">I", 0))

    return buf.getvalue()


def _build_layer_info(width: int, height: int, layers: list) -> bytes:
    """Build layer records + channel image data."""
    import io
    buf = io.BytesIO()

    # Layer count (negative = first alpha channel is transparency)
    buf.write(struct.pack(">h", -len(layers)))

    # Prepare channel data for each layer
    all_channel_data = []

    for layer in layers:
        img = layer["image"].copy()
        name = layer["name"]

        # Resize/pad to canvas size
        if img.size != (width, height):
            padded = Image.new("RGBA", (width, height), (0, 0, 0, 0))
            x = (width - img.width) // 2
            y = (height - img.height) // 2
            padded.paste(img, (x, y), img)
            img = padded

        r, g, b, a = img.split()
        channels = {
            -1: a.tobytes(),  # transparency
            0: r.tobytes(),
            1: g.tobytes(),
            2: b.tobytes(),
        }
        all_channel_data.append(channels)

        # ── Layer record ──
        top, left, bottom, right = 0, 0, height, width
        buf.write(struct.pack(">i", top))
        buf.write(struct.pack(">i", left))
        buf.write(struct.pack(">i", bottom))
        buf.write(struct.pack(">i", right))

        # Number of channels
        buf.write(struct.pack(">H", 4))  # RGBA = 4 channels

        # Channel info (id + data length)
        for ch_id in [-1, 0, 1, 2]:
            data_len = len(channels[ch_id]) + 2  # +2 for compression type
            buf.write(struct.pack(">h", ch_id))
            buf.write(struct.pack(">I", data_len))

        # Blend mode signature
        buf.write(b"8BIM")
        buf.write(b"norm")  # normal blend mode

        # Opacity, clipping, flags, filler
        buf.write(struct.pack(">B", 255))   # opacity
        buf.write(struct.pack(">B", 0))     # clipping
        buf.write(struct.pack(">B", 0))     # flags
        buf.write(struct.pack(">B", 0))     # filler

        # Extra data
        extra = io.BytesIO()
        # Layer mask data (empty)
        extra.write(struct.pack(">I", 0))
        # Blending ranges (empty)
        extra.write(struct.pack(">I", 0))
        # Layer name (Pascal string, padded to 4 bytes)
        name_bytes = name.encode("ascii", errors="replace")[:255]
        name_len = len(name_bytes)
        extra.write(struct.pack(">B", name_len))
        extra.write(name_bytes)
        # Pad to multiple of 4
        total_name = 1 + name_len
        if total_name % 4 != 0:
            extra.write(b"\x00" * (4 - total_name % 4))

        extra_bytes = extra.getvalue()
        buf.write(struct.pack(">I", len(extra_bytes)))
        buf.write(extra_bytes)

    # ── Channel image data ──
    for channels in all_channel_data:
        for ch_id in [-1, 0, 1, 2]:
            buf.write(struct.pack(">H", 0))  # compression: raw
            buf.write(channels[ch_id])

    return buf.getvalue()


# ══════════════════════════════════════
#  CLI
# ══════════════════════════════════════

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Cách dùng:")
        print("  python png_to_psd.py <thư_mục_PNG>")
        print("  python png_to_psd.py <thư_mục_PNG> <output.psd>")
        print()
        print("Ví dụ:")
        print("  python png_to_psd.py ./psd_export/character_frame1/")
        print("  python png_to_psd.py ./psd_export/character_frame1/ character.psd")
        sys.exit(1)

    input_dir = sys.argv[1]
    if len(sys.argv) >= 3:
        output_path = sys.argv[2]
    else:
        output_path = os.path.basename(input_dir.rstrip("/\\")) + ".psd"

    create_psd_from_pngs(input_dir, output_path)
