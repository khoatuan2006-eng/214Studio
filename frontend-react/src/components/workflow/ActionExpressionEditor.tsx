import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useCharacterV2Store, type PartVariant } from '@/stores/useCharacterV2Store';
import { useWorkflowStore, type V2PoseFrame, type CharacterV2NodeData } from '@/stores/useWorkflowStore';
import { X, Plus, Eye, Hand, Palette, Sparkles, RotateCw } from 'lucide-react';
import { API_BASE_URL } from '@/config/api';
import TransformEditor from './TransformEditor';

interface ActionExpressionEditorProps {
    nodeId: string;
    onClose: () => void;
}

export default function ActionExpressionEditor({ nodeId, onClose }: ActionExpressionEditorProps) {
    const node = useWorkflowStore((s) => s.nodes.find((n) => n.id === nodeId));
    const updateNodeData = useWorkflowStore((s) => s.updateNodeData);
    const characters = useCharacterV2Store((s) => s.characters);

    const data = node?.data as CharacterV2NodeData | undefined;
    const character = characters.find((c) => c.id === data?.characterId);

    const [activeTab, setActiveTab] = useState<'body' | 'expression' | 'settings'>('body');
    const [activeFrameIdx, setActiveFrameIdx] = useState(0);
    const [showTransformEditor, setShowTransformEditor] = useState(false);
    const previewCanvasRef = useRef<HTMLCanvasElement>(null);

    // Current frame
    const frames = data?.sequence || [];
    const currentFrame: V2PoseFrame | undefined = frames[activeFrameIdx];

    // ── Frame operations ──

    const addFrame = useCallback(() => {
        if (!data || !character) return;
        const head = character.head;
        const newFrame: V2PoseFrame = {
            id: `v2f_${Date.now()}`,
            duration: 2,
            bodyParts: Object.fromEntries(
                Object.entries(character.body_parts || {}).map(([name, bp]) => [name, bp.variants[0]?.name || ''])
            ),
            expression: {
                type: head?.expression_type || 'pre_composed',
                ...(head?.expression_type === 'combinable'
                    ? { mouth: head.mouths?.[0]?.name, eyes: head.eyes?.[0]?.name, eyebrows: head.eyebrows?.[0]?.name }
                    : { preset: head?.merged_expressions?.[0]?.name || head?.expressions?.[0]?.name }
                ),
            },
            viewpoint: data.activeViewpoint || undefined,
            transition: 'cut',
            transitionDuration: 0.3,
            autoBlink: true,
            blinkInterval: 4,
            blinkDuration: 200,
        };
        const newSeq = [...frames, newFrame];
        updateNodeData(nodeId, { sequence: newSeq });
        setActiveFrameIdx(newSeq.length - 1);
    }, [data, character, frames, nodeId, updateNodeData]);

    const deleteFrame = useCallback((idx: number) => {
        const newSeq = frames.filter((_, i) => i !== idx);
        updateNodeData(nodeId, { sequence: newSeq });
        setActiveFrameIdx(Math.min(activeFrameIdx, Math.max(0, newSeq.length - 1)));
    }, [frames, nodeId, updateNodeData, activeFrameIdx]);

    const updateFrame = useCallback((idx: number, patch: Partial<V2PoseFrame>) => {
        const newSeq = frames.map((f, i) => i === idx ? { ...f, ...patch } : f);
        updateNodeData(nodeId, { sequence: newSeq });
    }, [frames, nodeId, updateNodeData]);

    const setBodyPart = useCallback((partName: string, variantName: string) => {
        if (currentFrame) {
            updateFrame(activeFrameIdx, {
                bodyParts: { ...currentFrame.bodyParts, [partName]: variantName }
            });
        }
    }, [currentFrame, activeFrameIdx, updateFrame]);

    const setExpression = useCallback((patch: Partial<V2PoseFrame['expression']>) => {
        if (currentFrame) {
            updateFrame(activeFrameIdx, {
                expression: { ...currentFrame.expression, ...patch }
            });
        }
    }, [currentFrame, activeFrameIdx, updateFrame]);

    // ── Live preview composite ──

    useEffect(() => {
        const canvas = previewCanvasRef.current;
        if (!canvas || !character || !currentFrame) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const cw = character.canvas_size[0];
        const ch = character.canvas_size[1];
        canvas.width = 400;
        canvas.height = Math.round(400 * (ch / cw));
        const scale = canvas.width / cw;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const loadAndDraw = async () => {
            // Body parts sorted by z_order
            const parts = character.body_parts || {};
            const sorted = Object.entries(parts).sort((a, b) => a[1].z_order - b[1].z_order);

            for (const [partName, partData] of sorted) {
                const variantName = currentFrame.bodyParts[partName] || partData.variants[0]?.name;
                const variant = partData.variants.find(v => v.name === variantName) || partData.variants[0];
                if (!variant?.asset_path) continue;

                try {
                    const img = await loadImage(`${API_BASE_URL}/static/${variant.asset_path}`);
                    ctx.drawImage(img, 0, 0, cw, ch, 0, 0, cw * scale, ch * scale);
                } catch { /* skip */ }
            }

            // Head: face + expression
            const head = character.head;
            if (head) {
                for (const face of head.face_shapes || []) {
                    if (face.asset_path) {
                        try {
                            const img = await loadImage(`${API_BASE_URL}/static/${face.asset_path}`);
                            ctx.drawImage(img, 0, 0, cw, ch, 0, 0, cw * scale, ch * scale);
                        } catch { /* skip */ }
                    }
                }

                if (head.expression_type === 'combinable') {
                    const eyebrow = head.eyebrows?.find(v => v.name === currentFrame.expression.eyebrows) || head.eyebrows?.[0];
                    const eyes = head.eyes?.find(v => v.name === currentFrame.expression.eyes) || head.eyes?.[0];
                    const mouth = head.mouths?.find(v => v.name === currentFrame.expression.mouth) || head.mouths?.[0];
                    for (const v of [eyebrow, eyes, mouth]) {
                        if (v?.asset_path) {
                            try {
                                const img = await loadImage(`${API_BASE_URL}/static/${v.asset_path}`);
                                ctx.drawImage(img, 0, 0, cw, ch, 0, 0, cw * scale, ch * scale);
                            } catch { /* skip */ }
                        }
                    }
                } else {
                    const name = currentFrame.expression.preset;
                    const expr = head.merged_expressions?.find(v => v.name === name)
                        || head.expressions?.find(v => v.name === name);
                    if (expr?.asset_path) {
                        try {
                            const img = await loadImage(`${API_BASE_URL}/static/${expr.asset_path}`);
                            ctx.drawImage(img, 0, 0, cw, ch, 0, 0, cw * scale, ch * scale);
                        } catch { /* skip */ }
                    }
                }
            }

            // Hair
            if (character.head?.hairstyles) {
                for (const hair of character.head.hairstyles) {
                    if (hair.asset_path) {
                        try {
                            const img = await loadImage(`${API_BASE_URL}/static/${hair.asset_path}`);
                            ctx.drawImage(img, 0, 0, cw, ch, 0, 0, cw * scale, ch * scale);
                        } catch { /* skip */ }
                    }
                }
            }
        };

        loadAndDraw();
    }, [character, currentFrame]);

    if (!data || !character) {
        return (
            <ModalShell onClose={onClose}>
                <div className="text-neutral-400 text-center py-8">
                    No V2 character selected. Choose one in the Node Inspector first.
                </div>
            </ModalShell>
        );
    }

    const head = character.head;

    return (
        <>
            <ModalShell onClose={onClose}>
                <div className="flex h-full">
                    {/* Left: Preview */}
                    <div className="w-[420px] flex flex-col border-r border-white/10 bg-black/30">
                        <div className="p-3 border-b border-white/10">
                            <h3 className="text-sm font-bold text-white">{character.name}</h3>
                            <p className="text-[10px] text-neutral-500">
                                {character.canvas_size[0]}×{character.canvas_size[1]} • {character.psd_type}
                            </p>
                        </div>
                        <div className="flex-1 flex items-center justify-center p-4">
                            <canvas
                                ref={previewCanvasRef}
                                className="max-w-full max-h-full rounded-lg border border-white/5"
                                style={{ background: 'repeating-conic-gradient(#222 0% 25%, #1a1a1a 0% 50%) 50% / 20px 20px' }}
                            />
                        </div>
                        {/* Transform Editor button */}
                        <div className="px-3 pb-3">
                            <button
                                onClick={() => setShowTransformEditor(true)}
                                className="w-full py-2 bg-amber-500/10 border border-amber-500/20 text-amber-300 rounded-lg text-xs font-bold hover:bg-amber-500/20 transition flex items-center justify-center gap-2"
                            >
                                <RotateCw className="w-3.5 h-3.5" />
                                Transform Editor — Rotate Joints
                            </button>
                        </div>
                    </div>

                    {/* Right: Editor */}
                    <div className="flex-1 flex flex-col min-w-[400px]">
                        {/* Tabs */}
                        <div className="flex border-b border-white/10">
                            {[
                                { id: 'body' as const, icon: Hand, label: 'Body Parts' },
                                { id: 'expression' as const, icon: Palette, label: 'Expression' },
                                { id: 'settings' as const, icon: RotateCw, label: 'Settings' },
                            ].map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold transition-all border-b-2 ${activeTab === tab.id
                                        ? 'text-emerald-300 border-emerald-400 bg-emerald-400/5'
                                        : 'text-neutral-500 border-transparent hover:text-white hover:bg-white/5'
                                        }`}
                                >
                                    <tab.icon className="w-3.5 h-3.5" />
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {/* Tab Content */}
                        <div className="flex-1 overflow-auto p-4">
                            {!currentFrame ? (
                                <div className="text-center py-8">
                                    <p className="text-neutral-500 text-sm mb-3">No frames yet. Add one to start editing.</p>
                                    <button onClick={addFrame} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-500 transition">
                                        <Plus className="w-3 h-3 inline mr-1" /> Add Frame
                                    </button>
                                </div>
                            ) : activeTab === 'body' ? (
                                <BodyPartSelector
                                    bodyParts={character.body_parts || {}}
                                    selected={currentFrame.bodyParts}
                                    onSelect={setBodyPart}
                                />
                            ) : activeTab === 'expression' ? (
                                <ExpressionSelector
                                    head={head}
                                    expression={currentFrame.expression}
                                    onUpdate={setExpression}
                                />
                            ) : (
                                <SettingsPanel
                                    frame={currentFrame}
                                    onUpdate={(patch) => updateFrame(activeFrameIdx, patch)}
                                    viewpoints={character.viewpoints ? Object.keys(character.viewpoints) : []}
                                />
                            )}
                        </div>

                        {/* Frame timeline */}
                        <div className="border-t border-white/10 p-3">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-[10px] font-bold text-neutral-400 uppercase">Frames</span>
                                <button onClick={addFrame} className="ml-auto px-2 py-1 bg-emerald-600/30 text-emerald-300 rounded text-[10px] font-bold hover:bg-emerald-600/50 transition flex items-center gap-1">
                                    <Plus className="w-3 h-3" /> Add
                                </button>
                            </div>
                            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                                {frames.map((frame, i) => (
                                    <div
                                        key={frame.id}
                                        onClick={() => setActiveFrameIdx(i)}
                                        className={`relative min-w-[50px] px-2 py-1.5 rounded cursor-pointer text-center transition-all ${i === activeFrameIdx
                                            ? 'bg-emerald-500/30 border border-emerald-400/50 text-emerald-200'
                                            : 'bg-white/5 border border-white/5 text-neutral-500 hover:bg-white/10'
                                            }`}
                                    >
                                        <div className="text-[10px] font-bold">F{i + 1}</div>
                                        <div className="text-[8px]">{frame.duration}s</div>
                                        {frame.autoBlink && <Eye className="w-2.5 h-2.5 absolute top-0.5 right-0.5 text-yellow-400/50" />}
                                        {frames.length > 1 && i === activeFrameIdx && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); deleteFrame(i); }}
                                                className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-400"
                                            >
                                                <X className="w-2.5 h-2.5 text-white" />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </ModalShell>

            {/* Transform Editor overlay */}
            {showTransformEditor && character && (
                <TransformEditor
                    characterId={character.id}
                    onSave={(transforms) => {
                        console.log('Saved transforms:', transforms);
                        setShowTransformEditor(false);
                    }}
                    onClose={() => setShowTransformEditor(false)}
                />
            )}
        </>
    );
}

// ── Sub-components ──

function BodyPartSelector({ bodyParts, selected, onSelect }: {
    bodyParts: Record<string, { name: string; z_order: number; variants: PartVariant[] }>;
    selected: Record<string, string>;
    onSelect: (part: string, variant: string) => void;
}) {
    const sorted = Object.entries(bodyParts).sort((a, b) => a[1].z_order - b[1].z_order);

    return (
        <div className="space-y-4">
            {sorted.map(([partName, partData]) => (
                <div key={partName}>
                    <div className="flex items-center gap-2 mb-2">
                        <Hand className="w-3 h-3 text-emerald-400" />
                        <span className="text-xs font-bold text-white">{partName}</span>
                        <span className="text-[10px] text-neutral-500">{partData.variants.length} variants</span>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                        {partData.variants.map((v) => (
                            <button
                                key={v.name}
                                onClick={() => onSelect(partName, v.name)}
                                className={`px-2 py-1.5 rounded text-[10px] font-medium transition-all truncate ${selected[partName] === v.name
                                    ? 'bg-emerald-500/30 text-emerald-200 ring-1 ring-emerald-400/50'
                                    : 'bg-white/5 text-neutral-400 hover:bg-white/10 hover:text-white'
                                    }`}
                                title={v.name}
                            >
                                {v.name}
                            </button>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}

function ExpressionSelector({ head, expression, onUpdate }: {
    head: any;
    expression: V2PoseFrame['expression'];
    onUpdate: (patch: Partial<V2PoseFrame['expression']>) => void;
}) {
    if (!head) return <p className="text-neutral-500 text-xs">No expression data</p>;

    if (head.expression_type === 'combinable') {
        return (
            <div className="space-y-4">
                {/* Mouth */}
                <PartPicker
                    label="嘴 Mouth"
                    variants={head.mouths || []}
                    selected={expression.mouth}
                    onSelect={(name) => onUpdate({ mouth: name })}
                />
                {/* Eyes */}
                <PartPicker
                    label="眼睛 Eyes"
                    variants={head.eyes || []}
                    selected={expression.eyes}
                    onSelect={(name) => onUpdate({ eyes: name })}
                />
                {/* Eyebrows */}
                <PartPicker
                    label="眉毛 Eyebrows"
                    variants={head.eyebrows || []}
                    selected={expression.eyebrows}
                    onSelect={(name) => onUpdate({ eyebrows: name })}
                />
            </div>
        );
    }

    // Pre-composed
    const allExprs = head.merged_expressions?.length ? head.merged_expressions : (head.expressions || []);
    return (
        <PartPicker
            label="表情 Expression"
            variants={allExprs}
            selected={expression.preset}
            onSelect={(name) => onUpdate({ preset: name })}
        />
    );
}

function PartPicker({ label, variants, selected, onSelect }: {
    label: string;
    variants: PartVariant[];
    selected?: string;
    onSelect: (name: string) => void;
}) {
    return (
        <div>
            <div className="flex items-center gap-2 mb-2">
                <Palette className="w-3 h-3 text-emerald-400" />
                <span className="text-xs font-bold text-white">{label}</span>
                <span className="text-[10px] text-neutral-500">{variants.length}</span>
            </div>
            <div className="grid grid-cols-5 gap-1">
                {variants.map((v) => (
                    <button
                        key={v.name}
                        onClick={() => onSelect(v.name)}
                        className={`px-1.5 py-1 rounded text-[10px] font-medium transition-all truncate ${selected === v.name
                            ? 'bg-emerald-500/30 text-emerald-200 ring-1 ring-emerald-400/50'
                            : 'bg-white/5 text-neutral-400 hover:bg-white/10 hover:text-white'
                            }`}
                        title={v.name}
                    >
                        {v.name}
                    </button>
                ))}
            </div>
        </div>
    );
}

function SettingsPanel({ frame, onUpdate, viewpoints }: {
    frame: V2PoseFrame;
    onUpdate: (patch: Partial<V2PoseFrame>) => void;
    viewpoints: string[];
}) {
    return (
        <div className="space-y-4">
            {/* Duration */}
            <div>
                <label className="text-xs font-bold text-white block mb-1">Duration (seconds)</label>
                <input
                    type="number"
                    value={frame.duration}
                    onChange={(e) => onUpdate({ duration: Math.max(0.1, parseFloat(e.target.value) || 1) })}
                    min={0.1}
                    step={0.1}
                    className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white"
                />
            </div>

            {/* Transition */}
            <div>
                <label className="text-xs font-bold text-white block mb-1">Transition</label>
                <select
                    value={frame.transition}
                    onChange={(e) => onUpdate({ transition: e.target.value as 'cut' | 'crossfade' })}
                    className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white"
                >
                    <option value="cut">Cut</option>
                    <option value="crossfade">Crossfade</option>
                </select>
            </div>

            {/* Viewpoint */}
            {viewpoints.length > 0 && (
                <div>
                    <label className="text-xs font-bold text-white block mb-1">Viewpoint</label>
                    <select
                        value={frame.viewpoint || ''}
                        onChange={(e) => onUpdate({ viewpoint: e.target.value || undefined })}
                        className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white"
                    >
                        <option value="">Default (Main)</option>
                        {viewpoints.map((vp) => (
                            <option key={vp} value={vp}>{vp}</option>
                        ))}
                    </select>
                </div>
            )}

            {/* Auto Blink */}
            <div className="border-t border-white/10 pt-4">
                <div className="flex items-center gap-2 mb-3">
                    <Eye className="w-4 h-4 text-yellow-400" />
                    <span className="text-xs font-bold text-white">Auto Eye Blink</span>
                    <label className="ml-auto relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            checked={frame.autoBlink}
                            onChange={(e) => onUpdate({ autoBlink: e.target.checked })}
                            className="sr-only peer"
                        />
                        <div className="w-8 h-4 bg-neutral-700 peer-focus:ring-2 peer-focus:ring-emerald-400 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-500"></div>
                    </label>
                </div>

                {frame.autoBlink && (
                    <div className="space-y-2 pl-6">
                        <div>
                            <label className="text-[10px] text-neutral-400 block mb-1">Blink Interval: {frame.blinkInterval}s</label>
                            <input
                                type="range"
                                min={2}
                                max={10}
                                step={0.5}
                                value={frame.blinkInterval}
                                onChange={(e) => onUpdate({ blinkInterval: parseFloat(e.target.value) })}
                                className="w-full h-1 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-yellow-400"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] text-neutral-400 block mb-1">Blink Duration: {frame.blinkDuration}ms</label>
                            <input
                                type="range"
                                min={100}
                                max={500}
                                step={50}
                                value={frame.blinkDuration}
                                onChange={(e) => onUpdate({ blinkDuration: parseInt(e.target.value) })}
                                className="w-full h-1 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-yellow-400"
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Modal shell ──

function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div
                className="relative w-[900px] max-h-[80vh] rounded-2xl overflow-hidden shadow-2xl border border-white/10 flex flex-col"
                style={{ background: 'linear-gradient(135deg, #111118 0%, #0d1117 100%)' }}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/10"
                    style={{ background: 'linear-gradient(90deg, rgba(16,185,129,0.15), rgba(5,150,105,0.1))' }}
                >
                    <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-emerald-400" />
                        <span className="text-sm font-bold text-white">Action & Expression Editor</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">V2</span>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-lg transition">
                        <X className="w-4 h-4 text-neutral-400" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-hidden flex">
                    {children}
                </div>
            </div>
        </div>
    );
}

// ── Helpers ──

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Failed to load: ${src}`));
        img.src = src;
    });
}
