import { useTimelineStore, type TrimMode, type EditMode } from "@/stores/timeline-store";
import { Scissors, Move, Hand, MousePointer, Lock } from "lucide-react";

interface TrimModeToolbarProps {
	className?: string;
}

export function TrimModeToolbar({ className }: TrimModeToolbarProps) {
	const { trimMode, setTrimMode, editMode, setEditMode } = useTimelineStore();

	const trimModes: { mode: TrimMode; label: string; description: string }[] = [
		{
			mode: "rolling",
			label: "Rolling",
			description: "Trim adjacent clips together",
		},
		{
			mode: "ripple",
			label: "Ripple",
			description: "Trim and shift all following clips",
		},
		{
			mode: "stick",
			label: "Stick",
			description: "Lock trim to playhead position",
		},
	];

	const editModes: { mode: EditMode; label: string; icon: React.ReactNode }[] = [
		{ mode: "select", label: "Select", icon: <MousePointer className="w-4 h-4" /> },
		{ mode: "trim", label: "Trim", icon: <Scissors className="w-4 h-4" /> },
		{ mode: "slip", label: "Slip", icon: <Hand className="w-4 h-4" /> },
		{ mode: "slide", label: "Slide", icon: <Move className="w-4 h-4" /> },
	];

	return (
		<div className={`flex items-center gap-2 ${className}`}>
			{/* Edit Mode Selector */}
			<div className="flex items-center gap-1 bg-neutral-800 rounded-lg p-1">
				{editModes.map(({ mode, label, icon }) => (
					<button
						key={mode}
						onClick={() => setEditMode(mode)}
						className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
							editMode === mode
								? "bg-indigo-600 text-white"
								: "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700"
						}`}
						title={`${label} mode`}
					>
						{icon}
						<span className="hidden lg:inline">{label}</span>
					</button>
				))}
			</div>

			{/* Trim Mode Selector (only visible in trim mode) */}
			{editMode === "trim" && (
				<>
					<div className="w-px h-4 bg-neutral-700" />
					<div className="flex items-center gap-1 bg-neutral-800 rounded-lg p-1">
						{trimModes.map(({ mode, label, description }) => (
							<button
								key={mode}
								onClick={() => setTrimMode(mode)}
								className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
									trimMode === mode
										? "bg-indigo-600 text-white"
										: "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700"
								}`}
								title={description}
							>
								{mode === "rolling" && <Scissors className="w-3.5 h-3.5" />}
								{mode === "ripple" && <Move className="w-3.5 h-3.5" />}
								{mode === "stick" && <Lock className="w-3.5 h-3.5" />}
								<span className="hidden lg:inline">{label}</span>
							</button>
						))}
					</div>
				</>
			)}

			{/* Keyboard shortcuts hint */}
			<div className="flex items-center gap-2 text-xs text-neutral-500 ml-2">
				<span className="hidden xl:inline">Shortcuts:</span>
				<kbd className="px-1.5 py-0.5 bg-neutral-800 rounded text-neutral-400">Q</kbd>
				<span className="hidden xl:inline">Select</span>
				<kbd className="px-1.5 py-0.5 bg-neutral-800 rounded text-neutral-400">W</kbd>
				<span className="hidden xl:inline">Trim</span>
				<kbd className="px-1.5 py-0.5 bg-neutral-800 rounded text-neutral-400">E</kbd>
				<span className="hidden xl:inline">Slip</span>
				<kbd className="px-1.5 py-0.5 bg-neutral-800 rounded text-neutral-400">R</kbd>
				<span className="hidden xl:inline">Slide</span>
			</div>
		</div>
	);
}
