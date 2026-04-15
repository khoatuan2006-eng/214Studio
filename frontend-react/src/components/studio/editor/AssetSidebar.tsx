import React, { useRef, useState, useEffect } from 'react';
import { UploadCloud, Palette, Layers, User, Loader2, Film } from 'lucide-react';
import { useAppStore, STATIC_BASE } from '@/stores/useAppStore';
import { useCharacterV2Store } from '@/stores/useCharacterV2Store';
import { API_BASE_URL } from '@/config/api';
import { useStudioStore } from '@/stores/useStudioStore';
import type { StudioLayer } from '@/stores/useStudioStore';
import { useSceneGraphStore } from '@/stores/useSceneGraphStore';
import type { CharacterNodeData } from '@/core/scene-graph/types';

const AssetSidebar: React.FC = () => {
    const [sidebarTab, setSidebarTab] = useState<'psd' | 'fla' | 'scene'>('scene');

    // PSD Store
    const psdCharacters = useAppStore(s => s.characters);
    const fetchPsdCharacters = useAppStore(s => s.fetchCharacters);

    // FLA Store
    const flaCharacters = useCharacterV2Store(s => s.characters);
    const fetchFlaCharacters = useCharacterV2Store(s => s.fetchCharacters);
    
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Initial fetch
    useEffect(() => {
        fetchPsdCharacters();
        fetchFlaCharacters();
    }, [fetchPsdCharacters, fetchFlaCharacters]);

    const handleUploadPSD = async (file: File) => {
        if (!file.name.toLowerCase().endsWith('.psd')) {
            alert('Chỉ hỗ trợ file .psd');
            return;
        }
        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            const resp = await fetch(`${API_BASE_URL}/api/upload-psd/`, {
                method: 'POST',
                body: formData,
            });
            if (!resp.ok) throw new Error('Upload failed');
            await fetchPsdCharacters();
        } catch (err: any) {
            alert(err?.message || 'Upload thất bại');
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleUploadFLA = async (file: File) => {
        if (!file.name.toLowerCase().endsWith('.fla') && !file.name.toLowerCase().endsWith('.zip')) {
            alert('Chỉ hỗ trợ file .fla hoặc .zip');
            return;
        }
        setUploading(true);
        try {
            // Dynamic import — chỉ tải module FLA khi cần, tránh crash lúc load app
            const { parseFLAToStageLayers } = await import('@/lib/fla/fla-integration');
            const layers = await parseFLAToStageLayers(file, (progress) => {
                console.log(`FLA Parsing: ${progress.phase} ${progress.current}/${progress.total}`);
            });
            
            // Chuyển đổi StageLayer[] (FLA) thành StudioLayer[] (Remotion/Timeline)
            const studioLayers: StudioLayer[] = layers.map((l: any) => {
                let cx = 0;
                let cy = 0;
                let cw = l.width || 1920;
                let ch = l.height || 1080;
                
                if (l.bbox && l.bbox.length === 4) {
                    cx = l.bbox[0];
                    cy = l.bbox[1];
                    cw = l.bbox[2];
                    ch = l.bbox[3];
                }

                return {
                    id: l.id,
                    name: l.label || 'FLA Layer',
                    type: 'image',
                    sourceUrl: l.assetPath.startsWith('http') ? l.assetPath : `${STATIC_BASE}/${l.assetPath}`,
                    x: cx,
                    y: cy,
                    width: cw,
                    height: ch,
                    origWidth: cw,
                    origHeight: ch,
                    cropX: cx,
                    cropY: cy,
                    rotation: l.rotation || 0,
                    opacity: l.opacity || 1,
                    zIndex: l.zIndex || 0,
                    startFrame: 0,
                    durationInFrames: 300
                };
            });

            useStudioStore.getState().addMultipleLayers(studioLayers);
            
            alert(`Đã trích xuất thành công ${layers.length} phần tử từ FLA và ném thẳng lên Sân khấu (Remotion)!`);
            await fetchFlaCharacters();
        } catch (err: any) {
            console.error(err);
            alert(err?.message || 'Lỗi bóc tách FLA');
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleAddAssetToStage = (char: any) => {
        const newLayers: StudioLayer[] = [];
        const order = char.group_order || Object.keys(char.layer_groups || {});
        let zIndexOffset = useStudioStore.getState().layers.length;

        order.forEach((groupName: string, i: number) => {
            const groupParts = char.layer_groups?.[groupName];
            if (groupParts && groupParts.length > 0) {
                const part = groupParts[0]; 
                const layerWidth = char.canvas_size?.[0] || 1920;
                const layerHeight = char.canvas_size?.[1] || 1080;
                
                let cx = (1920 - layerWidth) / 2;
                let cy = (1080 - layerHeight) / 2;
                let cw = layerWidth;
                let ch = layerHeight;
                
                if (part.bbox && part.bbox.length === 4) {
                    cx = part.bbox[0];
                    cy = part.bbox[1];
                    cw = part.bbox[2];
                    ch = part.bbox[3];
                }
                
                let sourceUrl = part.path;
                if (!sourceUrl.startsWith('http')) {
                    if (sourceUrl.startsWith('assets/')) {
                        // Bypass AdBlock for assets/ folder by using the root-mounted s_assets alias
                        sourceUrl = `${API_BASE_URL}/${sourceUrl.replace('assets/', 's_assets/')}`;
                    } else {
                        // Legacy paths like extracted_psds/ must use the /static/ router
                        sourceUrl = `${STATIC_BASE}/${sourceUrl}`;
                    }
                }

                newLayers.push({
                    id: `asset-${char.id}-${part.hash}-${Date.now()}-${i}`,
                    name: `${char.name} - ${part.name || groupName}`,
                    type: 'image',
                    sourceUrl: sourceUrl,
                    x: cx, 
                    y: cy,
                    width: cw,
                    height: ch,
                    origWidth: cw,
                    origHeight: ch,
                    cropX: cx,
                    cropY: cy,
                    rotation: 0,
                    opacity: 1,
                    zIndex: zIndexOffset + i,
                    startFrame: 0,
                    durationInFrames: 300,
                    characterId: char.id,
                    layerGroup: groupName
                });
            }
        });

        if (newLayers.length > 0) {
            useStudioStore.getState().addMultipleLayers(newLayers);
        } else {
            alert('Không tìm thấy layer nào trong nhân vật này!');
        }
    };

    return (
        <div className="w-72 flex flex-col border-r border-white/10" style={{ backgroundColor: 'var(--surface-base)' }}>
            {/* Tabs */}
            <div className="flex border-b border-white/5">
                {(['scene', 'psd', 'fla'] as const).map(t => (
                    <button
                        key={t}
                        onClick={() => setSidebarTab(t)}
                        className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 flex items-center justify-center gap-2 ${sidebarTab === t ? 'border-indigo-500 text-indigo-300 bg-white/5' : 'border-transparent text-neutral-500 hover:text-neutral-300'}`}
                    >
                        {t === 'scene' ? <Film className="w-4 h-4" /> : t === 'psd' ? <Palette className="w-4 h-4" /> : <Layers className="w-4 h-4" />}
                        {t}
                    </button>
                ))}
            </div>

            {/* Upload Zone */}
            <div className="p-4 border-b border-white/5">
                <div
                    className="py-4 border border-dashed border-neutral-700 hover:border-indigo-500 hover:bg-indigo-500/10 rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all gap-2"
                    onClick={() => fileInputRef.current?.click()}
                >
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        className="hidden" 
                        accept={sidebarTab === 'psd' ? '.psd' : '.zip,.fla'} 
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            if (sidebarTab === 'psd') {
                                handleUploadPSD(file);
                            } else if (sidebarTab === 'fla') {
                                handleUploadFLA(file);
                            }
                        }}
                    />
                    {uploading ? (
                        <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
                    ) : (
                        <UploadCloud className="w-6 h-6 text-neutral-400" />
                    )}
                    <span className="text-[10px] font-medium text-neutral-400">
                        {uploading ? 'Processing...' : `Upload New ${sidebarTab.toUpperCase()}`}
                    </span>
                </div>
            </div>

            {/* AUTO-TEST BUTTON START */}
            <div className="p-4 border-b border-white/5">
                <button 
                    onClick={async () => {
                        try {
                            const res = await fetch('/stage.fla');
                            const blob = await res.blob();
                            const file = new File([blob], 'stage.fla', { type: 'application/octet-stream' });
                            setSidebarTab('fla');
                            handleUploadFLA(file);
                        } catch (err) {
                            console.error(err);
                            alert("Auto test failed");
                        }
                    }}
                    className="w-full py-2 bg-red-500/20 text-red-300 font-bold text-[10px] rounded hover:bg-red-500/40"
                    id="auto-test-fla-btn"
                >
                    AUTO-TEST FLA PARSER
                </button>
            </div>
            {/* AUTO-TEST BUTTON END */}

            {/* Library Grid */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                <h3 className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold mb-2">
                    {sidebarTab.toUpperCase()} Library
                </h3>
                
                {sidebarTab === 'psd' && psdCharacters.map(char => {
                    const firstGroup = Object.values(char.layer_groups)[0] as any[];
                    const thumbUrl = firstGroup?.[0]?.hash 
                        ? `${API_BASE_URL}/thumbnails/${firstGroup[0].hash}_thumb.png` 
                        : null;
                        
                    return (
                        <div 
                            key={char.id} 
                            onClick={() => handleAddAssetToStage(char)}
                            className="flex gap-3 bg-white/5 rounded-lg p-2 items-center hover:bg-white/10 cursor-pointer border border-transparent hover:border-white/10"
                        >
                            <div className="w-10 h-10 rounded bg-black/50 overflow-hidden flex items-center justify-center">
                                {thumbUrl ? <img src={thumbUrl} className="w-full h-full object-contain" alt="" /> : <User className="w-5 h-5 opacity-50" />}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-xs font-bold truncate text-white">{char.name}</div>
                                <div className="text-[10px] text-neutral-500">{Object.keys(char.layer_groups || {}).length} parts</div>
                            </div>
                        </div>
                    );
                })}

                {sidebarTab === 'fla' && flaCharacters.map(char => (
                    <div 
                        key={char.id} 
                        onClick={() => handleAddAssetToStage(char)}
                        className="flex gap-3 bg-white/5 rounded-lg p-2 items-center hover:bg-white/10 cursor-pointer border border-transparent hover:border-white/10"
                    >
                         <div className="w-10 h-10 rounded bg-black/50 flex items-center justify-center">
                            <Layers className="w-5 h-5 text-emerald-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-xs font-bold truncate text-white">{char.name}</div>
                            <div className="text-[10px] text-neutral-500 font-mono">V2 (Anim)</div>
                        </div>
                    </div>
                ))}

                {/* Empty states */}
                {sidebarTab === 'psd' && psdCharacters.length === 0 && (
                    <div className="text-center py-8 opacity-50 space-y-2">
                        <Palette className="w-8 h-8 mx-auto opacity-50" />
                        <p className="text-[10px]">No PSDs uploaded yet</p>
                    </div>
                )}

                {/* Scene Graph Characters Tab */}
                {sidebarTab === 'scene' && <SceneCharacterPanel />}
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════
// Scene Graph Character Panel — lists characters from AssetRegistry
// ═══════════════════════════════════════════════════════════
const SceneCharacterPanel: React.FC = () => {
    const characters = useSceneGraphStore(s => s.characters);
    const fetchCharacters = useSceneGraphStore(s => s.fetchCharacters);
    const addCharacterToScene = useSceneGraphStore(s => s.addCharacterToScene);
    const sceneNodeIds = useSceneGraphStore(s => s.sceneNodeIds);
    const manager = useSceneGraphStore(s => s.manager);
    const setPose = useSceneGraphStore(s => s.setPose);
    const setFace = useSceneGraphStore(s => s.setFace);
    const snapshot = useSceneGraphStore(s => s.snapshot);

    useEffect(() => { fetchCharacters(); }, [fetchCharacters]);

    // Get scene character nodes for inline editing
    const sceneCharNodes = sceneNodeIds
        .map(id => manager.getNode(id))
        .filter((n): n is CharacterNodeData => n?.nodeType === 'character') as CharacterNodeData[];

    return (
        <div className="space-y-3">
            {/* Available Characters */}
            <h4 className="text-[9px] uppercase tracking-widest text-cyan-500 font-bold">
                Available ({characters.length})
            </h4>

            {characters.length === 0 && (
                <div className="text-center py-6 opacity-40 space-y-2">
                    <Film className="w-8 h-8 mx-auto opacity-50" />
                    <p className="text-[10px]">Backend offline or no characters</p>
                    <button onClick={fetchCharacters} className="text-[10px] text-indigo-400 hover:underline">
                        Retry
                    </button>
                </div>
            )}

            {characters.map(char => {
                const isInScene = sceneCharNodes.some(n => n.characterId === char.id);
                return (
                    <div key={char.id} className="bg-white/5 rounded-lg border border-white/5 overflow-hidden">
                        <div
                            className={`flex gap-3 p-2.5 items-center cursor-pointer transition-all ${
                                isInScene
                                    ? 'bg-cyan-500/10 border-l-2 border-l-cyan-500'
                                    : 'hover:bg-white/10'
                            }`}
                            onClick={async () => {
                                if (!isInScene) {
                                    await addCharacterToScene(char.id);
                                }
                            }}
                        >
                            <div className="w-10 h-10 rounded bg-black/40 flex items-center justify-center flex-shrink-0">
                                <User className="w-5 h-5 text-cyan-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-xs font-bold truncate text-white">
                                    {char.name.split('_')[0]}
                                </div>
                                <div className="text-[10px] text-neutral-500">
                                    {char.poses} poses · {char.faces} faces
                                </div>
                            </div>
                            {isInScene && (
                                <span className="text-[8px] bg-cyan-500/20 text-cyan-400 px-1.5 py-0.5 rounded font-bold">
                                    IN SCENE
                                </span>
                            )}
                        </div>

                        {/* Inline Pose/Face selector for chars already in scene */}
                        {isInScene && sceneCharNodes
                            .filter(n => n.characterId === char.id)
                            .map(node => (
                                <div key={node.id} className="px-2.5 pb-2.5 space-y-2 border-t border-white/5 pt-2">
                                    {/* Pose pills */}
                                    <div>
                                        <div className="text-[9px] text-neutral-400 font-medium mb-1">Pose (动作)</div>
                                        <div className="flex flex-wrap gap-1">
                                            {node.availableLayers.pose?.slice(0, 8).map(p => (
                                                <button
                                                    key={p}
                                                    onClick={(e) => { e.stopPropagation(); setPose(node.id, p); }}
                                                    className={`px-1.5 py-0.5 text-[9px] rounded border transition-colors ${
                                                        node.activeLayers.pose === p
                                                            ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                                                            : 'border-white/10 text-neutral-500 hover:text-white hover:border-white/20'
                                                    }`}
                                                >
                                                    {p}
                                                </button>
                                            ))}
                                            {(node.availableLayers.pose?.length || 0) > 8 && (
                                                <span className="text-[9px] text-neutral-600 px-1.5 py-0.5">
                                                    +{(node.availableLayers.pose?.length || 0) - 8}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Face pills */}
                                    <div>
                                        <div className="text-[9px] text-neutral-400 font-medium mb-1">Face (表情)</div>
                                        <div className="flex flex-wrap gap-1">
                                            {node.availableLayers.face?.slice(0, 8).map(f => (
                                                <button
                                                    key={f}
                                                    onClick={(e) => { e.stopPropagation(); setFace(node.id, f); }}
                                                    className={`px-1.5 py-0.5 text-[9px] rounded border transition-colors ${
                                                        node.activeLayers.face === f
                                                            ? 'bg-orange-500/20 border-orange-500 text-orange-300'
                                                            : 'border-white/10 text-neutral-500 hover:text-white hover:border-white/20'
                                                    }`}
                                                >
                                                    {f}
                                                </button>
                                            ))}
                                            {(node.availableLayers.face?.length || 0) > 8 && (
                                                <span className="text-[9px] text-neutral-600 px-1.5 py-0.5">
                                                    +{(node.availableLayers.face?.length || 0) - 8}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))
                        }
                    </div>
                );
            })}
        </div>
    );
};

export default AssetSidebar;

