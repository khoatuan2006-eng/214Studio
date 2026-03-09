import { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import type { BackgroundNodeData } from '@/stores/useWorkflowStore';
import { useAppStore, STATIC_BASE, getAssetPath } from '@/stores/useAppStore';
import LazyImage from '@/components/ui/LazyImage';
import { Image, GripVertical } from 'lucide-react';

type BackgroundNodeType = Node<BackgroundNodeData, 'background'>;

function BackgroundNodeComponent({ data, selected }: NodeProps<BackgroundNodeType>) {
    const characters = useAppStore((s) => s.characters);
    const assetUrl = data.assetHash
        ? `${STATIC_BASE}/${getAssetPath(characters, data.assetHash)}`
        : '';

    return (
        <div
            className={`rounded-xl overflow-hidden shadow-xl transition-all duration-200 min-w-[200px] ${selected
                ? 'ring-2 ring-emerald-400 shadow-emerald-500/30'
                : 'ring-1 ring-white/10 hover:ring-white/20'
                }`}
            style={{ background: 'linear-gradient(135deg, #0f2027 0%, #203a43 100%)' }}
        >
            {/* Header */}
            <div
                className="flex items-center gap-2 px-3 py-2 border-b border-white/10"
                style={{ background: 'linear-gradient(90deg, rgba(16,185,129,0.3), rgba(6,95,70,0.2))' }}
            >
                <GripVertical className="w-3 h-3 text-white/30 cursor-grab" />
                <Image className="w-4 h-4 text-emerald-300" />
                <span className="text-xs font-bold text-white/90 truncate flex-1">
                    {data.label}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/30 text-emerald-200 font-mono">
                    BG
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
                        <span className="text-xs text-neutral-500">Select background in Inspector →</span>
                    </div>
                )}
            </div>

            {/* Properties */}
            <div className="px-3 pb-3 flex gap-3 text-[10px] text-neutral-400">
                <span>Parallax: {data.parallaxSpeed}</span>
                <span>Blur: {data.blur}px</span>
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

export const BackgroundNode = memo(BackgroundNodeComponent);
