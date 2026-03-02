import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useWorkflowStore, type CharacterNodeData, type BackgroundNodeData, type SceneNodeData } from '@/store/useWorkflowStore';
import { useAppStore, STATIC_BASE } from '@/store/useAppStore';
import { API_BASE_URL } from '@/config/api';
import { X, User, Image, Film, Trash2, Upload, Check } from 'lucide-react';

const NodeInspector: React.FC = () => {
    const { nodes, selectedNodeId, updateNodeData, removeNode, selectNode } = useWorkflowStore();
    const characters = useAppStore((s) => s.characters);
    const selectedNode = nodes.find((n) => n.id === selectedNodeId);

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

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    {nodeType === 'character' && <User className="w-4 h-4 text-indigo-400" />}
                    {nodeType === 'background' && <Image className="w-4 h-4 text-emerald-400" />}
                    {nodeType === 'scene' && <Film className="w-4 h-4 text-amber-400" />}
                    <span className="text-xs font-bold text-white/90 capitalize">{nodeType} Properties</span>
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

                        <FieldGroup label="Position X">
                            <NumberInput
                                value={(data as CharacterNodeData).posX}
                                onChange={(v) => updateNodeData(selectedNode.id, { posX: v })}
                            />
                        </FieldGroup>
                        <FieldGroup label="Position Y">
                            <NumberInput
                                value={(data as CharacterNodeData).posY}
                                onChange={(v) => updateNodeData(selectedNode.id, { posY: v })}
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
                        <FieldGroup label="Scale">
                            <NumberInput
                                value={(data as CharacterNodeData).scale}
                                onChange={(v) => updateNodeData(selectedNode.id, { scale: v })}
                                step={0.1}
                                min={0.1}
                                max={5}
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

                {/* BACKGROUND-SPECIFIC */}
                {nodeType === 'background' && (
                    <>
                        <BackgroundPicker
                            selectedPath={(data as BackgroundNodeData).assetPath || ''}
                            onSelect={(path) => updateNodeData(selectedNode.id, { assetPath: path })}
                        />

                        {/* Background Preview */}
                        {(data as BackgroundNodeData).assetPath && (
                            <div className="w-full aspect-video bg-black/30 rounded-lg overflow-hidden border border-white/5">
                                <img
                                    src={`${STATIC_BASE}/${(data as BackgroundNodeData).assetPath}`}
                                    className="w-full h-full object-cover"
                                    alt="Background preview"
                                    loading="lazy"
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                />
                            </div>
                        )}

                        <FieldGroup label="Parallax Speed">
                            <NumberInput
                                value={(data as BackgroundNodeData).parallaxSpeed}
                                onChange={(v) => updateNodeData(selectedNode.id, { parallaxSpeed: v })}
                                step={0.1}
                                min={0}
                                max={2}
                            />
                        </FieldGroup>
                        <FieldGroup label="Blur">
                            <NumberInput
                                value={(data as BackgroundNodeData).blur}
                                onChange={(v) => updateNodeData(selectedNode.id, { blur: v })}
                                min={0}
                                max={20}
                            />
                        </FieldGroup>
                    </>
                )}

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
        </div>
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
// ── Background Library Picker ──
interface BgItem { name: string; path: string; url: string; size: number; }

function BackgroundPicker({ selectedPath, onSelect }: { selectedPath: string; onSelect: (path: string) => void }) {
    const [items, setItems] = useState<BgItem[]>([]);
    const [uploading, setUploading] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const fetchBgs = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/backgrounds`);
            if (res.ok) setItems(await res.json());
        } catch { /* ignore */ }
    }, []);

    useEffect(() => { fetchBgs(); }, [fetchBgs]);

    const handleUpload = useCallback(async (files: FileList | File[]) => {
        const formData = new FormData();
        for (const f of Array.from(files)) formData.append('files', f);
        setUploading(true);
        try {
            const res = await fetch(`${API_BASE_URL}/api/backgrounds/upload`, { method: 'POST', body: formData });
            if (res.ok) {
                const data = await res.json();
                if (data.uploaded?.length > 0) {
                    onSelect(data.uploaded[0].path);
                }
                await fetchBgs();
            }
        } catch { /* ignore */ }
        setUploading(false);
    }, [fetchBgs, onSelect]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files.length) handleUpload(e.dataTransfer.files);
    }, [handleUpload]);

    return (
        <div className="space-y-2">
            <label className="block text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Background Library</label>

            {/* Upload zone */}
            <div
                className={`w-full border-2 border-dashed rounded-lg p-3 text-center cursor-pointer transition-all ${dragOver ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-white/10 hover:border-white/20'
                    }`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
            >
                {uploading ? (
                    <div className="flex items-center justify-center gap-2 text-emerald-400">
                        <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                        <span className="text-[10px] font-medium">Uploading...</span>
                    </div>
                ) : (
                    <div className="flex items-center justify-center gap-2 text-neutral-500">
                        <Upload className="w-3.5 h-3.5" />
                        <span className="text-[10px]">Drop image or click to upload</span>
                    </div>
                )}
                <input
                    ref={inputRef}
                    type="file"
                    accept=".png,.jpg,.jpeg,.webp,.gif,.bmp"
                    multiple
                    className="hidden"
                    onChange={(e) => e.target.files && handleUpload(e.target.files)}
                />
            </div>

            {/* Thumbnail Grid */}
            {items.length > 0 ? (
                <div className="grid grid-cols-3 gap-1.5 max-h-48 overflow-y-auto scrollbar-thin">
                    {items.map((bg) => (
                        <button
                            key={bg.name}
                            onClick={() => onSelect(bg.path)}
                            className={`aspect-video rounded-lg overflow-hidden border-2 transition-all ${selectedPath === bg.path
                                    ? 'border-emerald-500 shadow-lg shadow-emerald-500/30 scale-[1.02]'
                                    : 'border-transparent hover:border-white/20'
                                }`}
                        >
                            <img
                                src={`${STATIC_BASE}/${bg.path}`}
                                className="w-full h-full object-cover"
                                alt={bg.name}
                                loading="lazy"
                            />
                            {selectedPath === bg.path && (
                                <div className="absolute inset-0 bg-emerald-500/20 flex items-center justify-center">
                                    <Check className="w-4 h-4 text-emerald-400" />
                                </div>
                            )}
                        </button>
                    ))}
                </div>
            ) : (
                <p className="text-[10px] text-neutral-600 text-center py-3">No backgrounds yet. Upload one above!</p>
            )}
        </div>
    );
}

export default NodeInspector;
