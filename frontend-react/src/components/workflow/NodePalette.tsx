import React from 'react';
import { User, Image, Film, CloudRain, Wrench, Music, Video, MapPin } from 'lucide-react';
import type { WorkflowNodeType } from '@/store/useWorkflowStore';

interface NodeTypeConfig {
    type: WorkflowNodeType;
    label: string;
    description: string;
    icon: React.FC<{ className?: string }>;
    color: string;
    bgGradient: string;
    available: boolean;
}

const NODE_TYPES: NodeTypeConfig[] = [
    {
        type: 'character',
        label: 'Character',
        description: 'PSD character with pose/face sequence',
        icon: User,
        color: 'text-indigo-400',
        bgGradient: 'from-indigo-500/20 to-violet-500/10',
        available: true,
    },
    {
        type: 'background',
        label: 'Background',
        description: 'Static or animated background layer',
        icon: Image,
        color: 'text-emerald-400',
        bgGradient: 'from-emerald-500/20 to-teal-500/10',
        available: true,
    },
    {
        type: 'scene',
        label: 'Scene Output',
        description: 'Compositor — combines all inputs',
        icon: Film,
        color: 'text-amber-400',
        bgGradient: 'from-amber-500/20 to-orange-500/10',
        available: true,
    },
    // Sprint 3: Additional node types
    {
        type: 'foreground',
        label: 'Foreground',
        description: 'Overlay effects (rain, snow, light)',
        icon: CloudRain,
        color: 'text-cyan-400',
        bgGradient: 'from-cyan-500/20 to-blue-500/10',
        available: true,
    },
    {
        type: 'prop',
        label: 'Prop',
        description: 'Objects & accessories',
        icon: Wrench,
        color: 'text-pink-400',
        bgGradient: 'from-pink-500/20 to-rose-500/10',
        available: true,
    },
    {
        type: 'audio',
        label: 'Audio',
        description: 'BGM, SFX, voice + lip-sync',
        icon: Music,
        color: 'text-purple-400',
        bgGradient: 'from-purple-500/20 to-fuchsia-500/10',
        available: true,
    },
    {
        type: 'camera',
        label: 'Camera',
        description: 'Pan, zoom, shake, focus',
        icon: Video,
        color: 'text-sky-400',
        bgGradient: 'from-sky-500/20 to-blue-500/10',
        available: true,
    },
    {
        type: 'map',
        label: 'Map',
        description: 'Interactive world map with countries',
        icon: MapPin,
        color: 'text-green-400',
        bgGradient: 'from-green-500/20 to-emerald-500/10',
        available: true,
    },
];

interface NodePaletteProps {
    onAddNode: (type: WorkflowNodeType) => void;
}

const NodePalette: React.FC<NodePaletteProps> = ({ onAddNode }) => {
    const handleDragStart = (event: React.DragEvent, nodeType: WorkflowNodeType) => {
        event.dataTransfer.setData('application/workflow-node', nodeType);
        event.dataTransfer.effectAllowed = 'move';
    };

    return (
        <div className="flex flex-col h-full">
            <div className="px-4 py-3 border-b border-white/5">
                <h3 className="text-xs font-bold text-neutral-300 uppercase tracking-wider">
                    Node Palette
                </h3>
                <p className="text-[10px] text-neutral-500 mt-0.5">Drag to canvas or click to add</p>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
                {NODE_TYPES.map((config) => {
                    const Icon = config.icon;
                    return (
                        <button
                            key={config.label}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-200 group
                ${config.available
                                    ? `bg-gradient-to-r ${config.bgGradient} hover:scale-[1.02] active:scale-95 cursor-grab border border-white/5 hover:border-white/10`
                                    : 'opacity-30 cursor-not-allowed border border-white/3'
                                }`}
                            onClick={() => config.available && onAddNode(config.type)}
                            draggable={config.available}
                            onDragStart={(e) => config.available && handleDragStart(e, config.type)}
                            disabled={!config.available}
                        >
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center bg-black/30 ${config.color}`}>
                                <Icon className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-xs font-semibold text-white/90 flex items-center gap-1.5">
                                    {config.label}
                                    {!config.available && (
                                        <span className="text-[9px] px-1 py-0.5 rounded bg-neutral-700 text-neutral-400 font-normal">
                                            Soon
                                        </span>
                                    )}
                                </div>
                                <div className="text-[10px] text-neutral-500 truncate">{config.description}</div>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

export default NodePalette;
