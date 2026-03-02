import { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import type { SceneNodeData } from '@/store/useWorkflowStore';
import { Film, GripVertical, Play, Eye, Zap } from 'lucide-react';

type SceneNodeType = Node<SceneNodeData, 'scene'>;

function SceneNodeComponent({ data, selected }: NodeProps<SceneNodeType>) {
    const handleExecute = (e: React.MouseEvent) => {
        e.stopPropagation();
        window.dispatchEvent(new CustomEvent('workflow:execute'));
    };

    const handlePreview = (e: React.MouseEvent) => {
        e.stopPropagation();
        window.dispatchEvent(new CustomEvent('workflow:preview'));
    };

    return (
        <div
            className={`rounded-xl overflow-hidden shadow-2xl transition-all duration-200 min-w-[240px] ${selected
                ? 'ring-2 ring-amber-400 shadow-amber-500/30'
                : 'ring-1 ring-white/10 hover:ring-white/20'
                }`}
            style={{ background: 'linear-gradient(135deg, #2d1b4e 0%, #1a1a2e 50%, #1e3a5f 100%)' }}
        >
            <div
                className="flex items-center gap-2 px-3 py-2.5 border-b border-white/10"
                style={{ background: 'linear-gradient(90deg, rgba(245,158,11,0.3), rgba(217,119,6,0.15))' }}
            >
                <GripVertical className="w-3 h-3 text-white/30 cursor-grab" />
                <Film className="w-4 h-4 text-amber-300" />
                <span className="text-sm font-bold text-white/90 truncate flex-1">{data.label}</span>
                <Zap className="w-3.5 h-3.5 text-amber-400" />
            </div>

            <Handle
                type="target"
                position={Position.Left}
                className="!w-4 !h-4 !bg-amber-500 !border-2 !border-amber-300 !shadow-lg !shadow-amber-500/50 !rounded-sm !rotate-45"
                style={{ top: '50%' }}
            />

            <div className="p-3 space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                    <span className="text-neutral-400">Canvas</span>
                    <span className="text-white font-mono text-[10px] bg-white/5 px-2 py-0.5 rounded">
                        {data.canvasWidth}×{data.canvasHeight}
                    </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                    <span className="text-neutral-400">FPS</span>
                    <span className="text-white font-mono text-[10px] bg-white/5 px-2 py-0.5 rounded">
                        {data.fps}
                    </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                    <span className="text-neutral-400">Duration</span>
                    <span className="text-amber-300 font-mono text-[10px] bg-amber-500/10 px-2 py-0.5 rounded">
                        {data.totalDuration > 0 ? `${data.totalDuration.toFixed(1)}s` : 'Auto'}
                    </span>
                </div>
            </div>

            {/* Action Buttons */}
            <div className="px-3 pb-3 flex gap-1.5">
                <button
                    onClick={handlePreview}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all duration-200
                        bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500
                        text-white shadow-lg shadow-indigo-600/30 hover:shadow-indigo-500/40
                        active:scale-95"
                    title="Preview animation"
                >
                    <Eye className="w-3.5 h-3.5" />
                    Preview
                </button>
                <button
                    onClick={handleExecute}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all duration-200
                        bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500
                        text-white shadow-lg shadow-amber-600/30 hover:shadow-amber-500/40
                        active:scale-95"
                    title="Execute workflow"
                >
                    <Play className="w-3.5 h-3.5" />
                    Execute
                </button>
            </div>
        </div>
    );
}

export const SceneNode = memo(SceneNodeComponent);
