import React, { useState, useEffect } from 'react';
import { useAppStore, API_BASE, STATIC_BASE, getAssetPath } from '../store/useAppStore';
import axios from 'axios';
import { Folder, FolderOpen, Plus, Trash, X } from 'lucide-react';

interface OrganizerProps {
    onClose: () => void;
}

const Organizer: React.FC<OrganizerProps> = ({ onClose }) => {
    const { characters, customLibrary, fetchCustomLibrary } = useAppStore();
    const [selectedBaseChar, setSelectedBaseChar] = useState<string>('');
    const [showAddCat, setShowAddCat] = useState(false);
    const [newCatName, setNewCatName] = useState('');
    const [newCatZ, setNewCatZ] = useState(0);

    // Fetch on mount to ensure fresh data
    useEffect(() => {
        fetchCustomLibrary();
    }, [fetchCustomLibrary]);

    const handleAddCategory = async () => {
        if (!newCatName.trim()) return;
        try {
            await axios.post(`${API_BASE}/library/category/`, { name: newCatName, z_index: newCatZ });
            setNewCatName('');
            setNewCatZ(0);
            setShowAddCat(false);
            fetchCustomLibrary();
        } catch (e) {
            console.error(e);
        }
    };

    const handleDeleteCategory = async (catId: string, catName: string) => {
        if (!confirm(`Delete category "${catName}" and all its subfolders?`)) return;
        try {
            await axios.delete(`${API_BASE}/library/category/${catId}`);
            fetchCustomLibrary();
        } catch (e) {
            console.error(e);
        }
    };

    const handleAddSubfolder = async (catId: string) => {
        const name = prompt("Enter subfolder name (e.g. Naruto, Eyes):");
        if (!name) return;
        try {
            await axios.post(`${API_BASE}/library/subfolder/`, { cat_id: catId, name });
            fetchCustomLibrary();
        } catch (e) {
            console.error(e);
        }
    };

    const handleDeleteSubfolder = async (catId: string, subName: string) => {
        if (!confirm(`Delete subfolder "${subName}"?`)) return;
        try {
            await axios.delete(`${API_BASE}/library/subfolder/${catId}/${encodeURIComponent(subName)}`);
            fetchCustomLibrary();
        } catch (e) {
            console.error(e);
        }
    };

    // Drag and Drop Logic
    const handleDragStart = (e: React.DragEvent, folderName: string, assets: any[]) => {
        e.dataTransfer.setData('application/json', JSON.stringify({
            type: 'folder',
            folderName,
            assets: assets.map(a => ({
                name: a.name,
                hash: a.hash || a.path.split('/').pop().replace('.png', '')
            }))
        }));
    };

    const handleDrop = async (e: React.DragEvent, catId: string, subName: string) => {
        e.preventDefault();
        e.currentTarget.classList.remove('ring-4', 'ring-indigo-500', 'bg-indigo-500/10');

        const dataStr = e.dataTransfer.getData('application/json');
        if (!dataStr) return;

        const data = JSON.parse(dataStr);

        if (data.type === 'folder') {
            try {
                // Sequential inserts
                for (const asset of data.assets) {
                    await axios.post(`${API_BASE}/library/asset/`, {
                        cat_id: catId,
                        sub_name: subName,
                        asset_name: asset.name,
                        asset_hash: asset.hash
                    });
                }
                fetchCustomLibrary();
            } catch (err) {
                console.error('Error assigning folder assets', err);
            }
        }
    };

    const activeChar = characters.find(c => c.id === selectedBaseChar || c.name === selectedBaseChar);

    return (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-8">
            <div className="bg-neutral-900 rounded-2xl w-full max-w-6xl h-full max-h-[90vh] flex flex-col overflow-hidden border border-neutral-700 shadow-2xl">

                {/* Header */}
                <div className="px-6 py-4 flex justify-between items-center bg-neutral-800 border-b border-neutral-700">
                    <h2 className="text-xl font-bold flex items-center gap-2"><Folder className="w-6 h-6 text-indigo-400" /> Library Organizer</h2>
                    <button onClick={onClose} className="p-2 hover:bg-neutral-700 rounded-full transition-colors">
                        <X className="w-5 h-5 text-neutral-400" />
                    </button>
                </div>

                <div className="flex-1 flex overflow-hidden">

                    {/* Left Panel: Base PSD Assets */}
                    <div className="w-1/3 border-r border-neutral-700 flex flex-col">
                        <div className="p-4 border-b border-neutral-700 font-semibold bg-neutral-800/50">Base Source Assets</div>
                        <div className="p-4 border-b border-neutral-700">
                            <select
                                className="w-full bg-neutral-800 border border-neutral-600 rounded p-2 text-sm outline-none"
                                value={selectedBaseChar}
                                onChange={e => setSelectedBaseChar(e.target.value)}
                            >
                                <option value="">Select Base Character...</option>
                                {characters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-3">
                            {activeChar && Object.entries(activeChar.layer_groups).map(([groupName, groupAssets]) => (
                                <div
                                    key={groupName}
                                    draggable
                                    onDragStart={e => handleDragStart(e, groupName, groupAssets)}
                                    className="bg-neutral-800 border border-neutral-600 rounded flex items-center p-3 cursor-grab opacity-90 hover:opacity-100 hover:border-indigo-400 transition break-all h-20 relative overflow-hidden group"
                                >
                                    {groupAssets.length > 0 && (
                                        <div
                                            className="absolute inset-0 opacity-20 bg-cover bg-center pointer-events-none"
                                            style={{ backgroundImage: `url(${STATIC_BASE}/${groupAssets[0].path})` }}
                                        />
                                    )}
                                    <span className="relative z-10 font-medium text-sm drop-shadow-md flex items-center gap-2">
                                        <FolderOpen className="w-4 h-4 text-amber-400" /> {groupName} ({groupAssets.length})
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Right Panel: Custom Taxonomy */}
                    <div className="flex-1 flex flex-col bg-neutral-950">
                        <div className="p-4 border-b border-neutral-700 flex justify-between items-center bg-neutral-800/50">
                            <span className="font-semibold text-lg">Custom Taxonomy structure</span>
                            <button
                                onClick={() => setShowAddCat(true)}
                                className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded text-sm flex items-center gap-2"
                            >
                                <Plus className="w-4 h-4" /> Add Category
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            {[...customLibrary.categories].sort((a, b) => b.z_index - a.z_index).map(cat => (
                                <div key={cat.id} className="bg-neutral-900 border border-neutral-700 rounded-lg overflow-hidden">
                                    {/* Category Header */}
                                    <div className="bg-neutral-800 px-4 py-3 flex justify-between items-center border-b border-neutral-700">
                                        <div className="flex items-center gap-3">
                                            <span className="bg-indigo-600 text-xs px-2 py-1 rounded font-mono">Z: {cat.z_index}</span>
                                            <strong className="text-lg">{cat.name}</strong>
                                        </div>
                                        <div>
                                            <button onClick={() => handleDeleteCategory(cat.id, cat.name)} className="text-red-400 hover:text-red-300 p-2"><Trash className="w-4 h-4" /></button>
                                        </div>
                                    </div>

                                    {/* Subfolders */}
                                    <div className="p-4 space-y-4">
                                        {cat.subfolders.map(sub => (
                                            <div key={sub.name} className="border border-neutral-700 rounded-lg bg-neutral-950/50">
                                                <div className="px-3 py-2 bg-neutral-900 flex justify-between items-center border-b border-neutral-700">
                                                    <span className="font-medium text-sm flex items-center gap-2"><FolderOpen className="w-4 h-4 text-emerald-400" /> {sub.name}</span>
                                                    <button onClick={() => handleDeleteSubfolder(cat.id, sub.name)} className="text-neutral-500 hover:text-red-400 p-1"><Trash className="w-3.5 h-3.5" /></button>
                                                </div>
                                                <div
                                                    className="p-3 min-h-24 flex flex-wrap gap-2 transition-colors"
                                                    onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('ring-4', 'ring-indigo-500', 'bg-indigo-500/10'); }}
                                                    onDragLeave={e => { e.currentTarget.classList.remove('ring-4', 'ring-indigo-500', 'bg-indigo-500/10'); }}
                                                    onDrop={e => handleDrop(e, cat.id, sub.name)}
                                                >
                                                    {sub.assets.map(asset => (
                                                        <div key={asset.hash} className="w-16 h-16 rounded border border-neutral-700 bg-neutral-800 overflow-hidden relative group" title={asset.name}>
                                                            <img src={`${STATIC_BASE}/${getAssetPath(characters, asset.hash)}`} alt={asset.name} className="w-full h-full object-cover" crossOrigin="anonymous" />
                                                        </div>
                                                    ))}
                                                    {sub.assets.length === 0 && <span className="text-xs text-neutral-600 w-full text-center mt-6">Drag folders here</span>}
                                                </div>
                                            </div>
                                        ))}

                                        <button
                                            onClick={() => handleAddSubfolder(cat.id)}
                                            className="text-sm text-indigo-400 hover:text-indigo-300 flex items-center gap-1 p-2"
                                        >
                                            <Plus className="w-4 h-4" /> Add Subfolder
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Add Category Modal */}
            {showAddCat && (
                <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center">
                    <div className="bg-neutral-800 p-6 rounded-xl shadow-xl w-96 border border-neutral-700">
                        <h3 className="text-lg font-bold mb-4">Add Category</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm mb-1 text-neutral-400">Name (e.g. Hair, Base)</label>
                                <input type="text" value={newCatName} onChange={e => setNewCatName(e.target.value)} className="w-full bg-neutral-900 border border-neutral-600 rounded p-2 text-neutral-100" />
                            </div>
                            <div>
                                <label className="block text-sm mb-1 text-neutral-400">Z-Index</label>
                                <input type="number" value={newCatZ} onChange={e => setNewCatZ(parseInt(e.target.value))} className="w-full bg-neutral-900 border border-neutral-600 rounded p-2 text-neutral-100" />
                            </div>
                        </div>
                        <div className="mt-6 flex justify-end gap-3">
                            <button onClick={() => setShowAddCat(false)} className="px-4 py-2 hover:bg-neutral-700 rounded text-sm text-neutral-300">Cancel</button>
                            <button onClick={handleAddCategory} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded text-sm text-white">Save</button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default Organizer;
