"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import {
	ViewIcon,
	ViewOffSlashIcon,
	VolumeHighIcon,
	VolumeOffIcon,
	TaskAdd02Icon,
	Delete02Icon,
	Edit02Icon,
	ArrowLeft01Icon,
	ArrowUp01Icon,
	ArrowDown01Icon,
	ArrowRight01Icon
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { useAppStore } from "@/store/useAppStore";
import { setActiveEditTargetId, useTransientSnapshot } from "@/stores/transient-store";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useTimelineZoom } from "@/hooks/timeline/use-timeline-zoom";
import { useState, useRef, useCallback, useEffect } from "react";
import { TimelineTrackContent } from "./timeline-track";
import { TimelinePlayhead } from "./timeline-playhead";
import { SelectionBox } from "./selection-box";
import { useSelectionBox } from "@/hooks/timeline/use-selection-box";
import { SnapIndicator } from "./snap-indicator";
import type { SnapPoint } from "@/lib/timeline/snap-utils";
import type { TimelineTrack } from "@/types/timeline";
import {
	TIMELINE_CONSTANTS,
	TRACK_ICONS,
} from "@/constants/timeline-constants";
import { useElementInteraction } from "@/hooks/timeline/element/use-element-interaction";
import {
	getTrackHeight,
	getCumulativeHeightBefore,
	getTotalTracksHeight,
	canTracktHaveAudio,
	canTrackBeHidden,
	getTimelineZoomMin,
	getTimelinePaddingPx,
	isMainTrack,
} from "@/lib/timeline";
import { TimelineToolbar } from "./timeline-toolbar";
import { useScrollSync } from "@/hooks/timeline/use-scroll-sync";
import { useElementSelection } from "@/hooks/timeline/element/use-element-selection";
import { useTimelineSeek } from "@/hooks/timeline/use-timeline-seek";
import { useTimelineDragDrop } from "@/hooks/timeline/use-timeline-drag-drop";
import { TimelineRuler } from "./timeline-ruler";
import { TimelineBookmarksRow } from "./bookmarks";
import { useBookmarkDrag } from "@/hooks/timeline/use-bookmark-drag";
import { useEdgeAutoScroll } from "@/hooks/timeline/use-edge-auto-scroll";
import { useTimelineStore, getProjectFps, getDynamicDuration } from "@/stores/timeline-store";
import { useEditor } from "@/hooks/use-editor";
import { useTimelinePlayhead } from "@/hooks/timeline/use-timeline-playhead";
import { DragLine } from "./drag-line";
import { invokeAction } from "@/lib/actions";

export function Timeline() {
	const tracksContainerHeight = { min: 0, max: 800 };
	const { snappingEnabled } = useTimelineStore();
	const { clearElementSelection, setElementSelection } = useElementSelection();
	const editor = useEditor();
	const timeline = editor.timeline;
	const tracks = timeline.getTracks();
	const seek = (time: number) => editor.playback.seek({ time });

	// refs
	const timelineRef = useRef<HTMLDivElement>(null);
	const timelineHeaderRef = useRef<HTMLDivElement>(null);
	const rulerRef = useRef<HTMLDivElement>(null);
	const tracksContainerRef = useRef<HTMLDivElement>(null);
	const tracksScrollRef = useRef<HTMLDivElement>(null);
	const trackLabelsRef = useRef<HTMLDivElement>(null);
	const playheadRef = useRef<HTMLDivElement>(null);
	const trackLabelsScrollRef = useRef<HTMLDivElement>(null);

	// state
	const [isResizing, setIsResizing] = useState(false);
	const [currentSnapPoint, setCurrentSnapPoint] = useState<SnapPoint | null>(
		null,
	);

	const handleSnapPointChange = useCallback((snapPoint: SnapPoint | null) => {
		setCurrentSnapPoint(snapPoint);
	}, []);
	const handleResizeStateChange = useCallback(
		({ isResizing: nextIsResizing }: { isResizing: boolean }) => {
			setIsResizing(nextIsResizing);
			if (!nextIsResizing) {
				setCurrentSnapPoint(null);
			}
		},
		[],
	);

	// Global Keyboard Shortcuts
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			// Don't trigger if user is typing in an input
			if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

			const selected = editor.selection.getSelectedElements();

			// ── P1 3.6: Copy/Paste Timeline Blocks ──
			if (e.key.toLowerCase() === "c" && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
				e.preventDefault();
				if (!selected || selected.length === 0) return;
				const edData = useAppStore.getState().editorData;
				const copiedItems: any[] = [];
				selected.forEach(sel => {
					if (sel.elementId.endsWith("_compound")) return;
					for (const row of edData) {
						const action = row.actions.find(a => a.id === sel.elementId);
						if (action) {
							copiedItems.push({ trackId: row.id, trackType: "video" as const, element: { ...action } });
							break;
						}
					}
				});
				if (copiedItems.length > 0) {
					useTimelineStore.getState().setClipboard({ items: copiedItems });
				}
				return;
			}

			if (e.key.toLowerCase() === "v" && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
				e.preventDefault();
				const clipboard = useTimelineStore.getState().clipboard;
				if (!clipboard || clipboard.items.length === 0) return;
				const playheadTime = editor.playback.getCurrentTime();
				// Find the earliest start time in copied items to calculate offset
				// Cast to any because our clipboard stores ActionBlock data, not CreateTimelineElement
				const minStart = Math.min(...clipboard.items.map(item => (item.element as any).start ?? 0));
				const offset = playheadTime - minStart;
				useAppStore.getState().setEditorData(prev => prev.map(row => {
					const itemsForRow = clipboard.items.filter(item => item.trackId === row.id);
					if (itemsForRow.length === 0) return row;
					const newActions = [...row.actions];
					itemsForRow.forEach(item => {
						const el = item.element as any;
						newActions.push({
							...el,
							id: `action_${Date.now()}_${Math.random()}`,
							start: (el.start ?? 0) + offset,
							end: (el.end ?? 1) + offset,
						});
					});
					return { ...row, actions: newActions };
				}));
				return;
			}

			// ── P1 3.7: Batch Move — Arrow key nudge ──
			// P1 3.9: In/Out Points — I / O shortcuts
			if (e.key.toLowerCase() === "i" && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
				e.preventDefault();
				const time = editor.playback.getCurrentTime();
				useTimelineStore.getState().setInPoint(time);
				return;
			}
			if (e.key.toLowerCase() === "o" && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
				e.preventDefault();
				const time = editor.playback.getCurrentTime();
				useTimelineStore.getState().setOutPoint(time);
				return;
			}

			// P1 Sprint 3: Alt+X to clear In/Out Points
			if (e.key.toLowerCase() === "x" && e.altKey && !e.ctrlKey && !e.metaKey) {
				e.preventDefault();
				useTimelineStore.getState().resetInOutPoints();
				return;
			}

			if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && !e.ctrlKey && !e.metaKey && !e.altKey) {
				if (!selected || selected.length === 0) return;
				e.preventDefault();
				const fps = getProjectFps();
				const frameStep = e.shiftKey ? 10 / fps : 1 / fps;
				const direction = e.key === "ArrowRight" ? 1 : -1;
				const delta = frameStep * direction;
				useAppStore.getState().setEditorData(prev => prev.map(row => {
					let newActions = [...row.actions];
					let modified = false;
					selected.forEach(sel => {
						if (sel.elementId.endsWith("_compound")) return;
						const idx = newActions.findIndex(a => a.id === sel.elementId);
						if (idx > -1) {
							const action = newActions[idx];
							const newStart = Math.max(0, action.start + delta);
							const duration = action.end - action.start;
							newActions[idx] = { ...action, start: newStart, end: newStart + duration };
							modified = true;
						}
					});
					return modified ? { ...row, actions: newActions } : row;
				}));
				return;
			}

			if (!selected || selected.length === 0) return;

			if (e.key === "Delete" || e.key === "Backspace") {
				e.preventDefault();
				editor.timeline.deleteElements(selected);
				editor.selection.clearSelection();
			}

			if (e.key.toLowerCase() === "b" && (e.ctrlKey || e.metaKey)) {
				e.preventDefault();
				const cursorTime = editor.playback.getCurrentTime();
				useAppStore.getState().setEditorData(prev => prev.map(row => {
					let newActions = [...row.actions];
					let modified = false;

					selected.forEach(sel => {
						if (sel.elementId.endsWith("_compound")) return;
						const actionIdx = newActions.findIndex(a => a.id === sel.elementId);
						if (actionIdx > -1) {
							const targetAction = newActions[actionIdx];
							if (cursorTime > targetAction.start && cursorTime < targetAction.end) {
								const leftHalf = { ...targetAction, end: cursorTime };
								const rightHalf = {
									...targetAction,
									id: `action_${Date.now()}_${Math.random()}`,
									start: cursorTime
								};
								newActions.splice(actionIdx, 1, leftHalf, rightHalf);
								modified = true;
							}
						}
					});
					return modified ? { ...row, actions: newActions } : row;
				}));
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [editor]);

	const timelineDuration = timeline.getTotalDuration() || 0;
	const minZoomLevel = getTimelineZoomMin({
		duration: timelineDuration,
		containerWidth: tracksContainerRef.current?.clientWidth,
	});

	const savedViewState = editor.project.getTimelineViewState();

	const { zoomLevel, setZoomLevel, handleWheel, saveScrollPosition } =
		useTimelineZoom({
			containerRef: timelineRef,
			minZoom: minZoomLevel,
			initialZoom: savedViewState?.zoomLevel,
			initialScrollLeft: savedViewState?.scrollLeft,
			initialPlayheadTime: savedViewState?.playheadTime,
			tracksScrollRef,
			rulerScrollRef: tracksScrollRef,
		});

	const {
		dragState,
		dragDropTarget,
		handleElementMouseDown,
		handleElementClick,
		lastMouseXRef,
	} = useElementInteraction({
		zoomLevel,
		timelineRef,
		tracksContainerRef,
		tracksScrollRef,
		headerRef: timelineHeaderRef,
		snappingEnabled,
		onSnapPointChange: handleSnapPointChange,
	});

	const {
		dragState: bookmarkDragState,
		handleBookmarkMouseDown,
		lastMouseXRef: bookmarkLastMouseXRef,
	} = useBookmarkDrag({
		zoomLevel,
		scrollRef: tracksScrollRef,
		snappingEnabled,
		onSnapPointChange: handleSnapPointChange,
	});

	const { handleRulerMouseDown: handlePlayheadRulerMouseDown } =
		useTimelinePlayhead({
			zoomLevel,
			rulerRef,
			rulerScrollRef: tracksScrollRef,
			tracksScrollRef,
			playheadRef,
		});

	const { isDragOver, dropTarget, dragProps } = useTimelineDragDrop({
		containerRef: tracksContainerRef,
		headerRef: timelineHeaderRef,
		zoomLevel,
	});

	const {
		selectionBox,
		handleMouseDown: handleSelectionMouseDown,
		isSelecting,
		shouldIgnoreClick,
	} = useSelectionBox({
		containerRef: tracksContainerRef,
		onSelectionComplete: (elements) => {
			setElementSelection({ elements });
		},
		tracksScrollRef,
		zoomLevel,
	});

	const containerWidth = tracksContainerRef.current?.clientWidth || 1000;
	const contentWidth =
		timelineDuration * TIMELINE_CONSTANTS.PIXELS_PER_SECOND * zoomLevel;
	const paddingPx = getTimelinePaddingPx({
		containerWidth,
		zoomLevel,
		minZoom: minZoomLevel,
	});
	const dynamicTimelineWidth = Math.max(
		contentWidth + paddingPx,
		containerWidth,
	);

	useEdgeAutoScroll({
		isActive: bookmarkDragState.isDragging,
		getMouseClientX: () => bookmarkLastMouseXRef.current,
		rulerScrollRef: tracksScrollRef,
		tracksScrollRef,
		contentWidth: dynamicTimelineWidth,
	});

	const showSnapIndicator =
		snappingEnabled &&
		currentSnapPoint !== null &&
		(dragState.isDragging || bookmarkDragState.isDragging || isResizing);

	const {
		handleTracksMouseDown,
		handleTracksClick,
		handleRulerMouseDown,
		handleRulerClick,
	} = useTimelineSeek({
		playheadRef,
		trackLabelsRef,
		rulerScrollRef: tracksScrollRef,
		tracksScrollRef,
		zoomLevel,
		duration: timeline.getTotalDuration(),
		isSelecting,
		clearSelectedElements: clearElementSelection,
		seek,
	});

	useScrollSync({
		tracksScrollRef,
		trackLabelsScrollRef,
	});

	const timelineHeaderHeight =
		timelineHeaderRef.current?.getBoundingClientRect().height ?? 0;

	// Access global edit context
	const snapT = useTransientSnapshot();
	const activeEditTargetId = snapT.activeEditTargetId;
	const editorData = useAppStore(state => state.editorData);
	const setEditorData = useAppStore(state => state.setEditorData);
	const activeCharacterName = activeEditTargetId
		? editorData.find(c => c.id === activeEditTargetId)?.name
		: null;

	const moveLayer = (trackId: string, direction: number) => {
		const actionId = trackId.replace('nested_', '');
		setEditorData(prev => prev.map(row => {
			if (row.id === activeEditTargetId) {
				const actions = [...row.actions];
				const idx = actions.findIndex(a => a.id === actionId);
				if (idx > -1) {
					actions[idx] = { ...actions[idx], zIndex: actions[idx].zIndex + direction };
				}
				return { ...row, actions };
			}
			return row;
		}));
	};

	return (
		<section
			className={
				"panel bg-background relative flex h-full flex-col overflow-hidden rounded-sm border"
			}
			{...dragProps}
			aria-label="Timeline"
		>
			<TimelineToolbar
				zoomLevel={zoomLevel}
				minZoom={minZoomLevel}
				setZoomLevel={({ zoom }) => setZoomLevel(zoom)}
			/>

			{/* Chia để trị: Edit Mode Banner */}
			{activeEditTargetId && (
				<div className="bg-indigo-900/40 border-b border-indigo-500/50 px-4 py-1.5 flex items-center gap-3">
					<button
						onClick={() => setActiveEditTargetId(null)}
						className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors font-medium bg-black/20 px-2 py-1 rounded"
					>
						<HugeiconsIcon icon={ArrowLeft01Icon} className="w-3.5 h-3.5" />
						Back to Main Scene
					</button>
					<span className="text-xs text-indigo-200">
						Editing Character: <strong className="text-white">{activeCharacterName || 'Unknown'}</strong>
					</span>
				</div>
			)}

			<div
				className="relative flex flex-1 flex-col overflow-hidden"
				ref={timelineRef}
			>
				<SnapIndicator
					snapPoint={currentSnapPoint}
					zoomLevel={zoomLevel}
					tracks={tracks}
					timelineRef={timelineRef}
					trackLabelsRef={trackLabelsRef}
					tracksScrollRef={tracksScrollRef}
					isVisible={showSnapIndicator}
				/>
				<div className="flex flex-1 overflow-hidden">
					<div className="bg-background flex w-28 shrink-0 flex-col border-r">
						<div className="bg-background flex h-4 items-center justify-between px-3">
							<span className="opacity-0">.</span>
						</div>
						<div className="bg-background flex h-4 items-center justify-between px-3">
							<span className="opacity-0">.</span>
						</div>
						{tracks.length > 0 && (
							<div
								ref={trackLabelsRef}
								className="bg-background flex-1"
								style={{ height: '100%', paddingTop: TIMELINE_CONSTANTS.PADDING_TOP_PX }}
							>
								<ScrollArea className="h-full w-full" ref={trackLabelsScrollRef}>
									<div className="flex flex-col gap-1 w-full">
										{tracks.map((track) => (
											<div
												key={track.id}
												className={`group flex items-center px-3 ${track.type === "property" ? "bg-black/20 border-l-2 border-indigo-500/50" : ""}`}
												style={{
													height: `${getTrackHeight({ type: track.type })}px`,
												}}
											>
												<div className="flex min-w-0 flex-1 items-center justify-end gap-2">

													{track.type === "video" && !track.id.startsWith("nested_") && (
														<button
															onClick={(e) => {
																e.stopPropagation();
																useAppStore.getState().toggleTrackExpanded(track.id);
															}}
															className="p-0.5 hover:bg-neutral-800 rounded transition-colors"
														>
															<HugeiconsIcon
																icon={ArrowRight01Icon}
																className={`w-3.5 h-3.5 text-neutral-400 transition-transform ${useAppStore.getState().editorData.find(r => r.id === track.id)?.isExpanded ? "rotate-90" : ""
																	}`}
															/>
														</button>
													)}

													<span className={`text-xs text-muted-foreground font-medium truncate flex-1 text-left ${track.type === "property" ? "pl-5" : ""}`}>
														{track.name}
													</span>

													{import.meta.env?.DEV &&
														isMainTrack(track) && (
															<div className="bg-red-500 size-1.5 rounded-full" />
														)}
													{canTracktHaveAudio(track) && (
														<TrackToggleIcon
															isOff={track.muted}
															icons={{
																on: VolumeHighIcon,
																off: VolumeOffIcon,
															}}
															onClick={() =>
																editor.timeline.toggleTrackMute({
																	trackId: track.id,
																})
															}
														/>
													)}
													{canTrackBeHidden(track) && (
														<TrackToggleIcon
															isOff={track.hidden}
															icons={{
																on: ViewIcon,
																off: ViewOffSlashIcon,
															}}
															onClick={() =>
																editor.timeline.toggleTrackVisibility({
																	trackId: track.id,
																})
															}
														/>
													)}
													<TrackIcon track={track} />
												</div>
											</div>
										))}
									</div>
								</ScrollArea>
							</div>
						)}
					</div>

					<div
						className="relative flex flex-1 flex-col overflow-hidden"
						ref={tracksContainerRef}
					>
						<SelectionBox
							startPos={selectionBox?.startPos || null}
							currentPos={selectionBox?.currentPos || null}
							containerRef={tracksContainerRef}
							isActive={selectionBox?.isActive || false}
						/>
						<DragLine
							dropTarget={dropTarget}
							tracks={timeline.getTracks()}
							isVisible={isDragOver}
							headerHeight={timelineHeaderHeight}
						/>
						<DragLine
							dropTarget={dragDropTarget}
							tracks={timeline.getTracks()}
							isVisible={dragState.isDragging}
							headerHeight={timelineHeaderHeight}
						/>
						<ScrollArea
							className="h-full w-full"
							ref={tracksScrollRef}
							onMouseDown={(event) => {
								const isDirectTarget = event.target === event.currentTarget;
								if (!isDirectTarget) return;
								event.stopPropagation();
								handleTracksMouseDown(event);
								handleSelectionMouseDown(event);
							}}
							onClick={(event) => {
								const isDirectTarget = event.target === event.currentTarget;
								if (!isDirectTarget) return;
								event.stopPropagation();
								handleTracksClick(event);
							}}
							onWheel={(event) => {
								if (
									event.shiftKey ||
									Math.abs(event.deltaX) > Math.abs(event.deltaY)
								) {
									return;
								}
								handleWheel(event);
							}}
							onScroll={() => {
								saveScrollPosition();
							}}
						>
							<div
								className="relative"
								style={{
									width: `${dynamicTimelineWidth}px`,
								}}
							>
								<div
									ref={timelineHeaderRef}
									className="bg-background sticky top-0 z-10 flex flex-col"
								>
									<TimelineRuler
										zoomLevel={zoomLevel}
										dynamicTimelineWidth={dynamicTimelineWidth}
										rulerRef={rulerRef}
										tracksScrollRef={tracksScrollRef}
										handleWheel={handleWheel}
										handleTimelineContentClick={handleRulerClick}
										handleRulerTrackingMouseDown={handleRulerMouseDown}
										handleRulerMouseDown={handlePlayheadRulerMouseDown}
									/>
									<TimelineBookmarksRow
										zoomLevel={zoomLevel}
										dynamicTimelineWidth={dynamicTimelineWidth}
										dragState={bookmarkDragState}
										onBookmarkMouseDown={handleBookmarkMouseDown}
										handleWheel={handleWheel}
										handleTimelineContentClick={handleRulerClick}
										handleRulerTrackingMouseDown={handleRulerMouseDown}
										handleRulerMouseDown={handlePlayheadRulerMouseDown}
									/>
								</div>
								<TimelinePlayhead
									zoomLevel={zoomLevel}
									rulerRef={rulerRef}
									rulerScrollRef={tracksScrollRef}
									tracksScrollRef={tracksScrollRef}
									timelineRef={timelineRef}
									playheadRef={playheadRef}
									isSnappingToPlayhead={
										showSnapIndicator && currentSnapPoint?.type === "playhead"
									}
								/>
								<div
									className="relative"
									style={{
										height: `${Math.max(
											tracksContainerHeight.min,
											getTotalTracksHeight({ tracks }),
										)}px`,
									}}
								>
									{/* P1 Sprint 3: In/Out overlay on track area */}
									<InOutTrackOverlay zoomLevel={zoomLevel} />
									{tracks.length === 0 ? (
										<div />
									) : (
										tracks.map((track, index) => (
											<ContextMenu key={track.id}>
												<ContextMenuTrigger asChild>
													<div
														className="absolute right-0 left-0"
														style={{
															top: `${getCumulativeHeightBefore({
																tracks,
																trackIndex: index,
															})}px`,
															height: `${getTrackHeight({
																type: track.type,
															})}px`,
														}}
													>
														<TimelineTrackContent
															track={track}
															zoomLevel={zoomLevel}
															dragState={dragState}
															rulerScrollRef={tracksScrollRef}
															tracksScrollRef={tracksScrollRef}
															lastMouseXRef={lastMouseXRef}
															onSnapPointChange={handleSnapPointChange}
															onResizeStateChange={handleResizeStateChange}
															onElementMouseDown={handleElementMouseDown}
															onElementClick={handleElementClick}
															onTrackMouseDown={(event) => {
																handleSelectionMouseDown(event);
																handleTracksMouseDown(event);
															}}
															onTrackClick={handleTracksClick}
															shouldIgnoreClick={shouldIgnoreClick}
														/>
													</div>
												</ContextMenuTrigger>
												<ContextMenuContent className="w-40">
													<ContextMenuItem
														icon={<HugeiconsIcon icon={TaskAdd02Icon} />}
														onClick={(e) => {
															e.stopPropagation();
															invokeAction("paste-copied");
														}}
													>
														Paste elements
													</ContextMenuItem>
													<ContextMenuItem
														onClick={(e) => {
															e.stopPropagation();
															timeline.toggleTrackMute({
																trackId: track.id,
															});
														}}
													>
														<HugeiconsIcon icon={VolumeHighIcon} />
														<span>
															{canTracktHaveAudio(track) && track.muted
																? "Unmute track"
																: "Mute track"}
														</span>
													</ContextMenuItem>
													<ContextMenuItem
														onClick={(e) => {
															e.stopPropagation();
															timeline.toggleTrackVisibility({
																trackId: track.id,
															});
														}}
													>
														<HugeiconsIcon icon={ViewIcon} />
														<span>
															{canTrackBeHidden(track) && track.hidden
																? "Show track"
																: "Hide track"}
														</span>
													</ContextMenuItem>

													{/* Feature: Dive Into Character */}
													{!activeEditTargetId && track.elements.length > 0 && !track.id.startsWith("nested_") && (
														<ContextMenuItem
															onClick={(e) => {
																e.stopPropagation();
																setActiveEditTargetId(track.id);
															}}
														>
															<HugeiconsIcon icon={Edit02Icon} />
															<span>Edit Character Scene</span>
														</ContextMenuItem>
													)}

													{/* Feature: Z-Index Reordering for Dressing Room Mode */}
													{activeEditTargetId && track.id.startsWith("nested_") && (
														<>
															<ContextMenuItem
																onClick={(e) => {
																	e.stopPropagation();
																	moveLayer(track.id, 1);
																}}
															>
																<HugeiconsIcon icon={ArrowUp01Icon} />
																<span>Bring Forward</span>
															</ContextMenuItem>
															<ContextMenuItem
																onClick={(e) => {
																	e.stopPropagation();
																	moveLayer(track.id, -1);
																}}
															>
																<HugeiconsIcon icon={ArrowDown01Icon} />
																<span>Send Backward</span>
															</ContextMenuItem>
														</>
													)}
													<ContextMenuItem
														onClick={(e) => {
															e.stopPropagation();
															timeline.removeTrack(track.id);
														}}
														variant="destructive"
													>
														<HugeiconsIcon icon={Delete02Icon} />
														Delete track
													</ContextMenuItem>
												</ContextMenuContent>
											</ContextMenu>
										))
									)}
								</div>
							</div>
						</ScrollArea>
					</div>
				</div>
			</div>
		</section>
	);
}

function TrackIcon({ track }: { track: TimelineTrack }) {
	return <>{TRACK_ICONS[track.type]}</>;
}

function TrackToggleIcon({
	isOff,
	icons,
	onClick,
}: {
	isOff: boolean;
	icons: {
		on: IconSvgElement;
		off: IconSvgElement;
	};
	onClick: () => void;
}) {
	return (
		<>
			{isOff ? (
				<HugeiconsIcon
					icon={icons.off}
					className="text-destructive size-4 cursor-pointer"
					onClick={onClick}
				/>
			) : (
				<HugeiconsIcon
					icon={icons.on}
					className="text-muted-foreground size-4 cursor-pointer"
					onClick={onClick}
				/>
			)}
		</>
	);
}

/** P1 Sprint 3: Overlay that dims track area outside In/Out range */
function InOutTrackOverlay({ zoomLevel }: { zoomLevel: number }) {
	const inPoint = useTimelineStore(s => s.inPoint);
	const outPoint = useTimelineStore(s => s.outPoint);
	const dynamicDuration = getDynamicDuration();
	const effectiveOutPoint = outPoint ?? dynamicDuration;
	const hasInOut = inPoint > 0 || outPoint !== null;

	if (!hasInOut) return null;

	const pixelsPerSecond = TIMELINE_CONSTANTS.PIXELS_PER_SECOND * zoomLevel;
	const inPx = inPoint * pixelsPerSecond;
	const outPx = effectiveOutPoint * pixelsPerSecond;

	return (
		<>
			{inPoint > 0 && (
				<div
					className="absolute top-0 bottom-0 pointer-events-none z-[2]"
					style={{ left: 0, width: `${inPx}px`, background: 'rgba(0, 0, 0, 0.3)' }}
				/>
			)}
			<div
				className="absolute top-0 bottom-0 pointer-events-none z-[2]"
				style={{ left: `${outPx}px`, right: 0, background: 'rgba(0, 0, 0, 0.3)' }}
			/>
		</>
	);
}
