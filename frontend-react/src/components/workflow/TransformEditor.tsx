import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useCharacterV2Store } from '@/stores/useCharacterV2Store';
import { X, RotateCw, Maximize2, Move, Save, Undo2, Lock, Unlock, Layers } from 'lucide-react';
import { API_BASE_URL } from '@/config/api';

// ── Transform state per body part ──
export interface PartTransform {
    rotation: number;       // degrees
    scaleX: number;
    scaleY: number;
    offsetX: number;        // pixels
    offsetY: number;
    anchorX: number;        // 0-1 relative to part bbox
    anchorY: number;        // 0-1 relative to part bbox
    locked: boolean;
}

export interface TransformPreset {
    id: string;
    name: string;
    timestamp: string;
    characterId: string;
    transforms: Record<string, PartTransform>;
}

interface TransformEditorProps {
    characterId: string;
    initialTransforms?: Record<string, PartTransform>;
    onSave: (transforms: Record<string, PartTransform>) => void;
    onClose: () => void;
}

const PRESETS_KEY = 'animeStudio_transformPresets';

function loadPresets(): TransformPreset[] {
    try {
        return JSON.parse(localStorage.getItem(PRESETS_KEY) || '[]');
    } catch { return []; }
}

function savePresets(presets: TransformPreset[]) {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
}

export default function TransformEditor({ characterId, initialTransforms, onSave, onClose }: TransformEditorProps) {
    const character = useCharacterV2Store((s) => s.getCharacter(characterId));
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Transform state for each body part
    const [transforms, setTransforms] = useState<Record<string, PartTransform>>(() => {
        if (initialTransforms) return { ...initialTransforms };
        const init: Record<string, PartTransform> = {};
        if (character?.body_parts) {
            for (const name of Object.keys(character.body_parts)) {
                init[name] = { rotation: 0, scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0, anchorX: 0.5, anchorY: 0.5, locked: false };
            }
        }
        return init;
    });

    const [selectedPart, setSelectedPart] = useState<string | null>(null);
    const [tool, setTool] = useState<'rotate' | 'scale' | 'move'>('rotate');
    const [isDragging, setIsDragging] = useState(false);
    const dragStart = useRef({ x: 0, y: 0, value: 0 });
    const [presets, setPresets] = useState<TransformPreset[]>(loadPresets);
    const [presetName, setPresetName] = useState('');
    const [history, setHistory] = useState<Record<string, PartTransform>[]>([]);

    // Images cache
    const imagesRef = useRef<Map<string, HTMLImageElement>>(new Map());

    const updateTransform = useCallback((partName: string, patch: Partial<PartTransform>) => {
        setTransforms(prev => {
            setHistory(h => [...h.slice(-20), prev]);
            return { ...prev, [partName]: { ...prev[partName], ...patch } };
        });
    }, []);

    const undo = useCallback(() => {
        setHistory(prev => {
            if (prev.length === 0) return prev;
            const last = prev[prev.length - 1];
            setTransforms(last);
            return prev.slice(0, -1);
        });
    }, []);

    // Load images
    useEffect(() => {
        if (!character?.body_parts) return;
        const parts = character.body_parts;
        for (const [, partData] of Object.entries(parts)) {
            const variant = partData.variants[0];
            if (variant?.asset_path) {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.src = `${API_BASE_URL}/static/${variant.asset_path}`;
                imagesRef.current.set(variant.asset_path, img);
            }
        }
    }, [character]);

    // Render canvas
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !character) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const cw = character.canvas_size[0];
        const ch = character.canvas_size[1];
        const containerW = containerRef.current?.clientWidth || 600;
        const containerH = containerRef.current?.clientHeight || 500;
        const scale = Math.min(containerW / cw, containerH / ch) * 0.9;

        canvas.width = containerW;
        canvas.height = containerH;

        // Clear with checkerboard
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        for (let x = 0; x < canvas.width; x += 20) {
            for (let y = 0; y < canvas.height; y += 20) {
                if ((x + y) % 40 === 0) {
                    ctx.fillStyle = '#181818';
                    ctx.fillRect(x, y, 20, 20);
                }
            }
        }

        const offsetX = (canvas.width - cw * scale) / 2;
        const offsetY = (canvas.height - ch * scale) / 2;

        const parts = character.body_parts || {};
        const sorted = Object.entries(parts).sort((a, b) => a[1].z_order - b[1].z_order);

        for (const [partName, partData] of sorted) {
            const variant = partData.variants[0];
            if (!variant?.asset_path) continue;

            const img = imagesRef.current.get(variant.asset_path);
            if (!img || !img.complete) continue;

            const t = transforms[partName] || { rotation: 0, scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0, anchorX: 0.5, anchorY: 0.5, locked: false };

            ctx.save();

            // Calculate anchor point in canvas space
            // bbox = [left, top, width, height]
            const bLeft = variant.bbox?.[0] || 0;
            const bTop = variant.bbox?.[1] || 0;
            const bWidth = variant.bbox?.[2] || cw;
            const bHeight = variant.bbox?.[3] || ch;

            const ax = offsetX + bLeft * scale + bWidth * scale * t.anchorX;
            const ay = offsetY + bTop * scale + bHeight * scale * t.anchorY;

            ctx.translate(ax + t.offsetX * scale, ay + t.offsetY * scale);
            ctx.rotate((t.rotation * Math.PI) / 180);
            ctx.scale(t.scaleX, t.scaleY);
            ctx.translate(-ax, -ay);

            ctx.drawImage(img, 0, 0, cw, ch, offsetX, offsetY, cw * scale, ch * scale);

            // Draw selection indicator
            if (selectedPart === partName) {
                const bx = offsetX + bLeft * scale;
                const by = offsetY + bTop * scale;
                const bw = bWidth * scale;
                const bh = bHeight * scale;

                ctx.strokeStyle = '#10b981';
                ctx.lineWidth = 2;
                ctx.setLineDash([5, 5]);
                ctx.strokeRect(bx, by, bw, bh);
                ctx.setLineDash([]);

                // Anchor point
                ctx.fillStyle = '#f59e0b';
                ctx.beginPath();
                ctx.arc(ax + t.offsetX * scale, ay + t.offsetY * scale, 5, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.restore();
        }
    }, [character, transforms, selectedPart]);

    // Mouse handlers for transform manipulation
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (!selectedPart || transforms[selectedPart]?.locked) return;
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        setIsDragging(true);
        const t = transforms[selectedPart];
        dragStart.current = {
            x: e.clientX, y: e.clientY,
            value: tool === 'rotate' ? t.rotation : tool === 'scale' ? t.scaleX : t.offsetX,
        };
    }, [selectedPart, tool, transforms]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (!isDragging || !selectedPart || transforms[selectedPart]?.locked) return;
        const dx = e.clientX - dragStart.current.x;
        const dy = e.clientY - dragStart.current.y;

        if (tool === 'rotate') {
            updateTransform(selectedPart, { rotation: dragStart.current.value + dx * 0.5 });
        } else if (tool === 'scale') {
            const s = Math.max(0.1, dragStart.current.value + dx * 0.005);
            updateTransform(selectedPart, { scaleX: s, scaleY: s });
        } else {
            updateTransform(selectedPart, {
                offsetX: transforms[selectedPart].offsetX + dx * 0.5,
                offsetY: transforms[selectedPart].offsetY + dy * 0.5,
            });
            dragStart.current.x = e.clientX;
            dragStart.current.y = e.clientY;
        }
    }, [isDragging, selectedPart, tool, transforms, updateTransform]);

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
    }, []);

    // Save preset
    const handleSavePreset = useCallback(() => {
        if (!presetName.trim()) return;
        const preset: TransformPreset = {
            id: `tp_${Date.now()}`,
            name: presetName.trim(),
            timestamp: new Date().toISOString(),
            characterId,
            transforms: { ...transforms },
        };
        const updated = [preset, ...presets];
        setPresets(updated);
        savePresets(updated);
        setPresetName('');
    }, [presetName, characterId, transforms, presets]);

    const handleLoadPreset = useCallback((preset: TransformPreset) => {
        setHistory(h => [...h, transforms]);
        setTransforms(preset.transforms);
    }, [transforms]);

    const handleDeletePreset = useCallback((id: string) => {
        const updated = presets.filter(p => p.id !== id);
        setPresets(updated);
        savePresets(updated);
    }, [presets]);

    if (!character) {
        return (
            <ModalShell onClose={onClose}>
                <div className="text-neutral-400 text-center py-8">No character found</div>
            </ModalShell>
        );
    }

    const parts = character.body_parts || {};
    const sorted = Object.entries(parts).sort((a, b) => a[1].z_order - b[1].z_order);
    const currentT = selectedPart ? transforms[selectedPart] : null;
    const charPresets = presets.filter(p => p.characterId === characterId);

    return (
        <ModalShell onClose={onClose}>
            <div className="flex h-[80vh]">
                {/* Left: Canvas */}
                <div
                    ref={containerRef}
                    className="flex-1 relative cursor-crosshair"
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                >
                    <canvas ref={canvasRef} className="w-full h-full" />

                    {/* Tool bar overlay */}
                    <div className="absolute top-3 left-3 flex gap-1 bg-black/70 rounded-lg p-1 backdrop-blur">
                        {([
                            { id: 'rotate' as const, icon: RotateCw, label: 'Rotate' },
                            { id: 'scale' as const, icon: Maximize2, label: 'Scale' },
                            { id: 'move' as const, icon: Move, label: 'Move' },
                        ]).map(t => (
                            <button
                                key={t.id}
                                onClick={() => setTool(t.id)}
                                className={`p-2 rounded transition-all ${tool === t.id
                                    ? 'bg-emerald-500/30 text-emerald-300'
                                    : 'text-neutral-500 hover:text-white hover:bg-white/10'
                                    }`}
                                title={t.label}
                            >
                                <t.icon className="w-4 h-4" />
                            </button>
                        ))}
                        <div className="w-px h-8 bg-white/10 self-center mx-1" />
                        <button onClick={undo} className="p-2 rounded text-neutral-500 hover:text-white hover:bg-white/10 transition" title="Undo">
                            <Undo2 className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Selected part info */}
                    {selectedPart && currentT && (
                        <div className="absolute bottom-3 left-3 bg-black/80 backdrop-blur rounded-lg p-2 text-[10px] text-neutral-400 font-mono space-y-0.5">
                            <div className="text-emerald-300 font-bold text-xs">{selectedPart}</div>
                            <div>Rotation: {currentT.rotation.toFixed(1)}°</div>
                            <div>Scale: {currentT.scaleX.toFixed(2)}</div>
                            <div>Offset: ({currentT.offsetX.toFixed(0)}, {currentT.offsetY.toFixed(0)})</div>
                        </div>
                    )}
                </div>

                {/* Right: Controls */}
                <div className="w-[280px] flex flex-col border-l border-white/10 bg-black/30">
                    {/* Part List */}
                    <div className="p-3 border-b border-white/10">
                        <div className="flex items-center gap-2 mb-2">
                            <Layers className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-xs font-bold text-white">Body Parts</span>
                        </div>
                        <div className="space-y-1">
                            {sorted.map(([name]) => {
                                const t = transforms[name];
                                return (
                                    <button
                                        key={name}
                                        onClick={() => setSelectedPart(selectedPart === name ? null : name)}
                                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-all ${selectedPart === name
                                            ? 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/30'
                                            : 'text-neutral-400 hover:bg-white/5 hover:text-white'
                                            }`}
                                    >
                                        <span className="flex-1 text-left truncate">{name}</span>
                                        {t?.locked && <Lock className="w-3 h-3 text-red-400" />}
                                        {t && (t.rotation !== 0 || t.scaleX !== 1 || t.offsetX !== 0 || t.offsetY !== 0) && (
                                            <span className="w-2 h-2 rounded-full bg-amber-400" title="Modified" />
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Selected Part Controls */}
                    {selectedPart && currentT && (
                        <div className="p-3 border-b border-white/10 space-y-3 flex-1 overflow-auto">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-emerald-300">{selectedPart}</span>
                                <button
                                    onClick={() => updateTransform(selectedPart, { locked: !currentT.locked })}
                                    className={`p-1 rounded transition ${currentT.locked ? 'text-red-400 bg-red-500/10' : 'text-neutral-500 hover:text-white'}`}
                                    title={currentT.locked ? 'Unlock' : 'Lock'}
                                >
                                    {currentT.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                                </button>
                            </div>

                            <SliderControl label="Rotation" value={currentT.rotation} min={-180} max={180} step={1} unit="°"
                                onChange={(v) => updateTransform(selectedPart, { rotation: v })} disabled={currentT.locked} />
                            <SliderControl label="Scale X" value={currentT.scaleX} min={0.1} max={3} step={0.05}
                                onChange={(v) => updateTransform(selectedPart, { scaleX: v })} disabled={currentT.locked} />
                            <SliderControl label="Scale Y" value={currentT.scaleY} min={0.1} max={3} step={0.05}
                                onChange={(v) => updateTransform(selectedPart, { scaleY: v })} disabled={currentT.locked} />
                            <SliderControl label="Offset X" value={currentT.offsetX} min={-500} max={500} step={1} unit="px"
                                onChange={(v) => updateTransform(selectedPart, { offsetX: v })} disabled={currentT.locked} />
                            <SliderControl label="Offset Y" value={currentT.offsetY} min={-500} max={500} step={1} unit="px"
                                onChange={(v) => updateTransform(selectedPart, { offsetY: v })} disabled={currentT.locked} />

                            <button
                                onClick={() => updateTransform(selectedPart, { rotation: 0, scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 })}
                                className="w-full py-1.5 text-[10px] font-bold text-neutral-400 bg-white/5 hover:bg-white/10 rounded transition"
                                disabled={currentT.locked}
                            >
                                Reset Transform
                            </button>
                        </div>
                    )}

                    {/* Presets */}
                    <div className="p-3 border-t border-white/10">
                        <span className="text-[10px] font-bold text-neutral-400 uppercase block mb-2">Presets</span>
                        <div className="flex gap-1 mb-2">
                            <input
                                type="text"
                                value={presetName}
                                onChange={(e) => setPresetName(e.target.value)}
                                placeholder="Preset name..."
                                className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-[10px] text-white outline-none"
                                onKeyDown={(e) => e.key === 'Enter' && handleSavePreset()}
                            />
                            <button onClick={handleSavePreset} className="px-2 py-1 bg-emerald-600/30 text-emerald-300 rounded text-[10px] font-bold hover:bg-emerald-600/50 transition">
                                <Save className="w-3 h-3" />
                            </button>
                        </div>
                        <div className="max-h-32 overflow-auto space-y-1 scrollbar-thin">
                            {charPresets.map(p => (
                                <div key={p.id} className="flex items-center gap-1 text-[10px]">
                                    <button
                                        onClick={() => handleLoadPreset(p)}
                                        className="flex-1 text-left px-2 py-1 bg-white/5 rounded text-neutral-400 hover:text-white hover:bg-white/10 transition truncate"
                                    >
                                        {p.name}
                                    </button>
                                    <button
                                        onClick={() => handleDeletePreset(p.id)}
                                        className="px-1 py-1 text-red-500/50 hover:text-red-400 transition"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            ))}
                            {charPresets.length === 0 && (
                                <p className="text-[10px] text-neutral-600 text-center py-2">No presets saved</p>
                            )}
                        </div>
                    </div>

                    {/* Action bar */}
                    <div className="p-3 border-t border-white/10 flex gap-2">
                        <button onClick={onClose} className="flex-1 py-2 bg-white/5 text-neutral-400 rounded-lg text-xs font-bold hover:bg-white/10 transition">
                            Cancel
                        </button>
                        <button
                            onClick={() => onSave(transforms)}
                            className="flex-1 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-500 transition"
                        >
                            Apply
                        </button>
                    </div>
                </div>
            </div>
        </ModalShell>
    );
}

// ── Sub-components ──

function SliderControl({ label, value, min, max, step, unit, onChange, disabled }: {
    label: string; value: number; min: number; max: number; step: number; unit?: string;
    onChange: (v: number) => void; disabled?: boolean;
}) {
    return (
        <div className={disabled ? 'opacity-40 pointer-events-none' : ''}>
            <div className="flex justify-between mb-0.5">
                <span className="text-[10px] text-neutral-500">{label}</span>
                <span className="text-[10px] text-neutral-400 font-mono">{value.toFixed(step < 1 ? 2 : 0)}{unit || ''}</span>
            </div>
            <input
                type="range"
                min={min} max={max} step={step}
                value={value}
                onChange={(e) => onChange(parseFloat(e.target.value))}
                className="w-full h-1 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-emerald-400"
            />
        </div>
    );
}

function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div
                className="relative w-[1000px] max-w-[95vw] rounded-2xl overflow-hidden shadow-2xl border border-white/10 flex flex-col"
                style={{ background: 'linear-gradient(135deg, #111118 0%, #0d1117 100%)' }}
            >
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/10"
                    style={{ background: 'linear-gradient(90deg, rgba(16,185,129,0.15), rgba(245,158,11,0.1))' }}
                >
                    <div className="flex items-center gap-2">
                        <RotateCw className="w-4 h-4 text-amber-400" />
                        <span className="text-sm font-bold text-white">Transform Editor</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">Joint Rotation</span>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-lg transition">
                        <X className="w-4 h-4 text-neutral-400" />
                    </button>
                </div>
                <div className="flex-1 overflow-hidden">
                    {children}
                </div>
            </div>
        </div>
    );
}
