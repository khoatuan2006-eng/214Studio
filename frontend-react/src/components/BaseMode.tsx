import React, { useEffect, useState } from 'react';
import { useAppStore, STATIC_BASE } from '../store/useAppStore';

import UploadModule from './UploadModule';
import { Download, Layers } from 'lucide-react';

const BaseMode: React.FC = () => {
    const { characters, fetchCharacters } = useAppStore();
    const [selectedCharId, setSelectedCharId] = useState<string>('');

    // State for tracking which layer is selected from which group
    // e.g. { "Body": "layer1.png", "Face": "face2.png" }
    const [activeLayers, setActiveLayers] = useState<Record<string, string>>({});

    useEffect(() => {
        fetchCharacters();
    }, [fetchCharacters]);

    const selectedChar = characters.find(c => c.id === selectedCharId || c.name === selectedCharId);

    // When character changes, select the first layer for each group by default
    useEffect(() => {
        if (selectedChar) {
            const initialLayers: Record<string, string> = {};
            selectedChar.group_order.forEach(groupName => {
                const layers = selectedChar.layer_groups[groupName];
                if (layers && layers.length > 0) {
                    initialLayers[groupName] = layers[0].path;
                } else {
                    initialLayers[groupName] = '';
                }
            });
            setActiveLayers(initialLayers);
        } else {
            setActiveLayers({});
        }
    }, [selectedCharId, selectedChar]);

    const handleLayerSelect = (groupName: string, path: string) => {
        setActiveLayers(prev => ({ ...prev, [groupName]: path }));
    };

    const handleDownload = () => {
        if (!selectedChar) return;

        const visiblePaths = selectedChar.group_order
            .map(group => activeLayers[group])
            .filter(path => path !== ''); // exclude None

        if (visiblePaths.length === 0) {
            alert("No layers selected to download.");
            return;
        }

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Load first image to get dimensions
        const baseImg = new Image();
        baseImg.crossOrigin = "Anonymous";
        baseImg.src = `${STATIC_BASE}/${visiblePaths[0]}`;

        baseImg.onload = () => {
            canvas.width = baseImg.naturalWidth > 0 ? baseImg.naturalWidth : 1000;
            canvas.height = baseImg.naturalHeight > 0 ? baseImg.naturalHeight : 1000;

            let loadedCount = 0;
            const images: HTMLImageElement[] = [];

            visiblePaths.forEach((path, i) => {
                const img = new Image();
                img.crossOrigin = "Anonymous";
                img.src = `${STATIC_BASE}/${path}`;
                img.onload = () => {
                    loadedCount++;
                    images[i] = img;

                    if (loadedCount === visiblePaths.length) {
                        // All loaded, draw in order (since visiblePaths maps to group_order which is bottom-to-top z-index)
                        images.forEach(img => {
                            if (img) ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                        });

                        triggerDownload(canvas, `${selectedChar.name}_export.png`);
                    }
                };
            });
        };
    };

    const triggerDownload = (canvas: HTMLCanvasElement, filename: string) => {
        canvas.toBlob((blob) => {
            if (!blob) return;
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 'image/png');
    };

    return (
        <div className="flex h-full w-full">
            {/* Sidebar Controls */}
            <div className="w-80 bg-neutral-900 border-r border-neutral-700 p-6 flex flex-col gap-6 overflow-y-auto shrink-0">

                {/* Character Selection */}
                <div className="flex flex-col gap-2">
                    <label className="text-sm font-semibold text-neutral-300">1. Choose Character</label>
                    <select
                        className="w-full bg-neutral-800 border border-neutral-700 rounded-lg p-2.5 text-neutral-100 outline-none focus:border-indigo-500"
                        value={selectedCharId}
                        onChange={(e) => setSelectedCharId(e.target.value)}
                    >
                        <option value="" disabled>Select a Character...</option>
                        {characters.map(char => (
                            <option key={char.id} value={char.id || char.name}>{char.name}</option>
                        ))}
                    </select>
                </div>

                {/* Dynamic Controls based on selected character's PSD groups */}
                {selectedChar && (
                    <div className="flex flex-col gap-6">
                        {selectedChar.group_order.map((groupName, idx) => (
                            <div key={groupName} className="flex flex-col gap-2">
                                <label className="text-sm font-semibold text-neutral-300">{idx + 2}. Select {groupName}</label>
                                <div className="grid grid-cols-4 gap-2">

                                    {/* "None" option */}
                                    <div
                                        onClick={() => handleLayerSelect(groupName, '')}
                                        className={`aspect-square rounded border cursor-pointer flex flex-col items-center justify-center transition-all ${activeLayers[groupName] === '' ? 'border-indigo-500 bg-indigo-500/20' : 'border-neutral-700 hover:border-neutral-500 bg-neutral-800'
                                            }`}
                                    >
                                        <span className="text-xs text-neutral-500">None</span>
                                    </div>

                                    {/* Actual sub-layers */}
                                    {selectedChar.layer_groups[groupName]?.map(layer => (
                                        <div
                                            key={layer.path}
                                            onClick={() => handleLayerSelect(groupName, layer.path)}
                                            className={`aspect-square rounded border cursor-pointer overflow-hidden transition-all bg-neutral-800 flex items-center justify-center ${activeLayers[groupName] === layer.path ? 'border-indigo-500 ring-2 ring-indigo-500/50' : 'border-neutral-700 hover:border-neutral-500'
                                                }`}
                                            title={layer.name}
                                        >
                                            <img
                                                src={`${STATIC_BASE}/${layer.path}`}
                                                alt={layer.name}
                                                className="w-full h-full object-contain p-1"
                                                crossOrigin="anonymous"
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Divider */}
                <div className="h-px bg-neutral-700"></div>

                {/* Upload Area */}
                <UploadModule />
            </div>

            {/* Main Preview Area */}
            <div className="flex-1 bg-neutral-950 p-8 relative flex items-center justify-center overflow-hidden">

                {/* Download BTN Overlay */}
                {selectedChar && (
                    <button
                        onClick={handleDownload}
                        className="absolute top-6 right-6 bg-indigo-600 hover:bg-indigo-500 text-white p-3 rounded-full shadow-lg transition-transform hover:scale-105"
                        title="Download Character"
                    >
                        <Download className="w-5 h-5" />
                    </button>
                )}

                {selectedChar ? (
                    <div className="relative w-full h-full flex items-center justify-center max-w-2xl bg-neutral-900/50 rounded-xl border border-neutral-800 shadow-inner">
                        {/* Debug Info Overlay */}
                        <div className="absolute top-4 left-4 text-[10px] text-neutral-500 font-mono z-50 pointer-events-none">
                            {selectedChar.group_order.map(g => (
                                <div key={g}>{g}: {activeLayers[g] ? 'LOADED' : 'NONE'}</div>
                            ))}
                        </div>

                        {selectedChar.group_order.map((groupName, idx) => {
                            const activePath = activeLayers[groupName];
                            if (!activePath) return null;

                            return (
                                <img
                                    key={groupName}
                                    src={`${STATIC_BASE}/${activePath}`}
                                    className="absolute inset-0 w-full h-full object-contain pointer-events-none drop-shadow-xl"
                                    style={{ zIndex: 10 + idx }}
                                    alt={groupName}
                                    crossOrigin="anonymous"
                                />
                            );
                        })}
                    </div>
                ) : (
                    <div className="text-center text-neutral-500 flex flex-col items-center gap-4">
                        <Layers className="w-16 h-16 opacity-30" />
                        <h2 className="text-xl font-semibold opacity-50">No Character Selected</h2>
                        <p className="text-sm opacity-50">Upload a PSD or select an existing character from the sidebar.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default BaseMode;
