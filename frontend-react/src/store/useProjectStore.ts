import { create } from 'zustand';
import axios from 'axios';
import { API_BASE } from '@/config/api';

export interface ProjectListItem {
    id: string;
    name: string;
    description: string;
    canvas_width: number;
    canvas_height: number;
    fps: number;
    created_at: string;
    updated_at: string;
}

export interface ProjectData {
    id: string;
    name: string;
    description: string;
    canvas_width: number;
    canvas_height: number;
    fps: number;
    data: Record<string, any>;
    created_at: string;
    updated_at: string;
}

interface ProjectState {
    // State
    projects: ProjectListItem[];
    currentProject: ProjectData | null;
    isDirty: boolean;
    lastSavedAt: string | null;
    isLoading: boolean;
    error: string | null;
    autoSaveInterval: ReturnType<typeof setInterval> | null;

    // Actions
    loadProjects: () => Promise<void>;
    createProject: (name?: string) => Promise<ProjectData>;
    loadProject: (id: string) => Promise<void>;
    saveProject: (data?: Record<string, any>) => Promise<void>;
    deleteProject: (id: string) => Promise<void>;
    updateProjectName: (name: string) => Promise<void>;
    markDirty: () => void;
    markClean: () => void;

    // Auto-save
    startAutoSave: (getData: () => Record<string, any>) => void;
    stopAutoSave: () => void;

    // Export / Import
    exportProject: () => Promise<void>;
    importProject: (file: File) => Promise<void>;
}

export const useProjectStore = create<ProjectState>()((set, get) => ({
    projects: [],
    currentProject: null,
    isDirty: false,
    lastSavedAt: null,
    isLoading: false,
    error: null,
    autoSaveInterval: null,

    loadProjects: async () => {
        set({ isLoading: true, error: null });
        try {
            const res = await axios.get(`${API_BASE}/projects/`);
            set({ projects: res.data, isLoading: false });
        } catch (error: any) {
            set({ error: error.message, isLoading: false });
        }
    },

    createProject: async (name = 'Untitled Project') => {
        set({ isLoading: true, error: null });
        try {
            const res = await axios.post(`${API_BASE}/projects/`, { name, data: {} });
            const project = res.data;
            set({
                currentProject: project,
                isDirty: false,
                lastSavedAt: project.updated_at,
                isLoading: false,
            });
            // Refresh project list
            get().loadProjects();
            return project;
        } catch (error: any) {
            set({ error: error.message, isLoading: false });
            throw error;
        }
    },

    loadProject: async (id: string) => {
        set({ isLoading: true, error: null });
        try {
            const res = await axios.get(`${API_BASE}/projects/${id}`);
            set({
                currentProject: res.data,
                isDirty: false,
                lastSavedAt: res.data.updated_at,
                isLoading: false,
            });
        } catch (error: any) {
            set({ error: error.message, isLoading: false });
        }
    },

    saveProject: async (data?: Record<string, any>) => {
        const { currentProject } = get();
        if (!currentProject) return;

        try {
            const body: Record<string, any> = {};
            if (data !== undefined) body.data = data;
            body.name = currentProject.name;

            const res = await axios.put(`${API_BASE}/projects/${currentProject.id}`, body);
            set({
                currentProject: res.data,
                isDirty: false,
                lastSavedAt: new Date().toISOString(),
            });
        } catch (error: any) {
            console.error('Failed to save project:', error);
            set({ error: error.message });
        }
    },

    deleteProject: async (id: string) => {
        try {
            await axios.delete(`${API_BASE}/projects/${id}`);
            const { currentProject } = get();
            if (currentProject?.id === id) {
                set({ currentProject: null, isDirty: false });
            }
            get().loadProjects();
        } catch (error: any) {
            set({ error: error.message });
        }
    },

    updateProjectName: async (name: string) => {
        const { currentProject } = get();
        if (!currentProject) return;

        try {
            const res = await axios.put(`${API_BASE}/projects/${currentProject.id}`, { name });
            set({ currentProject: res.data });
            get().loadProjects();
        } catch (error: any) {
            set({ error: error.message });
        }
    },

    markDirty: () => set({ isDirty: true }),
    markClean: () => set({ isDirty: false }),

    startAutoSave: (getData) => {
        const { autoSaveInterval } = get();
        if (autoSaveInterval) clearInterval(autoSaveInterval);

        const interval = setInterval(async () => {
            const { currentProject, isDirty } = get();
            if (!currentProject || !isDirty) return;

            try {
                const data = getData();
                // Use the autosave endpoint (saves to .autosave/ directory)
                await axios.post(`${API_BASE}/projects/${currentProject.id}/autosave`, { data });
                console.log('[AutoSave] Draft saved');
            } catch (error) {
                console.error('[AutoSave] Failed:', error);
            }
        }, 30000); // Every 30 seconds

        set({ autoSaveInterval: interval });
    },

    stopAutoSave: () => {
        const { autoSaveInterval } = get();
        if (autoSaveInterval) {
            clearInterval(autoSaveInterval);
            set({ autoSaveInterval: null });
        }
    },

    exportProject: async () => {
        const { currentProject } = get();
        if (!currentProject) return;

        try {
            const res = await axios.get(
                `${API_BASE}/projects/${currentProject.id}/export`,
                { responseType: 'blob' }
            );
            // Trigger download
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `${currentProject.name}.animestudio`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (error: any) {
            set({ error: error.message });
        }
    },

    importProject: async (file: File) => {
        set({ isLoading: true, error: null });
        try {
            const formData = new FormData();
            formData.append('file', file);
            const res = await axios.post(`${API_BASE}/projects/import`, formData);
            set({
                currentProject: res.data,
                isDirty: false,
                isLoading: false,
            });
            get().loadProjects();
        } catch (error: any) {
            set({ error: error.message, isLoading: false });
        }
    },
}));
