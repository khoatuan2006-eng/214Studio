import { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { GripVertical, Music, Volume2 } from 'lucide-react';

export interface AudioNodeData {
    label: string;
    audioType: 'bgm' | 'sfx' | 'voice';
    assetPath: string;
    volume: number;       // 0–1
    startTime: number;
    loop: boolean;
    fadeIn: number;        // seconds
    fadeOut: number;       // seconds
    [key: string]: unknown;
}

type AudioNodeType = Node<AudioNodeData, 'audio'>;

function AudioNodeComponent({ data, selected }: NodeProps<AudioNodeType>) {
    const typeLabels: Record<string, string> = { bgm: 'BGM', sfx: 'SFX', voice: 'Voice' };
    const typeColors: Record<string, string> = { bgm: 'text-purple-300', sfx: 'text-fuchsia-300', voice: 'text-violet-300' };

    return (
        <div
            className={`rounded-xl overflow-hidden shadow-2xl transition-all duration-200 min-w-[200px] ${selected ? 'ring-2 ring-purple-400 shadow-purple-500/30' : 'ring-1 ring-white/10 hover:ring-white/20'
                }`}
            style={{ background: 'linear-gradient(135deg, #261b4e 0%, #1a1a2e 100%)' }}
        >
            <div
                className="flex items-center gap-2 px-3 py-2.5 border-b border-white/10"
                style={{ background: 'linear-gradient(90deg, rgba(168,85,247,0.3), rgba(139,92,246,0.15))' }}
            >
                <GripVertical className="w-3 h-3 text-white/30 cursor-grab" />
                <Music className="w-4 h-4 text-purple-300" />
                <span className="text-sm font-bold text-white/90 truncate flex-1">{data.label}</span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded bg-white/10 font-bold ${typeColors[data.audioType]}`}>
                    {typeLabels[data.audioType]}
                </span>
            </div>

            <Handle
                type="source"
                position={Position.Right}
                className="!w-3 !h-3 !bg-purple-500 !border-2 !border-purple-300 !shadow-lg !shadow-purple-500/50"
            />

            <div className="p-3 space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                    <span className="text-neutral-400 flex items-center gap-1"><Volume2 className="w-3 h-3" /> Volume</span>
                    <span className="text-white font-mono text-[10px] bg-white/5 px-2 py-0.5 rounded">
                        {Math.round(data.volume * 100)}%
                    </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                    <span className="text-neutral-400">Start</span>
                    <span className="text-white font-mono text-[10px] bg-white/5 px-2 py-0.5 rounded">
                        {data.startTime}s
                    </span>
                </div>
                {data.loop && (
                    <div className="text-[9px] text-purple-300 bg-purple-500/10 px-2 py-0.5 rounded text-center font-semibold">
                        🔁 Looping
                    </div>
                )}
            </div>
        </div>
    );
}

export const AudioNode = memo(AudioNodeComponent);
