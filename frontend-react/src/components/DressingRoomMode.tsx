import React, { useEffect, useState } from 'react';
import { useAppStore, STATIC_BASE, type Character } from '../store/useAppStore';
import { API_BASE_URL } from '../config/api';
import Organizer from './Organizer';
import { Layers, ChevronLeft, Trash2, UserCheck, Users, Eye, EyeOff } from 'lucide-react';

const DressingRoomMode: React.FC = () => {
    const { characters, fetchCustomLibrary } = useAppStore();
    const [showOrganizer, setShowOrganizer] = useState(false);

    useEffect(() => {
        fetchCustomLibrary();
    }, [fetchCustomLibrary]);

    // Selected character
    const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);

    // State: selected asset hashes per layer group. Record<groupName, { hash: string, z_index: number }>
    const [selections, setSelections] = useState<Record<string, { hash: string, z_index: number }>>({});
    
    // P3-6.1: State for asset visibility per asset
    const [assetVisibility, setAssetVisibility] = useState<Record<string, boolean>>({});

    const toggleSelection = (groupName: string, zIndex: number, hash: string) => {
        setSelections(prev => {
            const next = { ...prev };
            if (next[groupName]?.hash === hash) {
                delete next[groupName]; // Deselect if click again
            } else {
                next[groupName] = { hash, z_index: zIndex };
            }
            return next;
        });
    };

    const removeSelection = (groupName: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setSelections(prev => {
            const next = { ...prev };
            delete next[groupName];
            return next;
        });
    };

    return (
        <div className="flex h-full w-full bg-neutral-900">

            {/* Sidebar Controls */}
            <div className="flex-[2] min-w-[500px] bg-neutral-900 border-r border-neutral-700 p-6 flex flex-col overflow-hidden">
                {!selectedCharacter ? (
                    <>
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-[#f5f6fa] font-bold text-lg flex items-center gap-2">
                                <Users className="w-5 h-5" /> Select Character
                            </h2>
                            <button
                                onClick={() => setShowOrganizer(true)}
                                className="bg-[#1a1d2d] hover:bg-[#202438] text-[#a4b0be] border border-white/10 px-3 py-1.5 rounded-lg flex justify-center items-center gap-2 transition-colors shadow-sm font-semibold text-[0.85rem]"
                                title="Library Organizer"
                            >
                                <Layers className="w-4 h-4" /> Organizer
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto pr-2">
                            <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-4">
                                {characters.map(char => {
                                    // P1-2.3: Thumbnail Integration
                                    // Use 128x128 thumbnail instead of full-size PNG for the character card
                                    let thumbPath = "";
                                    let charName = char.name;
                                    if (char.layer_groups && Object.keys(char.layer_groups).length > 0) {
                                        const firstGroup = Object.values(char.layer_groups)[0] as any[];
                                        if (firstGroup && firstGroup.length > 0) {
                                            const firstAsset = firstGroup[0];
                                            if (firstAsset.hash) {
                                                // Prefer thumbnail URL (128x128) over full-size asset
                                                thumbPath = `${API_BASE_URL}/thumbnails/${firstAsset.hash}_thumb.png`;
                                            } else {
                                                thumbPath = `${STATIC_BASE}/${firstAsset.path}`;
                                            }
                                        }
                                    }

                                    return (
                                        <div
                                            key={char.id}
                                            onClick={() => {
                                                setSelectedCharacter(char);
                                                setSelections({}); // Reset selections when character changes
                                            }}
                                            className="relative flex flex-col items-center gap-2 p-3 bg-black/40 rounded-xl border-2 border-transparent hover:border-[#5b4bc4] cursor-pointer transition-all hover:-translate-y-1 hover:shadow-lg group"
                                        >
                                            <div className="w-20 h-20 bg-white/5 rounded-lg overflow-hidden flex items-center justify-center p-2 mb-1">
                                                {thumbPath ? (
                                                    <img
                                                        src={thumbPath}
                                                        alt={char.name}
                                                        className="w-full h-full object-contain"
                                                        crossOrigin="anonymous"
                                                    />
                                                ) : (
                                                    <UserCheck className="w-8 h-8 text-neutral-500" />
                                                )}
                                            </div>
                                            <span className="text-sm font-medium text-center text-neutral-300 group-hover:text-white line-clamp-2">
                                                {charName.split('_')[0]} {/* Clean up name typically formatted like Name_Timestamp */}
                                            </span>
                                        </div>
                                    )
                                })}
                            </div>

                            {characters.length === 0 && (
                                <div className="text-sm text-neutral-500 italic mt-4 text-center p-8 bg-black/20 rounded-lg">
                                    No characters found. Please upload a PSD file first.
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    <>
                        <div className="flex justify-between items-center mb-6">
                            <button
                                onClick={() => setSelectedCharacter(null)}
                                className="text-[#a4b0be] hover:text-white flex items-center gap-2 transition-colors font-semibold text-[0.9rem]"
                            >
                                <ChevronLeft className="w-5 h-5" /> Back to Characters
                            </button>
                            <span className="text-[#f5f6fa] font-bold px-3 py-1 bg-[#202438] rounded-md border border-white/5 truncate max-w-[200px]">
                                {selectedCharacter.name.split('_')[0]}
                            </span>
                        </div>

                        <div className="flex-1 overflow-y-auto pr-2">
                            <div className="flex flex-wrap gap-5 mb-5 w-full">
                                {selectedCharacter.group_order.map((groupName, idx) => {
                                    const assets = selectedCharacter.layer_groups[groupName];
                                    if (!assets || assets.length === 0) return null;

                                    // Z-index based on reverse group order (0 is lowest/farthest back)
                                    // In PSD, bottom layers are drawn first.
                                    // The group_order usually matches PSD folder order top-to-bottom.
                                    // Let's assign z-index starting from highest for top folders, lowest for bottom folders.
                                    const zIndex = selectedCharacter.group_order.length - idx;
                                    const selectedHash = selections[groupName]?.hash;

                                    return (
                                        <div key={groupName} className="flex-1 min-w-[200px] flex flex-col gap-2">
                                            <div className="block mb-[0.2rem]">
                                                <label className="block text-[0.85rem] font-semibold text-[#a4b0be]">
                                                    {groupName} <span className="float-right bg-[#6c5ce7] px-1.5 py-0.5 rounded text-[0.7rem] ml-1 text-white opacity-50">Z: {zIndex}</span>
                                                </label>
                                            </div>

                                            <div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-1.5 w-full">
                                                {assets.map(asset => {
                                                    const assetHash = asset.hash || asset.path; // Use path as fallback
                                                    const isSelected = selectedHash === assetHash;
                                                    const isVisible = assetVisibility[assetHash] !== false; // Default to true
                                                    
                                                    const toggleVisibility = (e: React.MouseEvent) => {
                                                        e.stopPropagation();
                                                        setAssetVisibility(prev => ({
                                                            ...prev,
                                                            [assetHash]: !isVisible
                                                        }));
                                                    };
                                                    
                                                    return (
                                                        <div
                                                            key={assetHash}
                                                            onClick={() => toggleSelection(groupName, zIndex, assetHash)}
                                                            className={`relative w-[80px] h-[80px] rounded-md border-[2px] cursor-pointer overflow-hidden transition-all group p-[2px] ${isSelected ? 'border-[#6c5ce7] shadow-[0_0_10px_rgba(108,92,231,0.8),inset_0_0_15px_rgba(108,92,231,0.5)]' : 'bg-black/40 border-transparent hover:border-[#5b4bc4] hover:-translate-y-0.5 hover:shadow-[0_4px_8px_rgba(0,0,0,0.3)]'
                                                                }`}
                                                            title={asset.name}
                                                        >
                                                            <img
                                                                src={`${STATIC_BASE}/${asset.path}`}
                                                                className={`w-full h-full object-contain ${!isVisible ? 'opacity-30' : ''}`}
                                                                crossOrigin="anonymous"
                                                                alt={asset.name}
                                                            />
                                                            {isSelected && (
                                                                <div
                                                                    className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                                                                    onClick={(e) => removeSelection(groupName, e)}
                                                                >
                                                                    <div className="w-[32px] h-[32px] rounded-full bg-[#ff7675]/90 text-white flex items-center justify-center hover:scale-110 transition-transform">
                                                                        <Trash2 className="w-3.5 h-3.5" />
                                                                    </div>
                                                                </div>
                                                            )}
                                                            {/* P3-6.1: Quick-Toggle Asset Visibility */}
                                                            <div className="absolute top-0 right-0 p-1 bg-black/50 rounded-bl-md">
                                                                <button
                                                                    onClick={toggleVisibility}
                                                                    className="text-white hover:text-indigo-400 transition-colors"
                                                                    title={`Toggle visibility (${isVisible ? 'Visible' : 'Hidden'})`}
                                                                >
                                                                    {isVisible ? (
                                                                        <Eye className="w-3 h-3" />
                                                                    ) : (
                                                                        <EyeOff className="w-3 h-3" />
                                                                    )}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Main Canvas Area */}
            <div className="w-1/3 min-w-[300px] shrink-0 bg-neutral-950 p-8 relative flex items-center justify-center overflow-hidden">
                {Object.keys(selections).length > 0 ? (
                    <div className="relative w-full h-full flex items-center justify-center">
                        {Object.values(selections)
                            .filter(sel => assetVisibility[sel.hash] !== false) // Only show visible assets
                            .sort((a, b) => a.z_index - b.z_index) // Sort by z_index ascending (draw from bottom up)
                            .map(sel => {
                                // find asset path
                                let path = "";
                                if (selectedCharacter) {
                                    for (const group of Object.values(selectedCharacter.layer_groups)) {
                                        const found = group.find(a => a.hash === sel.hash);
                                        if (found) {
                                            path = found.path;
                                            break;
                                        }
                                    }
                                }

                                return (
                                    <img
                                        key={sel.hash}
                                        src={`${STATIC_BASE}/${path}`}
                                        className="absolute w-full h-full object-contain pointer-events-none drop-shadow-sm"
                                        style={{ zIndex: sel.z_index }}
                                        alt="selected piece"
                                        crossOrigin="anonymous"
                                    />
                                );
                            })
                        }
                    </div>
                ) : (
                    <div className="text-center text-neutral-500 flex flex-col items-center gap-4">
                        <Layers className="w-16 h-16 opacity-30" />
                        <h2 className="text-xl font-semibold opacity-50">Dressing Room Empty</h2>
                        <p className="text-sm opacity-50">
                            {selectedCharacter ? "Select items from the sidebar to assemble the character." : "Select a character first."}
                        </p>
                    </div>
                )}
            </div>

            {showOrganizer && <Organizer onClose={() => setShowOrganizer(false)} />}
        </div>
    );
};

export default DressingRoomMode;
