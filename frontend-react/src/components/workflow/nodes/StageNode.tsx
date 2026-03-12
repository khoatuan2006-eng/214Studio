import { memo, useMemo, useState, useCallback, useEffect } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import type { StageNodeData } from '@/stores/useWorkflowStore';
import { useWorkflowStore } from '@/stores/useWorkflowStore';
import { STATIC_BASE } from '@/stores/useAppStore';
import { API_BASE_URL } from '@/config/api';
import { GripVertical, Clapperboard, Layers, Image, Wrench, Sparkles } from 'lucide-react';

type StageNodeType = Node<StageNodeData, 'stage'>;

/**
 * Stage Node — unified "Film Set" builder.
 * Combines Background + Foreground + Prop layers in one node.
 */
function StageNodeComponent({ id, data, selected }: NodeProps<StageNodeType>) {
    const updateNodeData = useWorkflowStore((s) => s.updateNodeData);
    const [analyzing, setAnalyzing] = useState(false);
    const [selectedModel, setSelectedModel] = useState('');
    const [availableModels, setAvailableModels] = useState<{ id: string; name: string; status: string; status_message: string; type: string }[]>([]);
    const [loadingModels, setLoadingModels] = useState(true);
    const [needsKey, setNeedsKey] = useState(false);
    const [apiKeyInput, setApiKeyInput] = useState('');
    const [savingKey, setSavingKey] = useState(false);
    const [keyError, setKeyError] = useState('');

    // Fetch models — also detects if API key is missing
    const loadModels = useCallback(() => {
        setLoadingModels(true);
        setNeedsKey(false);
        fetch(`${API_BASE_URL}/api/ai/models`)
            .then(r => r.json())
            .then(res => {
                if (res.error && (res.error.includes('No API key') || res.error.includes('api key'))) {
                    setNeedsKey(true);
                    setAvailableModels([]);
                } else if (res.models?.length) {
                    setAvailableModels(res.models);
                    const firstOk = res.models.find((m: any) => m.status === 'available');
                    setSelectedModel(firstOk?.id || res.models[0].id);
                    setNeedsKey(false);
                } else {
                    setNeedsKey(true);
                }
            })
            .catch(() => setNeedsKey(true))
            .finally(() => setLoadingModels(false));
    }, []);

    useEffect(() => { loadModels(); }, [loadModels]);

    // Save API key then reload models
    const handleSaveKey = useCallback(async () => {
        if (!apiKeyInput.trim()) return;
        setSavingKey(true);
        setKeyError('');
        try {
            const resp = await fetch(`${API_BASE_URL}/api/ai/keys/add`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ api_key: apiKeyInput.trim() }),
            });
            if (!resp.ok) {
                let msg = `Lỗi ${resp.status}`;
                try { const d = await resp.json(); msg = d?.detail || msg; } catch { /* */ }
                throw new Error(msg);
            }
            setApiKeyInput('');
            loadModels();
        } catch (e: any) {
            setKeyError(e?.message || 'Lỗi khi lưu key');
        } finally {
            setSavingKey(false);
        }
    }, [apiKeyInput, loadModels]);

    const sortedLayers = useMemo(
        () => [...data.layers].sort((a, b) => a.zIndex - b.zIndex),
        [data.layers]
    );

    const bgLayers = sortedLayers.filter((l) => l.type === 'background');
    const fgLayers = sortedLayers.filter((l) => l.type === 'foreground');
    const propLayers = sortedLayers.filter((l) => l.type === 'prop');

    // Show up to 4 thumbnails stacked for preview
    const previewLayers = sortedLayers.filter((l) => l.assetPath && l.visible).slice(0, 4);

    const handleAnalyze = useCallback(async () => {
        if (analyzing || data.layers.length === 0) return;
        setAnalyzing(true);
        try {
            const layerPayloads = await Promise.all(
                data.layers.map(async (layer) => {
                    let imageBase64 = '';
                    try {
                        const imgUrl = layer.assetPath.startsWith('http')
                            ? layer.assetPath
                            : `${STATIC_BASE}/${layer.assetPath}`;
                        const resp = await fetch(imgUrl);
                        const blob = await resp.blob();
                        imageBase64 = await new Promise<string>((resolve) => {
                            const reader = new FileReader();
                            reader.onloadend = () => {
                                const result = reader.result as string;
                                resolve(result.split(',')[1] || '');
                            };
                            reader.readAsDataURL(blob);
                        });
                    } catch { /* skip */ }
                    return { id: layer.id, label: layer.label, image_base64: imageBase64, type: layer.type, zIndex: layer.zIndex };
                })
            );

            const resp = await fetch(`${API_BASE_URL}/api/ai/analyze-stage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ layers: layerPayloads, vision_model: selectedModel }),
            });
            const result = await resp.json();

            if (result.elements?.length) {
                const updatedLayers = data.layers.map((l) => {
                    const el = result.elements.find((e: any) => e.layer_id === l.id);
                    if (el) {
                        return {
                            ...l,
                            label: el.name_vi || el.name_en || l.label,
                            zIndex: el.suggested_z ?? l.zIndex,
                            semanticInfo: {
                                nameVi: el.name_vi, nameEn: el.name_en,
                                category: el.category, description: el.description,
                                canStandOn: el.can_stand_on, canSitOn: el.can_sit_on,
                                bboxX: el.bbox_x, bboxY: el.bbox_y,
                                bboxW: el.bbox_w, bboxH: el.bbox_h,
                            },
                        };
                    }
                    return l;
                });
                updateNodeData(id, {
                    layers: updatedLayers,
                    sceneDescription: result.scene_description,
                    sceneType: result.scene_type,
                    mood: result.mood,
                });
            }
        } catch (err) {
            console.error('Stage analysis failed:', err);
        } finally {
            setAnalyzing(false);
        }
    }, [analyzing, data.layers, id, updateNodeData, selectedModel]);

    const sceneDesc = (data as any).sceneDescription;

    // Rename a layer label
    const handleRenameLayer = useCallback((layerId: string, newLabel: string) => {
        const updatedLayers = data.layers.map(l => l.id === layerId ? { ...l, label: newLabel } : l);
        updateNodeData(id, { layers: updatedLayers });
    }, [data.layers, id, updateNodeData]);

    // Layer has semantic info from AI?
    const hasAIData = data.layers.some((l: any) => l.semanticInfo);

    return (
        <div
            className={`rounded-xl overflow-hidden shadow-2xl transition-all duration-200 min-w-[220px] max-w-[260px] ${selected
                ? 'ring-2 ring-amber-400 shadow-amber-500/30'
                : 'ring-1 ring-white/10 hover:ring-white/20'
                }`}
            style={{ background: 'linear-gradient(135deg, #2a1f0e 0%, #1a1a2e 100%)' }}
        >
            {/* Header — editable stage name */}
            <div
                className="flex items-center gap-2 px-3 py-2 border-b border-white/10"
                style={{ background: 'linear-gradient(90deg, rgba(245,158,11,0.3), rgba(217,119,6,0.15))' }}
            >
                <GripVertical className="w-3 h-3 text-white/30 cursor-grab" />
                <Clapperboard className="w-4 h-4 text-amber-300" />
                <input
                    type="text"
                    defaultValue={data.label}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={(e) => updateNodeData(id, { label: e.target.value })}
                    onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    className="text-xs font-bold text-white/90 truncate flex-1 bg-transparent outline-none border-b border-transparent focus:border-amber-400/50 min-w-0"
                />
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/30 text-amber-200 font-mono">
                    {data.layers.length} layers
                </span>
            </div>

            {/* Stacked Preview */}
            <div className="p-3">
                {previewLayers.length > 0 ? (
                    <div className="relative aspect-video rounded-lg overflow-hidden bg-black/40 border border-white/5">
                        {previewLayers.map((layer) => (
                            <img
                                key={layer.id}
                                src={`${STATIC_BASE}/${layer.assetPath}`}
                                className="absolute inset-0 w-full h-full object-cover"
                                style={{
                                    zIndex: layer.zIndex,
                                    opacity: layer.opacity,
                                }}
                                alt={layer.label}
                                loading="lazy"
                            />
                        ))}
                        {/* AI Bounding Box Overlays */}
                        {hasAIData && sortedLayers.map((layer: any) => {
                            const sem = layer.semanticInfo;
                            if (!sem || sem.bboxW == null) return null;
                            const colors: Record<string, string> = {
                                furniture: '#f59e0b', floor: '#10b981', wall: '#6366f1',
                                ceiling: '#8b5cf6', decor: '#ec4899', nature: '#22c55e',
                                background: '#3b82f6', sky: '#38bdf8', door: '#f97316',
                                window: '#06b6d4', stairs: '#a855f7', prop: '#ef4444',
                            };
                            const color = colors[sem.category] || '#9ca3af';
                            return (
                                <div
                                    key={`bbox-${layer.id}`}
                                    className="absolute pointer-events-none"
                                    style={{
                                        left: `${sem.bboxX}%`,
                                        top: `${sem.bboxY}%`,
                                        width: `${sem.bboxW}%`,
                                        height: `${sem.bboxH}%`,
                                        border: `1.5px solid ${color}`,
                                        zIndex: 50 + (layer.zIndex || 0),
                                    }}
                                >
                                    <span
                                        className="absolute -top-[1px] left-0 px-0.5 text-[6px] font-bold leading-tight text-white truncate max-w-full"
                                        style={{ background: color, borderRadius: '0 0 2px 0' }}
                                    >
                                        {layer.label}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="aspect-video rounded-lg border border-dashed border-neutral-700 flex flex-col items-center justify-center gap-1">
                        <Clapperboard className="w-5 h-5 text-neutral-600" />
                        <span className="text-[10px] text-neutral-500">
                            Add layers in Inspector →
                        </span>
                    </div>
                )}
            </div>

            {/* Layer Count Summary */}
            <div className="px-3 pb-2 flex gap-2 text-[9px] flex-wrap">
                {bgLayers.length > 0 && (
                    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300">
                        <Image className="w-3 h-3" /> {bgLayers.length} BG
                    </span>
                )}
                {fgLayers.length > 0 && (
                    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300">
                        <Layers className="w-3 h-3" /> {fgLayers.length} FG
                    </span>
                )}
                {propLayers.length > 0 && (
                    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-pink-500/15 text-pink-300">
                        <Wrench className="w-3 h-3" /> {propLayers.length} Prop
                    </span>
                )}
                {data.layers.length === 0 && (
                    <span className="text-neutral-600">No layers</span>
                )}
            </div>

            {/* 🤖 AI Analyze Section */}
            {data.layers.length > 0 && (
                <div className="px-3 pb-3 space-y-1.5">
                    {/* State 1: Loading */}
                    {loadingModels && (
                        <div className="w-full text-center py-2 text-[9px] text-neutral-500 animate-pulse">
                            ⏳ Đang kiểm tra AI...
                        </div>
                    )}

                    {/* State 2: Needs API Key — inline input */}
                    {!loadingModels && needsKey && (
                        <div className="space-y-1.5">
                            <p className="text-[9px] text-amber-300 font-medium">🔑 Nhập Gemini API Key</p>
                            <div className="flex gap-1">
                                <input
                                    type="password"
                                    value={apiKeyInput}
                                    onChange={(e) => { e.stopPropagation(); setApiKeyInput(e.target.value); }}
                                    onClick={(e) => e.stopPropagation()}
                                    onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') handleSaveKey(); }}
                                    placeholder="AIzaSy..."
                                    className="flex-1 min-w-0 bg-black/40 border border-white/10 rounded px-2 py-1 text-[9px] text-white outline-none focus:border-amber-500/50 placeholder:text-neutral-600"
                                />
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleSaveKey(); }}
                                    disabled={savingKey || !apiKeyInput.trim()}
                                    className="shrink-0 px-2 py-1 rounded text-[9px] font-bold bg-amber-500/20 border border-amber-500/30 text-amber-300 hover:bg-amber-500/30 disabled:opacity-40"
                                >
                                    {savingKey ? '...' : 'Lưu'}
                                </button>
                            </div>
                            {keyError && <p className="text-[8px] text-red-400">{keyError}</p>}
                            <a
                                href="https://aistudio.google.com/apikey"
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="block text-[8px] text-blue-400 hover:text-blue-300 underline"
                            >
                                → Lấy API key tại Google AI Studio
                            </a>
                        </div>
                    )}

                    {/* State 3: Models loaded — select + analyze */}
                    {!loadingModels && !needsKey && availableModels.length > 0 && (
                        <>
                            <select
                                value={selectedModel}
                                onChange={(e) => { e.stopPropagation(); setSelectedModel(e.target.value); }}
                                onClick={(e) => e.stopPropagation()}
                                className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-[9px] text-neutral-300 outline-none focus:border-violet-500/50 cursor-pointer"
                            >
                                {availableModels.map(m => (
                                    <option key={m.id} value={m.id} disabled={m.status === 'no_access'}>
                                        {m.status === 'available' ? '✅' : m.status === 'rate_limited' ? '⚠️' : m.status === 'no_access' ? '🔒' : '❓'} {m.name}
                                    </option>
                                ))}
                            </select>
                            <button
                                onClick={(e) => { e.stopPropagation(); handleAnalyze(); }}
                                disabled={analyzing || !selectedModel}
                                className={`w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${analyzing
                                    ? 'bg-amber-500/20 border-amber-500/30 text-amber-300 animate-pulse cursor-wait'
                                    : 'bg-violet-500/10 border-violet-500/30 text-violet-300 hover:bg-violet-500/20 hover:border-violet-400/50 hover:shadow-lg hover:shadow-violet-500/10'
                                    }`}
                            >
                                <Sparkles className="w-3 h-3" />
                                {analyzing ? 'Đang phân tích...' : '🤖 AI Nhận diện'}
                            </button>
                        </>
                    )}
                </div>
            )}

            {/* AI Scene Description */}
            {sceneDesc && (
                <div className="px-3 pb-2">
                    <div className="rounded-lg bg-violet-500/10 border border-violet-500/20 px-2 py-1.5">
                        <p className="text-[8px] text-violet-300 leading-relaxed">{sceneDesc}</p>
                        <div className="flex gap-2 mt-1">
                            {(data as any).sceneType && <span className="text-[7px] text-neutral-500">📍 {(data as any).sceneType}</span>}
                            {(data as any).mood && <span className="text-[7px] text-neutral-500">🎨 {(data as any).mood}</span>}
                        </div>
                    </div>
                </div>
            )}

            {/* AI Layer Details — editable labels + coordinates + size */}
            {hasAIData && (
                <div className="px-3 pb-3">
                    <p className="text-[8px] text-neutral-500 font-bold mb-1">🧩 AI Elements (click tên để sửa)</p>
                    <div className="space-y-1 max-h-[200px] overflow-y-auto">
                        {sortedLayers.map((layer: any) => {
                            const sem = layer.semanticInfo;
                            if (!sem) return null;
                            return (
                                <div key={layer.id} className="rounded bg-white/5 border border-white/5 px-2 py-1">
                                    {/* Editable name */}
                                    <div className="flex items-center gap-1">
                                        <input
                                            type="text"
                                            defaultValue={layer.label}
                                            onClick={(e) => e.stopPropagation()}
                                            onBlur={(e) => handleRenameLayer(layer.id, e.target.value)}
                                            onKeyDown={(e) => {
                                                e.stopPropagation();
                                                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                            }}
                                            className="flex-1 min-w-0 bg-transparent text-[9px] text-white font-medium outline-none border-b border-transparent focus:border-violet-400/50 px-0"
                                        />
                                        {sem.category && (
                                            <span className="shrink-0 text-[7px] px-1 py-0.5 rounded bg-violet-500/20 text-violet-300">
                                                {sem.category}
                                            </span>
                                        )}
                                    </div>
                                    {/* Coordinates & Size */}
                                    <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5 text-[7px] text-neutral-500 font-mono">
                                        <span>📍 {Math.round(sem.bboxX ?? 0)}%, {Math.round(sem.bboxY ?? 0)}%</span>
                                        <span>📐 {Math.round(sem.bboxW ?? 100)}×{Math.round(sem.bboxH ?? 100)}%</span>
                                        <span>z:{layer.zIndex}</span>
                                        {layer.width > 0 && <span>{layer.width}×{layer.height}px</span>}
                                    </div>
                                    {/* Interaction icons */}
                                    <div className="flex gap-1 mt-0.5">
                                        {sem.canStandOn && <span className="text-[7px] px-1 rounded bg-green-500/15 text-green-300">🦶 đứng</span>}
                                        {sem.canSitOn && <span className="text-[7px] px-1 rounded bg-blue-500/15 text-blue-300">🪑 ngồi</span>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Output Handle */}
            <Handle
                type="source"
                position={Position.Right}
                className="!w-3 !h-3 !bg-amber-500 !border-2 !border-amber-300 !shadow-lg !shadow-amber-500/50"
            />
        </div>
    );
}

export const StageNode = memo(StageNodeComponent);
