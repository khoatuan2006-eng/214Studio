"""Test automation module: SRT parser, face/pose resolution."""
import sys
sys.path.insert(0, "d:/AnimeStudio_Project")

from backend.routers.automation import parse_srt, resolve_face, resolve_pose

# Test SRT parser
srt = """1
00:00:00,000 --> 00:00:02,500
Hoa: Chao ban!

2
00:00:03,000 --> 00:00:05,500
Nam: Di dao khong?
"""

parsed = parse_srt(srt)
assert len(parsed) == 2, f"Expected 2 lines, got {len(parsed)}"
assert parsed[0]["character"] == "Hoa"
assert parsed[1]["character"] == "Nam"
assert abs(parsed[0]["start_time"] - 0.0) < 0.01
assert abs(parsed[0]["end_time"] - 2.5) < 0.01
print(f"[OK] SRT parsed: {len(parsed)} lines")
for p in parsed:
    print(f"  [{p['start_time']:.1f}-{p['end_time']:.1f}s] {p['character']}: {p['text']}")

# Test face resolution
faces = ["微笑", "大笑", "发怒", "说话", "大吼", "难过", "害怕", "惊讶", "无表情"]
assert resolve_face("happy", faces) == "微笑"
assert resolve_face("angry", faces) == "发怒"
assert resolve_face("sad", faces) == "难过"
assert resolve_face("vui", faces) == "微笑"
assert resolve_face("", faces) == "微笑"
assert resolve_face("giận", faces) == "发怒"
print("\n[OK] Face resolution tests passed")

# Test pose resolution
poses = ["站立", "走路", "挥手", "坐下", "跑步"]
assert resolve_pose("stand", poses) == "站立"
assert resolve_pose("walk", poses) == "走路"
assert resolve_pose("đứng", poses) == "站立"
assert resolve_pose("", poses) == "站立"
print("[OK] Pose resolution tests passed")

print("\n✅ All automation tests passed!")
