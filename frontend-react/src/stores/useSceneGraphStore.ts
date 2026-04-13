/**
 * useSceneGraphStore — Zustand store for Scene Graph (Video DOM) state.
 *
 * Wraps SceneGraphManager and provides React-friendly reactive state.
 * This store powers the "Scene Graph Mode" in StudioMode, as an alternative
 * to the legacy layer-based useStudioStore.
 *
 * Responsibilities:
 * 1. Hold SceneGraphManager instance + current playback time
 * 2. Fetch available characters from backend AssetRegistry API
 * 3. Add/remove characters to scene → SceneGraph nodes
 * 4. Interactive pose/face changes (instant swap)
 * 5. Playback tick → re-evaluate snapshot → trigger PixiJS re-render
 */

import { create } from 'zustand';
import { SceneGraphManager } from '@/core/scene-graph/SceneGraphManager';
import type {
    AnyNodeData,
    CharacterNodeData,
    NodeSnapshot,
    SceneSnapshot,
    Keyframe,
} from '@/core/scene-graph/types';
import { API_BASE_URL } from '@/config/api';

// ══════════════════════════════════════════════
//  Character Info from Backend AssetRegistry
// ══════════════════════════════════════════════

/** Summary info from GET /api/scene-graph/characters */
export interface CharacterSummary {
    id: string;
    name: string;
    poses: number;
    faces: number;
    total: number;
    default_pose: string | null;
    default_face: string | null;
}

/** Full character data from GET /api/scene-graph/characters/:id */
export interface CharacterFull {
    id: string;
    name: string;
    folder: string;
    poses: Record<string, { filename: string; url: string }>;
    faces: Record<string, { filename: string; url: string }>;
    faces_dot_eye: Record<string, { filename: string; url: string }>;
    total_assets: number;
    default_pose: string | null;
    default_face: string | null;
}

// ══════════════════════════════════════════════
//  Store Interface
// ══════════════════════════════════════════════

interface SceneGraphStore {
    // Core state
    manager: SceneGraphManager;
    snapshot: SceneSnapshot;
    currentTime: number;
    duration: number;
    isPlaying: boolean;

    // AI Chat state
    chatHistory: { role: 'user'|'ai'; text: string; sceneData?: any }[];
    isAILoading: boolean;

    // Character registry (from backend)
    characters: CharacterSummary[];
    characterCache: Record<string, CharacterFull>; // id → full data

    // Scene nodes in scene (quick access)
    sceneNodeIds: string[];

    // Actions — Character registry
    fetchCharacters: () => Promise<void>;
    fetchCharacterFull: (charId: string) => Promise<CharacterFull | null>;

    // Actions — AI Chat
    sendAIChatMessage: (prompt: string) => Promise<void>;
    applySceneData: (sceneData: any) => void;

    // Actions — Scene manipulation
    addCharacterToScene: (charId: string, config?: {
        x?: number; y?: number; scale?: number; name?: string;
    }) => Promise<string | null>;
    removeFromScene: (nodeId: string) => void;

    // Actions — Pose/Face
    setPose: (nodeId: string, poseName: string) => void;
    setFace: (nodeId: string, faceName: string) => void;

    // Actions — Keyframes
    addKeyframe: (nodeId: string, property: string, kf: Keyframe) => void;

    // Actions — Playback
    setTime: (time: number) => void;
    play: () => void;
    pause: () => void;
    togglePlay: () => void;
    tick: (dt: number) => void;

    // Actions — Evaluate
    evaluate: () => void;
}

// ══════════════════════════════════════════════
//  Store Implementation
// ══════════════════════════════════════════════

const initialManager = new SceneGraphManager();

export const useSceneGraphStore = create<SceneGraphStore>((set, get) => ({
    manager: initialManager,
    snapshot: {},
    currentTime: 0,
    duration: 10,
    isPlaying: false,

    chatHistory: [],
    isAILoading: false,

    characters: [],
    characterCache: {},
    sceneNodeIds: [],

    // ── Fetch characters from backend ──

    fetchCharacters: async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/scene-graph/characters`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data: CharacterSummary[] = await res.json();
            set({ characters: data });
        } catch (err) {
            console.error('[SceneGraph] Failed to fetch characters:', err);
        }
    },

    fetchCharacterFull: async (charId: string) => {
        const { characterCache } = get();
        if (characterCache[charId]) return characterCache[charId];

        try {
            const res = await fetch(`${API_BASE_URL}/api/scene-graph/characters/${charId}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data: CharacterFull = await res.json();
            set(s => ({
                characterCache: { ...s.characterCache, [charId]: data }
            }));
            return data;
        } catch (err) {
            console.error(`[SceneGraph] Failed to fetch character ${charId}:`, err);
            return null;
        }
    },

    // ── AI Chat ──

    sendAIChatMessage: async (prompt: string) => {
        set((s) => ({
            chatHistory: [...s.chatHistory, { role: 'user', text: prompt }],
            isAILoading: true,
        }));

        try {
            // Get current scene state
            const { manager } = get();
            const currentScene = manager.toBackendDict();

            const res = await fetch(`${API_BASE_URL}/api/scene-graph/ai/direct`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt, current_scene: currentScene }),
            });

            if (!res.ok) {
                // Try to extract detail from FastAPI error response
                let detail = `HTTP ${res.status}`;
                try {
                    const errBody = await res.json();
                    if (errBody.detail) detail = errBody.detail;
                } catch { /* ignore parse errors */ }
                throw new Error(detail);
            }
            const data = await res.json();

            if (data.success && data.scene) {
                // Apply the new scene data
                get().applySceneData(data.scene);
                
                set((s) => ({
                    chatHistory: [
                        ...s.chatHistory,
                        { role: 'ai', text: data.message || 'Scene updated.', sceneData: data.scene },
                    ],
                    isAILoading: false,
                }));
            } else {
                throw new Error(data.message || 'Unknown error');
            }
        } catch (err: any) {
            console.error('[SceneGraph] AI Chat failed:', err);
            set((s) => ({
                chatHistory: [...s.chatHistory, { role: 'ai', text: `Error: ${err.message}` }],
                isAILoading: false,
            }));
        }
    },

    applySceneData: (sceneData: any) => {
        const { manager } = get();
        manager.loadFromBackendResponse(sceneData);
        // Extract root_order (ids) or just get all node IDs
        const newIds = Object.keys(manager.graph.nodes);
        set({ sceneNodeIds: newIds });
        get().evaluate();
    },

    // ── Add character to Scene Graph ──

    addCharacterToScene: async (charId, config) => {
        const charData = await get().fetchCharacterFull(charId);
        if (!charData) return null;

        const { manager, sceneNodeIds } = get();
        const nodeId = `char-${charId}-${Date.now().toString(36)}`;

        const poseNames = Object.keys(charData.poses);
        const faceNames = Object.keys(charData.faces);

        const defaultPose = charData.default_pose || poseNames[0] || '';
        const defaultFace = charData.default_face || faceNames[0] || '';

        // Build CharacterNodeData
        const node: CharacterNodeData = {
            id: nodeId,
            name: config?.name || charData.name.split('_')[0],
            nodeType: 'character',
            transform: {
                x: config?.x ?? 9.6, // World center X
                y: config?.y ?? 7.5, // Lower third
                scaleX: config?.scale ?? 0.25,
                scaleY: config?.scale ?? 0.25,
                rotation: 0,
            },
            opacity: 1,
            zIndex: sceneNodeIds.length + 1,
            visible: true,
            parentId: null,
            children: [],
            keyframes: {},
            metadata: {
                charId: charData.id,
                poseUrl: charData.poses[defaultPose]?.url || '',
                faceUrl: charData.faces[defaultFace]?.url || '',
                // Store all available URLs for renderer to look up
                poseUrls: charData.poses,
                faceUrls: charData.faces,
            },
            characterId: charData.id,
            activeLayers: {
                pose: defaultPose,
                face: defaultFace,
            },
            availableLayers: {
                pose: poseNames,
                face: faceNames,
            },
            frameSequence: [],
        };

        manager.addNode(node);
        set(s => ({
            sceneNodeIds: [...s.sceneNodeIds, nodeId],
        }));
        get().evaluate();

        return nodeId;
    },

    removeFromScene: (nodeId) => {
        const { manager } = get();
        manager.removeNode(nodeId);
        set(s => ({
            sceneNodeIds: s.sceneNodeIds.filter(id => id !== nodeId),
        }));
        get().evaluate();
    },

    // ── Pose/Face swap (instant) ──

    setPose: (nodeId, poseName) => {
        const { manager } = get();
        const node = manager.getNode(nodeId) as CharacterNodeData | undefined;
        if (!node || node.nodeType !== 'character') return;

        const poseUrls = node.metadata?.poseUrls as Record<string, { url: string }> | undefined;
        manager.updateNode(nodeId, {
            activeLayers: { ...node.activeLayers, pose: poseName },
            metadata: {
                ...node.metadata,
                poseUrl: poseUrls?.[poseName]?.url || '',
            },
        } as Partial<AnyNodeData>);
        get().evaluate();
    },

    setFace: (nodeId, faceName) => {
        const { manager } = get();
        const node = manager.getNode(nodeId) as CharacterNodeData | undefined;
        if (!node || node.nodeType !== 'character') return;

        const faceUrls = node.metadata?.faceUrls as Record<string, { url: string }> | undefined;
        manager.updateNode(nodeId, {
            activeLayers: { ...node.activeLayers, face: faceName },
            metadata: {
                ...node.metadata,
                faceUrl: faceUrls?.[faceName]?.url || '',
            },
        } as Partial<AnyNodeData>);
        get().evaluate();
    },

    // ── Keyframes ──

    addKeyframe: (nodeId, property, kf) => {
        const { manager } = get();
        manager.addKeyframe(nodeId, property, kf);
        get().evaluate();
    },

    // ── Playback ──

    setTime: (time) => {
        set({ currentTime: Math.max(0, Math.min(time, get().duration)) });
        get().evaluate();
    },

    play: () => set({ isPlaying: true }),
    pause: () => set({ isPlaying: false }),
    togglePlay: () => set(s => ({ isPlaying: !s.isPlaying })),

    tick: (dt) => {
        const { currentTime, duration, isPlaying } = get();
        if (!isPlaying) return;

        let next = currentTime + dt;
        if (next >= duration) {
            next = 0; // Loop
        }
        set({ currentTime: next });
        get().evaluate();
    },

    // ── Evaluate snapshot ──

    evaluate: () => {
        const { manager, currentTime } = get();
        const snapshot = manager.evaluateAtTime(currentTime);
        set({ snapshot });
    },
}));
