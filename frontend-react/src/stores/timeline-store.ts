/**
 * UI state for the timeline
 * For core logic, use EditorCore instead.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ClipboardItem } from "@/types/timeline";
import { useAppStore } from "@/store/useAppStore";
import { DEFAULT_FPS } from "@/constants/project-constants";

export type LoopMode = "off" | "loopAll" | "loopSelection";

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

/** Get effective outPoint: stored value or dynamic duration */
export function getEffectiveOutPoint(): number {
	const { outPoint } = useTimelineStore.getState();
	return outPoint ?? getDynamicDuration();
}

export const useTimelineStore = create<TimelineStore>()(
	persist(
		(set) => ({
			snappingEnabled: true,

			toggleSnapping: () => {
				set((state) => ({ snappingEnabled: !state.snappingEnabled }));
			},

			rippleEditingEnabled: false,

			toggleRippleEditing: () => {
				set((state) => ({
					rippleEditingEnabled: !state.rippleEditingEnabled,
				}));
			},

			clipboard: null,

			setClipboard: (clipboard) => {
				set({ clipboard });
			},

			// P1 3.11: Loop Mode — cycle off → loopAll → loopSelection → off
			loopMode: "off",
			cycleLoopMode: () => {
				set((state) => {
					const modes: LoopMode[] = ["off", "loopAll", "loopSelection"];
					const idx = modes.indexOf(state.loopMode);
					return { loopMode: modes[(idx + 1) % modes.length] };
				});
			},

			// P1 3.9: In/Out Points
			inPoint: 0,
			outPoint: null,
			setInPoint: (time) => set({ inPoint: Math.max(0, time) }),
			setOutPoint: (time) => set({ outPoint: time }),
			resetInOutPoints: () => set({ inPoint: 0, outPoint: null }),

			// P1 4.4: Keyframe Clipboard
			keyframeClipboard: null,
			setKeyframeClipboard: (data) => {
				set({ keyframeClipboard: data });
			},
		}),
		{
			name: "timeline-store",
			partialize: (state) => ({
				snappingEnabled: state.snappingEnabled,
				rippleEditingEnabled: state.rippleEditingEnabled,
				loopMode: state.loopMode,
			}),
		},
	),
);
