import { useState } from 'react';
import { useAppStore, type FilterType, FILTER_PRESETS, type FilterConfig } from '@/store/useAppStore';
import { useElementSelection } from '@/hooks/timeline/element/use-element-selection';
import {
    X,
    Plus,
    Eye,
    EyeOff,
    Copy,
    Trash2,
    Sliders,
    Sparkles,
    Droplet,
    Sun,
    Moon,
    Palette,
} from 'lucide-react';

const FILTER_ICONS: Record<FilterType, React.ReactNode> = {
    brightness: <Sun className="w-4 h-4" />,
    contrast: <Sliders className="w-4 h-4" />,
    saturation: <Droplet className="w-4 h-4" />,
    hue: <Palette className="w-4 h-4" />,
    blur: <Sparkles className="w-4 h-4" />,
    sharpen: <Sparkles className="w-4 h-4" />,
    sepia: <Moon className="w-4 h-4" />,
    grayscale: <Moon className="w-4 h-4" />,
    invert: <Moon className="w-4 h-4" />,
    vignette: <Moon className="w-4 h-4" />,
    noise: <Sparkles className="w-4 h-4" />,
};

interface FilterControlProps {
    filter: FilterConfig;
    trackId: string;
    onUpdate: (filterId: string, settings: Partial<FilterConfig>) => void;
    onRemove: (filterId: string) => void;
    onToggle: (filterId: string) => void;
    onDuplicate: (filterId: string) => void;
}

function FilterControl({
    filter,
    trackId: _trackId, // Used by parent to pass context
    onUpdate,
    onRemove,
    onToggle,
    onDuplicate,
}: FilterControlProps) {
    const [isExpanded, setIsExpanded] = useState(true);

    const preset = FILTER_PRESETS.find(p => p.type === filter.type);
    if (!preset) return null;

    const renderSlider = (
        key: string,
        label: string,
        min: number,
        max: number,
        step: number = 1
    ) => {
        const value = filter.settings[key] as number ?? preset.defaultSettings[key] as number;

        return (
            <div className="flex flex-col gap-1 mb-2">
                <div className="flex justify-between items-center">
                    <label className="text-xs text-neutral-400">{label}</label>
                    <span className="text-xs text-neutral-500 font-mono">{value.toFixed(step < 1 ? 1 : 0)}</span>
                </div>
                <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={(e) =>
                        onUpdate(filter.id, {
                            settings: { ...filter.settings, [key]: parseFloat(e.target.value) },
                        })
                    }
                    className="w-full h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
            </div>
        );
    };

    const renderFilterSettings = () => {
        switch (filter.type) {
            case 'brightness':
                return renderSlider('value', 'Brightness', 0, 200, 1);
            case 'contrast':
                return renderSlider('value', 'Contrast', 0, 200, 1);
            case 'saturation':
                return renderSlider('value', 'Saturation', 0, 200, 1);
            case 'hue':
                return renderSlider('angle', 'Hue Angle', 0, 360, 1);
            case 'blur':
                return renderSlider('amount', 'Blur Amount', 0, 20, 0.5);
            case 'sharpen':
                return renderSlider('amount', 'Sharpen Amount', 0, 5, 0.1);
            case 'sepia':
                return renderSlider('amount', 'Sepia Amount', 0, 100, 1);
            case 'grayscale':
                return renderSlider('amount', 'Grayscale Amount', 0, 100, 1);
            case 'invert':
                return renderSlider('amount', 'Invert Amount', 0, 100, 1);
            case 'vignette':
                return (
                    <>
                        {renderSlider('amount', 'Vignette Amount', 0, 100, 1)}
                        {renderSlider('radius', 'Vignette Radius', 10, 100, 5)}
                    </>
                );
            case 'noise':
                return renderSlider('amount', 'Noise Amount', 0, 100, 1);
            default:
                return null;
        }
    };

    return (
        <div
            className={`bg-neutral-800/50 border rounded-lg overflow-hidden transition-all ${filter.enabled
                    ? 'border-indigo-500/30'
                    : 'border-neutral-700 opacity-60'
                }`}
        >
            {/* Header */}
            <div
                className="flex items-center gap-2 px-3 py-2 bg-neutral-800/80 cursor-pointer hover:bg-neutral-700/50 transition-colors"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onToggle(filter.id);
                    }}
                    className="p-1 hover:bg-neutral-600 rounded transition-colors"
                    title={filter.enabled ? 'Disable filter' : 'Enable filter'}
                >
                    {filter.enabled ? (
                        <Eye className="w-3.5 h-3.5 text-indigo-400" />
                    ) : (
                        <EyeOff className="w-3.5 h-3.5 text-neutral-500" />
                    )}
                </button>

                <div className="flex items-center gap-2 text-neutral-300">
                    <span className="text-indigo-400">{FILTER_ICONS[filter.type]}</span>
                    <span className="text-sm font-medium">{preset.name}</span>
                </div>

                <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onDuplicate(filter.id);
                        }}
                        className="p-1 hover:bg-neutral-600 rounded transition-colors"
                        title="Duplicate filter"
                    >
                        <Copy className="w-3.5 h-3.5 text-neutral-400" />
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onRemove(filter.id);
                        }}
                        className="p-1 hover:bg-red-600/30 rounded transition-colors"
                        title="Remove filter"
                    >
                        <Trash2 className="w-3.5 h-3.5 text-neutral-400 hover:text-red-400" />
                    </button>
                    <X className="w-3.5 h-3.5 text-neutral-500" />
                </div>
            </div>

            {/* Settings */}
            {isExpanded && (
                <div className="px-3 py-3 border-t border-neutral-700/50">
                    {renderFilterSettings()}
                </div>
            )}
        </div>
    );
}

interface FiltersPanelProps {
    className?: string;
}

export function FiltersPanel({ className }: FiltersPanelProps) {
    const { editorData, addFilterToTrack, removeFilterFromTrack, updateFilterOnTrack, toggleFilterOnTrack, duplicateFilterOnTrack } = useAppStore();
    const { selectedElements } = useElementSelection();
    const [showAddMenu, setShowAddMenu] = useState(false);

    // Get selected track
    const selectedTrackId = selectedElements.length > 0 ? selectedElements[0].trackId : null;
    const selectedTrack = editorData.find(t => t.id === selectedTrackId);
    const filters = selectedTrack?.filters ?? [];

    const handleAddFilter = (filterType: FilterType) => {
        if (selectedTrackId) {
            addFilterToTrack(selectedTrackId, filterType);
            setShowAddMenu(false);
        }
    };

    if (!selectedTrack) {
        return (
            <div className={`flex flex-col items-center justify-center h-full text-neutral-500 ${className}`}>
                <Sliders className="w-12 h-12 opacity-30 mb-4" />
                <p className="text-sm font-medium">No track selected</p>
                <p className="text-xs opacity-60 mt-1">Select a track to apply filters</p>
            </div>
        );
    }

    return (
        <div className={`flex flex-col h-full overflow-hidden ${className}`}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-700">
                <div className="flex items-center gap-2">
                    <Sliders className="w-5 h-5 text-indigo-400" />
                    <h2 className="text-sm font-semibold text-neutral-200">Filters</h2>
                </div>
                <div className="relative">
                    <button
                        onClick={() => setShowAddMenu(!showAddMenu)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition-colors"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        Add Filter
                    </button>

                    {/* Add Filter Menu */}
                    {showAddMenu && (
                        <>
                            <div
                                className="fixed inset-0 z-10"
                                onClick={() => setShowAddMenu(false)}
                            />
                            <div className="absolute right-0 top-full mt-1 w-48 bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl z-20 max-h-80 overflow-y-auto">
                                <div className="p-2">
                                    <div className="text-xs font-semibold text-neutral-400 px-2 py-1.5">
                                        Basic
                                    </div>
                                    {FILTER_PRESETS.filter(f => ['brightness', 'contrast', 'saturation', 'hue'].includes(f.type)).map(preset => (
                                        <button
                                            key={preset.type}
                                            onClick={() => handleAddFilter(preset.type)}
                                            className="w-full flex items-center gap-2 px-2 py-2 text-left text-sm text-neutral-300 hover:bg-neutral-700 rounded transition-colors"
                                        >
                                            <span className="text-indigo-400">{FILTER_ICONS[preset.type]}</span>
                                            {preset.name}
                                        </button>
                                    ))}
                                    <div className="text-xs font-semibold text-neutral-400 px-2 py-1.5 mt-2">
                                        Effects
                                    </div>
                                    {FILTER_PRESETS.filter(f => ['blur', 'sharpen', 'noise'].includes(f.type)).map(preset => (
                                        <button
                                            key={preset.type}
                                            onClick={() => handleAddFilter(preset.type)}
                                            className="w-full flex items-center gap-2 px-2 py-2 text-left text-sm text-neutral-300 hover:bg-neutral-700 rounded transition-colors"
                                        >
                                            <span className="text-indigo-400">{FILTER_ICONS[preset.type]}</span>
                                            {preset.name}
                                        </button>
                                    ))}
                                    <div className="text-xs font-semibold text-neutral-400 px-2 py-1.5 mt-2">
                                        Stylize
                                    </div>
                                    {FILTER_PRESETS.filter(f => ['sepia', 'grayscale', 'invert', 'vignette'].includes(f.type)).map(preset => (
                                        <button
                                            key={preset.type}
                                            onClick={() => handleAddFilter(preset.type)}
                                            className="w-full flex items-center gap-2 px-2 py-2 text-left text-sm text-neutral-300 hover:bg-neutral-700 rounded transition-colors"
                                        >
                                            <span className="text-indigo-400">{FILTER_ICONS[preset.type]}</span>
                                            {preset.name}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Filters List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {filters.length === 0 ? (
                    <div className="text-center py-8 text-neutral-500">
                        <Sliders className="w-8 h-8 opacity-30 mx-auto mb-2" />
                        <p className="text-xs">No filters applied</p>
                        <p className="text-xs opacity-60 mt-1">Click "Add Filter" to get started</p>
                    </div>
                ) : (
                    filters.map(filter => (
                        <FilterControl
                            key={filter.id}
                            filter={filter}
                            trackId={selectedTrack.id}
                            onUpdate={(filterId, settings) => updateFilterOnTrack(selectedTrack.id, filterId, settings)}
                            onRemove={(filterId) => removeFilterFromTrack(selectedTrack.id, filterId)}
                            onToggle={(filterId) => toggleFilterOnTrack(selectedTrack.id, filterId)}
                            onDuplicate={(filterId) => duplicateFilterOnTrack(selectedTrack.id, filterId)}
                        />
                    ))
                )}
            </div>
        </div>
    );
}
