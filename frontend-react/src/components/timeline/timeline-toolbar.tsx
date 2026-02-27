import { useEditor } from "@/hooks/use-editor";
import {
	TooltipProvider,
	Tooltip,
	TooltipTrigger,
	TooltipContent,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { SplitSquareHorizontal } from "lucide-react";
import {
	SplitButton,
	SplitButtonLeft,
	SplitButtonRight,
	SplitButtonSeparator,
} from "@/components/ui/split-button";
import { Slider } from "@/components/ui/slider";
import { TIMELINE_CONSTANTS } from "@/constants/timeline-constants";
import { sliderToZoom, zoomToSlider } from "@/lib/timeline/zoom-utils";

import { type TAction, invokeAction } from "@/lib/actions";
import { cn } from "@/utils/ui";
import { useTimelineStore } from "@/stores/timeline-store";
import { useAppStore } from "@/store/useAppStore";
import { useTransientSnapshot, toggleAutoKeyframe } from "@/stores/transient-store";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Bookmark02Icon,
	Delete02Icon,
	SnowIcon,
	ScissorIcon,
	MagnetIcon,
	Link04Icon,
	SearchAddIcon,
	SearchMinusIcon,
	Copy01Icon,
	AlignLeftIcon,
	AlignRightIcon,
	Layers01Icon,
	RecordIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

export function TimelineToolbar({
	zoomLevel,
	minZoom,
	setZoomLevel,
}: {
	zoomLevel: number;
	minZoom: number;
	setZoomLevel: ({ zoom }: { zoom: number }) => void;
}) {
	const handleZoom = ({ direction }: { direction: "in" | "out" }) => {
		const newZoomLevel =
			direction === "in"
				? Math.min(
					TIMELINE_CONSTANTS.ZOOM_MAX,
					zoomLevel * TIMELINE_CONSTANTS.ZOOM_BUTTON_FACTOR,
				)
				: Math.max(minZoom, zoomLevel / TIMELINE_CONSTANTS.ZOOM_BUTTON_FACTOR);
		setZoomLevel({ zoom: newZoomLevel });
	};

	return (
		<ScrollArea className="scrollbar-hidden">
			<div className="flex h-10 items-center justify-between border-b px-2 py-1">
				<ToolbarLeftSection />

				<SceneSelector />

				<ToolbarRightSection
					zoomLevel={zoomLevel}
					minZoom={minZoom}
					onZoomChange={(zoom) => setZoomLevel({ zoom })}
					onZoom={handleZoom}
				/>
			</div>
		</ScrollArea>
	);
}

function ToolbarLeftSection() {
	const editor = useEditor();
	const currentTime = editor.playback.getCurrentTime();
	const currentBookmarked = editor.scenes.isBookmarked({ time: currentTime });
	const snapT = useTransientSnapshot();
	const isAutoKeyframeEnabled = snapT.isAutoKeyframeEnabled;

	const handleAction = ({
		action,
		event,
	}: {
		action: TAction;
		event: React.MouseEvent;
	}) => {
		event.stopPropagation();
		const selected = editor.selection.getSelectedElements();

		if (action === "delete-selected") {
			if (selected.length > 0) {
				editor.timeline.deleteElements(selected);
				editor.selection.clearSelection();
			}
		} else if (action === "split") {
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
		} else if (action === "split-left") {
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
							newActions[actionIdx] = { ...targetAction, start: cursorTime };
							modified = true;
						}
					}
				});
				return modified ? { ...row, actions: newActions } : row;
			}));
		} else if (action === "split-right") {
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
							newActions[actionIdx] = { ...targetAction, end: cursorTime };
							modified = true;
						}
					}
				});
				return modified ? { ...row, actions: newActions } : row;
			}));
		} else if (action === "duplicate-selected") {
			useAppStore.getState().setEditorData(prev => prev.map(row => {
				let newActions = [...row.actions];
				let modified = false;
				selected.forEach(sel => {
					if (sel.elementId.endsWith("_compound")) return;
					const targetAction = row.actions.find(a => a.id === sel.elementId);
					if (targetAction) {
						newActions.push({
							...targetAction,
							id: `action_${Date.now()}_${Math.random()}`,
							zIndex: targetAction.zIndex + 1
						});
						modified = true;
					}
				});
				return modified ? { ...row, actions: newActions } : row;
			}));
		} else {
			invokeAction(action);
		}
	};

	return (
		<div className="flex items-center gap-1">
			<TooltipProvider delayDuration={500}>
				<ToolbarButton
					icon={<HugeiconsIcon icon={ScissorIcon} />}
					tooltip="Split element"
					onClick={({ event }) => handleAction({ action: "split", event })}
				/>

				<ToolbarButton
					icon={<HugeiconsIcon icon={AlignLeftIcon} />}
					tooltip="Split left"
					onClick={({ event }) => handleAction({ action: "split-left", event })}
				/>

				<ToolbarButton
					icon={<HugeiconsIcon icon={AlignRightIcon} />}
					tooltip="Split right"
					onClick={({ event }) =>
						handleAction({ action: "split-right", event })
					}
				/>

				<ToolbarButton
					icon={<SplitSquareHorizontal />}
					tooltip="Coming soon" /* separate audio */
					disabled={true}
					onClick={({ event: _event }) => { }}
				/>

				<ToolbarButton
					icon={<HugeiconsIcon icon={Copy01Icon} />}
					tooltip="Duplicate element"
					onClick={({ event }) =>
						handleAction({ action: "duplicate-selected", event })
					}
				/>

				<ToolbarButton
					icon={<HugeiconsIcon icon={SnowIcon} />}
					tooltip="Coming soon" /* freeze frame */
					disabled={true}
					onClick={({ event: _event }) => { }}
				/>

				<ToolbarButton
					icon={<HugeiconsIcon icon={Delete02Icon} />}
					tooltip="Delete element"
					onClick={({ event }) =>
						handleAction({ action: "delete-selected", event })
					}
				/>

				<div className="bg-border mx-1 h-6 w-px" />

				<Tooltip>
					<ToolbarButton
						icon={<HugeiconsIcon icon={RecordIcon} className={isAutoKeyframeEnabled ? "text-red-500 fill-red-500 animate-pulse" : ""} />}
						isActive={isAutoKeyframeEnabled}
						tooltip={isAutoKeyframeEnabled ? "Disable Auto-Keyframe" : "Enable Auto-Keyframe"}
						onClick={() => toggleAutoKeyframe()}
					/>
				</Tooltip>

				<div className="bg-border mx-1 h-6 w-px" />

				<Tooltip>
					<ToolbarButton
						icon={<HugeiconsIcon icon={Bookmark02Icon} />}
						isActive={currentBookmarked}
						tooltip={currentBookmarked ? "Remove bookmark" : "Add bookmark"}
						onClick={({ event }) =>
							handleAction({ action: "toggle-bookmark", event })
						}
					/>
				</Tooltip>
			</TooltipProvider>
		</div>
	);
}

function SceneSelector() {
	const editor = useEditor();
	const currentScene = editor.scenes.getActiveScene();

	return (
		<div>
			<SplitButton className="border-foreground/10 border">
				<SplitButtonLeft>{currentScene?.name || "No Scene"}</SplitButtonLeft>
				<SplitButtonSeparator />
				<div className="opacity-50 pointer-events-none">
					<SplitButtonRight onClick={() => { }}>
						<HugeiconsIcon icon={Layers01Icon} className="size-4" />
					</SplitButtonRight>
				</div>
			</SplitButton>
		</div>
	);
}

function ToolbarRightSection({
	zoomLevel,
	minZoom,
	onZoomChange,
	onZoom,
}: {
	zoomLevel: number;
	minZoom: number;
	onZoomChange: (zoom: number) => void;
	onZoom: (options: { direction: "in" | "out" }) => void;
}) {
	const {
		snappingEnabled,
		rippleEditingEnabled,
		loopMode,
		toggleSnapping,
		toggleRippleEditing,
		cycleLoopMode,
	} = useTimelineStore();

	const loopTooltip = loopMode === "off" ? "Loop: OFF" : loopMode === "loopAll" ? "Loop: ALL" : "Loop: IN↔OUT";

	return (
		<div className="flex items-center gap-1">
			<TooltipProvider delayDuration={500}>
				<ToolbarButton
					icon={<HugeiconsIcon icon={MagnetIcon} />}
					isActive={snappingEnabled}
					tooltip="Auto snapping"
					onClick={() => toggleSnapping()}
				/>

				<ToolbarButton
					icon={<HugeiconsIcon icon={Link04Icon} className="scale-110" />}
					isActive={rippleEditingEnabled}
					tooltip="Ripple editing"
					onClick={() => toggleRippleEditing()}
				/>

				<ToolbarButton
					icon={
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4">
							<polyline points="17 1 21 5 17 9" />
							<path d="M3 11V9a4 4 0 0 1 4-4h14" />
							<polyline points="7 23 3 19 7 15" />
							<path d="M21 13v2a4 4 0 0 1-4 4H3" />
						</svg>
					}
					isActive={loopMode !== "off"}
					tooltip={loopTooltip}
					onClick={() => cycleLoopMode()}
				/>
			</TooltipProvider>

			<div className="bg-border mx-1 h-6 w-px" />

			<div className="flex items-center gap-1">
				<Button
					variant="text"
					size="icon"
					onClick={() => onZoom({ direction: "out" })}
				>
					<HugeiconsIcon icon={SearchMinusIcon} />
				</Button>
				<Slider
					className="w-28"
					value={[zoomToSlider({ zoomLevel, minZoom })]}
					onValueChange={(values) =>
						onZoomChange(sliderToZoom({ sliderPosition: values[0], minZoom }))
					}
					min={0}
					max={1}
					step={0.005}
				/>
				<Button
					variant="text"
					size="icon"
					onClick={() => onZoom({ direction: "in" })}
				>
					<HugeiconsIcon icon={SearchAddIcon} />
				</Button>
			</div>
		</div>
	);
}

function ToolbarButton({
	icon,
	tooltip,
	onClick,
	disabled,
	isActive,
}: {
	icon: React.ReactNode;
	tooltip: string;
	onClick: ({ event }: { event: React.MouseEvent }) => void;
	disabled?: boolean;
	isActive?: boolean;
}) {
	return (
		<Tooltip delayDuration={200}>
			<TooltipTrigger asChild>
				<Button
					variant={isActive ? "secondary" : "text"}
					size="icon"
					onClick={(event) => onClick({ event })}
					className={cn(
						"rounded-sm",
						disabled ? "cursor-not-allowed opacity-50" : "",
					)}
				>
					{icon}
				</Button>
			</TooltipTrigger>
			<TooltipContent>{tooltip}</TooltipContent>
		</Tooltip>
	);
}
