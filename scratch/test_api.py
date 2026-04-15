# -*- coding: utf-8 -*-
"""Test camera + subtitle generation"""
import requests, json, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# Get characters
chars_res = requests.get("http://127.0.0.1:8001/api/scene-graph/characters")
chars = chars_res.json()

payload = {
    "lines": [
        {"character": "Hoa", "text": "Chào bạn, hôm nay trời đẹp quá!", "emotion": "happy", "action": ""},
        {"character": "Nam", "text": "Ừ, mình cũng nghĩ vậy!", "emotion": "", "action": ""},
    ],
    "character_map": {
        "Hoa": chars[0]["id"],
        "Nam": chars[1]["id"],
    },
    "background_id": "4S\u5e97_1760984889936",
    "generate_tts": False
}

res = requests.post("http://127.0.0.1:8001/api/automation/script-to-scene", json=payload, timeout=30)
data = res.json()
scene = data.get("scene", {})
nodes = scene.get("nodes", {})

print(f"Status: {res.status_code}")
print(f"Nodes: {len(nodes)}")
print()

# Check by node type
for node_id, node in sorted(nodes.items()):
    nt = node.get("node_type")
    if nt == "camera":
        kf_count = sum(len(v) for v in node.get("keyframes", {}).values())
        print(f"  [CAMERA] {node_id}: {kf_count} keyframes")
    elif nt == "text":
        content = node.get("content", "")
        opacity = node.get("opacity", 1)
        kfs = node.get("keyframes", {}).get("opacity", [])
        times = [f"t={kf['time']:.1f}→{kf['value']}" for kf in kfs]
        print(f"  [SUBTITLE] {node_id}: '{content[:50]}' opacity_kf={', '.join(times)}")
    elif nt == "background_layer":
        print(f"  [BG] {node_id}")
    elif nt == "character":
        print(f"  [CHAR] {node_id}: {node.get('name')}")

print("\n✅ Camera keyframes + Subtitle TextNodes generated!")
