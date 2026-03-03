import { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { GripVertical, MapPin, Globe } from 'lucide-react';
import type { MapNodeData, MapStep } from '@/store/useWorkflowStore';

type MapNodeType = Node<MapNodeData, 'map'>;

function MapNodeComponent({ data, selected }: NodeProps<MapNodeType>) {
    const totalDuration = (data.sequence || []).reduce((sum: number, s: MapStep) => sum + s.duration, 0);
    const stepCount = (data.sequence || []).length;
    const highlightedCount = new Set(
        (data.sequence || []).flatMap((s: MapStep) => s.highlightedProvinces)
    ).size;

    const isWorld = data.mapType === 'world';

    return (
        <div
            className={`rounded-xl overflow-hidden shadow-2xl transition-all duration-200 min-w-[220px] ${selected
                    ? 'ring-2 ring-green-400 shadow-green-500/30'
                    : 'ring-1 ring-white/10 hover:ring-white/20'
                }`}
            style={{ background: 'linear-gradient(135deg, #0a2e1a 0%, #0f1a2e 100%)' }}
        >
            {/* Header */}
            <div
                className="flex items-center gap-2 px-3 py-2.5 border-b border-white/10"
                style={{ background: 'linear-gradient(90deg, rgba(34,197,94,0.3), rgba(22,163,74,0.15))' }}
            >
                <GripVertical className="w-3 h-3 text-white/30 cursor-grab" />
                {isWorld ? (
                    <Globe className="w-4 h-4 text-green-300" />
                ) : (
                    <MapPin className="w-4 h-4 text-green-300" />
                )}
                <span className="text-sm font-bold text-white/90 truncate flex-1">{data.label}</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/30 text-green-200 font-mono">
                    MAP
                </span>
            </div>

            {/* Map Type + Preview Area */}
            <div className="p-3">
                <div
                    className="w-full rounded-lg overflow-hidden border border-white/5 flex items-center justify-center"
                    style={{
                        background: data.backgroundColor || '#0a1628',
                        height: 100,
                    }}
                >
                    {/* Simple globe/map icon preview */}
                    <div className="flex flex-col items-center gap-1.5 opacity-40">
                        {isWorld ? (
                            <Globe className="w-10 h-10 text-green-300" />
                        ) : (
                            <MapPin className="w-10 h-10 text-green-300" />
                        )}
                        <span className="text-[9px] text-white/60 font-mono">
                            {isWorld ? 'World Map' : 'Vietnam Map'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Stats */}
            <div className="px-3 pb-3 space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                    <span className="text-neutral-400">Type</span>
                    <span className="text-white font-mono text-[10px] bg-white/5 px-2 py-0.5 rounded">
                        {isWorld ? '🌍 World' : '🇻🇳 Vietnam'}
                    </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                    <span className="text-neutral-400">Steps</span>
                    <span className="text-white font-mono text-[10px] bg-white/5 px-2 py-0.5 rounded">
                        {stepCount}
                    </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                    <span className="text-neutral-400">Duration</span>
                    <span className="text-white font-mono text-[10px] bg-white/5 px-2 py-0.5 rounded">
                        {totalDuration.toFixed(1)}s
                    </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                    <span className="text-neutral-400">Regions</span>
                    <span className="text-white font-mono text-[10px] bg-white/5 px-2 py-0.5 rounded">
                        {highlightedCount}
                    </span>
                </div>
                {stepCount === 0 && (
                    <div className="text-[10px] text-green-400/60 text-center mt-1 italic">
                        Double-click to edit sequence
                    </div>
                )}
            </div>

            {/* Output Handle */}
            <Handle
                type="source"
                position={Position.Right}
                className="!w-3 !h-3 !bg-green-500 !border-2 !border-green-300 !shadow-lg !shadow-green-500/50"
            />
        </div>
    );
}

export const MapNode = memo(MapNodeComponent);
