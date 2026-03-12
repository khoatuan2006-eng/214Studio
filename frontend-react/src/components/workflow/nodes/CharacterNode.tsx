import { memo, useRef, useState, useCallback, useEffect } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import type { CharacterNodeData, SceneNodeData } from '@/stores/useWorkflowStore';
import { useWorkflowStore } from '@/stores/useWorkflowStore';
import { useAppStore, STATIC_BASE } from '@/stores/useAppStore';
import LazyImage from '@/components/ui/LazyImage';
import { User, GripVertical, UploadCloud, Loader2, ChevronDown, ChevronRight, Plus, Clock, Move, RotateCw, Maximize2, Sparkles, MessageCircle, Send } from 'lucide-react';
import { API_BASE_URL } from '@/config/api';

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}


type CharacterNodeType = Node<CharacterNodeData, 'character'>;

/** Unified keyframe for the timeline display */
interface DisplayKeyframe {
    time: number;
    x: number;
    y: number;
    z: number;
    scale: number;
    rotation: number;
    flipX?: boolean;
    emotion?: string;
    pose?: string;
    action?: string;
    dialogue?: string;
}

const EMOTION_EMOJI: Record<string, string> = {
    happy: '😊', sad: '😢', angry: '😠', surprised: '😲',
    neutral: '😐', scared: '😨', serious: '🤨', excited: '🤩',
};

function CharacterNodeComponent({ id, data, selected }: NodeProps<CharacterNodeType>) {
    const characters = useAppStore((s) => s.characters);
    const character = characters.find((c) => c.id === data.characterId);
    const nodes = useWorkflowStore((s) => s.nodes);
    const edges = useWorkflowStore((s) => s.edges);
    const updateNodeData = useWorkflowStore((s) => s.updateNodeData);
    const sceneNode = nodes.find(n => n.type === 'scene');
    const ppu = (sceneNode?.data as SceneNodeData)?.pixelsPerUnit || 100;
    const canvasW = (sceneNode?.data as SceneNodeData)?.canvasWidth || 1920;
    const canvasH = (sceneNode?.data as SceneNodeData)?.canvasHeight || 1080;
    const fetchCharacters = useAppStore((s) => s.fetchCharacters);

    // UI states
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState('');
    const [dragOver, setDragOver] = useState(false);
    const [showKeyframes, setShowKeyframes] = useState(true);
    const [showScript, setShowScript] = useState(false);
    const [aiSuggesting, setAiSuggesting] = useState(false);
    const [aiValidation, setAiValidation] = useState<{warnings: any[], hashStats: {ok: number, miss: number}} | null>(null);

    // Chat AI states
    const [showChat, setShowChat] = useState(false);
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [chatInput, setChatInput] = useState('');
    const [chatLoading, setChatLoading] = useState(false);
    const chatScrollRef = useRef<HTMLDivElement>(null);


    // ── Connected nodes info ──
    const stageEdge = edges.find((e: any) => e.targetHandle === 'stage-in' && e.target === id);
    const stageNode = stageEdge ? nodes.find(n => n.id === stageEdge.source) : null;

    const scriptEdge = edges.find((e: any) => e.targetHandle === 'script-in' && e.target === id);
    const scriptSourceNode = scriptEdge ? nodes.find(n => n.id === scriptEdge.source) : null;
    const scriptData = scriptSourceNode?.data as any;

    // Find script character assigned to this node (match by scriptCharacter or by createdNodeIds)
    const scriptCharacter = (data as any).scriptCharacter || (() => {
        if (!scriptData?.analyzedCharacters) return null;
        const charIdx = scriptData.createdNodeIds?.indexOf(id);
        if (charIdx >= 0 && scriptData.analyzedCharacters[charIdx]) {
            return scriptData.analyzedCharacters[charIdx];
        }
        return null;
    })();
    const scriptActions: any[] = (data as any).scriptActions || scriptCharacter?.actions || [];

    // ── Build unified keyframe timeline ──
    const keyframes: DisplayKeyframe[] = (() => {
        const kfs: DisplayKeyframe[] = [];
        const posKFs = data.positionKeyframes || [];
        const scaleKFs = data.scaleKeyframes || [];
        const rotKFs = data.rotationKeyframes || [];
        const zKFs = data.zIndexKeyframes || [];
        const flipKFs = data.flipXKeyframes || [];

        // Collect all unique times
        const times = new Set<number>();
        posKFs.forEach(k => times.add(k.time));
        scaleKFs.forEach(k => times.add(k.time));
        rotKFs.forEach(k => times.add(k.time));
        zKFs.forEach(k => times.add(k.time));
        flipKFs.forEach(k => times.add(k.time));
        scriptActions.forEach((a: any) => times.add(a.start_time));

        if (times.size === 0) {
            // Default keyframe at t=0
            times.add(0);
        }

        const sortedTimes = Array.from(times).sort((a, b) => a - b);

        for (const t of sortedTimes) {
            const pos = posKFs.find(k => k.time === t);
            const sc = scaleKFs.find(k => k.time === t);
            const rot = rotKFs.find(k => k.time === t);
            const z = zKFs.find(k => k.time === t);
            const flip = flipKFs.find(k => k.time === t);
            const sa = scriptActions.find((a: any) => Math.abs(a.start_time - t) < 0.1);

            kfs.push({
                time: t,
                x: pos?.x ?? data.posX,
                y: pos?.y ?? data.posY,
                z: z?.z ?? data.zIndex,
                scale: sc?.scale ?? data.scale,
                rotation: rot?.rotation ?? 0,
                flipX: flip?.flipX,
                emotion: sa?.emotion,
                pose: sa?.pose,
                action: sa?.action,
                dialogue: sa?.dialogue,
            });
        }
        return kfs;
    })();

    // ── Auto-import script actions (timing only — no fake micro-movement) ──
    const handleImportActions = useCallback(() => {
        if (!scriptActions.length) return;
        // Only import timing and script data — let AI Suggest handle positioning
        const firstActionTime = scriptActions[0]?.start_time || 0;
        updateNodeData(id, {
            scriptActions: scriptActions,
            startDelay: firstActionTime,
        });
    }, [id, scriptActions, updateNodeData]);

    // ── AI Suggest: position + poses/faces from real PSD layers ──
    const handleAISuggest = useCallback(async () => {
        if (aiSuggesting) return;
        if (!character) {
            alert('Chưa chọn nhân vật PSD');
            return;
        }
        setAiSuggesting(true);
        try {
            // Build layer catalog: groupName → list of asset names
            const layerCatalog: Record<string, string[]> = {};
            for (const groupName of character.group_order) {
                const assets = character.layer_groups[groupName];
                if (assets?.length) {
                    layerCatalog[groupName] = assets.map((a: any) => a.name);
                }
            }

            // Collect stage semantic data from connected Stage node
            let stageElements: any[] = [];
            let stageImageBase64: string | null = null;
            if (stageNode) {
                const layers = (stageNode.data as any).layers || [];
                stageElements = layers
                    .filter((l: any) => l.semanticInfo)
                    .map((l: any) => ({
                        name_vi: l.label || l.semanticInfo?.nameVi || 'unknown',
                        category: l.semanticInfo?.category || 'other',
                        can_stand_on: l.semanticInfo?.canStandOn || false,
                        can_sit_on: l.semanticInfo?.canSitOn || false,
                        suggested_z: l.zIndex || 0,
                        bbox_x: l.semanticInfo?.bboxX ?? 0,
                        bbox_y: l.semanticInfo?.bboxY ?? 0,
                        bbox_w: l.semanticInfo?.bboxW ?? 100,
                        bbox_h: l.semanticInfo?.bboxH ?? 100,
                    }));

                // ── Composite stage layers into image for Vision AI ──
                // Must match renderScene.ts rendering: layers drawn CENTERED at (posX, posY)
                const visibleLayers = layers
                    .filter((l: any) => l.visible !== false && l.assetPath)
                    .sort((a: any, b: any) => (a.zIndex || 0) - (b.zIndex || 0));

                if (visibleLayers.length > 0) {
                    try {
                        const canvas = document.createElement('canvas');
                        canvas.width = canvasW;
                        canvas.height = canvasH;
                        const ctx = canvas.getContext('2d')!;
                        ctx.fillStyle = '#111118';
                        ctx.fillRect(0, 0, canvasW, canvasH);

                        // Draw each layer matching renderScene.ts logic
                        for (const layer of visibleLayers) {
                            try {
                                const img = new Image();
                                img.crossOrigin = 'anonymous';
                                await new Promise<void>((resolve, reject) => {
                                    img.onload = () => resolve();
                                    img.onerror = () => reject(new Error('load failed'));
                                    img.src = `${STATIC_BASE}/${layer.assetPath}`;
                                });

                                ctx.save();
                                ctx.globalAlpha = layer.opacity ?? 1;
                                if (layer.blur > 0) ctx.filter = `blur(${layer.blur}px)`;

                                // renderScene.ts draws overlays CENTERED at (posX, posY)
                                ctx.translate(layer.posX || 0, layer.posY || 0);
                                if (layer.rotation) {
                                    ctx.rotate((layer.rotation * Math.PI) / 180);
                                }
                                const drawW = layer.width || canvasW;
                                const drawH = layer.height || canvasH;
                                ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);

                                ctx.restore();
                            } catch {
                                // Skip failed layers
                            }
                        }
                        stageImageBase64 = canvas.toDataURL('image/png');
                    } catch (e) {
                        console.warn('Could not composite stage image:', e);
                    }
                }
            }

            // Collect other character positions
            const otherChars = nodes
                .filter(n => n.type === 'character' && n.id !== id)
                .map(n => ({
                    name: (n.data as any).characterName || (n.data as any).label || '?',
                    x: (n.data as any).posX || 960,
                    y: (n.data as any).posY || 540,
                }));

            // Compute ground_y from canStandOn elements (top of their bbox in pixels)
            let groundY: number | null = null;
            const standableEls = stageElements.filter((el: any) => el.can_stand_on);
            if (standableEls.length > 0) {
                const candidates = standableEls.map((el: any) => (el.bbox_y / 100) * canvasH);
                groundY = Math.max(Math.min(...candidates), canvasH * 0.4);
            }

            const resp = await fetch(`${API_BASE_URL}/api/ai/analyze-character`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    character_name: scriptCharacter?.name || data.characterName || data.label,
                    layer_catalog: layerCatalog,
                    stage_elements: stageElements,
                    script_actions: scriptActions,
                    canvas_width: canvasW,
                    canvas_height: canvasH,
                    other_characters: otherChars,
                    stage_image_base64: stageImageBase64,
                    ground_y: groundY,
                }),
            });
            if (!resp.ok) {
                const err = await resp.json().catch(() => ({ detail: 'Lỗi server' }));
                throw new Error(err.detail || `HTTP ${resp.status}`);
            }
            const result = await resp.json();

            // Apply position
            const pos = result.suggested_position || {};
            const updates: any = {
                posX: pos.x ?? data.posX,
                posY: pos.y ?? data.posY,
                zIndex: pos.z ?? data.zIndex,
                scale: pos.scale ?? data.scale,
                flipX: result.flip_x ?? data.flipX,
                aiPositionReason: result.position_reason || '',
            };

            // Convert AI pose_frames (name-based) → real PoseFrame[] (hash-based)
            // Track hash mapping stats for validation feedback
            let hashOk = 0;
            let hashMiss = 0;

            if (result.pose_frames?.length) {
                const sequence = result.pose_frames.map((frame: any) => {
                    // Map asset names → hashes
                    const layers: Record<string, string> = {};
                    for (const [groupName, assetName] of Object.entries(frame.layers || {})) {
                        const group = character.layer_groups[groupName];
                        if (group) {
                            const asset = group.find((a: any) => a.name === assetName);
                            if (asset?.hash) {
                                layers[groupName] = asset.hash;
                                hashOk++;
                            } else {
                                hashMiss++;
                            }
                        } else {
                            hashMiss++;
                        }
                    }

                    return {
                        id: `frame-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                        duration: frame.duration || 1.0,
                        layers,
                        transition: frame.transition || 'cut',
                        transitionDuration: frame.transition === 'crossfade' ? 0.3 : 0,
                        description: frame.description || '',
                    };
                });

                updates.sequence = sequence;
            }

            // Store validation feedback
            setAiValidation({
                warnings: result.validation_warnings || [],
                hashStats: { ok: hashOk, miss: hashMiss },
            });

            // Apply AI keyframes — 5 independent animation tracks
            // 1. Position keyframes (movement)
            if (result.position_keyframes?.length) {
                updates.positionKeyframes = result.position_keyframes.map((kf: any) => ({
                    time: kf.time,
                    x: kf.x,
                    y: kf.y,
                }));
            }

            // 2. Scale keyframes (size changes)
            if (result.scale_keyframes?.length) {
                updates.scaleKeyframes = result.scale_keyframes.map((kf: any) => ({
                    time: kf.time,
                    scale: kf.scale,
                }));
            }

            // 3. Rotation keyframes (tilt/spin)
            if (result.rotation_keyframes?.length) {
                updates.rotationKeyframes = result.rotation_keyframes.map((kf: any) => ({
                    time: kf.time,
                    rotation: kf.rotation,
                }));
            }

            // 4. Z-Index keyframes (depth ordering)
            if (result.z_index_keyframes?.length) {
                updates.zIndexKeyframes = result.z_index_keyframes.map((kf: any) => ({
                    time: kf.time,
                    z: kf.z,
                }));
            }

            // 5. FlipX keyframes (horizontal flip)
            if (result.flip_x_keyframes?.length) {
                updates.flipXKeyframes = result.flip_x_keyframes.map((kf: any) => ({
                    time: kf.time,
                    flipX: kf.flipX,
                }));
            }

            // Set startDelay based on first script action timing
            if (scriptActions.length > 0) {
                updates.startDelay = scriptActions[0]?.start_time || 0;
            }

            updateNodeData(id, updates);
        } catch (err: any) {
            console.error('AI Suggest failed:', err);
            setAiValidation(null);
            alert(err?.message || 'AI Suggest thất bại');
        } finally {
            setAiSuggesting(false);
        }
    }, [id, data, aiSuggesting, character, stageNode, nodes, edges, scriptCharacter, scriptActions, canvasW, canvasH, updateNodeData]);

    // ── Chat AI ──
    const handleChatSend = useCallback(async () => {
        if (!chatInput.trim() || chatLoading) return;
        const userMsg = chatInput.trim();
        setChatInput('');
        setChatMessages(prev => [...prev, { role: 'user', content: userMsg }]);
        setChatLoading(true);

        try {
            // Build layer catalog: { groupName: [assetName1, assetName2, ...] }
            const layerCatalog: Record<string, string[]> = {};
            if (character?.layer_groups) {
                for (const [groupName, assets] of Object.entries(character.layer_groups)) {
                    layerCatalog[groupName] = (assets as any[]).map((a: any) => a.name);
                }
            }

            // Build current state
            const currentState = {
                posX: data.posX,
                posY: data.posY,
                zIndex: data.zIndex,
                scale: data.scale,
                opacity: data.opacity,
                flipX: data.flipX,
                startDelay: data.startDelay,
                positionKeyframes: data.positionKeyframes,
                scaleKeyframes: data.scaleKeyframes,
                rotationKeyframes: data.rotationKeyframes,
                flipXKeyframes: data.flipXKeyframes,
                zIndexKeyframes: (data as any).zIndexKeyframes,
                sequence: data.sequence?.map(f => ({
                    id: f.id,
                    duration: f.duration,
                    description: f.description || '',
                    layers: f.layers,
                    transition: f.transition,
                })),
                scriptActions,
            };

            const resp = await fetch(`${API_BASE_URL}/api/ai/character-chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: userMsg,
                    character_name: character?.name || data.label || 'Character',
                    current_state: currentState,
                    layer_catalog: layerCatalog,
                    chat_history: chatMessages.slice(-10),
                    canvas_width: canvasW,
                    canvas_height: canvasH,
                }),
            });

            if (!resp.ok) {
                const err = await resp.json().catch(() => ({ detail: 'Server error' }));
                throw new Error(err.detail || `HTTP ${resp.status}`);
            }
            const result = await resp.json();
            const aiMsg = result.ai_message || 'Đã xử lý.';
            setChatMessages(prev => [...prev, { role: 'assistant', content: aiMsg }]);

            // Apply updates if any
            const updates = result.updates || {};
            if (Object.keys(updates).length > 0) {
                const nodeUpdates: any = {};

                // Position 
                if (updates.suggested_position) {
                    const pos = updates.suggested_position;
                    if (pos.x !== undefined) nodeUpdates.posX = pos.x;
                    if (pos.y !== undefined) nodeUpdates.posY = pos.y;
                    if (pos.z !== undefined) nodeUpdates.zIndex = pos.z;
                    if (pos.scale !== undefined) nodeUpdates.scale = pos.scale;
                }
                if (updates.flip_x !== undefined) nodeUpdates.flipX = updates.flip_x;

                // Pose frames → convert names to hashes
                if (updates.pose_frames?.length && character) {
                    const sequence = updates.pose_frames.map((frame: any) => {
                        const layers: Record<string, string> = {};
                        for (const [groupName, assetName] of Object.entries(frame.layers || {})) {
                            const group = character.layer_groups[groupName];
                            if (group) {
                                const asset = (group as any[]).find((a: any) => a.name === assetName);
                                if (asset?.hash) layers[groupName] = asset.hash;
                            }
                        }
                        return {
                            id: `frame-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                            duration: frame.duration || 1.0,
                            layers,
                            transition: frame.transition || 'cut',
                            transitionDuration: frame.transition === 'crossfade' ? 0.3 : 0,
                            description: frame.description || '',
                        };
                    });
                    nodeUpdates.sequence = sequence;
                }

                // 5 keyframe tracks
                if (updates.position_keyframes?.length)
                    nodeUpdates.positionKeyframes = updates.position_keyframes;
                if (updates.scale_keyframes?.length)
                    nodeUpdates.scaleKeyframes = updates.scale_keyframes;
                if (updates.rotation_keyframes?.length)
                    nodeUpdates.rotationKeyframes = updates.rotation_keyframes;
                if (updates.z_index_keyframes?.length)
                    nodeUpdates.zIndexKeyframes = updates.z_index_keyframes;
                if (updates.flip_x_keyframes?.length)
                    nodeUpdates.flipXKeyframes = updates.flip_x_keyframes;

                if (Object.keys(nodeUpdates).length > 0) {
                    updateNodeData(id, nodeUpdates);
                }
            }
        } catch (err: any) {
            setChatMessages(prev => [...prev, { role: 'assistant', content: `❌ ${err?.message || 'Lỗi'}` }]);
        } finally {
            setChatLoading(false);
        }
    }, [chatInput, chatLoading, chatMessages, character, data, scriptActions, canvasW, canvasH, id, updateNodeData]);

    // Auto-scroll chat to bottom
    useEffect(() => {
        if (chatScrollRef.current) {
            chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
        }
    }, [chatMessages]);

    // ── Upload PSD ──
    const handleUploadPSD = useCallback(async (file: File) => {
        if (!file.name.toLowerCase().endsWith('.psd')) {
            alert('Chỉ hỗ trợ file .psd');
            return;
        }
        setUploading(true);
        setUploadProgress(`Đang tải ${file.name}...`);
        try {
            const formData = new FormData();
            formData.append('file', file);
            const resp = await fetch(`${API_BASE_URL}/api/upload-psd/`, {
                method: 'POST',
                body: formData,
            });
            if (!resp.ok) throw new Error('Upload failed');
            const result = await resp.json();
            setUploadProgress('Đang xử lý...');
            await fetchCharacters();
            const charId = result?.character_id || result?.id;
            if (charId) {
                updateNodeData(id, { characterId: charId, characterName: result?.name || file.name.replace('.psd', '') });
            }
        } catch (err: any) {
            alert(err?.message || 'Upload thất bại');
        } finally {
            setUploading(false);
            setUploadProgress('');
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    }, [id, fetchCharacters, updateNodeData]);

    // ── Thumbnail ──
    let thumbUrl = '';
    if (character) {
        const firstGroup = Object.values(character.layer_groups)[0];
        if (firstGroup?.[0]?.hash) {
            thumbUrl = `${API_BASE_URL}/thumbnails/${firstGroup[0].hash}_thumb.png`;
        } else if (firstGroup?.[0]?.path) {
            thumbUrl = `${STATIC_BASE}/${firstGroup[0].path}`;
        }
    }

    // ── Stage background URL ──
    let stageBgUrl = '';
    if (stageNode) {
        const layers = (stageNode.data as any).layers || [];
        const bgLayer = layers.find((l: any) => l.type === 'background') || layers[0];
        if (bgLayer?.imageUrl) stageBgUrl = bgLayer.imageUrl;
    }

    return (
        <div
            className={`rounded-xl overflow-hidden shadow-xl transition-all duration-200 min-w-[260px] max-w-[300px] ${selected
                ? 'ring-2 ring-indigo-400 shadow-indigo-500/30'
                : 'ring-1 ring-white/10 hover:ring-white/20'
                }`}
            style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)' }}
        >
            {/* ── Input Handles ── */}
            <Handle type="target" position={Position.Left} id="stage-in"
                style={{ top: '30%' }}
                className="!w-3 !h-3 !bg-amber-500 !border-2 !border-amber-300 !shadow-lg !shadow-amber-500/50"
            />
            <Handle type="target" position={Position.Left} id="script-in"
                style={{ top: '50%' }}
                className="!w-3 !h-3 !bg-emerald-500 !border-2 !border-emerald-300 !shadow-lg !shadow-emerald-500/50 !rounded-sm !rotate-45"
            />

            {/* Handle labels */}
            <div className="absolute left-5 text-[6px] font-bold text-amber-400" style={{ top: 'calc(30% - 4px)' }}>🎬</div>
            <div className="absolute left-5 text-[6px] font-bold text-emerald-400" style={{ top: 'calc(50% - 4px)' }}>📝</div>

            {/* ── Header ── */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10"
                style={{ background: 'linear-gradient(90deg, rgba(99,102,241,0.3), rgba(139,92,246,0.2))' }}
            >
                <GripVertical className="w-3 h-3 text-white/30 cursor-grab" />
                <User className="w-4 h-4 text-indigo-300" />
                <span className="text-xs font-bold text-white/90 truncate flex-1">
                    {scriptCharacter?.name || data.characterName || data.label}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/30 text-indigo-200 font-mono">
                    Z:{data.zIndex}
                </span>
            </div>

            {/* ── Context: Stage + Script ── */}
            <div className="border-b border-white/5">
                {/* Stage connection */}
                <div className="px-3 py-1 flex items-center gap-1.5">
                    <span className="text-[8px]">🎬</span>
                    {stageNode ? (
                        <span className="text-[8px] text-amber-300 truncate">{(stageNode.data as any).label}</span>
                    ) : (
                        <span className="text-[8px] text-neutral-600">← Stage</span>
                    )}
                </div>
                {/* Script connection */}
                <div className="px-3 py-1 flex items-center gap-1.5">
                    <span className="text-[8px]">📝</span>
                    {scriptCharacter ? (
                        <span className="text-[8px] text-emerald-300 truncate">
                            {scriptCharacter.role} • {scriptActions.length} actions
                            {scriptCharacter.gender && ` • ${scriptCharacter.gender === 'male' ? '🧑' : '👩'}`}
                        </span>
                    ) : (
                        <span className="text-[8px] text-neutral-600">← Script Analyzer</span>
                    )}
                </div>
            </div>

            {/* ── Character Preview with Stage BG ── */}
            <div className="p-2">
                {character ? (
                    <div className="flex gap-2">
                        {/* Mini preview: character on stage background */}
                        <div className="w-16 h-16 rounded-lg overflow-hidden bg-black/30 flex items-center justify-center flex-shrink-0 border border-white/5 relative">
                            {stageBgUrl && (
                                <img src={stageBgUrl.startsWith('http') ? stageBgUrl : `${API_BASE_URL}${stageBgUrl}`}
                                    className="absolute inset-0 w-full h-full object-cover opacity-40" alt="" />
                            )}
                            {thumbUrl ? (
                                <LazyImage src={thumbUrl} className="w-full h-full object-contain relative z-10" alt={character.name} />
                            ) : (
                                <User className="w-6 h-6 text-neutral-500 relative z-10" />
                            )}
                        </div>
                        {/* Character info */}
                        <div className="flex-1 min-w-0 space-y-0.5">
                            <div className="text-[10px] font-bold text-white truncate">{character.name.split('_')[0]}</div>
                            <div className="text-[8px] text-neutral-500">
                                {Object.keys(character.layer_groups).length} groups • {
                                    Object.values(character.layer_groups).reduce((sum: number, g: any[]) => sum + g.length, 0)
                                } layers
                            </div>
                            <div className="flex gap-2 text-[7px] text-neutral-400">
                                <span>📍 {(data.posX / ppu).toFixed(1)},{(data.posY / ppu).toFixed(1)}</span>
                                <span>📏 {(data.scale / ppu).toFixed(1)}</span>
                            </div>
                            <div className="text-[7px] text-neutral-500">
                                Canvas: {canvasW}×{canvasH}px
                            </div>
                            {scriptCharacter?.emotion && (
                                <div className="text-[8px]">
                                    {EMOTION_EMOJI[scriptCharacter.emotion] || '😐'} {scriptCharacter.emotion}
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    /* Upload PSD zone */
                    <div
                        className={`py-3 border rounded-lg text-center cursor-pointer transition-all ${dragOver
                            ? 'border-indigo-400 bg-indigo-500/10 border-solid'
                            : 'border-dashed border-neutral-700 hover:border-neutral-500'
                            }`}
                        onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
                        onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(false); }}
                        onDrop={(e) => {
                            e.preventDefault(); e.stopPropagation(); setDragOver(false);
                            if (e.dataTransfer.files?.[0]) handleUploadPSD(e.dataTransfer.files[0]);
                        }}
                    >
                        <input type="file" ref={fileInputRef}
                            onChange={(e) => { if (e.target.files?.[0]) handleUploadPSD(e.target.files[0]); }}
                            accept=".psd" className="hidden"
                        />
                        {uploading ? (
                            <div className="flex flex-col items-center gap-1">
                                <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
                                <span className="text-[9px] text-indigo-300">{uploadProgress}</span>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-1">
                                <UploadCloud className="w-5 h-5 text-neutral-500" />
                                <span className="text-[9px] text-neutral-500">
                                    {dragOver ? 'Thả file PSD' : 'Kéo thả PSD hoặc click'}
                                </span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* 🤖 AI Suggest */}
            <div className="px-2 py-1 space-y-1.5">
                <button
                    onClick={(e) => { e.stopPropagation(); handleAISuggest(); }}
                    disabled={aiSuggesting}
                    className={`w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${aiSuggesting
                        ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300 animate-pulse cursor-wait'
                        : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20 hover:border-emerald-400/50 hover:shadow-lg hover:shadow-emerald-500/10'
                        }`}
                >
                    <Sparkles className="w-3 h-3" />
                    {aiSuggesting ? 'AI đang gợi ý...' : '🤖 AI Suggest Position & Poses'}
                </button>
                {/* AI Position Reason */}
                {(data as any).aiPositionReason && (
                    <div className="rounded bg-emerald-500/10 border border-emerald-500/20 px-2 py-1">
                        <p className="text-[8px] text-emerald-300 leading-relaxed">
                            📍 {(data as any).aiPositionReason}
                        </p>
                    </div>
                )}
                {/* AI Validation Feedback */}
                {aiValidation && (
                    <div className="rounded bg-neutral-800/50 border border-white/5 px-2 py-1 space-y-0.5">
                        <div className="flex items-center gap-1.5 text-[8px]">
                            {aiValidation.hashStats.ok > 0 && (
                                <span className="text-emerald-400">✅ {aiValidation.hashStats.ok} matched</span>
                            )}
                            {aiValidation.hashStats.miss > 0 && (
                                <span className="text-red-400">❌ {aiValidation.hashStats.miss} missed</span>
                            )}
                            {aiValidation.warnings.filter(w => w.type === 'fuzzy').length > 0 && (
                                <span className="text-amber-400">
                                    ⚠️ {aiValidation.warnings.filter(w => w.type === 'fuzzy').length} fuzzy
                                </span>
                            )}
                            {aiValidation.warnings.filter(w => w.field === 'position').length > 0 && (
                                <span className="text-orange-400">
                                    📍 {aiValidation.warnings.filter(w => w.field === 'position').length} pos warn
                                </span>
                            )}
                        </div>
                        {/* Show warning details (non-OK items only) */}
                        {aiValidation.warnings.filter(w => w.type !== 'ok').length > 0 && (
                            <div className="max-h-[60px] overflow-y-auto space-y-0.5">
                                {aiValidation.warnings
                                    .filter(w => w.type !== 'ok')
                                    .map((w, i) => (
                                        <div key={i} className={`text-[7px] px-1 py-0.5 rounded ${
                                            w.type === 'error' ? 'text-red-300 bg-red-500/10' :
                                            w.type === 'fuzzy' ? 'text-amber-300 bg-amber-500/10' :
                                            'text-orange-300 bg-orange-500/10'
                                        }`}>
                                            {w.type === 'error' ? '❌' : w.type === 'fuzzy' ? '⚠️' : '📍'} {w.message}
                                        </div>
                                    ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ── Keyframe Timeline ── */}
            <div className="px-2 pb-1">
                <button
                    onClick={(e) => { e.stopPropagation(); setShowKeyframes(!showKeyframes); }}
                    className="w-full flex items-center gap-1 px-1 py-1 text-[9px] font-bold text-neutral-400 hover:text-white transition-colors"
                >
                    {showKeyframes ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    <Clock className="w-3 h-3" />
                    Keyframes ({keyframes.length})
                    {scriptActions.length > 0 && !data.positionKeyframes?.length && (
                        <button
                            onClick={(e) => { e.stopPropagation(); handleImportActions(); }}
                            className="ml-auto text-[7px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30"
                        >
                            Import AI
                        </button>
                    )}
                </button>

                {showKeyframes && (
                    <div className="space-y-0.5 max-h-[120px] overflow-y-auto pr-1">
                        {keyframes.map((kf, i) => (
                            <div key={i}
                                className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/20 border border-white/3 text-[7px] hover:bg-black/30 transition-colors"
                            >
                                {/* Time */}
                                <span className="text-indigo-400 font-mono w-8 flex-shrink-0">
                                    {kf.time.toFixed(1)}s
                                </span>
                                {/* Position */}
                                <span className="text-neutral-400 flex-shrink-0" title="Position X,Y">
                                    <Move className="w-2 h-2 inline" /> {(kf.x / ppu).toFixed(1)},{(kf.y / ppu).toFixed(1)}
                                </span>
                                {/* Scale */}
                                <span className="text-neutral-500 flex-shrink-0" title="Scale">
                                    <Maximize2 className="w-2 h-2 inline" /> {(kf.scale / ppu).toFixed(1)}
                                </span>
                                {/* Rotation */}
                                {kf.rotation !== 0 && (
                                    <span className="text-neutral-500 flex-shrink-0" title="Rotation">
                                        <RotateCw className="w-2 h-2 inline" /> {kf.rotation}°
                                    </span>
                                )}
                                {/* FlipX */}
                                {kf.flipX !== undefined && (
                                    <span className={`flex-shrink-0 font-bold ${kf.flipX ? 'text-violet-400' : 'text-neutral-600'}`} title="Flip X">
                                        ↔{kf.flipX ? '✓' : '✗'}
                                    </span>
                                )}
                                {/* Z */}
                                <span className="text-neutral-600 flex-shrink-0" title="Z-index">
                                    Z{kf.z}
                                </span>
                                {/* Emotion from script */}
                                {kf.emotion && (
                                    <span className="ml-auto flex-shrink-0">
                                        {EMOTION_EMOJI[kf.emotion] || '😐'}
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ── Script Actions (expandable) ── */}
            {scriptActions.length > 0 && (
                <div className="px-2 pb-1">
                    <button
                        onClick={(e) => { e.stopPropagation(); setShowScript(!showScript); }}
                        className="w-full flex items-center gap-1 px-1 py-1 text-[9px] font-bold text-neutral-400 hover:text-white transition-colors"
                    >
                        {showScript ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        📝 Kịch bản ({scriptActions.length})
                    </button>
                    {showScript && (
                        <div className="space-y-0.5 max-h-[80px] overflow-y-auto pr-1">
                            {scriptActions.map((act: any, i: number) => (
                                <div key={i} className="px-1.5 py-0.5 rounded bg-black/20 border border-white/3 text-[7px]">
                                    <div className="flex items-center gap-1">
                                        <span className="text-emerald-400 font-mono w-8">{act.start_time?.toFixed(1)}s</span>
                                        <span>{EMOTION_EMOJI[act.emotion] || '😐'}</span>
                                        <span className="text-neutral-400 truncate flex-1">{act.action}</span>
                                    </div>
                                    {act.dialogue && (
                                        <div className="text-neutral-500 truncate pl-9 italic">"{act.dialogue}"</div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ── Pose Sequence ── */}
            <div className="px-2 pb-2">
                <div className="flex items-center justify-between mb-1">
                    <span className="text-[8px] font-bold text-neutral-500 uppercase tracking-wider">
                        Poses
                    </span>
                    <span className="text-[8px] text-neutral-600">{data.sequence.length}f</span>
                </div>
                <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-thin">
                    {data.sequence.length > 0 ? (
                        data.sequence.map((frame, i) => (
                            <div key={frame.id}
                                className="w-8 h-8 rounded bg-black/40 border border-white/5 flex items-center justify-center flex-shrink-0 text-[8px] text-neutral-400 font-mono"
                                title={`Frame ${i + 1}: ${frame.duration}s`}
                            >F{i + 1}</div>
                        ))
                    ) : (
                        <div className="w-full flex items-center justify-center gap-1 py-1.5 text-[8px] text-neutral-600 border border-dashed border-neutral-800 rounded">
                            <Plus className="w-2.5 h-2.5" /> Double-click
                        </div>
                    )}
                </div>
            </div>

            {/* ── Chat AI Toggle ── */}
            <div className="px-2 pb-1">
                <button
                    onClick={(e) => { e.stopPropagation(); setShowChat(!showChat); }}
                    className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[9px] font-bold transition-all ${
                        showChat
                            ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                            : 'bg-black/20 text-neutral-400 hover:text-white hover:bg-black/30 border border-white/5'
                    }`}
                >
                    <MessageCircle className="w-3 h-3" />
                    💬 Chat AI {chatMessages.length > 0 && `(${chatMessages.length})`}
                </button>
            </div>

            {/* ── Chat Panel ── */}
            {showChat && (
                <div className="px-2 pb-2">
                    <div
                        ref={chatScrollRef}
                        className="space-y-1 max-h-[150px] overflow-y-auto mb-1.5 scrollbar-thin"
                    >
                        {chatMessages.length === 0 && (
                            <div className="text-[8px] text-neutral-600 text-center py-3 italic">
                                Hỏi AI để chỉnh sửa nhân vật...
                            </div>
                        )}
                        {chatMessages.map((msg, i) => (
                            <div
                                key={i}
                                className={`px-2 py-1 rounded-lg text-[8px] leading-relaxed ${
                                    msg.role === 'user'
                                        ? 'bg-indigo-500/20 text-indigo-200 ml-4 border border-indigo-500/20'
                                        : 'bg-emerald-500/10 text-emerald-200 mr-4 border border-emerald-500/15'
                                }`}
                            >
                                <span className="font-bold text-[7px] opacity-60">
                                    {msg.role === 'user' ? '👤 ' : '🤖 '}
                                </span>
                                {msg.content}
                            </div>
                        ))}
                        {chatLoading && (
                            <div className="flex items-center gap-1 px-2 py-1 text-[8px] text-violet-300">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                Đang suy nghĩ...
                            </div>
                        )}
                    </div>
                    <div className="flex gap-1">
                        <input
                            type="text"
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); handleChatSend(); } }}
                            onClick={(e) => e.stopPropagation()}
                            placeholder="VD: Đổi mặt giận dữ..."
                            className="flex-1 px-2 py-1 rounded-md bg-black/30 border border-white/10 text-[9px] text-white placeholder-neutral-600 focus:outline-none focus:border-violet-500/50"
                        />
                        <button
                            onClick={(e) => { e.stopPropagation(); handleChatSend(); }}
                            disabled={chatLoading || !chatInput.trim()}
                            className="px-2 py-1 rounded-md bg-violet-500/30 hover:bg-violet-500/50 text-violet-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                            <Send className="w-3 h-3" />
                        </button>
                    </div>
                </div>
            )}

            {/* ── Output Handle ── */}
            <Handle type="source" position={Position.Right}
                className="!w-3 !h-3 !bg-indigo-500 !border-2 !border-indigo-300 !shadow-lg !shadow-indigo-500/50"
            />
        </div>
    );
}

export const CharacterNode = memo(CharacterNodeComponent);
