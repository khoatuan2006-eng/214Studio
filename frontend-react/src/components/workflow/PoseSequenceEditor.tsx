import React, { useState, useCallback } from 'react';
import { useAppStore, STATIC_BASE } from '@/store/useAppStore';
import { useWorkflowStore, type PoseFrame, type CharacterNodeData } from '@/store/useWorkflowStore';
import LazyImage from '@/components/ui/LazyImage';
import { X, Plus, Trash2, GripVertical, Clock, ArrowRight, ChevronDown, ChevronUp, Copy } from 'lucide-react';

interface PoseSequenceEditorProps {
    nodeId: string;
    onClose: () => void;
}

const PoseSequenceEditor: React.FC<PoseSequenceEditorProps> = ({ nodeId, onClose }) => {
    const { nodes, updateNodeData } = useWorkflowStore();
    const characters = useAppStore((s) => s.characters);

    const node = nodes.find((n) => n.id === nodeId);
    const data = node?.data as CharacterNodeData | undefined;
    const character = characters.find((c) => c.id === data?.characterId);

    // Local state for sequence editing
    const [sequence, setSequence] = useState<PoseFrame[]>(data?.sequence || []);
    const [expandedFrame, setExpandedFrame] = useState<number | null>(null);

    if (!character || !data) {
        return (
            <ModalShell onClose={onClose}>
                <div className="flex items-center justify-center h-64 text-neutral-500 text-sm">
                    Please select a character first in the Node Inspector.
                </div>
            </ModalShell>
        );
    }

    // Add a new empty frame
    const addFrame = useCallback(() => {
        const newFrame: PoseFrame = {
            id: `frame-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            duration: 1.0,
            layers: {},
            transition: 'cut',
            transitionDuration: 0,
        };
        const updated = [...sequence, newFrame];
        setSequence(updated);
        setExpandedFrame(updated.length - 1);
    }, [sequence]);

    // Duplicate a frame
    const duplicateFrame = useCallback((index: number) => {
        const source = sequence[index];
        const newFrame: PoseFrame = {
            ...source,
            id: `frame-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            layers: { ...source.layers },
        };
        const updated = [...sequence];
        updated.splice(index + 1, 0, newFrame);
        setSequence(updated);
        setExpandedFrame(index + 1);
    }, [sequence]);

    // Remove a frame
    const removeFrame = useCallback((index: number) => {
        const updated = sequence.filter((_, i) => i !== index);
        setSequence(updated);
        if (expandedFrame === index) setExpandedFrame(null);
    }, [sequence, expandedFrame]);

    // Move frame up/down
    const moveFrame = useCallback((index: number, direction: -1 | 1) => {
        const newIndex = index + direction;
        if (newIndex < 0 || newIndex >= sequence.length) return;
        const updated = [...sequence];
        [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
        setSequence(updated);
        setExpandedFrame(newIndex);
    }, [sequence]);

    // Update frame property
    const updateFrame = useCallback((index: number, patch: Partial<PoseFrame>) => {
        const updated = sequence.map((f, i) => (i === index ? { ...f, ...patch } : f));
        setSequence(updated);
    }, [sequence]);

    // Toggle layer selection for a specific frame
    const toggleLayer = useCallback((frameIndex: number, groupName: string, hash: string) => {
        const frame = sequence[frameIndex];
        const layers = { ...frame.layers };
        if (layers[groupName] === hash) {
            delete layers[groupName];
        } else {
            layers[groupName] = hash;
        }
        updateFrame(frameIndex, { layers });
    }, [sequence, updateFrame]);

    // Save and close
    const handleSave = useCallback(() => {
        updateNodeData(nodeId, { sequence });
        onClose();
    }, [nodeId, sequence, updateNodeData, onClose]);

    // Calculate total duration
    const totalDuration = sequence.reduce((sum, f) => sum + f.duration + (f.transition === 'crossfade' ? f.transitionDuration : 0), 0);

    return (
        <ModalShell onClose={onClose}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
                <div>
                    <h2 className="text-base font-bold text-white flex items-center gap-2">
                        Pose Sequence — {character.name.split('_')[0]}
                    </h2>
                    <p className="text-[11px] text-neutral-500 mt-0.5">
                        {sequence.length} frames · {totalDuration.toFixed(1)}s total
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={addFrame}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
              bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/30 transition-all"
                    >
                        <Plus className="w-3.5 h-3.5" /> Add Frame
                    </button>
                    <button
                        onClick={handleSave}
                        className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold
              bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-500 hover:to-purple-500
              shadow-lg shadow-indigo-500/20 transition-all active:scale-95"
                    >
                        Save Sequence
                    </button>
                </div>
            </div>

            {/* Frame List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {sequence.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-neutral-500">
                        <Clock className="w-10 h-10 mb-3 text-neutral-600" />
                        <p className="text-sm font-medium">No frames yet</p>
                        <p className="text-xs text-neutral-600 mt-1">Click "Add Frame" to start building pose sequence</p>
                    </div>
                ) : (
                    sequence.map((frame, index) => {
                        const isExpanded = expandedFrame === index;
                        return (
                            <div key={frame.id} className="rounded-xl border border-white/5 overflow-hidden transition-all"
                                style={{ background: isExpanded ? 'rgba(99,102,241,0.05)' : 'rgba(255,255,255,0.02)' }}>
                                {/* Frame Header */}
                                <div
                                    className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/3 transition-colors"
                                    onClick={() => setExpandedFrame(isExpanded ? null : index)}
                                >
                                    <GripVertical className="w-3.5 h-3.5 text-neutral-600 cursor-grab" />
                                    <div className="w-6 h-6 rounded bg-indigo-500/20 text-indigo-300 flex items-center justify-center text-[10px] font-bold">
                                        {index + 1}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <span className="text-xs font-semibold text-white">
                                            Frame {index + 1}
                                        </span>
                                        <span className="text-[10px] text-neutral-500 ml-2">
                                            {Object.keys(frame.layers).length} layers · {frame.duration}s
                                        </span>
                                    </div>

                                    {/* Frame thumbnails preview */}
                                    <div className="flex gap-1">
                                        {Object.entries(frame.layers).slice(0, 4).map(([group, hash]) => {
                                            const asset = character.layer_groups[group]?.find(a => a.hash === hash);
                                            const url = asset?.path ? `${STATIC_BASE}/${asset.path}` : '';
                                            return url ? (
                                                <div key={group} className="w-6 h-6 rounded bg-black/40 overflow-hidden border border-white/5">
                                                    <LazyImage src={url} className="w-full h-full object-contain" alt={group} rootMargin="0px" />
                                                </div>
                                            ) : null;
                                        })}
                                    </div>

                                    {/* Controls */}
                                    <div className="flex items-center gap-0.5">
                                        <button onClick={(e) => { e.stopPropagation(); moveFrame(index, -1); }}
                                            className="p-1 hover:bg-white/5 rounded text-neutral-500 hover:text-white disabled:opacity-20"
                                            disabled={index === 0}>
                                            <ChevronUp className="w-3.5 h-3.5" />
                                        </button>
                                        <button onClick={(e) => { e.stopPropagation(); moveFrame(index, 1); }}
                                            className="p-1 hover:bg-white/5 rounded text-neutral-500 hover:text-white disabled:opacity-20"
                                            disabled={index === sequence.length - 1}>
                                            <ChevronDown className="w-3.5 h-3.5" />
                                        </button>
                                        <button onClick={(e) => { e.stopPropagation(); duplicateFrame(index); }}
                                            className="p-1 hover:bg-white/5 rounded text-neutral-500 hover:text-white">
                                            <Copy className="w-3.5 h-3.5" />
                                        </button>
                                        <button onClick={(e) => { e.stopPropagation(); removeFrame(index); }}
                                            className="p-1 hover:bg-red-500/10 rounded text-neutral-500 hover:text-red-400">
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>

                                    {isExpanded ? <ChevronUp className="w-4 h-4 text-neutral-500" /> : <ChevronDown className="w-4 h-4 text-neutral-500" />}
                                </div>

                                {/* Expanded: Layer selections + timing */}
                                {isExpanded && (
                                    <div className="px-4 pb-4 border-t border-white/5 pt-3">
                                        {/* Timing Controls */}
                                        <div className="flex gap-4 mb-4">
                                            <div className="flex-1">
                                                <label className="block text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">Duration (s)</label>
                                                <input
                                                    type="number"
                                                    value={frame.duration}
                                                    onChange={(e) => updateFrame(index, { duration: Math.max(0.1, Number(e.target.value)) })}
                                                    step={0.1}
                                                    min={0.1}
                                                    className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white font-mono outline-none focus:border-indigo-500/50"
                                                />
                                            </div>
                                            <div className="flex-1">
                                                <label className="block text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">Transition</label>
                                                <select
                                                    value={frame.transition}
                                                    onChange={(e) => updateFrame(index, { transition: e.target.value as 'cut' | 'crossfade' })}
                                                    className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-indigo-500/50"
                                                >
                                                    <option value="cut">Cut</option>
                                                    <option value="crossfade">Crossfade</option>
                                                </select>
                                            </div>
                                            {frame.transition === 'crossfade' && (
                                                <div className="flex-1">
                                                    <label className="block text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">Fade (s)</label>
                                                    <input
                                                        type="number"
                                                        value={frame.transitionDuration}
                                                        onChange={(e) => updateFrame(index, { transitionDuration: Math.max(0, Number(e.target.value)) })}
                                                        step={0.1}
                                                        min={0}
                                                        className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white font-mono outline-none focus:border-indigo-500/50"
                                                    />
                                                </div>
                                            )}
                                        </div>

                                        {/* Movement Controls */}
                                        <div className="mb-4 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
                                            <label className="block text-[10px] font-bold text-emerald-400 uppercase tracking-wider mb-2">
                                                📍 Movement (optional)
                                            </label>
                                            <div className="grid grid-cols-4 gap-2">
                                                <div>
                                                    <label className="block text-[9px] text-neutral-500 mb-0.5">Start X</label>
                                                    <input
                                                        type="number"
                                                        value={frame.startX ?? ''}
                                                        onChange={(e) => updateFrame(index, { startX: e.target.value ? Number(e.target.value) : undefined })}
                                                        placeholder={String(data.posX)}
                                                        className="w-full bg-black/30 border border-white/10 rounded px-2 py-1 text-[10px] text-white font-mono outline-none focus:border-emerald-500/50 placeholder:text-neutral-700"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[9px] text-neutral-500 mb-0.5">Start Y</label>
                                                    <input
                                                        type="number"
                                                        value={frame.startY ?? ''}
                                                        onChange={(e) => updateFrame(index, { startY: e.target.value ? Number(e.target.value) : undefined })}
                                                        placeholder={String(data.posY)}
                                                        className="w-full bg-black/30 border border-white/10 rounded px-2 py-1 text-[10px] text-white font-mono outline-none focus:border-emerald-500/50 placeholder:text-neutral-700"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[9px] text-emerald-400 mb-0.5">End X →</label>
                                                    <input
                                                        type="number"
                                                        value={frame.endX ?? ''}
                                                        onChange={(e) => updateFrame(index, { endX: e.target.value ? Number(e.target.value) : undefined })}
                                                        placeholder={String(data.posX)}
                                                        className="w-full bg-black/30 border border-white/10 rounded px-2 py-1 text-[10px] text-white font-mono outline-none focus:border-emerald-500/50 placeholder:text-neutral-700"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[9px] text-emerald-400 mb-0.5">End Y →</label>
                                                    <input
                                                        type="number"
                                                        value={frame.endY ?? ''}
                                                        onChange={(e) => updateFrame(index, { endY: e.target.value ? Number(e.target.value) : undefined })}
                                                        placeholder={String(data.posY)}
                                                        className="w-full bg-black/30 border border-white/10 rounded px-2 py-1 text-[10px] text-white font-mono outline-none focus:border-emerald-500/50 placeholder:text-neutral-700"
                                                    />
                                                </div>
                                            </div>
                                            <p className="text-[8px] text-neutral-600 mt-1">Leave empty = use node's static position. Coordinates: 0-1920 (X), 0-1080 (Y)</p>
                                        </div>
                                        {/* Layer Groups */}
                                        <div className="space-y-3">
                                            {character.group_order.map((groupName) => {
                                                const assets = character.layer_groups[groupName];
                                                if (!assets || assets.length === 0) return null;
                                                const selectedHash = frame.layers[groupName];

                                                return (
                                                    <div key={groupName}>
                                                        <div className="flex items-center gap-2 mb-1.5">
                                                            <span className="text-[10px] font-bold text-neutral-300 uppercase tracking-wider">
                                                                {groupName}
                                                            </span>
                                                            {selectedHash && (
                                                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono">
                                                                    Selected
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                                                            {assets.map((asset) => {
                                                                const isSelected = selectedHash === asset.hash;
                                                                const assetUrl = `${STATIC_BASE}/${asset.path}`;

                                                                return (
                                                                    <button
                                                                        key={asset.hash || asset.path}
                                                                        onClick={() => toggleLayer(index, groupName, asset.hash || asset.name)}
                                                                        className={`w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 border-2 transition-all p-0.5 ${isSelected
                                                                            ? 'border-indigo-500 shadow-lg shadow-indigo-500/30 scale-105'
                                                                            : 'border-transparent hover:border-white/20 bg-black/30'
                                                                            }`}
                                                                    >
                                                                        <LazyImage
                                                                            src={assetUrl}
                                                                            className="w-full h-full object-contain"
                                                                            alt={asset.name}
                                                                            rootMargin="0px"
                                                                        />
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>

            {/* Timeline Preview Bar */}
            {sequence.length > 0 && (
                <div className="px-4 py-3 border-t border-white/5">
                    <div className="flex items-center gap-1 h-8">
                        {sequence.map((frame, i) => (
                            <React.Fragment key={frame.id}>
                                <div
                                    className={`h-full rounded flex items-center justify-center text-[9px] font-mono cursor-pointer transition-all ${expandedFrame === i
                                        ? 'bg-indigo-500/40 text-indigo-200 ring-1 ring-indigo-400'
                                        : 'bg-white/5 text-neutral-500 hover:bg-white/10'
                                        }`}
                                    style={{ flex: frame.duration }}
                                    onClick={() => setExpandedFrame(i)}
                                    title={`Frame ${i + 1}: ${frame.duration}s`}
                                >
                                    F{i + 1}
                                </div>
                                {i < sequence.length - 1 && (
                                    <ArrowRight className="w-2.5 h-2.5 text-neutral-700 flex-shrink-0" />
                                )}
                            </React.Fragment>
                        ))}
                    </div>
                </div>
            )}
        </ModalShell>
    );
};

// ── Modal Shell ──
function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-8">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            />
            {/* Modal */}
            <div
                className="relative w-full max-w-4xl max-h-[85vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden"
                style={{
                    background: 'linear-gradient(135deg, #0f0f1a 0%, #131320 100%)',
                    border: '1px solid rgba(99, 102, 241, 0.15)',
                }}
            >
                {/* Close button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 z-10 p-1.5 rounded-lg hover:bg-white/5 text-neutral-500 hover:text-white transition-colors"
                >
                    <X className="w-4 h-4" />
                </button>
                {children}
            </div>
        </div>
    );
}

export default PoseSequenceEditor;
