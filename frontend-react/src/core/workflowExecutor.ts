/**
 * Workflow Executor
 * 
 * Pure function that converts a workflow node graph into CharacterTrack[] data
 * that can be directly used by the Studio/Timeline system.
 * 
 * Flow: (nodes, edges) → find Scene node → traverse connected nodes → generate tracks
 */

import type { Node, Edge } from '@xyflow/react';
import type { CharacterNodeData, BackgroundNodeData, SceneNodeData, StageNodeData } from '@/stores/useWorkflowStore';
import type { CharacterTrack, ActionBlock, TransformData, TimelineKeyframe } from '@/stores/useAppStore';

// ══════════════════════════════════════════════
//  TYPES
// ══════════════════════════════════════════════

export interface ExecutionResult {
    tracks: CharacterTrack[];
    duration: number;
    errors: string[];
}

// ══════════════════════════════════════════════
//  MAIN EXECUTOR
// ══════════════════════════════════════════════

/**
 * Execute a workflow by converting the node graph into CharacterTrack[] data.
 * This is the main entry point for workflow execution.
 */
export function executeWorkflow(nodes: Node[], edges: Edge[]): ExecutionResult {
    const errors: string[] = [];

    // 1. Find the Scene node (compositor / root)
    const sceneNode = nodes.find((n) => n.type === 'scene');
    if (!sceneNode) {
        return { tracks: [], duration: 0, errors: ['No Scene Output node found. Add one and connect your nodes to it.'] };
    }

    const sceneData = sceneNode.data as SceneNodeData;

    // 2. Find all nodes connected TO the scene node (source → target)
    const connectedEdges = edges.filter((e) => e.target === sceneNode.id);
    const connectedNodeIds = connectedEdges.map((e) => e.source);
    const connectedNodes = nodes.filter((n) => connectedNodeIds.includes(n.id));

    if (connectedNodes.length === 0) {
        return { tracks: [], duration: 0, errors: ['No nodes connected to the Scene Output. Connect Character or Background nodes.'] };
    }

    // 3. Process each connected node into tracks
    const tracks: CharacterTrack[] = [];
    let maxDuration = 0;

    // Sort by z-index for proper layering
    const sortedNodes = [...connectedNodes].sort((a, b) => {
        const aZ = (a.data as any)?.zIndex ?? 0;
        const bZ = (b.data as any)?.zIndex ?? 0;
        return aZ - bZ;
    });

    for (const node of sortedNodes) {
        switch (node.type) {
            case 'character': {
                const result = processCharacterNode(node, sceneData);
                if (result.error) errors.push(result.error);
                if (result.track) {
                    tracks.push(result.track);
                    maxDuration = Math.max(maxDuration, result.duration);
                }
                break;
            }
            case 'background': {
                const result = processBackgroundNode(node, sceneData);
                if (result.error) errors.push(result.error);
                if (result.track) {
                    tracks.push(result.track);
                    maxDuration = Math.max(maxDuration, result.duration);
                }
                break;
            }
            case 'stage': {
                const results = processStageNode(node, sceneData);
                for (const result of results) {
                    if (result.error) errors.push(result.error);
                    if (result.track) {
                        tracks.push(result.track);
                        maxDuration = Math.max(maxDuration, result.duration);
                    }
                }
                break;
            }
            default:
                errors.push(`Unknown node type: ${node.type}`);
        }
    }

    return {
        tracks,
        duration: maxDuration || sceneData.totalDuration || 5,
        errors,
    };
}

// ══════════════════════════════════════════════
//  NODE PROCESSORS
// ══════════════════════════════════════════════

function processCharacterNode(
    node: Node,
    _sceneData: SceneNodeData
): { track: CharacterTrack | null; duration: number; error?: string } {
    const data = node.data as CharacterNodeData;

    if (!data.characterId) {
        return { track: null, duration: 0, error: `Character node "${data.label}" has no character assigned.` };
    }

    if (data.sequence.length === 0) {
        return { track: null, duration: 0, error: `Character node "${data.label}" has no pose frames. Double-click to add poses.` };
    }

    // Convert PoseFrame sequence → ActionBlock[]
    const actions: ActionBlock[] = [];
    let currentTime = 0;

    for (let i = 0; i < data.sequence.length; i++) {
        const frame = data.sequence[i];

        // Each PoseFrame creates one ActionBlock per visible layer
        // For simplicity, we use the first layer's hash as the main asset
        const layerHashes = Object.values(frame.layers);
        const mainHash = layerHashes[0] || '';

        if (mainHash) {
            actions.push({
                id: `action-${node.id}-${i}`,
                assetHash: mainHash,
                start: currentTime,
                end: currentTime + frame.duration,
                zIndex: data.zIndex,
            });
        }

        // Also create actions for additional layers (multi-layer frame)
        for (let j = 1; j < layerHashes.length; j++) {
            actions.push({
                id: `action-${node.id}-${i}-layer-${j}`,
                assetHash: layerHashes[j],
                start: currentTime,
                end: currentTime + frame.duration,
                zIndex: data.zIndex + j,
            });
        }

        currentTime += frame.duration;

        // Account for transition overlap
        if (frame.transition === 'crossfade' && i < data.sequence.length - 1) {
            currentTime -= frame.transitionDuration; // overlap
        }
    }

    // Create transform data with character position/scale/opacity
    const transform = createTransform({
        x: data.posX,
        y: data.posY,
        scale: data.scale,
        opacity: data.opacity,
    });

    const track: CharacterTrack = {
        id: `track-${node.id}`,
        name: data.characterName || data.label,
        characterId: data.characterId,
        transform,
        actions,
        isExpanded: true,
    };

    return { track, duration: currentTime };
}

function processBackgroundNode(
    node: Node,
    sceneData: SceneNodeData
): { track: CharacterTrack | null; duration: number; error?: string } {
    const data = node.data as BackgroundNodeData;

    if (!data.assetHash) {
        return { track: null, duration: 0, error: `Background node "${data.label}" has no asset selected.` };
    }

    // Background gets a single action spanning the entire duration
    // Duration will be determined by the longest character track
    const duration = sceneData.totalDuration || 10; // placeholder, will be recalculated

    const actions: ActionBlock[] = [
        {
            id: `action-bg-${node.id}`,
            assetHash: data.assetHash,
            start: 0,
            end: duration,
            zIndex: 0, // Always at the back
        },
    ];

    const transform = createTransform({
        x: sceneData.canvasWidth / 2,
        y: sceneData.canvasHeight / 2,
        scale: 1,
        opacity: 1,
    });

    const track: CharacterTrack = {
        id: `track-bg-${node.id}`,
        name: data.label || 'Background',
        transform,
        actions,
        isExpanded: false,
    };

    return { track, duration };
}

function processStageNode(
    node: Node,
    sceneData: SceneNodeData
): { track: CharacterTrack | null; duration: number; error?: string }[] {
    const data = node.data as StageNodeData;
    const results: { track: CharacterTrack | null; duration: number; error?: string }[] = [];

    if (!data.layers || data.layers.length === 0) {
        results.push({ track: null, duration: 0, error: `Stage node "${data.label}" has no layers.` });
        return results;
    }

    const duration = sceneData.totalDuration || 10;

    for (const layer of data.layers) {
        if (!layer.visible || !layer.assetPath) continue;

        const actions: ActionBlock[] = [{
            id: `action-stage-${node.id}-${layer.id}`,
            assetHash: layer.assetPath,
            start: 0,
            end: duration,
            zIndex: layer.zIndex,
        }];

        const transform = createTransform({
            x: layer.posX,
            y: layer.posY,
            scale: layer.scale,
            opacity: layer.opacity,
        });

        results.push({
            track: {
                id: `track-stage-${node.id}-${layer.id}`,
                name: `${data.label} / ${layer.label}`,
                transform,
                actions,
                isExpanded: false,
            },
            duration,
        });
    }

    return results;
}

// ══════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════

/** Create a static TransformData object (all properties constant across time) */
function createTransform(props: {
    x: number;
    y: number;
    scale: number;
    opacity: number;
}): TransformData {
    const kf = (value: number): TimelineKeyframe[] => [{ time: 0, value, easing: 'linear' }];

    return {
        x: kf(props.x),
        y: kf(props.y),
        scale: kf(props.scale),
        rotation: kf(0),
        opacity: kf(props.opacity),
        anchorX: kf(0.5),
        anchorY: kf(0.5),
    };
}
