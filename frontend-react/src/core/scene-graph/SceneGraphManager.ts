/**
 * SceneGraphManager — Central manager for the Scene Graph (Video DOM).
 *
 * Inspired by:
 * - Motion Canvas View2D: root container managing all nodes
 * - OpenCut EditorCore: singleton manager pattern
 * - Theatre.js Sheet: time-based evaluation of properties
 *
 * Responsibilities:
 * 1. Hold the canonical SceneGraph state
 * 2. Evaluate all node states at a given time (for PixiJS rendering)
 * 3. Apply AI tool calls (mutations from backend)
 * 4. Serialize/deserialize for persistence
 * 5. Convert to/from legacy workflow format (backward compatible)
 */

import type {
  SceneGraphData,
  AnyNodeData,
  NodeSnapshot,
  SceneSnapshot,
  CharacterNodeData,
  ToolCall,
  ToolResult,
  Transform,
  Keyframe,
  NodeType,
} from "./types";
import {
  interpolateKeyframes,
  insertKeyframe,
  removeKeyframe,
} from "./keyframe";
import {
  DEFAULT_CANVAS_WIDTH,
  DEFAULT_CANVAS_HEIGHT,
  DEFAULT_PPU,
  DEFAULT_FPS,
  DEFAULT_DURATION,
} from "./types";

// ══════════════════════════════════════════════
//  HELPER: Convert snake_case ↔ camelCase
//  (Backend uses snake_case, frontend uses camelCase)
// ══════════════════════════════════════════════

function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function camelToSnake(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

/** Convert a backend node dict to frontend AnyNodeData. */
function nodeFromBackend(raw: Record<string, unknown>): AnyNodeData {
  const transform = raw.transform as Record<string, number> | undefined;
  return {
    id: raw.id as string,
    name: raw.name as string,
    nodeType: (raw.node_type as NodeType) ?? "generic",
    transform: {
      x: transform?.x ?? 0,
      y: transform?.y ?? 0,
      scaleX: transform?.scale_x ?? 1,
      scaleY: transform?.scale_y ?? 1,
      rotation: transform?.rotation ?? 0,
    },
    opacity: (raw.opacity as number) ?? 1,
    zIndex: (raw.z_index as number) ?? 0,
    visible: (raw.visible as boolean) ?? true,
    parentId: (raw.parent_id as string) ?? null,
    children: ((raw.children as string[]) ?? []),
    keyframes: convertKeyframesFromBackend(
      raw.keyframes as Record<string, unknown[]> | undefined
    ),
    metadata: (raw.metadata as Record<string, unknown>) ?? {},
    // Domain-specific fields (pass through)
    ...(raw.character_id !== undefined && {
      characterId: raw.character_id as string,
      activeLayers: (raw.active_layers as Record<string, string>) ?? {},
      availableLayers:
        (raw.available_layers as Record<string, string[]>) ?? {},
      frameSequence: (raw.frame_sequence as CharacterNodeData["frameSequence"]) ?? [],
    }),
    ...(raw.asset_path !== undefined && {
      assetPath: raw.asset_path as string,
    }),
    ...(raw.parallax_speed !== undefined && {
      parallaxSpeed: raw.parallax_speed as number,
    }),
    ...(raw.blur !== undefined && { blur: raw.blur as number }),
    ...(raw.zoom !== undefined && { zoom: raw.zoom as number }),
    ...(raw.fov !== undefined && { fov: raw.fov as number }),
    ...(raw.target_node_id !== undefined && {
      targetNodeId: raw.target_node_id as string | null,
    }),
    ...(raw.content !== undefined && { content: raw.content as string }),
    ...(raw.font_family !== undefined && {
      fontFamily: raw.font_family as string,
    }),
    ...(raw.font_size !== undefined && { fontSize: raw.font_size as number }),
    ...(raw.color !== undefined && { color: raw.color as string }),
    ...(raw.text_align !== undefined && {
      textAlign: raw.text_align as string,
    }),
    ...(raw.volume !== undefined && { volume: raw.volume as number }),
    ...(raw.loop !== undefined && { loop: raw.loop as boolean }),
    ...(raw.start_time !== undefined && {
      startTime: raw.start_time as number,
    }),
    ...(raw.duration !== undefined && { duration: raw.duration as number }),
    ...(raw.audio_type !== undefined && {
      audioType: raw.audio_type as string,
    }),
    ...(raw.interactive !== undefined && {
      interactive: raw.interactive as boolean,
    }),
  } as AnyNodeData;
}

function convertKeyframesFromBackend(
  raw: Record<string, unknown[]> | undefined
): Record<string, Keyframe[]> {
  if (!raw) return {};
  const result: Record<string, Keyframe[]> = {};
  for (const [prop, kfs] of Object.entries(raw)) {
    result[prop] = (kfs as Array<Record<string, unknown>>).map((kf) => {
      let easingStr = (kf.easing as string) || "linear";
      if (easingStr === "ease_in") easingStr = "easeIn";
      if (easingStr === "ease_out") easingStr = "easeOut";
      if (easingStr === "ease_in_out") easingStr = "easeInOut";
      if (easingStr === "ease_in_cubic") easingStr = "easeInCubic";
      if (easingStr === "ease_out_cubic") easingStr = "easeOutCubic";
      if (easingStr === "ease_in_out_cubic") easingStr = "easeInOutCubic";
      
      return {
        time: (kf.time as number) ?? 0,
        value: (kf.value as number) ?? 0,
        easing: easingStr as Keyframe["easing"],
      };
    });
  }
  return result;
}

// ══════════════════════════════════════════════
//  SCENE GRAPH MANAGER
// ══════════════════════════════════════════════

export class SceneGraphManager {
  private data: SceneGraphData;
  private listeners: Set<() => void> = new Set();

  constructor(initialData?: Partial<SceneGraphData>) {
    this.data = {
      id: initialData?.id ?? `scene-${Date.now().toString(36)}`,
      name: initialData?.name ?? "Untitled Scene",
      canvasWidth: initialData?.canvasWidth ?? DEFAULT_CANVAS_WIDTH,
      canvasHeight: initialData?.canvasHeight ?? DEFAULT_CANVAS_HEIGHT,
      ppu: initialData?.ppu ?? DEFAULT_PPU,
      fps: initialData?.fps ?? DEFAULT_FPS,
      duration: initialData?.duration ?? DEFAULT_DURATION,
      rootOrder: initialData?.rootOrder ?? [],
      nodes: initialData?.nodes ?? {},
    };
  }

  // ── Getters ──

  get graph(): SceneGraphData {
    return this.data;
  }

  get worldWidth(): number {
    return this.data.canvasWidth / this.data.ppu;
  }

  get worldHeight(): number {
    return this.data.canvasHeight / this.data.ppu;
  }

  getNode(id: string): AnyNodeData | undefined {
    return this.data.nodes[id];
  }

  getNodesByType(type: NodeType): AnyNodeData[] {
    return Object.values(this.data.nodes).filter(
      (n) => n.nodeType === type
    );
  }

  get characters(): AnyNodeData[] {
    return this.getNodesByType("character");
  }

  get backgrounds(): AnyNodeData[] {
    return this.getNodesByType("background_layer");
  }

  get camera(): AnyNodeData | undefined {
    return this.getNodesByType("camera")[0];
  }

  // ── Change Listeners (for React reactivity) ──

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach((fn) => fn());
  }

  // ── Node Management ──

  addNode(node: AnyNodeData): string {
    this.data.nodes[node.id] = node;
    if (!node.parentId && !this.data.rootOrder.includes(node.id)) {
      this.data.rootOrder.push(node.id);
    }
    this.notify();
    return node.id;
  }

  removeNode(id: string): void {
    delete this.data.nodes[id];
    this.data.rootOrder = this.data.rootOrder.filter((nid) => nid !== id);
    this.notify();
  }

  updateNode(id: string, updates: Partial<AnyNodeData>): void {
    const node = this.data.nodes[id];
    if (!node) return;
    Object.assign(node, updates);
    this.notify();
  }

  updateTransform(id: string, transform: Partial<Transform>): void {
    const node = this.data.nodes[id];
    if (!node) return;
    node.transform = { ...node.transform, ...transform };
    this.notify();
  }

  // ── Keyframe Management ──

  addKeyframe(
    nodeId: string,
    property: string,
    keyframe: Keyframe
  ): void {
    const node = this.data.nodes[nodeId];
    if (!node) return;
    if (!node.keyframes[property]) {
      node.keyframes[property] = [];
    }
    node.keyframes[property] = insertKeyframe(
      node.keyframes[property],
      keyframe
    );
    this.notify();
  }

  removeKeyframeAt(
    nodeId: string,
    property: string,
    time: number
  ): void {
    const node = this.data.nodes[nodeId];
    if (!node || !node.keyframes[property]) return;
    node.keyframes[property] = removeKeyframe(
      node.keyframes[property],
      time
    );
    this.notify();
  }

  // ── Time Evaluation ──

  /**
   * Evaluate all node states at a specific time.
   * Used by PixiJS renderer to update the canvas.
   */
  evaluateAtTime(time: number): SceneSnapshot {
    const snapshot: SceneSnapshot = {};

    for (const [id, node] of Object.entries(this.data.nodes)) {
      const defaults: Record<string, number> = {
        x: node.transform.x,
        y: node.transform.y,
        scale_x: node.transform.scaleX,
        scale_y: node.transform.scaleY,
        rotation: node.transform.rotation,
        opacity: node.opacity,
        z_index: node.zIndex,
      };

      const ns: NodeSnapshot = {
        id: node.id,
        name: node.name,
        nodeType: node.nodeType,
        x: node.keyframes.x?.length
          ? interpolateKeyframes(node.keyframes.x, time, defaults.x)
          : defaults.x,
        y: node.keyframes.y?.length
          ? interpolateKeyframes(node.keyframes.y, time, defaults.y)
          : defaults.y,
        scaleX: node.keyframes.scale_x?.length
          ? interpolateKeyframes(
              node.keyframes.scale_x,
              time,
              defaults.scale_x
            )
          : defaults.scale_x,
        scaleY: node.keyframes.scale_y?.length
          ? interpolateKeyframes(
              node.keyframes.scale_y,
              time,
              defaults.scale_y
            )
          : defaults.scale_y,
        rotation: node.keyframes.rotation?.length
          ? interpolateKeyframes(
              node.keyframes.rotation,
              time,
              defaults.rotation
            )
          : defaults.rotation,
        opacity: node.keyframes.opacity?.length
          ? interpolateKeyframes(
              node.keyframes.opacity,
              time,
              defaults.opacity
            )
          : defaults.opacity,
        zIndex: node.keyframes.z_index?.length
          ? Math.round(interpolateKeyframes(
              node.keyframes.z_index,
              time,
              defaults.z_index
            ))
          : defaults.z_index,
        visible: node.visible,
        parallaxSpeed: (node as any).parallaxSpeed,
      };

      // Character-specific: evaluate layer timeline
      if (node.nodeType === "character") {
        const charNode = node as CharacterNodeData;
        if (charNode.frameSequence?.length) {
          let layers = { ...charNode.activeLayers };
          for (const frame of charNode.frameSequence) {
            if (frame.time <= time) {
              layers = { ...layers, ...frame.layers };
            } else {
              break;
            }
          }
          ns.activeLayers = layers;
        } else {
          ns.activeLayers = charNode.activeLayers;
        }
      }

      snapshot[id] = ns;
    }

    return snapshot;
  }

  // ── Coordinate Conversion ──

  worldToPixel(x: number, y: number): [number, number] {
    return [x * this.data.ppu, y * this.data.ppu];
  }

  pixelToWorld(px: number, py: number): [number, number] {
    return [px / this.data.ppu, py / this.data.ppu];
  }

  // ── Serialization ──

  /** Load scene graph data from backend JSON response. */
  loadFromBackendResponse(raw: Record<string, unknown>): void {
    const nodes: Record<string, AnyNodeData> = {};
    const rawNodes = raw.nodes as Record<string, Record<string, unknown>>;
    if (rawNodes) {
      for (const [id, nodeRaw] of Object.entries(rawNodes)) {
        nodes[id] = nodeFromBackend(nodeRaw);
      }
    }

    this.data = {
      id: (raw.id as string) ?? this.data.id,
      name: (raw.name as string) ?? this.data.name,
      canvasWidth: (raw.canvas_width as number) ?? this.data.canvasWidth,
      canvasHeight: (raw.canvas_height as number) ?? this.data.canvasHeight,
      ppu: (raw.ppu as number) ?? this.data.ppu,
      fps: (raw.fps as number) ?? this.data.fps,
      duration: (raw.duration as number) ?? this.data.duration,
      rootOrder: (raw.root_order as string[]) ?? Object.keys(nodes),
      nodes,
    };

    this.notify();
  }

  /** Export to dict matching backend format. */
  toBackendDict(): Record<string, unknown> {
    const nodes: Record<string, unknown> = {};
    for (const [id, node] of Object.entries(this.data.nodes)) {
      nodes[id] = {
        id: node.id,
        name: node.name,
        node_type: node.nodeType,
        transform: {
          x: node.transform.x,
          y: node.transform.y,
          scale_x: node.transform.scaleX,
          scale_y: node.transform.scaleY,
          rotation: node.transform.rotation,
        },
        opacity: node.opacity,
        z_index: node.zIndex,
        visible: node.visible,
        parent_id: node.parentId,
        keyframes: node.keyframes,
        metadata: node.metadata,
      };
    }

    return {
      id: this.data.id,
      name: this.data.name,
      canvas_width: this.data.canvasWidth,
      canvas_height: this.data.canvasHeight,
      ppu: this.data.ppu,
      fps: this.data.fps,
      duration: this.data.duration,
      root_order: this.data.rootOrder,
      nodes,
    };
  }

  /** Apply an AI tool call result from the backend. */
  applyToolCall(call: ToolCall): ToolResult {
    try {
      const p = call.params;
      const nodeId = p.object_id as string | undefined;

      switch (call.name) {
        case "set_position": {
          if (!nodeId) return { success: false, error: "Missing object_id" };
          this.updateTransform(nodeId, {
            x: p.x as number,
            y: p.y as number,
          });
          return { success: true };
        }
        case "set_scale": {
          if (!nodeId) return { success: false, error: "Missing object_id" };
          const s = p.scale as number;
          this.updateTransform(nodeId, { scaleX: s, scaleY: s });
          return { success: true };
        }
        case "set_rotation": {
          if (!nodeId) return { success: false, error: "Missing object_id" };
          this.updateTransform(nodeId, { rotation: p.degrees as number });
          return { success: true };
        }
        case "set_opacity": {
          if (!nodeId) return { success: false, error: "Missing object_id" };
          this.updateNode(nodeId, { opacity: p.opacity as number });
          return { success: true };
        }
        case "set_z_index": {
          if (!nodeId) return { success: false, error: "Missing object_id" };
          this.updateNode(nodeId, { zIndex: p.z_index as number });
          return { success: true };
        }
        case "add_keyframe": {
          if (!nodeId) return { success: false, error: "Missing object_id" };
          this.addKeyframe(nodeId, p.property as string, {
            time: p.time as number,
            value: p.value as number,
            easing: (p.easing as Keyframe["easing"]) ?? "linear",
          });
          return { success: true };
        }
        case "remove_keyframe": {
          if (!nodeId) return { success: false, error: "Missing object_id" };
          this.removeKeyframeAt(
            nodeId,
            p.property as string,
            p.time as number
          );
          return { success: true };
        }
        case "remove_object": {
          if (!nodeId) return { success: false, error: "Missing object_id" };
          this.removeNode(nodeId);
          return { success: true };
        }
        default:
          return {
            success: false,
            error: `Unknown tool: ${call.name}`,
          };
      }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
