/**
 * SceneGraphPropertiesPanel — Premium property editor (OpenCut / ScreenFlow style)
 *
 * Implements a flawless, dark-mode focused UI with:
 * 1. NumberScrubbers (Drag-to-adjust labels)
 * 2. Glassmorphic tabs
 * 3. Smooth animated thumbnails
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useSceneGraphStore } from '@/stores/useSceneGraphStore';
import { useAppStore } from '@/stores/useAppStore';
import { useCharacterV2Store } from '@/stores/useCharacterV2Store';
import { STATIC_BASE } from '@/config/api';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Move, UserSquare2, Key, Plus, Trash2, Copy, ChevronLeft, ChevronRight, Eye, EyeOff, Lock, Unlock, FlipHorizontal2 } from 'lucide-react';
import type { AnyNodeData, CharacterNodeData, EasingType, Keyframe } from '@/core/scene-graph/types';

// ══════════════════════════════════════════════
//  Number Scrubber Component (Premium UX)
// ══════════════════════════════════════════════
interface NumberScrubberProps {
    label: string;
    value: number;
    onChange: (val: number) => void;
    step?: number;
    min?: number;
    max?: number;
    suffix?: string;
}

const NumberScrubber: React.FC<NumberScrubberProps> = ({ label, value, onChange, step = 1, min = -Infinity, max = Infinity, suffix = '' }) => {
    const [isDragging, setIsDragging] = useState(false);
    const startPos = useRef({ x: 0, val: 0 });

    const handlePointerDown = (e: React.PointerEvent) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setIsDragging(true);
        startPos.current = { x: e.clientX, val: value };
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isDragging) return;
        const dx = e.clientX - startPos.current.x;
        // Sensitivity factor based on step
        const sensitivity = step < 1 ? 0.05 : 1;
        let newVal = startPos.current.val + (dx * sensitivity);
        
        // Snap to step grid to prevent crazy decimals
        const inv = 1.0 / step;
        newVal = Math.round(newVal * inv) / inv;
        
        if (newVal < min) newVal = min;
        if (newVal > max) newVal = max;
        onChange(newVal);
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        setIsDragging(false);
        e.currentTarget.releasePointerCapture(e.pointerId);
    };

    const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        let v = parseFloat(e.target.value);
        if (!isNaN(v)) {
            if (v < min) v = min;
            if (v > max) v = max;
            onChange(v);
        }
    };

    const nudge = (dir: 1 | -1) => {
        let v = value + (dir * step);
        if (v < min) v = min;
        if (v > max) v = max;
        onChange(v);
    };

    return (
        <div className="flex flex-col gap-1.5 group">
            <Label 
                className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider cursor-ew-resize hover:text-indigo-400 select-none transition-colors w-fit flex items-center gap-1"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                title="Drag horizontally to adjust"
            >
                {label}
            </Label>
            <div className={`flex items-center bg-[#18181b] border ${isDragging ? 'border-indigo-500' : 'border-zinc-800'} group-hover:border-zinc-700 focus-within:border-indigo-500/50 rounded-md overflow-hidden transition-colors h-7`}>
                <button onClick={() => nudge(-1)} className="w-5 h-full flex items-center justify-center text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors">
                    <ChevronLeft className="w-3 h-3" />
                </button>
                <input 
                    type="number"
                    step={step}
                    value={step < 1 ? value.toFixed(2) : Math.round(value)}
                    onChange={handleInput}
                    className="flex-1 w-0 bg-transparent text-[10px] text-center font-mono text-zinc-200 focus:outline-none placeholder:text-zinc-600 appearance-none"
                    style={{ MozAppearance: 'textfield' }}
                />
                {suffix && <span className="text-[9px] text-zinc-600 pr-1 select-none font-mono">{suffix}</span>}
                <button onClick={() => nudge(1)} className="w-5 h-full flex items-center justify-center text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors">
                    <ChevronRight className="w-3 h-3" />
                </button>
            </div>
        </div>
    );
};

// ══════════════════════════════════════════════
//  Main Panel 
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
    const toggleNodeVisibility = useSceneGraphStore(s => s.toggleNodeVisibility);
    const toggleNodeLock = useSceneGraphStore(s => s.toggleNodeLock);
    const flipCharacter = useSceneGraphStore(s => s.flipCharacter);
    const lockedNodes = useSceneGraphStore(s => s.lockedNodes);
    const setNodeZIndex = useSceneGraphStore(s => s.setNodeZIndex);
    
    // Subscribe tightly to trigger re-renders
    useSceneGraphStore(s => s.snapshot); 

    const [newKfProp, setNewKfProp] = useState('x');
    const [newKfTime, setNewKfTime] = useState('0.0');
    const [newKfValue, setNewKfValue] = useState('0');
    const [newKfEasing, setNewKfEasing] = useState<EasingType>('easeOutCubic');

    if (!selectedBlock) {
        return (
            <div className="h-full w-full flex flex-col items-center justify-center opacity-30 text-center gap-2 bg-[#0e0e0e]">
                <div className="text-2xl opacity-50 grayscale blend-screen">✨</div>
                <span className="text-[10px] text-zinc-400">Select a block on the timeline<br/>or a node to edit properties</span>
            </div>
        );
    }

    const scene = scenes.find(s => s.id === selectedBlock.sceneId);
    if (!scene) return null;

    const manager = scene.manager;
    const node = manager.getNode(selectedBlock.nodeId);

    if (!node) {
        return (
            <div className="h-full w-full flex flex-col items-center justify-center text-center opacity-30 gap-2 bg-[#0e0e0e]">
                <div className="text-2xl">🔒</div>
                <span className="text-[10px]">Node not found</span>
            </div>
        );
    }

    let charInfo: any = null;
    let isCharacter = node.nodeType === 'character';
    
    if (isCharacter) {
        const charNode = node as CharacterNodeData;
        charInfo = psdCharacters.find(c => c.id === charNode.characterId) || 
                   flaCharacters.find(c => c.id === charNode.characterId);
    }

    const { transform } = node;
    const updateTrans = (patch: any) => manager.updateTransform(node.id, patch);

    const allKeyframes = node.keyframes || {};
    const keyframeEntries: { property: string; time: number; value: number; easing: EasingType }[] = [];
    Object.entries(allKeyframes).forEach(([prop, kfs]) => {
        (kfs as Keyframe[]).forEach(kf => {
            keyframeEntries.push({ property: prop, time: kf.time, value: kf.value, easing: kf.easing });
        });
    });
    keyframeEntries.sort((a, b) => a.time - b.time || a.property.localeCompare(b.property));

    const charNode = isCharacter ? (node as CharacterNodeData) : null;
    const frameSequence = charNode?.frameSequence || [];

    return (
        <Tabs defaultValue="transform" className="flex flex-col h-full w-full bg-[#0e0e0e] text-zinc-100">
            {/* ── Premium Glass Tab List ── */}
            <TabsList className="w-full flex rounded-none bg-[#121214]/80 backdrop-blur-md border-b border-zinc-800/80 p-0 shrink-0 z-10 sticky top-0 shadow-sm">
                <TabsTrigger 
                    value="transform" 
                    className="flex-1 rounded-none data-[state=active]:bg-[#18181b] data-[state=active]:text-indigo-400 data-[state=active]:border-b-2 data-[state=active]:border-indigo-500 gap-1.5 text-[9px] uppercase font-bold tracking-wider py-3 px-1 transition-all"
                >
                    <Move className="w-3 h-3" /> Trans
                </TabsTrigger>
                {(isCharacter && (charInfo?.layer_groups || (node as CharacterNodeData)?.availableLayers)) && (
                    <TabsTrigger 
                        value="character" 
                        className="flex-1 rounded-none data-[state=active]:bg-[#18181b] data-[state=active]:text-indigo-400 data-[state=active]:border-b-2 data-[state=active]:border-indigo-500 gap-1.5 text-[9px] uppercase font-bold tracking-wider py-3 px-1 transition-all"
                    >
                        <UserSquare2 className="w-3 h-3" /> Pose
                    </TabsTrigger>
                )}
                <TabsTrigger 
                    value="keyframes" 
                    className="flex-1 rounded-none data-[state=active]:bg-[#18181b] data-[state=active]:text-amber-400 data-[state=active]:border-b-2 data-[state=active]:border-amber-500 gap-1.5 text-[9px] uppercase font-bold tracking-wider py-3 px-1 transition-all"
                >
                    <Key className="w-3 h-3" /> KF
                </TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto p-4 min-h-0 space-y-4 custom-scrollbar">
                
                {/* ════════════════════════════════════
                    TRANSFORM TAB 
                ════════════════════════════════════ */}
                <TabsContent value="transform" className="m-0 flex flex-col gap-6 animate-in fade-in duration-200">
                    <div className="flex items-center gap-2 pb-2 border-b border-zinc-800">
                        <span className="w-6 h-6 rounded bg-zinc-800 flex items-center justify-center shrink-0 shadow-inner">
                            <Move className="w-3.5 h-3.5 text-zinc-400" />
                        </span>
                        <div className="flex flex-col flex-1">
                            <h3 className="text-[11px] font-bold text-zinc-200 uppercase tracking-wider truncate max-w-[100px]">{node.name}</h3>
                            <span className="text-[8px] text-zinc-500 uppercase tracking-widest">{node.nodeType}</span>
                        </div>

                        {/* Quick Actions Integration */}
                        <div className="flex items-center gap-1">
                            {isCharacter && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); flipCharacter(selectedBlock.nodeId); }}
                                    className="w-6 h-6 flex items-center justify-center rounded bg-[#18181b] border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 hover:border-zinc-600 transition-all"
                                    title="Flip / Mirror (F)"
                                >
                                    <FlipHorizontal2 className="w-3 h-3" />
                                </button>
                            )}
                            <button
                                onClick={(e) => { e.stopPropagation(); toggleNodeVisibility(selectedBlock.nodeId); }}
                                className={`w-6 h-6 flex items-center justify-center rounded border transition-all ${node.visible !== false ? 'bg-[#18181b] border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}
                                title="Toggle Visibility (H)"
                            >
                                {node.visible !== false ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); toggleNodeLock(selectedBlock.nodeId); }}
                                className={`w-6 h-6 flex items-center justify-center rounded border transition-all ${lockedNodes.has(selectedBlock.nodeId) ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : 'bg-[#18181b] border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800'}`}
                                title="Toggle Lock (L)"
                            >
                                {lockedNodes.has(selectedBlock.nodeId) ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <NumberScrubber label="Position X" value={transform.x} onChange={v => updateTrans({ x: v })} step={1} />
                        <NumberScrubber label="Position Y" value={transform.y} onChange={v => updateTrans({ y: v })} step={1} />
                        
                        <NumberScrubber label="Scale X" value={transform.scaleX} onChange={v => updateTrans({ scaleX: v })} step={0.05} />
                        <NumberScrubber label="Scale Y" value={transform.scaleY} onChange={v => updateTrans({ scaleY: v })} step={0.05} />
                        
                        <div className="col-span-2 grid grid-cols-2 gap-4">
                            <NumberScrubber label="Rotation" value={transform.rotation} onChange={v => updateTrans({ rotation: v })} step={1} suffix="°" />
                            <NumberScrubber label="Z-Index" value={node.zIndex ?? 0} onChange={v => setNodeZIndex(selectedBlock!.nodeId, v)} step={5} />
                        </div>
                    </div>

                    {/* Premium Opacity Slider */}
                    <div className="space-y-4 pt-4 border-t border-zinc-800">
                        <div className="flex items-center justify-between">
                            <Label className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider">Opacity</Label>
                            <span className="text-[10px] font-mono text-zinc-400 bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800">
                                {Math.round((node.opacity ?? 1) * 100)}%
                            </span>
                        </div>
                        <Slider 
                            value={[node.opacity ?? 1]} 
                            max={1} min={0} step={0.01}
                            className="[&>span:first-child]:bg-zinc-800 [&_[role=slider]]:bg-indigo-500 [&_[role=slider]]:border-none [&_[role=slider]]:shadow-[0_0_10px_rgba(99,102,241,0.5)]"
                            onValueChange={val => manager.updateNode(node.id, { opacity: val[0] })} 
                        />
                    </div>
                </TabsContent>

                {/* ════════════════════════════════════
                    CHARACTER POSE TAB
                ════════════════════════════════════ */}
                {(isCharacter && (charInfo?.layer_groups || (node as CharacterNodeData)?.availableLayers)) && (
                    <TabsContent value="character" className="m-0 flex flex-col gap-6 animate-in slide-in-from-right-4 duration-300">
                        <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                            <div className="flex flex-col">
                                <h3 className="text-[11px] font-bold text-zinc-200 uppercase tracking-wider">Appearance</h3>
                                <span className="text-[8px] text-zinc-500 uppercase tracking-widest">
                                    {selectedBlock.frameIndex !== undefined ? `TARGET: Frame #${selectedBlock.frameIndex}` : `TARGET: Base Config`}
                                </span>
                            </div>
                        </div>
                        
                        {Object.entries(charInfo?.layer_groups || (node as CharacterNodeData).availableLayers || {}).map(([groupName, variants]) => {
                            if (!variants || (variants as any[]).length <= 1) return null;
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
                            const isFaceNode = gName.includes('head') || gName.includes('face') || gName.includes('mouth') || gName.includes('eye') || gName.includes('hair');

                            return (
                                <div key={groupName} className="flex flex-col gap-2 bg-[#121214] p-3 rounded-xl border border-zinc-800/50">
                                    <div className="flex items-center justify-between mb-1">
                                        <Label className="text-[9px] text-indigo-400 font-bold uppercase tracking-widest">{groupName}</Label>
                                        <span className="text-[8px] text-zinc-600 font-mono">{(variants as any[]).length} options</span>
                                    </div>
                                    <div className={`grid gap-2 ${isFaceNode ? 'grid-cols-4' : 'grid-cols-3'}`}>
                                        {(variants as any[]).map(variant => {
                                            const isStr = typeof variant === 'string';
                                            const vName = isStr ? variant : variant.name;
                                            const vHash = isStr ? variant : (variant.hash || variant.name);
                                            const isSelected = currentSelectedVal === vName;
                                            
                                            let fullUrl = '';
                                            if (!isStr) {
                                                if (variant.path) {
                                                    fullUrl = variant.path.startsWith('http') ? variant.path : `${STATIC_BASE}/${variant.path}`;
                                                } else if (variant.url) {
                                                    fullUrl = variant.url.startsWith('http') ? variant.url : `${STATIC_BASE}/${variant.url}`;
                                                }
                                            }
                                            
                                            // OpenCut-style selected states
                                            return (
                                                <div 
                                                    key={vHash}
                                                    onClick={() => {
                                                        if (idx !== undefined && cn.frameSequence && cn.frameSequence[idx]) {
                                                            updateCharacterFrameLayers(cn.id, selectedBlock.sceneId, idx, { [groupName]: vName });
                                                        } else {
                                                            manager.updateNode(cn.id, { 
                                                                activeLayers: { ...cn.activeLayers, [groupName]: vName }
                                                            });
                                                            useSceneGraphStore.getState().evaluate();
                                                        }
                                                    }}
                                                    className={`
                                                        aspect-square rounded-lg flex flex-col items-center justify-center cursor-pointer transition-all duration-200 relative group
                                                        ${isSelected 
                                                            ? 'bg-[#18181b] ring-2 ring-indigo-500 ring-offset-2 ring-offset-[#121214]' 
                                                            : 'bg-[#18181b] border border-zinc-800 hover:border-indigo-400/50 hover:scale-[1.02]'
                                                        }
                                                        ${fullUrl ? 'overflow-hidden' : 'p-2'}
                                                    `}
                                                    title={vName}
                                                >
                                                    {fullUrl ? (
                                                        <div className="w-full h-full p-1 flex items-center justify-center">
                                                            <div className="w-full h-full rounded-md overflow-hidden bg-white/5 relative">
                                                                <img 
                                                                    src={fullUrl} 
                                                                    className="w-full h-full pointer-events-none drop-shadow-lg"
                                                                    style={isFaceNode ? {
                                                                        objectFit: 'cover',
                                                                        objectPosition: 'center top',
                                                                        transform: 'scale(2.2) translateY(8%)',
                                                                    } : {
                                                                        objectFit: 'contain'
                                                                    }}
                                                                    draggable={false} 
                                                                />
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <span className="text-[10px] text-zinc-400 text-center font-medium line-clamp-2 leading-tight select-none pointer-events-none">{vName}</span>
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
                <TabsContent value="keyframes" className="m-0 flex flex-col gap-6 animate-in slide-in-from-right-4 duration-300">
                    
                    {/* Frame Sequence Editor (Character) */}
                    {isCharacter && frameSequence.length > 0 && (
                        <div className="flex flex-col gap-3">
                            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                                <h4 className="text-[10px] font-bold text-amber-400 uppercase tracking-widest flex items-center gap-1.5">
                                    <Key className="w-3 h-3" /> Frame Sequence
                                </h4>
                                <button
                                    onClick={() => addCharacterFrame(node.id, selectedBlock.sceneId, localTime)}
                                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 text-[9px] font-bold transition-colors"
                                >
                                    <Plus className="w-3 h-3" /> Add Frame
                                </button>
                            </div>
                            
                            <div className="space-y-1.5">
                                {frameSequence.map((frame: any, fIdx: number) => {
                                    const isActive = selectedBlock.frameIndex === fIdx;
                                    return (
                                        <div
                                            key={fIdx}
                                            className={`flex items-center gap-2 p-1.5 rounded-lg text-[10px] cursor-pointer transition-all border ${
                                                isActive
                                                    ? 'bg-amber-500/5 border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.05)]'
                                                    : 'bg-[#18181b] border-zinc-800 hover:border-zinc-700'
                                            }`}
                                            onClick={() => {
                                                useSceneGraphStore.getState().setSelectedBlock({ ...selectedBlock, frameIndex: fIdx });
                                            }}
                                        >
                                            <span className={`text-[8px] font-mono w-4 text-center ${isActive ? 'text-amber-400' : 'text-zinc-600'}`}>#{fIdx}</span>
                                            
                                            <div className="flex items-center gap-1 bg-[#0e0e0e] border border-zinc-800 rounded px-1.5 py-0.5 focus-within:border-amber-500/50 transition-colors">
                                                <input
                                                    type="number"
                                                    step="0.1"
                                                    min="0"
                                                    value={frame.time?.toFixed(2) || '0.00'}
                                                    onClick={e => e.stopPropagation()}
                                                    onChange={e => {
                                                        const newTime = parseFloat(e.target.value);
                                                        if (!isNaN(newTime) && newTime >= 0) {
                                                            scene.manager.updateCharacterFrameTime(node.id, fIdx, newTime);
                                                        }
                                                    }}
                                                    className="w-10 bg-transparent text-[10px] font-mono text-zinc-300 text-center focus:outline-none appearance-none"
                                                />
                                                <span className="text-[8px] text-zinc-600">s</span>
                                            </div>

                                            <div className="flex-1 flex gap-1 overflow-x-auto custom-scrollbar pb-0.5">
                                                {frame.layers && Object.entries(frame.layers).map(([key, val]) => (
                                                    <span key={key} className="px-1.5 py-0.5 bg-zinc-800/50 border border-zinc-700/50 text-zinc-300 text-[8px] rounded whitespace-nowrap">
                                                        {val as string}
                                                    </span>
                                                ))}
                                            </div>

                                            <div className="flex items-center gap-0.5 pr-1 shrink-0">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); duplicateCharacterFrame(node.id, selectedBlock.sceneId, fIdx); }}
                                                    className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-zinc-800 text-zinc-500 hover:text-white transition-colors"
                                                >
                                                    <Copy className="w-3 h-3" />
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); if (frameSequence.length > 1) removeCharacterFrame(node.id, selectedBlock.sceneId, fIdx); }}
                                                    disabled={frameSequence.length <= 1}
                                                    className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-red-500/10 text-zinc-500 hover:text-red-400 transition-colors disabled:opacity-20"
                                                >
                                                    <Trash2 className="w-3 h-3" />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Standard Property Keyframes */}
                    <div className="flex flex-col gap-3 pt-2">
                        <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                            <h4 className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest flex items-center gap-1.5">
                                <Move className="w-3 h-3" /> Property Keyframes
                            </h4>
                        </div>

                        {keyframeEntries.length > 0 ? (
                            <div className="rounded-lg border border-zinc-800/80 bg-[#121214] overflow-hidden">
                                <div className="grid grid-cols-[1fr_45px_45px_65px_28px] gap-1 px-3 py-2 border-b border-zinc-800/80 text-[8px] text-zinc-500 uppercase tracking-wider font-bold bg-[#18181b]/50">
                                    <span>Prop</span>
                                    <span>Time</span>
                                    <span>Value</span>
                                    <span>Easing</span>
                                    <span></span>
                                </div>
                                <div className="flex flex-col">
                                    {keyframeEntries.map((kf, i) => (
                                        <div key={`${kf.property}_${kf.time}_${i}`} className="grid grid-cols-[1fr_45px_45px_65px_28px] gap-1 px-3 py-1.5 border-b last:border-b-0 border-zinc-800/40 text-[9px] items-center hover:bg-[#18181b] transition-colors">
                                            <span className="text-cyan-400 font-mono truncate bg-cyan-400/10 px-1 py-0.5 rounded w-fit">{kf.property}</span>
                                            <span className="text-zinc-300 font-mono">{kf.time.toFixed(2)}s</span>
                                            <span className="text-zinc-100 font-mono">{typeof kf.value === 'number' ? kf.value.toFixed(1) : kf.value}</span>
                                            <span className="text-zinc-500 text-[8px] truncate">{kf.easing}</span>
                                            <button
                                                onClick={() => removeKeyframe(node.id, kf.property, kf.time)}
                                                className="w-5 h-5 ml-auto flex items-center justify-center rounded hover:bg-red-500/20 text-zinc-600 hover:text-red-400 transition"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="text-[10px] text-zinc-600 bg-[#121214] border border-zinc-800 border-dashed rounded-lg py-4 text-center">
                                No animation keyframes mapped.
                            </div>
                        )}

                        {/* Add Keyframe Premium Form */}
                        <div className="rounded-xl border border-zinc-800 bg-[#121214] p-3 space-y-3 mt-2 shadow-sm">
                            <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
                                <Plus className="w-3 h-3" /> Add Keyframe
                            </span>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label className="text-[8px] text-zinc-500 uppercase tracking-widest">Property</Label>
                                    <select
                                        value={newKfProp}
                                        onChange={e => setNewKfProp(e.target.value)}
                                        className="w-full bg-[#18181b] rounded-md px-2 py-1.5 text-[10px] font-mono border border-zinc-800 text-zinc-200 focus:outline-none focus:border-cyan-500/50 transition-colors"
                                    >
                                        {ANIMATABLE_PROPS.map(p => <option key={p} value={p}>{p}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[8px] text-zinc-500 uppercase tracking-widest">Easing</Label>
                                    <select
                                        value={newKfEasing}
                                        onChange={e => setNewKfEasing(e.target.value as EasingType)}
                                        className="w-full bg-[#18181b] rounded-md px-2 py-1.5 text-[10px] font-mono border border-zinc-800 text-zinc-200 focus:outline-none focus:border-cyan-500/50 transition-colors"
                                    >
                                        {EASING_OPTIONS.map(e => <option key={e} value={e}>{e}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[8px] text-zinc-500 uppercase tracking-widest">Time (sec)</Label>
                                    <div className="flex items-center bg-[#18181b] border border-zinc-800 rounded-md px-2 overflow-hidden focus-within:border-cyan-500/50 transition-colors">
                                        <input type="number" step="0.1" min="0" className="w-full h-7 bg-transparent text-[10px] font-mono text-zinc-200 focus:outline-none appearance-none" value={newKfTime} onChange={e => setNewKfTime(e.target.value)} />
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[8px] text-zinc-500 uppercase tracking-widest">Target Value</Label>
                                    <div className="flex items-center bg-[#18181b] border border-zinc-800 rounded-md px-2 overflow-hidden focus-within:border-cyan-500/50 transition-colors">
                                        <input type="number" step="0.1" className="w-full h-7 bg-transparent text-[10px] font-mono text-zinc-200 focus:outline-none appearance-none" value={newKfValue} onChange={e => setNewKfValue(e.target.value)} />
                                    </div>
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
                                className="w-full py-2 rounded-lg text-[10px] font-bold bg-zinc-800 hover:bg-cyan-500/20 text-zinc-300 hover:text-cyan-300 border border-transparent hover:border-cyan-500/30 transition-all shadow-sm"
                            >
                                Insert Keyframe
                            </button>
                        </div>
                    </div>
                </TabsContent>
            </div>
        </Tabs>
    );
};

export default SceneGraphPropertiesPanel;
