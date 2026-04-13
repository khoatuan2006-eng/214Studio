# 07 — Subtitle System

## Trạng thái hiện tại

- `TextNode` class tồn tại trong `specialized_nodes.py` nhưng **chưa render bất kỳ gì**
- SceneRenderer.tsx **không xử lý TextNode**
- Không có subtitle overlay trên video

## Kiến trúc

```
Script line "Chào bạn, hôm nay trời đẹp quá!"
    ↓
TextNode trong SceneGraph:
    - content: "Chào bạn, hôm nay trời đẹp quá!"
    - start_time: 0.5  (hiện lúc nào)
    - duration: 2.0     (hiện bao lâu)
    - position: bottom_center
    - style: {fontSize: 32, color: "#FFFFFF", outline: "#000000"}
    ↓
SceneRenderer renders PixiJS Text sprite
    ↓
Video export captures text overlay
```

## Nhiệm vụ

### Task 7.1: Render TextNode trong PixiJS

**File**: `frontend-react/src/components/studio/editor/SceneRenderer.tsx`

```typescript
import { Text, TextStyle } from 'pixi.js';

// Trong render loop:
for (const [id, snap] of Object.entries(snapshot)) {
    if (snap.nodeType === "text") {
        const textNode = manager.getNode(id);
        if (!textNode) continue;
        
        // Check visibility based on time
        const startTime = textNode.startTime ?? 0;
        const duration = textNode.duration ?? Infinity;
        const visible = time >= startTime && time <= startTime + duration;
        
        if (visible) {
            let textSprite = textSprites.get(id);
            if (!textSprite) {
                const style = new TextStyle({
                    fontFamily: textNode.fontFamily ?? "Noto Sans SC",
                    fontSize: textNode.fontSize ?? 32,
                    fill: textNode.color ?? "#FFFFFF",
                    stroke: { color: "#000000", width: 3 },
                    align: textNode.textAlign ?? "center",
                    wordWrap: true,
                    wordWrapWidth: 1600,
                });
                textSprite = new Text({ text: textNode.content, style });
                textSprite.anchor.set(0.5, 1);
                textContainer.addChild(textSprite);
                textSprites.set(id, textSprite);
            }
            textSprite.text = textNode.content;
            textSprite.position.set(960, 1020); // Bottom center
            textSprite.alpha = snap.opacity ?? 1;
            textSprite.visible = true;
        } else {
            const existing = textSprites.get(id);
            if (existing) existing.visible = false;
        }
    }
}
```

**Quan trọng**: `textContainer` phải nằm NGOÀI camera transform (phụ đề cố định trên màn hình).

### Task 7.2: Auto-generate subtitles từ script

**File**: `backend/routers/automation.py`

Trong `build_scene_from_script()`, thêm:

```python
# Tạo TextNode cho mỗi câu thoại
from backend.core.scene_graph.specialized_nodes import TextNode

text_node = TextNode(
    name=f"subtitle_{idx}",
    content=f"{line.character}: {line.text}",
    font_size=28,
    color="#FFFFFF",
    text_align="center",
)
text_node.metadata["start_time"] = start_time
text_node.metadata["duration"] = end_time - start_time
text_node.transform.x = 9.6   # Center
text_node.transform.y = 10.0  # Bottom
graph.add_node(text_node)
```

### Task 7.3: Subtitle styling UI

**File mới**: `frontend-react/src/components/studio/editor/SubtitleEditor.tsx`

- Font selector (Google Fonts: Noto Sans SC, Roboto, etc.)
- Size slider (20-60px)
- Color picker (text + outline)
- Position selector (top/center/bottom)
- Preview trên canvas

### Task 7.4: SRT/ASS export

```python
# backend/routers/automation.py
@router.get("/export-srt")
async def export_srt(scene: dict):
    """Export all TextNodes as SRT subtitle file."""
    srt_blocks = []
    for idx, node in enumerate(text_nodes):
        start = format_srt_time(node.start_time)
        end = format_srt_time(node.start_time + node.duration)
        srt_blocks.append(f"{idx+1}\n{start} --> {end}\n{node.content}\n")
    return "\n".join(srt_blocks)
```
