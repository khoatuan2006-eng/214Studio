import React from 'react';
import { useWorkflowStore, type CharacterNodeData, type PoseFrame, type SceneNodeData } from '@/stores/useWorkflowStore';
import { useAppStore, STATIC_BASE } from '@/stores/useAppStore';
import { X, Settings2, Diamond, Trash2, Plus } from 'lucide-react';

interface PreviewSidebarProps {
    selectedNodeId: string;
    editFrameIdx: number;
    currentTime: number;
    onClose: () => void;
}

const PreviewSidebar: React.FC<PreviewSidebarProps> = ({
    selectedNodeId,
    editFrameIdx,
    currentTime,
    onClose,
}) => {
    const { nodes, updateNodeData } = useWorkflowStore();
    const characters = useAppStore((s) => s.characters);

    const selNode = nodes.find(n => n.id === selectedNodeId);
    if (!selNode || selNode.type !== 'character') return null;

    const nodeId = selectedNodeId;
    const selData = selNode.data as CharacterNodeData;
    const selChar = characters.find(c => c.id === selData.characterId);
    if (!selChar) return null;

    // Get PPU from scene node
    const sceneNode = nodes.find(n => n.type === 'scene');
    const ppu = (sceneNode?.data as SceneNodeData)?.pixelsPerUnit || 100;

    const seq = selData.sequence || [];
    const fi = Math.min(editFrameIdx, seq.length - 1);
    const frame = seq[fi];
    if (!frame) return null;

    const updateFrame = (patch: Partial<PoseFrame>) => {
        const updated = seq.map((f, i) => i === fi ? { ...f, ...patch } : f);
        updateNodeData(nodeId, { sequence: updated });
    };

    const toggleLayer = (groupName: string, hash: string) => {
        const layers = { ...frame.layers };
        if (layers[groupName] === hash) {
            delete layers[groupName];
        } else {
            layers[groupName] = hash;
        }
        updateFrame({ layers });
    };

    const kfs = selData.positionKeyframes || [];
    const zKfs = selData.zIndexKeyframes || [];

    return (
        <div className="w-72 shrink-0 bg-neutral-900/95 border-l border-white/5 flex flex-col z-30">
            {/* Header */}
            <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold text-white flex-1 truncate">{selData.characterName || selData.label}</span>
                <button onClick={onClose} className="p-1 hover:bg-white/5 rounded text-neutral-500 hover:text-white">
                    <X className="w-3.5 h-3.5" />
                </button>
            </div>

            {/* Selected Frame Indicator */}
            <div className="px-4 py-2 border-b border-white/5 flex items-center gap-2">
                <span className="text-[9px] text-neutral-500 uppercase tracking-wider">Editing</span>
                <span className="text-xs font-bold text-indigo-300">Frame {fi + 1}</span>
                <span className="text-[9px] text-neutral-600">/ {seq.length}</span>
                <span className="text-[9px] text-neutral-600">({frame.duration}s)</span>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
                {/* Duration */}
                <div>
                    <label className="block text-[9px] font-bold text-neutral-400 uppercase tracking-wider mb-1">Duration (s)</label>
                    <input
                        type="number"
                        value={frame.duration}
                        onChange={(e) => updateFrame({ duration: Math.max(0.1, Number(e.target.value)) })}
                        step={0.1}
                        min={0.1}
                        className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-white font-mono outline-none focus:border-indigo-500/50"
                    />
                </div>

                {/* Scale (height in units) */}
                <div>
                    <label className="block text-[9px] font-bold text-neutral-400 uppercase tracking-wider mb-1">Height ({+(selData.scale / ppu).toFixed(1)}u)</label>
                    <input
                        type="range"
                        value={selData.scale}
                        onChange={(e) => updateNodeData(nodeId, { scale: Number(e.target.value) })}
                        step={10}
                        min={100}
                        max={1080}
                        className="w-full accent-indigo-500 h-1.5"
                    />
                    <div className="flex justify-between text-[8px] text-neutral-600 mt-0.5">
                        <span>{+(100 / ppu).toFixed(1)}u</span><span>{+(540 / ppu).toFixed(1)}u</span><span>{+(1080 / ppu).toFixed(1)}u</span>
                    </div>
                </div>

                {/* Opacity */}
                <div>
                    <label className="block text-[9px] font-bold text-neutral-400 uppercase tracking-wider mb-1">Opacity ({Math.round(selData.opacity * 100)}%)</label>
                    <input
                        type="range"
                        value={selData.opacity}
                        onChange={(e) => updateNodeData(nodeId, { opacity: Number(e.target.value) })}
                        step={0.05}
                        min={0}
                        max={1}
                        className="w-full accent-indigo-500 h-1.5"
                    />
                </div>

                {/* Position Keyframes */}
                <div className="p-2 rounded bg-amber-500/5 border border-amber-500/10 space-y-1.5">
                    <label className="block text-[9px] font-bold text-amber-400 uppercase tracking-wider">◇ Position Keyframes</label>
                    <p className="text-[9px] text-neutral-500">Scrub timeline → Kéo nhân vật → Tự động tạo keyframe</p>
                    {kfs.length === 0 ? (
                        <p className="text-[8px] text-neutral-600 italic">Chưa có keyframe. Kéo nhân vật để tạo.</p>
                    ) : (
                        <div className="space-y-0.5 max-h-28 overflow-y-auto">
                            {kfs.map((kf, i) => {
                                const isNearest = Math.abs(kf.time - currentTime) < 0.15;
                                return (
                                    <div key={i} className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[9px] transition-colors ${isNearest ? 'bg-amber-500/20 text-amber-200' : 'text-neutral-400 hover:bg-white/5'}`}>
                                        <Diamond className="w-2.5 h-2.5 text-amber-400 shrink-0" />
                                        <span className="font-mono font-bold w-10">{kf.time.toFixed(1)}s</span>
                                        <span className="font-mono text-[8px]">({+(kf.x / ppu).toFixed(1)}, {+(kf.y / ppu).toFixed(1)})</span>
                                        <button
                                            onClick={() => {
                                                const updated = kfs.filter((_, j) => j !== i);
                                                updateNodeData(nodeId, { positionKeyframes: updated });
                                            }}
                                            className="ml-auto p-0.5 rounded hover:bg-red-500/20 text-neutral-600 hover:text-red-400 transition-colors"
                                            title="Delete keyframe"
                                        >
                                            <Trash2 className="w-2.5 h-2.5" />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    {kfs.length > 0 && (
                        <button
                            onClick={() => updateNodeData(nodeId, { positionKeyframes: [] })}
                            className="w-full text-center text-[9px] text-neutral-500 hover:text-red-400 py-0.5 transition-colors"
                        >
                            ↺ Clear all keyframes
                        </button>
                    )}
                </div>

                {/* Z-Index Keyframes */}
                <div className="p-2 rounded bg-cyan-500/5 border border-cyan-500/10 space-y-1.5">
                    <label className="block text-[9px] font-bold text-cyan-400 uppercase tracking-wider">◇ Z-Index Keyframes</label>
                    <p className="text-[9px] text-neutral-500">Animate z-index over time (0=behind, 100=front)</p>

                    {/* Add z-index keyframe */}
                    <button
                        onClick={() => {
                            const existing = [...zKfs];
                            const alreadyExists = existing.some(k => Math.abs(k.time - currentTime) < 0.05);
                            if (alreadyExists) return; // don't duplicate
                            existing.push({ time: +currentTime.toFixed(2), z: selData.zIndex });
                            existing.sort((a, b) => a.time - b.time);
                            updateNodeData(nodeId, { zIndexKeyframes: existing });
                        }}
                        className="w-full flex items-center justify-center gap-1 px-2 py-1 rounded bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 text-[9px] font-bold border border-cyan-500/20 transition-colors"
                    >
                        <Plus className="w-3 h-3" />
                        Add Z-Keyframe at {currentTime.toFixed(1)}s
                    </button>

                    {zKfs.length === 0 ? (
                        <p className="text-[8px] text-neutral-600 italic">Chưa có z-index keyframe.</p>
                    ) : (
                        <div className="space-y-0.5 max-h-28 overflow-y-auto">
                            {zKfs.map((kf, i) => {
                                const isNearest = Math.abs(kf.time - currentTime) < 0.15;
                                return (
                                    <div key={i} className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[9px] transition-colors ${isNearest ? 'bg-cyan-500/20 text-cyan-200' : 'text-neutral-400 hover:bg-white/5'}`}>
                                        <Diamond className="w-2.5 h-2.5 text-cyan-400 shrink-0" />
                                        <span className="font-mono font-bold w-10">{kf.time.toFixed(1)}s</span>
                                        <span className="font-mono text-[8px]">z={kf.z}</span>
                                        {/* Inline z edit */}
                                        <input
                                            type="number"
                                            value={kf.z}
                                            onChange={(e) => {
                                                const updated = zKfs.map((k, j) =>
                                                    j === i ? { ...k, z: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) } : k
                                                );
                                                updateNodeData(nodeId, { zIndexKeyframes: updated });
                                            }}
                                            min={0} max={100}
                                            className="w-10 bg-black/40 border border-white/10 rounded px-1 text-[8px] text-white font-mono text-center outline-none focus:border-cyan-500/50"
                                        />
                                        <button
                                            onClick={() => {
                                                const updated = zKfs.filter((_, j) => j !== i);
                                                updateNodeData(nodeId, { zIndexKeyframes: updated });
                                            }}
                                            className="ml-auto p-0.5 rounded hover:bg-red-500/20 text-neutral-600 hover:text-red-400 transition-colors"
                                            title="Delete z-keyframe"
                                        >
                                            <Trash2 className="w-2.5 h-2.5" />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    {zKfs.length > 0 && (
                        <button
                            onClick={() => updateNodeData(nodeId, { zIndexKeyframes: [] })}
                            className="w-full text-center text-[9px] text-neutral-500 hover:text-red-400 py-0.5 transition-colors"
                        >
                            ↺ Clear all z-keyframes
                        </button>
                    )}
                </div>

                {/* Layer Groups — swap pose/face */}
                <div>
                    <label className="block text-[9px] font-bold text-neutral-400 uppercase tracking-wider mb-2">Layers</label>
                    <div className="space-y-3">
                        {selChar.group_order.map(groupName => {
                            const assets = selChar.layer_groups[groupName];
                            if (!assets || assets.length === 0) return null;
                            const selectedHash = frame.layers[groupName];
                            return (
                                <div key={groupName}>
                                    <div className="flex items-center gap-1 mb-1">
                                        <span className="text-[9px] font-bold text-neutral-300 uppercase">{groupName}</span>
                                        {selectedHash && <span className="text-[8px] px-1 py-0.5 rounded bg-indigo-500/20 text-indigo-300">✓</span>}
                                    </div>
                                    <div className="grid grid-cols-4 gap-1">
                                        {assets.map(asset => {
                                            const url = asset.path ? `${STATIC_BASE}/${asset.path}` : '';
                                            const isSelected = selectedHash === asset.hash;
                                            return (
                                                <button
                                                    key={asset.hash}
                                                    onClick={() => toggleLayer(groupName, asset.hash)}
                                                    className={`aspect-square rounded border overflow-hidden transition-all ${isSelected ? 'border-indigo-400 ring-1 ring-indigo-400/50 bg-indigo-500/10' : 'border-white/5 hover:border-white/20 bg-black/30'}`}
                                                    title={asset.name}
                                                >
                                                    {url && <img src={url} className="w-full h-full object-contain" alt={asset.name} loading="lazy" draggable={false} />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PreviewSidebar;
