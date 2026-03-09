import { useEffect, useRef, useState } from 'react';
import {
    FolderOpen,
    Plus,
    Trash2,
    Download,
    Upload,
    Save,
    Clock,
    X,
    FileArchive,
    RotateCcw,
} from 'lucide-react';
import { useProjectStore, type ProjectListItem } from '../stores/useProjectStore';
import { useAppStore } from '../stores/useAppStore';

interface ProjectManagerProps {
    onProjectLoaded?: () => void;
}

export default function ProjectManager({ onProjectLoaded }: ProjectManagerProps) {
    const {
        projects,
        currentProject,
        isDirty,
        lastSavedAt,
        isLoading,
        loadProjects,
        createProject,
        loadProject,
        saveProject,
        saveProjectWithScenes, // P3-HOTFIX
        deleteProject,
        exportProject,
        importProject,
        checkAutosave,
        restoreAutosave,
    } = useProjectStore();

    const [showProjectList, setShowProjectList] = useState(!currentProject);
    const [newProjectName, setNewProjectName] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    // P1-1.3: Auto-save recovery state
    const [autosaveInfo, setAutosaveInfo] = useState<{ projectId: string; savedAt: string } | null>(null);
    const [showRecoveryModal, setShowRecoveryModal] = useState(false);

    useEffect(() => {
        loadProjects();
    }, []);

    const handleCreate = async () => {
        const name = newProjectName.trim() || 'Untitled Project';
        await createProject(name);
        setNewProjectName('');
        setShowProjectList(false);
        onProjectLoaded?.();
    };

    const handleOpen = async (project: ProjectListItem) => {
        await loadProject(project.id);
        // P1-1.3: Check for autosave draft after loading
        const draft = await checkAutosave(project.id);
        if (draft.found && draft.savedAt) {
            setAutosaveInfo({ projectId: project.id, savedAt: draft.savedAt });
            setShowRecoveryModal(true);
        }
        setShowProjectList(false);
        onProjectLoaded?.();
    };

    const handleDelete = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (confirm('Are you sure you want to delete this project?')) {
            await deleteProject(id);
        }
    };

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        await importProject(file);
        setShowProjectList(false);
        onProjectLoaded?.();
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    // P1-1.3: Auto-save Recovery Modal
    const RecoveryModal = () => (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-neutral-800 border border-amber-500/40 rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4">
                <div className="flex items-center gap-2 mb-3">
                    <RotateCcw className="w-5 h-5 text-amber-400" />
                    <h3 className="text-white font-semibold">Unsaved Draft Found</h3>
                </div>
                <p className="text-sm text-neutral-300 mb-1">
                    An auto-saved draft was found for this project.
                </p>
                {autosaveInfo && (
                    <p className="text-xs text-amber-400 mb-4">
                        Saved at: {formatDate(autosaveInfo.savedAt)}
                    </p>
                )}
                <p className="text-xs text-neutral-400 mb-5">
                    Would you like to restore the unsaved draft, or continue with the last saved version?
                </p>
                <div className="flex gap-2">
                    <button
                        onClick={async () => {
                            if (autosaveInfo) await restoreAutosave(autosaveInfo.projectId);
                            setShowRecoveryModal(false);
                            setAutosaveInfo(null);
                        }}
                        className="flex-1 px-3 py-2 bg-amber-600 hover:bg-amber-500 text-white text-sm rounded-lg transition-colors"
                    >
                        Restore Draft
                    </button>
                    <button
                        onClick={() => { setShowRecoveryModal(false); setAutosaveInfo(null); }}
                        className="flex-1 px-3 py-2 bg-neutral-700 hover:bg-neutral-600 text-neutral-200 text-sm rounded-lg transition-colors"
                    >
                        Use Saved Version
                    </button>
                </div>
            </div>
        </div>
    );

    // --- Header bar (always visible when a project is loaded) ---
    if (currentProject && !showProjectList) {
        return (
            <>
                {showRecoveryModal && <RecoveryModal />}
                <div className="flex items-center gap-3 px-4 py-2 glass-panel" style={{ borderBottom: '1px solid var(--glass-border)' }}>
                    <button
                        onClick={() => setShowProjectList(true)}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all duration-200 group"
                        style={{ background: 'var(--surface-overlay)', border: '1px solid var(--border-subtle)' }}
                        title="Open Projects"
                    >
                        <FolderOpen className="w-3.5 h-3.5" style={{ color: 'var(--accent-400)' }} />
                        <span className="max-w-[140px] truncate text-xs font-medium text-neutral-200 group-hover:text-white transition-colors">
                            {currentProject.name}
                        </span>
                    </button>

                    <button
                        onClick={() => saveProjectWithScenes(
                            useAppStore.getState().editorData,
                            useAppStore.getState().scenes,
                            useAppStore.getState().activeSceneId
                        )}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${isDirty
                            ? 'btn-accent'
                            : ''
                            }`}
                        style={!isDirty ? { background: 'var(--surface-overlay)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' } : {}}
                        title={isDirty ? 'Unsaved changes — Click to save' : 'All changes saved'}
                    >
                        {/* Animated save indicator dot */}
                        <div className={`w-2 h-2 rounded-full ${isDirty ? 'animate-dot-pulse' : ''}`}
                            style={{ background: isDirty ? 'var(--warning)' : 'var(--success)', boxShadow: isDirty ? '0 0 6px rgba(245,158,11,0.5)' : '0 0 6px rgba(34,197,94,0.4)' }} />
                        <Save className="w-3.5 h-3.5" />
                        <span>{isDirty ? 'Save' : 'Saved'}</span>
                    </button>

                    <button
                        onClick={() => exportProject()}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs btn-ghost"
                        title="Export .animestudio"
                    >
                        <Download className="w-3.5 h-3.5" />
                        <span>Export</span>
                    </button>

                    {lastSavedAt && (
                        <span className="ml-auto text-xs flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                            <Clock className="w-3 h-3" />
                            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '10px' }}>{formatDate(lastSavedAt)}</span>
                        </span>
                    )}
                </div>
            </>
        );
    }

    // --- Full project list panel ---
    return (
        <div className="absolute inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
            <div className="rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden animate-fade-scale-in"
                style={{ background: 'var(--surface-raised)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-elevated)' }}>
                {/* Header with gradient accent */}
                <div className="relative">
                    <div className="absolute top-0 left-0 right-0 h-[2px]"
                        style={{ background: 'linear-gradient(90deg, var(--accent-600), var(--accent-400), #a78bfa, var(--accent-600))' }} />
                    <div className="flex items-center justify-between px-6 py-4"
                        style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <div className="flex items-center gap-2.5">
                            <FileArchive className="w-5 h-5" style={{ color: 'var(--accent-400)' }} />
                            <h2 className="text-lg font-semibold gradient-text">Projects</h2>
                        </div>
                        {currentProject && (
                            <button
                                onClick={() => setShowProjectList(false)}
                                className="p-1.5 rounded-lg btn-ghost"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Create new */}
                <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={newProjectName}
                            onChange={(e) => setNewProjectName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                            placeholder="New project name..."
                            className="flex-1 px-3 py-2.5 rounded-xl text-sm input-premium"
                        />
                        <button
                            onClick={handleCreate}
                            disabled={isLoading}
                            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm btn-accent disabled:opacity-50"
                        >
                            <Plus className="w-4 h-4" />
                            Create
                        </button>
                    </div>

                    {/* Import */}
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-1.5 mt-3 px-3 py-1.5 text-xs btn-ghost rounded-lg"
                    >
                        <Upload className="w-3.5 h-3.5" />
                        Import .animestudio file
                    </button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".animestudio"
                        onChange={handleImport}
                        className="hidden"
                    />
                </div>

                {/* Project list */}
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
                    {isLoading && (
                        <div className="flex items-center justify-center py-8">
                            <div className="w-6 h-6 rounded-full animate-spin-smooth" style={{ border: '2px solid var(--border-default)', borderTopColor: 'var(--accent-400)' }} />
                        </div>
                    )}
                    {!isLoading && projects.length === 0 && (
                        <div className="text-center py-10">
                            <FileArchive className="w-12 h-12 mx-auto mb-3 opacity-20" />
                            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                                No projects yet. Create one to get started!
                            </p>
                        </div>
                    )}
                    {projects.map((project) => (
                        <button
                            key={project.id}
                            onClick={() => handleOpen(project)}
                            className={`w-full text-left px-4 py-3 rounded-xl transition-all duration-200 group surface-card ${currentProject?.id === project.id
                                ? 'glow-ring'
                                : ''
                                }`}
                        >
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-white truncate">
                                    {project.name}
                                </span>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <span
                                        onClick={(e) => handleDelete(project.id, e)}
                                        className="p-1.5 rounded-lg btn-ghost hover:!text-red-400"
                                        title="Delete"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </span>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 mt-1.5 text-xs" style={{ color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', fontSize: '10px' }}>
                                <span>{project.canvas_width}×{project.canvas_height}</span>
                                <span>{project.fps}fps</span>
                                {project.updated_at && (
                                    <span className="ml-auto">{formatDate(project.updated_at)}</span>
                                )}
                            </div>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
