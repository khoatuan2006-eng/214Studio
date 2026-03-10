import { create } from 'zustand';
import type { Node, Edge, Connection } from '@xyflow/react';

// ══════════════════════════════════════════════
//  WORKFLOW DATA TYPES
// ══════════════════════════════════════════════

/** A single pose/face frame in a character's animation sequence */
export interface PoseFrame {
    id: string;
    duration: number;          // seconds this frame is displayed
    layers: Record<string, string>; // groupName → assetHash (e.g. "动作" → "abc123")
    transition: 'cut' | 'crossfade';
    transitionDuration: number; // seconds for crossfade (0 for cut)
    // Movement keyframes (optional — undefined = use node's static position)
    startX?: number;
    startY?: number;
    endX?: number;
    endY?: number;
    startScale?: number;
    endScale?: number;
}

/** Position keyframe for CapCut-style movement animation */
export interface PositionKeyframe {
    time: number;   // seconds from start
    x: number;      // canvas X (0-1920)
    y: number;      // canvas Y (0-1080)
}

export interface ZIndexKeyframe {
    time: number;   // seconds from start
    z: number;      // z-index value (0-100)
}

export interface ScaleKeyframe {
    time: number;   // seconds from start
    scale: number;  // scale value (e.g. 480 = half, 960 = full)
}

export interface RotationKeyframe {
    time: number;   // seconds from start
    rotation: number; // degrees (0-360)
}

/** Data payload for a Character Node */
export interface CharacterNodeData {
    label: string;
    characterId: string;       // references Character.id from useAppStore
    characterName: string;
    posX: number;              // canvas X position for rendering
    posY: number;              // canvas Y position for rendering  
    zIndex: number;
    scale: number;
    opacity: number;
    sequence: PoseFrame[];     // ordered pose/face frames
    positionKeyframes?: PositionKeyframe[]; // CapCut-style position animation
    zIndexKeyframes?: ZIndexKeyframe[];      // animate z-index over time
    scaleKeyframes?: ScaleKeyframe[];        // animate scale over time
    rotationKeyframes?: RotationKeyframe[];  // animate rotation over time
    flipX?: boolean;                         // horizontal flip
    [key: string]: unknown;    // xyflow requires this index signature
}

/** Data payload for a Background Node */
export interface BackgroundNodeData {
    label: string;
    assetHash: string;
    assetPath: string;
    parallaxSpeed: number;     // 0 = static, 1 = full parallax
    blur: number;              // background blur amount
    [key: string]: unknown;
}

/** A camera cut — switches to a different CameraNode at a given time */
export interface CameraCut {
    id: string;
    time: number;              // seconds — when this cut starts
    cameraNodeId: string;      // which camera node to switch to
    transition: 'cut' | 'crossfade' | 'smooth';  // transition type
    transitionDuration: number; // seconds for the transition (0 = instant cut)
}

/** Data payload for a Scene Node (compositor) */
export interface SceneNodeData {
    label: string;
    fps: number;
    canvasWidth: number;
    canvasHeight: number;
    totalDuration: number;
    pixelsPerUnit: number;     // PPU: how many pixels = 1 unit (default 100)
    // Camera is now a separate CameraNode connected via edge
    activeCameraId: string;    // ID of the default/active camera node (fallback)
    cameraCuts: CameraCut[];   // Timeline of camera switches
    [key: string]: unknown;
}

/** Data payload for a Prop Node */
export interface PropNodeData {
    label: string;
    assetHash: string;
    assetPath: string;
    posX: number;
    posY: number;
    zIndex: number;
    scale: number;
    opacity: number;
    rotation: number;
    [key: string]: unknown;
}

/** Data payload for an Audio Node */
export interface AudioNodeData {
    label: string;
    audioType: 'bgm' | 'sfx' | 'voice';
    assetPath: string;
    volume: number;
    startTime: number;
    loop: boolean;
    fadeIn: number;
    fadeOut: number;
    [key: string]: unknown;
}

/** A single camera keyframe (position + zoom at a point in time) */
export interface CameraKeyframe {
    id: string;
    time: number;           // seconds
    x: number;              // center X in world units
    y: number;              // center Y in world units
    zoom: number;           // 1 = 100%, 2 = 200% zoom-in
    easing: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';
}

/** Data payload for a Camera Node */
export interface CameraNodeData {
    label: string;
    keyframes: CameraKeyframe[];
    viewportWidth: number;   // output resolution width in px (quality, not what camera sees)
    viewportHeight: number;  // output resolution height in px (quality, not what camera sees)
    fov: number;             // field of view width in world units (determines what camera captures)
    [key: string]: unknown;
}

/** Data payload for a Foreground Node (image overlay on top of characters) */
export interface ForegroundNodeData {
    label: string;
    assetHash: string;
    assetPath: string;
    posX: number;
    posY: number;
    zIndex: number;
    scale: number;
    opacity: number;
    blur: number;
    [key: string]: unknown;
}

/** A single layer in the Stage node.
 *  Coordinates in pixels on 1920×1080 canvas, displayed as units via PPU.
 */
export interface StageLayer {
    id: string;
    type: 'background' | 'foreground' | 'prop';
    source: 'image' | 'video' | 'fla';
    label: string;
    assetPath: string;
    posX: number;
    posY: number;
    zIndex: number;
    width: number;      // pixel width on 1920×1080 canvas
    height: number;     // pixel height on 1920×1080 canvas
    opacity: number;
    rotation: number;
    blur: number;
    visible: boolean;
}

/** Data payload for a Stage Node (unified BG + FG + Prop) */
export interface StageNodeData {
    label: string;
    layers: StageLayer[];
    [key: string]: unknown;
}

/** A single step in the map animation sequence */
export interface MapStep {
    id: string;
    duration: number;              // seconds this step is displayed
    highlightedProvinces: string[]; // region IDs to highlight
    zoomLevel: number;             // 0-22 (MapLibre zoom)
    cameraX: number;               // longitude (-180 to 180)
    cameraY: number;               // latitude (-90 to 90)
    pitch: number;                 // 3D tilt angle (0-85 degrees)
    bearing: number;               // compass rotation (0-360 degrees)
    provinceColor: string;         // highlight color e.g. "#ef4444"
    label: string;                 // user label e.g. "Zoom vào Hà Giang"
}

/** Data payload for a Map Node */
export interface MapNodeData {
    label: string;
    mapType: 'world' | 'vietnam';  // extensible later: 'asia', 'europe'...
    mapStyle: 'dark' | 'positron' | 'voyager' | 'darkNoLabels';
    sequence: MapStep[];           // ordered animation steps
    backgroundColor: string;       // map background color
    borderColor: string;           // province/country border color  
    defaultColor: string;          // default fill color
    highlightColor: string;        // default highlight color
    [key: string]: unknown;
}

/** V2 Pose Frame — body part selections + expression combo */
export interface V2PoseFrame {
    id: string;
    duration: number;
    bodyParts: Record<string, string>;   // partName → variantName
    expression: {
        type: 'combinable' | 'pre_composed';
        mouth?: string;
        eyes?: string;
        eyebrows?: string;
        preset?: string;
    };
    viewpoint?: string;
    transition: 'cut' | 'crossfade';
    transitionDuration: number;
    autoBlink: boolean;
    blinkInterval: number;   // seconds (3-8)
    blinkDuration: number;   // ms (150-300)
}

/** Data payload for a Character V2 Node (jointed-limb) */
export interface CharacterV2NodeData {
    label: string;
    characterId: string;
    characterName: string;
    posX: number;
    posY: number;
    zIndex: number;
    scale: number;
    opacity: number;
    sequence: V2PoseFrame[];
    activeViewpoint: string;
    [key: string]: unknown;
}

// Union type for all node data
export type WorkflowNodeData = CharacterNodeData | BackgroundNodeData | SceneNodeData | PropNodeData | AudioNodeData | CameraNodeData | ForegroundNodeData | MapNodeData | CharacterV2NodeData | StageNodeData;

// Node type identifiers
export type WorkflowNodeType = 'character' | 'background' | 'scene' | 'prop' | 'audio' | 'camera' | 'foreground' | 'map' | 'characterV2' | 'stage';

/** A saved workflow snapshot */
export interface SavedWorkflow {
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
    nodes: Node[];
    edges: Edge[];
}

const STORAGE_KEY = 'animeStudio_workflows';

// ══════════════════════════════════════════════
//  WORKFLOW STORE
// ══════════════════════════════════════════════

interface WorkflowStore {
    // ── State ──
    nodes: Node[];
    edges: Edge[];
    selectedNodeId: string | null;

    // ── Node Operations ──
    setNodes: (nodes: Node[]) => void;
    setEdges: (edges: Edge[]) => void;
    onNodesChange: (changes: any[]) => void;
    onEdgesChange: (changes: any[]) => void;
    onConnect: (connection: Connection) => void;

    addNode: (type: WorkflowNodeType, position: { x: number; y: number }) => string;
    updateNodeData: (nodeId: string, data: Partial<WorkflowNodeData>) => void;
    removeNode: (nodeId: string) => void;
    selectNode: (nodeId: string | null) => void;

    // ── Persistence ──
    getWorkflowJSON: () => { nodes: Node[]; edges: Edge[] };
    loadWorkflowJSON: (data: { nodes: Node[]; edges: Edge[] }) => void;
    clearWorkflow: () => void;

    // ── Saved Workflows ──
    savedWorkflows: SavedWorkflow[];
    loadSavedWorkflows: () => void;
    saveWorkflow: (name: string) => string; // returns ID
    loadSavedWorkflow: (id: string) => boolean;
    deleteSavedWorkflow: (id: string) => void;
    renameSavedWorkflow: (id: string, newName: string) => void;
}

let nodeIdCounter = 0;
const generateNodeId = () => `wf-node-${Date.now()}-${nodeIdCounter++}`;

/** Default data factories for each node type */
const createDefaultData = (type: WorkflowNodeType): WorkflowNodeData => {
    switch (type) {
        case 'character':
            return {
                label: 'Character',
                characterId: '',
                characterName: '',
                posX: 960,
                posY: 540,
                zIndex: 10,
                scale: 960,
                opacity: 1.0,
                sequence: [],
            };
        case 'background':
            return {
                label: 'Background',
                assetHash: '',
                assetPath: '',
                parallaxSpeed: 0,
                blur: 0,
            };
        case 'scene':
            return {
                label: 'Scene Output',
                fps: 30,
                canvasWidth: 1920,
                canvasHeight: 1080,
                totalDuration: 0,
                pixelsPerUnit: 100,
                activeCameraId: '',
                cameraCuts: [],
            };
        case 'prop':
            return {
                label: 'Prop',
                assetHash: '',
                assetPath: '',
                posX: 960,
                posY: 540,
                zIndex: 15,
                scale: 1.0,
                opacity: 1.0,
                rotation: 0,
            };
        case 'audio':
            return {
                label: 'Audio',
                audioType: 'bgm',
                assetPath: '',
                volume: 0.8,
                startTime: 0,
                loop: false,
                fadeIn: 0,
                fadeOut: 0,
            };
        case 'camera':
            return {
                label: 'Camera',
                keyframes: [
                    { id: 'kf-init', time: 0, x: 9.6, y: 5.4, zoom: 1, easing: 'easeInOut' as const },
                ],
                viewportWidth: 1920,
                viewportHeight: 1080,
                fov: 19.2,  // default: 1920px / 100 PPU = 19.2 units wide
            };
        case 'foreground':
            return {
                label: 'Foreground',
                assetHash: '',
                assetPath: '',
                posX: 960,
                posY: 540,
                zIndex: 50,
                scale: 960,
                opacity: 1.0,
                blur: 0,
            };
        case 'stage':
            return {
                label: 'Stage',
                layers: [],
            };
        case 'characterV2':
            return {
                label: 'Character V2',
                characterId: '',
                characterName: '',
                posX: 960,
                posY: 540,
                zIndex: 10,
                scale: 960,
                opacity: 1.0,
                sequence: [],
                activeViewpoint: '',
            };
        case 'map':
            return {
                label: 'World Map',
                mapType: 'world',
                mapStyle: 'dark',
                sequence: [],
                backgroundColor: '#0a1628',
                borderColor: '#334155',
                defaultColor: '#1e3a5f',
                highlightColor: '#ef4444',
            };
    }
};

export const useWorkflowStore = create<WorkflowStore>()((set, get) => ({
    nodes: [],
    edges: [],
    selectedNodeId: null,
    savedWorkflows: [],

    setNodes: (nodes) => set({ nodes }),
    setEdges: (edges) => set({ edges }),

    onNodesChange: (changes) => {
        // Import applyNodeChanges dynamically to avoid circular deps at module level
        import('@xyflow/react').then(({ applyNodeChanges }) => {
            set({ nodes: applyNodeChanges(changes, get().nodes) as Node[] });
        });
    },

    onEdgesChange: (changes) => {
        import('@xyflow/react').then(({ applyEdgeChanges }) => {
            set({ edges: applyEdgeChanges(changes, get().edges) as Edge[] });
        });
    },

    onConnect: (connection) => {
        import('@xyflow/react').then(({ addEdge }) => {
            set({ edges: addEdge({ ...connection, animated: true }, get().edges) });
        });
    },

    addNode: (type, position) => {
        const id = generateNodeId();
        const newNode: Node = {
            id,
            type,
            position,
            data: createDefaultData(type),
        };
        set({ nodes: [...get().nodes, newNode] });
        return id;
    },

    updateNodeData: (nodeId, data) => {
        set({
            nodes: get().nodes.map((node) =>
                node.id === nodeId
                    ? { ...node, data: { ...node.data, ...data } }
                    : node
            ),
        });
    },

    removeNode: (nodeId) => {
        set({
            nodes: get().nodes.filter((n) => n.id !== nodeId),
            edges: get().edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
            selectedNodeId: get().selectedNodeId === nodeId ? null : get().selectedNodeId,
        });
    },

    selectNode: (nodeId) => set({ selectedNodeId: nodeId }),

    getWorkflowJSON: () => {
        const { nodes, edges } = get();
        return { nodes, edges };
    },

    loadWorkflowJSON: (data) => {
        set({ nodes: data.nodes, edges: data.edges, selectedNodeId: null });
    },

    clearWorkflow: () => {
        set({ nodes: [], edges: [], selectedNodeId: null });
    },

    // ── Saved Workflows (localStorage) ──
    loadSavedWorkflows: () => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const workflows: SavedWorkflow[] = JSON.parse(raw);
                set({ savedWorkflows: workflows });
            }
        } catch (e) {
            console.warn('[Workflow] Failed to load saved workflows:', e);
        }
    },

    saveWorkflow: (name: string) => {
        const { nodes, edges, savedWorkflows } = get();
        const now = new Date().toISOString();

        // Check if workflow with same name exists → update it
        const existing = savedWorkflows.find((w) => w.name === name);
        let id: string;

        if (existing) {
            id = existing.id;
            const updated = savedWorkflows.map((w) =>
                w.id === id ? { ...w, nodes, edges, updatedAt: now } : w
            );
            set({ savedWorkflows: updated });
            localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        } else {
            id = `wf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            const newWorkflow: SavedWorkflow = { id, name, createdAt: now, updatedAt: now, nodes, edges };
            const updated = [newWorkflow, ...savedWorkflows];
            set({ savedWorkflows: updated });
            localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        }

        return id;
    },

    loadSavedWorkflow: (id: string) => {
        const { savedWorkflows } = get();
        const workflow = savedWorkflows.find((w) => w.id === id);
        if (!workflow) return false;
        set({ nodes: workflow.nodes, edges: workflow.edges, selectedNodeId: null });
        return true;
    },

    deleteSavedWorkflow: (id: string) => {
        const updated = get().savedWorkflows.filter((w) => w.id !== id);
        set({ savedWorkflows: updated });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    },

    renameSavedWorkflow: (id: string, newName: string) => {
        const updated = get().savedWorkflows.map((w) =>
            w.id === id ? { ...w, name: newName, updatedAt: new Date().toISOString() } : w
        );
        set({ savedWorkflows: updated });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    },
}));
