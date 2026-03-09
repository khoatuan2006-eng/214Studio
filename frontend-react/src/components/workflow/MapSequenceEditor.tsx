import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useWorkflowStore, type MapNodeData, type MapStep } from '@/stores/useWorkflowStore';
import { WorldMap, type MapStyleKey } from './maps/WorldMap';
import {
    X, Plus, Trash2, Play, Pause, ChevronUp, ChevronDown,
    MapPin, ZoomIn, ZoomOut,
} from 'lucide-react';

interface MapSequenceEditorProps {
    nodeId: string;
    onClose: () => void;
}

const MapSequenceEditor: React.FC<MapSequenceEditorProps> = ({ nodeId, onClose }) => {
    const { nodes, updateNodeData } = useWorkflowStore();
    const node = nodes.find((n) => n.id === nodeId);
    const data = (node?.data || {}) as MapNodeData;
    const sequence = data.sequence || [];

    const [selectedStepIndex, setSelectedStepIndex] = useState(0);
    const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
    const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [flyToTarget, setFlyToTarget] = useState<any>(null);

    const currentStep = sequence[selectedStepIndex] || null;

    // ── Step CRUD ──
    const addStep = useCallback(() => {
        const newStep: MapStep = {
            id: `step_${Date.now()}`,
            duration: 2,
            highlightedProvinces: [],
            zoomLevel: 2,
            cameraX: 0,
            cameraY: 20,
            pitch: 0,
            bearing: 0,
            provinceColor: '#ef4444',
            label: `Step ${sequence.length + 1}`,
        };
        const updated = [...sequence, newStep];
        updateNodeData(nodeId, { sequence: updated });
        setSelectedStepIndex(updated.length - 1);
    }, [sequence, nodeId, updateNodeData]);

    const removeStep = useCallback((index: number) => {
        const updated = sequence.filter((_, i) => i !== index);
        updateNodeData(nodeId, { sequence: updated });
        setSelectedStepIndex(Math.max(0, selectedStepIndex - 1));
    }, [sequence, nodeId, updateNodeData, selectedStepIndex]);

    const updateStep = useCallback((index: number, partial: Partial<MapStep>) => {
        const updated = sequence.map((s, i) => (i === index ? { ...s, ...partial } : s));
        updateNodeData(nodeId, { sequence: updated });
    }, [sequence, nodeId, updateNodeData]);

    const moveStep = useCallback((from: number, dir: -1 | 1) => {
        const to = from + dir;
        if (to < 0 || to >= sequence.length) return;
        const updated = [...sequence];
        [updated[from], updated[to]] = [updated[to], updated[from]];
        updateNodeData(nodeId, { sequence: updated });
        setSelectedStepIndex(to);
    }, [sequence, nodeId, updateNodeData]);

    // ── Region toggle ──
    const toggleRegion = useCallback((regionId: string, regionName: string) => {
        if (!currentStep) return;
        const displayId = regionName || regionId;
        const regions = currentStep.highlightedProvinces.includes(displayId)
            ? currentStep.highlightedProvinces.filter((p) => p !== displayId)
            : [...currentStep.highlightedProvinces, displayId];
        updateStep(selectedStepIndex, { highlightedProvinces: regions });
    }, [currentStep, selectedStepIndex, updateStep]);

    // ── Camera sync from map interaction ──
    const handleCameraChange = useCallback((viewState: {
        longitude: number; latitude: number; zoom: number; pitch: number; bearing: number;
    }) => {
        if (!currentStep || isPreviewPlaying) return;
        updateStep(selectedStepIndex, {
            cameraX: Math.round(viewState.longitude * 100) / 100,
            cameraY: Math.round(viewState.latitude * 100) / 100,
            zoomLevel: Math.round(viewState.zoom * 10) / 10,
            pitch: Math.round(viewState.pitch),
            bearing: Math.round(viewState.bearing),
        });
    }, [currentStep, selectedStepIndex, updateStep, isPreviewPlaying]);

    // ── Preview All ──
    const stopPreview = useCallback(() => {
        setIsPreviewPlaying(false);
        if (previewTimer.current) clearTimeout(previewTimer.current);
    }, []);

    const previewAll = useCallback(() => {
        if (sequence.length === 0) return;
        setIsPreviewPlaying(true);
        let i = 0;
        const playNext = () => {
            if (i >= sequence.length) { stopPreview(); return; }
            setSelectedStepIndex(i);
            const step = sequence[i];
            // Fly to this step's camera position
            setFlyToTarget({
                longitude: step.cameraX,
                latitude: step.cameraY,
                zoom: step.zoomLevel,
                pitch: step.pitch || 0,
                bearing: step.bearing || 0,
                duration: 1500,
            });
            i++;
            previewTimer.current = setTimeout(playNext, step.duration * 1000);
        };
        playNext();
    }, [sequence, stopPreview]);

    useEffect(() => () => { if (previewTimer.current) clearTimeout(previewTimer.current); }, []);

    // ── When selecting a step, fly to its camera ──
    useEffect(() => {
        if (currentStep && !isPreviewPlaying) {
            setFlyToTarget({
                longitude: currentStep.cameraX,
                latitude: currentStep.cameraY,
                zoom: currentStep.zoomLevel,
                pitch: currentStep.pitch || 0,
                bearing: currentStep.bearing || 0,
                duration: 800,
            });
        }
    }, [selectedStepIndex]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!node) return null;

    return (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col" onClick={(e) => e.target === e.currentTarget && onClose()}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-black/90 border-b border-white/10">
                <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-green-400" />
                    <span className="text-sm font-bold text-white">Map Sequence</span>
                </div>
                <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
                    <X className="w-4 h-4 text-neutral-400" />
                </button>
            </div>

            {/* Main 3-panel layout */}
            <div className="flex flex-1 min-h-0">
                {/* LEFT: Step list */}
                <div className="w-[260px] bg-black/60 border-r border-white/10 flex flex-col">
                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                        {sequence.map((step, i) => (
                            <div
                                key={step.id}
                                role="button"
                                tabIndex={0}
                                onClick={() => setSelectedStepIndex(i)}
                                onKeyDown={(e) => e.key === 'Enter' && setSelectedStepIndex(i)}
                                className={`p-3 rounded-lg cursor-pointer transition-all border ${i === selectedStepIndex
                                        ? 'bg-green-500/15 border-green-500/40 shadow-lg shadow-green-500/10'
                                        : 'bg-white/3 border-transparent hover:bg-white/5 hover:border-white/10'
                                    }`}
                            >
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-white/90 truncate flex-1">{step.label}</span>
                                    <div className="flex items-center gap-0.5 ml-2">
                                        <button onClick={(e) => { e.stopPropagation(); moveStep(i, -1); }} className="p-0.5 hover:bg-white/10 rounded" disabled={i === 0}>
                                            <ChevronUp className="w-3 h-3 text-neutral-500" />
                                        </button>
                                        <button onClick={(e) => { e.stopPropagation(); moveStep(i, 1); }} className="p-0.5 hover:bg-white/10 rounded" disabled={i === sequence.length - 1}>
                                            <ChevronDown className="w-3 h-3 text-neutral-500" />
                                        </button>
                                        <button onClick={(e) => { e.stopPropagation(); removeStep(i); }} className="p-0.5 hover:bg-red-500/20 rounded">
                                            <Trash2 className="w-3 h-3 text-red-400" />
                                        </button>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 mt-1 text-[10px] text-neutral-500">
                                    <span>{step.duration}s</span>
                                    <span>·</span>
                                    <span>{step.highlightedProvinces.length} regions</span>
                                    <span>·</span>
                                    <span>z{step.zoomLevel.toFixed(1)}</span>
                                    {(step.pitch || 0) > 0 && <span>· {step.pitch}°</span>}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="p-2 border-t border-white/10 space-y-1.5">
                        <button onClick={addStep} className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-green-500/20 text-green-300 text-xs font-semibold hover:bg-green-500/30 transition-colors border border-green-500/20">
                            <Plus className="w-3.5 h-3.5" /> Add Step
                        </button>
                        <button
                            onClick={isPreviewPlaying ? stopPreview : previewAll}
                            disabled={sequence.length === 0}
                            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-blue-500/10 text-blue-300 text-xs font-semibold hover:bg-blue-500/20 transition-colors border border-blue-500/20 disabled:opacity-30"
                        >
                            {isPreviewPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                            {isPreviewPlaying ? 'Stop' : 'Preview All'}
                        </button>
                    </div>
                </div>

                {/* CENTER: Map preview */}
                <div className="flex-1 flex items-center justify-center relative bg-neutral-950">
                    {sequence.length === 0 ? (
                        <div className="text-center">
                            <MapPin className="w-12 h-12 text-neutral-700 mx-auto mb-3" />
                            <p className="text-sm text-neutral-500 font-medium">No Steps Yet</p>
                            <p className="text-xs text-neutral-600 mt-1.5">
                                Click "Add Step" on the left to start building your map animation sequence.
                            </p>
                        </div>
                    ) : (
                        <WorldMap
                            longitude={currentStep?.cameraX || 0}
                            latitude={currentStep?.cameraY || 20}
                            zoom={currentStep?.zoomLevel || 2}
                            pitch={currentStep?.pitch || 0}
                            bearing={currentStep?.bearing || 0}
                            highlightedRegions={currentStep?.highlightedProvinces || []}
                            onRegionClick={toggleRegion}
                            onCameraChange={handleCameraChange}
                            mapStyle={(data.mapStyle || 'dark') as MapStyleKey}
                            interactive={!isPreviewPlaying}
                            flyTo={flyToTarget}
                            width="100%"
                            height="100%"
                        />
                    )}

                    {/* Step indicator */}
                    {sequence.length > 0 && (
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur-md text-white text-xs px-4 py-1.5 rounded-full border border-white/10">
                            Step {selectedStepIndex + 1}/{sequence.length} — {currentStep?.label}
                        </div>
                    )}
                </div>

                {/* RIGHT: Step properties */}
                <div className="w-[280px] bg-black/60 border-l border-white/10 overflow-y-auto">
                    {currentStep ? (
                        <>
                            <div className="p-3 border-b border-white/10">
                                <h3 className="text-xs font-bold text-green-400 uppercase tracking-wider">Step Properties</h3>
                            </div>
                            <div className="p-3 space-y-4">
                                {/* Step Label */}
                                <FieldGroup label="Step Label">
                                    <input
                                        type="text"
                                        value={currentStep.label}
                                        onChange={(e) => updateStep(selectedStepIndex, { label: e.target.value })}
                                        className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-green-500/50 transition-colors"
                                    />
                                </FieldGroup>

                                {/* Duration */}
                                <FieldGroup label="Duration (seconds)">
                                    <input
                                        type="number"
                                        value={currentStep.duration}
                                        onChange={(e) => updateStep(selectedStepIndex, { duration: Number(e.target.value) })}
                                        min={0.5} max={60} step={0.5}
                                        className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white font-mono outline-none focus:border-green-500/50"
                                    />
                                </FieldGroup>

                                {/* Camera — Zoom */}
                                <FieldGroup label={`Zoom ×${currentStep.zoomLevel.toFixed(1)}`}>
                                    <div className="flex items-center gap-2">
                                        <ZoomOut className="w-3.5 h-3.5 text-neutral-500" />
                                        <input
                                            type="range"
                                            value={currentStep.zoomLevel}
                                            onChange={(e) => updateStep(selectedStepIndex, { zoomLevel: Number(e.target.value) })}
                                            min={0} max={20} step={0.1}
                                            className="flex-1 accent-green-500"
                                        />
                                        <ZoomIn className="w-3.5 h-3.5 text-neutral-500" />
                                    </div>
                                </FieldGroup>

                                {/* Camera — Pitch (3D tilt) */}
                                <FieldGroup label={`3D Tilt — ${currentStep.pitch || 0}°`}>
                                    <input
                                        type="range"
                                        value={currentStep.pitch || 0}
                                        onChange={(e) => updateStep(selectedStepIndex, { pitch: Number(e.target.value) })}
                                        min={0} max={85} step={1}
                                        className="w-full accent-blue-500"
                                    />
                                    <div className="flex justify-between text-[9px] text-neutral-600 mt-0.5">
                                        <span>Flat (0°)</span>
                                        <span>3D (85°)</span>
                                    </div>
                                </FieldGroup>

                                {/* Camera — Bearing (rotation) */}
                                <FieldGroup label={`Compass — ${currentStep.bearing || 0}°`}>
                                    <input
                                        type="range"
                                        value={currentStep.bearing || 0}
                                        onChange={(e) => updateStep(selectedStepIndex, { bearing: Number(e.target.value) })}
                                        min={0} max={360} step={1}
                                        className="w-full accent-purple-500"
                                    />
                                    <div className="flex justify-between text-[9px] text-neutral-600 mt-0.5">
                                        <span>N (0°)</span>
                                        <span>E (90°)</span>
                                        <span>S (180°)</span>
                                        <span>W (270°)</span>
                                    </div>
                                </FieldGroup>

                                {/* Camera — Center (Lon/Lat) */}
                                <FieldGroup label="Camera Center (Longitude, Latitude)">
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="text-[9px] text-neutral-500 mb-0.5 block">Lon</label>
                                            <input
                                                type="number"
                                                value={currentStep.cameraX}
                                                onChange={(e) => updateStep(selectedStepIndex, { cameraX: Number(e.target.value) })}
                                                min={-180} max={180} step={0.01}
                                                className="w-full bg-black/30 border border-white/10 rounded px-2 py-1 text-[10px] text-white font-mono outline-none focus:border-green-500/50"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[9px] text-neutral-500 mb-0.5 block">Lat</label>
                                            <input
                                                type="number"
                                                value={currentStep.cameraY}
                                                onChange={(e) => updateStep(selectedStepIndex, { cameraY: Number(e.target.value) })}
                                                min={-90} max={90} step={0.01}
                                                className="w-full bg-black/30 border border-white/10 rounded px-2 py-1 text-[10px] text-white font-mono outline-none focus:border-green-500/50"
                                            />
                                        </div>
                                    </div>
                                </FieldGroup>

                                {/* Highlighted Regions */}
                                <FieldGroup label={`Highlighted Regions (${currentStep.highlightedProvinces.length})`}>
                                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                                        {currentStep.highlightedProvinces.length === 0 ? (
                                            <p className="text-[10px] text-neutral-600 italic text-center py-2">
                                                Click on the map to select regions
                                            </p>
                                        ) : (
                                            currentStep.highlightedProvinces.map((pid) => (
                                                <div
                                                    key={pid}
                                                    className="flex items-center justify-between px-2 py-1.5 rounded bg-white/3 border border-white/5"
                                                >
                                                    <span className="text-[11px] text-white/80">{pid}</span>
                                                    <button
                                                        onClick={() => toggleRegion(pid, pid)}
                                                        className="p-0.5 hover:bg-red-500/20 rounded"
                                                        title="Remove"
                                                    >
                                                        <X className="w-3 h-3 text-red-400" />
                                                    </button>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </FieldGroup>
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex items-center justify-center p-6 text-center">
                            <div>
                                <MapPin className="w-10 h-10 text-neutral-600 mx-auto mb-3" />
                                <p className="text-xs text-neutral-500">Add a step to configure its properties</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// ── Helper Components ──

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <label className="block text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-1.5">
                {label}
            </label>
            {children}
        </div>
    );
}

export default MapSequenceEditor;
