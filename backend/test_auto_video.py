import requests
import json

url = "http://localhost:8001/api/auto-video/generate"
payload = {
    "prompt": "Một cô gái đang đứng dưới gốc cây ở công viên, bỗng một chàng trai nhút nhát từ phía cây bước ra ngỏ lời làm quen."
}

try:
    resp = requests.post(url, json=payload)
    if resp.status_code == 200:
        data = resp.json()
        print("SUCCESS! Scene generated with message:", data.get("message"))
        with open("test_auto_video.json", "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    else:
        print("FAILED:", resp.status_code, resp.text)
except Exception as e:
    print("ERROR:", e)
