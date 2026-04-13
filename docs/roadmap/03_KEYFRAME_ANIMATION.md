# 03 — Hệ thống Keyframe & Animation

## Trạng thái hiện tại

### ✅ Hoạt động
- Keyframes cho properties: `x`, `y`, `scale_x`, `scale_y`, `rotation`, `opacity`
- `interpolateKeyframes()` — linear interpolation
- `frameSequence` — step-based pose/face swap

### 🔴 Cần fix/nâng cấp
- **Easing chưa hoạt động thực tế** — code có `ease_in`, `ease_out` nhưng `interpolateKeyframes()` chỉ làm linear
- **Backend keyframes format mismatch** — backend dùng dict `{time, value, easing}`, frontend expect specific types
- **Movement keyframes từ automation chưa được evaluate đúng** — `automation.py` thêm keyframes nhưng format có thể không khớp

## Kiến trúc Keyframe

### Backend (Python)

```python
# node.py — SceneNode base
class SceneNode:
    keyframes: dict[str, list[dict]] = {}
    # keyframes = {
    #   "x": [{"time": 0, "value": 5.0, "easing": "linear"},
    #          {"time": 1.5, "value": 9.6, "easing": "ease_out"}],
    #   "opacity": [{"time": 0, "value": 1.0}, {"time": 3.0, "value": 0.0}]
    # }
```

### Frontend (TypeScript)

```typescript
// types.ts
interface Keyframe {
    time: number;
    value: number;
    easing: "linear" | "ease_in" | "ease_out" | "ease_in_out";
}

// Trong AnyNodeData:
keyframes: Record<string, Keyframe[]>;
```

### Interpolation

```typescript
// keyframe.ts
export function interpolateKeyframes(
    keyframes: Keyframe[],
    time: number,
    defaultValue: number
): number {
    // 1. Nếu không có keyframes → return defaultValue
    // 2. Nếu time < first keyframe → return first.value
    // 3. Nếu time > last keyframe → return last.value
    // 4. Tìm 2 keyframes bao quanh time → lerp
}
```

## Nhiệm vụ cần làm

### Task 3.1: Implement easing functions

**File**: `frontend-react/src/core/scene-graph/keyframe.ts`

Hiện tại `interpolateKeyframes()` chỉ dùng linear lerp. Cần thêm:

```typescript
function easingFunction(t: number, easing: string): number {
    switch (easing) {
        case "ease_in": return t * t;
        case "ease_out": return 1 - (1 - t) * (1 - t);
        case "ease_in_out": return t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2) / 2;
        default: return t; // linear
    }
}
```

Áp dụng vào interpolation: `lerp(a.value, b.value, easingFunction(progress, b.easing))`

### Task 3.2: Đồng bộ keyframe format backend ↔ frontend

**Problem**: `automation.py` thêm keyframes dạng:
```python
node.keyframes["x"].append({"time": 1.0, "value": 9.6, "easing": "ease_out"})
```

`SceneGraphManager.loadFromBackendResponse()` phải convert đúng. Kiểm tra:
- `convertKeyframesFromBackend()` trong `SceneGraphManager.ts` line 122-135
- Xác nhận `easing` field được giữ lại

### Task 3.3: Validate evaluateAtTime cho movement

**Test case**:
1. Tạo scene bằng Script Import (2 nhân vật)
2. Console log: `manager.evaluateAtTime(0)` vs `manager.evaluateAtTime(2)` 
3. Xác nhận `x` value thay đổi giữa 2 thời điểm
4. Nếu không thay đổi → debug keyframe loading

### Task 3.4: Smooth pose/face transitions (tương lai)

Hiện tại pose/face swap là instant (STEP). Để mượt hơn có thể:
- Thêm crossfade opacity giữa 2 pose sprites (0.1s transition)
- Giữ sprite cũ + sprite mới, animate opacity

**File cần sửa**: `SceneRenderer.tsx`

```typescript
// Pseudo-code cho crossfade:
if (newPose !== currentPose) {
    // Fade out old pose sprite (opacity 1 → 0, 100ms)
    // Fade in new pose sprite (opacity 0 → 1, 100ms)
}
```
