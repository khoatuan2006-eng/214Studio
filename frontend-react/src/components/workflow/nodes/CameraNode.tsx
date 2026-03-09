import { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { GripVertical, Video, Diamond } from 'lucide-react';
import type { CameraNodeData } from '@/stores/useWorkflowStore';

type CameraNodeType = Node<CameraNodeData, 'camera'>;

function CameraNodeComponent({ data, selected }: NodeProps<CameraNodeType>) {
    const kfs = data.keyframes || [];
    const lastKf = kfs[kfs.length - 1];

    return (
        <div
            className={`rounded-xl overflow-hidden shadow-2xl transition-all duration-200 min-w-[200px] ${selected ? 'ring-2 ring-sky-400 shadow-sky-500/30' : 'ring-1 ring-white/10 hover:ring-white/20'
                }`}
            style={{ background: 'linear-gradient(135deg, #1b2e4e 0%, #1a1a2e 100%)' }}
        >
            <div
                className="flex items-center gap-2 px-3 py-2.5 border-b border-white/10"
                style={{ background: 'linear-gradient(90deg, rgba(14,165,233,0.3), rgba(56,189,248,0.15))' }}
            >
                <GripVertical className="w-3 h-3 text-white/30 cursor-grab" />
                <Video className="w-4 h-4 text-sky-300" />
                <span className="text-sm font-bold text-white/90 truncate flex-1">{data.label}</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 font-bold">
                    {kfs.length} KF
                </span>
            </div>

            <Handle
                type="source"
                position={Position.Right}
                className="!w-3 !h-3 !bg-sky-500 !border-2 !border-sky-300 !shadow-lg !shadow-sky-500/50"
            />

            <div className="p-3 space-y-1.5">
                {/* Viewport size */}
                <div className="flex items-center justify-between text-[11px]">
                    <span className="text-neutral-400">Viewport</span>
                    <span className="text-white font-mono text-[10px] bg-white/5 px-2 py-0.5 rounded">
                        {data.viewportWidth}×{data.viewportHeight}
                    </span>
                </div>

                {/* Keyframes mini-timeline */}
                <div className="space-y-0.5">
                    {kfs.map((kf) => (
                        <div key={kf.id} className="flex items-center gap-1.5 text-[10px]">
                            <Diamond className="w-2.5 h-2.5 text-sky-400 fill-sky-400" />
                            <span className="text-neutral-400">{kf.time}s</span>
                            <span className="text-white/60">→</span>
                            <span className="text-white font-mono">({kf.x},{kf.y})</span>
                            <span className="text-sky-300">{kf.zoom}×</span>
                        </div>
                    ))}
                </div>

                {/* Duration */}
                {lastKf && (
                    <div className="text-[9px] text-sky-300 bg-sky-500/10 px-2 py-0.5 rounded text-center font-semibold">
                        🎬 {lastKf.time}s total
                    </div>
                )}
            </div>
        </div>
    );
}

export const CameraNode = memo(CameraNodeComponent);
