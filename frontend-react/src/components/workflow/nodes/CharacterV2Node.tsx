import { memo, useEffect, useState, useRef, useCallback } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import type { CharacterV2NodeData, SceneNodeData } from '@/stores/useWorkflowStore';
import { useWorkflowStore } from '@/stores/useWorkflowStore';
import { useCharacterV2Store } from '@/stores/useCharacterV2Store';
import { User, GripVertical, Sparkles, Eye, Hand, Palette } from 'lucide-react';
import { API_BASE_URL } from '@/config/api';

type CharacterV2NodeType = Node<CharacterV2NodeData, 'characterV2'>;

function CharacterV2NodeComponent({ id, data, selected }: NodeProps<CharacterV2NodeType>) {
    const characters = useCharacterV2Store((s) => s.characters);
    const character = characters.find((c) => c.id === data.characterId);
    const nodes = useWorkflowStore((s) => s.nodes);
    const edges = useWorkflowStore((s) => s.edges);
    const sceneNode = nodes.find(n => n.type === 'scene');
    const ppu = (sceneNode?.data as SceneNodeData)?.pixelsPerUnit || 100;
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [blinkState, setBlinkState] = useState(false);

    // Get the current frame (first frame or active)
    const currentFrame = data.sequence?.[0];

    // Count stats
    const bodyPartCount = character?.body_parts ? Object.keys(character.body_parts).length : 0;
    const expressionType = character?.head?.expression_type;
    const expressionCount = expressionType === 'combinable'
        ? (character?.head?.mouths?.length || 0) * (character?.head?.eyes?.length || 0) * (character?.head?.eyebrows?.length || 0)
        : (character?.head?.expressions?.length || 0);
    const viewpointCount = character?.viewpoints ? Object.keys(character.viewpoints).length : 0;

    // Auto-blink animation
    useEffect(() => {
        if (!currentFrame?.autoBlink) return;
        const interval = setInterval(() => {
            setBlinkState(true);
            setTimeout(() => setBlinkState(false), currentFrame.blinkDuration || 200);
        }, (currentFrame.blinkInterval || 4) * 1000);
        return () => clearInterval(interval);
    }, [currentFrame?.autoBlink, currentFrame?.blinkInterval, currentFrame?.blinkDuration]);

    // Composite preview on canvas
    const compositePreview = useCallback(async () => {
        const canvas = canvasRef.current;
        if (!canvas || !character) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = 120;
        canvas.height = 120;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Determine which body parts to show
        const parts = character.body_parts;
        if (!parts) return;

        const canvasW = character.canvas_size[0];
        const canvasH = character.canvas_size[1];
        const scale = Math.min(120 / canvasW, 120 / canvasH);

        // Sort by z_order
        const sortedParts = Object.entries(parts).sort((a, b) => a[1].z_order - b[1].z_order);

        for (const [partName, partData] of sortedParts) {
            const selectedVariant = currentFrame?.bodyParts?.[partName] || partData.variants[0]?.name;
            const variant = partData.variants.find(v => v.name === selectedVariant) || partData.variants[0];
            if (!variant?.asset_path) continue;

            try {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                await new Promise<void>((resolve, reject) => {
                    img.onload = () => resolve();
                    img.onerror = () => reject();
                    img.src = `${API_BASE_URL}/static/${variant.asset_path}`;
                });
                ctx.drawImage(img, 0, 0, canvasW, canvasH, 0, 0, canvasW * scale, canvasH * scale);
            } catch {
                // Skip failed loads
            }
        }

        // Draw head expression
        if (character.head) {
            const head = character.head;
            let exprVariants: { asset_path: string }[] = [];

            if (head.expression_type === 'combinable') {
                // Draw mouth, eyes, eyebrows individually
                const mouthName = currentFrame?.expression?.mouth || head.mouths?.[0]?.name;
                const eyesName = blinkState ? '闭眼' : (currentFrame?.expression?.eyes || head.eyes?.[0]?.name);
                const eyebrowsName = currentFrame?.expression?.eyebrows || head.eyebrows?.[0]?.name;

                const mouth = head.mouths?.find(v => v.name === mouthName) || head.mouths?.[0];
                const eyes = head.eyes?.find(v => v.name === eyesName) || (blinkState ? head.eyes?.find(v => v.name.includes('闭')) : head.eyes?.[0]);
                const eyebrows = head.eyebrows?.find(v => v.name === eyebrowsName) || head.eyebrows?.[0];

                if (mouth) exprVariants.push(mouth);
                if (eyebrows) exprVariants.push(eyebrows);
                if (eyes) exprVariants.push(eyes);
            } else {
                // Pre-composed
                const presetName = currentFrame?.expression?.preset || head.merged_expressions?.[0]?.name || head.expressions?.[0]?.name;
                const expr = head.merged_expressions?.find(v => v.name === presetName)
                    || head.expressions?.find(v => v.name === presetName);
                if (expr) exprVariants.push(expr);
            }

            // Draw face shapes
            for (const face of head.face_shapes || []) {
                if (face.asset_path) {
                    try {
                        const img = new Image();
                        img.crossOrigin = 'anonymous';
                        await new Promise<void>((resolve, reject) => {
                            img.onload = () => resolve();
                            img.onerror = () => reject();
                            img.src = `${API_BASE_URL}/static/${face.asset_path}`;
                        });
                        ctx.drawImage(img, 0, 0, canvasW, canvasH, 0, 0, canvasW * scale, canvasH * scale);
                    } catch { /* skip */ }
                }
            }

            for (const v of exprVariants) {
                if (v.asset_path) {
                    try {
                        const img = new Image();
                        img.crossOrigin = 'anonymous';
                        await new Promise<void>((resolve, reject) => {
                            img.onload = () => resolve();
                            img.onerror = () => reject();
                            img.src = `${API_BASE_URL}/static/${v.asset_path}`;
                        });
                        ctx.drawImage(img, 0, 0, canvasW, canvasH, 0, 0, canvasW * scale, canvasH * scale);
                    } catch { /* skip */ }
                }
            }
        }
    }, [character, currentFrame, blinkState]);

    useEffect(() => {
        compositePreview();
    }, [compositePreview]);

    return (
        <div
            className={`rounded-xl overflow-hidden shadow-xl transition-all duration-200 min-w-[240px] ${selected
                ? 'ring-2 ring-emerald-400 shadow-emerald-500/30'
                : 'ring-1 ring-white/10 hover:ring-white/20'
                }`}
            style={{ background: 'linear-gradient(135deg, #0d2818 0%, #1a3a2a 100%)' }}
        >
            {/* Stage Input Handle */}
            <Handle
                type="target"
                position={Position.Left}
                id="stage-in"
                className="!w-3 !h-3 !bg-amber-500 !border-2 !border-amber-300 !shadow-lg !shadow-amber-500/50"
            />
            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10"
                style={{ background: 'linear-gradient(90deg, rgba(16,185,129,0.3), rgba(5,150,105,0.2))' }}
            >
                <GripVertical className="w-3 h-3 text-white/30 cursor-grab" />
                <Sparkles className="w-4 h-4 text-emerald-300" />
                <span className="text-xs font-bold text-white/90 truncate flex-1">
                    {data.characterName || 'Character V2'}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/30 text-emerald-200 font-mono">
                    V2
                </span>
            </div>

            {/* Connected Stage indicator */}
            {(() => {
                const stageEdge = edges.find((e: any) => e.targetHandle === 'stage-in' && e.target === id);
                const stageNode = stageEdge ? nodes.find(n => n.id === stageEdge.source) : null;
                return stageNode ? (
                    <div className="px-3 py-1 border-b border-white/5 bg-amber-500/5 flex items-center gap-1.5">
                        <span className="text-[9px]">🎬</span>
                        <span className="text-[9px] text-amber-300 truncate">{(stageNode.data as any).label}</span>
                    </div>
                ) : (
                    <div className="px-3 py-1 border-b border-white/5 flex items-center gap-1.5">
                        <span className="text-[9px] text-neutral-600">← Kết nối Stage</span>
                    </div>
                );
            })()}

            {/* Preview */}
            <div className="p-3">
                {character ? (
                    <div className="flex items-start gap-3">
                        <div className="w-[120px] h-[120px] rounded-lg overflow-hidden bg-black/40 flex items-center justify-center flex-shrink-0 border border-white/5 relative">
                            <canvas ref={canvasRef} className="w-full h-full object-contain" />
                            {currentFrame?.autoBlink && (
                                <div className={`absolute top-1 right-1 w-2 h-2 rounded-full transition-all duration-150 ${blinkState ? 'bg-yellow-400 scale-125' : 'bg-emerald-400/50'
                                    }`} title="Auto-blink active" />
                            )}
                        </div>
                        <div className="flex-1 min-w-0 space-y-1.5">
                            <div className="text-xs font-semibold text-white truncate">{character.name}</div>
                            <div className="flex items-center gap-1 text-[10px] text-emerald-300/70">
                                <Hand className="w-3 h-3" />
                                {bodyPartCount} parts
                            </div>
                            <div className="flex items-center gap-1 text-[10px] text-emerald-300/70">
                                <Palette className="w-3 h-3" />
                                {expressionCount} {expressionType === 'combinable' ? 'combos' : 'presets'}
                            </div>
                            {viewpointCount > 0 && (
                                <div className="flex items-center gap-1 text-[10px] text-emerald-300/70">
                                    <Eye className="w-3 h-3" />
                                    {viewpointCount} views
                                </div>
                            )}
                            <div className="text-[10px] text-neutral-500">
                                Pos: ({+(data.posX / ppu).toFixed(1)}, {+(data.posY / ppu).toFixed(1)})
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="text-xs text-neutral-500 text-center py-4 border border-dashed border-neutral-700 rounded-lg">
                        <Sparkles className="w-5 h-5 mx-auto mb-1 text-emerald-600" />
                        Select V2 character in Inspector →
                    </div>
                )}
            </div>

            {/* Sequence */}
            <div className="px-3 pb-3">
                <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">
                        Action Sequence
                    </span>
                    <span className="text-[10px] text-neutral-500">
                        {data.sequence?.length || 0} frames
                    </span>
                </div>
                <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-thin">
                    {(data.sequence?.length || 0) > 0 ? (
                        data.sequence.map((frame, i) => (
                            <div
                                key={frame.id}
                                className="w-10 h-10 rounded bg-black/40 border border-emerald-500/20 flex flex-col items-center justify-center flex-shrink-0"
                                title={`Frame ${i + 1}: ${frame.duration}s${frame.autoBlink ? ' 👁' : ''}`}
                            >
                                <span className="text-[8px] text-emerald-300 font-mono">F{i + 1}</span>
                                {frame.autoBlink && <Eye className="w-2.5 h-2.5 text-yellow-400/60" />}
                            </div>
                        ))
                    ) : (
                        <div className="w-full flex items-center justify-center gap-1 py-2 text-[10px] text-neutral-600 border border-dashed border-neutral-800 rounded">
                            <Sparkles className="w-3 h-3" /> Double-click to edit
                        </div>
                    )}
                </div>
            </div>

            {/* Output Handle */}
            <Handle
                type="source"
                position={Position.Right}
                className="!w-3 !h-3 !bg-emerald-500 !border-2 !border-emerald-300 !shadow-lg !shadow-emerald-500/50"
            />
        </div>
    );
}

export const CharacterV2Node = memo(CharacterV2NodeComponent);
