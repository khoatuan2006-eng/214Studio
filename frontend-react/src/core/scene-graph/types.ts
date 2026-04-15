/**
 * Scene Graph Types — TypeScript mirror of backend Python types.
 *
 * These types define the "Video DOM" contract between:
 * - Backend (Python SceneGraph) → serializes to JSON
 * - Frontend (TypeScript) → deserializes and renders via PixiJS
 * - AI Agents → read scene state and issue tool calls
 *
 * Architecture mirrors:
 * - Motion Canvas Node.ts: position, rotation, scale, opacity, zIndex
 * - OpenCut TimelineElement: id, name, transform, keyframes
 * - Manim Mobject: children hierarchy, bounding_box
 */

// ══════════════════════════════════════════════
//  CORE TYPES
// ══════════════════════════════════════════════

/** 2D transform in world units. PPU=100 → 19.2×10.8 world at 1920×1080. */
export interface Transform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number; // degrees
}

/** Axis-aligned bounding box in world units. */
export interface BoundingBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** A single keyframe for an animatable property. */
export interface Keyframe {
  time: number; // seconds
  value: number;
  easing: EasingType;
}

/** Available easing functions for keyframe interpolation. */
export type EasingType =
  | "linear"
  | "easeIn"
  | "easeOut"
  | "easeInOut"
  | "easeInCubic"
  | "easeOutCubic"
  | "easeInOutCubic"
  | "step"; // Instant jump — for pose/face swaps

/** All animatable property names. */
export type AnimatableProperty =
  | "x"
  | "y"
  | "scale_x"
  | "scale_y"
  | "rotation"
  | "opacity"
  | "blur"
  | "fov"
  | "zoom"
  | "volume";

// ══════════════════════════════════════════════
//  NODE TYPES
// ══════════════════════════════════════════════

export type NodeType =
  | "generic"
  | "character"
  | "background_layer"
  | "camera"
  | "prop"
  | "text"
  | "audio";

/** Base scene node — every object in the scene graph. */
export interface SceneNodeData {
  id: string;
  name: string;
  nodeType: NodeType;
  transform: Transform;
  opacity: number;
  zIndex: number;
  visible: boolean;
  parentId: string | null;
  children: string[]; // child node IDs
  keyframes: Record<string, Keyframe[]>; // property → keyframes
  metadata: Record<string, unknown>;
  boundingBox?: BoundingBox;
}

// ── Domain-specific extensions ──

/** Character node — PSD with pose/face layers. */
export interface CharacterNodeData extends SceneNodeData {
  nodeType: "character";
  characterId: string;
  activeLayers: Record<string, string>; // group → asset name
  availableLayers: Record<string, string[]>; // group → available assets
  frameSequence: FrameSelection[];
}

/** A frame selection for character animation (pose+face at time T). */
export interface FrameSelection {
  time: number;
  layers: Record<string, string>; // group → asset name
}

/** Background layer — single layer from FLA file. */
export interface BackgroundLayerNodeData extends SceneNodeData {
  nodeType: "background_layer";
  assetPath: string;
  parallaxSpeed: number;
  blur: number;
}

/** Camera node — virtual camera. */
export interface CameraNodeData extends SceneNodeData {
  nodeType: "camera";
  zoom: number;
  fov: number;
  targetNodeId: string | null;
}

/** Prop node — static object in scene. */
export interface PropNodeData extends SceneNodeData {
  nodeType: "prop";
  assetPath: string;
  interactive: boolean;
}

/** Text overlay node. */
export interface TextNodeData extends SceneNodeData {
  nodeType: "text";
  content: string;
  fontFamily: string;
  fontSize: number;
  color: string;
  textAlign: "left" | "center" | "right";
}

/** Audio track node. */
export interface AudioNodeData extends SceneNodeData {
  nodeType: "audio";
  assetPath: string;
  volume: number;
  loop: boolean;
  startTime: number;
  duration: number;
  audioType: "bgm" | "sfx" | "voice";
}

/** Union of all node data types. */
export type AnyNodeData =
  | SceneNodeData
  | CharacterNodeData
  | BackgroundLayerNodeData
  | CameraNodeData
  | PropNodeData
  | TextNodeData
  | AudioNodeData;

// ══════════════════════════════════════════════
//  SCENE GRAPH
// ══════════════════════════════════════════════

/** The complete scene graph — "Video DOM". */
export interface SceneGraphData {
  id: string;
  name: string;
  canvasWidth: number;
  canvasHeight: number;
  ppu: number; // Pixels Per Unit
  fps: number;
  duration: number;
  rootOrder: string[]; // root node IDs in render order
  nodes: Record<string, AnyNodeData>;
}

// ══════════════════════════════════════════════
//  SNAPSHOT (evaluated state at time T)
// ══════════════════════════════════════════════

/** A node's evaluated state at a specific time. */
export interface NodeSnapshot {
  id: string;
  name: string;
  nodeType: NodeType;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  opacity: number;
  zIndex: number;
  visible: boolean;
  parallaxSpeed?: number;
  // Character-specific
  activeLayers?: Record<string, string>;
}

/** All node states at a specific time. */
export type SceneSnapshot = Record<string, NodeSnapshot>;

// ══════════════════════════════════════════════
//  AI TOOL CALL TYPES
// ══════════════════════════════════════════════

/** An AI tool call that modifies the scene. */
export interface ToolCall {
  name: string;
  params: Record<string, unknown>;
}

/** Result from executing a tool call. */
export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

// ══════════════════════════════════════════════
//  MULTI-SCENE / VIDEO PROJECT TYPES
// ══════════════════════════════════════════════

/** Transition effect between two scenes. */
export type TransitionType = 'cut' | 'fade' | 'dissolve' | 'slide_left' | 'slide_right' | 'wipe';

export interface SceneTransitionData {
  type: TransitionType;
  duration: number; // seconds (typically 0.3 - 1.0)
}

/** Multi-scene video project — top-level container. */
export interface VideoProjectData {
  id: string;
  name: string;
  scenes: SceneGraphData[];
  transitions: SceneTransitionData[];
  totalDuration: number;
  sceneBoundaries: SceneBoundary[];
  metadata: Record<string, unknown>;
}

/** Computed time boundaries for a scene in the global timeline. */
export interface SceneBoundary {
  sceneIndex: number;
  start: number;
  end: number;
  name: string;
  backgroundId?: string;
}

// ══════════════════════════════════════════════
//  CONSTANTS
// ══════════════════════════════════════════════

export const DEFAULT_CANVAS_WIDTH = 1920;
export const DEFAULT_CANVAS_HEIGHT = 1080;
export const DEFAULT_PPU = 100;
export const DEFAULT_FPS = 30;
export const DEFAULT_DURATION = 10;

/** World dimensions at default PPU. */
export const WORLD_WIDTH = DEFAULT_CANVAS_WIDTH / DEFAULT_PPU; // 19.2
export const WORLD_HEIGHT = DEFAULT_CANVAS_HEIGHT / DEFAULT_PPU; // 10.8
export const WORLD_CENTER_X = WORLD_WIDTH / 2; // 9.6
export const WORLD_CENTER_Y = WORLD_HEIGHT / 2; // 5.4
