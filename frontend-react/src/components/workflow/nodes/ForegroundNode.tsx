import { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { GripVertical, CloudRain } from 'lucide-react';

export interface ForegroundNodeData {
    label: string;
    effectType: 'rain' | 'snow' | 'leaves' | 'sparkle' | 'light_rays' | 'custom';
    intensity: number;    // 0–1
    speed: number;        // particle speed multiplier
    opacity: number;
    zIndex: number;
    assetPath: string;    // for custom effects
    [key: string]: unknown;
}

type ForegroundNodeType = Node<ForegroundNodeData, 'foreground'>;

function ForegroundNodeComponent({ data, selected }: NodeProps<ForegroundNodeType>) {
    const effectEmojis: Record<string, string> = {
        rain: '🌧️', snow: '❄️', leaves: '🍂', sparkle: '✨', light_rays: '☀️', custom: '🎨'
    };

    return (
        <div
            className={`rounded-xl overflow-hidden shadow-2xl transition-all duration-200 min-w-[200px] ${selected ? 'ring-2 ring-cyan-400 shadow-cyan-500/30' : 'ring-1 ring-white/10 hover:ring-white/20'
                }`}
            style={{ background: 'linear-gradient(135deg, #1b3e4e 0%, #1a1a2e 100%)' }}
        >
            <div
                className="flex items-center gap-2 px-3 py-2.5 border-b border-white/10"
                style={{ background: 'linear-gradient(90deg, rgba(6,182,212,0.3), rgba(34,211,238,0.15))' }}
            >
                <GripVertical className="w-3 h-3 text-white/30 cursor-grab" />
                <CloudRain className="w-4 h-4 text-cyan-300" />
                <span className="text-sm font-bold text-white/90 truncate flex-1">{data.label}</span>
            </div>

            <Handle
                type="source"
                position={Position.Right}
                className="!w-3 !h-3 !bg-cyan-500 !border-2 !border-cyan-300 !shadow-lg !shadow-cyan-500/50"
            />

            <div className="p-3 space-y-1.5">
                <div className="text-[10px] text-cyan-300 bg-cyan-500/10 px-2 py-1 rounded text-center font-bold">
                    {effectEmojis[data.effectType]} {data.effectType.replace('_', ' ')}
                </div>
                <div className="flex items-center justify-between text-[11px]">
                    <span className="text-neutral-400">Intensity</span>
                    <span className="text-white font-mono text-[10px] bg-white/5 px-2 py-0.5 rounded">
                        {Math.round(data.intensity * 100)}%
                    </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                    <span className="text-neutral-400">Opacity</span>
                    <span className="text-white font-mono text-[10px] bg-white/5 px-2 py-0.5 rounded">
                        {data.opacity}
                    </span>
                </div>
            </div>
        </div>
    );
}

export const ForegroundNode = memo(ForegroundNodeComponent);
