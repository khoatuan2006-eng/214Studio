import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useWorkflowStore, type CharacterNodeData, type CharacterV2NodeData, type StageNodeData, type StageLayer, type CameraNodeData, type CameraKeyframe, type SceneNodeData, type MapNodeData } from '@/stores/useWorkflowStore';
import { useAppStore, STATIC_BASE } from '@/stores/useAppStore';
import { useCharacterV2Store } from '@/stores/useCharacterV2Store';
import { API_BASE_URL } from '@/config/api';
import { X, User, Film, Trash2, Upload, MapPin, Sparkles, Clapperboard, Plus, Eye, EyeOff, ChevronDown, ChevronRight, ArrowUp, ArrowDown, Maximize2, Video } from 'lucide-react';
import StageCanvas from './StageCanvas';

const NodeInspector: React.FC = () => {
    const { nodes, selectedNodeId, updateNodeData, removeNode, selectNode } = useWorkflowStore();
    const characters = useAppStore((s) => s.characters);
    const [stageCanvasOpen, setStageCanvasOpen] = useState(false);
    const v2Characters = useCharacterV2Store((s) => s.characters);
    const fetchV2 = useCharacterV2Store((s) => s.fetchCharacters);
    const selectedNode = nodes.find((n) => n.id === selectedNodeId);

    // Fetch V2 characters on mount
    React.useEffect(() => { fetchV2(); }, [fetchV2]);

    if (!selectedNode) {
        return (
            <div className="flex flex-col h-full items-center justify-center p-6 text-center">
                <div className="w-16 h-16 rounded-2xl bg-white/3 flex items-center justify-center mb-3">
                    <Film className="w-8 h-8 text-neutral-600" />
                </div>
                <p className="text-xs text-neutral-500">Select a node to inspect its properties</p>
            </div>
        );
    }

    const nodeType = selectedNode.type as string;
    const data = selectedNode.data as Record<string, any>;

    // Get PPU from scene node (project-level setting)
    const sceneNode = nodes.find(n => n.type === 'scene');
    const ppu = (sceneNode?.data as SceneNodeData)?.pixelsPerUnit || 100;

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    {nodeType === 'character' && <User className="w-4 h-4 text-indigo-400" />}
                    {nodeType === 'characterV2' && <Sparkles className="w-4 h-4 text-emerald-400" />}
                    {nodeType === 'stage' && <Clapperboard className="w-4 h-4 text-amber-400" />}
                    {nodeType === 'camera' && <Video className="w-4 h-4 text-sky-400" />}
                    {nodeType === 'scene' && <Film className="w-4 h-4 text-amber-400" />}
                    {nodeType === 'map' && <MapPin className="w-4 h-4 text-green-400" />}
                    <span className="text-xs font-bold text-white/90 capitalize">{nodeType === 'characterV2' ? 'Character V2' : nodeType} Properties</span>
                </div>
                <button onClick={() => selectNode(null)} className="p-1 hover:bg-white/5 rounded">
                    <X className="w-3.5 h-3.5 text-neutral-500" />
                </button>
            </div>

            {/* Properties */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Label */}
                <FieldGroup label="Label">
                    <input
                        type="text"
                        value={data.label || ''}
                        onChange={(e) => updateNodeData(selectedNode.id, { label: e.target.value })}
                        className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-indigo-500/50 transition-colors"
                    />
                </FieldGroup>

                {/* CHARACTER-SPECIFIC */}
                {nodeType === 'character' && (
                    <>
                        <FieldGroup label="Character">
                            <select
                                value={(data as CharacterNodeData).characterId || ''}
                                onChange={(e) => {
                                    const char = characters.find((c) => c.id === e.target.value);
                                    updateNodeData(selectedNode.id, {
                                        characterId: e.target.value,
                                        characterName: char?.name?.split('_')[0] || '',
                                        label: char?.name?.split('_')[0] || 'Character',
                                    });
                                }}
                                className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-indigo-500/50"
                            >
                                <option value="">— Select Character —</option>
                                {characters.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.name.split('_')[0]}
                                    </option>
                                ))}
                            </select>
                        </FieldGroup>

                        {/* Character Preview */}
                        {(data as CharacterNodeData).characterId && (() => {
                            const char = characters.find(c => c.id === (data as CharacterNodeData).characterId);
                            if (!char) return null;
                            const firstGroup = Object.values(char.layer_groups)[0];
                            const firstAsset = firstGroup?.[0];
                            const imgUrl = firstAsset?.path ? `${STATIC_BASE}/${firstAsset.path}` : '';
                            return (
                                <div className="w-full aspect-square bg-black/30 rounded-lg overflow-hidden border border-white/5 flex items-center justify-center">
                                    {imgUrl ? (
                                        <img src={imgUrl} className="w-full h-full object-contain p-2" alt={char.name} loading="lazy" />
                                    ) : (
                                        <User className="w-10 h-10 text-neutral-600" />
                                    )}
                                </div>
                            );
                        })()}

                        <FieldGroup label="Position X (units)">
                            <NumberInput
                                value={+((data as CharacterNodeData).posX / ppu).toFixed(2)}
                                onChange={(v) => updateNodeData(selectedNode.id, { posX: Math.round(v * ppu) })}
                                step={0.1}
                            />
                        </FieldGroup>
                        <FieldGroup label="Position Y (units)">
                            <NumberInput
                                value={+((data as CharacterNodeData).posY / ppu).toFixed(2)}
                                onChange={(v) => updateNodeData(selectedNode.id, { posY: Math.round(v * ppu) })}
                                step={0.1}
                            />
                        </FieldGroup>
                        <FieldGroup label="Z-Index">
                            <NumberInput
                                value={(data as CharacterNodeData).zIndex}
                                onChange={(v) => updateNodeData(selectedNode.id, { zIndex: v })}
                                min={0}
                                max={100}
                            />
                        </FieldGroup>
                        <FieldGroup label="Height (units)">
                            <NumberInput
                                value={+((data as CharacterNodeData).scale / ppu).toFixed(2)}
                                onChange={(v) => updateNodeData(selectedNode.id, { scale: Math.round(v * ppu) })}
                                step={0.1}
                                min={+(100 / ppu).toFixed(2)}
                                max={+(1080 / ppu).toFixed(2)}
                            />
                        </FieldGroup>
                        <FieldGroup label="Opacity">
                            <NumberInput
                                value={(data as CharacterNodeData).opacity}
                                onChange={(v) => updateNodeData(selectedNode.id, { opacity: v })}
                                step={0.1}
                                min={0}
                                max={1}
                            />
                        </FieldGroup>
                    </>
                )}

                {/* CHARACTER V2 SPECIFIC */}
                {nodeType === 'characterV2' && (
                    <>
                        <FieldGroup label="V2 Character">
                            <select
                                value={(data as CharacterV2NodeData).characterId || ''}
                                onChange={(e) => {
                                    const char = v2Characters.find((c) => c.id === e.target.value);
                                    updateNodeData(selectedNode.id, {
                                        characterId: e.target.value,
                                        characterName: char?.name || '',
                                        label: char?.name || 'Character V2',
                                    });
                                }}
                                className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-emerald-500/50"
                            >
                                <option value="">— Select V2 Character —</option>
                                {v2Characters.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.name} ({c.psd_type})
                                    </option>
                                ))}
                            </select>
                        </FieldGroup>

                        {(data as CharacterV2NodeData).characterId && (() => {
                            const char = v2Characters.find(c => c.id === (data as CharacterV2NodeData).characterId);
                            if (!char) return null;
                            return (
                                <div className="text-[10px] text-emerald-400/70 bg-emerald-500/5 border border-emerald-500/10 rounded-lg p-2 space-y-0.5">
                                    <div>✨ Body parts: {char.body_parts ? Object.keys(char.body_parts).length : 0}</div>
                                    <div>🎭 Expression: {char.head?.expression_type || 'none'}</div>
                                    {char.viewpoints && <div>👁 Viewpoints: {Object.keys(char.viewpoints).join(', ')}</div>}
                                    <div className="text-neutral-500">Double-click node to edit actions</div>
                                </div>
                            );
                        })()}

                        <FieldGroup label="Position X (units)">
                            <NumberInput value={+((data as CharacterV2NodeData).posX / ppu).toFixed(2)} onChange={(v) => updateNodeData(selectedNode.id, { posX: Math.round(v * ppu) })} step={0.1} />
                        </FieldGroup>
                        <FieldGroup label="Position Y (units)">
                            <NumberInput value={+((data as CharacterV2NodeData).posY / ppu).toFixed(2)} onChange={(v) => updateNodeData(selectedNode.id, { posY: Math.round(v * ppu) })} step={0.1} />
                        </FieldGroup>
                        <FieldGroup label="Z-Index">
                            <NumberInput value={(data as CharacterV2NodeData).zIndex} onChange={(v) => updateNodeData(selectedNode.id, { zIndex: v })} min={0} max={100} />
                        </FieldGroup>
                        <FieldGroup label="Height (units)">
                            <NumberInput value={+((data as CharacterV2NodeData).scale / ppu).toFixed(2)} onChange={(v) => updateNodeData(selectedNode.id, { scale: Math.round(v * ppu) })} step={0.1} min={+(100 / ppu).toFixed(2)} max={+(1080 / ppu).toFixed(2)} />
                        </FieldGroup>
                        <FieldGroup label="Opacity">
                            <NumberInput value={(data as CharacterV2NodeData).opacity} onChange={(v) => updateNodeData(selectedNode.id, { opacity: v })} step={0.1} min={0} max={1} />
                        </FieldGroup>
                    </>
                )}

                {/* STAGE-SPECIFIC */}
                {nodeType === 'stage' && (
                    <>
                        {/* Open Stage Editor button */}
                        <button
                            onClick={() => setStageCanvasOpen(true)}
                            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-bold hover:bg-amber-500/25 transition-all hover:scale-[1.01] active:scale-95"
                        >
                            <Maximize2 className="w-4 h-4" />
                            Open Stage Editor
                        </button>

                        <StageLayerEditor
                            layers={(data as StageNodeData).layers || []}
                            onUpdate={(layers) => updateNodeData(selectedNode.id, { layers })}
                            pixelsPerUnit={ppu}
                        />

                        {/* Stage Canvas Modal */}
                        {stageCanvasOpen && (() => {
                            const sceneNode = nodes.find(n => n.type === 'scene');
                            const ppu = (sceneNode?.data as SceneNodeData)?.pixelsPerUnit || 100;
                            return (
                                <StageCanvas
                                    layers={(data as StageNodeData).layers || []}
                                    onUpdateLayer={(id, patch) => {
                                        const currentLayers = (data as StageNodeData).layers || [];
                                        updateNodeData(selectedNode.id, {
                                            layers: currentLayers.map(l => l.id === id ? { ...l, ...patch } : l)
                                        });
                                    }}
                                    onAddLayer={() => {
                                        const currentLayers = (data as StageNodeData).layers || [];
                                        const maxZ = currentLayers.reduce((max, l) => Math.max(max, l.zIndex), 0);
                                        const newLayer: StageLayer = {
                                            id: `layer-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                                            type: 'prop',
                                            source: 'image',
                                            label: `Layer ${currentLayers.length + 1}`,
                                            assetPath: '',
                                            posX: 960, posY: 540,
                                            zIndex: Math.min(100, maxZ + 10),
                                            width: 960, height: 540, opacity: 1, rotation: 0, blur: 0, visible: true,
                                        };
                                        updateNodeData(selectedNode.id, { layers: [...currentLayers, newLayer] });
                                    }}
                                    onClose={() => setStageCanvasOpen(false)}
                                    pixelsPerUnit={ppu}
                                />
                            );
                        })()}
                    </>
                )}
                {/* CAMERA-SPECIFIC */}
                {nodeType === 'camera' && (() => {
                    const camData = data as CameraNodeData;
                    const kfs = camData.keyframes || [];

                    const addKeyframe = () => {
                        const lastTime = kfs.length > 0 ? kfs[kfs.length - 1].time : 0;
                        const newKf: CameraKeyframe = {
                            id: `kf-${Date.now()}`,
                            time: lastTime + 2,
                            x: kfs.length > 0 ? kfs[kfs.length - 1].x : 960,
                            y: kfs.length > 0 ? kfs[kfs.length - 1].y : 540,
                            zoom: kfs.length > 0 ? kfs[kfs.length - 1].zoom : 1,
                            easing: 'easeInOut',
                        };
                        updateNodeData(selectedNode.id, { keyframes: [...kfs, newKf].sort((a, b) => a.time - b.time) });
                    };

                    const updateKf = (id: string, patch: Partial<CameraKeyframe>) => {
                        const updated = kfs.map(kf => kf.id === id ? { ...kf, ...patch } : kf);
                        updateNodeData(selectedNode.id, { keyframes: updated.sort((a, b) => a.time - b.time) });
                    };

                    const removeKf = (id: string) => {
                        updateNodeData(selectedNode.id, { keyframes: kfs.filter(kf => kf.id !== id) });
                    };

                    return (
                        <>
                            {/* Viewport Size */}
                            <FieldGroup label="Viewport Size">
                                <div className="flex gap-2">
                                    <div className="flex-1">
                                        <label className="text-[9px] text-neutral-500">W</label>
                                        <NumberInput value={camData.viewportWidth} onChange={(v) => updateNodeData(selectedNode.id, { viewportWidth: v })} min={320} max={1920} step={10} />
                                    </div>
                                    <div className="flex-1">
                                        <label className="text-[9px] text-neutral-500">H</label>
                                        <NumberInput value={camData.viewportHeight} onChange={(v) => updateNodeData(selectedNode.id, { viewportHeight: v })} min={240} max={1080} step={10} />
                                    </div>
                                </div>
                            </FieldGroup>

                            {/* FOV (Field of View in units) */}
                            <FieldGroup label="FOV (units width)">
                                <NumberInput
                                    value={(camData as any).fov || 19.2}
                                    onChange={(v) => updateNodeData(selectedNode.id, { fov: v })}
                                    step={0.5}
                                    min={1}
                                    max={100}
                                />
                                <p className="text-[9px] text-neutral-500 mt-0.5 italic">
                                    Camera sees {((camData as any).fov || 19.2).toFixed(1)} units wide
                                </p>
                            </FieldGroup>

                            {/* Keyframes */}
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <label className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Keyframes ({kfs.length})</label>
                                    <button onClick={addKeyframe} className="flex items-center gap-0.5 px-2 py-0.5 rounded bg-sky-500/15 border border-sky-500/30 text-sky-300 text-[10px] font-bold hover:bg-sky-500/25 transition-all">
                                        <Plus className="w-3 h-3" /> Add
                                    </button>
                                </div>
                                <div className="space-y-1 max-h-52 overflow-y-auto">
                                    {kfs.map((kf, i) => (
                                        <div key={kf.id} className="rounded-lg bg-white/3 border border-white/5 p-2 space-y-1.5">
                                            <div className="flex items-center justify-between">
                                                <span className="text-[10px] text-sky-300 font-bold">◇ KF {i + 1}</span>
                                                <button onClick={() => removeKf(kf.id)} className="text-red-400/60 hover:text-red-400 transition-colors">
                                                    <Trash2 className="w-3 h-3" />
                                                </button>
                                            </div>
                                            <div className="grid grid-cols-3 gap-1.5">
                                                <div>
                                                    <label className="text-[8px] text-neutral-500">Time (s)</label>
                                                    <NumberInput value={kf.time} onChange={(v) => updateKf(kf.id, { time: v })} min={0} max={60} step={0.5} />
                                                </div>
                                                <div>
                                                    <label className="text-[8px] text-neutral-500">X (u)</label>
                                                    <NumberInput value={+(kf.x / ppu).toFixed(2)} onChange={(v) => updateKf(kf.id, { x: Math.round(v * ppu) })} min={0} max={+(3840 / ppu).toFixed(1)} step={0.1} />
                                                </div>
                                                <div>
                                                    <label className="text-[8px] text-neutral-500">Y (u)</label>
                                                    <NumberInput value={+(kf.y / ppu).toFixed(2)} onChange={(v) => updateKf(kf.id, { y: Math.round(v * ppu) })} min={0} max={+(2160 / ppu).toFixed(1)} step={0.1} />
                                                </div>
                                            </div>
                                            <div className="flex gap-1.5">
                                                <div className="flex-1">
                                                    <label className="text-[8px] text-neutral-500">Zoom</label>
                                                    <NumberInput value={kf.zoom} onChange={(v) => updateKf(kf.id, { zoom: v })} min={0.5} max={5} step={0.1} />
                                                </div>
                                                <div className="flex-1">
                                                    <label className="text-[8px] text-neutral-500">Easing</label>
                                                    <select
                                                        value={kf.easing}
                                                        onChange={(e) => updateKf(kf.id, { easing: e.target.value as CameraKeyframe['easing'] })}
                                                        className="w-full bg-white/5 rounded px-1.5 py-1 text-[10px] text-white border border-white/5 outline-none"
                                                    >
                                                        <option value="linear">Linear</option>
                                                        <option value="easeIn">Ease In</option>
                                                        <option value="easeOut">Ease Out</option>
                                                        <option value="easeInOut">Ease In-Out</option>
                                                    </select>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    );
                })()}

                {/* SCENE-SPECIFIC */}
                {nodeType === 'scene' && (
                    <>
                        <FieldGroup label="Canvas Width">
                            <NumberInput
                                value={(data as SceneNodeData).canvasWidth}
                                onChange={(v) => updateNodeData(selectedNode.id, { canvasWidth: v })}
                                min={320}
                                max={3840}
                                step={10}
                            />
                        </FieldGroup>
                        <FieldGroup label="Canvas Height">
                            <NumberInput
                                value={(data as SceneNodeData).canvasHeight}
                                onChange={(v) => updateNodeData(selectedNode.id, { canvasHeight: v })}
                                min={240}
                                max={2160}
                                step={10}
                            />
                        </FieldGroup>
                        <FieldGroup label="FPS">
                            <select
                                value={(data as SceneNodeData).fps}
                                onChange={(e) => updateNodeData(selectedNode.id, { fps: Number(e.target.value) })}
                                className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-amber-500/50"
                            >
                                <option value={24}>24 fps</option>
                                <option value={30}>30 fps</option>
                                <option value={60}>60 fps</option>
                            </select>
                        </FieldGroup>
                        <FieldGroup label="Pixels Per Unit (PPU)">
                            <NumberInput
                                value={(data as SceneNodeData).pixelsPerUnit || 100}
                                onChange={(v) => {
                                    if (v > 0) updateNodeData(selectedNode.id, { pixelsPerUnit: v });
                                }}
                                min={1}
                                max={1000}
                                step={10}
                            />
                            <p className="text-[9px] text-neutral-500 mt-0.5 italic">
                                1 unit = {(data as SceneNodeData).pixelsPerUnit || 100}px · Canvas = {((data as SceneNodeData).canvasWidth / ((data as SceneNodeData).pixelsPerUnit || 100)).toFixed(1)} × {((data as SceneNodeData).canvasHeight / ((data as SceneNodeData).pixelsPerUnit || 100)).toFixed(1)} units
                            </p>
                        </FieldGroup>

                        {/* Camera info — camera is now a separate node */}
                        <div className="text-[10px] text-sky-400/70 bg-sky-500/5 border border-sky-500/10 rounded-lg p-2 space-y-1">
                            <div className="font-bold">🎥 Camera → Separate Node</div>
                            <div className="text-neutral-400">Add a Camera node and connect it to this Scene Output to control camera position, zoom, and keyframes.</div>
                        </div>
                    </>
                )}

                {/* MAP-SPECIFIC */}
                {nodeType === 'map' && (
                    <>
                        <FieldGroup label="Map Style">
                            <select
                                value={(data as MapNodeData).mapStyle || 'dark'}
                                onChange={(e) => updateNodeData(selectedNode.id, { mapStyle: e.target.value })}
                                className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-green-500/50 transition-colors"
                            >
                                <option value="dark">🌑 Dark Matter</option>
                                <option value="positron">☀️ Positron (Light)</option>
                                <option value="voyager">🗺️ Voyager</option>
                                <option value="darkNoLabels">🌑 Dark (No Labels)</option>
                            </select>
                        </FieldGroup>
                        <div className="text-[10px] text-blue-400/60 bg-blue-500/5 border border-blue-500/10 rounded-lg p-2 text-center">
                            🌍 3D WebGL Map · Zoom, tilt, rotate with mouse
                        </div>
                        <div className="text-[10px] text-green-400/60 bg-green-500/5 border border-green-500/10 rounded-lg p-2 text-center">
                            Double-click the Map node to edit animation sequence
                        </div>
                        <div className="text-[10px] text-neutral-500">
                            Steps: {((data as MapNodeData).sequence || []).length} ·
                            Duration: {((data as MapNodeData).sequence || []).reduce((sum: number, s: any) => sum + (s.duration || 0), 0).toFixed(1)}s
                        </div>
                    </>
                )}
            </div>

            {/* Delete button */}
            <div className="p-3 border-t border-white/5">
                <button
                    onClick={() => {
                        removeNode(selectedNode.id);
                        selectNode(null);
                    }}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold
            bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 hover:border-red-500/30
            transition-all active:scale-95"
                >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete Node
                </button>
            </div>
        </div >
    );
};

// ── Helper Components ──

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <label className="block text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">
                {label}
            </label>
            {children}
        </div>
    );
}

function NumberInput({
    value,
    onChange,
    min,
    max,
    step = 1,
}: {
    value: number;
    onChange: (v: number) => void;
    min?: number;
    max?: number;
    step?: number;
}) {
    return (
        <input
            type="number"
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            min={min}
            max={max}
            step={step}
            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white font-mono outline-none focus:border-indigo-500/50 transition-colors"
        />
    );
}

// ── Stage Layer Editor ──
const STAGE_PRESETS_KEY = 'animeStudio_stagePresets';
interface StagePreset { id: string; name: string; layers: StageLayer[]; createdAt: string; }

function StageLayerEditor({ layers, onUpdate, pixelsPerUnit = 100 }: { layers: StageLayer[]; onUpdate: (layers: StageLayer[]) => void; pixelsPerUnit?: number }) {
    const ppu = pixelsPerUnit;
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const uploadRef = useRef<HTMLInputElement>(null);
    const [presets, setPresets] = useState<StagePreset[]>([]);
    const [saveName, setSaveName] = useState('');
    const [flaImporting, setFlaImporting] = useState<string | null>(null); // progress text

    // Load presets from localStorage
    useEffect(() => {
        try {
            const raw = localStorage.getItem(STAGE_PRESETS_KEY);
            if (raw) setPresets(JSON.parse(raw));
        } catch { /* ignore */ }
    }, []);

    const savePreset = useCallback(() => {
        if (!saveName.trim() || layers.length === 0) return;
        const newPreset: StagePreset = {
            id: `preset-${Date.now()}`,
            name: saveName.trim(),
            layers: JSON.parse(JSON.stringify(layers)),
            createdAt: new Date().toISOString(),
        };
        const updated = [...presets, newPreset];
        setPresets(updated);
        localStorage.setItem(STAGE_PRESETS_KEY, JSON.stringify(updated));
        setSaveName('');
    }, [saveName, layers, presets]);

    const loadPreset = useCallback((preset: StagePreset) => {
        onUpdate(JSON.parse(JSON.stringify(preset.layers)));
    }, [onUpdate]);

    const deletePreset = useCallback((id: string) => {
        const updated = presets.filter(p => p.id !== id);
        setPresets(updated);
        localStorage.setItem(STAGE_PRESETS_KEY, JSON.stringify(updated));
    }, [presets]);

    const sorted = useMemo(() => [...layers].sort((a, b) => a.zIndex - b.zIndex), [layers]);

    const addLayer = useCallback(() => {
        const maxZ = layers.reduce((max, l) => Math.max(max, l.zIndex), 0);
        const newLayer: StageLayer = {
            id: `layer-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            type: 'prop',
            source: 'image',
            label: `Layer ${layers.length + 1}`,
            assetPath: '',
            posX: 960,
            posY: 540,
            zIndex: Math.min(100, maxZ + 10),
            width: 960,
            height: 540,
            opacity: 1,
            rotation: 0,
            blur: 0,
            visible: true,
        };
        onUpdate([...layers, newLayer]);
        setExpandedId(newLayer.id);
        // Trigger file upload dialog after adding
        setTimeout(() => uploadRef.current?.click(), 100);
    }, [layers, onUpdate]);

    const updateLayer = useCallback((id: string, patch: Partial<StageLayer>) => {
        onUpdate(layers.map(l => l.id === id ? { ...l, ...patch } : l));
    }, [layers, onUpdate]);

    const removeLayer = useCallback((id: string) => {
        onUpdate(layers.filter(l => l.id !== id));
        if (expandedId === id) setExpandedId(null);
    }, [layers, onUpdate, expandedId]);

    const moveLayer = useCallback((id: string, dir: -1 | 1) => {
        const layer = layers.find(l => l.id === id);
        if (!layer) return;
        updateLayer(id, { zIndex: Math.max(0, Math.min(100, layer.zIndex + dir * 5)) });
    }, [layers, updateLayer]);

    const handleUpload = useCallback(async (files: FileList, targetId: string) => {
        const layer = layers.find(l => l.id === targetId);
        if (!layer || !files.length) return;

        // Detect source type from file
        const file = files[0];
        const isVideo = file.type.startsWith('video/');
        const source = isVideo ? 'video' as const : 'image' as const;

        // Upload to stages endpoint
        const formData = new FormData();
        formData.append('files', file);

        try {
            const res = await fetch(`${API_BASE_URL}/api/stages/upload`, { method: 'POST', body: formData });
            if (res.ok) {
                const data = await res.json();
                if (data.uploaded?.length > 0) {
                    updateLayer(targetId, { assetPath: data.uploaded[0].path, source });
                }
            }
        } catch { /* ignore */ }
    }, [layers, updateLayer]);

    const sourceColors: Record<string, { bg: string; text: string; border: string }> = {
        image: { bg: 'bg-cyan-500/15', text: 'text-cyan-300', border: 'border-cyan-500/30' },
        video: { bg: 'bg-purple-500/15', text: 'text-purple-300', border: 'border-purple-500/30' },
        fla: { bg: 'bg-amber-500/15', text: 'text-amber-300', border: 'border-amber-500/30' },
    };

    return (
        <div className="space-y-3">
            {/* Add Layer Button */}
            <div className="space-y-1.5">
                <label className="block text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Add Layer</label>
                <div className="flex gap-1">
                    <button
                        onClick={() => addLayer()}
                        className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg border text-[10px] font-medium transition-all hover:scale-[1.02] active:scale-95 bg-amber-500/15 text-amber-300 border-amber-500/30"
                    >
                        <Plus className="w-3 h-3" />
                        Add Layer
                    </button>
                    <button
                        onClick={() => uploadRef.current?.click()}
                        disabled={!!flaImporting}
                        className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg border text-[10px] font-medium transition-all hover:scale-[1.02] active:scale-95 bg-orange-500/15 text-orange-300 border-orange-500/30 disabled:opacity-40"
                    >
                        <Upload className="w-3 h-3" />
                        Import FLA
                    </button>
                </div>
                {flaImporting && (
                    <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20">
                        <div className="w-3 h-3 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
                        <span className="text-[10px] text-orange-300">{flaImporting}</span>
                    </div>
                )}
            </div>

            {/* Save / Load Presets */}
            <div className="space-y-1.5">
                <label className="block text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Stage Presets</label>
                <div className="flex gap-1">
                    <input
                        type="text"
                        value={saveName}
                        onChange={(e) => setSaveName(e.target.value)}
                        placeholder="Preset name..."
                        className="flex-1 bg-white/5 rounded px-2 py-1 text-[10px] text-white border border-white/5 focus:border-amber-500/50 outline-none placeholder-neutral-600"
                        onKeyDown={(e) => e.key === 'Enter' && savePreset()}
                    />
                    <button
                        onClick={savePreset}
                        disabled={!saveName.trim() || layers.length === 0}
                        className="px-2 py-1 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-medium hover:bg-amber-500/25 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    >
                        Save
                    </button>
                </div>
                {presets.length > 0 && (
                    <div className="space-y-0.5 max-h-32 overflow-y-auto">
                        {presets.map((p) => (
                            <div key={p.id} className="flex items-center gap-1 px-1.5 py-1 rounded hover:bg-white/5 group">
                                <button
                                    onClick={() => loadPreset(p)}
                                    className="flex-1 text-left text-[10px] text-neutral-300 hover:text-white truncate"
                                >
                                    📦 {p.name} ({p.layers.length} layers)
                                </button>
                                <button
                                    onClick={() => deletePreset(p.id)}
                                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-500/20 text-red-400 transition-all"
                                >
                                    <Trash2 className="w-3 h-3" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Hidden upload input */}
            <input
                ref={uploadRef}
                type="file"
                accept=".png,.jpg,.jpeg,.webp,.gif,.bmp,.psd,.mp4,.webm,.mov,.fla,.xfl"
                className="hidden"
                onChange={async (e) => {
                    if (!e.target.files || e.target.files.length === 0) return;
                    const file = e.target.files[0];
                    const ext = file.name.split('.').pop()?.toLowerCase();

                    if (ext === 'fla' || ext === 'xfl') {
                        // FLA import: parse → render layers → upload PNGs
                        try {
                            const { parseFLAToStageLayers } = await import('@/lib/fla/fla-integration');
                            setFlaImporting('Parsing FLA...');
                            const newLayers = await parseFLAToStageLayers(file, (progress) => {
                                if (progress.phase === 'parsing') {
                                    setFlaImporting(`Parsing... ${progress.current}%`);
                                } else if (progress.phase === 'rendering') {
                                    setFlaImporting(`Rendering layer ${progress.current}/${progress.total}: ${progress.layerName || ''}`);
                                } else {
                                    setFlaImporting(`Uploading ${progress.current}/${progress.total}...`);
                                }
                            });
                            if (newLayers.length > 0) {
                                onUpdate([...layers, ...newLayers]);
                            }
                            setFlaImporting(null);
                        } catch (err) {
                            console.error('FLA import failed:', err);
                            setFlaImporting(null);
                        }
                    } else if (expandedId) {
                        // Normal upload for a specific layer
                        handleUpload(e.target.files, expandedId);
                    }
                    e.target.value = '';
                }}
            />

            {/* Layer List */}
            <div className="space-y-1">
                <label className="block text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">
                    Layers ({sorted.length})
                </label>

                {sorted.length === 0 ? (
                    <p className="text-[10px] text-neutral-600 text-center py-4">No layers yet. Add one above!</p>
                ) : (
                    <div className="space-y-1">
                        {sorted.map((layer: StageLayer) => {
                            const isExpanded = expandedId === layer.id;
                            const colors = sourceColors[layer.source] || sourceColors.image;
                            return (
                                <div key={layer.id} className={`rounded-lg border transition-all ${isExpanded ? `${colors.border} bg-white/[0.02]` : 'border-white/5 hover:border-white/10'}`}>
                                    {/* Layer Header */}
                                    <div
                                        className="flex items-center gap-1.5 px-2 py-1.5 cursor-pointer"
                                        onClick={() => setExpandedId(isExpanded ? null : layer.id)}
                                    >
                                        {isExpanded ? <ChevronDown className="w-3 h-3 text-neutral-400" /> : <ChevronRight className="w-3 h-3 text-neutral-400" />}

                                        {/* Thumbnail */}
                                        {layer.assetPath ? (
                                            layer.source === 'video' ? (
                                                <div className="w-6 h-6 rounded bg-purple-500/20 flex items-center justify-center text-[8px]">🎬</div>
                                            ) : (
                                                <img
                                                    src={`${STATIC_BASE}/${layer.assetPath}`}
                                                    className="w-6 h-6 rounded object-cover"
                                                    alt=""
                                                />
                                            )
                                        ) : (
                                            <div className="w-6 h-6 rounded bg-white/5 flex items-center justify-center">
                                                <Upload className="w-3 h-3 text-neutral-600" />
                                            </div>
                                        )}

                                        {/* Label + Source badge */}
                                        <span className="text-[11px] text-white/80 flex-1 truncate">{layer.label}</span>
                                        <span className={`text-[8px] px-1 py-0.5 rounded font-mono ${colors.bg} ${colors.text}`}>
                                            {layer.source.toUpperCase()}
                                        </span>
                                        <span className="text-[9px] text-neutral-500 font-mono w-6 text-right">z{layer.zIndex}</span>

                                        {/* Visibility toggle */}
                                        <button
                                            onClick={(e) => { e.stopPropagation(); updateLayer(layer.id, { visible: !layer.visible }); }}
                                            className="p-0.5 hover:bg-white/10 rounded"
                                        >
                                            {layer.visible
                                                ? <Eye className="w-3 h-3 text-neutral-400" />
                                                : <EyeOff className="w-3 h-3 text-neutral-600" />
                                            }
                                        </button>
                                    </div>

                                    {/* Expanded Layer Properties */}
                                    {isExpanded && (
                                        <div className="px-2 pb-2 space-y-1.5 border-t border-white/5 pt-1.5">
                                            {/* Upload / Change Image */}
                                            <button
                                                onClick={() => { setExpandedId(layer.id); uploadRef.current?.click(); }}
                                                className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded border border-dashed border-white/10 hover:border-white/20 text-[10px] text-neutral-400 transition-all"
                                            >
                                                <Upload className="w-3 h-3" />
                                                {layer.assetPath ? 'Change asset' : 'Upload image/video'}
                                            </button>

                                            {/* Label */}
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] text-neutral-500 w-10">Label</span>
                                                <input
                                                    type="text"
                                                    value={layer.label}
                                                    onChange={(e) => updateLayer(layer.id, { label: e.target.value })}
                                                    className="flex-1 bg-white/5 rounded px-2 py-0.5 text-[10px] text-white border border-white/5 focus:border-amber-500/50 outline-none"
                                                />
                                            </div>

                                            {/* Type */}
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] text-neutral-500 w-10">Type</span>
                                                <select
                                                    value={layer.type || 'prop'}
                                                    onChange={(e) => updateLayer(layer.id, { type: e.target.value as StageLayer['type'] })}
                                                    className="flex-1 bg-white/5 rounded px-2 py-0.5 text-[10px] text-white border border-white/5 focus:border-amber-500/50 outline-none"
                                                >
                                                    <option value="background">🖼️ Background</option>
                                                    <option value="foreground">🎭 Foreground</option>
                                                    <option value="prop">🔧 Prop</option>
                                                </select>
                                            </div>

                                            {/* Z-Index with arrows */}
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] text-neutral-500 w-10">Z-Index</span>
                                                <div className="flex items-center gap-1">
                                                    <button onClick={() => moveLayer(layer.id, -1)} className="p-0.5 rounded hover:bg-white/10">
                                                        <ArrowDown className="w-3 h-3 text-neutral-400" />
                                                    </button>
                                                    <input
                                                        type="number"
                                                        value={layer.zIndex}
                                                        onChange={(e) => updateLayer(layer.id, { zIndex: Number(e.target.value) })}
                                                        className="w-12 bg-white/5 rounded px-1.5 py-0.5 text-[10px] text-white text-center border border-white/5 focus:border-amber-500/50 outline-none"
                                                        min={0}
                                                        max={100}
                                                    />
                                                    <button onClick={() => moveLayer(layer.id, 1)} className="p-0.5 rounded hover:bg-white/10">
                                                        <ArrowUp className="w-3 h-3 text-neutral-400" />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Position (units) */}
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] text-neutral-500 w-10">Pos(u)</span>
                                                <input type="number" value={+(layer.posX / ppu).toFixed(2)} step={0.1}
                                                    onChange={(e) => { const v = Number(e.target.value); if (!isNaN(v)) updateLayer(layer.id, { posX: Math.round(v * ppu) }); }}
                                                    className="w-14 bg-white/5 rounded px-1.5 py-0.5 text-[10px] text-white text-center border border-white/5 outline-none"
                                                />
                                                <input type="number" value={+(layer.posY / ppu).toFixed(2)} step={0.1}
                                                    onChange={(e) => { const v = Number(e.target.value); if (!isNaN(v)) updateLayer(layer.id, { posY: Math.round(v * ppu) }); }}
                                                    className="w-14 bg-white/5 rounded px-1.5 py-0.5 text-[10px] text-white text-center border border-white/5 outline-none"
                                                />
                                            </div>

                                            {/* Size (units) + Opacity */}
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] text-neutral-500 w-10">W×H</span>
                                                <input type="number" value={+(layer.width / ppu).toFixed(2)} step={0.1}
                                                    onChange={(e) => { const v = Number(e.target.value); if (!isNaN(v)) updateLayer(layer.id, { width: Math.round(v * ppu) }); }}
                                                    className="w-14 bg-white/5 rounded px-1.5 py-0.5 text-[10px] text-white text-center border border-white/5 outline-none"
                                                />
                                                <input type="number" value={+(layer.height / ppu).toFixed(2)} step={0.1}
                                                    onChange={(e) => { const v = Number(e.target.value); if (!isNaN(v)) updateLayer(layer.id, { height: Math.round(v * ppu) }); }}
                                                    className="w-14 bg-white/5 rounded px-1.5 py-0.5 text-[10px] text-white text-center border border-white/5 outline-none"
                                                />
                                                <span className="text-[10px] text-neutral-500 w-10 text-right">Opacity</span>
                                                <input type="number" value={layer.opacity} step={0.1} min={0} max={1}
                                                    onChange={(e) => updateLayer(layer.id, { opacity: Number(e.target.value) })}
                                                    className="w-14 bg-white/5 rounded px-1.5 py-0.5 text-[10px] text-white text-center border border-white/5 outline-none"
                                                />
                                            </div>

                                            {/* Rotation + Blur */}
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] text-neutral-500 w-10">Rotate</span>
                                                <input type="number" value={layer.rotation} min={-360} max={360}
                                                    onChange={(e) => updateLayer(layer.id, { rotation: Number(e.target.value) })}
                                                    className="w-14 bg-white/5 rounded px-1.5 py-0.5 text-[10px] text-white text-center border border-white/5 outline-none"
                                                />
                                                <span className="text-[10px] text-neutral-500 w-10 text-right">Blur</span>
                                                <input type="number" value={layer.blur} min={0} max={20}
                                                    onChange={(e) => updateLayer(layer.id, { blur: Number(e.target.value) })}
                                                    className="w-14 bg-white/5 rounded px-1.5 py-0.5 text-[10px] text-white text-center border border-white/5 outline-none"
                                                />
                                            </div>

                                            {/* Delete */}
                                            <button
                                                onClick={() => removeLayer(layer.id)}
                                                className="w-full flex items-center justify-center gap-1 px-2 py-1 rounded bg-red-500/10 text-red-400 text-[10px] hover:bg-red-500/20 transition-all"
                                            >
                                                <Trash2 className="w-3 h-3" /> Remove Layer
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

export default NodeInspector;
