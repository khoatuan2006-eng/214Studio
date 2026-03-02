import { useCanvasZoomStore, ZOOM_PRESETS } from '@/stores/canvas-zoom-store';
import { ZoomIn, ZoomOut, Maximize, Minimize } from 'lucide-react';

interface ZoomControlsProps {
    className?: string;
}

export function ZoomControls({ className }: ZoomControlsProps) {
    const { zoom, setZoom, zoomIn, zoomOut, resetZoom, resetPan } = useCanvasZoomStore();

    const handlePresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const value = parseFloat(e.target.value);
        setZoom(value);
    };

    return (
        <div className={`flex items-center gap-2 ${className}`}>
            {/* Zoom Out */}
            <button
                onClick={zoomOut}
                disabled={zoom <= 0.25}
                className="p-2 hover:bg-neutral-700 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                title="Zoom Out (Ctrl + -)"
            >
                <ZoomOut className="w-4 h-4 text-neutral-300" />
            </button>

            {/* Zoom Slider */}
            <div className="flex items-center gap-2 bg-neutral-800 rounded-lg px-3 py-1.5">
                <Minimize className="w-3 h-3 text-neutral-500" />
                <input
                    type="range"
                    min="0.25"
                    max="4"
                    step="0.25"
                    value={zoom}
                    onChange={(e) => setZoom(parseFloat(e.target.value))}
                    className="w-24 h-1 bg-neutral-600 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
                <Maximize className="w-3 h-3 text-neutral-500" />
            </div>

            {/* Zoom In */}
            <button
                onClick={zoomIn}
                disabled={zoom >= 4}
                className="p-2 hover:bg-neutral-700 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                title="Zoom In (Ctrl + +)"
            >
                <ZoomIn className="w-4 h-4 text-neutral-300" />
            </button>

            {/* Zoom Presets Dropdown */}
            <select
                value={zoom}
                onChange={handlePresetChange}
                className="bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-1.5 text-sm text-neutral-300 outline-none focus:border-indigo-500 cursor-pointer"
                title="Zoom Level"
            >
                {ZOOM_PRESETS.map(preset => (
                    <option key={preset.value} value={preset.value}>
                        {preset.label}
                    </option>
                ))}
            </select>

            {/* Fit to Screen */}
            <button
                onClick={() => {
                    resetZoom();
                    resetPan();
                }}
                className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-sm text-neutral-300 transition-colors"
                title="Fit to Screen (Ctrl + 0)"
            >
                Fit
            </button>

            {/* Reset Pan */}
            <button
                onClick={resetPan}
                className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-sm text-neutral-300 transition-colors"
                title="Reset Pan (Space + Click)"
            >
                Reset Pan
            </button>
        </div>
    );
}
