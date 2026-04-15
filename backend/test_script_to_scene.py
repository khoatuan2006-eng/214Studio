import requests
import json

payload = {
    "lines": [
        {"character": "Hoa", "text": "Chào anh, mua hoa à?", "action": "wave"},
        {"character": "Ech", "text": "Ừ, cho anh bó hồng.", "action": "walk"}
    ],
    "character_map": {
        "Hoa": "q版花店姐姐长裙_1761648249312",
        "Ech": "青蛙哥_1761648323488"
    },
    "background_id": "4S店_1760984889936"
}

resp = requests.post("http://localhost:8001/api/automation/script-to-scene", json=payload)
if resp.status_code == 200:
    data = resp.json()
    print("SUCCESS: Scene created with", len(data.get("nodes", [])), "nodes.")
    with open("test_scene.json", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
else:
    print("FAILED:", resp.status_code, resp.text)
