import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useWorkflowStore, type CharacterNodeData, type StageLayer, type CameraNodeData } from '@/stores/useWorkflowStore';
import { useAppStore, STATIC_BASE } from '@/stores/useAppStore';
import { Maximize2, Move } from 'lucide-react';
import type { PreviewTrack } from './types';
import { getActiveFrame, getInterpolatedPos } from './types';
import { renderScene, type SceneLayer, type CameraExportData } from './renderScene';

type ViewMode = 'edit' | 'camera';

interface PreviewCanvasProps {
    tracks: PreviewTrack[];
    totalDuration: number;
    backgroundUrl: string;
    backgroundBlur: number;
    overlayLayers?: StageLayer[];
    cameraData?: CameraNodeData | null;
    onCameraZoom?: (delta: number) => void;
    onCameraMove?: (dx: number, dy: number) => void;
    cameraEditMode?: boolean;
    viewMode?: ViewMode;
    ppu?: number;
    currentTime: number;
    isPlaying: boolean;
    selectedNodeId: string | null;
    setSelectedNodeId: (id: string | null) => void;
    setEditFrameIdx: (idx: number) => void;
}

const BASE_CANVAS_W = 800;
const BASE_CANVAS_H = 450;

const PreviewCanvas: React.FC<PreviewCanvasProps> = ({
    tracks,
    totalDuration,
    backgroundUrl,
    backgroundBlur,
    overlayLayers = [],
    cameraData = null,
    onCameraZoom,
    onCameraMove,
    cameraEditMode = false,
    viewMode = 'camera',
    ppu = 100,
    currentTime,
    isPlaying,
    selectedNodeId,
    setSelectedNodeId,
    setEditFrameIdx,
}) => {
    const { nodes, updateNodeData } = useWorkflowStore();
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
    const bgImgRef = useRef<HTMLImageElement | null>(null);

    const [dragNodeId, setDragNodeId] = useState<string | null>(null);
    const [dragCoords, setDragCoords] = useState<{ x: number; y: number } | null>(null);
    const [cameraDragging, setCameraDragging] = useState(false);
    const [cameraDragStart, setCameraDragStart] = useState<{ x: number; y: number } | null>(null);

    const SNAP_THRESHOLD = 0.15;

    // ── Dynamic canvas dimensions based on camera aspect ratio ──
    // Canvas always fits within BASE_CANVAS_W × BASE_CANVAS_H bounding box.
    // Edit View: always 16:9 (800×450)
    // Camera View: match camera aspect, constrained to fit within 800×450
    const { CANVAS_W, CANVAS_H } = (() => {
        if (viewMode === 'camera' && cameraData) {
            const vpW = cameraData.viewportWidth || 1920;
            const vpH = cameraData.viewportHeight || 1080;
            const cameraAspect = vpW / vpH;
            const boxAspect = BASE_CANVAS_W / BASE_CANVAS_H;  // 800/450 = 1.778
            if (cameraAspect >= boxAspect) {
                // Camera is wider than box → width-limited
                return { CANVAS_W: BASE_CANVAS_W, CANVAS_H: Math.round(BASE_CANVAS_W / cameraAspect) };
            } else {
                // Camera is taller than box → height-limited
                return { CANVAS_W: Math.round(BASE_CANVAS_H * cameraAspect), CANVAS_H: BASE_CANVAS_H };
            }
        }
        return { CANVAS_W: BASE_CANVAS_W, CANVAS_H: BASE_CANVAS_H };
    })();

    // ── Camera state for HTML overlays ──
    const ease = (t: number, type: string) => {
        switch (type) {
            case 'easeIn': return t * t;
            case 'easeOut': return t * (2 - t);
            case 'easeInOut': return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
            default: return t;
        }
    };

    const getCameraState = () => {
        const defaultState = { x: 960, y: 540, zoom: 1, vpW: 1920, vpH: 1080, fovPx: 1920, hasCamera: false };
        if (!cameraData || !cameraData.keyframes || cameraData.keyframes.length === 0) return defaultState;
        const kfs = cameraData.keyframes;
        const vpW = cameraData.viewportWidth || 1920;
        const vpH = cameraData.viewportHeight || 1080;
        const fovPx = (cameraData.fov || 19.2) * ppu;

        const fromKf = (kf: typeof kfs[0]) => ({
            x: kf.x * ppu, y: kf.y * ppu, zoom: kf.zoom,
            vpW, vpH, fovPx, hasCamera: true,
        });

        if (currentTime <= kfs[0].time) return fromKf(kfs[0]);
        if (currentTime >= kfs[kfs.length - 1].time) return fromKf(kfs[kfs.length - 1]);
        let prev = kfs[0], next = kfs[1];
        for (let i = 0; i < kfs.length - 1; i++) {
            if (currentTime >= kfs[i].time && currentTime < kfs[i + 1].time) {
                prev = kfs[i]; next = kfs[i + 1]; break;
            }
        }
        const segDuration = next.time - prev.time;
        const progress = segDuration > 0 ? (currentTime - prev.time) / segDuration : 0;
        const t = ease(progress, next.easing);
        return {
            x: (prev.x + (next.x - prev.x) * t) * ppu,
            y: (prev.y + (next.y - prev.y) * t) * ppu,
            zoom: prev.zoom + (next.zoom - prev.zoom) * t,
            vpW, vpH, fovPx, hasCamera: true,
        };
    };

    const cam = getCameraState();

    // ── Image preloading ──
    useEffect(() => {
        const urls = new Set<string>();
        if (backgroundUrl) urls.add(backgroundUrl);
        for (const track of tracks) {
            for (const frame of track.frames) {
                for (const layer of frame.layerImages) {
                    if (layer.url) urls.add(layer.url);
                }
            }
        }
        for (const ol of overlayLayers) {
            if (ol.assetPath) urls.add(`${STATIC_BASE}/${ol.assetPath}`);
        }

        const cache = imageCacheRef.current;
        for (const url of urls) {
            if (!cache.has(url)) {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => {
                    cache.set(url, img);
                    // Trigger re-render on load
                    if (canvasRef.current) {
                        const ctx = canvasRef.current.getContext('2d');
                        if (ctx) doRender(ctx);
                    }
                };
                img.src = url;
            }
        }

        // Background image
        if (backgroundUrl && (!bgImgRef.current || bgImgRef.current.src !== backgroundUrl)) {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                bgImgRef.current = img;
                cache.set(backgroundUrl, img);
                if (canvasRef.current) {
                    const ctx = canvasRef.current.getContext('2d');
                    if (ctx) doRender(ctx);
                }
            };
            img.src = backgroundUrl;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [backgroundUrl, tracks, overlayLayers]);

    // ── Build render params ──
    const buildSceneLayers = useCallback((): SceneLayer[] => {
        return overlayLayers.map((l) => ({
            id: l.id,
            source: l.source,
            type: l.type,
            label: l.label,
            assetUrl: `${STATIC_BASE}/${l.assetPath}`,
            posX: l.posX,
            posY: l.posY,
            zIndex: l.zIndex,
            width: l.width,
            height: l.height,
            opacity: l.opacity,
            rotation: l.rotation,
            blur: l.blur,
        }));
    }, [overlayLayers]);

    const buildCameraData = useCallback((): CameraExportData | null => {
        if (!cameraData || !cameraData.keyframes) return null;
        return {
            keyframes: cameraData.keyframes.map(kf => ({
                id: kf.id, time: kf.time, x: kf.x, y: kf.y, zoom: kf.zoom, easing: kf.easing,
            })),
            viewportWidth: cameraData.viewportWidth || 1920,
            viewportHeight: cameraData.viewportHeight || 1080,
            fov: cameraData.fov || 19.2,
        };
    }, [cameraData]);

    const buildCharNodeDataMap = useCallback((): Map<string, CharacterNodeData> => {
        return new Map(
            nodes
                .filter(n => n.type === 'character' || n.type === 'characterV2')
                .map(n => [n.id, n.data as CharacterNodeData])
        );
    }, [nodes]);

    // ── Render to canvas ──
    // Edit View: render world without camera transform (camera shown as overlay)
    // Camera View: render through camera lens (WYSIWYG, same as export)
    const doRender = useCallback((ctx: CanvasRenderingContext2D) => {
        renderScene({
            ctx,
            W: CANVAS_W,
            H: CANVAS_H,
            time: currentTime,
            tracks,
            backgroundImg: bgImgRef.current,
            backgroundBlur,
            overlayLayers: buildSceneLayers(),
            cameraData: viewMode === 'camera' ? buildCameraData() : null,
            charNodeDataMap: buildCharNodeDataMap(),
            imageCache: imageCacheRef.current,
            ppu,
        });
    }, [currentTime, tracks, backgroundBlur, buildSceneLayers, buildCameraData, buildCharNodeDataMap, viewMode, ppu, CANVAS_W, CANVAS_H]);

    // ── Main render loop ──
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        doRender(ctx);
    }, [doRender]);

    // ── Interaction callbacks (kept from original) ──
    const getCanvasCoords = useCallback((e: React.MouseEvent) => {
        if (!containerRef.current) return null;
        const rect = containerRef.current.getBoundingClientRect();
        const relX = (e.clientX - rect.left) / rect.width;
        const relY = (e.clientY - rect.top) / rect.height;
        return {
            x: Math.round(Math.max(0, Math.min(1920, relX * 1920))),
            y: Math.round(Math.max(0, Math.min(1080, relY * 1080))),
        };
    }, []);

    const upsertPositionKeyframe = useCallback((nodeId: string, x: number, y: number) => {
        const node = nodes.find(n => n.id === nodeId);
        if (!node || node.type !== 'character') return;
        const data = node.data as CharacterNodeData;
        const kfs = [...(data.positionKeyframes || [])];
        const t = currentTime;
        const existingIdx = kfs.findIndex(kf => Math.abs(kf.time - t) < SNAP_THRESHOLD);
        if (existingIdx >= 0) {
            kfs[existingIdx] = { time: kfs[existingIdx].time, x, y };
        } else {
            kfs.push({ time: t, x, y });
        }
        kfs.sort((a, b) => a.time - b.time);
        updateNodeData(nodeId, { positionKeyframes: kfs });
    }, [nodes, currentTime, updateNodeData]);

    const handleDragStart = useCallback((e: React.MouseEvent, nodeId: string) => {
        if (isPlaying) return;
        e.preventDefault(); e.stopPropagation();
        setDragNodeId(nodeId); setSelectedNodeId(nodeId);
    }, [isPlaying, setSelectedNodeId]);

    const handleCharacterClick = useCallback((e: React.MouseEvent, nodeId: string) => {
        if (isPlaying) return;
        e.stopPropagation();
        setSelectedNodeId(selectedNodeId === nodeId ? null : nodeId);
        setEditFrameIdx(0);
    }, [isPlaying, selectedNodeId, setSelectedNodeId, setEditFrameIdx]);

    const handleDragMove = useCallback((e: React.MouseEvent) => {
        if (!dragNodeId) return;
        const coords = getCanvasCoords(e);
        if (!coords) return;
        setDragCoords(coords);
        upsertPositionKeyframe(dragNodeId, coords.x, coords.y);
    }, [dragNodeId, getCanvasCoords, upsertPositionKeyframe]);

    const handleDragEnd = useCallback(() => {
        setDragNodeId(null); setDragCoords(null);
    }, []);

    // ── Empty state ──
    if (tracks.length === 0) {
        return (
            <div className="flex-1 flex items-center justify-center relative">
                <div className="text-center text-neutral-500">
                    <Maximize2 className="w-12 h-12 mx-auto mb-4 text-neutral-600" />
                    <p className="text-sm font-medium">No animation to preview</p>
                    <p className="text-xs text-neutral-600 mt-1">
                        Connect Character nodes (with poses) to a Scene Output node first.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div
            className="flex-1 flex items-center justify-center relative overflow-hidden"
            onWheel={(e) => {
                if (cam.hasCamera && onCameraZoom && cameraEditMode) {
                    e.preventDefault();
                    const delta = e.deltaY < 0 ? 0.1 : -0.1;
                    onCameraZoom(delta);
                }
            }}
        >
            {/* Main scene rendered to canvas */}
            <div
                ref={containerRef}
                className="relative rounded-xl border border-white/5 overflow-hidden"
                style={{
                    width: `${CANVAS_W}px`,
                    height: `${CANVAS_H}px`,
                    maxWidth: '100%',
                    maxHeight: '100%',
                    aspectRatio: `${CANVAS_W} / ${CANVAS_H}`,
                    cursor: dragNodeId ? 'grabbing' : undefined,
                }}
                onMouseMove={handleDragMove}
                onMouseUp={handleDragEnd}
                onMouseLeave={handleDragEnd}
            >
                {/* Canvas — scene rendering */}
                <canvas
                    ref={canvasRef}
                    width={CANVAS_W}
                    height={CANVAS_H}
                    className="absolute inset-0"
                    style={{ zIndex: 0 }}
                />

                {/* ── HTML overlays (UI only, not scene content) ── */}

                {/* Grid overlay when paused */}
                {!isPlaying && !dragNodeId && (
                    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 50 }}>
                        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/5" />
                        <div className="absolute top-1/2 left-0 right-0 h-px bg-white/5" />
                        <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/3" />
                        <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/3" />
                        <div className="absolute top-1/3 left-0 right-0 h-px bg-white/3" />
                        <div className="absolute top-2/3 left-0 right-0 h-px bg-white/3" />
                    </div>
                )}

                {/* Drag coordinate overlay */}
                {dragCoords && (
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 backdrop-blur-sm rounded-lg px-4 py-2 flex items-center gap-3 shadow-xl bg-amber-600/90" style={{ zIndex: 60 }}>
                        <span className="text-white/80 text-[9px] font-bold">◇ {currentTime.toFixed(1)}s</span>
                        <span className="text-white text-xs font-bold">X: {dragCoords.x}</span>
                        <span className="text-white/40">|</span>
                        <span className="text-white text-xs font-bold">Y: {dragCoords.y}</span>
                    </div>
                )}

                {/* Pause hint */}
                {!isPlaying && !dragNodeId && tracks.length > 0 && (
                    <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm rounded px-2 py-1 text-[9px] text-neutral-400 flex items-center gap-1" style={{ zIndex: 55 }}>
                        <Move className="w-3 h-3" />
                        Scrub timeline → Drag character → Auto keyframe
                    </div>
                )}

                {/* Character drag hit targets (transparent, positioned over character areas) */}
                {!isPlaying && tracks.map((track) => {
                    const active = getActiveFrame(track, currentTime);
                    if (!active) return null;
                    const { frame } = active;
                    const charNode = nodes.find(n => n.id === track.nodeId);
                    const charData = charNode?.data as CharacterNodeData | undefined;
                    const pos = charData
                        ? getInterpolatedPos(charData, currentTime)
                        : { x: frame.posX, y: frame.posY };
                    const charScale = charData?.scale ?? frame.scale;
                    const scaleFactor = charScale / 1920;
                    const hitW = 960 * scaleFactor * (CANVAS_W / 1920);
                    const hitH = 960 * scaleFactor * (CANVAS_H / 1080);
                    const hitX = pos.x / 1920 * CANVAS_W - hitW / 2;
                    const hitY = pos.y / 1080 * CANVAS_H - hitH;

                    return (
                        <div
                            key={`hit-${track.nodeId}`}
                            className={`absolute cursor-grab ${dragNodeId === track.nodeId ? 'cursor-grabbing ring-2 ring-emerald-400 rounded' : ''} ${selectedNodeId === track.nodeId ? 'ring-2 ring-amber-400/70 rounded' : ''}`}
                            style={{
                                left: hitX, top: hitY, width: hitW, height: hitH,
                                zIndex: 1000 + Math.round(pos.y),
                            }}
                            onMouseDown={(e) => handleDragStart(e, track.nodeId)}
                            onClick={(e) => handleCharacterClick(e, track.nodeId)}
                        >
                            {/* Character name label */}
                            <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 bg-black/70 rounded px-2 py-0.5 text-[8px] text-neutral-300 whitespace-nowrap font-mono">
                                {track.characterName}
                            </div>
                        </div>
                    );
                })}

                {/* Path preview: show positionKeyframes */}
                {!isPlaying && selectedNodeId && (() => {
                    const selNode = nodes.find(n => n.id === selectedNodeId);
                    if (!selNode || selNode.type !== 'character') return null;
                    const selData = selNode.data as CharacterNodeData;
                    const kfs = selData.positionKeyframes;
                    if (!kfs || kfs.length === 0) return null;

                    const positions = kfs.map(kf => ({
                        x: kf.x / 1920 * 100, y: kf.y / 1080 * 100, time: kf.time,
                    }));

                    let nearestIdx = 0, nearestDist = Infinity;
                    kfs.forEach((kf, i) => {
                        const d = Math.abs(kf.time - currentTime);
                        if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
                    });

                    return (
                        <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 45 }}>
                            {positions.map((pos, i) => {
                                if (i === 0) return null;
                                const prev = positions[i - 1];
                                return (
                                    <line key={`pl-${i}`} x1={`${prev.x}%`} y1={`${prev.y}%`} x2={`${pos.x}%`} y2={`${pos.y}%`}
                                        stroke="#f59e0b" strokeWidth="2" strokeDasharray="6 4" opacity={0.5} />
                                );
                            })}
                            {positions.map((pos, i) => {
                                const isNearest = i === nearestIdx;
                                return (
                                    <g key={`kfd-${i}`}>
                                        <circle cx={`${pos.x}%`} cy={`${pos.y}%`} r={isNearest ? 7 : 4}
                                            fill={isNearest ? '#f59e0b' : '#6366f1'} stroke="white" strokeWidth="2" opacity={0.9} />
                                        <text x={`${pos.x}%`} y={`${pos.y}%`} dy={-14} textAnchor="middle"
                                            fill={isNearest ? '#f59e0b' : '#818cf8'} fontSize="9" fontWeight="bold">
                                            {pos.time.toFixed(1)}s
                                        </text>
                                    </g>
                                );
                            })}
                        </svg>
                    );
                })()}

                {/* Time overlay */}
                <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-sm rounded-lg px-3 py-1.5 flex items-center gap-2" style={{ zIndex: 55 }}>
                    <span className="text-amber-400 text-xs font-mono font-bold">{currentTime.toFixed(1)}s</span>
                    <span className="text-neutral-500 text-[10px]">/ {totalDuration.toFixed(1)}s</span>
                </div>

                {/* Track labels */}
                <div className="absolute top-3 right-3 space-y-1" style={{ zIndex: 55 }}>
                    {tracks.map((track) => {
                        const active = getActiveFrame(track, currentTime);
                        return (
                            <div key={track.nodeId} className="bg-black/70 backdrop-blur-sm rounded px-2 py-1 text-[10px] text-neutral-300 font-mono">
                                {track.characterName} — F{active ? active.frame.frameIndex + 1 : '?'}/{track.frames.length}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Camera viewport frame overlay — only in Edit View */}
            {cam.hasCamera && viewMode === 'edit' && (() => {
                // FOV determines what camera sees; aspect ratio from viewport resolution
                const aspect = cam.vpW / cam.vpH;
                const fovWRatio = cam.fovPx / 1920 / cam.zoom;
                const fovHRatio = (cam.fovPx / aspect) / 1080 / cam.zoom;
                const camOffX = (cam.x - 960) / 1920;
                const camOffY = (cam.y - 540) / 1080;
                const left = (0.5 - fovWRatio / 2 + camOffX) * 100;
                const top = (0.5 - fovHRatio / 2 + camOffY) * 100;
                const right = (0.5 + fovWRatio / 2 + camOffX) * 100;
                const bottom = (0.5 + fovHRatio / 2 + camOffY) * 100;

                return (
                    <div
                        className={`absolute ${cameraEditMode ? '' : 'pointer-events-none'}`}
                        style={{
                            width: `${CANVAS_W}px`, height: `${CANVAS_H}px`,
                            left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
                            zIndex: 2000,
                            cursor: cameraEditMode ? (cameraDragging ? 'grabbing' : 'grab') : 'default',
                        }}
                        onMouseDown={(e) => {
                            if (e.button === 0 && !isPlaying) {
                                e.preventDefault();
                                setCameraDragging(true);
                                setCameraDragStart({ x: e.clientX, y: e.clientY });
                            }
                        }}
                        onMouseMove={(e) => {
                            if (cameraDragging && cameraDragStart && onCameraMove) {
                                const dx = e.clientX - cameraDragStart.x;
                                const dy = e.clientY - cameraDragStart.y;
                                onCameraMove((dx * (1920 / CANVAS_W)), (dy * (1080 / CANVAS_H)));
                                setCameraDragStart({ x: e.clientX, y: e.clientY });
                            }
                        }}
                        onMouseUp={() => { setCameraDragging(false); setCameraDragStart(null); }}
                        onMouseLeave={() => { setCameraDragging(false); setCameraDragStart(null); }}
                    >
                        {/* Dim area outside camera */}
                        <div className="absolute inset-0 bg-black/50 pointer-events-none" style={{
                            clipPath: `polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% ${top}%, ${left}% ${top}%, ${left}% ${bottom}%, ${right}% ${bottom}%, ${right}% ${top}%, 0% ${top}%)`
                        }} />
                        {/* Camera frame border */}
                        <div className="absolute border-2 border-sky-400/70 rounded-sm pointer-events-none" style={{
                            left: `${left}%`, top: `${top}%`, width: `${right - left}%`, height: `${bottom - top}%`,
                        }}>
                            <div className="absolute -top-px -left-px w-3 h-3 border-t-2 border-l-2 border-sky-400" />
                            <div className="absolute -top-px -right-px w-3 h-3 border-t-2 border-r-2 border-sky-400" />
                            <div className="absolute -bottom-px -left-px w-3 h-3 border-b-2 border-l-2 border-sky-400" />
                            <div className="absolute -bottom-px -right-px w-3 h-3 border-b-2 border-r-2 border-sky-400" />
                            <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-sky-500/90 rounded px-2 py-0.5 text-[8px] text-white font-mono whitespace-nowrap">
                                🎥 ({Math.round(cam.x)},{Math.round(cam.y)}) {cam.zoom.toFixed(1)}×
                            </div>
                            {/* Rule of thirds inside camera */}
                            <div className="absolute inset-0 pointer-events-none">
                                <div className="absolute left-1/3 top-0 bottom-0 w-px bg-sky-400/15" />
                                <div className="absolute left-2/3 top-0 bottom-0 w-px bg-sky-400/15" />
                                <div className="absolute top-1/3 left-0 right-0 h-px bg-sky-400/15" />
                                <div className="absolute top-2/3 left-0 right-0 h-px bg-sky-400/15" />
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Camera View mode label */}
            {cam.hasCamera && viewMode === 'camera' && (
                <div className="absolute bottom-3 right-3 bg-sky-500/80 rounded px-2 py-1 text-[9px] text-white font-bold" style={{ zIndex: 60 }}>
                    📷 Camera View · {Math.round(cam.vpW)}×{Math.round(cam.vpH)} · {cam.zoom.toFixed(1)}×
                </div>
            )}
        </div>
    );
};

export default PreviewCanvas;
