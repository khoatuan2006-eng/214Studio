"""
🚀 Qwen Model Server cho AnimeStudio — Chạy trên Google Colab
==============================================================
Hướng dẫn: Copy từng cell vào Google Colab và chạy tuần tự.

Model được cache trên Google Drive → không cần tải lại mỗi session.
Server expose qua ngrok → AnimeStudio kết nối từ máy local.
"""

# ╔══════════════════════════════════════════════════════════════╗
# ║  CELL 1: Mount Google Drive + Cài đặt thư viện             ║
# ╚══════════════════════════════════════════════════════════════╝

# --- Chạy cell này đầu tiên ---
"""
from google.colab import drive
drive.mount('/content/drive')

!pip install -q vllm huggingface_hub pyngrok

import os
os.makedirs("/content/drive/MyDrive/qwen_models", exist_ok=True)
print("✅ Drive mounted + packages installed")
"""

# ╔══════════════════════════════════════════════════════════════╗
# ║  CELL 2: Tải model về Drive (chỉ chạy LẦN ĐẦU)           ║
# ╚══════════════════════════════════════════════════════════════╝

# --- Chạy cell này 1 lần duy nhất, lần sau bỏ qua ---
"""
from huggingface_hub import snapshot_download
import os

# ═══ CHỌN MODEL ═══
# Bỏ comment model bạn muốn dùng:

# Option A: Qwen3-30B-A3B (Text, MoE, chỉ 3B active → nhanh)
MODEL_ID = "Qwen/Qwen3-30B-A3B"

# Option B: Qwen3-8B (Text, dense, cân bằng)
# MODEL_ID = "Qwen/Qwen3-8B"

# Option C: Qwen3-VL-8B (Vision + Text, cho Reviewer Agent)
# MODEL_ID = "Qwen/Qwen3-VL-8B-Instruct"


# Tải về Drive
DRIVE_MODEL_DIR = f"/content/drive/MyDrive/qwen_models/{MODEL_ID.split('/')[-1]}"

if os.path.exists(DRIVE_MODEL_DIR) and len(os.listdir(DRIVE_MODEL_DIR)) > 5:
    print(f"✅ Model đã có sẵn trên Drive: {DRIVE_MODEL_DIR}")
else:
    print(f"⏬ Đang tải {MODEL_ID} về Drive...")
    snapshot_download(
        repo_id=MODEL_ID,
        local_dir=DRIVE_MODEL_DIR,
        local_dir_use_symlinks=False,
    )
    print(f"✅ Tải xong! Saved to: {DRIVE_MODEL_DIR}")
"""

# ╔══════════════════════════════════════════════════════════════╗
# ║  CELL 3: Copy model từ Drive → local (nhanh hơn inference) ║
# ╚══════════════════════════════════════════════════════════════╝

# --- Chạy cell này mỗi lần mở Colab ---
"""
import shutil, os

MODEL_NAME = "Qwen3-30B-A3B"  # ← Đổi theo model bạn chọn ở Cell 2
# MODEL_NAME = "Qwen3-8B"
# MODEL_NAME = "Qwen3-VL-8B-Instruct"

DRIVE_PATH = f"/content/drive/MyDrive/qwen_models/{MODEL_NAME}"
LOCAL_PATH = f"/content/models/{MODEL_NAME}"

if not os.path.exists(LOCAL_PATH):
    print(f"📋 Copying model từ Drive → local disk (nhanh hơn cho inference)...")
    shutil.copytree(DRIVE_PATH, LOCAL_PATH)
    print(f"✅ Done! Model tại: {LOCAL_PATH}")
else:
    print(f"✅ Model đã có ở local: {LOCAL_PATH}")
"""

# ╔══════════════════════════════════════════════════════════════╗
# ║  CELL 4: Khởi động vLLM Server                             ║
# ╚══════════════════════════════════════════════════════════════╝

# --- Chạy cell này để start API server ---
"""
import subprocess, time

MODEL_NAME = "Qwen3-30B-A3B"  # ← Đổi theo model
LOCAL_PATH = f"/content/models/{MODEL_NAME}"

# Start vLLM server
process = subprocess.Popen(
    [
        "python", "-m", "vllm.entrypoints.openai.api_server",
        "--model", LOCAL_PATH,
        "--max-model-len", "8192",
        "--port", "8000",
        "--trust-remote-code",
        "--dtype", "auto",
        "--gpu-memory-utilization", "0.90",
    ],
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
)

# Đợi server ready
print("⏳ Đang khởi động vLLM server...")
for i in range(120):
    time.sleep(2)
    try:
        import urllib.request
        urllib.request.urlopen("http://localhost:8000/health")
        print("✅ vLLM server READY!")
        break
    except:
        if i % 5 == 0:
            print(f"   ...đang load model ({i*2}s)")
else:
    print("❌ Timeout! Kiểm tra log bên dưới:")
    print(process.stdout.read().decode()[-2000:])
"""

# ╔══════════════════════════════════════════════════════════════╗
# ║  CELL 5: Expose ra internet bằng ngrok                     ║
# ╚══════════════════════════════════════════════════════════════╝

# --- Chạy cell này để lấy URL public ---
"""
from pyngrok import ngrok

# ═══ QUAN TRỌNG: Đăng ký free tại https://ngrok.com ═══
# Paste auth token vào đây:
NGROK_TOKEN = "YOUR_NGROK_AUTH_TOKEN"

ngrok.set_auth_token(NGROK_TOKEN)
tunnel = ngrok.connect(8000)

API_URL = f"{tunnel.public_url}/v1"

print("=" * 60)
print(f"🎉 API URL cho AnimeStudio:")
print(f"   {API_URL}")
print("=" * 60)
print()
print("Cấu hình trong AnimeStudio:")
print(f'   Provider: "openai"')
print(f'   Base URL: "{API_URL}"')
print(f'   API Key:  "not-needed"')
print(f'   Model:    "{MODEL_NAME}"')
"""

# ╔══════════════════════════════════════════════════════════════╗
# ║  CELL 6: Test thử API                                      ║
# ╚══════════════════════════════════════════════════════════════╝

"""
from openai import OpenAI

client = OpenAI(
    api_key="not-needed",
    base_url="http://localhost:8000/v1",
)

response = client.chat.completions.create(
    model=MODEL_NAME,
    messages=[
        {"role": "system", "content": "Bạn là AI Director cho anime studio. Trả lời bằng JSON."},
        {"role": "user", "content": "Tạo scene plan cho: Cô gái đứng dưới mưa, nhìn lên bầu trời"},
    ],
    temperature=0.7,
    response_format={"type": "json_object"},
)

print("✅ API hoạt động! Response:")
print(response.choices[0].message.content[:500])
"""

# ╔══════════════════════════════════════════════════════════════╗
# ║  CELL 7 (Optional): Monitor GPU                            ║
# ╚══════════════════════════════════════════════════════════════╝

"""
!nvidia-smi
"""
