## OpenCut Timeline Reference

Thư mục này chứa tài liệu và file mock dùng để tham chiếu khi "giải phẫu" UI Timeline từ dự án OpenCut (clone của CapCut).

- **Mục tiêu**: Giữ lại cấu trúc component/hook quan trọng (UI shell + toán học timeline) mà không mang theo các phần engine nặng như `EditorCore`, `MediaManager`, `PlaybackManager`.
- **Phạm vi**: Chỉ dùng cho tham khảo, không được import trực tiếp vào code production nếu chưa được tối ưu hóa và gắn với `zustand` store của Anime Studio.

Các thành phần quan trọng cần nhớ:

1. **Components UI Timeline**
   - `TimelineTrack`
   - `TimelineElement`
   - `TimelinePlayhead`
   - `TimelineRuler`
   - `TimelineToolbar`

2. **Custom Hooks toán học**
   - `useTimelineZoom` — xử lý zoom in/out theo pixel-per-second.
   - `useElementInteraction` — drag & drop, resize, snap vào grid/keyframe.
   - `useTimelineSeek` — di chuyển playhead, sync với preview.

3. **Styling / Constants**
   - Pixel-per-second, z-index, chiều cao track, chiều rộng ruler.
   - Màu sắc track, element và selection box.

Khi transplant sang Anime Studio:

- Map **Track** của OpenCut -> **Track = Nhân vật** trong Anime Studio.
- Map **Element** của OpenCut -> **Action Block / Layer (Face, Body, Accessories)** trên track đó.
- Dùng `zustand` (`useAppStore` / `useStudioStore`) làm nguồn dữ liệu duy nhất, sau đó bọc output thành `<Group>` + `<Image>` trong `react-konva`.

