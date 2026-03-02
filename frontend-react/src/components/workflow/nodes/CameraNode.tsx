import { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { GripVertical, Video, Move } from 'lucide-react';

export interface CameraNodeData {
    label: string;
    cameraAction: 'pan' | 'zoom' | 'shake' | 'focus' | 'static';
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    startZoom: number;
    endZoom: number;
    duration: number;
    easing: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';
    [key: string]: unknown;
}

type CameraNodeType = Node<CameraNodeData, 'camera'>;

function CameraNodeComponent({ data, selected }: NodeProps<CameraNodeType>) {
    const actionLabels: Record<string, string> = {
        pan: '↔ Pan', zoom: '🔍 Zoom', shake: '📳 Shake', focus: '🎯 Focus', static: '📌 Static'
    };

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
            </div>

            <Handle
                type="source"
                position={Position.Right}
                className="!w-3 !h-3 !bg-sky-500 !border-2 !border-sky-300 !shadow-lg !shadow-sky-500/50"
            />

            <div className="p-3 space-y-1.5">
                <div className="text-[10px] text-sky-300 bg-sky-500/10 px-2 py-1 rounded text-center font-bold">
                    {actionLabels[data.cameraAction]}
                </div>
                {data.cameraAction === 'pan' && (
                    <div className="flex items-center justify-between text-[11px]">
                        <span className="text-neutral-400 flex items-center gap-1"><Move className="w-3 h-3" /> Move</span>
                        <span className="text-white font-mono text-[10px] bg-white/5 px-2 py-0.5 rounded">
                            ({data.startX},{data.startY}) → ({data.endX},{data.endY})
                        </span>
                    </div>
                )}
                {data.cameraAction === 'zoom' && (
                    <div className="flex items-center justify-between text-[11px]">
                        <span className="text-neutral-400">Zoom</span>
                        <span className="text-white font-mono text-[10px] bg-white/5 px-2 py-0.5 rounded">
                            {data.startZoom}× → {data.endZoom}×
                        </span>
                    </div>
                )}
                <div className="flex items-center justify-between text-[11px]">
                    <span className="text-neutral-400">Duration</span>
                    <span className="text-white font-mono text-[10px] bg-white/5 px-2 py-0.5 rounded">
                        {data.duration}s
                    </span>
                </div>
            </div>
        </div>
    );
}

export const CameraNode = memo(CameraNodeComponent);
