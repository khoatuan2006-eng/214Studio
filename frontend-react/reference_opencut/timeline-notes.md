## Mock logic Timeline (OpenCut-style)

File này mô phỏng lại cấu trúc logic tổng quát của Timeline trong OpenCut để tiện so sánh với Anime Studio.

```ts
type TimelineElement = {
  id: string;
  trackId: string;
  start: number; // seconds
  end: number;   // seconds
  zIndex: number;
};

type TimelineTrack = {
  id: string;
  name: string;
  elements: TimelineElement[];
};

type TimelineState = {
  tracks: TimelineTrack[];
  cursorTime: number;
  zoom: number;
};
```

Trong Anime Studio:

- `TimelineTrack` sẽ map sang **Character Track (Nhân vật)**.
- `elements` sẽ map sang **Action Block / Layer** (mặt, thân, phụ kiện) được hiển thị bằng `<Group>` + `<Image>` trong `react-konva`.
- `cursorTime` và `zoom` sẽ được điều khiển bởi `zustand` store, sau đó UI timeline chỉ là "vỏ" hiển thị và gửi event (drag/zoom/seek) về store.

