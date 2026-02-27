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
} from 'lucide-react';
import { useProjectStore, type ProjectListItem } from '../store/useProjectStore';

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
        deleteProject,
        exportProject,
        importProject,
    } = useProjectStore();

    const [showProjectList, setShowProjectList] = useState(!currentProject);
    const [newProjectName, setNewProjectName] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

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

    // --- Header bar (always visible when a project is loaded) ---
    if (currentProject && !showProjectList) {
        return (
            <div className="flex items-center gap-3 px-4 py-2 bg-neutral-800/70 border-b border-neutral-700/50 text-xs">
                <button
                    onClick={() => setShowProjectList(true)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-neutral-700/60 hover:bg-neutral-600 text-neutral-200 transition-colors"
                    title="Open Projects"
                >
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span className="max-w-[120px] truncate">{currentProject.name}</span>
                </button>

                <button
                    onClick={() => saveProject()}
                    className={`flex items-center gap-1 px-2 py-1.5 rounded-md transition-colors ${isDirty
                            ? 'bg-amber-600/80 hover:bg-amber-500 text-white'
                            : 'bg-neutral-700/40 text-neutral-400 hover:bg-neutral-600 hover:text-neutral-200'
                        }`}
                    title={isDirty ? 'Unsaved changes — Click to save' : 'All changes saved'}
                >
                    <Save className="w-3.5 h-3.5" />
                    <span>{isDirty ? 'Save' : 'Saved'}</span>
                </button>

                <button
                    onClick={() => exportProject()}
                    className="flex items-center gap-1 px-2 py-1.5 rounded-md bg-neutral-700/40 text-neutral-400 hover:bg-neutral-600 hover:text-neutral-200 transition-colors"
                    title="Export .animestudio"
                >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export</span>
                </button>

                {lastSavedAt && (
                    <span className="ml-auto text-neutral-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDate(lastSavedAt)}
                    </span>
                )}
            </div>
        );
    }

    // --- Full project list panel ---
    return (
        <div className="absolute inset-0 z-50 bg-neutral-900/95 backdrop-blur-sm flex items-center justify-center">
            <div className="bg-neutral-800 rounded-xl border border-neutral-700 shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-700">
                    <div className="flex items-center gap-2">
                        <FileArchive className="w-5 h-5 text-indigo-400" />
                        <h2 className="text-lg font-semibold text-white">Projects</h2>
                    </div>
                    {currentProject && (
                        <button
                            onClick={() => setShowProjectList(false)}
                            className="p-1 rounded-md hover:bg-neutral-700 text-neutral-400"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>

                {/* Create new */}
                <div className="px-6 py-4 border-b border-neutral-700/50">
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={newProjectName}
                            onChange={(e) => setNewProjectName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                            placeholder="New project name..."
                            className="flex-1 px-3 py-2 bg-neutral-700 rounded-lg text-sm text-white placeholder:text-neutral-500 border border-neutral-600 focus:border-indigo-500 focus:outline-none"
                        />
                        <button
                            onClick={handleCreate}
                            disabled={isLoading}
                            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
                        >
                            <Plus className="w-4 h-4" />
                            Create
                        </button>
                    </div>

                    {/* Import */}
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-1.5 mt-2 px-3 py-1.5 text-xs text-neutral-400 hover:text-white hover:bg-neutral-700 rounded-md transition-colors"
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
                        <p className="text-sm text-neutral-500 text-center py-4">Loading...</p>
                    )}
                    {!isLoading && projects.length === 0 && (
                        <p className="text-sm text-neutral-500 text-center py-8">
                            No projects yet. Create one to get started!
                        </p>
                    )}
                    {projects.map((project) => (
                        <button
                            key={project.id}
                            onClick={() => handleOpen(project)}
                            className={`w-full text-left px-4 py-3 rounded-lg border transition-colors group ${currentProject?.id === project.id
                                    ? 'bg-indigo-600/20 border-indigo-600/40'
                                    : 'bg-neutral-700/30 border-neutral-700/50 hover:bg-neutral-700/60'
                                }`}
                        >
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-white truncate">
                                    {project.name}
                                </span>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <span
                                        onClick={(e) => handleDelete(project.id, e)}
                                        className="p-1 rounded hover:bg-red-600/30 text-neutral-500 hover:text-red-400"
                                        title="Delete"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </span>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-xs text-neutral-500">
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
