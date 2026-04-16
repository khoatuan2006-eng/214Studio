/**
 * SceneGraphPropertiesPanel — Professional property editor for selected timeline blocks.
 *
 * Three tabs:
 * 1. Transform — Position, Scale, Rotation, Opacity
 * 2. Pose & Face — Character layer picker with thumbnails
 * 3. Keyframes — Full keyframe table + frame sequence editor
 */

import React, { useState } from 'react';
import { useSceneGraphStore } from '@/stores/useSceneGraphStore';
import { useAppStore } from '@/stores/useAppStore';
import { useCharacterV2Store } from '@/stores/useCharacterV2Store';
import { STATIC_BASE } from '@/config/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Move, UserSquare2, Key, Plus, Trash2, Copy } from 'lucide-react';
import type { AnyNodeData, CharacterNodeData, EasingType, Keyframe } from '@/core/scene-graph/types';

// ══════════════════════════════════════════════
//  Easing Options
// ══════════════════════════════════════════════
const EASING_OPTIONS: EasingType[] = [
    'linear', 'easeIn', 'easeOut', 'easeInOut',
    'easeInCubic', 'easeOutCubic', 'easeInOutCubic', 'step'
];

const ANIMATABLE_PROPS = ['x', 'y', 'scale_x', 'scale_y', 'rotation', 'opacity'];

const SceneGraphPropertiesPanel: React.FC = () => {
    const selectedBlock = useSceneGraphStore(s => s.selectedBlock);
    const scenes = useSceneGraphStore(s => s.scenes);
    const psdCharacters = useAppStore(s => s.characters);
    const flaCharacters = useCharacterV2Store(s => s.characters);
    const addKeyframe = useSceneGraphStore(s => s.addKeyframe);
    const removeKeyframe = useSceneGraphStore(s => s.removeKeyframe);
    const addCharacterFrame = useSceneGraphStore(s => s.addCharacterFrame);
    const removeCharacterFrame = useSceneGraphStore(s => s.removeCharacterFrame);
    const duplicateCharacterFrame = useSceneGraphStore(s => s.duplicateCharacterFrame);
    const updateCharacterFrameLayers = useSceneGraphStore(s => s.updateCharacterFrameLayers);
    const localTime = useSceneGraphStore(s => s.localTime);
    
    // Subscribe tightly to trigger re-renders
    useSceneGraphStore(s => s.snapshot); 

    // Add keyframe form state
    const [newKfProp, setNewKfProp] = useState('x');
    const [newKfTime, setNewKfTime] = useState('0');
    const [newKfValue, setNewKfValue] = useState('0');
    const [newKfEasing, setNewKfEasing] = useState<EasingType>('linear');

    if (!selectedBlock) {
        return (
            <div className="h-full w-full flex flex-col items-center justify-center opacity-30 text-center gap-2">
                <div className="text-2xl">✨</div>
                <span className="text-[10px]">Select a block on the timeline<br/>or a node to edit properties</span>
            </div>
        );
    }

    const scene = scenes.find(s => s.id === selectedBlock.sceneId);
    if (!scene) return null;

    const manager = scene.manager;
    const node = manager.getNode(selectedBlock.nodeId);

    if (!node) {
        return (
            <div className="h-full w-full flex flex-col items-center justify-center text-center opacity-30 gap-2">
                <div className="text-2xl">🔒</div>
                <span className="text-[10px]">Node not found</span>
            </div>
        );
    }

    // Try to find character info from library
    let charInfo: any = null;
    let isCharacter = node.nodeType === 'character';
    
    if (isCharacter) {
        const charNode = node as CharacterNodeData;
        charInfo = psdCharacters.find(c => c.id === charNode.characterId) || 
                   flaCharacters.find(c => c.id === charNode.characterId);
    }

    const { transform } = node;

    const updateTrans = (patch: any) => {
        manager.updateTransform(node.id, patch);
    };

    // ── Keyframe helpers ──
    const allKeyframes = node.keyframes || {};
    const keyframeEntries: { property: string; time: number; value: number; easing: EasingType }[] = [];
    Object.entries(allKeyframes).forEach(([prop, kfs]) => {
        (kfs as Keyframe[]).forEach(kf => {
            keyframeEntries.push({ property: prop, time: kf.time, value: kf.value, easing: kf.easing });
        });
    });
    keyframeEntries.sort((a, b) => a.time - b.time || a.property.localeCompare(b.property));

    // ── Frame Sequence (character only) ──
    const charNode = isCharacter ? (node as CharacterNodeData) : null;
    const frameSequence = charNode?.frameSequence || [];

    return (
        <Tabs defaultValue="transform" className="flex flex-col h-full w-full">
            <TabsList className="w-full flex rounded-none bg-black/40 border-b border-white/10 p-0 shrink-0">
                <TabsTrigger 
                    value="transform" 
                    className="flex-1 rounded-none data-[state=active]:bg-white/5 data-[state=active]:border-b-2 data-[state=active]:border-indigo-500 gap-1 text-[9px] uppercase font-bold tracking-wider py-2.5 px-1"
                >
                    <Move className="w-3 h-3" /> Trans
                </TabsTrigger>
                {isCharacter && charInfo && charInfo.layer_groups && (
                    <TabsTrigger 
                        value="character" 
                        className="flex-1 rounded-none data-[state=active]:bg-white/5 data-[state=active]:border-b-2 data-[state=active]:border-indigo-500 gap-1 text-[9px] uppercase font-bold tracking-wider py-2.5 px-1"
                    >
                        <UserSquare2 className="w-3 h-3" /> Pose
                    </TabsTrigger>
                )}
                <TabsTrigger 
                    value="keyframes" 
                    className="flex-1 rounded-none data-[state=active]:bg-white/5 data-[state=active]:border-b-2 data-[state=active]:border-amber-500 gap-1 text-[9px] uppercase font-bold tracking-wider py-2.5 px-1"
                >
                    <Key className="w-3 h-3" /> KF
                </TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto p-3 min-h-0">
                {/* ════════════════════════════════════
                    TRANSFORM TAB 
                ════════════════════════════════════ */}
                <TabsContent value="transform" className="m-0 flex flex-col gap-4">
                    <div className="flex items-center justify-between mb-1">
                        <h3 className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">{node.name}</h3>
                        <span className="text-[8px] text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded capitalize">{node.nodeType}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <Label className="text-[9px]">X</Label>
                            <Input type="number" className="h-7 text-[10px]" value={Math.round(transform.x)} onChange={(e) => updateTrans({ x: Number(e.target.value) })} />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[9px]">Y</Label>
                            <Input type="number" className="h-7 text-[10px]" value={Math.round(transform.y)} onChange={(e) => updateTrans({ y: Number(e.target.value) })} />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[9px]">Scale X</Label>
                            <Input type="number" step="0.1" className="h-7 text-[10px]" value={transform.scaleX.toFixed(2)} onChange={(e) => updateTrans({ scaleX: Number(e.target.value) })} />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[9px]">Scale Y</Label>
                            <Input type="number" step="0.1" className="h-7 text-[10px]" value={transform.scaleY.toFixed(2)} onChange={(e) => updateTrans({ scaleY: Number(e.target.value) })} />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[9px]">Rotation °</Label>
                            <Input type="number" className="h-7 text-[10px]" value={Math.round(transform.rotation)} onChange={(e) => updateTrans({ rotation: Number(e.target.value) })} />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[9px]">Opacity</Label>
                            <Input type="number" step="0.1" max="1" min="0" className="h-7 text-[10px]" value={node.opacity ?? 1} onChange={(e) => {
                                manager.updateNode(node.id, { opacity: Number(e.target.value) });
                            }} />
                        </div>
                    </div>
                </TabsContent>

                {/* ════════════════════════════════════
                    CHARACTER POSE/FACE TAB 
                ════════════════════════════════════ */}
                {isCharacter && charInfo && charInfo.layer_groups && (
                    <TabsContent value="character" className="m-0 flex flex-col gap-5">
                        <h3 className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1">
                            {selectedBlock.frameIndex !== undefined 
                                ? `Frame #${selectedBlock.frameIndex}` 
                                : `Base Config`}
                        </h3>
                        
                        {Object.entries(charInfo.layer_groups).map(([groupName, variants]) => {
                            if ((variants as any[]).length <= 1) return null;
                            const cn = node as CharacterNodeData;
                            const idx = selectedBlock.frameIndex;
                            let currentSelectedVal = '';
                            
                            if (idx !== undefined && cn.frameSequence && cn.frameSequence[idx]) {
                                const activeLayers = cn.frameSequence[idx].layers || {};
                                currentSelectedVal = activeLayers[groupName] || cn.activeLayers[groupName] || '';
                            } else {
                                currentSelectedVal = cn.activeLayers[groupName] || '';
                            }

                            const gName = groupName.toLowerCase();
                            const isFaceNode = gName.includes('head') || gName.includes('face') || gName.includes('mouth') || gName.includes('eye') || gName.includes('hair') || 
                                               gName.includes('表情') || gName.includes('眼') || gName.includes('脸') || gName.includes('嘴') || gName.includes('头');

                            return (
                                <div key={groupName} className="flex flex-col gap-2">
                                    <Label className="text-[9px] text-indigo-400 font-mono bg-indigo-500/10 px-2 py-0.5 rounded w-fit capitalize">{groupName}</Label>
                                    <div className={`grid gap-1.5 ${isFaceNode ? 'grid-cols-4' : 'grid-cols-3'}`}>
                                        {(variants as any[]).map(variant => {
                                            const isSelected = currentSelectedVal === variant.name;
                                            
                                            let fullUrl = '';
                                            if (variant.path) {
                                                fullUrl = variant.path.startsWith('http') ? variant.path : `${STATIC_BASE}/${variant.path}`;
                                            } else if (variant.url) {
                                                fullUrl = variant.url.startsWith('http') ? variant.url : `${STATIC_BASE}/${variant.url}`;
                                            }
                                            
                                            return (
                                                <div 
                                                    key={variant.hash || variant.name}
                                                    onClick={() => {
                                                        if (idx !== undefined && cn.frameSequence && cn.frameSequence[idx]) {
                                                            updateCharacterFrameLayers(cn.id, selectedBlock.sceneId, idx, { [groupName]: variant.name });
                                                        } else {
                                                            manager.updateNode(cn.id, { 
                                                                activeLayers: { ...cn.activeLayers, [groupName]: variant.name }
                                                            });
                                                        }
                                                    }}
                                                    className={`aspect-square rounded-lg bg-slate-200 overflow-hidden flex items-center justify-center cursor-pointer border transition-all relative ${
                                                        isSelected ? 'border-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.6)] z-10' : 'border-transparent hover:border-indigo-400/50'
                                                    }`}
                                                    title={variant.name}
                                                >
                                                    {fullUrl ? (
                                                        <img 
                                                            src={fullUrl} 
                                                            className="w-full h-full pointer-events-none bg-white"
                                                            style={isFaceNode ? {
                                                                objectFit: 'cover',
                                                                objectPosition: 'center top',
                                                                transform: 'scale(2.5) translateY(10%)',
                                                            } : {
                                                                objectFit: 'contain'
                                                            }}
                                                            draggable={false} 
                                                        />
                                                    ) : (
                                                        <span className="text-[7px] text-slate-800 text-center px-0.5 font-bold">{variant.name}</span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </TabsContent>
                )}

                {/* ════════════════════════════════════
                    KEYFRAMES TAB
                ════════════════════════════════════ */}
                <TabsContent value="keyframes" className="m-0 flex flex-col gap-4">
                    
                    {/* ── Frame Sequence Editor (Character only) ── */}
                    {isCharacter && frameSequence.length > 0 && (
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                                <h4 className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">
                                    🎭 Frame Sequence ({frameSequence.length})
                                </h4>
                                <button
                                    onClick={() => addCharacterFrame(node.id, selectedBlock.sceneId, localTime)}
                                    className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px] bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition"
                                >
                                    <Plus className="w-3 h-3" /> Add
                                </button>
                            </div>
                            
                            <div className="space-y-1">
                                {frameSequence.map((frame: any, fIdx: number) => {
                                    const isActive = selectedBlock.frameIndex === fIdx;
                                    return (
                                        <div
                                            key={fIdx}
                                            className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-[10px] cursor-pointer transition-all ${
                                                isActive
                                                    ? 'bg-indigo-500/20 border border-indigo-500/40'
                                                    : 'bg-white/5 border border-transparent hover:bg-white/10'
                                            }`}
                                            onClick={() => {
                                                useSceneGraphStore.getState().setSelectedBlock({
                                                    ...selectedBlock,
                                                    frameIndex: fIdx,
                                                });
                                            }}
                                        >
                                            {/* Frame index */}
                                            <span className="text-[8px] text-neutral-500 font-mono w-4">#{fIdx}</span>
                                            
                                            {/* Time input */}
                                            <input
                                                type="number"
                                                step="0.1"
                                                min="0"
                                                value={frame.time?.toFixed(2) || '0.00'}
                                                onClick={(e) => e.stopPropagation()}
                                                onChange={(e) => {
                                                    const newTime = parseFloat(e.target.value);
                                                    if (!isNaN(newTime) && newTime >= 0) {
                                                        scene.manager.updateCharacterFrameTime(node.id, fIdx, newTime);
                                                    }
                                                }}
                                                className="w-14 bg-black/40 border border-white/10 rounded px-1 py-0.5 text-[9px] font-mono text-cyan-300 text-center focus:border-cyan-500/50 focus:outline-none"
                                                title="Time (seconds)"
                                            />
                                            <span className="text-[8px] text-neutral-600">s</span>

                                            {/* Pose/Face labels */}
                                            <div className="flex-1 flex gap-1 overflow-hidden">
                                                {frame.layers && Object.entries(frame.layers).map(([key, val]) => (
                                                    <span key={key} className="px-1 py-0.5 bg-indigo-500/10 text-indigo-300 text-[8px] rounded truncate max-w-[60px]" title={`${key}: ${val}`}>
                                                        {val as string}
                                                    </span>
                                                ))}
                                            </div>

                                            {/* Actions */}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    duplicateCharacterFrame(node.id, selectedBlock.sceneId, fIdx);
                                                }}
                                                className="w-5 h-5 flex items-center justify-center rounded bg-white/5 hover:bg-amber-500/20 text-neutral-500 hover:text-amber-400 transition"
                                                title="Duplicate"
                                            >
                                                <Copy className="w-3 h-3" />
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (frameSequence.length > 1) {
                                                        removeCharacterFrame(node.id, selectedBlock.sceneId, fIdx);
                                                    }
                                                }}
                                                disabled={frameSequence.length <= 1}
                                                className="w-5 h-5 flex items-center justify-center rounded bg-white/5 hover:bg-red-500/20 text-neutral-500 hover:text-red-400 transition disabled:opacity-20"
                                                title="Delete"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* ── Keyframe Table (All node types) ── */}
                    <div className="flex flex-col gap-2">
                        <h4 className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">
                            ⏱️ Property Keyframes ({keyframeEntries.length})
                        </h4>

                        {keyframeEntries.length > 0 ? (
                            <div className="rounded-md border border-white/10 overflow-hidden">
                                {/* Table header */}
                                <div className="grid grid-cols-[1fr_50px_50px_70px_28px] gap-1 px-2 py-1 bg-white/5 text-[8px] text-neutral-500 uppercase font-bold">
                                    <span>Prop</span>
                                    <span>Time</span>
                                    <span>Value</span>
                                    <span>Easing</span>
                                    <span></span>
                                </div>
                                {/* Table rows */}
                                {keyframeEntries.map((kf, i) => (
                                    <div key={`${kf.property}_${kf.time}_${i}`} className="grid grid-cols-[1fr_50px_50px_70px_28px] gap-1 px-2 py-1 border-t border-white/5 text-[9px] items-center hover:bg-white/5">
                                        <span className="text-amber-400 font-mono truncate">{kf.property}</span>
                                        <span className="text-cyan-300 font-mono">{kf.time.toFixed(2)}</span>
                                        <span className="text-white font-mono">{typeof kf.value === 'number' ? kf.value.toFixed(1) : kf.value}</span>
                                        <span className="text-neutral-500 text-[8px]">{kf.easing}</span>
                                        <button
                                            onClick={() => removeKeyframe(node.id, kf.property, kf.time)}
                                            className="w-5 h-5 flex items-center justify-center rounded hover:bg-red-500/20 text-neutral-600 hover:text-red-400 transition"
                                            title="Remove keyframe"
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-[9px] text-neutral-600 italic py-2">No keyframes. Add one below.</div>
                        )}

                        {/* Add Keyframe Form */}
                        <div className="rounded-lg border border-white/10 bg-white/5 p-2 space-y-2">
                            <span className="text-[9px] font-bold text-neutral-400">➕ Add Keyframe</span>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-0.5">
                                    <Label className="text-[8px]">Property</Label>
                                    <select
                                        value={newKfProp}
                                        onChange={e => setNewKfProp(e.target.value)}
                                        className="w-full bg-black/40 rounded px-1.5 py-1 text-[9px] border border-white/10 text-neutral-300 focus:outline-none focus:border-cyan-500/50"
                                    >
                                        {ANIMATABLE_PROPS.map(p => (
                                            <option key={p} value={p}>{p}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-0.5">
                                    <Label className="text-[8px]">Easing</Label>
                                    <select
                                        value={newKfEasing}
                                        onChange={e => setNewKfEasing(e.target.value as EasingType)}
                                        className="w-full bg-black/40 rounded px-1.5 py-1 text-[9px] border border-white/10 text-neutral-300 focus:outline-none focus:border-cyan-500/50"
                                    >
                                        {EASING_OPTIONS.map(e => (
                                            <option key={e} value={e}>{e}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-0.5">
                                    <Label className="text-[8px]">Time (s)</Label>
                                    <Input type="number" step="0.1" min="0" className="h-6 text-[9px]" value={newKfTime} onChange={e => setNewKfTime(e.target.value)} />
                                </div>
                                <div className="space-y-0.5">
                                    <Label className="text-[8px]">Value</Label>
                                    <Input type="number" step="0.1" className="h-6 text-[9px]" value={newKfValue} onChange={e => setNewKfValue(e.target.value)} />
                                </div>
                            </div>
                            <button
                                onClick={() => {
                                    const time = parseFloat(newKfTime);
                                    const value = parseFloat(newKfValue);
                                    if (!isNaN(time) && !isNaN(value)) {
                                        addKeyframe(node.id, newKfProp, { time, value, easing: newKfEasing });
                                    }
                                }}
                                className="w-full py-1.5 rounded text-[9px] font-bold bg-gradient-to-r from-cyan-500/20 to-indigo-500/20 text-cyan-300 hover:from-cyan-500/30 hover:to-indigo-500/30 border border-cyan-500/20 transition"
                            >
                                <Plus className="w-3 h-3 inline mr-1" />
                                Add Keyframe
                            </button>
                        </div>
                    </div>
                </TabsContent>
            </div>
        </Tabs>
    );
};

export default SceneGraphPropertiesPanel;
