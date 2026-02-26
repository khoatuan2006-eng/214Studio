import React, { useEffect, useState } from 'react';
import { useAppStore, STATIC_BASE, getAssetPath } from '../store/useAppStore';
import Organizer from './Organizer';
import { Layers, ChevronLeft, Trash2, Folder } from 'lucide-react';

const DressingRoomMode: React.FC = () => {
    const { characters, customLibrary, fetchCustomLibrary } = useAppStore();
    const [showOrganizer, setShowOrganizer] = useState(false);

    useEffect(() => {
        fetchCustomLibrary();
    }, [fetchCustomLibrary]);

    // State: selected asset hashes per category. Record<categoryId, string (hash)>
    const [selections, setSelections] = useState<Record<string, { hash: string, z_index: number }>>({});

    // State: open subfolder per category. Record<categoryId, string (subfolder name) | null>
    const [openSubfolders, setOpenSubfolders] = useState<Record<string, string | null>>({});

    const toggleSelection = (catId: string, zIndex: number, hash: string) => {
        setSelections(prev => {
            const next = { ...prev };
            if (next[catId]?.hash === hash) {
                delete next[catId]; // Deselect if click again
            } else {
                next[catId] = { hash, z_index: zIndex };
            }
            return next;
        });
    };

    const removeSelection = (catId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setSelections(prev => {
            const next = { ...prev };
            delete next[catId];
            return next;
        });
    };

    const sortedCategories = [...customLibrary.categories].sort((a, b) => b.z_index - a.z_index);

    // Group categories by z_index
    const zGroups = sortedCategories.reduce((acc, cat) => {
        if (!acc[cat.z_index]) acc[cat.z_index] = [];
        acc[cat.z_index].push(cat);
        return acc;
    }, {} as Record<number, typeof sortedCategories>);

    // Get sorted z_indices (descending)
    const sortedZIndices = Object.keys(zGroups).map(Number).sort((a, b) => b - a);

    return (
        <div className="flex h-full w-full bg-neutral-900">

            {/* Sidebar Controls */}
            <div className="flex-[2] min-w-[500px] bg-neutral-900 border-r border-neutral-700 p-6 flex flex-col overflow-hidden">

                <button
                    onClick={() => setShowOrganizer(true)}
                    className="w-full bg-[#1a1d2d] hover:bg-[#202438] text-[#a4b0be] border border-white/10 py-2.5 rounded-lg flex justify-center items-center gap-2 mb-6 transition-colors shadow-sm font-semibold text-[0.9rem]"
                >
                    <Layers className="w-4 h-4" /> Library Organizer
                </button>

                <div className="flex-1 overflow-y-auto pr-2">
                    {sortedZIndices.map((zIndex) => {
                        const groupCats = zGroups[zIndex];

                        return (
                            <div key={`zgroup-${zIndex}`} className="flex flex-wrap gap-5 mb-5 w-full">
                                {groupCats.map(cat => {
                                    const activeSubName = openSubfolders[cat.id];
                                    const activeSub = cat.subfolders.find(s => s.name === activeSubName);
                                    const selectedHash = selections[cat.id]?.hash;

                                    return (
                                        <div key={cat.id} className="flex-1 min-w-[200px] flex flex-col gap-2">
                                            <div className="block mb-[0.2rem]">
                                                <label className="block text-[0.85rem] font-semibold text-[#a4b0be]">
                                                    {cat.name} <span className="float-right bg-[#6c5ce7] px-1.5 py-0.5 rounded text-[0.7rem] ml-1 text-white">Z: {cat.z_index}</span>
                                                </label>
                                            </div>

                                            {activeSub ? (
                                                // Rendering Open Subfolder Assets
                                                <div className="flex flex-col gap-2">
                                                    <button
                                                        onClick={() => setOpenSubfolders(prev => ({ ...prev, [cat.id]: null }))}
                                                        className="flex items-center gap-2 text-sm text-[#f5f6fa] font-bold mb-2 hover:opacity-80 w-fit cursor-pointer"
                                                    >
                                                        <ChevronLeft className="w-4 h-4" /> {activeSub.name}
                                                    </button>

                                                    <div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-1.5 w-full">
                                                        {activeSub.assets.map(asset => {
                                                            const isSelected = selectedHash === asset.hash;
                                                            return (
                                                                <div
                                                                    key={asset.hash}
                                                                    onClick={() => toggleSelection(cat.id, cat.z_index, asset.hash)}
                                                                    className={`relative w-[80px] h-[80px] rounded-md border-[2px] cursor-pointer overflow-hidden transition-all group p-[2px] ${isSelected ? 'border-[#6c5ce7] shadow-[0_0_10px_rgba(108,92,231,0.8),inset_0_0_15px_rgba(108,92,231,0.5)]' : 'bg-black/40 border-transparent hover:border-[#5b4bc4] hover:-translate-y-0.5 hover:shadow-[0_4px_8px_rgba(0,0,0,0.3)]'
                                                                        }`}
                                                                    title={asset.name}
                                                                >
                                                                    <img
                                                                        src={`${STATIC_BASE}/${getAssetPath(characters, asset.hash)}`}
                                                                        className="w-full h-full object-contain"
                                                                        crossOrigin="anonymous"
                                                                        alt={asset.name}
                                                                    />
                                                                    {isSelected && (
                                                                        <div
                                                                            className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                                                                            onClick={(e) => removeSelection(cat.id, e)}
                                                                        >
                                                                            <div className="w-[32px] h-[32px] rounded-full bg-[#ff7675]/90 text-white flex items-center justify-center hover:scale-110 transition-transform">
                                                                                <Trash2 className="w-3.5 h-3.5" />
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            ) : (
                                                // Rendering Folder Grid
                                                <div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-1.5 w-full">
                                                    {cat.subfolders.map(sub => {
                                                        if (sub.assets.length === 0) return null;
                                                        const hasSelectedAssetInFolder = sub.assets.some(a => a.hash === selectedHash);
                                                        return (
                                                            <div
                                                                key={sub.name}
                                                                onClick={() => setOpenSubfolders(prev => ({ ...prev, [cat.id]: sub.name }))}
                                                                className={`relative w-[80px] h-[80px] rounded-md border-[2px] cursor-pointer overflow-hidden transition-all bg-black/40 flex items-center justify-center group ${hasSelectedAssetInFolder ? 'border-[#6c5ce7] shadow-[0_0_10px_rgba(108,92,231,0.8),inset_0_0_15px_rgba(108,92,231,0.5)]' : 'border-transparent hover:border-[#5b4bc4] hover:-translate-y-0.5 hover:shadow-[0_4px_8px_rgba(0,0,0,0.3)]'
                                                                    }`}
                                                                title={sub.name}
                                                            >
                                                                <img
                                                                    src={`${STATIC_BASE}/${getAssetPath(characters, sub.assets[0].hash)}`}
                                                                    className="w-full h-full object-contain p-[2px]"
                                                                    crossOrigin="anonymous"
                                                                    alt={sub.name}
                                                                />
                                                                <div className="absolute bottom-0.5 right-0.5 bg-black/70 rounded p-0.5">
                                                                    <Folder className="w-2.5 h-2.5 text-white fill-white" />
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })}

                    {sortedCategories.length === 0 && (
                        <div className="text-sm text-neutral-500 italic mt-4">
                            No categories configured. Open the Organizer to set up your library.
                        </div>
                    )}
                </div>
            </div>

            {/* Main Canvas Area */}
            <div className="w-1/3 min-w-[300px] shrink-0 bg-neutral-950 p-8 relative flex items-center justify-center overflow-hidden">
                {Object.keys(selections).length > 0 ? (
                    <div className="relative w-full h-full flex items-center justify-center">
                        {Object.values(selections)
                            .sort((a, b) => a.z_index - b.z_index) // Sort by z_index ascending (draw from bottom up)
                            .map(sel => (
                                <img
                                    key={sel.hash}
                                    src={`${STATIC_BASE}/${getAssetPath(characters, sel.hash)}`}
                                    className="absolute w-full h-full object-contain pointer-events-none drop-shadow-sm"
                                    style={{ zIndex: sel.z_index }}
                                    alt={sel.hash}
                                    crossOrigin="anonymous"
                                />
                            ))
                        }
                    </div>
                ) : (
                    <div className="text-center text-neutral-500 flex flex-col items-center gap-4">
                        <Layers className="w-16 h-16 opacity-30" />
                        <h2 className="text-xl font-semibold opacity-50">Dressing Room Empty</h2>
                        <p className="text-sm opacity-50">Select items from the sidebar to start dressing your character.</p>
                    </div>
                )}
            </div>

            {showOrganizer && <Organizer onClose={() => setShowOrganizer(false)} />}
        </div>
    );
};

export default DressingRoomMode;
