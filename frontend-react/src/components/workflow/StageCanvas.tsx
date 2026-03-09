import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { StageLayer } from '@/stores/useWorkflowStore';
import { STATIC_BASE } from '@/stores/useAppStore';
import { X, ZoomIn, ZoomOut, Maximize2, MousePointer2, Eye, EyeOff, Grid3X3, Target, Plus, Shield } from 'lucide-react';

interface StageCanvasProps {
    layers: StageLayer[];
    onUpdateLayer: (id: string, patch: Partial<StageLayer>) => void;
    onAddLayer?: (type: 'background' | 'foreground' | 'prop') => void;
    onClose: () => void;
    pixelsPerUnit?: number;
}

const CANVAS_W = 1920;
const CANVAS_H = 1080;

/** 9-grid quick-position presets */
const QUICK_POS = [
    { label: 'TL', x: 0, y: 0 },
    { label: 'TC', x: 960, y: 0 },
    { label: 'TR', x: 1920, y: 0 },
    { label: 'ML', x: 0, y: 540 },
    { label: 'MC', x: 960, y: 540 },
    { label: 'MR', x: 1920, y: 540 },
    { label: 'BL', x: 0, y: 1080 },
    { label: 'BC', x: 960, y: 1080 },
    { label: 'BR', x: 1920, y: 1080 },
] as const;

/**
 * Interactive Stage Canvas Editor (Redesigned).
 *
 * Type-aware rendering:
 *   - Background: object-cover fill canvas, no drag/move (only blur/opacity)
 *   - Foreground/Prop: center anchor, drag-to-move, scroll-to-resize
 *
 * Features:
 *   - Grid overlay toggle
 *   - Center crosshair
 *   - Safe-zone indicator (10% margin)
 *   - Quick-position 9-grid snap
 *   - Add layer buttons in toolbar
 */
const StageCanvas: React.FC<StageCanvasProps> = ({ layers, onUpdateLayer, onAddLayer, onClose, pixelsPerUnit = 100 }) => {
    const ppu = pixelsPerUnit;
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLDivElement>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [dragging, setDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0, layerX: 0, layerY: 0 });
    const didInteractRef = useRef(false);
    const [viewScale, setViewScale] = useState(0.5);
    const [viewOffset, setViewOffset] = useState({ x: 0, y: 0 });

    // Visual toggles
    const [showGrid, setShowGrid] = useState(false);
    const [showSafeZone, setShowSafeZone] = useState(false);
    const [showCrosshair, setShowCrosshair] = useState(true);

    const sorted = useMemo(
        () => [...layers].filter(l => l.visible).sort((a, b) => a.zIndex - b.zIndex),
        [layers]
    );

    // Split layers by type for rendering
    const bgLayers = useMemo(() => sorted.filter(l => l.type === 'background'), [sorted]);
    const overlayLayers = useMemo(() => sorted.filter(l => l.type !== 'background'), [sorted]);

    const selectedLayer = useMemo(
        () => layers.find(l => l.id === selectedId),
        [layers, selectedId]
    );

    // Get the actual rendered scale from the canvas element
    const getEffectiveScale = useCallback(() => {
        if (canvasRef.current) {
            const rect = canvasRef.current.getBoundingClientRect();
            return rect.width / CANVAS_W;
        }
        return viewScale;
    }, [viewScale]);

    // Auto-fit canvas to container
    useEffect(() => {
        const fit = () => {
            if (!containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            const scaleX = (rect.width - 40) / CANVAS_W;
            const scaleY = (rect.height - 40) / CANVAS_H;
            setViewScale(Math.min(scaleX, scaleY, 1));
        };
        fit();
        const timer = setTimeout(fit, 50);
        return () => clearTimeout(timer);
    }, []);

    // Mouse down on a layer (only for FG/Prop — BG is not draggable)
    const handleLayerMouseDown = useCallback((e: React.MouseEvent, layer: StageLayer) => {
        if (layer.type === 'background') {
            // BG: just select, no drag
            e.stopPropagation();
            didInteractRef.current = true;
            setSelectedId(layer.id);
            return;
        }
        e.stopPropagation();
        e.preventDefault();
        didInteractRef.current = true;
        setSelectedId(layer.id);
        setDragging(true);
        setDragStart({
            x: e.clientX,
            y: e.clientY,
            layerX: layer.posX || 0,
            layerY: layer.posY || 0,
        });
    }, []);

    // Mouse move (dragging)
    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (!dragging || !selectedId) return;
        // Don't drag backgrounds
        const layer = layers.find(l => l.id === selectedId);
        if (!layer || layer.type === 'background') return;

        const effectiveScale = getEffectiveScale();
        const dx = (e.clientX - dragStart.x) / effectiveScale;
        const dy = (e.clientY - dragStart.y) / effectiveScale;
        onUpdateLayer(selectedId, {
            posX: Math.round(dragStart.layerX + dx),
            posY: Math.round(dragStart.layerY + dy),
        });
    }, [dragging, selectedId, dragStart, getEffectiveScale, onUpdateLayer, layers]);

    // Mouse up
    const handleMouseUp = useCallback(() => {
        if (dragging) {
            didInteractRef.current = true;
        }
        setDragging(false);
    }, [dragging]);

    // Scroll wheel = scale selected layer (only FG/Prop)
    const handleWheel = useCallback((e: React.WheelEvent) => {
        if (selectedId) {
            const layer = layers.find(l => l.id === selectedId);
            if (!layer) return;
            if (layer.type === 'background') {
                // BG: scroll = zoom canvas view
                const delta = e.deltaY > 0 ? -0.05 : 0.05;
                setViewScale(s => Math.max(0.1, Math.min(2, s + delta)));
                return;
            }
            e.preventDefault();
            const curPx = layer.scale;
            const delta = e.deltaY > 0 ? -50 : 50;
            const newScale = Math.max(100, Math.min(3000, curPx + delta));
            onUpdateLayer(selectedId, { scale: Math.round(newScale) });
        } else {
            const delta = e.deltaY > 0 ? -0.05 : 0.05;
            setViewScale(s => Math.max(0.1, Math.min(2, s + delta)));
        }
    }, [selectedId, layers, onUpdateLayer]);

    // Click on empty canvas = deselect
    const handleCanvasClick = useCallback(() => {
        if (didInteractRef.current) {
            didInteractRef.current = false;
            return;
        }
        setSelectedId(null);
    }, []);

    // Keyboard
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (selectedId) setSelectedId(null);
                else onClose();
            }
            // Arrow keys for nudging selected FG/Prop layer
            if (selectedId && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                const layer = layers.find(l => l.id === selectedId);
                if (!layer || layer.type === 'background') return;
                e.preventDefault();
                const step = e.shiftKey ? 10 : 1;
                const patch: Partial<StageLayer> = {};
                if (e.key === 'ArrowUp') patch.posY = layer.posY - step;
                if (e.key === 'ArrowDown') patch.posY = layer.posY + step;
                if (e.key === 'ArrowLeft') patch.posX = layer.posX - step;
                if (e.key === 'ArrowRight') patch.posX = layer.posX + step;
                onUpdateLayer(selectedId, patch);
            }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [selectedId, onClose, layers, onUpdateLayer]);

    // Quick position handler
    const handleQuickPos = useCallback((x: number, y: number) => {
        if (!selectedId) return;
        const layer = layers.find(l => l.id === selectedId);
        if (!layer || layer.type === 'background') return;
        onUpdateLayer(selectedId, { posX: x, posY: y });
    }, [selectedId, layers, onUpdateLayer]);

    return (
        <div className="fixed inset-0 z-[9999] bg-black/90 flex flex-col">
            {/* ═══ TOP TOOLBAR ═══ */}
            <div className="flex items-center justify-between px-4 py-2 bg-neutral-900/80 border-b border-white/10 backdrop-blur-sm">
                <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-amber-400">🎬 Stage Editor</span>
                    <span className="text-xs text-neutral-500">
                        {selectedLayer
                            ? selectedLayer.type === 'background'
                                ? `${selectedLayer.label} · BG (fill canvas) · Opacity: ${Math.round(selectedLayer.opacity * 100)}%`
                                : `${selectedLayer.label} · (${+(selectedLayer.posX / ppu).toFixed(1)}, ${+(selectedLayer.posY / ppu).toFixed(1)}) · ${+(selectedLayer.scale / ppu).toFixed(1)}u`
                            : 'Click layer to select · Drag FG/Prop to move · Scroll to resize'
                        }
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    {/* Add layer buttons */}
                    {onAddLayer && (
                        <>
                            <button
                                onClick={() => onAddLayer('background')}
                                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 transition-all"
                            >
                                <Plus className="w-3 h-3" /> BG
                            </button>
                            <button
                                onClick={() => onAddLayer('foreground')}
                                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/25 transition-all"
                            >
                                <Plus className="w-3 h-3" /> FG
                            </button>
                            <button
                                onClick={() => onAddLayer('prop')}
                                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-pink-500/15 text-pink-300 border border-pink-500/30 hover:bg-pink-500/25 transition-all"
                            >
                                <Plus className="w-3 h-3" /> Prop
                            </button>
                            <div className="w-px h-5 bg-white/10 mx-1" />
                        </>
                    )}

                    {/* Zoom controls */}
                    <button
                        onClick={() => setViewScale(s => Math.max(0.1, s - 0.1))}
                        className="p-1.5 rounded hover:bg-white/10 text-neutral-400"
                        title="Zoom Out"
                    >
                        <ZoomOut className="w-4 h-4" />
                    </button>
                    <span className="text-xs text-neutral-400 font-mono w-12 text-center">
                        {Math.round(viewScale * 100)}%
                    </span>
                    <button
                        onClick={() => setViewScale(s => Math.min(2, s + 0.1))}
                        className="p-1.5 rounded hover:bg-white/10 text-neutral-400"
                        title="Zoom In"
                    >
                        <ZoomIn className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => { setViewScale(0.5); setViewOffset({ x: 0, y: 0 }); }}
                        className="p-1.5 rounded hover:bg-white/10 text-neutral-400"
                        title="Fit to screen"
                    >
                        <Maximize2 className="w-4 h-4" />
                    </button>
                    <div className="w-px h-5 bg-white/10 mx-1" />

                    {/* Visual toggles */}
                    <button
                        onClick={() => setShowGrid(g => !g)}
                        className={`p-1.5 rounded transition-colors ${showGrid ? 'bg-amber-500/20 text-amber-400' : 'text-neutral-500 hover:bg-white/10'}`}
                        title="Toggle Grid"
                    >
                        <Grid3X3 className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setShowCrosshair(c => !c)}
                        className={`p-1.5 rounded transition-colors ${showCrosshair ? 'bg-amber-500/20 text-amber-400' : 'text-neutral-500 hover:bg-white/10'}`}
                        title="Toggle Center Crosshair"
                    >
                        <Target className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setShowSafeZone(s => !s)}
                        className={`p-1.5 rounded transition-colors ${showSafeZone ? 'bg-amber-500/20 text-amber-400' : 'text-neutral-500 hover:bg-white/10'}`}
                        title="Toggle Safe Zone (10%)"
                    >
                        <Shield className="w-4 h-4" />
                    </button>

                    <div className="w-px h-5 bg-white/10 mx-1" />
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded hover:bg-red-500/20 text-neutral-400 hover:text-red-400 transition-colors"
                        title="Close (Esc)"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* ═══ MAIN CONTENT: Canvas + Properties Panel ═══ */}
            <div className="flex-1 flex overflow-hidden">
                {/* Canvas Area */}
                <div
                    ref={containerRef}
                    className="flex-1 overflow-hidden cursor-crosshair relative select-none"
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    onWheel={handleWheel}
                    onClick={handleCanvasClick}
                >
                    {/* Canvas Frame */}
                    <div
                        ref={canvasRef}
                        className="absolute"
                        style={{
                            width: CANVAS_W,
                            height: CANVAS_H,
                            transform: `translate(-50%, -50%) scale(${viewScale})`,
                            transformOrigin: 'center center',
                            left: `calc(50% + ${viewOffset.x}px)`,
                            top: `calc(50% + ${viewOffset.y}px)`,
                            background: '#111',
                            boxShadow: '0 0 0 2px rgba(255,255,255,0.1), 0 20px 60px rgba(0,0,0,0.5)',
                        }}
                    >
                        {/* Checkered background */}
                        <div
                            className="absolute inset-0"
                            style={{
                                backgroundImage: `
                                    linear-gradient(45deg, #1a1a1a 25%, transparent 25%),
                                    linear-gradient(-45deg, #1a1a1a 25%, transparent 25%),
                                    linear-gradient(45deg, transparent 75%, #1a1a1a 75%),
                                    linear-gradient(-45deg, transparent 75%, #1a1a1a 75%)
                                `,
                                backgroundSize: '40px 40px',
                                backgroundPosition: '0 0, 0 20px, 20px -20px, -20px 0px',
                            }}
                        />

                        {/* ── Background layers: object-cover fill ── */}
                        {bgLayers.map((layer) => {
                            const isSelected = selectedId === layer.id;
                            if (!layer.assetPath) return null;
                            return (
                                <div
                                    key={layer.id}
                                    className="absolute inset-0"
                                    style={{
                                        zIndex: layer.zIndex || 0,
                                        opacity: layer.opacity ?? 1,
                                        filter: layer.blur > 0 ? `blur(${layer.blur}px)` : undefined,
                                        outline: isSelected ? '3px solid #34d399' : 'none',
                                        outlineOffset: '-3px',
                                    }}
                                    onMouseDown={(e) => handleLayerMouseDown(e, layer)}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <img
                                        src={`${STATIC_BASE}/${layer.assetPath}`}
                                        alt={layer.label}
                                        draggable={false}
                                        className="pointer-events-none w-full h-full object-cover"
                                    />
                                    {/* BG label */}
                                    {isSelected && (
                                        <div
                                            className="absolute top-2 left-2 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500 text-black whitespace-nowrap"
                                            style={{ zIndex: 9999 }}
                                        >
                                            {layer.label} · BG (fill)
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {/* ── FG/Prop layers: center anchor, draggable ── */}
                        {overlayLayers.map((layer) => {
                            const isSelected = selectedId === layer.id;
                            if (!layer.assetPath) return null;
                            const px = layer.scale;

                            return (
                                <div
                                    key={layer.id}
                                    className={`absolute ${dragging && isSelected ? 'cursor-grabbing' : 'cursor-grab'}`}
                                    style={{
                                        left: layer.posX || 0,
                                        top: layer.posY || 0,
                                        transform: `translate(-50%, -50%) scale(${(px || 960) / CANVAS_W}) rotate(${layer.rotation || 0}deg)`,
                                        zIndex: layer.zIndex || 0,
                                        opacity: layer.opacity ?? 1,
                                        filter: layer.blur > 0 ? `blur(${layer.blur}px)` : undefined,
                                        outline: isSelected ? `3px solid ${layer.type === 'foreground' ? '#22d3ee' : '#f472b6'}` : 'none',
                                        outlineOffset: '2px',
                                        borderRadius: '2px',
                                        transition: dragging && isSelected ? 'none' : 'outline 0.15s ease',
                                    }}
                                    onMouseDown={(e) => handleLayerMouseDown(e, layer)}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <img
                                        src={`${STATIC_BASE}/${layer.assetPath}`}
                                        alt={layer.label}
                                        draggable={false}
                                        className="pointer-events-none"
                                        style={{
                                            maxWidth: CANVAS_W / 2,
                                            maxHeight: CANVAS_H / 2,
                                        }}
                                    />
                                    {/* FG/Prop label */}
                                    {isSelected && (
                                        <div
                                            className={`absolute -top-6 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap ${layer.type === 'foreground' ? 'bg-cyan-500 text-black' : 'bg-pink-500 text-black'
                                                }`}
                                            style={{ zIndex: 9999 }}
                                        >
                                            {layer.label} · {+(px / ppu).toFixed(1)}u
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {/* ── Grid overlay ── */}
                        {showGrid && (
                            <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 9990 }}>
                                {/* Vertical lines every 192px (10 divisions) */}
                                {Array.from({ length: 9 }, (_, i) => (i + 1) * 192).map(x => (
                                    <line key={`gv-${x}`} x1={x} y1={0} x2={x} y2={CANVAS_H}
                                        stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
                                ))}
                                {/* Horizontal lines every 108px (10 divisions) */}
                                {Array.from({ length: 9 }, (_, i) => (i + 1) * 108).map(y => (
                                    <line key={`gh-${y}`} x1={0} y1={y} x2={CANVAS_W} y2={y}
                                        stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
                                ))}
                            </svg>
                        )}

                        {/* ── Center crosshair ── */}
                        {showCrosshair && (
                            <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 9991 }}>
                                <line x1={CANVAS_W / 2} y1={0} x2={CANVAS_W / 2} y2={CANVAS_H}
                                    stroke="rgba(245,158,11,0.3)" strokeWidth={1} strokeDasharray="8 4" />
                                <line x1={0} y1={CANVAS_H / 2} x2={CANVAS_W} y2={CANVAS_H / 2}
                                    stroke="rgba(245,158,11,0.3)" strokeWidth={1} strokeDasharray="8 4" />
                                <circle cx={CANVAS_W / 2} cy={CANVAS_H / 2} r={6}
                                    fill="none" stroke="rgba(245,158,11,0.4)" strokeWidth={1.5} />
                            </svg>
                        )}

                        {/* ── Safe zone (10% margin) ── */}
                        {showSafeZone && (
                            <div
                                className="absolute pointer-events-none"
                                style={{
                                    left: CANVAS_W * 0.1,
                                    top: CANVAS_H * 0.1,
                                    width: CANVAS_W * 0.8,
                                    height: CANVAS_H * 0.8,
                                    border: '1.5px dashed rgba(139,92,246,0.4)',
                                    borderRadius: 4,
                                    zIndex: 9992,
                                }}
                            >
                                <span className="absolute -top-4 left-0 text-[9px] text-purple-400/60 font-mono">
                                    Safe Zone (10%)
                                </span>
                            </div>
                        )}

                        {/* Canvas dimensions label */}
                        <div className="absolute bottom-2 right-3 text-[10px] text-white/20 font-mono pointer-events-none">
                            {CANVAS_W} × {CANVAS_H}
                        </div>
                    </div>
                </div>

                {/* ═══ RIGHT PANEL: Layer Properties ═══ */}
                <div className="w-64 bg-neutral-900/95 border-l border-white/10 flex flex-col overflow-y-auto">
                    {/* Layer list */}
                    <div className="px-3 pt-3 pb-2 border-b border-white/5">
                        <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Layers ({layers.length})</span>
                    </div>
                    <div className="px-2 py-1 space-y-0.5 border-b border-white/5 max-h-40 overflow-y-auto">
                        {[...layers].sort((a, b) => b.zIndex - a.zIndex).map((layer) => (
                            <div
                                key={layer.id}
                                className={`flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer text-[10px] transition-colors ${selectedId === layer.id ? 'bg-amber-500/20 text-amber-300' : 'text-neutral-400 hover:bg-white/5'
                                    }`}
                                onClick={() => setSelectedId(layer.id)}
                            >
                                {layer.assetPath ? (
                                    <img src={`${STATIC_BASE}/${layer.assetPath}`} className="w-5 h-5 rounded object-cover" alt="" />
                                ) : (
                                    <div className="w-5 h-5 rounded bg-white/5" />
                                )}
                                <span className="flex-1 truncate">{layer.label}</span>
                                <span className={`text-[8px] px-1 py-0.5 rounded font-mono ${layer.type === 'background' ? 'bg-emerald-500/20 text-emerald-300' :
                                        layer.type === 'foreground' ? 'bg-cyan-500/20 text-cyan-300' :
                                            'bg-pink-500/20 text-pink-300'
                                    }`}>
                                    {layer.type === 'background' ? 'BG' : layer.type === 'foreground' ? 'FG' : 'PROP'}
                                </span>
                                <span className="text-[8px] text-neutral-600 font-mono">z{layer.zIndex}</span>
                                <button
                                    onClick={(e) => { e.stopPropagation(); onUpdateLayer(layer.id, { visible: !layer.visible }); }}
                                    className="p-0.5 hover:bg-white/10 rounded"
                                >
                                    {layer.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3 text-neutral-600" />}
                                </button>
                            </div>
                        ))}
                    </div>

                    {/* Selected layer properties */}
                    {selectedLayer ? (
                        <div className="px-3 py-3 space-y-3 flex-1">
                            <div className="text-[11px] font-bold text-white/90 flex items-center gap-2">
                                <span className={`px-1.5 py-0.5 rounded text-[8px] font-mono ${selectedLayer.type === 'background' ? 'bg-emerald-500/20 text-emerald-300' :
                                        selectedLayer.type === 'foreground' ? 'bg-cyan-500/20 text-cyan-300' :
                                            'bg-pink-500/20 text-pink-300'
                                    }`}>
                                    {selectedLayer.type === 'background' ? 'BG' : selectedLayer.type === 'foreground' ? 'FG' : 'PROP'}
                                </span>
                                {selectedLayer.label}
                            </div>

                            {/* ── BG-specific: only opacity, blur, z-index ── */}
                            {selectedLayer.type === 'background' ? (
                                <>
                                    <div className="text-[9px] text-emerald-400/70 py-1 px-2 rounded bg-emerald-500/5 border border-emerald-500/10">
                                        Background fills the entire canvas (object-cover). No position/scale editing.
                                    </div>

                                    {/* Opacity */}
                                    <div>
                                        <label className="text-[9px] text-neutral-500 uppercase tracking-wider">Opacity</label>
                                        <div className="flex items-center gap-1 mt-1">
                                            <input
                                                type="range"
                                                min={0} max={1} step={0.05}
                                                value={selectedLayer.opacity}
                                                onChange={(e) => onUpdateLayer(selectedId!, { opacity: Number(e.target.value) })}
                                                className="flex-1 accent-emerald-500 h-1.5"
                                            />
                                            <span className="text-[10px] text-neutral-400 font-mono w-10 text-right">
                                                {Math.round(selectedLayer.opacity * 100)}%
                                            </span>
                                        </div>
                                    </div>

                                    {/* Blur */}
                                    <div>
                                        <label className="text-[9px] text-neutral-500 uppercase tracking-wider">Blur</label>
                                        <div className="flex items-center gap-1 mt-1">
                                            <input
                                                type="range"
                                                min={0} max={20} step={0.5}
                                                value={selectedLayer.blur}
                                                onChange={(e) => onUpdateLayer(selectedId!, { blur: Number(e.target.value) })}
                                                className="flex-1 accent-emerald-500 h-1.5"
                                            />
                                            <span className="text-[10px] text-neutral-400 font-mono w-10 text-right">
                                                {selectedLayer.blur}px
                                            </span>
                                        </div>
                                    </div>

                                    {/* Z-Index */}
                                    <div>
                                        <label className="text-[9px] text-neutral-500 uppercase tracking-wider">Z-Index</label>
                                        <input
                                            type="number"
                                            value={selectedLayer.zIndex}
                                            onChange={(e) => { const v = Number(e.target.value); if (!isNaN(v)) onUpdateLayer(selectedId!, { zIndex: v }); }}
                                            className="w-full bg-white/5 rounded px-2 py-1 text-[10px] text-white border border-white/5 outline-none mt-1"
                                            min={0} max={100}
                                        />
                                    </div>
                                </>
                            ) : (
                                /* ── FG/Prop: full editing ── */
                                <>
                                    {/* Quick Position (9-grid) */}
                                    <div>
                                        <label className="text-[9px] text-neutral-500 uppercase tracking-wider mb-1 block">Quick Position</label>
                                        <div className="grid grid-cols-3 gap-0.5">
                                            {QUICK_POS.map((qp) => (
                                                <button
                                                    key={qp.label}
                                                    onClick={() => handleQuickPos(qp.x, qp.y)}
                                                    className={`py-1 rounded text-[8px] font-mono transition-all ${selectedLayer.posX === qp.x && selectedLayer.posY === qp.y
                                                            ? 'bg-amber-500/30 text-amber-300 border border-amber-500/40'
                                                            : 'bg-white/5 text-neutral-500 hover:bg-white/10 hover:text-neutral-300 border border-transparent'
                                                        }`}
                                                >
                                                    {qp.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Height (units) - scale */}
                                    <div>
                                        <label className="text-[9px] text-neutral-500 uppercase tracking-wider">Height ({ppu === 1 ? 'px' : 'units'})</label>
                                        <div className="flex items-center gap-1 mt-1">
                                            <input
                                                type="range"
                                                min={100} max={3000} step={10}
                                                value={Math.round(selectedLayer.scale)}
                                                onChange={(e) => onUpdateLayer(selectedId!, { scale: Number(e.target.value) })}
                                                className="flex-1 accent-amber-500 h-1.5"
                                            />
                                            <input
                                                type="number"
                                                value={+(selectedLayer.scale / ppu).toFixed(2)}
                                                onChange={(e) => { const v = Number(e.target.value); if (!isNaN(v)) onUpdateLayer(selectedId!, { scale: Math.round(v * ppu) }); }}
                                                className="w-16 bg-white/5 rounded px-1.5 py-0.5 text-[10px] text-white text-center border border-white/5 outline-none"
                                                step={0.1}
                                            />
                                        </div>
                                    </div>

                                    {/* Position X, Y (units) */}
                                    <div>
                                        <label className="text-[9px] text-neutral-500 uppercase tracking-wider">Position ({ppu === 1 ? 'px' : 'units'})</label>
                                        <div className="flex gap-2 mt-1">
                                            <div className="flex-1">
                                                <span className="text-[8px] text-neutral-600">X</span>
                                                <input
                                                    type="number"
                                                    value={+(selectedLayer.posX / ppu).toFixed(2)}
                                                    onChange={(e) => { const v = Number(e.target.value); if (!isNaN(v)) onUpdateLayer(selectedId!, { posX: Math.round(v * ppu) }); }}
                                                    className="w-full bg-white/5 rounded px-2 py-1 text-[10px] text-white border border-white/5 outline-none"
                                                    step={0.1}
                                                />
                                            </div>
                                            <div className="flex-1">
                                                <span className="text-[8px] text-neutral-600">Y</span>
                                                <input
                                                    type="number"
                                                    value={+(selectedLayer.posY / ppu).toFixed(2)}
                                                    onChange={(e) => { const v = Number(e.target.value); if (!isNaN(v)) onUpdateLayer(selectedId!, { posY: Math.round(v * ppu) }); }}
                                                    className="w-full bg-white/5 rounded px-2 py-1 text-[10px] text-white border border-white/5 outline-none"
                                                    step={0.1}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Opacity */}
                                    <div>
                                        <label className="text-[9px] text-neutral-500 uppercase tracking-wider">Opacity</label>
                                        <div className="flex items-center gap-1 mt-1">
                                            <input
                                                type="range"
                                                min={0} max={1} step={0.05}
                                                value={selectedLayer.opacity}
                                                onChange={(e) => onUpdateLayer(selectedId!, { opacity: Number(e.target.value) })}
                                                className="flex-1 accent-amber-500 h-1.5"
                                            />
                                            <span className="text-[10px] text-neutral-400 font-mono w-10 text-right">
                                                {Math.round(selectedLayer.opacity * 100)}%
                                            </span>
                                        </div>
                                    </div>

                                    {/* Rotation */}
                                    <div>
                                        <label className="text-[9px] text-neutral-500 uppercase tracking-wider">Rotation</label>
                                        <div className="flex items-center gap-1 mt-1">
                                            <input
                                                type="range"
                                                min={-180} max={180} step={1}
                                                value={selectedLayer.rotation}
                                                onChange={(e) => onUpdateLayer(selectedId!, { rotation: Number(e.target.value) })}
                                                className="flex-1 accent-amber-500 h-1.5"
                                            />
                                            <span className="text-[10px] text-neutral-400 font-mono w-10 text-right">
                                                {selectedLayer.rotation}°
                                            </span>
                                        </div>
                                    </div>

                                    {/* Blur */}
                                    <div>
                                        <label className="text-[9px] text-neutral-500 uppercase tracking-wider">Blur</label>
                                        <div className="flex items-center gap-1 mt-1">
                                            <input
                                                type="range"
                                                min={0} max={20} step={0.5}
                                                value={selectedLayer.blur}
                                                onChange={(e) => onUpdateLayer(selectedId!, { blur: Number(e.target.value) })}
                                                className="flex-1 accent-amber-500 h-1.5"
                                            />
                                            <span className="text-[10px] text-neutral-400 font-mono w-10 text-right">
                                                {selectedLayer.blur}px
                                            </span>
                                        </div>
                                    </div>

                                    {/* Z-Index */}
                                    <div>
                                        <label className="text-[9px] text-neutral-500 uppercase tracking-wider">Z-Index</label>
                                        <input
                                            type="number"
                                            value={selectedLayer.zIndex}
                                            onChange={(e) => { const v = Number(e.target.value); if (!isNaN(v)) onUpdateLayer(selectedId!, { zIndex: v }); }}
                                            className="w-full bg-white/5 rounded px-2 py-1 text-[10px] text-white border border-white/5 outline-none mt-1"
                                            min={0} max={100}
                                        />
                                    </div>
                                </>
                            )}
                        </div>
                    ) : (
                        <div className="flex-1 flex items-center justify-center">
                            <p className="text-[11px] text-neutral-600 text-center px-4">
                                Click a layer to edit properties<br />
                                <span className="text-[9px]">Drag FG/Prop to move · Scroll to resize</span><br />
                                <span className="text-[9px]">Arrow keys to nudge (Shift = 10px)</span>
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* ═══ BOTTOM HINT BAR ═══ */}
            <div className="px-4 py-1.5 bg-neutral-900/80 border-t border-white/10 flex items-center gap-4 text-[10px] text-neutral-500">
                <span className="flex items-center gap-1"><MousePointer2 className="w-3 h-3" /> Drag = move FG/Prop</span>
                <span>🖱 Scroll = resize</span>
                <span>⌨ Arrow = nudge (Shift×10)</span>
                <span>Esc = deselect / close</span>
                <span className="ml-auto text-neutral-600">Viewport: {Math.round(viewScale * 100)}% · PPU: {ppu}</span>
            </div>
        </div>
    );
};

export default StageCanvas;
