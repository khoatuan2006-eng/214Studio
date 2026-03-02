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
        <div className="flex h-full w-full animate-tab-enter">
            {/* Sidebar Controls */}
            <div className="w-80 glass-panel-heavy p-6 flex flex-col gap-6 overflow-y-auto shrink-0"
                style={{ borderRight: '1px solid var(--glass-border)' }}>

                {/* Character Selection */}
                <div className="flex flex-col gap-2">
                    <label className="section-label">1. Choose Character</label>
                    <select
                        className="w-full rounded-xl p-2.5 text-sm input-premium"
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
                                <label className="section-label">{idx + 2}. Select {groupName}</label>
                                <div className="grid grid-cols-4 gap-2">

                                    {/* "None" option */}
                                    <div
                                        onClick={() => handleLayerSelect(groupName, '')}
                                        className={`aspect-square rounded-xl cursor-pointer flex flex-col items-center justify-center transition-all duration-200 ${activeLayers[groupName] === ''
                                            ? 'glow-ring'
                                            : 'surface-card hover:!transform-none'
                                            }`}
                                    >
                                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>None</span>
                                    </div>

                                    {/* Actual sub-layers */}
                                    {selectedChar.layer_groups[groupName]?.map(layer => (
                                        <div
                                            key={layer.path}
                                            onClick={() => handleLayerSelect(groupName, layer.path)}
                                            className={`aspect-square rounded-xl cursor-pointer overflow-hidden transition-all duration-200 flex items-center justify-center ${activeLayers[groupName] === layer.path
                                                ? 'glow-ring'
                                                : 'surface-card hover:!transform-none'
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
                <div className="h-px" style={{ background: 'var(--border-subtle)' }}></div>

                {/* Upload Area */}
                <UploadModule />
            </div>

            {/* Main Preview Area */}
            <div className="flex-1 p-8 relative flex items-center justify-center overflow-hidden" style={{ background: 'var(--surface-base)' }}>
                {/* Ambient canvas glow */}
                <div className="absolute inset-0 pointer-events-none"
                    style={{ background: 'radial-gradient(ellipse at center, rgba(99,102,241,0.03) 0%, transparent 70%)' }} />

                {/* Download BTN Overlay */}
                {selectedChar && (
                    <button
                        onClick={handleDownload}
                        className="absolute top-6 right-6 btn-accent p-3 rounded-full shadow-lg z-20"
                        title="Download Character"
                    >
                        <Download className="w-5 h-5" />
                    </button>
                )}

                {selectedChar ? (
                    <div className="relative w-full h-full flex items-center justify-center max-w-2xl rounded-2xl overflow-hidden"
                        style={{ background: 'var(--surface-raised)', border: '1px solid var(--border-subtle)', boxShadow: 'inset 0 2px 40px -12px rgba(0,0,0,0.5)' }}>
                        {/* Debug Info Overlay */}
                        <div className="absolute top-4 left-4 z-50 pointer-events-none"
                            style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '9px', color: 'var(--text-muted)', opacity: 0.6 }}>
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
                    <div className="text-center flex flex-col items-center gap-4">
                        <div className="relative">
                            <Layers className="w-20 h-20 opacity-20" />
                            <div className="absolute inset-0 blur-2xl opacity-30" style={{ background: 'var(--accent-glow)' }} />
                        </div>
                        <h2 className="text-2xl font-bold gradient-text opacity-70">No Character Selected</h2>
                        <p className="text-sm max-w-xs" style={{ color: 'var(--text-muted)' }}>
                            Upload a PSD or select an existing character from the sidebar to begin.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default BaseMode;
