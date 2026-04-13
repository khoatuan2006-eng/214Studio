# 04 — Script-to-Scene Pipeline

## Trạng thái hiện tại

### ✅ Đã hoạt động
- Parse script text (format `Character: dialogue`)
- Parse SRT subtitle format
- Emotion detection từ text (heuristic)
- Action detection từ text (heuristic)
- Pose mapping: action → tên pose Trung Quốc (28 poses)
- Face mapping: emotion → tên face Trung Quốc (97 faces)
- Lip-sync: swap `说话`↔`微笑` mỗi 250ms
- Listener reactions: nhân vật không nói có phản ứng
- Position keyframes: speaker di chuyển về center khi nói

### 🔴 Cần nâng cấp
- **AI-powered script analysis** — dùng Gemini thay vì heuristic keywords
- **Script format phong phú hơn** — hỗ trợ stage directions, scene breaks
- **Auto character selection** — AI tự chọn nhân vật phù hợp nội dung

## File liên quan

| File | Vai trò |
|------|---------|
| `backend/routers/automation.py` | API endpoints + engine chính |
| `frontend-react/src/components/studio/editor/ScriptImport.tsx` | UI paste script |

## API Endpoints

### POST `/api/automation/script-to-scene`

```json
// Request
{
    "lines": [
        {"character": "Hoa", "text": "Chào bạn!", "emotion": "happy", "action": "greet"},
        {"character": "Nam", "text": "Chào!", "emotion": "", "action": ""}
    ],
    "character_map": {"Hoa": "q版花店姐姐长裙_1761648249312", "Nam": "q版蓝色挑染男_1761648268637"},
    "generate_tts": false
}

// Response
{
    "success": true,
    "scene": { /* SceneGraph JSON */ },
    "duration": 8.5,
    "characters_added": 2,
    "keyframes_added": 120,
    "message": "Scene created with 2 nodes and 120 keyframes"
}
```

### POST `/api/automation/srt-to-scene`

```json
// Request
{
    "srt_text": "1\n00:00:00,000 --> 00:00:02,500\nHoa: Chào bạn!\n\n2\n...",
    "character_map": {"Hoa": "...", "Nam": "..."},
    "default_character": "q版花店姐姐长裙_1761648249312"
}
```

## Nhiệm vụ nâng cấp

### Task 4.1: Gemini-powered Script Analyzer

**Mục tiêu**: Thay thế heuristic `analyze_text_emotion()` bằng Gemini API.

**File mới**: `backend/core/agents/script_analyzer.py`

```python
SYSTEM_PROMPT = """
Bạn là một đạo diễn phim hoạt hình. Phân tích mỗi câu thoại và trả về:
- emotion: cảm xúc chính (happy/sad/angry/scared/surprised/thinking/neutral)
- action: hành động phù hợp (stand/greet/sit/walk/point/explain/fight/pray)
- intensity: mức độ (low/medium/high)
- listener_reaction: phản ứng của người nghe (nod/surprised/laugh/worry)

Available poses: 站立, 打招呼, 介绍, 叉腰, 摊开手, 手指向前, 抱胸, 疑惑, 捂嘴, 摸摸头, 举手, 出拳, 偷笑, 坐着, 逃跑, 祈祷, 拱手, 接电话, 请进, 指责, 抱头, 勾手指

Available faces: 微笑, 大笑, 发怒, 说话, 大吼, 难过, 害怕, 惊讶, 无表情, 害羞, 自信, 疑惑, 冷漠, 感动, 尴尬, 崇拜, 打哈欠, 流泪, 震惊, 笑嘻嘻, ...
"""

async def analyze_script_line(text: str, context: str) -> dict:
    """Call Gemini to analyze a single script line."""
    # Returns: {emotion, action, pose_name, face_name, listener_face}
```

**Tích hợp**: Trong `build_scene_from_script()`, nếu có API key thì dùng Gemini, không thì fallback về heuristic.

### Task 4.2: Rich Script Format

Hỗ trợ stage directions trong script:

```
[Scene: Quán cà phê, buổi chiều]
[BGM: peaceful_cafe.mp3]

Hoa (ngồi, vui): Chào bạn, lâu quá không gặp!
Nam (đi vào, ngạc nhiên): Ồ, Hoa! Không ngờ gặp bạn ở đây.

[Hoa đứng dậy, vẫy tay]
Hoa (vui): Mình rất vui. Ngồi đây đi!

[Camera zoom vào Hoa]
Nam (ngồi): Cảm ơn. Dạo này bạn thế nào?
```

**Parser mới**: `parse_rich_script(text) → list[ScriptEvent]`

```python
@dataclass
class ScriptEvent:
    type: str  # "dialogue" | "stage_direction" | "scene_break" | "bgm" | "camera"
    character: str = ""
    text: str = ""
    emotion: str = ""
    action: str = ""
    params: dict = field(default_factory=dict)
```

### Task 4.3: Auto Character Assignment

Khi user chỉ paste script mà không map character thủ công:

```python
async def auto_assign_characters(
    script_lines: list[ScriptLine],
    available_chars: list[CharacterInfo],
) -> dict[str, str]:
    """Use AI to assign available characters to script roles."""
    # Gemini prompt: "Given these character names and appearances,
    #   assign them to these script roles..."
    # Returns: {"Hoa": "q版花店姐姐长裙_...", "Nam": "q版蓝色挑染男_..."}
```

### Task 4.4: Movement Patterns

Thêm các pattern di chuyển phức tạp hơn:

```python
MOVEMENT_PATTERNS = {
    "enter_left": lambda t, dur: [
        {"time": t, "x": -2.0},      # Ngoài màn hình trái
        {"time": t+0.5, "x": 5.0},   # Đi vào
    ],
    "enter_right": lambda t, dur: [
        {"time": t, "x": 21.0},
        {"time": t+0.5, "x": 14.0},
    ],
    "exit_left": lambda t, dur: [
        {"time": t, "x": 5.0},
        {"time": t+0.5, "x": -2.0},
    ],
    "walk_to_center": lambda t, dur: [
        {"time": t+0.3, "x": 9.6},
    ],
    "step_forward": lambda t, dur: [
        {"time": t, "y": 7.5},
        {"time": t+0.3, "y": 8.0},
    ],
    "step_back": lambda t, dur: [
        {"time": t, "y": 8.0},
        {"time": t+0.3, "y": 7.5},
    ],
}
```

Tích hợp vào stage directions: `[Hoa đi vào từ trái]` → `enter_left`
