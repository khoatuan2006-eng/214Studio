import { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import type { CharacterNodeData } from '@/store/useWorkflowStore';
import { useAppStore, STATIC_BASE } from '@/store/useAppStore';
import LazyImage from '@/components/ui/LazyImage';
import { User, GripVertical, Plus } from 'lucide-react';
import { API_BASE_URL } from '@/config/api';

type CharacterNodeType = Node<CharacterNodeData, 'character'>;

function CharacterNodeComponent({ data, selected }: NodeProps<CharacterNodeType>) {
    const characters = useAppStore((s) => s.characters);
    const character = characters.find((c) => c.id === data.characterId);

    // Get thumbnail from first asset of first group
    let thumbUrl = '';
    if (character) {
        const firstGroup = Object.values(character.layer_groups)[0];
        if (firstGroup?.[0]?.hash) {
            thumbUrl = `${API_BASE_URL}/thumbnails/${firstGroup[0].hash}_thumb.png`;
        } else if (firstGroup?.[0]?.path) {
            thumbUrl = `${STATIC_BASE}/${firstGroup[0].path}`;
        }
    }

    return (
        <div
            className={`rounded-xl overflow-hidden shadow-xl transition-all duration-200 min-w-[220px] ${selected
                ? 'ring-2 ring-indigo-400 shadow-indigo-500/30'
                : 'ring-1 ring-white/10 hover:ring-white/20'
                }`}
            style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)' }}
        >
            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10"
                style={{ background: 'linear-gradient(90deg, rgba(99,102,241,0.3), rgba(139,92,246,0.2))' }}
            >
                <GripVertical className="w-3 h-3 text-white/30 cursor-grab" />
                <User className="w-4 h-4 text-indigo-300" />
                <span className="text-xs font-bold text-white/90 truncate flex-1">
                    {data.characterName || data.label}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/30 text-indigo-200 font-mono">
                    Z:{data.zIndex}
                </span>
            </div>

            {/* Preview / Character selector */}
            <div className="p-3">
                {character ? (
                    <div className="flex items-center gap-3">
                        <div className="w-14 h-14 rounded-lg overflow-hidden bg-black/30 flex items-center justify-center flex-shrink-0 border border-white/5">
                            {thumbUrl ? (
                                <LazyImage src={thumbUrl} className="w-full h-full object-contain" alt={character.name} />
                            ) : (
                                <User className="w-6 h-6 text-neutral-500" />
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold text-white truncate">{character.name.split('_')[0]}</div>
                            <div className="text-[10px] text-neutral-400 mt-0.5">
                                {Object.keys(character.layer_groups).length} groups
                            </div>
                            <div className="text-[10px] text-neutral-500 mt-0.5">
                                Pos: ({data.posX}, {data.posY})
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="text-xs text-neutral-500 text-center py-3 border border-dashed border-neutral-700 rounded-lg">
                        Select character in Inspector →
                    </div>
                )}
            </div>

            {/* Pose Sequence Preview */}
            <div className="px-3 pb-3">
                <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">
                        Pose Sequence
                    </span>
                    <span className="text-[10px] text-neutral-500">
                        {data.sequence.length} frames
                    </span>
                </div>
                <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-thin">
                    {data.sequence.length > 0 ? (
                        data.sequence.map((frame, i) => (
                            <div
                                key={frame.id}
                                className="w-10 h-10 rounded bg-black/40 border border-white/5 flex items-center justify-center flex-shrink-0 text-[9px] text-neutral-400 font-mono"
                                title={`Frame ${i + 1}: ${frame.duration}s`}
                            >
                                F{i + 1}
                            </div>
                        ))
                    ) : (
                        <div className="w-full flex items-center justify-center gap-1 py-2 text-[10px] text-neutral-600 border border-dashed border-neutral-800 rounded">
                            <Plus className="w-3 h-3" /> Double-click to add poses
                        </div>
                    )}
                </div>
            </div>

            {/* Output Handle */}
            <Handle
                type="source"
                position={Position.Right}
                className="!w-3 !h-3 !bg-indigo-500 !border-2 !border-indigo-300 !shadow-lg !shadow-indigo-500/50"
            />
        </div>
    );
}

export const CharacterNode = memo(CharacterNodeComponent);
