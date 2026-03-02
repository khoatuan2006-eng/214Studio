import { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { GripVertical, Wrench } from 'lucide-react';

export interface PropNodeData {
    label: string;
    assetHash: string;
    assetPath: string;
    posX: number;
    posY: number;
    zIndex: number;
    scale: number;
    opacity: number;
    rotation: number;
    [key: string]: unknown;
}

type PropNodeType = Node<PropNodeData, 'prop'>;

function PropNodeComponent({ data, selected }: NodeProps<PropNodeType>) {
    return (
        <div
            className={`rounded-xl overflow-hidden shadow-2xl transition-all duration-200 min-w-[200px] ${selected ? 'ring-2 ring-pink-400 shadow-pink-500/30' : 'ring-1 ring-white/10 hover:ring-white/20'
                }`}
            style={{ background: 'linear-gradient(135deg, #2d1b3e 0%, #1a1a2e 100%)' }}
        >
            <div
                className="flex items-center gap-2 px-3 py-2.5 border-b border-white/10"
                style={{ background: 'linear-gradient(90deg, rgba(236,72,153,0.3), rgba(219,39,119,0.15))' }}
            >
                <GripVertical className="w-3 h-3 text-white/30 cursor-grab" />
                <Wrench className="w-4 h-4 text-pink-300" />
                <span className="text-sm font-bold text-white/90 truncate flex-1">{data.label}</span>
            </div>

            <Handle
                type="source"
                position={Position.Right}
                className="!w-3 !h-3 !bg-pink-500 !border-2 !border-pink-300 !shadow-lg !shadow-pink-500/50"
            />

            <div className="p-3 space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                    <span className="text-neutral-400">Position</span>
                    <span className="text-white font-mono text-[10px] bg-white/5 px-2 py-0.5 rounded">
                        {data.posX}, {data.posY}
                    </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                    <span className="text-neutral-400">Scale</span>
                    <span className="text-white font-mono text-[10px] bg-white/5 px-2 py-0.5 rounded">
                        {data.scale}×
                    </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                    <span className="text-neutral-400">Rotation</span>
                    <span className="text-white font-mono text-[10px] bg-white/5 px-2 py-0.5 rounded">
                        {data.rotation}°
                    </span>
                </div>
            </div>
        </div>
    );
}

export const PropNode = memo(PropNodeComponent);
