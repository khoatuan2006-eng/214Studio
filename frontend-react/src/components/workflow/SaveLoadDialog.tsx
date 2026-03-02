import React, { useState, useEffect } from 'react';
import { useWorkflowStore } from '@/store/useWorkflowStore';
import { X, Save, FolderOpen, Trash2, Clock, FileText, Pencil, Check } from 'lucide-react';

type DialogMode = 'save' | 'load';

interface SaveLoadDialogProps {
    mode: DialogMode;
    onClose: () => void;
}

const SaveLoadDialog: React.FC<SaveLoadDialogProps> = ({ mode, onClose }) => {
    const {
        savedWorkflows,
        loadSavedWorkflows,
        saveWorkflow,
        loadSavedWorkflow,
        deleteSavedWorkflow,
        renameSavedWorkflow,
        nodes,
    } = useWorkflowStore();

    const [saveName, setSaveName] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');

    useEffect(() => {
        loadSavedWorkflows();
    }, [loadSavedWorkflows]);

    const handleSave = () => {
        const name = saveName.trim();
        if (!name) return;
        saveWorkflow(name);
        setSaveName('');
        onClose();
    };

    const handleLoad = (id: string) => {
        loadSavedWorkflow(id);
        onClose();
    };

    const handleDelete = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (confirm('Delete this workflow?')) {
            deleteSavedWorkflow(id);
        }
    };

    const handleRename = (id: string) => {
        if (editName.trim()) {
            renameSavedWorkflow(id, editName.trim());
        }
        setEditingId(null);
    };

    const formatDate = (iso: string) => {
        const d = new Date(iso);
        return d.toLocaleDateString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-8">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div
                className="relative w-full max-w-lg max-h-[70vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden"
                style={{
                    background: 'linear-gradient(135deg, #0f0f1a 0%, #131320 100%)',
                    border: '1px solid rgba(99, 102, 241, 0.15)',
                }}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
                    <div className="flex items-center gap-2">
                        {mode === 'save' ? (
                            <Save className="w-5 h-5 text-indigo-400" />
                        ) : (
                            <FolderOpen className="w-5 h-5 text-emerald-400" />
                        )}
                        <h2 className="text-sm font-bold text-white">
                            {mode === 'save' ? 'Save Workflow' : 'Load Workflow'}
                        </h2>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5 text-neutral-500">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Save Input */}
                {mode === 'save' && (
                    <div className="px-5 py-4 border-b border-white/5">
                        <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-2">
                            Workflow Name
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={saveName}
                                onChange={(e) => setSaveName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                                placeholder="My Workflow..."
                                autoFocus
                                className="flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 outline-none focus:border-indigo-500/50 transition-colors"
                            />
                            <button
                                onClick={handleSave}
                                disabled={!saveName.trim() || nodes.length === 0}
                                className="px-4 py-2 rounded-lg text-xs font-bold bg-gradient-to-r from-indigo-600 to-purple-600 text-white
                  hover:from-indigo-500 hover:to-purple-500 disabled:opacity-30 disabled:cursor-not-allowed
                  shadow-lg shadow-indigo-500/20 transition-all active:scale-95"
                            >
                                Save
                            </button>
                        </div>
                        {nodes.length === 0 && (
                            <p className="text-[10px] text-amber-400/70 mt-1.5">Add some nodes before saving.</p>
                        )}
                    </div>
                )}

                {/* Workflow List */}
                <div className="flex-1 overflow-y-auto p-3">
                    {savedWorkflows.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-neutral-500">
                            <FileText className="w-10 h-10 mb-3 text-neutral-600" />
                            <p className="text-sm font-medium">No saved workflows</p>
                            <p className="text-xs text-neutral-600 mt-1">
                                {mode === 'save' ? 'Enter a name above to save' : 'Save a workflow first'}
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-1.5">
                            {savedWorkflows.map((wf) => (
                                <div
                                    key={wf.id}
                                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all ${mode === 'load'
                                        ? 'cursor-pointer hover:bg-indigo-500/5 hover:border-indigo-500/20 border-white/5'
                                        : 'border-white/5'
                                        }`}
                                    onClick={() => mode === 'load' && handleLoad(wf.id)}
                                >
                                    <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center flex-shrink-0">
                                        <FileText className="w-4 h-4 text-indigo-400" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        {editingId === wf.id ? (
                                            <div className="flex items-center gap-1">
                                                <input
                                                    type="text"
                                                    value={editName}
                                                    onChange={(e) => setEditName(e.target.value)}
                                                    onKeyDown={(e) => e.key === 'Enter' && handleRename(wf.id)}
                                                    className="bg-black/30 border border-indigo-500/30 rounded px-2 py-0.5 text-xs text-white outline-none flex-1"
                                                    autoFocus
                                                />
                                                <button
                                                    onClick={() => handleRename(wf.id)}
                                                    className="p-1 hover:bg-white/5 rounded text-emerald-400"
                                                >
                                                    <Check className="w-3 h-3" />
                                                </button>
                                            </div>
                                        ) : (
                                            <span className="text-xs font-semibold text-white truncate block">
                                                {wf.name}
                                            </span>
                                        )}
                                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-neutral-500">
                                            <Clock className="w-3 h-3" />
                                            <span>{formatDate(wf.updatedAt)}</span>
                                            <span>·</span>
                                            <span>{wf.nodes.length} nodes</span>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-0.5 flex-shrink-0">
                                        {mode === 'save' && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSaveName(wf.name);
                                                }}
                                                className="p-1.5 hover:bg-white/5 rounded text-neutral-500 hover:text-white text-[10px] font-mono"
                                                title="Overwrite this workflow"
                                            >
                                                Overwrite
                                            </button>
                                        )}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setEditingId(wf.id);
                                                setEditName(wf.name);
                                            }}
                                            className="p-1.5 hover:bg-white/5 rounded text-neutral-500 hover:text-white"
                                            title="Rename"
                                        >
                                            <Pencil className="w-3 h-3" />
                                        </button>
                                        <button
                                            onClick={(e) => handleDelete(wf.id, e)}
                                            className="p-1.5 hover:bg-red-500/10 rounded text-neutral-500 hover:text-red-400"
                                            title="Delete"
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SaveLoadDialog;
