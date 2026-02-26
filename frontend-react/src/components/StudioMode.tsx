import React, { useState, useEffect, useRef } from 'react';
import { useAppStore, STATIC_BASE, getAssetPath } from '../store/useAppStore';
import { useEditor } from '../hooks/use-editor';
import { setDragData } from '../lib/drag-data';
import type { ActionBlock, TimelineKeyframe, EasingType } from '../store/useAppStore';
import { Timeline as TimelinePanel } from './timeline';
import { Stage, Layer, Image as KonvaImageRect, Rect, Group } from 'react-konva';
import { Play, Pause, Plus, MousePointer2 } from 'lucide-react';

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
const PropertyInput = ({ label, value, onChange, step = "1" }: { label: string, value: number, onChange: (val: number) => void, step?: string }) => {
    const [localVal, setLocalVal] = useState(value.toString());

    useEffect(() => {
        setLocalVal(value.toString());
    }, [value]);

    const handleCommit = () => {
        const parsed = parseFloat(localVal);
        if (!isNaN(parsed) && parsed !== value) {
            onChange(parsed);
        } else {
            setLocalVal(value.toString()); // Revert on invalid
        }
    };

    return (
        <div className="flex flex-col gap-1">
            <label className="text-xs text-neutral-400">{label}</label>
            <input
                type="number"
                step={step}
                className="w-full bg-neutral-800 border border-neutral-700 rounded p-1.5 text-sm outline-none focus:border-indigo-500"
                value={localVal}
                onChange={e => setLocalVal(e.target.value)}
                onBlur={handleCommit}
                onKeyDown={e => e.key === 'Enter' && handleCommit()}
            />
        </div>
    );
};

// Component to render a Canvas Image
const CanvasAsset = ({ assetHash }: { assetHash: string; zIndex: number }) => {
    const { characters } = useAppStore();
    const url = `${STATIC_BASE}/${getAssetPath(characters, assetHash)}`;
    const image = useKonvaImage(url);

    if (!image) return null;
    // Center by offset so scaling happens from center
    return (
        <KonvaImageRect
            image={image}
            x={0}
            y={0}
            offset={{ x: image.width / 2, y: image.height / 2 }}
            draggable={false}
        />
    );
};

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

            // Raw linear progress [0, 1]
            let progress = (time - k1.time) / tRange;

            // Apply Easing (defaults to linear)
            progress = applyEasing(progress, k1.easing);

            return k1.value + (k2.value - k1.value) * progress;
        }
    }
    return defaultValue;
};


// --- Main Studio Component ---
const StudioMode = () => {
    const { characters, customLibrary, fetchCustomLibrary, editorData, setEditorData, cursorTime, setCursorTime } = useAppStore();
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

    // Sync OpenCut Timeline selection with our React StudioMode local selection
    useEffect(() => {
        const unsubscribe = editor.selection.subscribe(() => {
            const selected = editor.selection.getSelectedElements();
            if (selected.length > 0) {
                // E.g., { trackId: "char_123", elementId: "action_abc" }
                // For properties panel, we need to know the active Character Track
                setSelectedRowId(selected[0].trackId);
            }
        });
        return unsubscribe;
    }, [editor.selection]);

    const [canvasScale, setCanvasScale] = useState(1);
    const containerRef = useRef<HTMLDivElement>(null);

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
                setCursorTime(prev => {
                    const next = prev + delta;
                    return next > 30 ? 0 : next; // Loop at 30 seconds for now
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

    // Handlers
    const handleAddAsset = (assetHash: string, zIndex: number) => {
        if (!selectedRowId) {
            alert("Please select a character track first.");
            return;
        }

        setEditorData(prev => prev.map(row => {
            if (row.id === selectedRowId) {
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

    const handlePropertyChange = (property: 'x' | 'y' | 'scale' | 'rotation' | 'opacity' | 'easing', value: number | EasingType) => {
        setEditorData(prev => prev.map(row => {
            if (row.id !== selectedRowId) return row;

            const newTransform = { ...row.transform };
            const keys = property === 'easing' ? [...newTransform.x] : [...newTransform[property as keyof typeof newTransform]];

            // We handle easing globally per keyframe in all properties for simplicity, 
            // but in a real app, users might want independent easing per channel (x/y/scale).
            if (property === 'easing') {
                const existingIdx = keys.findIndex(k => Math.abs(k.time - cursorTime) < 0.05);
                if (existingIdx >= 0) {
                    // Apply easing to all transform channels at this time
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

            newTransform[property as keyof typeof newTransform] = keys;
            return { ...row, transform: newTransform };
        }));
    };

    const handleAddCharacter = (char: any) => {
        const newId = `char_${Date.now()}`;

        const defaultActions: ActionBlock[] = [];
        let zOffset = 0;

        if (char.layer_groups) {
            Object.entries(char.layer_groups).forEach(([_, assets]: [string, any]) => {
                if (assets && assets.length > 0) {
                    defaultActions.push({
                        id: `action_${Date.now()}_${Math.random()}`,
                        start: cursorTime,
                        end: cursorTime + 10, // Default 10 seconds lifespan
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
                    opacity: [{ time: cursorTime, value: 100, easing: 'linear' }]
                },
                actions: defaultActions
            }
        ]);
        setSelectedRowId(newId);

        // Push selection down to the OpenCut timeline engine
        if (defaultActions.length > 0) {
            editor.selection.setSelectedElements({ elements: [{ trackId: newId, elementId: defaultActions[0].id }] });
        }

        setSidebarTab('library'); // Switch to library to add parts to this new track
    };


    // Setup Active Assets
    const activeCharacters = editorData.map(row => {
        const interpX = getInterpolatedValue(row.transform.x, cursorTime, LOGICAL_WIDTH / 2);
        const interpY = getInterpolatedValue(row.transform.y, cursorTime, LOGICAL_HEIGHT / 2);
        const interpScale = getInterpolatedValue(row.transform.scale, cursorTime, 1);
        const interpRotation = getInterpolatedValue(row.transform.rotation, cursorTime, 0);
        const interpOpacity = getInterpolatedValue(row.transform.opacity, cursorTime, 100);

        // Sort rendering order of sub-assets by Z index 
        const activeAssets = row.actions
            .filter(action => cursorTime >= action.start && cursorTime <= action.end)
            .sort((a, b) => a.zIndex - b.zIndex);

        return {
            ...row,
            interpX,
            interpY,
            interpScale,
            interpRotation,
            interpOpacity,
            activeAssets
        };
    });

    const sortedCategories = [...customLibrary.categories].sort((a, b) => b.z_index - a.z_index);

    const selectedRow = editorData.find(r => r.id === selectedRowId);
    const selectedInterpX = selectedRow ? getInterpolatedValue(selectedRow.transform.x, cursorTime, LOGICAL_WIDTH / 2) : 0;
    const selectedInterpY = selectedRow ? getInterpolatedValue(selectedRow.transform.y, cursorTime, LOGICAL_HEIGHT / 2) : 0;
    const selectedInterpScale = selectedRow ? getInterpolatedValue(selectedRow.transform.scale, cursorTime, 1) : 1;
    const selectedInterpRotation = selectedRow ? getInterpolatedValue(selectedRow.transform.rotation, cursorTime, 0) : 0;
    const selectedInterpOpacity = selectedRow ? getInterpolatedValue(selectedRow.transform.opacity, cursorTime, 100) : 100;

    // Resolve current keyframe easing type from the 'x' channel as root indicator
    let currentEasing: EasingType = 'linear';
    if (selectedRow) {
        const keyAtTime = selectedRow.transform.x.find(k => Math.abs(k.time - cursorTime) < 0.05);
        if (keyAtTime?.easing) currentEasing = keyAtTime.easing;
    }

    return (
        <div className="h-full flex flex-col bg-neutral-900 overflow-hidden text-neutral-100">

            {/* Top Half: Sidebar + Canvas + Properties */}
            <div className="flex-1 flex overflow-hidden">

                {/* Left Sidebar: Asset / Character Library */}
                <div className="w-72 bg-neutral-900 border-r border-neutral-700 flex flex-col shrink-0">
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

                    <div className="flex-1 overflow-y-auto p-4 space-y-6">
                        {sidebarTab === 'characters' && (
                            <div className="grid grid-cols-2 gap-3">
                                {characters.map(char => {
                                    // Try to find a preview image from layer_groups
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

                        {sidebarTab === 'library' && sortedCategories.map(cat => (
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
                    </div>
                </div>

                {/* Center: 16:9 Canvas Workarea */}
                <div className="flex-1 bg-neutral-950 flex flex-col relative overflow-hidden">
                    <div className="h-12 border-b border-neutral-800 bg-neutral-900 flex items-center px-4 justify-between">
                        <div className="flex gap-2">
                            <button className="p-1.5 bg-neutral-800 rounded hover:bg-neutral-700 text-indigo-400"><MousePointer2 className="w-4 h-4" /></button>
                        </div>
                        <div className="text-sm text-neutral-400 font-mono">
                            Logical: 1920x1080 | Zoom: {(canvasScale * 100).toFixed(0)}%
                        </div>
                    </div>

                    <div ref={containerRef} className="flex-1 flex items-center justify-center p-4">
                        <div
                            className="bg-black shadow-2xl relative overflow-hidden ring-1 ring-neutral-800"
                            style={{ width: LOGICAL_WIDTH * canvasScale, height: LOGICAL_HEIGHT * canvasScale }}
                        >
                            <Stage width={LOGICAL_WIDTH * canvasScale} height={LOGICAL_HEIGHT * canvasScale}>
                                <Layer scaleX={canvasScale} scaleY={canvasScale}>
                                    {/* Background Guide */}
                                    <Rect width={LOGICAL_WIDTH} height={LOGICAL_HEIGHT} fill="#111" />

                                    {/* Render Each Character Track as a Group */}
                                    {activeCharacters.map(char => (
                                        <Group
                                            key={char.id}
                                            x={char.interpX}
                                            y={char.interpY}
                                            scaleX={char.interpScale}
                                            scaleY={char.interpScale}
                                            rotation={char.interpRotation}
                                            opacity={char.interpOpacity / 100}
                                            draggable={true}
                                            onClick={(e) => {
                                                e.cancelBubble = true;
                                                setSelectedRowId(char.id);
                                                if (char.activeAssets.length > 0) {
                                                    editor.selection.setSelectedElements({ elements: [{ trackId: char.id, elementId: char.activeAssets[0].id }] });
                                                }
                                            }}
                                            onTap={(e) => {
                                                e.cancelBubble = true;
                                                setSelectedRowId(char.id);
                                                if (char.activeAssets.length > 0) {
                                                    editor.selection.setSelectedElements({ elements: [{ trackId: char.id, elementId: char.activeAssets[0].id }] });
                                                }
                                            }}
                                            onDragStart={() => {
                                                // Auto-select track on drag start
                                                setSelectedRowId(char.id);
                                                if (char.activeAssets.length > 0) {
                                                    editor.selection.setSelectedElements({ elements: [{ trackId: char.id, elementId: char.activeAssets[0].id }] });
                                                }
                                            }}
                                            onDragEnd={(e) => {
                                                // After dropping the asset anywhere on stage, automatically pipe its visual X/Y coordinates
                                                // to the interpolation engine to mutate or spawn new keyframes at the current `cursorTime`.
                                                handlePropertyChange('x', e.target.x());
                                                handlePropertyChange('y', e.target.y());
                                            }}
                                        >
                                            {char.activeAssets.map(asset => (
                                                <CanvasAsset key={asset.id} assetHash={asset.assetHash} zIndex={asset.zIndex} />
                                            ))}
                                        </Group>
                                    ))}
                                </Layer>
                            </Stage>
                        </div>
                    </div>
                </div>

                {/* Right Sidebar: Properties */}
                <div className="w-64 bg-neutral-900 border-l border-neutral-700 flex flex-col shrink-0">
                    <div className="p-4 border-b border-neutral-700 bg-neutral-800">
                        <h3 className="font-semibold text-lg">Properties</h3>
                    </div>

                    <div className="p-4 space-y-6">
                        {selectedRow ? (
                            <div className="space-y-4">
                                <div className="text-sm font-semibold text-indigo-400 truncate mb-4 border-b border-neutral-800 pb-2">
                                    {selectedRow.name || selectedRow.id}
                                </div>

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
                                    />
                                    <PropertyInput
                                        label="Y Position (0-1080)"
                                        value={Math.round(selectedInterpY)}
                                        onChange={val => handlePropertyChange('y', val)}
                                    />
                                    <PropertyInput
                                        label="Scale (e.g. 1.0)"
                                        value={parseFloat(selectedInterpScale.toFixed(2))}
                                        step="0.1"
                                        onChange={val => handlePropertyChange('scale', val)}
                                    />
                                    <PropertyInput
                                        label="Rotation (°)"
                                        value={Math.round(selectedInterpRotation)}
                                        onChange={val => handlePropertyChange('rotation', val)}
                                    />
                                    <PropertyInput
                                        label="Opacity (0-100)"
                                        value={Math.round(selectedInterpOpacity)}
                                        onChange={val => handlePropertyChange('opacity', val)}
                                    />
                                </div>

                                <div className="bg-indigo-900/20 text-indigo-400 text-xs p-3 rounded mt-4 border border-indigo-500/20">
                                    Changing these values will magically create or update a keyframe at the current time: <strong>{cursorTime.toFixed(2)}s</strong>
                                </div>

                                <div className="mt-4 border-t border-neutral-800 pt-4">
                                    <h4 className="text-xs font-semibold uppercase text-neutral-500 mb-2">Keykeyframes</h4>
                                    <div className="text-xs space-y-1 font-mono text-neutral-400 grid grid-cols-2">
                                        <div>X: {selectedRow.transform.x.length} keys</div>
                                        <div>Y: {selectedRow.transform.y.length} keys</div>
                                        <div>Scale: {selectedRow.transform.scale.length} keys</div>
                                        <div>Rot: {selectedRow.transform.rotation.length} keys</div>
                                        <div>Opac: {selectedRow.transform.opacity.length} keys</div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="text-sm text-neutral-500">Pick a track in the timeline to edit properties.</div>
                        )}
                    </div>
                </div>

            </div>

            {/* Bottom Half: Timeline */}
            <div className="h-72 bg-neutral-900 border-t border-neutral-700 flex flex-col shrink-0">
                <div className="flex items-center px-4 py-2 border-b border-neutral-700 bg-neutral-800 justify-between">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => setIsPlaying(!isPlaying)}
                            className="p-2 bg-indigo-600 hover:bg-indigo-500 rounded-full text-white transition shadow-lg"
                        >
                            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                        </button>
                        <div className="font-mono text-xl text-indigo-400 w-24">
                            {cursorTime.toFixed(2)}s
                        </div>
                    </div>
                    <div className="flex gap-2">
                        {/* Track addition is now handled via Sidebar Characters tab */}
                    </div>
                </div>

                <div className="flex-1 relative cursor-pointer" onClick={() => {
                    // Simplistic specific track selection logic could go here based on DOM traversal if needed,
                    // but react-timeline-editor typically handles it or we click properties directly.
                    // For now, if there's only 1 track, we leave it selected.
                }}>
                    <TimelinePanel />
                </div>
            </div>

        </div >
    );
};

export default StudioMode;
