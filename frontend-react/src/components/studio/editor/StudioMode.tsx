import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, Settings } from 'lucide-react';
import AssetSidebar from './AssetSidebar';
import { useStudioStore } from '@/stores/useStudioStore';
import type { StudioLayer } from '@/stores/useStudioStore';
import PropertiesPanel from './PropertiesPanel';
import { StageTransformer } from './StageTransformer';
import { BottomTimeline } from './BottomTimeline';
import { PixiStage } from './PixiStage';

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
// Layer List (Right Panel)
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
// Main Studio Mode
// ═══════════════════════════════════════════════════════════
const StudioMode: React.FC = () => {
    const durationInFrames = useStudioStore(s => s.durationInFrames);
    const layers = useStudioStore(s => s.layers);

    const [currentFrame, setCurrentFrame] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const fps = 30;
    const rafRef = useRef<number | null>(null);
    const lastTimeRef = useRef<number>(0);

    // Playback loop
    useEffect(() => {
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
    }, [isPlaying, fps, durationInFrames]);

    const onPlay = useCallback(() => setIsPlaying(true), []);
    const onPause = useCallback(() => setIsPlaying(false), []);
    const onSeek = useCallback((f: number) => setCurrentFrame(f), []);

    return (
        <div className="flex flex-col h-full w-full bg-[#0d0d14] text-white overflow-hidden">
            {/* Top Toolbar */}
            <div className="h-12 border-b border-white/10 flex items-center justify-between px-4" style={{ backgroundColor: 'var(--surface-raised)' }}>
                <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-indigo-400" />
                    <span className="font-semibold text-sm tracking-wide">AnimeStudio Director v2.1 (WebGL Fix)</span>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-[10px] font-mono text-neutral-500 bg-neutral-800/60 px-2.5 py-1 rounded-md border border-white/5">
                        {layers.length} layers · {durationInFrames} frames
                    </span>
                    <button className="px-4 py-1.5 rounded-lg text-xs font-bold transition-colors"
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
                    onClick={() => useStudioStore.getState().setSelectedLayer(null)}
                >
                    <div className="absolute top-4 left-4 text-[10px] text-neutral-500 font-mono tracking-wider z-10 bg-black/50 px-2 py-1 rounded backdrop-blur-sm">
                        STAGE · 1920×1080
                    </div>
                    <div className="flex-1 min-h-0 p-6">
                        <StageCanvas layers={layers} currentFrame={currentFrame} />
                    </div>
                </div>

                {/* Right Sidebar — Layer List & Properties */}
                <LayerList layers={layers} />
            </div>

            {/* Bottom Timeline & Playback */}
            <BottomTimeline />
        </div>
    );
};

export default StudioMode;
