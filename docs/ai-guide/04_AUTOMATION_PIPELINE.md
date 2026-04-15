# 04 — Automation Pipeline: Script → Scene → Video

## Tổng quan

File `backend/routers/automation.py` là **cỗ máy tạo phim tự động**. Nó nhận kịch bản text, tự dàn cảnh, và trả về SceneGraph hoàn chỉnh.

```
"hero: Chào mừng đến cửa hàng! [action: enter_left]"
    ↓ automation.py
SceneGraph JSON (10 bg layers + 2 characters + keyframes + lip-sync)
    ↓ frontend
PixiJS render → Play → Export WebM
```

---

## Pipeline chi tiết

### Step 0: Load FLA Background

```python
# Scan storage/stages/ for matching element files
# Sort by element index → assign z_index + parallax
# Create BackgroundLayerNode × N layers
```

Xem [02_ASSET_PIPELINE.md](02_ASSET_PIPELINE.md) Section B.

### Step 1: Add Characters

```python
# For each character in character_map:
char_info = registry.get_character(char_id)
executor.execute("add_character", {
    "character_id": char_id,
    "name": script_name,
    "x": home_x,          # Distributed evenly across stage
    "y": 7.5,             # Standing height
    "scale": 0.25,        # Reasonable default
})
```

**Character distribution** (chia đều sân khấu):
```
1 character:  center (9.6)
2 characters: left=5.0, right=14.2
3 characters: left=3.0, center=9.6, right=16.2
```

### Step 2: Process Each Script Line

Cho mỗi dòng thoại trong kịch bản:

```python
for i, line in enumerate(lines):
    # 1. Xác định timing
    start_time = i * time_per_line
    speak_start = start_time + 0.3  # slight pause before speaking
    end_time = start_time + time_per_line
    
    # 2. Resolve pose (from action hint or text analysis)
    pose = resolve_pose(line.action, line.text, available_poses)
    
    # 3. Resolve face (from emotion hint or text analysis)
    face = resolve_face(line.emotion, line.text, available_faces)
    
    # 4. Resolve movement
    movement = resolve_movement(line.action)
    
    # 5. Apply movement keyframes
    apply_movement(node, movement, start_time, end_time)
    
    # 6. Add pose/face frame
    node.add_frame(speak_start, {"pose": pose, "face": face})
    
    # 7. Smart facing (look at other characters)
    apply_smart_facing(node, other_characters)
    
    # 8. Listener reactions (other characters react)
    apply_listener_reactions(other_nodes, node)
    
    # 9. Lip-sync face swaps
    add_lipsync_frames(node, speak_start, end_time)
```

---

## Cinematic Movement System

### Available Movements

| Movement | Hiệu ứng | Keyframes |
|----------|-----------|-----------|
| `enter_left` | Nhân vật đi vào từ trái | x: -4→5.0 (ease_out) |
| `enter_right` | Nhân vật đi vào từ phải | x: 23→14.2 (ease_out) |
| `exit_left` | Nhân vật rời khỏi trái | x: current→-4 (ease_in) |
| `exit_right` | Nhân vật rời khỏi phải | x: current→23 (ease_in) |
| `step_forward` | Bước tới gần camera | y↑, scale↑, z_index+50 |
| `step_back` | Lùi xa camera | y↓, scale↓, z_index-50 |
| `walk_to_center` | Đi ra giữa sân khấu | x→9.6 (ease_out) |
| `idle` / default | Kéo nhẹ về trung tâm | x→center_bias (ease_out) |

### Smart Facing

```python
# Nhân vật tự động nhìn về phía nhân vật khác:
# Nếu hero ở x=5.0, villain ở x=14.2:
#   hero.scale_x = +0.25 (nhìn phải, về phía villain)
#   villain.scale_x = -0.25 (nhìn trái, về phía hero)
# FlipX = scale_x âm → nhân vật quay mặt trái
```

### Listener Reactions

```python
# Khi hero nói, villain (listener) sẽ:
# 1. Quay mặt về phía hero (smart facing)
# 2. Đổi face thành reaction phù hợp (ngạc nhiên, gật đầu...)
# 3. Idle pose (站立/抱胸)
```

---

## Text Analysis (NLP Heuristic)

### Emotion → Face

```python
EMOTION_FACE_MAP = {
    "happy": "微笑",     "sad": "难过",
    "angry": "发怒",     "scared": "害怕",
    "surprised": "惊讶", "thinking": "疑惑",
    "talking": "说话",   "yelling": "大吼",
    # + Vietnamese keywords: 
    "vui": "微笑", "buồn": "难过", "giận": "发怒",
}

# Also text keyword analysis:
# "tuyệt vời" → "excited" → "笑嘻嘻"
# "không thể tin" → "surprised" → "惊讶"
```

### Action → Pose

```python
ACTION_POSE_MAP = {
    "stand": "站立",     "wave": "打招呼",
    "sit": "坐着",       "run": "逃跑",
    "think": "坐姿思考", "point": "手指向前",
    "pray": "祈祷",      "phone": "接电话",
    # + Vietnamese:
    "đứng": "站立", "ngồi": "坐着", "chạy": "逃跑",
}
```

### AI-Powered Analysis (Optional)

```python
# ScriptAnalyzerAgent (script_analyzer_agent.py)
# Uses Gemini to analyze script → assign pose/face/movement
# Returns: [{"pose_name": "打招呼", "face_name": "微笑", "movement": "enter_left"}]
# Fallback: heuristic analysis if AI unavailable
```

---

## Lip-Sync System

```python
def _add_lipsync_frames(node, speak_start, speak_end, available_faces):
    """Simulate talking by alternating mouth shapes."""
    talk_faces = ["说话", "微笑", "说话", "大笑"]  # Cycle through
    syllable_duration = 0.15  # 150ms per "syllable"
    
    t = speak_start
    idx = 0
    while t < speak_end:
        face = talk_faces[idx % len(talk_faces)]
        if face in available_faces:
            node.add_frame(t, {"face": face})
        t += syllable_duration
        idx += 1
    
    # End with resting face
    node.add_frame(speak_end, {"face": original_face})
```

---

## API Endpoints

### POST /api/automation/script-to-scene

```json
// Request:
{
    "lines": [
        {"character": "hero", "text": "Hello!", "emotion": "happy", "action": "wave"},
        {"character": "villain", "text": "We meet again.", "emotion": "cold", "action": "stand"}
    ],
    "character_map": {
        "hero": "Q版花店姐姐长裙_1761648249312",
        "villain": "Q版蓝色挑染男_1761648268637"
    },
    "background_id": "4S店_1760984889936",
    "generate_tts": false
}

// Response:
{
    "success": true,
    "scene": { /* SceneGraph JSON */ },
    "duration": 3.0,
    "characters_added": 2,
    "keyframes_added": 24,
    "message": "Scene created with 12 nodes and 24 keyframes"
}
```

### POST /api/automation/srt-to-scene

Giống `script-to-scene` nhưng input là SRT subtitle format.

### POST /api/automation/lipsync

Thêm lip-sync keyframes vào scene đã có.

---

## Mở rộng automation.py — Checklist

Khi cần thêm tính năng mới vào pipeline:

```
1. THÊM branch mới, KHÔNG xóa logic cũ
2. THÊM parameter mới với default value
3. Test với curl:
   curl -X POST http://localhost:8001/api/automation/script-to-scene \
     -H "Content-Type: application/json" \
     -d @test_payload.json
4. Verify SceneGraph JSON output có đúng nodes/keyframes
5. Mở browser test render
```
