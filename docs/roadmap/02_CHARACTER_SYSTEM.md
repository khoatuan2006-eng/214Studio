# 02 — Hệ thống nhân vật (Character System)

## Nguyên lý cốt lõi

> **Nhân vật = 2 lớp PNG chồng lên nhau: `pose` (thân) + `face` (mặt).**
> Animation = swap ảnh PNG theo thời gian (flipbook). KHÔNG có skeletal rigging.

```
┌──────────────────────────┐
│      face layer          │  ← face PNG (表情): 微笑, 大笑, 惊讶...
│      (biểu cảm)          │     Kích thước nhỏ, chỉ vùng mặt
├──────────────────────────┤
│      pose layer          │  ← pose PNG (動作): 站立, 打招呼, 介绍...
│      (tư thế thân)       │     Kích thước đầy đủ nhân vật
└──────────────────────────┘
```

## Cấu trúc thư mục asset

```
storage/extracted_psds/
└── Q版花店姐姐长裙_1761648249312/
    ├── 动作/                      ← POSE folder
    │   ├── 站立_abc123.png        ← "站立" = standing
    │   ├── 打招呼_def456.png      ← "打招呼" = waving
    │   ├── 介绍_ghi789.png        ← "介绍" = introducing
    │   ├── 叉腰_jkl012.png        ← "叉腰" = hands on hips
    │   ├── 坐着_mno345.png        ← "坐着" = sitting
    │   └── ... (28 poses total)
    ├── 表情/                      ← FACE folder
    │   ├── 微笑_a6d430.png        ← "微笑" = smile
    │   ├── 大笑_dbfe2b.png        ← "大笑" = laughing
    │   ├── 发怒_5dab45.png        ← "发怒" = angry
    │   ├── 说话_e973c6.png        ← "说话" = talking (lip-sync)
    │   ├── 惊讶_xxx.png           ← "惊讶" = surprised
    │   ├── 无表情_xxx.png          ← "无表情" = neutral
    │   └── ... (97 faces total)
    └── info.json                  ← metadata (optional)
```

**Tên asset = phần trước `_hash.png`**: `微笑_a6d430.png` → asset name = `"微笑"`

## CharacterNode (Backend)

```python
# backend/core/scene_graph/specialized_nodes.py

@dataclass
class CharacterNode(SceneNode):
    character_id: str = ""
    active_layers: dict[str, str] = field(default_factory=lambda: {
        "pose": "站立",
        "face": "微笑",
    })
    available_layers: dict[str, list[str]] = field(default_factory=dict)
    # available_layers = {
    #   "pose": ["站立", "打招呼", "介绍", ...],
    #   "face": ["微笑", "大笑", "发怒", ...]
    # }
    frame_sequence: list[FrameSelection] = field(default_factory=list)
    # frame_sequence = [
    #   {time: 0.0, layers: {pose: "站立", face: "微笑"}},
    #   {time: 1.5, layers: {pose: "介绍", face: "说话"}},
    #   {time: 3.0, layers: {face: "大笑"}},  ← chỉ đổi face, pose giữ nguyên
    # ]
```

### Phương thức quan trọng

```python
node.add_frame(time, {"pose": "介绍", "face": "惊讶"})
# → Thêm FrameSelection vào frame_sequence, sort by time

node.set_active_layer("pose", "打招呼")
# → Đổi active layer ngay lập tức (không theo thời gian)
```

## CharacterNodeData (Frontend TypeScript)

```typescript
// frontend-react/src/core/scene-graph/types.ts

interface CharacterNodeData extends BaseNodeData {
    characterId: string;
    activeLayers: { pose: string; face: string };
    availableLayers: { pose: string[]; face: string[] };
    frameSequence: Array<{
        time: number;
        layers: { pose?: string; face?: string };
    }>;
}
```

## Evaluator — frameSequence evaluation

```typescript
// SceneGraphManager.ts → evaluateAtTime()

if (node.nodeType === "character") {
    const charNode = node as CharacterNodeData;
    if (charNode.frameSequence?.length) {
        let layers = { ...charNode.activeLayers };
        for (const frame of charNode.frameSequence) {
            if (frame.time <= time) {
                layers = { ...layers, ...frame.layers };
            } else {
                break; // frameSequence sorted by time
            }
        }
        snapshot.activeLayers = layers;
    }
}
```

**Logic**: Duyệt tất cả frames có `time <= t`, merge layers cuối cùng. Đây là STEP interpolation (không blend).

## SceneRenderer — PixiJS compositing

```typescript
// SceneRenderer.tsx (simplified)

// For each character node in snapshot:
const poseUrl = `/static/extracted_psds/${charId}/动作/${poseName}_${hash}.png`;
const faceUrl = `/static/extracted_psds/${charId}/表情/${faceName}_${hash}.png`;

// PixiJS Container:
//   └─ Sprite (pose image) ← full body
//   └─ Sprite (face image) ← overlaid on face area
```

## Danh sách Poses có sẵn (28 poses)

| Tên | Nghĩa | Dùng khi |
|-----|--------|----------|
| 站立 | Đứng yên | Mặc định, idle |
| 打招呼 | Vẫy tay | Chào hỏi |
| 介绍 | Giới thiệu | Giải thích, nói chuyện |
| 叉腰 | Chống hông | Tự tin, kiêu ngạo |
| 摊开手 | Mở hai tay | Trình bày, không biết |
| 手指向前 | Chỉ tay | Chỉ đạo, nhấn mạnh |
| 抱胸 | Khoanh tay | Nghiêm túc, suy nghĩ |
| 疑惑 | Bối rối | Thắc mắc |
| 捂嘴 | Che miệng | Bất ngờ, xấu hổ |
| 摸摸头 | Gãi đầu | Ngượng, suy nghĩ |
| 举手 | Giơ tay | Xung phong, gọi |
| 举起拳头 | Giơ nắm đấm | Quyết tâm, giận |
| 出拳 | Đấm | Chiến đấu |
| 偷笑 | Cười lén | Ranh mãnh |
| 坐着 | Ngồi | Nghỉ ngơi |
| 坐姿思考 | Ngồi suy nghĩ | Trầm tư |
| 坐姿抬手 | Ngồi giơ tay | Phát biểu |
| 坐姿看 | Ngồi nhìn | Lắng nghe |
| 祈祷 | Cầu nguyện | Van xin |
| 拱手 | Chắp tay | Lễ phép |
| 逃跑 | Chạy trốn | Sợ hãi, vội vã |
| 接电话 | Nghe điện thoại | Gọi điện |
| 请进 | Mời vào | Chào đón |
| 指责 | Chỉ trích | Tức giận |
| 抱头 | Ôm đầu | Tuyệt vọng |
| 勾手指 | Vẫy ngón tay | Gọi lại |
| 竖中指 | Giơ ngón giữa | Khiêu khích |
| 结印 | Kết ấn (ninja) | Naruto style |

## Danh sách Faces quan trọng (trích từ 97)

| Tên | Nghĩa | Lip-sync |
|-----|--------|----------|
| 微笑 | Mỉm cười | Mouth closed (default) |
| 说话 | Nói chuyện | **Mouth open** ← dùng cho lip-sync |
| 大吼 | La hét | **Mouth wide** ← dùng cho emphasis |
| 大笑 | Cười lớn | — |
| 发怒 | Tức giận | — |
| 难过 | Buồn | — |
| 害怕 | Sợ hãi | — |
| 惊讶 | Ngạc nhiên | — |
| 无表情 | Không biểu cảm | Neutral |
| 害羞 | Xấu hổ | — |
| 自信 | Tự tin | — |
| 疑惑 | Hoài nghi | — |

## Quy tắc khi code

1. **KHÔNG tạo face/pose mới** — chỉ dùng assets có sẵn trong thư mục PSD.
2. **Dùng `add_frame()`** để thêm animation, KHÔNG trực tiếp sửa `active_layers`.
3. **Face swap cho lip-sync**: alternating `说话` (mouth open) ↔ `微笑` (mouth closed) mỗi ~250ms.
4. **Pose thay đổi** khi hành động thay đổi (VD: đang "站立" → chuyển "打招呼" khi chào).
5. **Mỗi FrameSelection** có thể chỉ đổi 1 layer: `{face: "大笑"}` sẽ giữ nguyên pose hiện tại.
