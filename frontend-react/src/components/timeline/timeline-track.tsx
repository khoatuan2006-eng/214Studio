"use client";

import { useElementSelection } from "@/hooks/timeline/element/use-element-selection";
import { TimelineElement } from "./timeline-element";
import type { TimelineTrack as TimelineTrackType } from "@/types/timeline";
import type { TimelineElement as TimelineElementType } from "@/types/timeline";
import type { SnapPoint } from "@/lib/timeline/snap-utils";
import { TIMELINE_CONSTANTS } from "@/constants/timeline-constants";
import { useEdgeAutoScroll } from "@/hooks/timeline/use-edge-auto-scroll";
import type { ElementDragState } from "@/types/timeline";
import { useEditor } from "@/hooks/use-editor";
import { useState, useEffect } from "react";

interface TimelineTrackContentProps {
	track: TimelineTrackType;
	zoomLevel: number;
	dragState: ElementDragState;
	rulerScrollRef: React.RefObject<HTMLDivElement | null>;
	tracksScrollRef: React.RefObject<HTMLDivElement | null>;
	lastMouseXRef: React.RefObject<number>;
	onSnapPointChange?: (snapPoint: SnapPoint | null) => void;
	onResizeStateChange?: (params: { isResizing: boolean }) => void;
	onElementMouseDown: (params: {
		event: React.MouseEvent;
		element: TimelineElementType;
		track: TimelineTrackType;
	}) => void;
	onElementClick: (params: {
		event: React.MouseEvent;
		element: TimelineElementType;
		track: TimelineTrackType;
	}) => void;
	onTrackMouseDown?: (event: React.MouseEvent) => void;
	onTrackClick?: (event: React.MouseEvent) => void;
	shouldIgnoreClick?: () => boolean;
}

export function TimelineTrackContent({
	track,
	zoomLevel,
	dragState,
	rulerScrollRef,
	tracksScrollRef,
	lastMouseXRef,
	onSnapPointChange,
	onResizeStateChange,
	onElementMouseDown,
	onElementClick,
	onTrackMouseDown,
	onTrackClick,
	shouldIgnoreClick,
}: TimelineTrackContentProps) {
	const editor = useEditor();
	const { isElementSelected, clearElementSelection } = useElementSelection();

	const duration = editor.timeline.getTotalDuration();

	useEdgeAutoScroll({
		isActive: dragState.isDragging,
		getMouseClientX: () => lastMouseXRef.current ?? 0,
		rulerScrollRef,
		tracksScrollRef,
		contentWidth: duration * TIMELINE_CONSTANTS.PIXELS_PER_SECOND * zoomLevel,
	});

	const [draggingKf, setDraggingKf] = useState<{ originalTime: number, currentTime: number, startX: number } | null>(null);

	useEffect(() => {
		if (!draggingKf) return;

		const handleMouseMove = (e: MouseEvent) => {
			const deltaX = e.clientX - draggingKf.startX;
			const deltaTime = deltaX / (TIMELINE_CONSTANTS.PIXELS_PER_SECOND * zoomLevel);
			const newTime = Math.max(0, draggingKf.originalTime + deltaTime);
			setDraggingKf(prev => prev ? { ...prev, currentTime: newTime } : null);
		};

		const handleMouseUp = () => {
			if (draggingKf) {
				// Prevent saving if the time hasn't meaningfully changed
				if (Math.abs(draggingKf.currentTime - draggingKf.originalTime) > 0.05) {
					// @ts-ignore - updateKeyframeTime is custom injected
					editor.timeline.updateKeyframeTime?.(track.id, draggingKf.originalTime, draggingKf.currentTime);
				}
				setDraggingKf(null);
			}
		};

		document.addEventListener('mousemove', handleMouseMove);
		document.addEventListener('mouseup', handleMouseUp);
		return () => {
			document.removeEventListener('mousemove', handleMouseMove);
			document.removeEventListener('mouseup', handleMouseUp);
		};
	}, [draggingKf, zoomLevel, editor.timeline, track.id]);

	return (
		<button
			className="size-full"
			onClick={(event) => {
				if (shouldIgnoreClick?.()) return;
				clearElementSelection();
				onTrackClick?.(event);
			}}
			onMouseDown={(event) => {
				event.preventDefault();
				onTrackMouseDown?.(event);
			}}
			type="button"
		>
			<div className="relative h-full min-w-full">
				{track.elements.length === 0 ? (
					<div className="text-muted-foreground border-muted/30 flex size-full items-center justify-center rounded-sm border-2 border-dashed text-xs" />
				) : (
					track.elements.map((element) => {
						const isSelected = isElementSelected({
							trackId: track.id,
							elementId: element.id,
						});

						return (
							<TimelineElement
								key={element.id}
								element={element}
								track={track}
								zoomLevel={zoomLevel}
								isSelected={isSelected}
								onSnapPointChange={onSnapPointChange}
								onResizeStateChange={onResizeStateChange}
								onElementMouseDown={(event, element) =>
									onElementMouseDown({ event, element, track })
								}
								onElementClick={(event, element) =>
									onElementClick({ event, element, track })
								}
								dragState={dragState}
							/>
						);
					})
				)}

				{/* Keyframe Visual Indicators */}
				{track.keyframes?.map((kf, i) => {
					// If this keyframe is being dragged, use its transient dragging time
					const isDraggingThis = draggingKf && Math.abs(draggingKf.originalTime - kf.time) < 0.001;
					const renderTime = isDraggingThis ? draggingKf.currentTime : kf.time;
					const leftPos = renderTime * TIMELINE_CONSTANTS.PIXELS_PER_SECOND * zoomLevel;

					return (
						<div
							key={`kf-${i}`}
							className={`absolute top-1/2 -ml-1 -translate-y-1/2 w-2 h-2 rotate-45 z-20 border drop-shadow-md cursor-ew-resize transition-colors ${isDraggingThis ? "bg-red-500 border-red-300 scale-150" : "bg-indigo-500 border-indigo-300 hover:bg-indigo-300 hover:scale-125"
								}`}
							style={{ left: `${leftPos}px` }}
							title={`Keyframe: ${renderTime.toFixed(2)}s`}
							onMouseDown={(e) => {
								e.stopPropagation();
								setDraggingKf({ originalTime: kf.time, currentTime: kf.time, startX: e.clientX });
							}}
							onClick={(e) => {
								e.stopPropagation();
								if (!isDraggingThis) {
									editor.playback.seek({ time: kf.time });
								}
							}}
							onDoubleClick={(e) => {
								e.stopPropagation();
								// @ts-ignore
								editor.timeline.removeKeyframe?.(track.id, kf.time);
							}}
						/>
					);
				})}
			</div>
		</button>
	);
}
