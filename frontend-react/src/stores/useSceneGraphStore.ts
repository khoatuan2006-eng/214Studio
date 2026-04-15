/**
 * useSceneGraphStore — Zustand store for Scene Graph (Video DOM) state.
 *
 * Wraps SceneGraphManager and provides React-friendly reactive state.
 * This store powers the "Scene Graph Mode" in StudioMode.
 *
 * Multi-Scene Support (P2-3):
 * - Manages an array of scenes (SceneGraphManager instances)
 * - Each scene has its own nodes, keyframes, background, camera
 * - Transitions between scenes (fade, cut, dissolve)
 * - Global timeline that spans all scenes
 * - Scene switching preserves per-scene state
 *
 * Responsibilities:
 * 1. Hold SceneGraphManager instances (one per scene)
 * 2. Manage multi-scene state (active scene, transitions, boundaries)
 * 3. Fetch available characters from backend AssetRegistry API
 * 4. Add/remove characters to active scene
 * 5. Global playback across all scenes with transition effects
 */

import { create } from 'zustand';
import { SceneGraphManager } from '@/core/scene-graph/SceneGraphManager';
import type {
    AnyNodeData,
    CharacterNodeData,
    NodeSnapshot,
    SceneSnapshot,
    Keyframe,
    SceneTransitionData,
    SceneBoundary,
    TransitionType,
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
//  Multi-Scene Types
// ══════════════════════════════════════════════

/** A single scene entry in the multi-scene project. */
export interface SceneEntry {
    id: string;
    name: string;
    manager: SceneGraphManager;
    duration: number;
    metadata: Record<string, unknown>;
}

/** Active transition state for rendering. */
export interface ActiveTransition {
    type: TransitionType;
    progress: number; // 0→1
    fromSceneIndex: number;
    toSceneIndex: number;
}

// ══════════════════════════════════════════════
//  Store Interface
// ══════════════════════════════════════════════

interface SceneGraphStore {
    // ── Multi-Scene State ──
    scenes: SceneEntry[];
    activeSceneIndex: number;
    transitions: SceneTransitionData[];
    sceneBoundaries: SceneBoundary[];
    globalDuration: number;
    activeTransition: ActiveTransition | null;

    // ── Active scene shortcuts (backward compatible) ──
    manager: SceneGraphManager;
    snapshot: SceneSnapshot;
    currentTime: number;        // Global time across all scenes
    localTime: number;          // Time within the active scene
    duration: number;           // Active scene duration
    isPlaying: boolean;

    // AI Chat state
    chatHistory: { role: 'user'|'ai'; text: string; sceneData?: any }[];
    isAILoading: boolean;

    // Character registry (from backend)
    characters: CharacterSummary[];
    characterCache: Record<string, CharacterFull>; // id → full data

    // Scene nodes in active scene (quick access)
    sceneNodeIds: string[];

    // ── Actions — Multi-Scene ──
    addScene: (name?: string, sceneData?: any) => number; // returns scene index
    removeScene: (index: number) => void;
    duplicateScene: (index: number) => number;
    switchScene: (index: number) => void;
    reorderScenes: (fromIdx: number, toIdx: number) => void;
    renameScene: (index: number, name: string) => void;
    setTransition: (index: number, type: TransitionType, duration?: number) => void;
    loadVideoProject: (data: any) => void;
    recalcBoundaries: () => void;

    // ── Actions — Character registry ──
    fetchCharacters: () => Promise<void>;
    fetchCharacterFull: (charId: string) => Promise<CharacterFull | null>;

    // ── Actions — AI Chat ──
    sendAIChatMessage: (prompt: string) => Promise<void>;
    applySceneData: (sceneData: any) => void;

    // ── Actions — Scene manipulation ──
    addCharacterToScene: (charId: string, config?: {
        x?: number; y?: number; scale?: number; name?: string;
    }) => Promise<string | null>;
    removeFromScene: (nodeId: string) => void;

    // ── Actions — Pose/Face ──
    setPose: (nodeId: string, poseName: string) => void;
    setFace: (nodeId: string, faceName: string) => void;

    // ── Actions — Keyframes ──
    addKeyframe: (nodeId: string, property: string, kf: Keyframe) => void;

    // ── Actions — Playback ──
    setTime: (time: number) => void;
    setGlobalTime: (time: number) => void;
    play: () => void;
    pause: () => void;
    togglePlay: () => void;
    tick: (dt: number) => void;

    // ── Actions — Evaluate ──
    evaluate: () => void;
}

// ══════════════════════════════════════════════
//  Helpers
// ══════════════════════════════════════════════

function createSceneEntry(name: string, data?: any): SceneEntry {
    const mgr = new SceneGraphManager();
    if (data) {
        mgr.loadFromBackendResponse(data);
    }
    return {
        id: `scene-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name,
        manager: mgr,
        duration: data?.duration ?? mgr.graph.duration ?? 10,
        metadata: data?.metadata ?? {},
    };
}

function computeBoundaries(scenes: SceneEntry[]): SceneBoundary[] {
    const boundaries: SceneBoundary[] = [];
    let t = 0;
    for (let i = 0; i < scenes.length; i++) {
        boundaries.push({
            sceneIndex: i,
            start: t,
            end: t + scenes[i].duration,
            name: scenes[i].name,
            backgroundId: (scenes[i].metadata?.background_id as string) ?? undefined,
        });
        t += scenes[i].duration;
    }
    return boundaries;
}

function computeGlobalDuration(scenes: SceneEntry[]): number {
    return scenes.reduce((sum, s) => sum + s.duration, 0);
}

function findSceneAtTime(boundaries: SceneBoundary[], globalTime: number): { index: number; localTime: number } {
    for (const b of boundaries) {
        if (globalTime < b.end || b.sceneIndex === boundaries.length - 1) {
            return {
                index: b.sceneIndex,
                localTime: Math.max(0, Math.min(globalTime - b.start, b.end - b.start)),
            };
        }
    }
    return { index: 0, localTime: 0 };
}

function findTransitionAtTime(
    boundaries: SceneBoundary[],
    transitions: SceneTransitionData[],
    globalTime: number,
): ActiveTransition | null {
    for (let i = 0; i < transitions.length; i++) {
        const trans = transitions[i];
        if (trans.type === 'cut' || !boundaries[i] || !boundaries[i + 1]) continue;

        const sceneEnd = boundaries[i].end;
        const transStart = sceneEnd - trans.duration;

        if (globalTime >= transStart && globalTime < sceneEnd) {
            const progress = (globalTime - transStart) / trans.duration;
            return {
                type: trans.type,
                progress: Math.max(0, Math.min(1, progress)),
                fromSceneIndex: i,
                toSceneIndex: i + 1,
            };
        }
    }
    return null;
}

// ══════════════════════════════════════════════
//  Store Implementation
// ══════════════════════════════════════════════

const initialScene = createSceneEntry('Scene 1');

export const useSceneGraphStore = create<SceneGraphStore>((set, get) => ({
    // Multi-scene state
    scenes: [initialScene],
    activeSceneIndex: 0,
    transitions: [],
    sceneBoundaries: [{ sceneIndex: 0, start: 0, end: 10, name: 'Scene 1' }],
    globalDuration: 10,
    activeTransition: null,

    // Active scene shortcuts
    manager: initialScene.manager,
    snapshot: {},
    currentTime: 0,
    localTime: 0,
    duration: 10,
    isPlaying: false,

    chatHistory: [],
    isAILoading: false,

    characters: [],
    characterCache: {},
    sceneNodeIds: [],

    // ══════════════════════════════════════════════
    //  Multi-Scene Actions
    // ══════════════════════════════════════════════

    addScene: (name, sceneData) => {
        const { scenes } = get();
        const newName = name ?? `Scene ${scenes.length + 1}`;
        const entry = createSceneEntry(newName, sceneData);
        const newScenes = [...scenes, entry];
        const boundaries = computeBoundaries(newScenes);
        const globalDuration = computeGlobalDuration(newScenes);

        // Add a default fade transition to the previous scene
        const newTransitions = [...get().transitions];
        if (newScenes.length > 1 && newTransitions.length < newScenes.length - 1) {
            newTransitions.push({ type: 'fade', duration: 0.5 });
        }

        set({
            scenes: newScenes,
            transitions: newTransitions,
            sceneBoundaries: boundaries,
            globalDuration,
        });
        return newScenes.length - 1;
    },

    removeScene: (index) => {
        const { scenes, activeSceneIndex, transitions } = get();
        if (scenes.length <= 1) return; // Keep at least 1 scene

        const newScenes = scenes.filter((_, i) => i !== index);
        const newTransitions = transitions.filter((_, i) => i !== index && i !== index - 1);
        // Fix transitions array length
        while (newTransitions.length > newScenes.length - 1) newTransitions.pop();

        let newIndex = activeSceneIndex;
        if (index <= activeSceneIndex) {
            newIndex = Math.max(0, activeSceneIndex - 1);
        }
        newIndex = Math.min(newIndex, newScenes.length - 1);

        const boundaries = computeBoundaries(newScenes);
        const globalDuration = computeGlobalDuration(newScenes);

        set({
            scenes: newScenes,
            transitions: newTransitions,
            activeSceneIndex: newIndex,
            manager: newScenes[newIndex].manager,
            duration: newScenes[newIndex].duration,
            sceneNodeIds: Object.keys(newScenes[newIndex].manager.graph.nodes),
            sceneBoundaries: boundaries,
            globalDuration,
        });
        get().evaluate();
    },

    duplicateScene: (index) => {
        const { scenes, transitions } = get();
        const src = scenes[index];
        if (!src) return index;

        // Deep clone by serializing/deserializing
        const srcData = src.manager.toBackendDict();
        const entry = createSceneEntry(`${src.name} (copy)`, srcData);
        entry.duration = src.duration;
        entry.metadata = { ...src.metadata };

        const newScenes = [...scenes];
        newScenes.splice(index + 1, 0, entry);

        const newTransitions = [...transitions];
        newTransitions.splice(index, 0, { type: 'fade', duration: 0.5 });

        const boundaries = computeBoundaries(newScenes);
        const globalDuration = computeGlobalDuration(newScenes);

        set({
            scenes: newScenes,
            transitions: newTransitions,
            sceneBoundaries: boundaries,
            globalDuration,
        });
        return index + 1;
    },

    switchScene: (index) => {
        const { scenes, activeSceneIndex } = get();
        if (index === activeSceneIndex || index < 0 || index >= scenes.length) return;

        const target = scenes[index];
        set({
            activeSceneIndex: index,
            manager: target.manager,
            duration: target.duration,
            sceneNodeIds: Object.keys(target.manager.graph.nodes),
        });
        get().evaluate();
    },

    reorderScenes: (fromIdx, toIdx) => {
        const { scenes, transitions, activeSceneIndex } = get();
        const arr = [...scenes];
        const [moved] = arr.splice(fromIdx, 1);
        arr.splice(toIdx, 0, moved);

        // Rebuild transitions for new order
        const newTransitions = [...transitions];
        // Keep existing transitions but adjust indices
        while (newTransitions.length < arr.length - 1) {
            newTransitions.push({ type: 'fade', duration: 0.5 });
        }
        while (newTransitions.length > arr.length - 1) {
            newTransitions.pop();
        }

        // Track active scene
        let newActive = activeSceneIndex;
        if (fromIdx === activeSceneIndex) newActive = toIdx;
        else if (fromIdx < activeSceneIndex && toIdx >= activeSceneIndex) newActive--;
        else if (fromIdx > activeSceneIndex && toIdx <= activeSceneIndex) newActive++;

        const boundaries = computeBoundaries(arr);
        const globalDuration = computeGlobalDuration(arr);

        set({
            scenes: arr,
            transitions: newTransitions,
            activeSceneIndex: newActive,
            manager: arr[newActive].manager,
            sceneBoundaries: boundaries,
            globalDuration,
        });
    },

    renameScene: (index, name) => {
        const { scenes } = get();
        const newScenes = scenes.map((s, i) => i === index ? { ...s, name } : s);
        set({
            scenes: newScenes,
            sceneBoundaries: computeBoundaries(newScenes),
        });
    },

    setTransition: (index, type, duration = 0.5) => {
        const { transitions, scenes } = get();
        if (index < 0 || index >= scenes.length - 1) return;

        const newTransitions = [...transitions];
        while (newTransitions.length <= index) {
            newTransitions.push({ type: 'fade', duration: 0.5 });
        }
        newTransitions[index] = { type, duration };
        set({ transitions: newTransitions });
    },

    loadVideoProject: (data) => {
        const rawScenes = data.scenes || [];
        const rawTransitions = data.transitions || [];

        if (rawScenes.length === 0) return;

        const scenes: SceneEntry[] = rawScenes.map((s: any, i: number) => {
            const entry = createSceneEntry(s.name || `Scene ${i + 1}`, s);
            entry.duration = s.duration ?? 10;
            entry.metadata = s.metadata ?? {};
            return entry;
        });

        const transitions: SceneTransitionData[] = rawTransitions.map((t: any) => ({
            type: (t.type || 'fade') as TransitionType,
            duration: t.duration ?? 0.5,
        }));

        // Pad transitions if needed
        while (transitions.length < scenes.length - 1) {
            transitions.push({ type: 'fade', duration: 0.5 });
        }

        const boundaries = computeBoundaries(scenes);
        const globalDuration = computeGlobalDuration(scenes);

        set({
            scenes,
            activeSceneIndex: 0,
            transitions,
            sceneBoundaries: boundaries,
            globalDuration,
            manager: scenes[0].manager,
            duration: scenes[0].duration,
            sceneNodeIds: Object.keys(scenes[0].manager.graph.nodes),
            currentTime: 0,
            localTime: 0,
            isPlaying: false,
            activeTransition: null,
        });
        get().evaluate();
    },

    recalcBoundaries: () => {
        const { scenes } = get();
        // Update durations from managers
        const updated = scenes.map(s => ({
            ...s,
            duration: s.manager.graph.duration ?? s.duration,
        }));
        set({
            scenes: updated,
            sceneBoundaries: computeBoundaries(updated),
            globalDuration: computeGlobalDuration(updated),
        });
    },

    // ══════════════════════════════════════════════
    //  Character Registry
    // ══════════════════════════════════════════════

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

    // ══════════════════════════════════════════════
    //  AI Chat
    // ══════════════════════════════════════════════

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
        const { manager, scenes, activeSceneIndex } = get();
        manager.loadFromBackendResponse(sceneData);

        // Update active scene duration
        const newDur = sceneData.duration ?? manager.graph.duration ?? 10;
        const newScenes = scenes.map((s, i) =>
            i === activeSceneIndex ? { ...s, duration: newDur, metadata: sceneData.metadata ?? s.metadata } : s
        );

        const newIds = Object.keys(manager.graph.nodes);
        set({
            sceneNodeIds: newIds,
            scenes: newScenes,
            duration: newDur,
            sceneBoundaries: computeBoundaries(newScenes),
            globalDuration: computeGlobalDuration(newScenes),
        });
        get().evaluate();
    },

    // ══════════════════════════════════════════════
    //  Scene Manipulation (on active scene)
    // ══════════════════════════════════════════════

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

    // ══════════════════════════════════════════════
    //  Playback (Multi-Scene Aware)
    // ══════════════════════════════════════════════

    setTime: (time) => {
        const { duration } = get();
        set({ localTime: Math.max(0, Math.min(time, duration)) });
        get().evaluate();
    },

    setGlobalTime: (time) => {
        const { sceneBoundaries, transitions, scenes } = get();
        const clamped = Math.max(0, Math.min(time, get().globalDuration));

        const { index, localTime } = findSceneAtTime(sceneBoundaries, clamped);
        const transition = findTransitionAtTime(sceneBoundaries, transitions, clamped);

        // Switch scene if needed
        if (index !== get().activeSceneIndex) {
            const target = scenes[index];
            set({
                activeSceneIndex: index,
                manager: target.manager,
                duration: target.duration,
                sceneNodeIds: Object.keys(target.manager.graph.nodes),
            });
        }

        set({
            currentTime: clamped,
            localTime,
            activeTransition: transition,
        });
        get().evaluate();
    },

    play: () => set({ isPlaying: true }),
    pause: () => set({ isPlaying: false }),
    togglePlay: () => set(s => ({ isPlaying: !s.isPlaying })),

    tick: (dt) => {
        const { currentTime, globalDuration, isPlaying, scenes } = get();
        if (!isPlaying) return;

        let next = currentTime + dt;

        // Multi-scene: use global duration
        const totalDur = scenes.length > 1 ? globalDuration : get().duration;
        if (next >= totalDur) {
            next = 0; // Loop
        }

        if (scenes.length > 1) {
            // Multi-scene: use setGlobalTime for proper scene switching
            get().setGlobalTime(next);
        } else {
            // Single scene: simple update
            set({ currentTime: next, localTime: next });
            get().evaluate();
        }
    },

    // ── Evaluate snapshot ──

    evaluate: () => {
        const { manager, localTime, currentTime, scenes } = get();
        const time = scenes.length > 1 ? localTime : currentTime;
        const snapshot = manager.evaluateAtTime(time);
        set({ snapshot });
    },
}));
