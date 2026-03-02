import { useState, useCallback, useEffect, useRef } from "react";
import { TIMELINE_CONSTANTS } from "@/constants/timeline-constants";
import { snapTimeToFrame } from "@/lib/time";
import type { TimelineElement, TimelineTrack } from "@/types/timeline";
import { useEditor } from "@/hooks/use-editor";
import { useShiftKey } from "@/hooks/use-shift-key";
import {
	findSnapPoints,
	snapToNearestPoint,
	type SnapPoint,
} from "@/lib/timeline/snap-utils";
import { useTimelineStore } from "@/stores/timeline-store";

export interface SlipState {
	elementId: string;
	startX: number;
	initialTrimStart: number;
	initialTrimEnd: number;
}

export interface SlideState {
	elementId: string;
	startX: number;
	initialStartTime: number;
	initialDuration: number;
}

interface UseSlipSlideEditProps {
	element: TimelineElement;
	track: TimelineTrack;
	zoomLevel: number;
	editMode: "slip" | "slide" | "select";
	onSnapPointChange?: (snapPoint: SnapPoint | null) => void;
	onEditStateChange?: (params: { isEditing: boolean }) => void;
}

/**
 * Hook for Slip and Slide edit modes
 * - Slip: Change content source time without moving the clip position
 * - Slide: Move the clip position without changing content source time
 */
export function useSlipSlideEdit({
	element,
	track,
	zoomLevel,
	editMode,
	onSnapPointChange,
	onEditStateChange,
}: UseSlipSlideEditProps) {
	const editor = useEditor();
	const activeProject = editor.project.getActive();
	const isShiftHeldRef = useShiftKey();
	const snappingEnabled = useTimelineStore((state) => state.snappingEnabled);

	const [slipState, setSlipState] = useState<SlipState | null>(null);
	const [slideState, setSlideState] = useState<SlideState | null>(null);
	const [currentTrimStart, setCurrentTrimStart] = useState(element.trimStart);
	const [currentTrimEnd, setCurrentTrimEnd] = useState(element.trimEnd);
	const [currentStartTime, setCurrentStartTime] = useState(element.startTime);

	const currentTrimStartRef = useRef(element.trimStart);
	const currentTrimEndRef = useRef(element.trimEnd);
	const currentStartTimeRef = useRef(element.startTime);

	const handleSlipStart = ({
		event,
		elementId,
	}: {
		event: React.MouseEvent;
		elementId: string;
	}) => {
		if (editMode !== "slip") return;

		event.stopPropagation();
		event.preventDefault();

		setSlipState({
			elementId,
			startX: event.clientX,
			initialTrimStart: element.trimStart,
			initialTrimEnd: element.trimEnd,
		});

		setCurrentTrimStart(element.trimStart);
		setCurrentTrimEnd(element.trimEnd);
		currentTrimStartRef.current = element.trimStart;
		currentTrimEndRef.current = element.trimEnd;
		onEditStateChange?.({ isEditing: true });
	};

	const handleSlideStart = ({
		event,
		elementId,
	}: {
		event: React.MouseEvent;
		elementId: string;
	}) => {
		if (editMode !== "slide") return;

		event.stopPropagation();
		event.preventDefault();

		setSlideState({
			elementId,
			startX: event.clientX,
			initialStartTime: element.startTime,
			initialDuration: element.duration,
		});

		setCurrentStartTime(element.startTime);
		currentStartTimeRef.current = element.startTime;
		onEditStateChange?.({ isEditing: true });
	};

	const handleSlipMouseMove = useCallback(
		({ clientX }: { clientX: number }) => {
			if (!slipState) return;

			const deltaX = clientX - slipState.startX;
			let deltaTime = deltaX / (TIMELINE_CONSTANTS.PIXELS_PER_SECOND * zoomLevel);

			const projectFps = activeProject.settings.fps;
			const shouldSnap = snappingEnabled && !isShiftHeldRef.current;
			let slipSnapPoint: SnapPoint | null = null;

			if (shouldSnap) {
				const tracks = editor.timeline.getTracks();
				const playheadTime = editor.playback.getCurrentTime();
				// Slip doesn't use the snapPoints result directly yet, leaving logic here if needed
				findSnapPoints({
					tracks,
					playheadTime,
					excludeElementId: element.id,
				});

				// For slip, we snap to frame boundaries
				const newTrimStart = slipState.initialTrimStart + deltaTime;
				const snappedTime = snapTimeToFrame({ time: newTrimStart, fps: projectFps });
				deltaTime = snappedTime - slipState.initialTrimStart;
			}

			// Apply slip: change trim start/end equally to keep duration constant
			const newTrimStart = Math.max(0, slipState.initialTrimStart + deltaTime);
			const newTrimEnd = Math.max(0, slipState.initialTrimEnd - deltaTime);

			// Ensure we don't exceed source duration
			const sourceDuration = element.trimStart + element.duration + element.trimEnd;
			if (newTrimStart + element.duration + newTrimEnd <= sourceDuration) {
				setCurrentTrimStart(newTrimStart);
				setCurrentTrimEnd(newTrimEnd);
				currentTrimStartRef.current = newTrimStart;
				currentTrimEndRef.current = newTrimEnd;
			}

			onSnapPointChange?.(slipSnapPoint);
		},
		[slipState, zoomLevel, activeProject.settings.fps, snappingEnabled, editor, element.id, onSnapPointChange, isShiftHeldRef]
	);

	const handleSlideMouseMove = useCallback(
		({ clientX }: { clientX: number }) => {
			if (!slideState) return;

			const deltaX = clientX - slideState.startX;
			let deltaTime = deltaX / (TIMELINE_CONSTANTS.PIXELS_PER_SECOND * zoomLevel);

			const projectFps = activeProject.settings.fps;
			const shouldSnap = snappingEnabled && !isShiftHeldRef.current;
			let slideSnapPoint: SnapPoint | null = null;

			if (shouldSnap) {
				const tracks = editor.timeline.getTracks();
				const playheadTime = editor.playback.getCurrentTime();
				const snapPoints = findSnapPoints({
					tracks,
					playheadTime,
					excludeElementId: element.id,
				});

				const targetStartTime = slideState.initialStartTime + deltaTime;
				const snapResult = snapToNearestPoint({
					targetTime: targetStartTime,
					snapPoints,
					zoomLevel,
				});
				slideSnapPoint = snapResult.snapPoint;
				if (snapResult.snapPoint) {
					deltaTime = snapResult.snappedTime - slideState.initialStartTime;
				}
			}

			const newStartTime = Math.max(0, slideState.initialStartTime + deltaTime);
			const snappedStartTime = snapTimeToFrame({ time: newStartTime, fps: projectFps });

			setCurrentStartTime(snappedStartTime);
			currentStartTimeRef.current = snappedStartTime;

			onSnapPointChange?.(slideSnapPoint);
		},
		[slideState, zoomLevel, activeProject.settings.fps, snappingEnabled, editor, element.id, onSnapPointChange, isShiftHeldRef]
	);

	const handleSlipEnd = useCallback(() => {
		if (!slipState) return;

		const finalTrimStart = currentTrimStartRef.current;
		const finalTrimEnd = currentTrimEndRef.current;
		const trimStartChanged = finalTrimStart !== slipState.initialTrimStart;
		const trimEndChanged = finalTrimEnd !== slipState.initialTrimEnd;

		if (trimStartChanged || trimEndChanged) {
			editor.timeline.updateElementTrim({
				elementId: element.id,
				trimStart: finalTrimStart,
				trimEnd: finalTrimEnd,
			});
		}

		setSlipState(null);
		onEditStateChange?.({ isEditing: false });
		onSnapPointChange?.(null);
	}, [slipState, editor.timeline, element.id, onEditStateChange, onSnapPointChange]);

	const handleSlideEnd = useCallback(() => {
		if (!slideState) return;

		const finalStartTime = currentStartTimeRef.current;
		const startTimeChanged = finalStartTime !== slideState.initialStartTime;

		if (startTimeChanged) {
			editor.timeline.updateElementStartTime({
				elements: [{ trackId: track.id, elementId: element.id }],
				startTime: finalStartTime,
			});
		}

		setSlideState(null);
		onEditStateChange?.({ isEditing: false });
		onSnapPointChange?.(null);
	}, [slideState, editor.timeline, track.id, element.id, onEditStateChange, onSnapPointChange]);

	// Handle mouse events for slip
	useEffect(() => {
		if (!slipState) return;

		const handleDocumentMouseMove = ({ clientX }: MouseEvent) => {
			handleSlipMouseMove({ clientX });
		};

		const handleDocumentMouseUp = () => {
			handleSlipEnd();
		};

		document.addEventListener("mousemove", handleDocumentMouseMove);
		document.addEventListener("mouseup", handleDocumentMouseUp);

		return () => {
			document.removeEventListener("mousemove", handleDocumentMouseMove);
			document.removeEventListener("mouseup", handleDocumentMouseUp);
		};
	}, [slipState, handleSlipMouseMove, handleSlipEnd]);

	// Handle mouse events for slide
	useEffect(() => {
		if (!slideState) return;

		const handleDocumentMouseMove = ({ clientX }: MouseEvent) => {
			handleSlideMouseMove({ clientX });
		};

		const handleDocumentMouseUp = () => {
			handleSlideEnd();
		};

		document.addEventListener("mousemove", handleDocumentMouseMove);
		document.addEventListener("mouseup", handleDocumentMouseUp);

		return () => {
			document.removeEventListener("mousemove", handleDocumentMouseMove);
			document.removeEventListener("mouseup", handleDocumentMouseUp);
		};
	}, [slideState, handleSlideMouseMove, handleSlideEnd]);

	return {
		isSlipping: slipState !== null,
		isSliding: slideState !== null,
		handleSlipStart,
		handleSlideStart,
		currentTrimStart,
		currentTrimEnd,
		currentStartTime,
	};
}
