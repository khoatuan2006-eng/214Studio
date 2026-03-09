import { memo, useMemo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import type { StageNodeData } from '@/stores/useWorkflowStore';
import { STATIC_BASE } from '@/stores/useAppStore';
import { GripVertical, Clapperboard, Layers, Image, Wrench } from 'lucide-react';

type StageNodeType = Node<StageNodeData, 'stage'>;

/**
 * Stage Node — unified "Film Set" builder.
 * Combines Background + Foreground + Prop layers in one node.
 */
function StageNodeComponent({ data, selected }: NodeProps<StageNodeType>) {
    const sortedLayers = useMemo(
        () => [...data.layers].sort((a, b) => a.zIndex - b.zIndex),
        [data.layers]
    );

    const bgLayers = sortedLayers.filter((l) => l.type === 'background');
    const fgLayers = sortedLayers.filter((l) => l.type === 'foreground');
    const propLayers = sortedLayers.filter((l) => l.type === 'prop');

    // Show up to 4 thumbnails stacked for preview
    const previewLayers = sortedLayers.filter((l) => l.assetPath && l.visible).slice(0, 4);

    return (
        <div
            className={`rounded-xl overflow-hidden shadow-2xl transition-all duration-200 min-w-[220px] max-w-[260px] ${selected
                ? 'ring-2 ring-amber-400 shadow-amber-500/30'
                : 'ring-1 ring-white/10 hover:ring-white/20'
                }`}
            style={{ background: 'linear-gradient(135deg, #2a1f0e 0%, #1a1a2e 100%)' }}
        >
            {/* Header */}
            <div
                className="flex items-center gap-2 px-3 py-2 border-b border-white/10"
                style={{ background: 'linear-gradient(90deg, rgba(245,158,11,0.3), rgba(217,119,6,0.15))' }}
            >
                <GripVertical className="w-3 h-3 text-white/30 cursor-grab" />
                <Clapperboard className="w-4 h-4 text-amber-300" />
                <span className="text-xs font-bold text-white/90 truncate flex-1">
                    {data.label}
                </span>
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
                                    transform: `scale(${layer.scale / 1920}) translate(${(layer.posX - 960) / 10}px, ${(layer.posY - 540) / 10}px)`,
                                }}
                                alt={layer.label}
                                loading="lazy"
                            />
                        ))}
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
            <div className="px-3 pb-3 flex gap-2 text-[9px] flex-wrap">
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

