import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, Settings, Layers, Film, FileText, MessageSquare, Wand2 } from 'lucide-react';
import AssetSidebar from './AssetSidebar';
import { useStudioStore } from '@/stores/useStudioStore';
import type { StudioLayer } from '@/stores/useStudioStore';
import { useSceneGraphStore } from '@/stores/useSceneGraphStore';
import PropertiesPanel from './PropertiesPanel';
import { StageTransformer } from './StageTransformer';
import { BottomTimeline } from './BottomTimeline';
import { PixiStage } from './PixiStage';
import { SceneRenderer } from './SceneRenderer';
import { AIChatPanel } from './AIChatPanel';
import { ScriptImport } from './ScriptImport';
import { ExportDialog } from './ExportDialog';
import { AutoVideoPanel } from './AutoVideoPanel';
import { SceneTabs } from '@/components/SceneTabs';
import { SceneGraphTimeline } from './SceneGraphTimeline';
import SceneGraphPropertiesPanel from './SceneGraphPropertiesPanel';
import { SceneGraphTransformer } from './SceneGraphTransformer';

// ═══════════════════════════════════════════════════════════
// Stage Canvas — renders layers onto a 1920×1080 virtual viewport
const StageCanvas: React.FC<{ layers: StudioLayer[]; currentFrame: number }> = ({ layers, currentFrame }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(1);
    const selectedLayerId = useStudioStore(s => s.selectedLayerId);
    const setSelectedLayer = useStudioStore(s => s.setSelectedLayer);

    // Auto-fit the 1920×1080 canvas into the container
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const observer = new ResizeObserver(entries => {
            const { width, height } = entries[0].contentRect;
            const s = Math.min(width / 1920, height / 1080);
            setScale(s);
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    const visibleLayers = layers.filter(
        l => currentFrame >= l.startFrame && currentFrame < l.startFrame + l.durationInFrames
    );

    return (
        <div ref={containerRef} className="w-full h-full flex items-center justify-center overflow-hidden">
            <div
                style={{
                    width: Math.floor(1920 * scale),
                    height: Math.floor(1080 * scale),
                    position: 'relative',
                    overflow: 'hidden',
                    backgroundColor: '#111118',
                    borderRadius: '8px',
                    boxShadow: '0 0 80px rgba(99,102,241,0.08), 0 4px 32px rgba(0,0,0,0.5)',
                    border: '1px solid rgba(255,255,255,0.06)',
                }}
            >
                <div style={{
                    width: 1920,
                    height: 1080,
                    transform: `scale(${scale})`,
                    transformOrigin: 'top left',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                }}>
                {visibleLayers.length === 0 && (
                    <div style={{
                        position: 'absolute', inset: 0,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        color: 'white',
                    }}>
                        <div style={{ fontSize: 56, marginBottom: 16 }}>🎬</div>
                        <h1 style={{ fontSize: 36, fontWeight: 'bold', opacity: 0.8, letterSpacing: '0.05em' }}>Studio Stage</h1>
                        <p style={{ opacity: 0.35, marginTop: 8, fontSize: 15 }}>Upload PSD / FLA từ sidebar bên trái để bắt đầu</p>
                    </div>
                )}
                
                {/* 
                  Replace absolute DOM layout with a single bleeding-edge PixiJS <Stage>! 
                  It receives the layers and renders them as WebGL hardware sprites within the 1920x1080 canvas.
                */}
                <PixiStage layers={visibleLayers} onSelectLayer={setSelectedLayer} />

                {/* Transformer Bounds for Selected Layer (Overlayed above the Canvas) */}
                {selectedLayerId && visibleLayers.find(l => l.id === selectedLayerId) && (
                    <StageTransformer 
                        layer={visibleLayers.find(l => l.id === selectedLayerId)!} 
                        scale={scale} 
                    />
                )}

                {visibleLayers.length > 0 && (
                    <div style={{
                        position: 'absolute', bottom: 16, left: 16,
                        color: '#4ade80', fontSize: 12, fontFamily: 'monospace',
                        background: 'rgba(0,0,0,0.7)', padding: '4px 12px', borderRadius: 6,
                        zIndex: 99999,
                    }}>
                        {visibleLayers.length} layers visible
                    </div>
                )}
                </div>{/* inner 1920×1080 scaled div */}
            </div>{/* outer sized wrapper */}
        </div>
    );
};

// ═══════════════════════════════════════════════════════════
// Scene Graph Canvas — renders SceneGraph nodes via SceneRenderer
// ═══════════════════════════════════════════════════════════
const SceneGraphCanvas: React.FC = () => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(1);
    const currentTime = useSceneGraphStore(s => s.currentTime);
    const sceneNodeIds = useSceneGraphStore(s => s.sceneNodeIds);

    // Auto-fit
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const observer = new ResizeObserver(entries => {
            const { width, height } = entries[0].contentRect;
            const s = Math.min(width / 1920, height / 1080);
            setScale(s);
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    return (
        <div ref={containerRef} className="w-full h-full flex items-center justify-center overflow-hidden">
            <div
                style={{
                    width: Math.floor(1920 * scale),
                    height: Math.floor(1080 * scale),
                    position: 'relative',
                    overflow: 'hidden',
                    backgroundColor: '#111118',
                    borderRadius: '8px',
                    boxShadow: '0 0 80px rgba(6,182,212,0.08), 0 4px 32px rgba(0,0,0,0.5)',
                    border: '1px solid rgba(6,182,212,0.1)',
                }}
            >
                <div style={{
                    width: 1920,
                    height: 1080,
                    transform: `scale(${scale})`,
                    transformOrigin: 'top left',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                }}>
                    <SceneRenderer />
                    <SceneGraphTransformer scale={scale} />
                </div>

                {/* HUD Overlay */}
                <div style={{
                    position: 'absolute', bottom: 16, left: 16,
                    color: '#22d3ee', fontSize: 12, fontFamily: 'monospace',
                    background: 'rgba(0,0,0,0.7)', padding: '4px 12px', borderRadius: 6,
                    zIndex: 99999,
                }}>
                    t={currentTime.toFixed(2)}s · {sceneNodeIds.length} nodes · Scene Graph Mode
                </div>
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════
// Scene Graph Node List (Right Panel)
// ═══════════════════════════════════════════════════════════
const SceneNodeList: React.FC = () => {
    const sceneNodeIds = useSceneGraphStore(s => s.sceneNodeIds);
    const manager = useSceneGraphStore(s => s.manager);
    const snapshot = useSceneGraphStore(s => s.snapshot);
    const removeFromScene = useSceneGraphStore(s => s.removeFromScene);
    const scenes = useSceneGraphStore(s => s.scenes);
    const activeSceneIndex = useSceneGraphStore(s => s.activeSceneIndex);
    const setSelectedBlock = useSceneGraphStore(s => s.setSelectedBlock);
    const setSidebarTab = useSceneGraphStore(s => s.setSidebarTab);
    const activeSceneId = scenes[activeSceneIndex]?.id || 'unknown';

    return (
        <div className="flex-1 flex flex-col min-h-0">
            <div className="p-4 border-b border-white/5 flex items-center justify-between shrink-0">
                <h3 className="text-xs font-bold text-cyan-500 uppercase tracking-wider">Scene Nodes</h3>
                <span className="text-[10px] text-neutral-600 font-mono">{sceneNodeIds.length} nodes</span>
            </div>
            <div className="flex-1 overflow-y-auto min-h-[30%] p-3 space-y-1.5">
                {sceneNodeIds.length > 0 ? (
                    sceneNodeIds.map(id => {
                        const node = manager.getNode(id);
                        const snap = snapshot[id];
                        if (!node) return null;
                        return (
                            <div 
                                key={id} 
                                onClick={() => {
                                    setSelectedBlock({ nodeId: id, sceneId: activeSceneId });
                                    setSidebarTab('edit');
                                }}
                                className="text-[10px] rounded-lg p-2.5 bg-white/5 hover:bg-white/10 border border-white/5 transition-colors group cursor-pointer"
                            >
                                <div className="flex items-center justify-between pointer-events-none">
                                    <span className="font-bold text-white truncate flex-1">{node.name}</span>
                                    <span className="text-cyan-500/60 font-mono ml-2 text-[8px]">{node.nodeType}</span>
                                </div>
                                <div className="text-neutral-500 font-mono mt-1 pointer-events-none">
                                    pos({snap?.x?.toFixed(1)}, {snap?.y?.toFixed(1)}) · α={snap?.opacity?.toFixed(2)}
                                </div>
                                {node.nodeType === 'character' && (
                                    <div className="text-neutral-600 font-mono mt-0.5 pointer-events-none">
                                        pose: {(node as any).activeLayers?.pose} · face: {(node as any).activeLayers?.face}
                                    </div>
                                )}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        removeFromScene(id);
                                    }}
                                    className="text-[9px] text-red-500/50 hover:text-red-400 mt-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    Remove
                                </button>
                            </div>
                        );
                    })
                ) : (
                    <div className="text-center py-12 opacity-30 text-[10px] space-y-2">
                        <div className="text-3xl">🎭</div>
                        <p>No scene nodes</p>
                        <p>Add characters from sidebar</p>
                    </div>
                )}
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════
// Layer List (Right Panel) — Legacy mode
// ═══════════════════════════════════════════════════════════
const LayerList: React.FC<{ layers: StudioLayer[] }> = ({ layers }) => {
    const clearLayers = useStudioStore(s => s.clearLayers);
    const selectedLayerId = useStudioStore(s => s.selectedLayerId);
    const setSelectedLayer = useStudioStore(s => s.setSelectedLayer);

    const displayLayers = layers.filter((layer, index, self) => {
        if (!layer.characterId) return true;
        // Keep only the primary (first) layer for each character
        return self.findIndex(l => l.characterId === layer.characterId) === index;
    });

    return (
        <div className="w-64 border-l border-white/10 flex flex-col" style={{ backgroundColor: 'var(--surface-base)' }}>
            <div className="p-4 border-b border-white/5 flex items-center justify-between shrink-0">
                <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Layers</h3>
                {layers.length > 0 && (
                    <button
                        onClick={clearLayers}
                        className="text-[10px] text-red-400 hover:text-red-300 transition-colors"
                    >
                        Clear All
                    </button>
                )}
            </div>
            <div className="flex-1 overflow-y-auto min-h-[30%] p-3 space-y-1.5">
                {displayLayers.length > 0 ? (
                    displayLayers.map((l, i) => (
                        <div 
                            key={l.id} 
                            onClick={() => setSelectedLayer(l.id)}
                            className={`text-[10px] rounded-lg p-2.5 border transition-colors cursor-pointer group ${
                                selectedLayerId === l.id ? 'bg-indigo-500/20 border-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.2)]' : 'bg-white/5 hover:bg-white/10 border-white/5'
                            }`}
                        >
                            <div className="flex items-center justify-between">
                                <span className="font-bold text-white truncate flex-1">{l.name}</span>
                                <span className="text-neutral-600 font-mono ml-2">z{l.zIndex}</span>
                            </div>
                            <div className="text-neutral-500 font-mono mt-1">
                                pos({Math.round(l.x)}, {Math.round(l.y)}) · {Math.round(l.width)}×{Math.round(l.height)}
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="text-center py-12 opacity-30 text-[10px] space-y-2">
                        <div className="text-3xl">📂</div>
                        <p>No layers yet</p>
                        <p>Upload assets from sidebar</p>
                    </div>
                )}
            </div>

            {/* Properties Panel (Bottom Half) */}
            <div className="border-t border-white/10 p-4 h-[45%] shrink-0 overflow-y-auto flex flex-col min-h-0 bg-black/20">
                <PropertiesPanel />
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════
// Scene Graph Playback Controls — Multi-Scene Aware
// ═══════════════════════════════════════════════════════════
const ScenePlaybackBar: React.FC = () => {
    const currentTime = useSceneGraphStore(s => s.currentTime);
    const globalDuration = useSceneGraphStore(s => s.globalDuration);
    const duration = useSceneGraphStore(s => s.duration);
    const localTime = useSceneGraphStore(s => s.localTime);
    const isPlaying = useSceneGraphStore(s => s.isPlaying);
    const togglePlay = useSceneGraphStore(s => s.togglePlay);
    const setGlobalTime = useSceneGraphStore(s => s.setGlobalTime);
    const setTime = useSceneGraphStore(s => s.setTime);
    const scenes = useSceneGraphStore(s => s.scenes);
    const sceneBoundaries = useSceneGraphStore(s => s.sceneBoundaries);
    const activeSceneIndex = useSceneGraphStore(s => s.activeSceneIndex);
    const activeTransition = useSceneGraphStore(s => s.activeTransition);

    const isMultiScene = scenes.length > 1;
    const totalDur = isMultiScene ? globalDuration : duration;
    const displayTime = isMultiScene ? currentTime : localTime;

    // Scene segment colors
    const segColors = ['#06b6d4', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899', '#6366f1'];

    // Build gradient for multi-scene segments
    const buildTimelineGradient = () => {
        if (!isMultiScene || totalDur <= 0) {
            const pct = (displayTime / totalDur) * 100;
            return `linear-gradient(to right, #06b6d4 ${pct}%, rgba(255,255,255,0.1) ${pct}%)`;
        }
        const stops: string[] = [];
        const playPct = (displayTime / totalDur) * 100;
        sceneBoundaries.forEach((b, i) => {
            const startPct = (b.start / totalDur) * 100;
            const endPct = (b.end / totalDur) * 100;
            const col = segColors[i % segColors.length];
            const isBeforePlay = endPct <= playPct;
            const isActive = startPct <= playPct && endPct > playPct;

            if (isBeforePlay) {
                stops.push(`${col} ${startPct}%`, `${col} ${endPct}%`);
            } else if (isActive) {
                stops.push(`${col} ${startPct}%`, `${col} ${playPct}%`);
                stops.push(`rgba(255,255,255,0.08) ${playPct}%`, `rgba(255,255,255,0.08) ${endPct}%`);
            } else {
                stops.push(`rgba(255,255,255,0.08) ${startPct}%`, `rgba(255,255,255,0.08) ${endPct}%`);
            }
        });
        return `linear-gradient(to right, ${stops.join(', ')})`;
    };

    return (
        <div className="border-t border-cyan-500/20 flex flex-col" style={{ backgroundColor: 'var(--surface-sunken)' }}>
            {/* Scene Tabs — only show in multi-scene */}
            {isMultiScene && <SceneTabs mode="scene" />}

            {/* Playback controls */}
            <div className="h-14 flex items-center px-6 gap-4">
                <button
                    onClick={togglePlay}
                    className="px-4 py-1.5 rounded-lg text-xs font-bold transition-colors"
                    style={{
                        background: isPlaying
                            ? 'linear-gradient(135deg, #ef4444, #f97316)'
                            : 'linear-gradient(135deg, #06b6d4, #8b5cf6)',
                        boxShadow: isPlaying
                            ? '0 2px 12px rgba(239,68,68,0.3)'
                            : '0 2px 12px rgba(6,182,212,0.3)',
                    }}
                >
                    {isPlaying ? '⏸ Pause' : '▶ Play'}
                </button>

                {/* Timeline with scene markers */}
                <div className="flex-1 relative">
                    <input
                        type="range"
                        min={0}
                        max={totalDur}
                        step={0.01}
                        value={displayTime}
                        onChange={e => {
                            const t = parseFloat(e.target.value);
                            isMultiScene ? setGlobalTime(t) : setTime(t);
                        }}
                        className="w-full h-2 rounded-full appearance-none cursor-pointer relative z-10"
                        style={{ background: buildTimelineGradient() }}
                    />

                    {/* Scene boundary markers */}
                    {isMultiScene && sceneBoundaries.map((b, i) => {
                        if (i === 0) return null; // No marker at start
                        const pct = (b.start / totalDur) * 100;
                        return (
                            <div key={i}
                                className="absolute top-0 bottom-0 w-[2px] pointer-events-none z-20"
                                style={{
                                    left: `${pct}%`,
                                    background: 'rgba(255,255,255,0.25)',
                                }}
                            />
                        );
                    })}
                </div>

                {/* Time display */}
                <div className="text-right min-w-[130px]">
                    <span className="text-sm font-mono text-cyan-400">
                        {displayTime.toFixed(2)}s / {totalDur.toFixed(1)}s
                    </span>
                    {isMultiScene && (
                        <div className="text-[9px] font-mono text-neutral-500 mt-0.5">
                            Scene {activeSceneIndex + 1}/{scenes.length}
                            {activeTransition && (
                                <span className="ml-1 text-violet-400">⟷ {activeTransition.type}</span>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════
// Scene Graph Right Sidebar — Tabs: Auto | Nodes | AI Chat | Script
// ═══════════════════════════════════════════════════════════
const SceneGraphSidebar: React.FC = () => {
    const activeTab = useSceneGraphStore(s => s.sidebarTab);
    const setActiveTab = useSceneGraphStore(s => s.setSidebarTab);

    return (
        <div className="w-80 border-l border-white/10 flex flex-col" style={{ backgroundColor: 'var(--surface-base)' }}>
            {/* Tab Buttons */}
            <div className="flex border-b border-white/5 shrink-0">
                <button
                    onClick={() => setActiveTab('auto')}
                    className={`flex-1 flex items-center justify-center gap-1 px-1.5 py-2.5 text-[8px] font-bold uppercase tracking-wider transition-all ${
                        activeTab === 'auto'
                            ? 'text-amber-400 border-b-2 border-amber-400 bg-amber-500/5'
                            : 'text-neutral-500 hover:text-neutral-300'
                    }`}
                >
                    <Wand2 className="w-3 h-3" />
                    Auto
                </button>
                <button
                    onClick={() => setActiveTab('nodes')}
                    className={`flex-1 flex items-center justify-center gap-1 px-1.5 py-2.5 text-[8px] font-bold uppercase tracking-wider transition-all ${
                        activeTab === 'nodes'
                            ? 'text-cyan-400 border-b-2 border-cyan-400 bg-cyan-500/5'
                            : 'text-neutral-500 hover:text-neutral-300'
                    }`}
                >
                    <Layers className="w-3 h-3" />
                    Nodes
                </button>
                <button
                    onClick={() => setActiveTab('chat')}
                    className={`flex-1 flex items-center justify-center gap-1 px-1.5 py-2.5 text-[8px] font-bold uppercase tracking-wider transition-all ${
                        activeTab === 'chat'
                            ? 'text-violet-400 border-b-2 border-violet-400 bg-violet-500/5'
                            : 'text-neutral-500 hover:text-neutral-300'
                    }`}
                >
                    <MessageSquare className="w-3 h-3" />
                    Chat
                </button>
                <button
                    onClick={() => setActiveTab('script')}
                    className={`flex-1 flex items-center justify-center gap-1 px-1.5 py-2.5 text-[8px] font-bold uppercase tracking-wider transition-all ${
                        activeTab === 'script'
                            ? 'text-emerald-400 border-b-2 border-emerald-400 bg-emerald-500/5'
                            : 'text-neutral-500 hover:text-neutral-300'
                    }`}
                >
                    <FileText className="w-3 h-3" />
                    Script
                </button>
                <button
                    onClick={() => setActiveTab('edit')}
                    className={`flex-1 flex items-center justify-center gap-1 px-1.5 py-2.5 text-[8px] font-bold uppercase tracking-wider transition-all ${
                        activeTab === 'edit'
                            ? 'text-pink-400 border-b-2 border-pink-400 bg-pink-500/5'
                            : 'text-neutral-500 hover:text-neutral-300'
                    }`}
                >
                    <Settings className="w-3 h-3" />
                    Edit
                </button>
            </div>

            {/* Tab Content */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {activeTab === 'auto' && <AutoVideoPanel />}
                {activeTab === 'nodes' && <SceneNodeList />}
                {activeTab === 'chat' && <AIChatPanel />}
                {activeTab === 'script' && <ScriptImport />}
                {activeTab === 'edit' && <SceneGraphPropertiesPanel />}
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════
// Main Studio Mode
// ═══════════════════════════════════════════════════════════
const StudioMode: React.FC = () => {
    const durationInFrames = useStudioStore(s => s.durationInFrames);
    const layers = useStudioStore(s => s.layers);

    // Mode toggle: 'legacy' (PSD layers) vs 'scene' (Scene Graph)
    const [mode, setMode] = useState<'legacy' | 'scene'>('scene');
    const [showExport, setShowExport] = useState(false);

    const [currentFrame, setCurrentFrame] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const fps = 30;
    const rafRef = useRef<number | null>(null);
    const lastTimeRef = useRef<number>(0);

    // Playback loop (legacy mode only)
    useEffect(() => {
        if (mode !== 'legacy') return;
        if (!isPlaying) {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            return;
        }
        lastTimeRef.current = performance.now();
        const tick = (now: number) => {
            const delta = now - lastTimeRef.current;
            if (delta >= 1000 / fps) {
                lastTimeRef.current = now;
                setCurrentFrame(prev => {
                    const next = prev + 1;
                    if (next >= durationInFrames) {
                        setIsPlaying(false);
                        return 0;
                    }
                    return next;
                });
            }
            rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    }, [isPlaying, fps, durationInFrames, mode]);

    const onPlay = useCallback(() => setIsPlaying(true), []);
    const onPause = useCallback(() => setIsPlaying(false), []);
    const onSeek = useCallback((f: number) => setCurrentFrame(f), []);

    return (
        <div className="flex flex-col h-full w-full bg-[#0d0d14] text-white overflow-hidden">
            {/* Top Toolbar */}
            <div className="h-12 border-b border-white/10 flex items-center justify-between px-4" style={{ backgroundColor: 'var(--surface-raised)' }}>
                <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-indigo-400" />
                    <span className="font-semibold text-sm tracking-wide">AnimeStudio Director</span>
                </div>

                {/* Mode Toggle */}
                <div className="flex items-center gap-1 bg-black/40 rounded-lg p-0.5 border border-white/5">
                    <button
                        onClick={() => setMode('legacy')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${
                            mode === 'legacy'
                                ? 'bg-indigo-500/20 text-indigo-300 shadow-sm'
                                : 'text-neutral-500 hover:text-neutral-300'
                        }`}
                    >
                        <Layers className="w-3.5 h-3.5" />
                        Legacy
                    </button>
                    <button
                        onClick={() => setMode('scene')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${
                            mode === 'scene'
                                ? 'bg-cyan-500/20 text-cyan-300 shadow-sm'
                                : 'text-neutral-500 hover:text-neutral-300'
                        }`}
                    >
                        <Film className="w-3.5 h-3.5" />
                        Scene Graph
                    </button>
                </div>

                <div className="flex items-center gap-3">
                    <span className="text-[10px] font-mono text-neutral-500 bg-neutral-800/60 px-2.5 py-1 rounded-md border border-white/5">
                        {mode === 'legacy' 
                            ? `${layers.length} layers · ${durationInFrames} frames` 
                            : `Scene Graph Mode`
                        }
                    </span>
                    <button onClick={() => setShowExport(true)} className="px-4 py-1.5 rounded-lg text-xs font-bold transition-colors"
                        style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 2px 12px rgba(99,102,241,0.3)' }}>
                        Render Video
                    </button>
                    <button className="p-1.5 rounded-lg hover:bg-white/10 transition-colors" title="Settings">
                        <Settings className="w-4 h-4 text-neutral-400" />
                    </button>
                </div>
            </div>

            {/* Main Stage Area */}
            <div className="flex-1 flex min-h-0 relative">
                {/* Left Sidebar — PSD/FLA Upload & Library */}
                <AssetSidebar />

                {/* Center Canvas */}
                <div 
                    className="flex-1 relative flex flex-col bg-black/40"
                    onClick={() => {
                        if (mode === 'legacy') {
                            useStudioStore.getState().setSelectedLayer(null);
                        }
                    }}
                >
                    <div className="absolute top-4 left-4 text-[10px] text-neutral-500 font-mono tracking-wider z-10 bg-black/50 px-2 py-1 rounded backdrop-blur-sm">
                        {mode === 'legacy' ? 'STAGE · 1920×1080' : 'SCENE GRAPH · 1920×1080'}
                    </div>
                    <div className="flex-1 min-h-0 p-6">
                        {mode === 'legacy' 
                            ? <StageCanvas layers={layers} currentFrame={currentFrame} />
                            : <SceneGraphCanvas />
                        }
                    </div>
                </div>

                {/* Right Sidebar */}
                {mode === 'legacy' ? (
                    <LayerList layers={layers} />
                ) : (
                    <SceneGraphSidebar />
                )}
            </div>

            {/* Bottom Timeline & Playback */}
            {mode === 'legacy'
                ? <BottomTimeline />
                : <SceneGraphTimeline />
            }

            {/* Export Dialog */}
            <ExportDialog isOpen={showExport} onClose={() => setShowExport(false)} />
        </div>
    );
};

export default StudioMode;
