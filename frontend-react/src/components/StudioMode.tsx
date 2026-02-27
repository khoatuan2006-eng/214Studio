import React, { useState, useEffect, useRef } from 'react';
import { useAppStore, STATIC_BASE, getAssetPath } from '../store/useAppStore';
import { useEditor } from '../hooks/use-editor';
import { setDragData } from '../lib/drag-data';
import type { ActionBlock, TimelineKeyframe, EasingType, CharacterTrack } from '../store/useAppStore';
import { Timeline as TimelinePanel } from './timeline';
import { Stage, Layer, Image as KonvaImageRect, Rect, Group, Text, Transformer, Circle, Line } from 'react-konva';
import { Play, Pause, Plus, MousePointer2, Eye, EyeOff, Trash2, Edit, ChevronLeft, Lock, Unlock } from 'lucide-react';

// Custom hook to load images for Konva
const useKonvaImage = (url: string) => {
    const [image, setImage] = useState<HTMLImageElement | null>(null);
    useEffect(() => {
        if (!url) return;
        const img = new window.Image();
        img.crossOrigin = 'anonymous';
        img.src = url;
        img.onload = () => setImage(img);
    }, [url]);
    return image;
};

// Component for stable property input without caret jumping
const PropertyInput = ({ label, value, onChange, hasKeyframe, onToggleKeyframe, step = "1", type = "number", className = "" }: { label: string, value: number | string, onChange: (val: any) => void, hasKeyframe?: boolean, onToggleKeyframe?: () => void, step?: string, type?: string, className?: string }) => {
    const [localVal, setLocalVal] = useState(value.toString());

    useEffect(() => {
        setLocalVal(value.toString());
    }, [value]);

    const handleCommit = () => {
        if (type === "number") {
            const parsed = parseFloat(localVal);
            if (!isNaN(parsed) && parsed !== value) {
                onChange(parsed);
            } else {
                setLocalVal(value.toString()); // Revert on invalid
            }
        } else {
            onChange(localVal);
        }
    };

    const handleScrubStart = (e: React.MouseEvent) => {
        if (type !== 'number') return;
        e.preventDefault();
        const startX = e.clientX;
        const startVal = parseFloat(value.toString()) || 0;
        const stepNum = parseFloat(step) || 1;
        const isDecimal = stepNum < 1;
        // Sensitivity factor to make high-value scrubbing smoother (e.g. X: 0-1920)
        // If step is 1, scrub 2 pixels for 1 unit change.
        const sensitivity = stepNum < 1 ? 1 : 0.5;

        const handleMouseMove = (mvEvent: MouseEvent) => {
            const deltaX = mvEvent.clientX - startX;
            let newVal = startVal + (deltaX * stepNum * sensitivity);
            if (label.includes("Opacity")) newVal = Math.max(0, Math.min(100, newVal)); // Clamp Opacity

            if (isDecimal) {
                newVal = parseFloat(newVal.toFixed(2));
            } else {
                newVal = Math.round(newVal);
            }
            onChange(newVal);
        };

        const handleMouseUp = () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    return (
        <div className={`flex flex-col gap-1 ${className}`}>
            <div className="flex items-center justify-between gap-1">
                <label
                    className={`text-xs text-neutral-400 select-none ${type === 'number' ? 'cursor-ew-resize hover:text-indigo-400 transition-colors' : ''}`}
                    onMouseDown={handleScrubStart}
                    title={type === 'number' ? "Drag horizontally to change value" : ""}
                >
                    {label}
                </label>
                {onToggleKeyframe && (
                    <button
                        onClick={onToggleKeyframe}
                        className="p-1 hover:bg-neutral-700 rounded transition-colors"
                        title={hasKeyframe ? "Remove Keyframe" : "Add Keyframe"}
                    >
                        <div className={`w-2.5 h-2.5 rotate-45 border transition-colors ${hasKeyframe ? 'bg-indigo-500 border-indigo-300 shadow-[0_0_8px_rgba(99,102,241,0.5)]' : 'bg-transparent border-neutral-600 hover:border-neutral-400'}`} />
                    </button>
                )}
            </div>
            <input
                type={type}
                step={step}
                className={`w-full bg-neutral-800 border ${hasKeyframe ? 'border-indigo-500/50' : 'border-neutral-700'} rounded p-1.5 text-sm outline-none focus:border-indigo-500 transition-colors`}
                value={localVal}
                onChange={e => setLocalVal(e.target.value)}
                onBlur={handleCommit}
                onKeyDown={e => e.key === 'Enter' && handleCommit()}
            />
        </div>
    );
};

// Component to render a Canvas Image
const CanvasAsset = React.forwardRef<any, { assetHash: string; zIndex: number; onClick?: (e: any) => void; onTap?: (e: any) => void; locked?: boolean; hidden?: boolean }>(({ assetHash, onClick, onTap, locked, hidden }, ref) => {
    const characters = useAppStore(s => s.characters);
    const url = `${STATIC_BASE}/${getAssetPath(characters, assetHash)}`;
    const image = useKonvaImage(url);

    if (!image) return null;
    return (
        <KonvaImageRect
            ref={ref}
            image={image}
            x={0}
            y={0}
            offset={{ x: image.width / 2, y: image.height / 2 }}
            draggable={false}
            listening={!locked}
            visible={!hidden}
            onClick={onClick}
            onTap={onTap}
        />
    );
});
CanvasAsset.displayName = 'CanvasAsset';

// --- Math Helpers ---
const applyEasing = (progress: number, type?: EasingType): number => {
    switch (type) {
        case 'easeIn': return progress * progress * progress;
        case 'easeOut': return 1 - Math.pow(1 - progress, 3);
        case 'easeInOut': return progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;
        case 'linear':
        default: return progress;
    }
};

const getInterpolatedValue = (keyframes: TimelineKeyframe[], time: number, defaultValue: number): number => {
    if (!keyframes || keyframes.length === 0) return defaultValue;

    const sorted = [...keyframes].sort((a, b) => a.time - b.time);
    if (time <= sorted[0].time) return sorted[0].value;
    if (time >= sorted[sorted.length - 1].time) return sorted[sorted.length - 1].value;

    for (let i = 0; i < sorted.length - 1; i++) {
        if (time >= sorted[i].time && time <= sorted[i + 1].time) {
            const k1 = sorted[i];
            const k2 = sorted[i + 1];
            const tRange = k2.time - k1.time;
            if (tRange === 0) return k1.value;

            let progress = (time - k1.time) / tRange;
            progress = applyEasing(progress, k1.easing);
            return k1.value + (k2.value - k1.value) * progress;
        }
    }
    return defaultValue;
};

// Quick standalone component that subscribes to time rapidly
const PlayheadTimeDisplay = () => {
    const time = useAppStore(s => s.cursorTime);
    return <div className="font-mono text-xl text-indigo-400 w-24">{time.toFixed(2)}s</div>;
};

// Separated Right Sidebar to isolate re-renders away from Konva
const PropertiesSidebar = ({ selectedRowId, LOGICAL_WIDTH, LOGICAL_HEIGHT }: { selectedRowId: string, LOGICAL_WIDTH: number, LOGICAL_HEIGHT: number }) => {
    const editorData = useAppStore(s => s.editorData);
    const setEditorData = useAppStore(s => s.setEditorData);
    const cursorTime = useAppStore(s => s.cursorTime);
    const [inspectorTab, setInspectorTab] = useState<'keyframes' | 'settings'>('keyframes');
    const setActiveEditTargetId = useAppStore(s => s.setActiveEditTargetId);

    const toggleCharacterEditMode = (rowId: string) => {
        setActiveEditTargetId(rowId);
    };

    const handlePropertyChange = (property: 'x' | 'y' | 'scale' | 'rotation' | 'opacity' | 'easing' | 'anchorX' | 'anchorY', value: number | EasingType) => {
        setEditorData(prev => prev.map(row => {
            if (row.id !== selectedRowId) return row;

            const newTransform = { ...row.transform };
            const keys = property === 'easing' ? [...newTransform.x] : [...newTransform[property as keyof typeof newTransform]];

            if (property === 'easing') {
                const existingIdx = keys.findIndex(k => Math.abs(k.time - cursorTime) < 0.05);
                if (existingIdx >= 0) {
                    ['x', 'y', 'scale', 'rotation', 'opacity'].forEach(prop => {
                        const chKeys = newTransform[prop as keyof typeof newTransform];
                        const idx = chKeys.findIndex(k => Math.abs(k.time - cursorTime) < 0.05);
                        if (idx >= 0) chKeys[idx].easing = value as EasingType;
                    });
                }
                return { ...row, transform: newTransform };
            }

            if (typeof value !== 'number' || isNaN(value)) return row;

            const existingIdx = keys.findIndex(k => Math.abs(k.time - cursorTime) < 0.05);

            if (existingIdx >= 0) {
                keys[existingIdx].value = value;
            } else {
                keys.push({ time: cursorTime, value, easing: 'linear' });
            }

            // sort ascending
            keys.sort((a, b) => a.time - b.time);
            newTransform[property as keyof typeof newTransform] = keys;
            return { ...row, transform: newTransform };
        }));
    };

    const selectedRow = editorData.find(r => r.id === selectedRowId);
    const selectedInterpX = selectedRow ? getInterpolatedValue(selectedRow.transform.x, cursorTime, LOGICAL_WIDTH / 2) : 0;
    const selectedInterpY = selectedRow ? getInterpolatedValue(selectedRow.transform.y, cursorTime, LOGICAL_HEIGHT / 2) : 0;
    const selectedInterpScale = selectedRow ? getInterpolatedValue(selectedRow.transform.scale, cursorTime, 1) : 1;
    const selectedInterpRotation = selectedRow ? getInterpolatedValue(selectedRow.transform.rotation, cursorTime, 0) : 0;
    const selectedInterpOpacity = selectedRow ? getInterpolatedValue(selectedRow.transform.opacity, cursorTime, 100) : 100;
    const selectedInterpAnchorX = selectedRow ? getInterpolatedValue(selectedRow.transform.anchorX, cursorTime, 0) : 0;
    const selectedInterpAnchorY = selectedRow ? getInterpolatedValue(selectedRow.transform.anchorY, cursorTime, 0) : 0;

    let currentEasing: EasingType = 'linear';
    if (selectedRow) {
        const keyAtTime = selectedRow.transform.x.find(k => Math.abs(k.time - cursorTime) < 0.05);
        if (keyAtTime?.easing) currentEasing = keyAtTime.easing;
    }

    const handleToggleKeyframe = (property: 'x' | 'y' | 'scale' | 'rotation' | 'opacity' | 'anchorX' | 'anchorY', currentValue: number) => {
        if (!selectedRow) return;
        const exists = selectedRow.transform[property].some(k => Math.abs(k.time - cursorTime) < 0.05);
        if (exists) {
            setEditorData(prev => prev.map(row => {
                if (row.id !== selectedRowId) return row;
                const newTransform = { ...row.transform };
                newTransform[property] = newTransform[property].filter(k => Math.abs(k.time - cursorTime) > 0.05);
                return { ...row, transform: newTransform };
            }));
        } else {
            handlePropertyChange(property, currentValue);
        }
    };

    const toggleLayerVisibility = (rowId: string, actionId: string) => {
        setEditorData(prev => prev.map(r => r.id === rowId ? {
            ...r,
            actions: r.actions.map(a => a.id === actionId ? { ...a, hidden: !a.hidden } : a)
        } : r));
    };

    const toggleLayerLock = (rowId: string, actionId: string) => {
        setEditorData(prev => prev.map(r => r.id === rowId ? {
            ...r,
            actions: r.actions.map(a => a.id === actionId ? { ...a, locked: !a.locked } : a)
        } : r));
    };

    const deleteLayer = (rowId: string, actionId: string) => {
        setEditorData(prev => prev.map(r => r.id === rowId ? {
            ...r,
            actions: r.actions.filter(a => a.id !== actionId)
        } : r));
    };

    return (
        <div className="w-64 bg-neutral-900 border-l border-neutral-700 flex flex-col shrink-0">
            <div className="flex border-b border-neutral-700 bg-neutral-800 shrink-0">
                <button
                    className={`flex-1 py-3 text-sm font-semibold transition-colors ${inspectorTab === 'keyframes' ? 'text-indigo-400 border-b-2 border-indigo-500' : 'text-neutral-400 hover:text-neutral-300'}`}
                    onClick={() => setInspectorTab('keyframes')}
                >
                    Keyframes
                </button>
                <button
                    className={`flex-1 py-3 text-sm font-semibold transition-colors ${inspectorTab === 'settings' ? 'text-indigo-400 border-b-2 border-indigo-500' : 'text-neutral-400 hover:text-neutral-300'}`}
                    onClick={() => setInspectorTab('settings')}
                >
                    Settings
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {selectedRow ? (
                    <div className="space-y-4">
                        <div className="flex border-b border-neutral-800 mb-4 pb-2 items-center justify-between">
                            <div className="text-sm font-semibold text-indigo-400 truncate">
                                {selectedRow.name || selectedRow.id}
                            </div>
                            {selectedRow.characterId && (
                                <button
                                    onClick={() => toggleCharacterEditMode(selectedRowId)}
                                    className="p-1 px-2 text-xs bg-indigo-600 hover:bg-indigo-500 rounded text-white flex items-center gap-1 transition"
                                >
                                    <Edit className="w-3 h-3" /> Edit Character
                                </button>
                            )}
                        </div>

                        {inspectorTab === 'keyframes' && (
                            <div className="space-y-3">
                                <div className="flex flex-col gap-1 mb-2">
                                    <label className="text-xs text-neutral-400">Tween Auto Easing</label>
                                    <select
                                        value={currentEasing}
                                        onChange={(e) => handlePropertyChange('easing', e.target.value as EasingType)}
                                        className="w-full bg-neutral-800 border border-neutral-700 rounded p-1.5 text-sm outline-none focus:border-indigo-500 text-neutral-200"
                                    >
                                        <option value="linear">Linear (Constant Speed)</option>
                                        <option value="easeIn">Ease In (Accelerate)</option>
                                        <option value="easeOut">Ease Out (Decelerate)</option>
                                        <option value="easeInOut">Ease In & Out (Smooth)</option>
                                    </select>
                                </div>
                                <PropertyInput
                                    label="X Position (0-1920)"
                                    value={Math.round(selectedInterpX)}
                                    onChange={val => handlePropertyChange('x', val)}
                                    hasKeyframe={selectedRow.transform.x.some(k => Math.abs(k.time - cursorTime) < 0.05)}
                                    onToggleKeyframe={() => handleToggleKeyframe('x', selectedInterpX)}
                                />
                                <PropertyInput
                                    label="Y Position (0-1080)"
                                    value={Math.round(selectedInterpY)}
                                    onChange={val => handlePropertyChange('y', val)}
                                    hasKeyframe={selectedRow.transform.y.some(k => Math.abs(k.time - cursorTime) < 0.05)}
                                    onToggleKeyframe={() => handleToggleKeyframe('y', selectedInterpY)}
                                />
                                <PropertyInput
                                    label="Scale (e.g. 1.0)"
                                    value={parseFloat(selectedInterpScale.toFixed(2))}
                                    step="0.1"
                                    onChange={val => handlePropertyChange('scale', val)}
                                    hasKeyframe={selectedRow.transform.scale.some(k => Math.abs(k.time - cursorTime) < 0.05)}
                                    onToggleKeyframe={() => handleToggleKeyframe('scale', selectedInterpScale)}
                                />
                                <PropertyInput
                                    label="Rotation (°)"
                                    value={Math.round(selectedInterpRotation)}
                                    onChange={val => handlePropertyChange('rotation', val)}
                                    hasKeyframe={selectedRow.transform.rotation.some(k => Math.abs(k.time - cursorTime) < 0.05)}
                                    onToggleKeyframe={() => handleToggleKeyframe('rotation', selectedInterpRotation)}
                                />
                                <PropertyInput
                                    label="Opacity (0-100)"
                                    value={Math.round(selectedInterpOpacity)}
                                    onChange={val => handlePropertyChange('opacity', val)}
                                    hasKeyframe={selectedRow.transform.opacity.some(k => Math.abs(k.time - cursorTime) < 0.05)}
                                    onToggleKeyframe={() => handleToggleKeyframe('opacity', selectedInterpOpacity)}
                                />
                                <PropertyInput
                                    label="Anchor X (Offset)"
                                    value={Math.round(selectedInterpAnchorX)}
                                    onChange={val => handlePropertyChange('anchorX', val)}
                                    hasKeyframe={selectedRow.transform.anchorX.some(k => Math.abs(k.time - cursorTime) < 0.05)}
                                    onToggleKeyframe={() => handleToggleKeyframe('anchorX', selectedInterpAnchorX)}
                                />
                                <PropertyInput
                                    label="Anchor Y (Offset)"
                                    value={Math.round(selectedInterpAnchorY)}
                                    onChange={val => handlePropertyChange('anchorY', val)}
                                    hasKeyframe={selectedRow.transform.anchorY.some(k => Math.abs(k.time - cursorTime) < 0.05)}
                                    onToggleKeyframe={() => handleToggleKeyframe('anchorY', selectedInterpAnchorY)}
                                />
                            </div>
                        )}

                        {inspectorTab === 'settings' && (
                            <div className="space-y-4">
                                <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Layer Tree</h4>
                                {selectedRow.actions.length === 0 ? (
                                    <div className="text-xs text-neutral-500 italic p-3 bg-neutral-800/50 rounded-md">
                                        No layers applied.
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {[...selectedRow.actions].sort((a, b) => b.zIndex - a.zIndex).map(action => {
                                            const isHidden = action.hidden;
                                            const isLocked = action.locked;
                                            const assetName = action.assetHash.split('/').pop() || "Layer";
                                            return (
                                                <div key={action.id} className="flex items-center justify-between p-2 bg-neutral-800 border border-neutral-700 rounded text-sm hover:border-neutral-500 transition-colors">
                                                    <span className={`truncate mr-2 ${isHidden ? 'text-neutral-500 line-through' : 'text-neutral-200'} ${isLocked ? 'opacity-50' : ''}`} title={action.assetHash}>
                                                        Z:{action.zIndex} - {assetName}
                                                    </span>
                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            onClick={() => toggleLayerLock(selectedRow.id, action.id)}
                                                            className="p-1 hover:bg-neutral-700 rounded text-neutral-400 hover:text-indigo-400 transition-colors"
                                                            title={isLocked ? "Unlock Layer" : "Lock Layer"}
                                                        >
                                                            {isLocked ? <Lock className="w-4 h-4 text-indigo-400" /> : <Unlock className="w-4 h-4" />}
                                                        </button>
                                                        <button
                                                            onClick={() => toggleLayerVisibility(selectedRow.id, action.id)}
                                                            className="p-1 hover:bg-neutral-700 rounded text-neutral-400 hover:text-neutral-200 transition-colors"
                                                            title={isHidden ? "Show Layer" : "Hide Layer"}
                                                        >
                                                            {isHidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                                        </button>
                                                        <button
                                                            onClick={() => deleteLayer(selectedRow.id, action.id)}
                                                            className="p-1 hover:bg-red-900/50 rounded text-neutral-400 hover:text-red-400 transition-colors"
                                                            title="Delete Layer"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}

                        {inspectorTab === 'keyframes' && (
                            <div className="bg-indigo-900/20 text-indigo-400 text-xs p-3 rounded mt-4 border border-indigo-500/20">
                                Changing these values will magically create or update a keyframe at the current time: <strong>{cursorTime.toFixed(2)}s</strong>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="text-sm text-neutral-500">Pick a track in the timeline to edit properties.</div>
                )}
            </div>
        </div>
    );
};


// --- Main Studio Component ---
const StudioMode = () => {
    // Selectively bind store slices to prevent `cursorTime` playback from re-rendering the heavy UI
    const characters = useAppStore(state => state.characters);
    const customLibrary = useAppStore(state => state.customLibrary);
    const fetchCustomLibrary = useAppStore(state => state.fetchCustomLibrary);
    const editorData = useAppStore(state => state.editorData);
    const setEditorData = useAppStore(state => state.setEditorData);
    const activeEditTargetId = useAppStore(state => state.activeEditTargetId);

    const editor = useEditor();

    const LOGICAL_WIDTH = 1920;
    const LOGICAL_HEIGHT = 1080;

    useEffect(() => {
        fetchCustomLibrary();
    }, [fetchCustomLibrary]);

    // Player State
    const [isPlaying, setIsPlaying] = useState(false);
    const [selectedRowId, setSelectedRowId] = useState<string>("");
    const [sidebarTab, setSidebarTab] = useState<'characters' | 'library'>('characters');
    const setActiveEditTargetId = useAppStore(s => s.setActiveEditTargetId);
    const cursorTime = useAppStore(s => s.cursorTime);

    useEffect(() => {
        if (activeEditTargetId) {
            setSidebarTab('library'); // Reset sidebar to library
            editor.selection.clearSelection(); // Clear timeline selection
            setSelectedRowId("");
        }
    }, [activeEditTargetId, editor.selection]);

    // Sync OpenCut Timeline selection with our React StudioMode local selection
    useEffect(() => {
        const unsubscribe = editor.selection.subscribe(() => {
            const selected = editor.selection.getSelectedElements();
            if (selected.length > 0) {
                setSelectedRowId(selected[0].trackId);
            }
        });
        return unsubscribe;
    }, [editor.selection]);

    const [isSpacePressed, setIsSpacePressed] = useState(false);
    const isDraggingRef = useRef(false); // To detect if user dragged while holding space

    // Global Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

            if (e.code === 'Space') {
                e.preventDefault();
                if (!e.repeat) {
                    setIsSpacePressed(true);
                    isDraggingRef.current = false;
                }
            }

            if (e.key === 'Delete' || e.key === 'Backspace') {
                const selected = editor.selection.getSelectedElements();
                if (selected.length > 0) {
                    e.preventDefault();
                    // If compound block is selected, user wants to delete the whole character track
                    const isCompound = selected.some(sel => sel.elementId.endsWith('_compound'));
                    if (isCompound) {
                        const trackId = selected[0].trackId;
                        editor.timeline.removeTrack(trackId);
                    } else {
                        editor.timeline.deleteElements(selected);
                    }
                    editor.selection.clearSelection();
                } else if (selectedRowId) {
                    // Fallback: delete the selected track if nothing from timeline is selected
                    e.preventDefault();
                    editor.timeline.removeTrack(selectedRowId);
                    setSelectedRowId("");
                }
            }

            if (e.ctrlKey || e.metaKey) {
                if (e.key === 'z') {
                    if (e.shiftKey) {
                        e.preventDefault();
                        useAppStore.temporal.getState().redo();
                    } else {
                        e.preventDefault();
                        useAppStore.temporal.getState().undo();
                    }
                } else if (e.key === 'y') {
                    e.preventDefault();
                    useAppStore.temporal.getState().redo();
                }
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

            if (e.code === 'Space') {
                e.preventDefault();
                setIsSpacePressed(false);
                // Only toggle play/pause if they didn't pan the canvas while holding space
                if (!isDraggingRef.current) {
                    setIsPlaying(prev => !prev);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [editor, selectedRowId]);

    const [canvasScale, setCanvasScale] = useState(1);
    const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
    const [zoomScale, setZoomScale] = useState(1);
    const [isPanning, setIsPanning] = useState(false);

    const containerRef = useRef<HTMLDivElement>(null);
    const transformerRef = useRef<any>(null);
    const groupRefs = useRef<{ [key: string]: any }>({});
    const assetRefs = useRef<{ [key: string]: any }>({});
    const anchorRefs = useRef<{ [key: string]: any }>({});

    useEffect(() => {
        const updateScale = () => {
            if (containerRef.current) {
                const { width, height } = containerRef.current.getBoundingClientRect();
                const scale = Math.min(width / LOGICAL_WIDTH, height / LOGICAL_HEIGHT) * 0.95;
                setCanvasScale(scale);
            }
        };
        updateScale();
        window.addEventListener('resize', updateScale);
        return () => window.removeEventListener('resize', updateScale);
    }, []);

    // Animation Loop for Playback
    useEffect(() => {
        let animationFrameId: number;
        let lastTime = performance.now();

        const loop = (time: number) => {
            if (isPlaying) {
                const delta = (time - lastTime) / 1000;
                useAppStore.getState().setCursorTime(prev => {
                    const next = prev + delta;
                    return next > 30 ? 0 : next;
                });
            }
            lastTime = time;
            animationFrameId = requestAnimationFrame(loop);
        };

        if (isPlaying) {
            lastTime = performance.now();
            animationFrameId = requestAnimationFrame(loop);
        }
        return () => cancelAnimationFrame(animationFrameId);
    }, [isPlaying]);

    // Setup Active Assets (We map them all down to Konva nodes unconditionally)
    const renderCharacters = editorData
        .filter(row => !activeEditTargetId || row.id === activeEditTargetId)
        .map(row => {
            const sortedAssets = [...row.actions].sort((a, b) => a.zIndex - b.zIndex);
            return {
                ...row,
                sortedAssets
            };
        });

    // Transformer Attachment Effect
    useEffect(() => {
        if (selectedRowId && transformerRef.current && groupRefs.current[selectedRowId]) {
            setTimeout(() => {
                if (transformerRef.current && groupRefs.current[selectedRowId]) {
                    transformerRef.current.nodes([groupRefs.current[selectedRowId]]);
                    transformerRef.current.getLayer()?.batchDraw();
                }
            }, 0);
        } else if (transformerRef.current) {
            transformerRef.current.nodes([]);
            transformerRef.current.getLayer()?.batchDraw();
        }
    }, [selectedRowId, renderCharacters]);

    // Transient State Sync (Performance Boost 60FPS)
    useEffect(() => {
        const syncTransform = (time: number, data: CharacterTrack[]) => {
            data.forEach(char => {
                const node = groupRefs.current[char.id];
                if (node && !node.isDragging() && !transformerRef.current?.isTransforming()) {
                    node.x(getInterpolatedValue(char.transform.x, time, LOGICAL_WIDTH / 2));
                    node.y(getInterpolatedValue(char.transform.y, time, LOGICAL_HEIGHT / 2));
                    node.scaleX(getInterpolatedValue(char.transform.scale, time, 1));
                    node.scaleY(getInterpolatedValue(char.transform.scale, time, 1));
                    node.rotation(getInterpolatedValue(char.transform.rotation, time, 0));
                    node.opacity(getInterpolatedValue(char.transform.opacity, time, 100) / 100);
                    node.offsetX(getInterpolatedValue(char.transform.anchorX, time, 0));
                    node.offsetY(getInterpolatedValue(char.transform.anchorY, time, 0));
                }

                char.actions.forEach(action => {
                    const assetNode = assetRefs.current[action.id];
                    if (assetNode) {
                        const isVisible = !action.hidden && time >= action.start && time <= action.end;
                        assetNode.visible(isVisible);
                    }
                });

                const anchorNode = anchorRefs.current[char.id];
                if (anchorNode && !anchorNode.isDragging()) {
                    anchorNode.x(getInterpolatedValue(char.transform.anchorX, time, 0));
                    anchorNode.y(getInterpolatedValue(char.transform.anchorY, time, 0));
                    // Keep crosshair scale constant inversely proportional to group scale
                    const invertScale = 1 / getInterpolatedValue(char.transform.scale, time, 1);
                    anchorNode.scaleX(invertScale);
                    anchorNode.scaleY(invertScale);
                }
            });
        };

        const unsub = useAppStore.subscribe((state, prev) => {
            if (state.cursorTime !== prev.cursorTime || state.editorData !== prev.editorData) {
                syncTransform(state.cursorTime, state.editorData);
            }
        });

        // Trigger an initial sync
        syncTransform(useAppStore.getState().cursorTime, useAppStore.getState().editorData);

        return unsub;
    }, []);

    const handleAddAsset = (assetHash: string, zIndex: number) => {
        const targetId = activeEditTargetId || selectedRowId;
        if (!targetId) {
            alert("Please select a character track first.");
            return;
        }

        const cursorTime = useAppStore.getState().cursorTime;
        setEditorData(prev => prev.map(row => {
            if (row.id === targetId) {
                return {
                    ...row,
                    actions: [
                        ...row.actions,
                        {
                            id: `action_${Date.now()}_${Math.random()}`,
                            start: cursorTime,
                            end: cursorTime + 5,
                            assetHash,
                            zIndex
                        }
                    ]
                };
            }
            return row;
        }));
    };

    const handleRemoveAsset = (assetHash: string) => {
        const targetId = activeEditTargetId || selectedRowId;
        if (!targetId) return;
        const cursorTime = useAppStore.getState().cursorTime;
        setEditorData(prev => prev.map(row => {
            if (row.id === targetId) {
                return {
                    ...row,
                    actions: row.actions.filter(a => !(a.assetHash === assetHash && cursorTime >= a.start && cursorTime <= a.end))
                }
            }
            return row;
        }));
    };

    const handleAddCharacter = (char: any) => {
        const newId = `char_${Date.now()}`;
        const defaultActions: ActionBlock[] = [];
        let zOffset = 0;
        const cursorTime = useAppStore.getState().cursorTime;

        if (char.layer_groups) {
            Object.entries(char.layer_groups).forEach(([_, assets]: [string, any]) => {
                if (assets && assets.length > 0) {
                    defaultActions.push({
                        id: `action_${Date.now()}_${Math.random()}`,
                        start: cursorTime,
                        end: cursorTime + 10,
                        assetHash: assets[0].hash || assets[0].path || "",
                        zIndex: zOffset++
                    });
                }
            });
        }

        setEditorData(prev => [
            ...prev,
            {
                id: newId,
                name: char.name,
                characterId: char.id,
                transform: {
                    x: [{ time: cursorTime, value: LOGICAL_WIDTH / 2, easing: 'linear' }],
                    y: [{ time: cursorTime, value: LOGICAL_HEIGHT / 2, easing: 'linear' }],
                    scale: [{ time: cursorTime, value: 1, easing: 'linear' }],
                    rotation: [{ time: cursorTime, value: 0, easing: 'linear' }],
                    opacity: [{ time: cursorTime, value: 100, easing: 'linear' }],
                    anchorX: [{ time: cursorTime, value: 0, easing: 'linear' }],
                    anchorY: [{ time: cursorTime, value: 0, easing: 'linear' }]
                },
                actions: defaultActions
            }
        ]);
        setSelectedRowId(newId);

        if (defaultActions.length > 0) {
            editor.selection.setSelectedElements({ elements: [{ trackId: newId, elementId: defaultActions[0].id }] });
        }

        setSidebarTab('library');
    };

    const handleTransformEnd = (charId: string, node: any) => {
        const cursorTime = useAppStore.getState().cursorTime;
        setEditorData(prev => prev.map(row => {
            if (row.id !== charId) return row;
            const newTransform = { ...row.transform };

            const updates = [
                { prop: 'x', value: node.x() },
                { prop: 'y', value: node.y() },
                { prop: 'scale', value: node.scaleX() || 1 },
                { prop: 'rotation', value: node.rotation() || 0 }
            ];

            updates.forEach(({ prop, value }) => {
                const keys = [...newTransform[prop as keyof typeof newTransform]];
                const existingIdx = keys.findIndex(k => Math.abs(k.time - cursorTime) < 0.05);
                if (existingIdx >= 0) {
                    keys[existingIdx] = { ...keys[existingIdx], value };
                } else {
                    keys.push({ time: cursorTime, value, easing: 'linear' });
                }
                keys.sort((a, b) => a.time - b.time);
                newTransform[prop as keyof typeof newTransform] = keys;
            });

            return { ...row, transform: newTransform };
        }));
    };

    const transientHandlePropertyChange = (property: 'x' | 'y' | 'scale' | 'rotation' | 'opacity' | 'anchorX' | 'anchorY', value: number) => {
        if (!selectedRowId) return;
        const cursorTime = useAppStore.getState().cursorTime;
        // Optimization: during continuous drag, this invokes Zustand update. 
        // We might want to throttle this or only resolve onDragEnd if it gets heavy,
        // but it's handled via DragEnd/TransformEnd already! So this is just a setter.
        setEditorData(prev => prev.map(row => {
            if (row.id !== selectedRowId) return row;
            const newTransform = { ...row.transform };
            const keys = [...newTransform[property as keyof typeof newTransform]];
            const existingIdx = keys.findIndex(k => Math.abs(k.time - cursorTime) < 0.05);

            if (existingIdx >= 0) {
                keys[existingIdx] = { ...keys[existingIdx], value };
            } else {
                keys.push({ time: cursorTime, value, easing: 'linear' });
            }

            keys.sort((a, b) => a.time - b.time);
            newTransform[property as keyof typeof newTransform] = keys;
            return { ...row, transform: newTransform };
        }));
    };

    const sortedCategories = [...customLibrary.categories].sort((a, b) => b.z_index - a.z_index);

    const characterBeingEdited = activeEditTargetId ? editorData.find(r => r.id === activeEditTargetId) : null;
    const baseCharacterForEdit = characterBeingEdited ? characters.find(c => c.id === characterBeingEdited.characterId) : null;

    return (
        <div className="h-full flex flex-col bg-neutral-900 overflow-hidden text-neutral-100">

            {/* Top Half: Sidebar + Canvas + Properties */}
            <div className="flex-1 flex overflow-hidden">

                {/* Left Sidebar: Asset / Character Library */}
                <div className={`transition-all duration-[600ms] cubic-bezier(0.16, 1, 0.3, 1) bg-neutral-900 border-r border-neutral-700 flex flex-col shrink-0 overflow-hidden ${!activeEditTargetId ? 'w-72' : 'flex-[2] min-w-[500px] p-6'}`}>
                    {!activeEditTargetId ? (
                        <>
                            <div className="flex border-b border-neutral-700 bg-neutral-800">
                                <button
                                    className={`flex-1 py-3 text-sm font-semibold transition-colors ${sidebarTab === 'characters' ? 'text-indigo-400 border-b-2 border-indigo-500' : 'text-neutral-400 hover:text-neutral-300'}`}
                                    onClick={() => setSidebarTab('characters')}
                                >
                                    Characters
                                </button>
                                <button
                                    className={`flex-1 py-3 text-sm font-semibold transition-colors ${sidebarTab === 'library' ? 'text-indigo-400 border-b-2 border-indigo-500' : 'text-neutral-400 hover:text-neutral-300'}`}
                                    onClick={() => setSidebarTab('library')}
                                >
                                    Accessories
                                </button>
                            </div>
                            <div className="p-3 bg-neutral-900 border-b border-neutral-800 text-xs text-neutral-500 italic">
                                {sidebarTab === 'characters'
                                    ? "Click a character to spawn a new Timeline Track."
                                    : "Click accessories to attach them to the selected Track."}
                            </div>
                        </>
                    ) : (
                        <div className="flex justify-between items-center mb-6">
                            <button
                                onClick={() => setActiveEditTargetId(null)}
                                className="text-[#a4b0be] hover:text-white flex items-center gap-2 transition-colors font-semibold text-[0.9rem]"
                            >
                                <ChevronLeft className="w-5 h-5" /> Back to Studio
                            </button>
                            <span className="text-[#f5f6fa] font-bold px-3 py-1 bg-[#202438] rounded-md border border-white/5 truncate max-w-[200px]">
                                {characterBeingEdited?.name}
                            </span>
                        </div>
                    )}

                    <div className={`flex-1 overflow-y-auto ${!activeEditTargetId ? 'p-4 space-y-6' : 'pr-2'}`}>
                        {!activeEditTargetId && sidebarTab === 'characters' && (
                            <div className="grid grid-cols-2 gap-3">
                                {characters.map(char => {
                                    let previewUrl = "";
                                    for (const group of Object.values(char.layer_groups)) {
                                        const firstAsset: any = group[0];
                                        if (firstAsset && (firstAsset.hash || firstAsset.path)) {
                                            const identifier = firstAsset.hash || firstAsset.path;
                                            previewUrl = `${STATIC_BASE}/${getAssetPath(characters, identifier)}`;
                                            break;
                                        }
                                    }

                                    return (
                                        <div
                                            key={char.id}
                                            className="bg-neutral-800 border border-neutral-700 rounded-lg overflow-hidden cursor-pointer hover:border-indigo-500 hover:ring-1 hover:ring-indigo-500 transition-all group flex flex-col"
                                            onClick={() => handleAddCharacter(char)}
                                        >
                                            <div className="aspect-square bg-neutral-900 relative p-2 flex items-center justify-center">
                                                {previewUrl ? (
                                                    <img src={previewUrl} className="w-full h-full object-contain" crossOrigin="anonymous" alt={char.name} />
                                                ) : (
                                                    <div className="text-4xl">👤</div>
                                                )}
                                                <div className="absolute inset-0 bg-indigo-500/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                                    <Plus className="w-8 h-8 text-white drop-shadow-md" />
                                                </div>
                                            </div>
                                            <div className="p-2 text-xs font-semibold text-center truncate bg-neutral-800 border-t border-neutral-700 text-neutral-300">
                                                {char.name}
                                            </div>
                                        </div>
                                    )
                                })}
                                {characters.length === 0 && <div className="col-span-2 text-sm text-neutral-500 text-center mt-10">No Base Characters found.</div>}
                            </div>
                        )}

                        {!activeEditTargetId && sidebarTab === 'library' && sortedCategories.map(cat => (
                            <div key={cat.id}>
                                <div className="text-xs uppercase tracking-wider text-neutral-500 mb-2 font-semibold flex items-center gap-2">
                                    <span className="w-3 h-3 rounded-full bg-neutral-700 inline-block"></span> {cat.name} (Z: {cat.z_index})
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                    {cat.subfolders.flatMap(sub => sub.assets).map(asset => (
                                        <div
                                            key={asset.hash}
                                            className="aspect-square bg-neutral-800 border border-neutral-700 rounded overflow-hidden cursor-pointer hover:border-indigo-500 transition-colors group relative"
                                            onClick={() => handleAddAsset(asset.hash, cat.z_index)}
                                            title={asset.name}
                                            draggable
                                            onDragStart={(e) => {
                                                setDragData({
                                                    dataTransfer: e.dataTransfer,
                                                    data: {
                                                        id: asset.hash,
                                                        name: asset.name || "Asset",
                                                        type: "media",
                                                        mediaType: "image",
                                                        customZIndex: cat.z_index
                                                    }
                                                });
                                            }}
                                        >
                                            <img
                                                src={`${STATIC_BASE}/${getAssetPath(characters, asset.hash)}`}
                                                crossOrigin="anonymous"
                                                className="w-full h-full object-cover p-1"
                                                alt={asset.name}
                                            />
                                            <div className="absolute inset-0 bg-indigo-500/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                                <Plus className="w-5 h-5 text-white drop-shadow" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                {cat.subfolders.flatMap(s => s.assets).length === 0 && <span className="text-xs text-neutral-600 block pl-5 py-2">Empty folder</span>}
                            </div>
                        ))}

                        {/* Character Edit Mode Accessories */}
                        {activeEditTargetId && baseCharacterForEdit && (
                            <div className="flex flex-wrap gap-5 mb-5 w-full">
                                {Object.entries(baseCharacterForEdit.layer_groups).map(([groupName, assets]: [string, any]) => {
                                    if (!assets || assets.length === 0) return null;
                                    const groupZIndex = baseCharacterForEdit.group_order.length - baseCharacterForEdit.group_order.findIndex((g: string) => g === groupName);

                                    return (
                                        <div key={groupName} className="flex-1 min-w-[200px] flex flex-col gap-2">
                                            <div className="block mb-[0.2rem]">
                                                <label className="block text-[0.85rem] font-semibold text-[#a4b0be]">
                                                    {groupName} <span className="float-right bg-[#6c5ce7] px-1.5 py-0.5 rounded text-[0.7rem] ml-1 text-white opacity-50">Z: {groupZIndex}</span>
                                                </label>
                                            </div>
                                            <div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-1.5 w-full">
                                                {assets.map((asset: any) => {
                                                    const identifier = asset.hash || asset.path;
                                                    if (!identifier) return null;

                                                    const isActive = characterBeingEdited?.actions.some(a => a.assetHash === identifier && cursorTime >= a.start && cursorTime <= a.end && !a.hidden);

                                                    return (
                                                        <div
                                                            key={identifier}
                                                            className={`relative w-[80px] h-[80px] rounded-md bg-black/40 border-[2px] transition-all group p-[2px] hover:-translate-y-0.5 hover:shadow-[0_4px_8px_rgba(0,0,0,0.3)] cursor-pointer overflow-hidden ${isActive
                                                                ? 'border-[#00b894] shadow-[0_0_15px_rgba(0,184,148,0.5),inset_0_0_10px_rgba(0,184,148,0.3)]'
                                                                : 'border-transparent hover:border-[#5b4bc4]'
                                                                }`}
                                                            onClick={() => {
                                                                if (isActive) {
                                                                    handleRemoveAsset(identifier);
                                                                } else {
                                                                    handleAddAsset(identifier, groupZIndex >= 0 ? groupZIndex : 0);
                                                                }
                                                            }}
                                                            title={asset.name || identifier}
                                                            draggable
                                                            onDragStart={(e) => {
                                                                setDragData({
                                                                    dataTransfer: e.dataTransfer,
                                                                    data: {
                                                                        id: identifier,
                                                                        name: asset.name || identifier,
                                                                        type: "media",
                                                                        mediaType: "image",
                                                                        customZIndex: groupZIndex >= 0 ? groupZIndex : 0
                                                                    }
                                                                });
                                                            }}
                                                        >
                                                            <img
                                                                src={`${STATIC_BASE}/${getAssetPath(characters, identifier)}`}
                                                                crossOrigin="anonymous"
                                                                className="w-full h-full object-contain"
                                                            />
                                                            <div className="absolute inset-0 bg-indigo-500/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                                                <Plus className="w-5 h-5 text-white drop-shadow" />
                                                            </div>
                                                            {isActive && (
                                                                <div className="absolute top-1 left-1 bg-[#00b894] text-white text-[9px] font-bold px-1 py-0.5 rounded-sm shadow-sm opacity-90 backdrop-blur-sm pointer-events-none">
                                                                    IN USE
                                                                </div>
                                                            )}
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* Center: 16:9 Canvas Workarea */}
                {/* Center: 16:9 Canvas Workarea */}
                <div className={`transition-all duration-[600ms] cubic-bezier(0.16, 1, 0.3, 1) bg-neutral-950 flex flex-col relative overflow-hidden ${!activeEditTargetId ? 'flex-1' : 'w-1/3 min-w-[300px] shrink-0 p-8 pt-0'}`}>
                    {(!activeEditTargetId) && (
                        <div className="h-12 border-b border-neutral-800 bg-neutral-900 flex items-center px-4 justify-between">
                            <div className="flex gap-2">
                                <button className="p-1.5 bg-neutral-800 rounded hover:bg-neutral-700 text-indigo-400"><MousePointer2 className="w-4 h-4" /></button>
                                <button
                                    onClick={() => {
                                        setZoomScale(1);
                                        setStagePos({ x: 0, y: 0 });
                                    }}
                                    className="p-1.5 bg-neutral-800 rounded hover:bg-neutral-700 text-neutral-400 text-xs font-semibold px-3"
                                >
                                    Reset View
                                </button>
                            </div>
                            <div className="text-sm text-neutral-400 font-mono">
                                Logical: 1920x1080 | Zoom: {(zoomScale * 100).toFixed(0)}%
                            </div>
                        </div>
                    )}

                    <div ref={containerRef} className="flex-1 flex items-center justify-center p-4">
                        {!activeEditTargetId ? (
                            <div
                                className="relative overflow-hidden bg-black shadow-2xl ring-1 ring-neutral-800"
                                style={{
                                    width: LOGICAL_WIDTH * canvasScale,
                                    height: LOGICAL_HEIGHT * canvasScale,
                                    cursor: isSpacePressed ? (isPanning ? 'grabbing' : 'grab') : 'default'
                                }}
                            >
                                <Stage
                                    width={LOGICAL_WIDTH * canvasScale}
                                    height={LOGICAL_HEIGHT * canvasScale}
                                    onWheel={(e: any) => {
                                        e.evt.preventDefault();
                                        const scaleBy = 1.05;
                                        const stage = e.target.getStage();
                                        if (!stage) return;

                                        const oldScale = zoomScale;
                                        const pointer = stage.getPointerPosition();
                                        if (!pointer) return;

                                        const mousePointTo = {
                                            x: (pointer.x - stagePos.x) / (canvasScale * oldScale),
                                            y: (pointer.y - stagePos.y) / (canvasScale * oldScale),
                                        };

                                        const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
                                        setZoomScale(newScale);

                                        setStagePos({
                                            x: pointer.x - mousePointTo.x * (canvasScale * newScale),
                                            y: pointer.y - mousePointTo.y * (canvasScale * newScale),
                                        });
                                    }}
                                    onPointerDown={(e: any) => {
                                        if (e.evt.button === 1 || e.evt.button === 2 || e.evt.altKey || isSpacePressed) {
                                            setIsPanning(true);
                                            if (isSpacePressed) isDraggingRef.current = true;
                                        } else if (e.target === e.target.getStage() || e.target.name() === 'background-rect') {
                                            setSelectedRowId("");
                                            if (editor.selection.clearSelection) {
                                                editor.selection.clearSelection();
                                            }
                                        }
                                    }}
                                    onPointerMove={(e: any) => {
                                        if (isPanning) {
                                            setStagePos(prev => ({
                                                x: prev.x + e.evt.movementX,
                                                y: prev.y + e.evt.movementY
                                            }));
                                        }
                                    }}
                                    onPointerUp={() => setIsPanning(false)}
                                    onMouseLeave={() => setIsPanning(false)}
                                >
                                    <Layer
                                        x={stagePos.x}
                                        y={stagePos.y}
                                        scaleX={canvasScale * zoomScale}
                                        scaleY={canvasScale * zoomScale}
                                    >
                                        {!activeEditTargetId && <Rect name="background-rect" width={LOGICAL_WIDTH} height={LOGICAL_HEIGHT} fill="#111" />}

                                        {!activeEditTargetId && editorData.length === 0 && (
                                            <Text
                                                text="👈 Click a Character on the left to start animating"
                                                fontSize={32}
                                                fontFamily="sans-serif"
                                                fill="#555"
                                                width={LOGICAL_WIDTH}
                                                align="center"
                                                y={LOGICAL_HEIGHT / 2 - 16}
                                            />
                                        )}

                                        {(!activeEditTargetId ? renderCharacters : (characterBeingEdited ? [{ ...characterBeingEdited, sortedAssets: [...characterBeingEdited.actions].sort((a, b) => a.zIndex - b.zIndex) }] : [])).map(char => (
                                            <Group
                                                key={char.id}
                                                ref={(node) => { if (node) groupRefs.current[char.id] = node; }}
                                                name="character-group"
                                                draggable={true}
                                                onClick={(e) => {
                                                    e.cancelBubble = true;
                                                    setSelectedRowId(char.id);
                                                    if (char.sortedAssets.length > 0) {
                                                        editor.selection.setSelectedElements({ elements: [{ trackId: char.id, elementId: char.sortedAssets[0].id }] });
                                                    }
                                                }}
                                                onTap={(e) => {
                                                    e.cancelBubble = true;
                                                    setSelectedRowId(char.id);
                                                    if (char.sortedAssets.length > 0) {
                                                        editor.selection.setSelectedElements({ elements: [{ trackId: char.id, elementId: char.sortedAssets[0].id }] });
                                                    }
                                                }}
                                                onDragStart={() => {
                                                    setSelectedRowId(char.id);
                                                    if (char.sortedAssets.length > 0) {
                                                        editor.selection.setSelectedElements({ elements: [{ trackId: char.id, elementId: char.sortedAssets[0].id }] });
                                                    }
                                                }}
                                                onDragEnd={(e) => {
                                                    handleTransformEnd(char.id, e.target);
                                                }}
                                                onTransformEnd={(e) => {
                                                    handleTransformEnd(char.id, e.target);
                                                }}
                                            >
                                                {char.sortedAssets.map(asset => (
                                                    <CanvasAsset
                                                        key={asset.id}
                                                        ref={(node) => { if (node) assetRefs.current[asset.id] = node; }}
                                                        assetHash={asset.assetHash}
                                                        zIndex={asset.zIndex}
                                                        locked={asset.locked}
                                                        hidden={asset.hidden}
                                                        onClick={(e) => {
                                                            e.cancelBubble = true;
                                                            setSelectedRowId(char.id);
                                                            editor.selection.setSelectedElements({ elements: [{ trackId: activeEditTargetId ? activeEditTargetId : char.id, elementId: asset.id }] });
                                                        }}
                                                        onTap={(e) => {
                                                            e.cancelBubble = true;
                                                            setSelectedRowId(char.id);
                                                            editor.selection.setSelectedElements({ elements: [{ trackId: activeEditTargetId ? activeEditTargetId : char.id, elementId: asset.id }] });
                                                        }}
                                                    />
                                                ))}

                                                {/* Visual Anchor Crosshair */}
                                                {selectedRowId === char.id && (
                                                    <Group
                                                        ref={(node) => { if (node) anchorRefs.current[char.id] = node; }}
                                                        draggable
                                                        onDragStart={e => e.cancelBubble = true}
                                                        onDragMove={e => e.cancelBubble = true}
                                                        onDragEnd={e => {
                                                            e.cancelBubble = true;
                                                            transientHandlePropertyChange('anchorX', e.target.x());
                                                            transientHandlePropertyChange('anchorY', e.target.y());
                                                        }}
                                                    >
                                                        <Circle radius={12} fill="rgba(255, 0, 85, 0.1)" stroke="#ff0055" strokeWidth={1.5} />
                                                        <Line points={[-16, 0, 16, 0]} stroke="#ff0055" strokeWidth={1.5} />
                                                        <Line points={[0, -16, 0, 16]} stroke="#ff0055" strokeWidth={1.5} />
                                                        <Circle radius={2.5} fill="#ff0055" />
                                                    </Group>
                                                )}
                                            </Group>
                                        ))}

                                        <Transformer
                                            ref={transformerRef}
                                            boundBoxFunc={(oldBox, newBox) => {
                                                if (Math.abs(newBox.width) < 5 || Math.abs(newBox.height) < 5) return oldBox;
                                                return newBox;
                                            }}
                                            padding={10}
                                            borderStroke="#6366f1"
                                            anchorStroke="#6366f1"
                                            anchorFill="#ffffff"
                                            anchorSize={10}
                                            rotateAnchorOffset={30}
                                        />
                                    </Layer>
                                </Stage>
                            </div>
                        ) : (
                            <div className="relative w-full h-full flex items-center justify-center">
                                {characterBeingEdited?.actions
                                    .filter(a => cursorTime >= a.start && cursorTime <= a.end && !a.hidden)
                                    .sort((a, b) => a.zIndex - b.zIndex)
                                    .map(action => {
                                        const url = `${STATIC_BASE}/${getAssetPath(characters, action.assetHash)}`;
                                        return (
                                            <img
                                                key={action.id}
                                                src={url}
                                                className={`absolute w-full h-full object-contain drop-shadow-sm ${action.locked ? 'pointer-events-none' : 'cursor-pointer'}`}
                                                style={{ zIndex: action.zIndex }}
                                                crossOrigin="anonymous"
                                                onClick={(e) => {
                                                    if (!action.locked) {
                                                        e.stopPropagation();
                                                        setSelectedRowId(characterBeingEdited.id);
                                                        editor.selection.setSelectedElements({ elements: [{ trackId: characterBeingEdited.id, elementId: action.id }] });
                                                    }
                                                }}
                                            />
                                        )
                                    })
                                }
                            </div>
                        )}
                    </div>
                </div>

                {!activeEditTargetId && (
                    <PropertiesSidebar selectedRowId={selectedRowId} LOGICAL_WIDTH={LOGICAL_WIDTH} LOGICAL_HEIGHT={LOGICAL_HEIGHT} />
                )}

            </div>

            {/* Bottom Half: Timeline */}
            <div className="h-72 w-full max-w-full bg-neutral-900 border-t border-neutral-700 flex flex-col shrink-0 overflow-hidden">
                <div className="flex items-center px-4 py-2 border-b border-neutral-700 bg-neutral-800 justify-between">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => setIsPlaying(!isPlaying)}
                            className="p-2 bg-indigo-600 hover:bg-indigo-500 rounded-full text-white transition shadow-lg"
                        >
                            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                        </button>
                        <PlayheadTimeDisplay />
                    </div>
                    <div className="flex gap-2"></div>
                </div>

                <div className="flex-1 relative cursor-pointer overflow-hidden w-full">
                    <TimelinePanel />
                </div>
            </div>

        </div >
    );
};

export default StudioMode;
