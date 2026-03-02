import { useEffect } from "react";
import { useTimelineStore, type TrimMode } from "@/stores/timeline-store";

/**
 * Hook to handle keyboard shortcuts for trim/edit modes
 * Q - Select mode
 * W - Trim mode
 * E - Slip mode
 * R - Slide mode
 * T - Toggle trim mode (rolling/ripple/stick)
 */
export function useTrimModeShortcuts() {
	const { editMode, setEditMode, trimMode, setTrimMode } = useTimelineStore();

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			// Ignore if typing in input/textarea
			if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
				return;
			}

			// Don't trigger if modifier keys are held (for other shortcuts)
			if (e.ctrlKey || e.metaKey || e.altKey) {
				return;
			}

			switch (e.key.toLowerCase()) {
				case "q":
					setEditMode("select");
					break;
				case "w":
					setEditMode("trim");
					break;
				case "e":
					setEditMode("slip");
					break;
				case "r":
					setEditMode("slide");
					break;
				case "t":
					// Cycle through trim modes
					const modes: TrimMode[] = ["rolling", "ripple", "stick"];
					const currentIndex = modes.indexOf(trimMode);
					const nextIndex = (currentIndex + 1) % modes.length;
					setTrimMode(modes[nextIndex]);
					break;
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [editMode, trimMode, setEditMode, setTrimMode]);
}
