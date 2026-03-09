import React, { useState, useMemo } from 'react';
import { useWorkflowStore, type CharacterNodeData, type BackgroundNodeData, type StageNodeData, type StageLayer, type CameraNodeData, type CameraKeyframe } from '@/stores/useWorkflowStore';
import { useAppStore, STATIC_BASE } from '@/stores/useAppStore';
import SceneContextPanel from './SceneContextPanel';
import PreviewCanvas from './preview/PreviewCanvas';
import PreviewSidebar from './preview/PreviewSidebar';
import KeyframeTimeline from './preview/KeyframeTimeline';
import PlaybackControls from './preview/PlaybackControls';
import ExportOverlay from './preview/ExportOverlay';
import { usePlayback } from './preview/usePlayback';
import { useExportVideoWebCodecs } from './preview/useExportVideoWebCodecs';
import { resolveFrameLayers, type ResolvedFrame, type PreviewTrack } from './preview/types';

interface WorkflowPreviewProps {
    onClose: () => void;
}

const WorkflowPreview: React.FC<WorkflowPreviewProps> = ({ onClose }) => {
    const { nodes, edges } = useWorkflowStore();
    const updateNodeData = useWorkflowStore((s) => s.updateNodeData);
    const characters = useAppStore((s) => s.characters);

    // Inline editing state
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [editFrameIdx, setEditFrameIdx] = useState(0);

    // Scene Context Panel toggle
    const [showSceneContext, setShowSceneContext] = useState(false);

    // Export mode: WebCodecs (GPU-accelerated, no FFmpeg)
    // const exportMode removed — single WebCodecs path

    // Camera edit mode toggle
    const [cameraEditMode, setCameraEditMode] = useState(false);

    // View mode: 'edit' = see full world + camera frame overlay, 'camera' = WYSIWYG through lens
    const [viewMode, setViewMode] = useState<'edit' | 'camera'>('edit');

    // ══════════════════════════════════════
    //  RESOLVE WORKFLOW → PREVIEW TRACKS
    // ══════════════════════════════════════
    const { tracks, totalDuration, backgroundUrl, backgroundBlur, overlayLayers, allCameras, sceneNodeId, cameraCuts, ppu } = useMemo(() => {
        const sceneNode = nodes.find((n) => n.type === 'scene');
        if (!sceneNode) return {
            tracks: [], totalDuration: 0, backgroundUrl: '', backgroundBlur: 0,
            overlayLayers: [] as StageLayer[],
            allCameras: [] as { id: string; label: string; data: CameraNodeData }[],
            sceneNodeId: null as string | null,
            cameraCuts: [] as import('@/stores/useWorkflowStore').CameraCut[],
            ppu: 100,
        };

        const connectedEdges = edges.filter((e) => e.target === sceneNode.id);
        const connectedIds = connectedEdges.map((e) => e.source);

        const bgNode = nodes.find(
            (n) => n.type === 'background' && connectedIds.includes(n.id)
        );
        const bgData = bgNode?.data as BackgroundNodeData | undefined;
        let bgUrl = bgData?.assetPath ? `${STATIC_BASE}/${bgData.assetPath}` : '';
        let bgBlur = bgData?.blur || 0;

        // ── Stage node: extract layers for BG + overlays ──
        let stageOverlays: StageLayer[] = [];
        const stageNode = nodes.find(
            (n) => n.type === 'stage' && connectedIds.includes(n.id)
        );
        if (stageNode) {
            const stageData = stageNode.data as StageNodeData;
            const sortedLayers = [...(stageData.layers || [])]
                .filter(l => l.visible && l.assetPath)
                .sort((a, b) => a.zIndex - b.zIndex);

            const bgLayer = sortedLayers.find(l => l.type === 'background');
            if (bgLayer && !bgUrl) {
                bgUrl = `${STATIC_BASE}/${bgLayer.assetPath}`;
                bgBlur = bgLayer.blur || 0;
            }

            stageOverlays = sortedLayers.filter(l => l !== bgLayer);
        }

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

        // ── Multi-camera resolution ──
        const camNodes = nodes.filter(
            (n) => n.type === 'camera' && connectedIds.includes(n.id)
        );
        const allCams = camNodes.map(n => ({
            id: n.id,
            label: (n.data as CameraNodeData).label || 'Camera',
            data: n.data as CameraNodeData,
        }));

        const sceneData = sceneNode.data as import('@/stores/useWorkflowStore').SceneNodeData;
        const cuts = (sceneData.cameraCuts || []).sort((a, b) => a.time - b.time);

        return {
            tracks: resultTracks,
            totalDuration: maxDuration || 5,
            backgroundUrl: bgUrl,
            backgroundBlur: bgBlur,
            overlayLayers: stageOverlays,
            allCameras: allCams,
            sceneNodeId: sceneNode.id,
            cameraCuts: cuts,
            ppu: sceneData.pixelsPerUnit || 100,
        };
    }, [nodes, edges, characters]);

    // Hooks
    const playback = usePlayback({ totalDuration, onClose });

    // ── Resolve active camera based on cameraCuts + playback time ──
    const { cameraData, cameraNodeId } = useMemo(() => {
        if (allCameras.length === 0) return { cameraData: null as CameraNodeData | null, cameraNodeId: null as string | null };

        let activeCamId: string | null = null;
        if (cameraCuts.length > 0) {
            for (let i = cameraCuts.length - 1; i >= 0; i--) {
                if (playback.currentTime >= cameraCuts[i].time) {
                    activeCamId = cameraCuts[i].cameraNodeId;
                    break;
                }
            }
            if (!activeCamId) activeCamId = cameraCuts[0].cameraNodeId;
        }
        // Fallback: first connected camera
        if (!activeCamId) activeCamId = allCameras[0].id;

        const activeCam = allCameras.find(c => c.id === activeCamId);
        const data = activeCam?.data || null;
        return {
            cameraData: data && data.keyframes?.length > 0 ? data : null,
            cameraNodeId: activeCamId,
        };
    }, [allCameras, cameraCuts, playback.currentTime]);

    // Shared export config
    const exportConfig = useMemo(() => ({
        tracks,
        totalDuration,
        backgroundUrl,
        backgroundBlur,
        overlayLayers: overlayLayers.map((l) => ({
            id: l.id,
            type: l.type,
            label: l.label,
            assetUrl: `${STATIC_BASE}/${l.assetPath}`,
            posX: l.posX,
            posY: l.posY,
            zIndex: l.zIndex,
            scale: l.scale,
            opacity: l.opacity,
            rotation: l.rotation,
            blur: l.blur,
        })),
        cameraData,
        charNodeDataMap: new Map(
            nodes
                .filter(n => n.type === 'character' || n.type === 'characterV2')
                .map(n => [n.id, n.data as CharacterNodeData])
        ),
        ppu,
    }), [tracks, totalDuration, backgroundUrl, backgroundBlur, overlayLayers, cameraData, nodes, ppu]);

    // WebCodecs GPU export (no FFmpeg needed)
    const { exporting, exportProgress, exportStatus, exportVideo } = useExportVideoWebCodecs(exportConfig);

    return (
        <div className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-md flex flex-col">
            {/* ══════ MAIN CONTENT ══════ */}
            <div className="flex-1 flex min-h-0">
                {/* Canvas + Scene Context */}
                <div className="flex-1 flex">
                    <PreviewCanvas
                        tracks={tracks}
                        totalDuration={totalDuration}
                        backgroundUrl={backgroundUrl}
                        backgroundBlur={backgroundBlur}
                        overlayLayers={overlayLayers}
                        cameraData={cameraData}
                        onCameraZoom={(delta) => {
                            if (!cameraNodeId) return;
                            const camNode = nodes.find((n) => n.id === cameraNodeId);
                            if (!camNode) return;
                            const camD = camNode.data as CameraNodeData;
                            const kfs: CameraKeyframe[] = camD.keyframes || [];
                            if (kfs.length === 0) return;
                            let nearest = kfs[0], minDist = Infinity;
                            for (const kf of kfs) {
                                const d = Math.abs(kf.time - playback.currentTime);
                                if (d < minDist) { minDist = d; nearest = kf; }
                            }
                            const newZoom = Math.max(0.5, Math.min(5, nearest.zoom + delta));
                            const updated = kfs.map(kf => kf.id === nearest.id ? { ...kf, zoom: newZoom } : kf);
                            updateNodeData(cameraNodeId, { keyframes: updated });
                        }}
                        onCameraMove={(dx, dy) => {
                            if (!cameraNodeId) return;
                            const camNode = nodes.find((n) => n.id === cameraNodeId);
                            if (!camNode) return;
                            const camD = camNode.data as CameraNodeData;
                            const kfs: CameraKeyframe[] = camD.keyframes || [];
                            if (kfs.length === 0) return;
                            let nearest = kfs[0], minDist = Infinity;
                            for (const kf of kfs) {
                                const d = Math.abs(kf.time - playback.currentTime);
                                if (d < minDist) { minDist = d; nearest = kf; }
                            }
                            const updated = kfs.map(kf => kf.id === nearest.id ? { ...kf, x: +(kf.x + dx / ppu).toFixed(3), y: +(kf.y + dy / ppu).toFixed(3) } : kf);
                            updateNodeData(cameraNodeId, { keyframes: updated });
                        }}
                        cameraEditMode={cameraEditMode}
                        viewMode={viewMode}
                        ppu={ppu}
                        currentTime={playback.currentTime}
                        isPlaying={playback.isPlaying}
                        selectedNodeId={selectedNodeId}
                        setSelectedNodeId={setSelectedNodeId}
                        setEditFrameIdx={setEditFrameIdx}
                    />

                    {/* Scene Context Panel */}
                    {showSceneContext && <SceneContextPanel onClose={() => setShowSceneContext(false)} />}
                </div>

                {/* Sidebar (when a character is selected) */}
                {selectedNodeId && (
                    <PreviewSidebar
                        selectedNodeId={selectedNodeId}
                        editFrameIdx={editFrameIdx}
                        currentTime={playback.currentTime}
                        onClose={() => setSelectedNodeId(null)}
                    />
                )}
            </div>

            {/* ══════ CAMERA TOOLBAR ══════ */}
            {cameraData && cameraNodeId && (() => {
                const camNode = nodes.find((n) => n.id === cameraNodeId);
                if (!camNode) return null;
                const camData = camNode.data as CameraNodeData;
                const kfs = camData.keyframes || [];

                const addKeyframeAtTime = () => {
                    const newKf: CameraKeyframe = {
                        id: `kf-${Date.now()}`,
                        time: playback.currentTime,
                        x: 9.6, y: 5.4, zoom: 1,
                        easing: 'easeInOut',
                    };
                    if (kfs.length > 0) {
                        const sorted = [...kfs].sort((a, b) => a.time - b.time);
                        const before = sorted.filter(k => k.time <= playback.currentTime).pop();
                        const after = sorted.find(k => k.time > playback.currentTime);
                        if (before && after) {
                            const p = (playback.currentTime - before.time) / (after.time - before.time);
                            newKf.x = +(before.x + (after.x - before.x) * p).toFixed(3);
                            newKf.y = +(before.y + (after.y - before.y) * p).toFixed(3);
                            newKf.zoom = +(before.zoom + (after.zoom - before.zoom) * p).toFixed(2);
                        } else if (before) {
                            newKf.x = before.x; newKf.y = before.y; newKf.zoom = before.zoom;
                        }
                    }
                    const updated = [...kfs, newKf].sort((a, b) => a.time - b.time);
                    updateNodeData(cameraNodeId, { keyframes: updated });
                };

                const removeNearestKf = () => {
                    if (kfs.length <= 1) return;
                    let nearest = kfs[0], minDist = Infinity;
                    for (const kf of kfs) {
                        const d = Math.abs(kf.time - playback.currentTime);
                        if (d < minDist) { minDist = d; nearest = kf; }
                    }
                    updateNodeData(cameraNodeId, { keyframes: kfs.filter(k => k.id !== nearest.id) });
                };

                const getCurrentZoom = () => {
                    if (kfs.length === 0) return 1;
                    const sorted = [...kfs].sort((a, b) => a.time - b.time);
                    if (playback.currentTime <= sorted[0].time) return sorted[0].zoom;
                    if (playback.currentTime >= sorted[sorted.length - 1].time) return sorted[sorted.length - 1].zoom;
                    const before = sorted.filter(k => k.time <= playback.currentTime).pop()!;
                    const after = sorted.find(k => k.time > playback.currentTime)!;
                    const p = (playback.currentTime - before.time) / (after.time - before.time);
                    return before.zoom + (after.zoom - before.zoom) * p;
                };

                const setNearestZoom = (newZoom: number) => {
                    if (kfs.length === 0) return;
                    let nearest = kfs[0], minDist = Infinity;
                    for (const kf of kfs) {
                        const d = Math.abs(kf.time - playback.currentTime);
                        if (d < minDist) { minDist = d; nearest = kf; }
                    }
                    const updated = kfs.map(kf => kf.id === nearest.id ? { ...kf, zoom: Math.max(0.5, Math.min(5, newZoom)) } : kf);
                    updateNodeData(cameraNodeId, { keyframes: updated });
                };

                const moveNearestCamera = (dx: number, dy: number) => {
                    if (kfs.length === 0) return;
                    let nearest = kfs[0], minDist = Infinity;
                    for (const kf of kfs) {
                        const d = Math.abs(kf.time - playback.currentTime);
                        if (d < minDist) { minDist = d; nearest = kf; }
                    }
                    const updated = kfs.map(kf => kf.id === nearest.id ? { ...kf, x: Math.round(kf.x + dx), y: Math.round(kf.y + dy) } : kf);
                    updateNodeData(cameraNodeId, { keyframes: updated });
                };

                const curZoom = getCurrentZoom();

                return (
                    <div className="flex items-center gap-2 px-4 py-1.5 bg-neutral-900/80 border-b border-white/5">
                        <button
                            onClick={() => setCameraEditMode(!cameraEditMode)}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${cameraEditMode
                                ? 'bg-sky-500/30 border border-sky-400/50 text-sky-200 ring-1 ring-sky-400/30'
                                : 'bg-white/5 border border-white/10 text-neutral-400 hover:bg-white/10'
                                }`}
                            title={cameraEditMode ? 'Tắt chỉnh camera để edit nhân vật' : 'Bật chỉnh camera (kéo/scroll)'}
                        >
                            {cameraEditMode ? '🎥 Camera ON' : '👤 Camera OFF'}
                        </button>
                        <div className="h-3 w-px bg-white/10" />
                        {/* View mode toggle: Edit View / Camera View */}
                        <div className="flex rounded-md overflow-hidden border border-white/10">
                            <button
                                onClick={() => setViewMode('edit')}
                                className={`px-2 py-0.5 text-[10px] font-bold transition-all ${viewMode === 'edit'
                                    ? 'bg-amber-500/25 text-amber-300'
                                    : 'bg-white/5 text-neutral-500 hover:bg-white/10 hover:text-neutral-300'
                                    }`}
                                title="Edit View — thấy toàn bộ world, camera là khung overlay"
                            >
                                🔲 Edit
                            </button>
                            <button
                                onClick={() => setViewMode('camera')}
                                className={`px-2 py-0.5 text-[10px] font-bold transition-all ${viewMode === 'camera'
                                    ? 'bg-sky-500/25 text-sky-300'
                                    : 'bg-white/5 text-neutral-500 hover:bg-white/10 hover:text-neutral-300'
                                    }`}
                                title="Camera View — nhìn qua lens camera (giống export)"
                            >
                                📷 Camera
                            </button>
                        </div>
                        <div className="h-3 w-px bg-white/10" />
                        <span className="text-sky-400 text-[10px] font-bold">🎥 {camData.label || 'Camera'}</span>
                        <div className="h-3 w-px bg-white/10" />
                        <button onClick={addKeyframeAtTime} className="px-2 py-0.5 rounded bg-sky-500/15 border border-sky-500/30 text-sky-300 text-[10px] font-bold hover:bg-sky-500/25 transition-all">
                            + Keyframe @ {playback.currentTime.toFixed(1)}s
                        </button>
                        <button onClick={removeNearestKf} disabled={kfs.length <= 1} className="px-2 py-0.5 rounded bg-red-500/10 border border-red-500/20 text-red-300 text-[10px] hover:bg-red-500/20 disabled:opacity-30 transition-all">
                            − Remove
                        </button>
                        <div className="h-3 w-px bg-white/10" />
                        <span className="text-[9px] text-neutral-500">{kfs.length} KFs</span>
                        <div className="h-3 w-px bg-white/10" />
                        <span className="text-[9px] text-neutral-500">🔍</span>
                        <input
                            type="range"
                            min={50}
                            max={500}
                            value={Math.round(curZoom * 100)}
                            onChange={(e) => setNearestZoom(Number(e.target.value) / 100)}
                            className="w-20 h-1 accent-sky-400"
                        />
                        <span className="text-[10px] text-sky-300 font-mono font-bold w-10 text-right">{curZoom.toFixed(1)}×</span>
                        <div className="h-3 w-px bg-white/10" />
                        {kfs.map((kf) => {
                            const isActive = Math.abs(kf.time - playback.currentTime) < 0.3;
                            return (
                                <div key={kf.id} className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded transition-all ${isActive ? 'bg-sky-500/30 ring-1 ring-sky-400/50' : 'bg-white/5 hover:bg-white/10'}`}>
                                    <button
                                        onClick={() => (playback.setCurrentTime as (t: number) => void)(kf.time)}
                                        className={`text-[9px] font-mono font-bold ${isActive ? 'text-sky-200' : 'text-neutral-400 hover:text-white'}`}
                                        title={`(${kf.x},${kf.y}) ${kf.zoom}×`}
                                    >
                                        ◇ {kf.time}s
                                    </button>
                                    {kfs.length > 1 && (
                                        <button
                                            onClick={() => updateNodeData(cameraNodeId, { keyframes: kfs.filter(k => k.id !== kf.id) })}
                                            className="text-red-400/40 hover:text-red-400 text-[8px] ml-0.5"
                                            title="Xóa keyframe"
                                        >✕</button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                );
            })()}
            {/* ══════ MULTI-CAMERA CUTS TIMELINE ══════ */}
            {allCameras.length > 1 && sceneNodeId && (() => {
                const camColors = ['#38bdf8', '#f472b6', '#a78bfa', '#34d399', '#fbbf24', '#fb923c'];
                const addCut = () => {
                    if (!sceneNodeId) return;
                    const sceneNode = nodes.find(n => n.id === sceneNodeId);
                    if (!sceneNode) return;
                    const sceneData = sceneNode.data as import('@/stores/useWorkflowStore').SceneNodeData;
                    const existingCuts = sceneData.cameraCuts || [];
                    // Pick next camera that isn't currently active
                    const currentCam = cameraNodeId;
                    const nextCam = allCameras.find(c => c.id !== currentCam) || allCameras[0];
                    const newCut: import('@/stores/useWorkflowStore').CameraCut = {
                        id: `cut-${Date.now()}`,
                        time: playback.currentTime,
                        cameraNodeId: nextCam.id,
                        transition: 'cut',
                        transitionDuration: 0,
                    };
                    updateNodeData(sceneNodeId, {
                        cameraCuts: [...existingCuts, newCut].sort((a, b) => a.time - b.time),
                    });
                };

                const removeCut = (cutId: string) => {
                    if (!sceneNodeId) return;
                    const sceneNode = nodes.find(n => n.id === sceneNodeId);
                    if (!sceneNode) return;
                    const sceneData = sceneNode.data as import('@/stores/useWorkflowStore').SceneNodeData;
                    updateNodeData(sceneNodeId, {
                        cameraCuts: (sceneData.cameraCuts || []).filter(c => c.id !== cutId),
                    });
                };

                const updateCutCamera = (cutId: string, camId: string) => {
                    if (!sceneNodeId) return;
                    const sceneNode = nodes.find(n => n.id === sceneNodeId);
                    if (!sceneNode) return;
                    const sceneData = sceneNode.data as import('@/stores/useWorkflowStore').SceneNodeData;
                    updateNodeData(sceneNodeId, {
                        cameraCuts: (sceneData.cameraCuts || []).map(c =>
                            c.id === cutId ? { ...c, cameraNodeId: camId } : c
                        ),
                    });
                };

                const updateCutTransition = (cutId: string, transition: 'cut' | 'crossfade' | 'smooth', dur: number) => {
                    if (!sceneNodeId) return;
                    const sceneNode = nodes.find(n => n.id === sceneNodeId);
                    if (!sceneNode) return;
                    const sceneData = sceneNode.data as import('@/stores/useWorkflowStore').SceneNodeData;
                    updateNodeData(sceneNodeId, {
                        cameraCuts: (sceneData.cameraCuts || []).map(c =>
                            c.id === cutId ? { ...c, transition, transitionDuration: dur } : c
                        ),
                    });
                };

                return (
                    <div className="px-4 py-1.5 bg-neutral-900/60 border-b border-white/5">
                        {/* Header */}
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-[9px] text-neutral-400 font-bold uppercase tracking-wider">
                                🎬 Camera Cuts ({cameraCuts.length}) · {allCameras.length} cameras
                            </span>
                            <button
                                onClick={addCut}
                                className="px-2 py-0.5 rounded bg-purple-500/15 border border-purple-500/30 text-purple-300 text-[9px] font-bold hover:bg-purple-500/25 transition-all"
                            >
                                + Cut @ {playback.currentTime.toFixed(1)}s
                            </button>
                        </div>

                        {/* Visual timeline strip */}
                        <div className="relative h-6 rounded bg-neutral-800/50 border border-white/5 overflow-hidden mb-1">
                            {/* Camera segments */}
                            {(() => {
                                const segments: { camId: string; startTime: number; endTime: number }[] = [];
                                if (cameraCuts.length === 0 && allCameras.length > 0) {
                                    segments.push({ camId: allCameras[0].id, startTime: 0, endTime: totalDuration });
                                } else {
                                    // First segment: from 0 to first cut
                                    const firstCam = allCameras[0]?.id || '';
                                    if (cameraCuts.length > 0) {
                                        segments.push({ camId: firstCam, startTime: 0, endTime: cameraCuts[0].time });
                                    }
                                    for (let i = 0; i < cameraCuts.length; i++) {
                                        const end = i + 1 < cameraCuts.length ? cameraCuts[i + 1].time : totalDuration;
                                        segments.push({ camId: cameraCuts[i].cameraNodeId, startTime: cameraCuts[i].time, endTime: end });
                                    }
                                }

                                return segments.map((seg, i) => {
                                    const camIdx = allCameras.findIndex(c => c.id === seg.camId);
                                    const color = camColors[camIdx % camColors.length] || '#666';
                                    const left = (seg.startTime / totalDuration) * 100;
                                    const width = ((seg.endTime - seg.startTime) / totalDuration) * 100;
                                    const cam = allCameras.find(c => c.id === seg.camId);
                                    return (
                                        <div
                                            key={`seg-${i}`}
                                            className="absolute top-0 bottom-0 flex items-center justify-center text-[7px] font-bold text-white/80 overflow-hidden"
                                            style={{
                                                left: `${left}%`, width: `${Math.max(width, 0.5)}%`,
                                                backgroundColor: `${color}33`, borderRight: '1px solid rgba(255,255,255,0.1)',
                                            }}
                                        >
                                            {width > 8 && <span style={{ color }}>{cam?.label || '?'}</span>}
                                        </div>
                                    );
                                });
                            })()}

                            {/* Playhead */}
                            <div
                                className="absolute top-0 bottom-0 w-0.5 bg-white/80 z-10"
                                style={{ left: `${(playback.currentTime / totalDuration) * 100}%` }}
                            />
                        </div>

                        {/* Cut list */}
                        {cameraCuts.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                                {cameraCuts.map((cut, i) => {
                                    const camIdx = allCameras.findIndex(c => c.id === cut.cameraNodeId);
                                    const color = camColors[camIdx % camColors.length] || '#666';
                                    const isActive = playback.currentTime >= cut.time &&
                                        (i + 1 >= cameraCuts.length || playback.currentTime < cameraCuts[i + 1].time);
                                    return (
                                        <div
                                            key={cut.id}
                                            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] border transition-all ${isActive
                                                ? 'ring-1 ring-white/30 bg-white/10'
                                                : 'bg-white/3 hover:bg-white/5'
                                                }`}
                                            style={{ borderColor: `${color}44` }}
                                        >
                                            <span className="font-mono font-bold" style={{ color }}>{cut.time.toFixed(1)}s</span>
                                            <select
                                                value={cut.cameraNodeId}
                                                onChange={(e) => updateCutCamera(cut.id, e.target.value)}
                                                className="bg-transparent text-[8px] text-white/80 outline-none cursor-pointer"
                                            >
                                                {allCameras.map(c => (
                                                    <option key={c.id} value={c.id} className="bg-neutral-800">{c.label}</option>
                                                ))}
                                            </select>
                                            <select
                                                value={cut.transition}
                                                onChange={(e) => updateCutTransition(cut.id, e.target.value as 'cut' | 'crossfade' | 'smooth', cut.transitionDuration)}
                                                className="bg-transparent text-[8px] text-neutral-400 outline-none cursor-pointer"
                                            >
                                                <option value="cut" className="bg-neutral-800">✂️ Cut</option>
                                                <option value="crossfade" className="bg-neutral-800">🔀 Fade</option>
                                                <option value="smooth" className="bg-neutral-800">〰️ Smooth</option>
                                            </select>
                                            <button
                                                onClick={() => removeCut(cut.id)}
                                                className="text-red-400/50 hover:text-red-400 text-[8px]"
                                                title="Xóa cut"
                                            >✕</button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Camera legend */}
                        <div className="flex gap-2 mt-1">
                            {allCameras.map((cam, i) => (
                                <div key={cam.id} className="flex items-center gap-1">
                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: camColors[i % camColors.length] }} />
                                    <span className={`text-[8px] font-bold ${cam.id === cameraNodeId ? 'text-white' : 'text-neutral-500'}`}>
                                        {cam.label}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })()}

            {/* ══════ KEYFRAME TIMELINE ══════ */}
            <KeyframeTimeline
                tracks={tracks}
                totalDuration={totalDuration}
                currentTime={playback.currentTime}
                setCurrentTime={playback.setCurrentTime as (time: number) => void}
                selectedNodeId={selectedNodeId}
                setSelectedNodeId={setSelectedNodeId}
                editFrameIdx={editFrameIdx}
                setEditFrameIdx={setEditFrameIdx}
            />

            {/* ══════ PLAYBACK CONTROLS ══════ */}
            <PlaybackControls
                isPlaying={playback.isPlaying}
                playbackSpeed={playback.playbackSpeed}
                exporting={exporting}
                tracksEmpty={tracks.length === 0}
                showSceneContext={showSceneContext}
                play={playback.play}
                pause={playback.pause}
                stop={playback.stop}
                skipBack={playback.skipBack}
                skipForward={playback.skipForward}
                setPlaybackSpeed={playback.setPlaybackSpeed as (s: number) => void}
                setShowSceneContext={setShowSceneContext}
                exportVideo={exportVideo}
                onClose={onClose}
            />

            {/* ══════ EXPORT OVERLAY ══════ */}
            {exporting && (
                <ExportOverlay
                    exportProgress={exportProgress}
                    exportStatus={exportStatus}
                />
            )}
        </div>
    );
};

export default WorkflowPreview;
