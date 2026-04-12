import React from 'react';
import { useStudioStore } from '@/stores/useStudioStore';
import { useAppStore } from '@/stores/useAppStore';
import { useCharacterV2Store } from '@/stores/useCharacterV2Store';
import { STATIC_BASE } from '@/config/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Move, Droplets, UserSquare2, Sparkles } from 'lucide-react';

const PropertiesPanel: React.FC = () => {
    const { layers, selectedLayerId, updateLayer } = useStudioStore();
    const psdCharacters = useAppStore(s => s.characters);
    const flaCharacters = useCharacterV2Store(s => s.characters);

    if (!selectedLayerId) {
        return (
            <div className="h-full w-full flex flex-col items-center justify-center opacity-30 text-center gap-2">
                <div className="text-2xl">✨</div>
                <span className="text-[10px]">Select a layer<br/>to edit properties</span>
            </div>
        );
    }

    const layer = layers.find(l => l.id === selectedLayerId);
    if (!layer) {
        return (
            <div className="h-full w-full flex flex-col items-center justify-center text-center opacity-30 gap-2">
                <div className="text-2xl">🔒</div>
                <span className="text-[10px]">Layer not found</span>
            </div>
        );
    }

    let char = psdCharacters.find(c => c.id === layer.characterId);
    if (!char) {
        char = flaCharacters.find(c => c.id === layer.characterId) as any;
    }

    return (
        <Tabs defaultValue="transform" className="flex flex-col h-full w-full">
            <TabsList className="w-full flex rounded-none bg-black/40 border-b border-white/10 p-0 shrink-0">
                <TabsTrigger 
                    value="transform" 
                    className="flex-1 rounded-none data-[state=active]:bg-white/5 data-[state=active]:border-b-2 data-[state=active]:border-indigo-500 gap-1.5 text-[10px] uppercase font-bold tracking-wider py-3 px-1"
                >
                    <Move className="w-3 h-3" /> Trans
                </TabsTrigger>
                <TabsTrigger 
                    value="effects" 
                    className="flex-1 rounded-none data-[state=active]:bg-white/5 data-[state=active]:border-b-2 data-[state=active]:border-indigo-500 gap-1.5 text-[10px] uppercase font-bold tracking-wider py-3 px-1"
                >
                    <Sparkles className="w-3 h-3" /> Effects
                </TabsTrigger>
                <TabsTrigger 
                    value="blending" 
                    className="flex-1 rounded-none data-[state=active]:bg-white/5 data-[state=active]:border-b-2 data-[state=active]:border-indigo-500 gap-1.5 text-[10px] uppercase font-bold tracking-wider py-3 px-1"
                >
                    <Droplets className="w-3 h-3" /> Blend
                </TabsTrigger>
                {layer.characterId && char && char.layer_groups && (
                    <TabsTrigger 
                        value="character" 
                        className="flex-1 rounded-none data-[state=active]:bg-white/5 data-[state=active]:border-b-2 data-[state=active]:border-indigo-500 gap-1.5 text-[10px] uppercase font-bold tracking-wider py-3 px-1"
                    >
                        <UserSquare2 className="w-3 h-3" /> Char
                    </TabsTrigger>
                )}
            </TabsList>

            <div className="flex-1 overflow-y-auto p-4 min-h-0">
                {/* TRANSFORM TAB */}
                <TabsContent value="transform" className="m-0 flex flex-col gap-5">
                    <div className="flex items-center justify-between mb-1">
                        <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Coordinates</h3>
                        {layer.characterId && <span className="text-[9px] text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded">Group Linked</span>}
                    </div>
                    
                    {/* Scale Percentage Slider */}
                    <div className="space-y-3 pb-3 border-b border-white/5">
                        <div className="flex items-center justify-between">
                            <Label>Scale</Label>
                            <span className="text-[10px] font-mono text-neutral-400">
                                {Math.round((layer.origWidth ? layer.width / layer.origWidth : 1) * 100)}%
                            </span>
                        </div>
                        <Slider 
                            value={[layer.origWidth ? layer.width / layer.origWidth : 1]} 
                            max={3} 
                            min={0.1}
                            step={0.01} 
                            onValueChange={(val) => {
                                const newScale = val[0];
                                const currentScale = layer.origWidth ? layer.width / layer.origWidth : 1;
                                const ratio = newScale / currentScale;
                                
                                if (layer.characterId) {
                                    layers.filter(l => l.characterId === layer.characterId).forEach(l => {
                                        const dx = l.x - layer.x;
                                        const dy = l.y - layer.y;
                                        updateLayer(l.id, { 
                                            width: l.width * ratio, 
                                            height: l.height * ratio,
                                            x: layer.x + dx * ratio,
                                            y: layer.y + dy * ratio
                                        });
                                    });
                                } else {
                                    updateLayer(layer.id, { 
                                        width: layer.width * ratio,
                                        height: layer.height * ratio 
                                    });
                                }
                            }} 
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <Label>X Position</Label>
                            <Input type="number" value={Math.round(layer.x || 0)} onChange={(e) => {
                                const newX = Number(e.target.value);
                                if (layer.characterId) {
                                    const deltaX = newX - layer.x;
                                    layers.filter(l => l.characterId === layer.characterId).forEach(l => {
                                        updateLayer(l.id, { x: l.x + deltaX });
                                    });
                                } else {
                                    updateLayer(layer.id, { x: newX });
                                }
                            }} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Y Position</Label>
                            <Input type="number" value={Math.round(layer.y || 0)} onChange={(e) => {
                                const newY = Number(e.target.value);
                                if (layer.characterId) {
                                    const deltaY = newY - layer.y;
                                    layers.filter(l => l.characterId === layer.characterId).forEach(l => {
                                        updateLayer(l.id, { y: l.y + deltaY });
                                    });
                                } else {
                                    updateLayer(layer.id, { y: newY });
                                }
                            }} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Width <span className="text-[9px] text-neutral-500">(px)</span></Label>
                            <Input type="number" value={Math.round(layer.width || 0)} onChange={(e) => {
                                const newW = Number(e.target.value);
                                if (layer.characterId) {
                                    const ratio = newW / layer.width;
                                    layers.filter(l => l.characterId === layer.characterId).forEach(l => {
                                        const dx = l.x - layer.x;
                                        updateLayer(l.id, { width: l.width * ratio, x: layer.x + dx * ratio });
                                    });
                                } else {
                                    updateLayer(layer.id, { width: newW });
                                }
                            }} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Height <span className="text-[9px] text-neutral-500">(px)</span></Label>
                            <Input type="number" value={Math.round(layer.height || 0)} onChange={(e) => {
                                const newH = Number(e.target.value);
                                if (layer.characterId) {
                                    const ratio = newH / layer.height;
                                    layers.filter(l => l.characterId === layer.characterId).forEach(l => {
                                        const dy = l.y - layer.y;
                                        updateLayer(l.id, { height: l.height * ratio, y: layer.y + dy * ratio });
                                    });
                                } else {
                                    updateLayer(layer.id, { height: newH });
                                }
                            }} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Rotation <span className="text-[9px] text-neutral-500">(°)</span></Label>
                            <Input type="number" value={Math.round(layer.rotation || 0)} onChange={(e) => {
                                const newRot = Number(e.target.value);
                                if (layer.characterId) {
                                    const deltaRot = newRot - (layer.rotation || 0);
                                    const rotDiffRad = deltaRot * (Math.PI / 180);
                                    const pivotX = layer.x + layer.width / 2;
                                    const pivotY = layer.y + layer.height / 2;

                                    layers.filter(l => l.characterId === layer.characterId).forEach(l => {
                                        const lCenterX = l.x + l.width / 2;
                                        const lCenterY = l.y + l.height / 2;
                                        
                                        const dx = lCenterX - pivotX;
                                        const dy = lCenterY - pivotY;

                                        const rotatedDx = dx * Math.cos(rotDiffRad) - dy * Math.sin(rotDiffRad);
                                        const rotatedDy = dx * Math.sin(rotDiffRad) + dy * Math.cos(rotDiffRad);

                                        updateLayer(l.id, { 
                                            x: pivotX + rotatedDx - l.width / 2,
                                            y: pivotY + rotatedDy - l.height / 2,
                                            rotation: (l.rotation || 0) + deltaRot 
                                        });
                                    });
                                } else {
                                    updateLayer(layer.id, { rotation: newRot });
                                }
                            }} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Z-Index</Label>
                            <Input type="number" value={layer.zIndex || 0} onChange={(e) => {
                                if (layer.characterId) {
                                    const deltaZ = Number(e.target.value) - layer.zIndex;
                                    layers.filter(l => l.characterId === layer.characterId).forEach(l => {
                                        updateLayer(l.id, { zIndex: l.zIndex + deltaZ });
                                    });
                                } else {
                                    updateLayer(layer.id, { zIndex: Number(e.target.value) });
                                }
                            }} />
                        </div>
                    </div>
                </TabsContent>

                {/* EFFECTS TAB */}
                <TabsContent value="effects" className="m-0 flex flex-col gap-6">
                    <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1">Visual Effects (GLSL/CSS)</h3>
                    
                    <div className="space-y-4">
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                                <Label>Gaussian Blur</Label>
                                <span className="text-[10px] font-mono text-neutral-400">{Math.round(layer.blur ?? 0)}px</span>
                            </div>
                            <Slider 
                                value={[layer.blur ?? 0]} 
                                max={50} min={0} step={1}
                                onValueChange={(val) => {
                                    if (layer.characterId) {
                                        layers.forEach(l => l.characterId === layer.characterId && updateLayer(l.id, { blur: val[0] }));
                                    } else {
                                        updateLayer(layer.id, { blur: val[0] });
                                    }
                                }} 
                            />
                        </div>

                        <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                                <Label>Brightness</Label>
                                <span className="text-[10px] font-mono text-neutral-400">{Math.round((layer.brightness ?? 1) * 100)}%</span>
                            </div>
                            <Slider 
                                value={[layer.brightness ?? 1]} 
                                max={3} min={0} step={0.05}
                                onValueChange={(val) => {
                                    if (layer.characterId) {
                                        layers.forEach(l => l.characterId === layer.characterId && updateLayer(l.id, { brightness: val[0] }));
                                    } else {
                                        updateLayer(layer.id, { brightness: val[0] });
                                    }
                                }} 
                            />
                        </div>

                        <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                                <Label>Contrast</Label>
                                <span className="text-[10px] font-mono text-neutral-400">{Math.round((layer.contrast ?? 1) * 100)}%</span>
                            </div>
                            <Slider 
                                value={[layer.contrast ?? 1]} 
                                max={3} min={0} step={0.05}
                                onValueChange={(val) => {
                                    if (layer.characterId) {
                                        layers.forEach(l => l.characterId === layer.characterId && updateLayer(l.id, { contrast: val[0] }));
                                    } else {
                                        updateLayer(layer.id, { contrast: val[0] });
                                    }
                                }} 
                            />
                        </div>

                        <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                                <Label>Grayscale (B/W)</Label>
                                <span className="text-[10px] font-mono text-neutral-400">{Math.round((layer.grayscale ?? 0) * 100)}%</span>
                            </div>
                            <Slider 
                                value={[layer.grayscale ?? 0]} 
                                max={1} min={0} step={0.01}
                                onValueChange={(val) => {
                                    if (layer.characterId) {
                                        layers.forEach(l => l.characterId === layer.characterId && updateLayer(l.id, { grayscale: val[0] }));
                                    } else {
                                        updateLayer(layer.id, { grayscale: val[0] });
                                    }
                                }} 
                            />
                        </div>
                    </div>
                </TabsContent>

                {/* BLENDING TAB */}
                <TabsContent value="blending" className="m-0 flex flex-col gap-5">
                    <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1">Opacity & Blending</h3>
                    <div className="space-y-3">
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                                <Label>Opacity</Label>
                                <span className="text-[10px] font-mono text-neutral-400">{Math.round((layer.opacity ?? 1) * 100)}%</span>
                            </div>
                            <Slider 
                                value={[layer.opacity ?? 1]} 
                                max={1} 
                                step={0.01} 
                                onValueChange={(val) => {
                                    if (layer.characterId) {
                                        layers.forEach(l => {
                                            if (l.characterId === layer.characterId) {
                                                updateLayer(l.id, { opacity: val[0] });
                                            }
                                        });
                                    } else {
                                        updateLayer(layer.id, { opacity: val[0] });
                                    }
                                }} 
                            />
                        </div>
                    </div>
                </TabsContent>

                {/* CHARACTER TAB */}
                {char && char.layer_groups && layer.characterId && (
                    <TabsContent value="character" className="m-0 flex flex-col gap-6">
                        <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1">Character Features</h3>
                        
                        {Object.entries(char.layer_groups).map(([groupName, variants]) => {
                            const targetLayer = layers.find(l => l.characterId === layer.characterId && l.layerGroup === groupName);
                            if (!targetLayer || (variants as any[]).length <= 1) return null;
                            
                            const gName = groupName.toLowerCase();
                            const isFaceNode = gName.includes('head') || gName.includes('face') || gName.includes('mouth') || gName.includes('eye') || gName.includes('hair') || 
                                               gName.includes('表情') || gName.includes('眼') || gName.includes('脸') || gName.includes('嘴') || gName.includes('头');

                            return (
                                <div key={groupName} className="flex flex-col gap-2">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-[10px] text-indigo-400 font-mono bg-indigo-500/10 px-2 py-1 rounded w-fit capitalize">{groupName}</Label>
                                    </div>
                                    <div className={`grid gap-2 ${isFaceNode ? 'grid-cols-4' : 'grid-cols-3'}`}>
                                        {(variants as any[]).map(variant => {
                                            const fullUrl = variant.path.startsWith('http') ? variant.path : `${STATIC_BASE}/${variant.path}`;
                                            const isSelected = targetLayer.sourceUrl === fullUrl;
                                            
                                            return (
                                                <div 
                                                    key={variant.hash}
                                                    onClick={() => {
                                                        updateLayer(targetLayer.id, { 
                                                            sourceUrl: fullUrl,
                                                            name: `${char.name} - ${variant.name}`
                                                        });
                                                    }}
                                                    className={`aspect-square rounded-lg bg-slate-200 overflow-hidden flex items-center justify-center cursor-pointer border transition-all relative ${
                                                        isSelected ? 'border-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.6)] z-10' : 'border-transparent hover:border-indigo-400/50'
                                                    }`}
                                                    title={variant.name}
                                                >
                                                    <img 
                                                        src={fullUrl} 
                                                        className="w-full h-full pointer-events-none"
                                                        style={isFaceNode ? {
                                                            objectFit: 'cover',
                                                            objectPosition: 'center top',
                                                            transform: 'scale(2.5) translateY(10%)',
                                                        } : {
                                                            objectFit: 'contain'
                                                        }}
                                                        draggable={false} 
                                                    />
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </TabsContent>
                )}
            </div>
        </Tabs>
    );
};

export default PropertiesPanel;
