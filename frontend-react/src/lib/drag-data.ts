import type { TimelineDragData } from "@/types/drag";

const DRAG_FORMAT = "application/json";

export function getDragData({ dataTransfer }: { dataTransfer: DataTransfer }): TimelineDragData | null {
    try {
        const data = dataTransfer.getData(DRAG_FORMAT);
        if (!data) return null;
        return JSON.parse(data) as TimelineDragData;
    } catch {
        return null;
    }
}

export function hasDragData({ dataTransfer }: { dataTransfer: DataTransfer }): boolean {
    return dataTransfer.types.includes(DRAG_FORMAT);
}

export function setDragData({
    dataTransfer,
    data,
}: {
    dataTransfer: DataTransfer;
    data: TimelineDragData;
}) {
    dataTransfer.setData(DRAG_FORMAT, JSON.stringify(data));
    dataTransfer.setData("text/plain", JSON.stringify(data));
}
