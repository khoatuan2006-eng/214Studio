/**
 * UI state for the timeline
 * For core logic, use EditorCore instead.
 */

import { create } from "zustand";
import type { ClipboardItem } from "@/types/timeline";
import { useAppStore } from "@/store/useAppStore";
import { DEFAULT_FPS } from "@/constants/project-constants";

export type LoopMode = "off" | "loopAll" | "loopSelection";
export type TrimMode = "rolling" | "ripple" | "stick";
export type EditMode = "select" | "trim" | "slip" | "slide";

interface KeyframeClipboardData {
	trackId: string;
	property: string;
	value: number;
}

interface TimelineStore {
	snappingEnabled: boolean;
	toggleSnapping: () => void;
	rippleEditingEnabled: boolean;
	toggleRippleEditing: () => void;

	// P3-TRIM: Trim mode
	trimMode: TrimMode;
	setTrimMode: (mode: TrimMode) => void;
	editMode: EditMode;
	setEditMode: (mode: EditMode) => void;

	clipboard: {
		items: ClipboardItem[];
	} | null;
	setClipboard: (
		clipboard: {
			items: ClipboardItem[];
		} | null,
	) => void;

	// P1 3.11: Loop Mode
	loopMode: LoopMode;
	cycleLoopMode: () => void;

	// P1 3.9: In/Out Points
	inPoint: number;
	outPoint: number | null; // null = end of timeline
	setInPoint: (time: number) => void;
	setOutPoint: (time: number | null) => void;
	resetInOutPoints: () => void;

	// P1 4.4: Keyframe Clipboard
	keyframeClipboard: KeyframeClipboardData[] | null;
	setKeyframeClipboard: (data: KeyframeClipboardData[] | null) => void;
}

/**
 * Compute the dynamic duration of the timeline from editorData.
 * = max(all action.end, all keyframe.time) + 5s padding
 * Minimum 10s.
 */
export function getDynamicDuration(): number {
	const editorData = useAppStore.getState().editorData;
	let maxTime = 0;

	for (const row of editorData) {
		for (const action of row.actions) {
			if (action.end > maxTime) maxTime = action.end;
		}
		const props = ['x', 'y', 'scale', 'rotation', 'opacity', 'anchorX', 'anchorY'] as const;
		for (const prop of props) {
			const keys = row.transform[prop];
			if (keys && keys.length > 0) {
				const lastKey = keys[keys.length - 1];
				if (lastKey.time > maxTime) maxTime = lastKey.time;
			}
		}
	}

	return Math.max(10, maxTime + 5);
}

/** Get project FPS, fallback to DEFAULT_FPS */
export function getProjectFps(): number {
	return DEFAULT_FPS;
}

/**
 * Get the effective out point for playback/export
 * Returns outPoint if set, otherwise returns the dynamic duration
 */
export function getEffectiveOutPoint(): number {
	const state = useTimelineStore.getState();
	if (state.outPoint !== null) {
		return state.outPoint;
	}
	return getDynamicDuration();
}

export const useTimelineStore = create<TimelineStore>()(
	(set) => ({
		snappingEnabled: true,
		toggleSnapping: () =>
			set((state) => ({ snappingEnabled: !state.snappingEnabled })),

		rippleEditingEnabled: false,
		toggleRippleEditing: () =>
			set((state) => ({ rippleEditingEnabled: !state.rippleEditingEnabled })),

		// P3-TRIM: Trim mode defaults
		trimMode: "rolling",
		setTrimMode: (mode) => set({ trimMode: mode }),
		editMode: "select",
		setEditMode: (mode) => set({ editMode: mode }),

		clipboard: null,
		setClipboard: (clipboard) => set({ clipboard }),

		loopMode: "off",
		cycleLoopMode: () =>
			set((state) => ({
				loopMode:
					state.loopMode === "off"
						? "loopAll"
						: state.loopMode === "loopAll"
							? "loopSelection"
							: "off",
			})),

		inPoint: 0,
		outPoint: null,
		setInPoint: (time) => set({ inPoint: Math.max(0, time) }),
		setOutPoint: (time) => set({ outPoint: time }),
		resetInOutPoints: () => set({ inPoint: 0, outPoint: null }),

		keyframeClipboard: null,
		setKeyframeClipboard: (data) => set({ keyframeClipboard: data }),
	}),
);
