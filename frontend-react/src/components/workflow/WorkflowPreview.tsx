import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useWorkflowStore, type CharacterNodeData, type BackgroundNodeData, type PoseFrame, type PositionKeyframe } from '@/store/useWorkflowStore';
import { useAppStore, STATIC_BASE, type Character } from '@/store/useAppStore';
import { API_BASE_URL } from '@/config/api';
import { X, Play, Pause, Square, SkipBack, SkipForward, Maximize2, Download, Move, Settings2, Plus, Trash2, Diamond, Layers } from 'lucide-react';
import SceneContextPanel from './SceneContextPanel';

interface WorkflowPreviewProps {
    onClose: () => void;
}

/** Resolved frame with actual image URLs for rendering */
interface ResolvedFrame {
    nodeId: string;
    nodeName: string;
    frameIndex: number;
    duration: number;
    transition: 'cut' | 'crossfade';
    transitionDuration: number;
    layerImages: { groupName: string; url: string; zIndex: number }[];
    posX: number;
    posY: number;
    scale: number;
    opacity: number;
    startX: number;
    startY: number;
    endX: number;
    endY: number;
}

/** A timeline track for one character */
interface PreviewTrack {
    nodeId: string;
    characterName: string;
    frames: ResolvedFrame[];
    totalDuration: number;
}

const WorkflowPreview: React.FC<WorkflowPreviewProps> = ({ onClose }) => {
    const { nodes, edges, updateNodeData } = useWorkflowStore();
    const characters = useAppStore((s) => s.characters);

    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [playbackSpeed, setPlaybackSpeed] = useState(1);
    const animFrameRef = useRef<number>(0);
    const lastTimeRef = useRef<number>(0);

    // Export state
    const [exporting, setExporting] = useState(false);
    const [exportProgress, setExportProgress] = useState(0);
    const [exportStatus, setExportStatus] = useState('');

    // Drag state
    const canvasRef = useRef<HTMLDivElement>(null);
    const [dragNodeId, setDragNodeId] = useState<string | null>(null);
    const [dragCoords, setDragCoords] = useState<{ x: number; y: number } | null>(null);

    // Inline editing state
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [editFrameIdx, setEditFrameIdx] = useState(0);

    // Scene Context Panel toggle
    const [showSceneContext, setShowSceneContext] = useState(false);

    // Helper: get canvas coords from mouse event
    const getCanvasCoords = useCallback((e: React.MouseEvent) => {
        if (!canvasRef.current) return null;
        const rect = canvasRef.current.getBoundingClientRect();
        const relX = (e.clientX - rect.left) / rect.width;
        const relY = (e.clientY - rect.top) / rect.height;
        return {
            x: Math.round(Math.max(0, Math.min(1920, relX * 1920))),
            y: Math.round(Math.max(0, Math.min(1080, relY * 1080))),
        };
    }, []);

    // CapCut-style: upsert a position keyframe at the current time
    const SNAP_THRESHOLD = 0.15; // seconds — merge if within 150ms
    const upsertPositionKeyframe = useCallback((nodeId: string, x: number, y: number) => {
        const node = nodes.find(n => n.id === nodeId);
        if (!node || node.type !== 'character') return;
        const data = node.data as CharacterNodeData;
        const kfs = [...(data.positionKeyframes || [])];
        const t = currentTime;

        // Find existing keyframe near currentTime
        const existingIdx = kfs.findIndex(kf => Math.abs(kf.time - t) < SNAP_THRESHOLD);
        if (existingIdx >= 0) {
            kfs[existingIdx] = { time: kfs[existingIdx].time, x, y };
        } else {
            kfs.push({ time: t, x, y });
        }
        // Sort by time
        kfs.sort((a, b) => a.time - b.time);
        updateNodeData(nodeId, { positionKeyframes: kfs });
    }, [nodes, currentTime, updateNodeData]);

    // Interpolate position from keyframes at a given time
    const getInterpolatedPos = useCallback((data: CharacterNodeData, time: number) => {
        const kfs = data.positionKeyframes;
        if (!kfs || kfs.length === 0) return { x: data.posX, y: data.posY };
        if (kfs.length === 1) return { x: kfs[0].x, y: kfs[0].y };
        if (time <= kfs[0].time) return { x: kfs[0].x, y: kfs[0].y };
        if (time >= kfs[kfs.length - 1].time) return { x: kfs[kfs.length - 1].x, y: kfs[kfs.length - 1].y };

        // Find the two keyframes to interpolate between
        for (let i = 0; i < kfs.length - 1; i++) {
            if (time >= kfs[i].time && time <= kfs[i + 1].time) {
                const t = (time - kfs[i].time) / (kfs[i + 1].time - kfs[i].time);
                return {
                    x: Math.round(kfs[i].x + (kfs[i + 1].x - kfs[i].x) * t),
                    y: Math.round(kfs[i].y + (kfs[i + 1].y - kfs[i].y) * t),
                };
            }
        }
        return { x: data.posX, y: data.posY };
    }, []);

    // ── Drag handlers ──
    const handleDragStart = useCallback((e: React.MouseEvent, nodeId: string) => {
        if (isPlaying) return;
        e.preventDefault();
        e.stopPropagation();
        setDragNodeId(nodeId);
        setSelectedNodeId(nodeId);
    }, [isPlaying]);

    const handleCharacterClick = useCallback((e: React.MouseEvent, nodeId: string) => {
        if (isPlaying) return;
        e.stopPropagation();
        setSelectedNodeId(prev => prev === nodeId ? null : nodeId);
        setEditFrameIdx(0);
    }, [isPlaying]);

    const handleDragMove = useCallback((e: React.MouseEvent) => {
        if (!dragNodeId) return;
        const coords = getCanvasCoords(e);
        if (!coords) return;
        setDragCoords(coords);
        // CapCut-style: auto-create/update position keyframe at current time
        upsertPositionKeyframe(dragNodeId, coords.x, coords.y);
    }, [dragNodeId, getCanvasCoords, upsertPositionKeyframe]);

    const handleDragEnd = useCallback(() => {
        setDragNodeId(null);
        setDragCoords(null);
    }, []);

    // ══════════════════════════════════════
    //  RESOLVE WORKFLOW → PREVIEW TRACKS
    // ══════════════════════════════════════
    const { tracks, totalDuration, backgroundUrl, backgroundBlur } = useMemo(() => {
        const sceneNode = nodes.find((n) => n.type === 'scene');
        if (!sceneNode) return { tracks: [], totalDuration: 0, backgroundUrl: '', backgroundBlur: 0 };

        const connectedEdges = edges.filter((e) => e.target === sceneNode.id);
        const connectedIds = connectedEdges.map((e) => e.source);

        const bgNode = nodes.find(
            (n) => n.type === 'background' && connectedIds.includes(n.id)
        );
        const bgData = bgNode?.data as BackgroundNodeData | undefined;
        const bgUrl = bgData?.assetPath ? `${STATIC_BASE}/${bgData.assetPath}` : '';
        const bgBlur = bgData?.blur || 0;

        const charNodes = nodes.filter(
            (n) => n.type === 'character' && connectedIds.includes(n.id)
        );

        const resultTracks: PreviewTrack[] = [];
        let maxDuration = 0;

        for (const cNode of charNodes) {
            const data = cNode.data as CharacterNodeData;
            if (!data.characterId || data.sequence.length === 0) continue;

            const character = characters.find((c) => c.id === data.characterId);
            if (!character) continue;

            const frames: ResolvedFrame[] = [];
            let time = 0;

            for (let i = 0; i < data.sequence.length; i++) {
                const pf = data.sequence[i];
                const layerImages = resolveFrameLayers(pf, character);

                frames.push({
                    nodeId: cNode.id,
                    nodeName: data.characterName || data.label,
                    frameIndex: i,
                    duration: pf.duration,
                    transition: pf.transition,
                    transitionDuration: pf.transitionDuration,
                    layerImages,
                    posX: data.posX,
                    posY: data.posY,
                    scale: data.scale,
                    opacity: data.opacity,
                    // Simple keyframe model: startX/Y = this keyframe's position
                    // endX/Y = next keyframe's position (auto-interpolate)
                    startX: pf.startX ?? data.posX,
                    startY: pf.startY ?? data.posY,
                    endX: (i + 1 < data.sequence.length
                        ? (data.sequence[i + 1].startX ?? data.posX)
                        : (pf.startX ?? data.posX)),
                    endY: (i + 1 < data.sequence.length
                        ? (data.sequence[i + 1].startY ?? data.posY)
                        : (pf.startY ?? data.posY)),
                });

                time += pf.duration;
            }

            resultTracks.push({
                nodeId: cNode.id,
                characterName: data.characterName || data.label,
                frames,
                totalDuration: time,
            });

            maxDuration = Math.max(maxDuration, time);
        }

        return {
            tracks: resultTracks,
            totalDuration: maxDuration || 5,
            backgroundUrl: bgUrl,
            backgroundBlur: bgBlur,
        };
    }, [nodes, edges, characters]);

    // ══════════════════════════════════════
    //  PLAYBACK LOOP
    // ══════════════════════════════════════
    const play = useCallback(() => {
        setIsPlaying(true);
        lastTimeRef.current = performance.now();
    }, []);

    const pause = useCallback(() => {
        setIsPlaying(false);
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    }, []);

    const stop = useCallback(() => {
        setIsPlaying(false);
        setCurrentTime(0);
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    }, []);

    const skipBack = useCallback(() => setCurrentTime(0), []);
    const skipForward = useCallback(() => setCurrentTime(totalDuration), [totalDuration]);

    useEffect(() => {
        if (!isPlaying) return;

        const tick = (now: number) => {
            const delta = (now - lastTimeRef.current) / 1000 * playbackSpeed;
            lastTimeRef.current = now;

            setCurrentTime((prev) => {
                const next = prev + delta;
                if (next >= totalDuration) return 0;
                return next;
            });

            animFrameRef.current = requestAnimationFrame(tick);
        };

        lastTimeRef.current = performance.now();
        animFrameRef.current = requestAnimationFrame(tick);

        return () => {
            if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        };
    }, [isPlaying, totalDuration, playbackSpeed]);

    // Close on Escape
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
            if (e.key === ' ') { e.preventDefault(); isPlaying ? pause() : play(); }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose, isPlaying, play, pause]);

    // ══════════════════════════════════════
    //  GET CURRENT FRAME FOR A TRACK
    // ══════════════════════════════════════
    const getActiveFrame = useCallback(
        (track: PreviewTrack): { frame: ResolvedFrame; progress: number } | null => {
            let elapsed = 0;
            for (const frame of track.frames) {
                if (currentTime >= elapsed && currentTime < elapsed + frame.duration) {
                    const progress = (currentTime - elapsed) / frame.duration;
                    return { frame, progress };
                }
                elapsed += frame.duration;
            }
            if (track.frames.length > 0 && currentTime >= elapsed) {
                return { frame: track.frames[track.frames.length - 1], progress: 1 };
            }
            return null;
        },
        [currentTime]
    );

    // ══════════════════════════════════════
    //  EXPORT VIDEO
    // ══════════════════════════════════════
    const exportVideo = useCallback(async () => {
        if (tracks.length === 0 || exporting) return;

        const FPS = 24;
        const W = 1920;
        const H = 1080;
        const totalFrames = Math.ceil(totalDuration * FPS);
        const CHUNK_SIZE = 10;

        setExporting(true);
        setExportProgress(0);
        setExportStatus('Đang tải ảnh...');

        try {
            // 1. Pre-load all images
            const imageCache = new Map<string, HTMLImageElement>();
            const urls = new Set<string>();
            if (backgroundUrl) urls.add(backgroundUrl);
            for (const track of tracks) {
                for (const frame of track.frames) {
                    for (const layer of frame.layerImages) urls.add(layer.url);
                }
            }
            await Promise.all(
                Array.from(urls).map(async (url) => {
                    try {
                        const res = await fetch(url);
                        const blob = await res.blob();
                        const blobUrl = URL.createObjectURL(blob);
                        const img = new Image();
                        await new Promise<void>((resolve, reject) => {
                            img.onload = () => resolve();
                            img.onerror = () => reject();
                            img.src = blobUrl;
                        });
                        imageCache.set(url, img);
                    } catch {
                        console.warn('Failed to load:', url);
                    }
                })
            );

            // 2. Start export session
            setExportStatus('Đang khởi tạo export...');
            const startRes = await fetch(`${API_BASE_URL}/api/export/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ totalFrames, fps: FPS }),
            });
            if (!startRes.ok) throw new Error('Failed to start export');
            const { renderJobId } = await startRes.json();

            // 3. Render frames on offscreen canvas
            const canvas = document.createElement('canvas');
            canvas.width = W;
            canvas.height = H;
            const ctx = canvas.getContext('2d')!;

            const getFrameAtTime = (track: typeof tracks[0], t: number) => {
                let elapsed = 0;
                for (const frame of track.frames) {
                    if (t >= elapsed && t < elapsed + frame.duration) return frame;
                    elapsed += frame.duration;
                }
                return track.frames.length > 0 ? track.frames[track.frames.length - 1] : null;
            };

            let chunkIndex = 0;
            for (let start = 0; start < totalFrames; start += CHUNK_SIZE) {
                const batch: string[] = [];
                const end = Math.min(start + CHUNK_SIZE, totalFrames);

                for (let fi = start; fi < end; fi++) {
                    const t = (fi / FPS);

                    ctx.clearRect(0, 0, W, H);
                    ctx.fillStyle = '#111118';
                    ctx.fillRect(0, 0, W, H);

                    // Background
                    if (backgroundUrl && imageCache.has(backgroundUrl)) {
                        const bgImg = imageCache.get(backgroundUrl)!;
                        const bgAR = bgImg.naturalWidth / bgImg.naturalHeight;
                        const canvasAR = W / H;
                        let sx = 0, sy = 0, sw = bgImg.naturalWidth, sh = bgImg.naturalHeight;
                        if (bgAR > canvasAR) {
                            sw = bgImg.naturalHeight * canvasAR;
                            sx = (bgImg.naturalWidth - sw) / 2;
                        } else {
                            sh = bgImg.naturalWidth / canvasAR;
                            sy = (bgImg.naturalHeight - sh) / 2;
                        }
                        ctx.drawImage(bgImg, sx, sy, sw, sh, 0, 0, W, H);
                    }

                    // Characters
                    for (const track of tracks) {
                        const frame = getFrameAtTime(track, t);
                        if (!frame) continue;

                        let frameElapsed = 0;
                        let frameProgress = 0;
                        for (const f of track.frames) {
                            if (t >= frameElapsed && t < frameElapsed + f.duration) {
                                frameProgress = (t - frameElapsed) / f.duration;
                                break;
                            }
                            frameElapsed += f.duration;
                        }

                        const lerpX = frame.startX + (frame.endX - frame.startX) * frameProgress;
                        const lerpY = frame.startY + (frame.endY - frame.startY) * frameProgress;

                        ctx.save();
                        ctx.globalAlpha = frame.opacity;

                        const sorted = [...frame.layerImages].sort((a, b) => a.zIndex - b.zIndex);
                        for (const layer of sorted) {
                            const img = imageCache.get(layer.url);
                            if (!img) continue;

                            const maxSize = 480 * frame.scale;
                            const natW = img.naturalWidth;
                            const natH = img.naturalHeight;
                            const ratio = Math.min(maxSize / natW, maxSize / natH);
                            const drawW = natW * ratio;
                            const drawH = natH * ratio;

                            const drawX = lerpX - drawW / 2;
                            const drawY = lerpY - drawH;

                            ctx.drawImage(img, drawX, drawY, drawW, drawH);
                        }
                        ctx.restore();
                    }

                    const dataUrl = canvas.toDataURL('image/png');
                    batch.push(dataUrl.split(',')[1]);
                }

                setExportStatus(`Đang render frame ${start + 1}–${end} / ${totalFrames}`);
                setExportProgress(Math.round((end / totalFrames) * 80));

                const chunkRes = await fetch(`${API_BASE_URL}/api/export/chunk`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        renderJobId,
                        chunkIndex: chunkIndex++,
                        frameOffset: start,
                        frames: batch,
                    }),
                });
                if (!chunkRes.ok) throw new Error('Chunk upload failed');
            }

            // 4. Finish — FFmpeg stitch
            setExportStatus('Đang ghép video bằng FFmpeg...');
            setExportProgress(90);

            const finishRes = await fetch(`${API_BASE_URL}/api/export/finish`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ renderJobId, fps: FPS }),
            });
            if (!finishRes.ok) throw new Error('FFmpeg stitching failed');

            // 5. Download
            setExportStatus('Đang tải xuống...');
            setExportProgress(100);

            const blob = await finishRes.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `workflow_export_${Date.now()}.mp4`;
            a.click();
            URL.revokeObjectURL(url);

            setExportStatus('✅ Hoàn thành!');
            setTimeout(() => setExporting(false), 1500);

        } catch (err) {
            console.error('Export error:', err);
            setExportStatus(`❌ Lỗi: ${(err as Error).message}`);
            setTimeout(() => setExporting(false), 3000);
        }
    }, [tracks, totalDuration, backgroundUrl, exporting]);

    // ══════════════════════════════════════
    //  RENDER
    // ══════════════════════════════════════
    return (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#08080f' }}>
            {/* Close button */}
            <button
                onClick={onClose}
                className="absolute top-4 right-4 z-20 p-2 rounded-lg bg-black/60 hover:bg-white/10 text-neutral-400 hover:text-white transition-colors"
            >
                <X className="w-5 h-5" />
            </button>

            {/* Canvas Area + Sidebar Row */}
            <div className="flex-1 flex flex-row overflow-hidden">
                {/* Canvas centering wrapper */}
                <div className="flex-1 flex items-center justify-center relative">
                    {tracks.length === 0 ? (
                        <div className="text-center text-neutral-500">
                            <Maximize2 className="w-12 h-12 mx-auto mb-4 text-neutral-600" />
                            <p className="text-sm font-medium">No animation to preview</p>
                            <p className="text-xs text-neutral-600 mt-1">
                                Connect Character nodes (with poses) to a Scene Output node first.
                            </p>
                        </div>
                    ) : (
                        <div
                            ref={canvasRef}
                            className="relative bg-neutral-900/50 rounded-xl border border-white/5 overflow-hidden"
                            style={{ width: '800px', height: '450px', cursor: dragNodeId ? 'grabbing' : undefined }}
                            onMouseMove={handleDragMove}
                            onMouseUp={handleDragEnd}
                            onMouseLeave={handleDragEnd}
                        >
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

                            {/* ── Path preview: show positionKeyframes ── */}
                            {!isPlaying && selectedNodeId && (() => {
                                const selNode = nodes.find(n => n.id === selectedNodeId);
                                if (!selNode || selNode.type !== 'character') return null;
                                const selData = selNode.data as CharacterNodeData;
                                const kfs = selData.positionKeyframes;
                                if (!kfs || kfs.length === 0) return null;

                                const positions = kfs.map(kf => ({
                                    x: kf.x / 1920 * 100,
                                    y: kf.y / 1080 * 100,
                                    time: kf.time,
                                }));

                                // Find nearest keyframe to currentTime
                                let nearestIdx = 0;
                                let nearestDist = Infinity;
                                kfs.forEach((kf, i) => {
                                    const d = Math.abs(kf.time - currentTime);
                                    if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
                                });

                                return (
                                    <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 45 }}>
                                        {/* Path lines */}
                                        {positions.map((pos, i) => {
                                            if (i === 0) return null;
                                            const prev = positions[i - 1];
                                            return (
                                                <line
                                                    key={`pl-${i}`}
                                                    x1={`${prev.x}%`} y1={`${prev.y}%`}
                                                    x2={`${pos.x}%`} y2={`${pos.y}%`}
                                                    stroke="#f59e0b" strokeWidth="2" strokeDasharray="6 4" opacity={0.5}
                                                />
                                            );
                                        })}
                                        {/* Keyframe dots */}
                                        {positions.map((pos, i) => {
                                            const isNearest = i === nearestIdx;
                                            return (
                                                <g key={`kfd-${i}`}>
                                                    <circle
                                                        cx={`${pos.x}%`} cy={`${pos.y}%`} r={isNearest ? 7 : 4}
                                                        fill={isNearest ? '#f59e0b' : '#6366f1'}
                                                        stroke="white" strokeWidth="2" opacity={0.9}
                                                    />
                                                    <text
                                                        x={`${pos.x}%`} y={`${pos.y}%`} dy={-14}
                                                        textAnchor="middle"
                                                        fill={isNearest ? '#f59e0b' : '#818cf8'}
                                                        fontSize="9" fontWeight="bold"
                                                    >
                                                        {pos.time.toFixed(1)}s
                                                    </text>
                                                </g>
                                            );
                                        })}
                                    </svg>
                                );
                            })()}

                            {/* Background */}
                            {backgroundUrl && (
                                <img
                                    src={backgroundUrl}
                                    className="absolute inset-0 w-full h-full object-cover"
                                    style={{ filter: backgroundBlur > 0 ? `blur(${backgroundBlur}px)` : undefined, zIndex: 0 }}
                                    alt="Background"
                                    draggable={false}
                                />
                            )}
                            {!backgroundUrl && (
                                <div className="absolute inset-0 bg-gradient-to-b from-neutral-800/50 to-neutral-900/80" style={{ zIndex: 0 }} />
                            )}

                            {/* Render each character track */}
                            {tracks.map((track) => {
                                const active = getActiveFrame(track);
                                if (!active) return null;
                                const { frame } = active;

                                // CapCut-style: get interpolated position from positionKeyframes
                                const charNode = nodes.find(n => n.id === track.nodeId);
                                const charData = charNode?.data as CharacterNodeData | undefined;
                                const pos = charData
                                    ? getInterpolatedPos(charData, currentTime)
                                    : { x: frame.posX, y: frame.posY };

                                return (
                                    <div
                                        key={track.nodeId}
                                        className={`absolute transition-shadow ${!isPlaying ? 'cursor-grab hover:ring-2 hover:ring-emerald-500/50 rounded-lg' : ''} ${dragNodeId === track.nodeId ? 'cursor-grabbing ring-2 ring-emerald-400' : ''} ${selectedNodeId === track.nodeId && !isPlaying ? 'ring-2 ring-amber-400/70' : ''}`}
                                        style={{
                                            left: `${(pos.x / 1920) * 100}%`,
                                            top: `${(pos.y / 1080) * 100}%`,
                                            transform: `translate(-50%, -100%) scale(${frame.scale * 0.5})`,
                                            opacity: frame.opacity,
                                            zIndex: Math.round(pos.y),
                                            transformOrigin: 'bottom center',
                                        }}
                                        onMouseDown={(e) => handleDragStart(e, track.nodeId)}
                                        onClick={(e) => handleCharacterClick(e, track.nodeId)}
                                    >
                                        <div className="relative" style={{ width: '400px', height: '400px' }}>
                                            {frame.layerImages.map((layer, i) => (
                                                <img
                                                    key={`${layer.groupName}-${i}`}
                                                    src={layer.url}
                                                    className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                                                    style={{ zIndex: layer.zIndex }}
                                                    alt={layer.groupName}
                                                    loading="eager"
                                                    draggable={false}
                                                />
                                            ))}
                                        </div>
                                        {!isPlaying && (
                                            <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 bg-black/70 rounded px-2 py-0.5 text-[8px] text-neutral-300 whitespace-nowrap font-mono">
                                                {track.characterName}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}

                            {/* Time overlay */}
                            <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-sm rounded-lg px-3 py-1.5 flex items-center gap-2">
                                <span className="text-amber-400 text-xs font-mono font-bold">{currentTime.toFixed(1)}s</span>
                                <span className="text-neutral-500 text-[10px]">/ {totalDuration.toFixed(1)}s</span>
                            </div>

                            {/* Track labels */}
                            <div className="absolute top-3 right-3 space-y-1">
                                {tracks.map((track) => {
                                    const active = getActiveFrame(track);
                                    return (
                                        <div key={track.nodeId} className="bg-black/70 backdrop-blur-sm rounded px-2 py-1 text-[10px] text-neutral-300 font-mono">
                                            {track.characterName} — F{active ? active.frame.frameIndex + 1 : '?'}/{track.frames.length}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* Scene Context Panel */}
                {showSceneContext && (
                    <SceneContextPanel onClose={() => setShowSceneContext(false)} />
                )}

                {/* ══════ INLINE EDITING SIDEBAR ══════ */}
                {selectedNodeId && !isPlaying && (() => {
                    const selNode = nodes.find(n => n.id === selectedNodeId);
                    if (!selNode || selNode.type !== 'character') return null;
                    const nodeId = selectedNodeId!; // guaranteed non-null by outer condition
                    const selData = selNode.data as CharacterNodeData;
                    const selChar = characters.find(c => c.id === selData.characterId);
                    if (!selChar) return null;
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

                    return (
                        <div className="w-72 shrink-0 bg-neutral-900/95 border-l border-white/5 flex flex-col z-30">
                            {/* Header */}
                            <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
                                <Settings2 className="w-4 h-4 text-amber-400" />
                                <span className="text-xs font-bold text-white flex-1 truncate">{selData.characterName || selData.label}</span>
                                <button onClick={() => setSelectedNodeId(null)} className="p-1 hover:bg-white/5 rounded text-neutral-500 hover:text-white">
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>

                            {/* Selected Frame Indicator (selection via timeline below) */}
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

                                {/* Position Keyframes (CapCut-style) */}
                                <div className="p-2 rounded bg-amber-500/5 border border-amber-500/10 space-y-1.5">
                                    <label className="block text-[9px] font-bold text-amber-400 uppercase tracking-wider">◇ Position Keyframes</label>
                                    <p className="text-[9px] text-neutral-500">Scrub timeline → Kéo nhân vật → Tự động tạo keyframe</p>
                                    {(() => {
                                        const kfs = selData.positionKeyframes || [];
                                        if (kfs.length === 0) return (
                                            <p className="text-[8px] text-neutral-600 italic">Chưa có keyframe. Kéo nhân vật để tạo.</p>
                                        );
                                        return (
                                            <div className="space-y-0.5 max-h-28 overflow-y-auto">
                                                {kfs.map((kf, i) => {
                                                    const isNearest = Math.abs(kf.time - currentTime) < 0.15;
                                                    return (
                                                        <div key={i} className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[9px] transition-colors ${isNearest ? 'bg-amber-500/20 text-amber-200' : 'text-neutral-400 hover:bg-white/5'
                                                            }`}>
                                                            <Diamond className="w-2.5 h-2.5 text-amber-400 shrink-0" />
                                                            <span className="font-mono font-bold w-10">{kf.time.toFixed(1)}s</span>
                                                            <span className="font-mono text-[8px]">({kf.x}, {kf.y})</span>
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
                                        );
                                    })()}
                                    {(selData.positionKeyframes?.length ?? 0) > 0 && (
                                        <button
                                            onClick={() => updateNodeData(nodeId, { positionKeyframes: [] })}
                                            className="w-full text-center text-[9px] text-neutral-500 hover:text-red-400 py-0.5 transition-colors"
                                        >
                                            ↺ Clear all keyframes
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
                })()}
            </div>

            {/* ══════ KEYFRAME TIMELINE PANEL ══════ */}
            <div className="border-t border-white/5 bg-neutral-950/80">
                {/* Time ruler */}
                <div className="relative h-5 border-b border-white/5 ml-28">
                    {totalDuration > 0 && Array.from({ length: Math.ceil(totalDuration) + 1 }, (_, i) => (
                        <div
                            key={i}
                            className="absolute top-0 h-full flex flex-col justify-end"
                            style={{ left: `${(i / totalDuration) * 100}%` }}
                        >
                            <div className="w-px h-2 bg-white/20" />
                            <span className="text-[8px] text-neutral-600 font-mono -translate-x-1/2 select-none">{i}s</span>
                        </div>
                    ))}
                    {/* Clickable ruler to scrub */}
                    <div
                        className="absolute inset-0 cursor-pointer"
                        onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                            setCurrentTime(pct * totalDuration);
                        }}
                    />
                </div>

                {/* Track rows */}
                <div className="relative">
                    {tracks.length === 0 ? (
                        <div className="px-4 py-3 text-center text-neutral-600 text-[10px]">
                            No tracks — connect Character nodes to Scene Output
                        </div>
                    ) : (
                        tracks.map((track) => {
                            const isTrackSelected = selectedNodeId === track.nodeId;
                            const nodeData = nodes.find(n => n.id === track.nodeId)?.data as CharacterNodeData | undefined;
                            const seq = nodeData?.sequence || [];

                            // Calculate cumulative time offsets for each frame
                            let cumTime = 0;
                            const frameBlocks = seq.map((f, idx) => {
                                const start = cumTime;
                                cumTime += f.duration;
                                return { frame: f, idx, startTime: start, endTime: cumTime };
                            });

                            return (
                                <div
                                    key={track.nodeId}
                                    className={`flex items-stretch border-b border-white/5 group transition-colors ${isTrackSelected ? 'bg-amber-500/5' : 'hover:bg-white/[0.02]'
                                        }`}
                                >
                                    {/* Track label */}
                                    <div
                                        className={`w-28 shrink-0 flex items-center gap-1.5 px-2 py-1.5 border-r border-white/5 cursor-pointer transition-colors ${isTrackSelected ? 'bg-amber-500/10' : 'hover:bg-white/5'
                                            }`}
                                        onClick={() => {
                                            setSelectedNodeId(track.nodeId);
                                            setEditFrameIdx(0);
                                        }}
                                    >
                                        <div className={`w-2 h-2 rounded-full ${isTrackSelected ? 'bg-amber-400' : 'bg-indigo-500'
                                            }`} />
                                        <span className="text-[9px] font-bold text-neutral-300 truncate">{track.characterName}</span>
                                    </div>

                                    {/* Keyframe blocks area */}
                                    <div className="flex-1 relative h-8 min-h-[32px]">
                                        {frameBlocks.map(({ frame: f, idx, startTime }) => {
                                            const leftPct = totalDuration > 0 ? (startTime / totalDuration) * 100 : 0;
                                            const widthPct = totalDuration > 0 ? (f.duration / totalDuration) * 100 : 0;
                                            const isActive = isTrackSelected && editFrameIdx === idx;
                                            const hasMovement = (f.startX != null && f.endX != null && (f.startX !== f.endX || f.startY !== f.endY));

                                            return (
                                                <div
                                                    key={idx}
                                                    className={`absolute top-1 bottom-1 rounded cursor-pointer flex items-center justify-center gap-0.5 overflow-hidden transition-all text-[8px] font-mono select-none ${isActive
                                                        ? 'bg-amber-500/30 border border-amber-400 text-amber-200 ring-1 ring-amber-400/30 z-10'
                                                        : 'bg-indigo-500/15 border border-indigo-500/30 text-indigo-400/80 hover:bg-indigo-500/25 hover:border-indigo-400/50'
                                                        }`}
                                                    style={{ left: `${leftPct}%`, width: `${Math.max(widthPct, 1.5)}%` }}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setSelectedNodeId(track.nodeId);
                                                        setEditFrameIdx(idx);
                                                    }}
                                                    title={`Frame ${idx + 1}: ${f.duration}s${hasMovement ? ' (moving)' : ''}`}
                                                >
                                                    {widthPct > 4 && <span>F{idx + 1}</span>}
                                                    {widthPct > 8 && <span className="text-[7px] opacity-60">{f.duration}s</span>}
                                                    {hasMovement && widthPct > 3 && <span className="text-emerald-400 text-[7px]">→</span>}
                                                </div>
                                            );
                                        })}

                                        {/* Playhead */}
                                        <div
                                            className="absolute top-0 bottom-0 w-px bg-white/60 pointer-events-none z-20"
                                            style={{ left: `${totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0}%` }}
                                        >
                                            <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-white rounded-full" />
                                        </div>

                                        {/* Diamond markers for positionKeyframes */}
                                        {(() => {
                                            const kfs = nodeData?.positionKeyframes || [];
                                            return kfs.map((kf, ki) => {
                                                const leftPct = totalDuration > 0 ? (kf.time / totalDuration) * 100 : 0;
                                                return (
                                                    <div
                                                        key={`pkf-${ki}`}
                                                        className="absolute -bottom-0.5 w-2.5 h-2.5 bg-amber-400 border border-amber-600 rotate-45 cursor-pointer hover:scale-125 transition-transform z-30"
                                                        style={{ left: `${leftPct}%`, transform: `translateX(-50%) rotate(45deg)` }}
                                                        title={`Position KF: ${kf.time.toFixed(1)}s (${kf.x}, ${kf.y})`}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setCurrentTime(kf.time);
                                                            setSelectedNodeId(track.nodeId);
                                                        }}
                                                    />
                                                );
                                            });
                                        })()}
                                    </div>

                                    {/* Add/Delete frame buttons */}
                                    <div className="shrink-0 flex items-center gap-0.5 px-1 border-l border-white/5">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (!nodeData) return;
                                                const newFrame: PoseFrame = {
                                                    id: crypto.randomUUID(),
                                                    layers: seq.length > 0 ? { ...seq[seq.length - 1].layers } : {},
                                                    duration: 2,
                                                    transition: 'cut',
                                                    transitionDuration: 0.3,
                                                };
                                                const updated = [...seq, newFrame];
                                                updateNodeData(track.nodeId, { sequence: updated });
                                                setSelectedNodeId(track.nodeId);
                                                setEditFrameIdx(updated.length - 1);
                                            }}
                                            className="p-1 rounded hover:bg-emerald-500/20 text-neutral-600 hover:text-emerald-400 transition-colors"
                                            title="Add keyframe"
                                        >
                                            <Plus className="w-3 h-3" />
                                        </button>
                                        {isTrackSelected && seq.length > 1 && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    const fi = Math.min(editFrameIdx, seq.length - 1);
                                                    const updated = seq.filter((_, i) => i !== fi);
                                                    updateNodeData(track.nodeId, { sequence: updated });
                                                    setEditFrameIdx(Math.max(0, fi - 1));
                                                }}
                                                className="p-1 rounded hover:bg-red-500/20 text-neutral-600 hover:text-red-400 transition-colors"
                                                title="Delete selected keyframe"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}

                    {/* Global playhead line across all tracks */}
                    <div
                        className="absolute top-0 bottom-0 w-px bg-red-500/50 pointer-events-none z-20"
                        style={{ left: `calc(112px + ${totalDuration > 0 ? (currentTime / totalDuration) : 0} * (100% - 112px - 44px))` }}
                    />
                </div>
            </div>

            {/* Playback Controls */}
            <div className="flex items-center justify-center gap-3 px-6 py-4 border-t border-white/5">
                <button onClick={skipBack} className="p-2 rounded-lg hover:bg-white/5 text-neutral-400 hover:text-white">
                    <SkipBack className="w-4 h-4" />
                </button>
                {isPlaying ? (
                    <button onClick={pause} className="w-12 h-12 rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-xl shadow-indigo-500/30 hover:from-indigo-500 hover:to-purple-500 active:scale-90 transition-all">
                        <Pause className="w-5 h-5" />
                    </button>
                ) : (
                    <button onClick={play} className="w-12 h-12 rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-xl shadow-indigo-500/30 hover:from-indigo-500 hover:to-purple-500 active:scale-90 transition-all">
                        <Play className="w-5 h-5 ml-0.5" />
                    </button>
                )}
                <button onClick={stop} className="p-2 rounded-lg hover:bg-white/5 text-neutral-400 hover:text-white">
                    <Square className="w-4 h-4" />
                </button>
                <button onClick={skipForward} className="p-2 rounded-lg hover:bg-white/5 text-neutral-400 hover:text-white">
                    <SkipForward className="w-4 h-4" />
                </button>

                {/* Speed */}
                <div className="ml-4 flex items-center gap-1">
                    {[0.5, 1, 1.5, 2].map((speed) => (
                        <button
                            key={speed}
                            onClick={() => setPlaybackSpeed(speed)}
                            className={`px-2 py-1 rounded text-[10px] font-bold transition-all ${playbackSpeed === speed
                                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                                : 'text-neutral-500 hover:text-white hover:bg-white/5'
                                }`}
                        >
                            {speed}×
                        </button>
                    ))}
                </div>

                {/* Export */}
                {/* Scene Context Toggle */}
                <button
                    onClick={() => setShowSceneContext(!showSceneContext)}
                    className={`ml-4 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all ${showSceneContext
                            ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                            : 'text-neutral-400 hover:text-white hover:bg-white/5 border border-white/10'
                        }`}
                    title="Toggle Scene Context Panel"
                >
                    <Layers className="w-4 h-4" />
                    Context
                </button>

                <button
                    onClick={exportVideo}
                    disabled={exporting || tracks.length === 0}
                    className="ml-2 flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-xs font-bold shadow-lg shadow-emerald-500/30 hover:from-emerald-500 hover:to-teal-500 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    <Download className="w-4 h-4" />
                    Export MP4
                </button>
            </div>

            {/* Export Progress Overlay */}
            {exporting && (
                <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
                    <div className="w-80">
                        <div className="text-center mb-4">
                            <div className="w-12 h-12 mx-auto mb-3 border-3 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                            <p className="text-white text-sm font-medium">{exportStatus}</p>
                        </div>
                        <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-300"
                                style={{ width: `${exportProgress}%` }}
                            />
                        </div>
                        <p className="text-center text-neutral-500 text-[10px] mt-2">{exportProgress}%</p>
                    </div>
                </div>
            )}
        </div>
    );
};

// ══════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════

function resolveFrameLayers(
    frame: PoseFrame,
    character: Character
): { groupName: string; url: string; zIndex: number }[] {
    const result: { groupName: string; url: string; zIndex: number }[] = [];

    for (const [groupName, hash] of Object.entries(frame.layers)) {
        const assets = character.layer_groups[groupName];
        if (!assets) continue;

        const asset = assets.find((a) => a.hash === hash || a.name === hash);
        if (!asset) continue;

        const url = asset.path ? `${STATIC_BASE}/${asset.path}` : '';
        if (!url) continue;

        const groupIndex = character.group_order.indexOf(groupName);
        result.push({
            groupName,
            url,
            zIndex: groupIndex >= 0 ? groupIndex : 0,
        });
    }

    return result;
}

export default WorkflowPreview;
