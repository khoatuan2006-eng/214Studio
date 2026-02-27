import { type JSX, useLayoutEffect, useRef } from "react";
import { TIMELINE_CONSTANTS } from "@/constants/timeline-constants";
import { DEFAULT_FPS } from "@/constants/project-constants";
import { useEditor } from "@/hooks/use-editor";
import { getRulerConfig, shouldShowLabel } from "@/lib/timeline/ruler-utils";
import { useScrollPosition } from "@/hooks/timeline/use-scroll-position";
import { TimelineTick } from "./timeline-tick";
import { useTimelineStore, getDynamicDuration } from "@/stores/timeline-store";

interface TimelineRulerProps {
	zoomLevel: number;
	dynamicTimelineWidth: number;
	rulerRef: React.Ref<HTMLDivElement>;
	tracksScrollRef: React.RefObject<HTMLElement | null>;
	handleWheel: (e: React.WheelEvent) => void;
	handleTimelineContentClick: (e: React.MouseEvent) => void;
	handleRulerTrackingMouseDown: (e: React.MouseEvent) => void;
	handleRulerMouseDown: (e: React.MouseEvent) => void;
}

export function TimelineRuler({
	zoomLevel,
	dynamicTimelineWidth,
	rulerRef,
	tracksScrollRef,
	handleWheel,
	handleTimelineContentClick,
	handleRulerTrackingMouseDown,
	handleRulerMouseDown,
}: TimelineRulerProps) {
	const editor = useEditor();
	const duration = editor.timeline.getTotalDuration();
	const pixelsPerSecond = TIMELINE_CONSTANTS.PIXELS_PER_SECOND * zoomLevel;
	const visibleDuration = dynamicTimelineWidth / pixelsPerSecond;
	const effectiveDuration = Math.max(duration, visibleDuration);
	const project = editor.project.getActive();
	const fps = project?.settings.fps ?? DEFAULT_FPS;
	const { labelIntervalSeconds, tickIntervalSeconds } = getRulerConfig({
		zoomLevel,
		fps,
	});
	const tickCount = Math.ceil(effectiveDuration / tickIntervalSeconds) + 1;

	const { scrollLeft, viewportWidth } = useScrollPosition({
		scrollRef: tracksScrollRef,
	});

	// P1 3.9: In/Out Points overlay
	const inPoint = useTimelineStore(s => s.inPoint);
	const outPoint = useTimelineStore(s => s.outPoint);
	const dynamicDuration = getDynamicDuration();
	const effectiveOutPoint = outPoint ?? dynamicDuration;
	const hasInOut = inPoint > 0 || outPoint !== null;

	/**
	 * widens the virtualization buffer during zoom transitions.
	 * useScrollPosition lags one frame behind the scroll adjustment
	 * that useLayoutEffect applies after a zoom change.
	 */
	const prevZoomRef = useRef(zoomLevel);
	const isZoomTransition = zoomLevel !== prevZoomRef.current;
	const bufferPx = isZoomTransition
		? Math.max(200, (scrollLeft + viewportWidth) * 0.15)
		: 200;

	useLayoutEffect(() => {
		prevZoomRef.current = zoomLevel;
	}, [zoomLevel]);

	const visibleStartTime = Math.max(
		0,
		(scrollLeft - bufferPx) / pixelsPerSecond,
	);
	const visibleEndTime =
		(scrollLeft + viewportWidth + bufferPx) / pixelsPerSecond;

	const startTickIndex = Math.max(
		0,
		Math.floor(visibleStartTime / tickIntervalSeconds),
	);
	const endTickIndex = Math.min(
		tickCount - 1,
		Math.ceil(visibleEndTime / tickIntervalSeconds),
	);

	const timelineTicks: Array<JSX.Element> = [];
	for (
		let tickIndex = startTickIndex;
		tickIndex <= endTickIndex;
		tickIndex += 1
	) {
		const time = tickIndex * tickIntervalSeconds;
		if (time > effectiveDuration) break;

		const showLabel = shouldShowLabel({ time, labelIntervalSeconds });
		timelineTicks.push(
			<TimelineTick
				key={tickIndex}
				time={time}
				zoomLevel={zoomLevel}
				fps={fps}
				showLabel={showLabel}
			/>,
		);
	}

	// In/Out Points pixel positions
	const inPointPx = inPoint * pixelsPerSecond;
	const outPointPx = effectiveOutPoint * pixelsPerSecond;

	return (
		<div
			role="slider"
			tabIndex={0}
			aria-label="Timeline ruler"
			aria-valuemin={0}
			aria-valuemax={effectiveDuration}
			aria-valuenow={0}
			className="relative h-4 flex-1 overflow-x-visible"
			onWheel={handleWheel}
			onClick={handleTimelineContentClick}
			onMouseDown={handleRulerTrackingMouseDown}
			onKeyDown={() => { }}
		>
			<div
				role="none"
				ref={rulerRef}
				className="relative h-4 cursor-default select-none"
				style={{
					width: `${dynamicTimelineWidth}px`,
				}}
				onMouseDown={handleRulerMouseDown}
			>
				{/* P1 3.9: In/Out Points Highlight Overlay */}
				{hasInOut && (
					<>
						{/* Grey zone BEFORE inPoint */}
						{inPoint > 0 && (
							<div
								className="absolute top-0 bottom-0 pointer-events-none z-[1]"
								style={{
									left: 0,
									width: `${inPointPx}px`,
									background: 'rgba(0, 0, 0, 0.35)',
								}}
							/>
						)}
						{/* Active In/Out zone highlight */}
						<div
							className="absolute top-0 bottom-0 pointer-events-none z-[1]"
							style={{
								left: `${inPointPx}px`,
								width: `${Math.max(0, outPointPx - inPointPx)}px`,
								background: 'rgba(56, 189, 248, 0.08)',
								borderLeft: '2px solid rgba(56, 189, 248, 0.7)',
								borderRight: '2px solid rgba(56, 189, 248, 0.7)',
							}}
						/>
						{/* Grey zone AFTER outPoint */}
						<div
							className="absolute top-0 bottom-0 pointer-events-none z-[1]"
							style={{
								left: `${outPointPx}px`,
								right: 0,
								background: 'rgba(0, 0, 0, 0.35)',
							}}
						/>
					</>
				)}
				{timelineTicks}
			</div>
		</div>
	);
}
