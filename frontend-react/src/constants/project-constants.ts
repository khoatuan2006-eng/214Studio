export type TCanvasSize = {
	width: number;
	height: number;
	name?: string;
};

export const DEFAULT_CANVAS_PRESETS: TCanvasSize[] = [
	{ width: 1920, height: 1080, name: "1080p Horizontal" },
	{ width: 1080, height: 1920, name: "1080p Vertical" },
	{ width: 1080, height: 1080, name: "1080p Square" },
	{ width: 1440, height: 1080, name: "1080p Ultrawide" },
];

export const FPS_PRESETS = [
	{ value: "24", label: "24 fps" },
	{ value: "25", label: "25 fps" },
	{ value: "30", label: "30 fps" },
	{ value: "60", label: "60 fps" },
	{ value: "120", label: "120 fps" },
] as const;

export const BLUR_INTENSITY_PRESETS: { label: string; value: number }[] = [
	{ label: "Light", value: 4 },
	{ label: "Medium", value: 8 },
	{ label: "Heavy", value: 18 },
] as const;

export const DEFAULT_CANVAS_SIZE: TCanvasSize = { width: 1920, height: 1080, name: "1080p Horizontal" };
export const LOGICAL_WIDTH = 1920;
export const LOGICAL_HEIGHT = 1080;
export const DEFAULT_FPS = 30;
export const DEFAULT_BLUR_INTENSITY = 8;
export const DEFAULT_COLOR = "#000000";
