"use client";

import { useTimelineElementResize } from "@/hooks/timeline/element/use-element-resize";
import type { SnapPoint } from "@/lib/timeline/snap-utils";
import { TIMELINE_CONSTANTS } from "@/constants/timeline-constants";
import {
	getTrackClasses,
	canElementBeHidden,
} from "@/lib/timeline";
import { useEditor } from "@/hooks/use-editor";
import { useAppStore, STATIC_BASE, getAssetPath } from "@/store/useAppStore";
import type {
	TimelineElement as TimelineElementType,
	TimelineTrack,
	ElementDragState,
} from "@/types/timeline";
import { useElementSelection } from "@/hooks/timeline/element/use-element-selection";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
	ScissorIcon,
	Delete02Icon,
	Copy01Icon,
	ViewIcon,
	ViewOffSlashIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useRef, useEffect } from "react";

interface TimelineElementProps {
	element: TimelineElementType;
	track: TimelineTrack;
	zoomLevel: number;
	isSelected: boolean;
	onSnapPointChange?: (snapPoint: SnapPoint | null) => void;
	onResizeStateChange?: (params: { isResizing: boolean }) => void;
	onElementMouseDown: (
		e: React.MouseEvent,
		element: TimelineElementType,
	) => void;
	onElementClick: (e: React.MouseEvent, element: TimelineElementType) => void;
	dragState: ElementDragState;
}

export function TimelineElement({
	element,
	track,
	zoomLevel,
	onSnapPointChange,
	onResizeStateChange,
	onElementMouseDown,
	onElementClick,
	dragState,
}: TimelineElementProps) {
	const editor = useEditor();
	const { selectedElements } = useElementSelection();

	const elementRef = useRef<HTMLDivElement>(null);
	const transientPos = useRef<{ left: number; transform: string } | null>(null);

	const { handleResizeStart, isResizing, currentStartTime, currentDuration } =
		useTimelineElementResize({
			element,
			track,
			zoomLevel,
			onSnapPointChange,
			onResizeStateChange,
		});

	const isCurrentElementSelected = selectedElements.some(
		(selected: any) =>
			selected.elementId === element.id && selected.trackId === track.id,
	);

	const isBeingDragged = dragState.elementId === element.id;

	useEffect(() => {
		if (isBeingDragged && dragState.isDragging) {
			const handleTransientDrag = (e: Event) => {
				const customEvent = e as CustomEvent;
				if (customEvent.detail.elementId === element.id && elementRef.current) {
					const zoom = zoomLevel; // captured from closure
					const newTime = customEvent.detail.currentTime;
					const newLeft = newTime * TIMELINE_CONSTANTS.PIXELS_PER_SECOND * zoom;
					const dragOffsetY = customEvent.detail.currentMouseY - customEvent.detail.startMouseY;

					const leftStr = `${newLeft}px`;
					const transformStr = `translate3d(0, ${dragOffsetY}px, 0)`;

					transientPos.current = { left: newLeft, transform: transformStr };

					elementRef.current.style.left = leftStr;
					elementRef.current.style.transform = transformStr;
				}
			};

			window.addEventListener('transient-element-drag', handleTransientDrag);
			return () => {
				window.removeEventListener('transient-element-drag', handleTransientDrag);
				transientPos.current = null;
			};
		}
	}, [isBeingDragged, dragState.isDragging, element.id, zoomLevel]);

	const dragOffsetY =
		isBeingDragged && dragState.isDragging
			? dragState.currentMouseY - dragState.startMouseY
			: 0;
	const elementStartTime =
		isBeingDragged && dragState.isDragging
			? dragState.currentTime
			: element.startTime;
	const displayedStartTime = isResizing ? currentStartTime : elementStartTime;
	const displayedDuration = isResizing ? currentDuration : element.duration;
	const elementWidth =
		displayedDuration * TIMELINE_CONSTANTS.PIXELS_PER_SECOND * zoomLevel;
	const elementLeft = displayedStartTime * TIMELINE_CONSTANTS.PIXELS_PER_SECOND * zoomLevel;

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<div
					ref={elementRef}
					className={`absolute top-0 h-full select-none`}
					style={{
						left: transientPos.current ? `${transientPos.current.left}px` : `${elementLeft}px`,
						width: `${elementWidth}px`,
						transform: transientPos.current ? transientPos.current.transform : (isBeingDragged && dragState.isDragging
							? `translate3d(0, ${dragOffsetY}px, 0)`
							: undefined),
					}}
				>
					<ElementInner
						element={element}
						track={track}
						isSelected={isCurrentElementSelected}
						onElementClick={onElementClick}
						onElementMouseDown={onElementMouseDown}
						handleResizeStart={handleResizeStart}
					/>
				</div>
			</ContextMenuTrigger>
			<ContextMenuContent className="w-64 z-[9999]" onClick={(e) => e.stopPropagation()}>
				<ContextMenuItem
					onClick={(e) => {
						e.stopPropagation();
						editor.timeline.splitElement(element.id);
					}}
				>
					<HugeiconsIcon icon={ScissorIcon} className="mr-2 h-4 w-4" />
					Split
				</ContextMenuItem>
				{selectedElements.length <= 1 && (
					<ContextMenuItem
						onClick={(e) => {
							e.stopPropagation();
							editor.timeline.duplicateElement(element.id);
						}}
					>
						<HugeiconsIcon icon={Copy01Icon} className="mr-2 h-4 w-4" />
						Duplicate
					</ContextMenuItem>
				)}
				{canElementBeHidden(element) && (
					<ContextMenuItem
						onClick={(e) => {
							e.stopPropagation();
							editor.timeline.toggleTrackVisibility({ trackId: track.id });
						}}
					>
						<HugeiconsIcon icon={element.hidden ? ViewIcon : ViewOffSlashIcon} className="mr-2 h-4 w-4" />
						{element.hidden ? "Show" : "Hide"}
					</ContextMenuItem>
				)}
				<ContextMenuSeparator />
				<ContextMenuItem
					className="text-red-500 focus:text-red-500"
					onClick={(e) => {
						e.stopPropagation();
						if (selectedElements.length > 0) {
							editor.timeline.deleteElements(selectedElements as any);
						} else {
							editor.timeline.deleteElements([{ elementId: element.id, trackId: track.id }]);
						}
					}}
				>
					<HugeiconsIcon icon={Delete02Icon} className="mr-2 h-4 w-4" />
					Delete
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}

function ElementInner({
	element,
	track,
	isSelected,
	onElementClick,
	onElementMouseDown,
	handleResizeStart,
}: {
	element: TimelineElementType;
	track: TimelineTrack;
	isSelected: boolean;
	onElementClick: (e: React.MouseEvent, element: TimelineElementType) => void;
	onElementMouseDown: (
		e: React.MouseEvent,
		element: TimelineElementType,
	) => void;
	handleResizeStart: (params: {
		event: React.MouseEvent;
		elementId: string;
		side: "left" | "right";
	}) => void;
}) {
	return (
		<div
			className={`group relative h-full cursor-pointer overflow-hidden rounded-[0.5rem] transition-all duration-200 ${getTrackClasses(
				{
					type: track.type,
				},
			)} ${canElementBeHidden(element) && element.hidden ? "opacity-50" : ""} ${isSelected ? "ring-2 ring-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.5)] z-20" : "hover:ring-1 hover:ring-white/30"}`}
		>
			<button
				type="button"
				className="absolute inset-0 size-full cursor-pointer"
				onClick={(e) => onElementClick(e, element)}
				onMouseDown={(e) => onElementMouseDown(e, element)}
			>
				<div className="absolute inset-0 flex h-full items-center">
					<ElementContent
						element={element}
						isSelected={isSelected}
					/>
				</div>
				<ElementKeyframes element={element} trackId={track.id} />
			</button>

			<ResizeHandle
				side="left"
				elementId={element.id}
				handleResizeStart={handleResizeStart}
			/>
			<ResizeHandle
				side="right"
				elementId={element.id}
				handleResizeStart={handleResizeStart}
			/>
		</div>
	);
}

function ResizeHandle({
	side,
	elementId,
	handleResizeStart,
}: {
	side: "left" | "right";
	elementId: string;
	handleResizeStart: (params: {
		event: React.MouseEvent;
		elementId: string;
		side: "left" | "right";
	}) => void;
}) {
	const isLeft = side === "left";
	return (
		<button
			type="button"
			className={`absolute top-0 bottom-0 flex w-3 items-center justify-center cursor-col-resize z-30 opacity-0 group-hover:opacity-100 transition-opacity ${isLeft ? "left-0" : "right-0"}`}
			onMouseDown={(event) => handleResizeStart({ event, elementId, side })}
			aria-label={`${isLeft ? "Left" : "Right"} resize handle`}
		>
			<div className="bg-white/80 h-[1.5rem] w-1 rounded-full shadow-sm hover:bg-yellow-400 hover:scale-y-110 transition-all pointer-events-none" />
		</button>
	);
}

function ElementContent({
	element,
	isSelected,
}: {
	element: TimelineElementType;
	isSelected?: boolean;
}) {
	const characters = useAppStore(s => s.characters);
	const mediaId = (element as any).mediaId;
	const imageUrl = mediaId ? `${STATIC_BASE}/${getAssetPath(characters, mediaId)}` : null;

	return (
		<div className="flex size-full items-center justify-start pl-2 bg-gradient-to-r from-indigo-500/40 to-purple-500/40 backdrop-blur-md gap-2 border border-white/20 overflow-hidden relative transition-colors duration-200">
			{imageUrl && (
				<img src={imageUrl} crossOrigin="anonymous" className="h-[80%] aspect-square object-contain rounded bg-black/40 p-0.5 pointer-events-none shadow-sm" alt="" />
			)}
			<span className="truncate text-xs text-white px-1 font-semibold drop-shadow-sm">{element.name}</span>
			{isSelected && (
				<div className="absolute right-2 top-1/2 -translate-y-1/2 bg-indigo-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm pointer-events-none">
					Selected
				</div>
			)}
		</div>
	);
}

function ElementKeyframes({ element, trackId }: { element: TimelineElementType, trackId: string }) {
	const editor = useEditor();

	if (!element.keyframes || element.keyframes.length === 0) return null;

	return (
		<div className="absolute bottom-0 left-0 right-0 h-2 z-10 overflow-hidden">
			{element.keyframes.map((kf, i) => {
				const percent = ((kf.time - element.startTime) / element.duration) * 100;
				if (percent < 0 || percent > 100) return null;
				return (
					<div
						key={i}
						className="absolute h-1.5 w-1.5 bg-yellow-400 border-[0.5px] border-yellow-800 transform rotate-45 -translate-x-1/2 shadow-sm cursor-pointer hover:scale-150 transition-transform pointer-events-auto"
						style={{ left: `${percent}%`, bottom: '1px' }}
						title={`Keyframe at ${kf.time.toFixed(2)}s (Double click to delete)`}
						onDoubleClick={(e) => {
							e.stopPropagation();
							editor.timeline.removeKeyframe(trackId, kf.time);
						}}
					/>
				);
			})}
		</div>
	);
}

// Context menus removed for Anime Studio simplicity
