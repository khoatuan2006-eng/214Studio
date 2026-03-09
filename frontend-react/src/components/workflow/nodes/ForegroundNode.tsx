import { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import type { ForegroundNodeData, SceneNodeData } from '@/stores/useWorkflowStore';
import { useWorkflowStore } from '@/stores/useWorkflowStore';
import { STATIC_BASE } from '@/stores/useAppStore';
import LazyImage from '@/components/ui/LazyImage';
import { Layers, GripVertical } from 'lucide-react';

type ForegroundNodeType = Node<ForegroundNodeData, 'foreground'>;

function ForegroundNodeComponent({ data, selected }: NodeProps<ForegroundNodeType>) {
    const nodes = useWorkflowStore((s) => s.nodes);
    const sceneNode = nodes.find(n => n.type === 'scene');
    const ppu = (sceneNode?.data as SceneNodeData)?.pixelsPerUnit || 100;
    const assetUrl = data.assetPath
        ? `${STATIC_BASE}/${data.assetPath}`
        : '';

    return (
        <div
            className={`rounded-xl overflow-hidden shadow-xl transition-all duration-200 min-w-[200px] ${selected
                ? 'ring-2 ring-cyan-400 shadow-cyan-500/30'
                : 'ring-1 ring-white/10 hover:ring-white/20'
                }`}
            style={{ background: 'linear-gradient(135deg, #1b3e4e 0%, #1a1a2e 100%)' }}
        >
            {/* Header */}
            <div
                className="flex items-center gap-2 px-3 py-2 border-b border-white/10"
                style={{ background: 'linear-gradient(90deg, rgba(6,182,212,0.3), rgba(34,211,238,0.15))' }}
            >
                <GripVertical className="w-3 h-3 text-white/30 cursor-grab" />
                <Layers className="w-4 h-4 text-cyan-300" />
                <span className="text-xs font-bold text-white/90 truncate flex-1">
                    {data.label}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/30 text-cyan-200 font-mono">
                    FG
                </span>
            </div>

            {/* Preview */}
            <div className="p-3">
                {assetUrl ? (
                    <div className="aspect-video rounded-lg overflow-hidden bg-black/40 border border-white/5">
                        <LazyImage src={assetUrl} className="w-full h-full object-cover" alt={data.label} />
                    </div>
                ) : (
                    <div className="aspect-video rounded-lg border border-dashed border-neutral-700 flex items-center justify-center">
                        <span className="text-xs text-neutral-500">Select foreground in Inspector →</span>
                    </div>
                )}
            </div>

            {/* Properties */}
            <div className="px-3 pb-3 flex gap-3 text-[10px] text-neutral-400">
                <span>Z: {data.zIndex}</span>
                <span>Opacity: {data.opacity}</span>
                <span>Height: {+((data.scale || 960) / ppu).toFixed(1)}u</span>
            </div>

            {/* Output Handle */}
            <Handle
                type="source"
                position={Position.Right}
                className="!w-3 !h-3 !bg-cyan-500 !border-2 !border-cyan-300 !shadow-lg !shadow-cyan-500/50"
            />
        </div>
    );
}

export const ForegroundNode = memo(ForegroundNodeComponent);
