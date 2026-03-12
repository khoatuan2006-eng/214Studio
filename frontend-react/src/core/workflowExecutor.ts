/**
 * Workflow Executor
 * 
 * Pure function that converts a workflow node graph into CharacterTrack[] data
 * that can be directly used by the Studio/Timeline system.
 * 
 * Flow: (nodes, edges) → find Scene node → traverse connected nodes → generate tracks
 */

import type { Node, Edge } from '@xyflow/react';
import type { CharacterNodeData, SceneNodeData, StageNodeData } from '@/stores/useWorkflowStore';
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

    const startDelay = data.startDelay || 0;

    // Convert PoseFrame sequence → ActionBlock[]
    const actions: ActionBlock[] = [];
    let currentTime = startDelay; // offset by startDelay

    for (let i = 0; i < data.sequence.length; i++) {
        const frame = data.sequence[i];

        // Each PoseFrame creates one ActionBlock per visible layer
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

    // ═══ BUILD TRANSFORM FROM KEYFRAMES ═══
    // Convert character keyframe arrays → TimelineKeyframe[] for the renderer

    const transform = buildCharacterTransform(data, startDelay);

    // ═══ z-index keyframes → update action zIndex ═══
    // If zIndexKeyframes exist, use the first z value as the base zIndex
    if (data.zIndexKeyframes && data.zIndexKeyframes.length > 0) {
        const baseZ = data.zIndexKeyframes[0].z;
        for (const action of actions) {
            // Offset each action's zIndex relative to the base  
            const layerOffset = action.zIndex - data.zIndex;
            action.zIndex = baseZ + layerOffset;
        }
    }

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


/**
 * Build a full TransformData from CharacterNodeData, converting all 5 keyframe
 * tracks into the TimelineKeyframe[] format the renderer expects.
 *
 * Handles:
 *  - positionKeyframes → transform.x + transform.y
 *  - scaleKeyframes → transform.scale
 *  - rotationKeyframes → transform.rotation
 *  - flipX / flipXKeyframes → applied as negative scale
 *  - startDelay → offsets all keyframe times
 *  - Falls back to static values when no keyframes exist
 */
function buildCharacterTransform(data: CharacterNodeData, startDelay: number): TransformData {
    const kf = (value: number, easing: string = 'linear'): TimelineKeyframe[] =>
        [{ time: 0, value, easing: easing as any }];

    // ── Position keyframes → transform.x, transform.y ──
    let xKeyframes: TimelineKeyframe[];
    let yKeyframes: TimelineKeyframe[];

    if (data.positionKeyframes && data.positionKeyframes.length > 0) {
        xKeyframes = data.positionKeyframes.map(pk => ({
            time: pk.time + startDelay,
            value: pk.x,
            easing: 'linear' as const,
        }));
        yKeyframes = data.positionKeyframes.map(pk => ({
            time: pk.time + startDelay,
            value: pk.y,
            easing: 'linear' as const,
        }));
    } else {
        xKeyframes = kf(data.posX);
        yKeyframes = kf(data.posY);
    }

    // ── Scale keyframes → transform.scale ──
    let scaleKeyframes: TimelineKeyframe[];

    if (data.scaleKeyframes && data.scaleKeyframes.length > 0) {
        scaleKeyframes = data.scaleKeyframes.map(sk => ({
            time: sk.time + startDelay,
            value: sk.scale,
            easing: 'linear' as const,
        }));
    } else {
        scaleKeyframes = kf(data.scale);
    }

    // ── FlipX handling ──
    // The renderer uses positive/negative scale for flipping.
    // If flipX is true, negate all scale values.
    // If flipXKeyframes exist, we handle it by creating separate scale sign changes.
    // For now, apply the static flipX to scale sign (simplest correct approach).
    const shouldFlip = data.flipX ?? false;

    if (data.flipXKeyframes && data.flipXKeyframes.length > 0) {
        // For animated flipX, we need to segment scale keyframes with sign changes.
        // Strategy: find the flipX state at each scale keyframe time and apply sign.
        scaleKeyframes = scaleKeyframes.map(sk => {
            const flipState = getFlipStateAtTime(
                data.flipXKeyframes!,
                sk.time - startDelay // compare in character-local time
            );
            return {
                ...sk,
                value: flipState ? -Math.abs(sk.value) : Math.abs(sk.value),
            };
        });

        // Also inject scale keyframes at flipX transition times
        for (const fk of data.flipXKeyframes) {
            const flipTime = fk.time + startDelay;
            // Check if a scale keyframe already exists at this time
            const exists = scaleKeyframes.some(sk => Math.abs(sk.time - flipTime) < 0.01);
            if (!exists) {
                // Interpolate scale at this time from existing keyframes
                const scaleAtTime = interpolateValue(scaleKeyframes, flipTime);
                scaleKeyframes.push({
                    time: flipTime,
                    value: fk.flipX ? -Math.abs(scaleAtTime) : Math.abs(scaleAtTime),
                    easing: 'step' as const, // instant flip
                });
            }
        }
        // Re-sort by time
        scaleKeyframes.sort((a, b) => a.time - b.time);
    } else if (shouldFlip) {
        // Static flipX: negate all scale values
        scaleKeyframes = scaleKeyframes.map(sk => ({
            ...sk,
            value: -Math.abs(sk.value),
        }));
    }

    // ── Rotation keyframes → transform.rotation ──
    let rotationKeyframes: TimelineKeyframe[];

    if (data.rotationKeyframes && data.rotationKeyframes.length > 0) {
        rotationKeyframes = data.rotationKeyframes.map(rk => ({
            time: rk.time + startDelay,
            value: rk.rotation,
            easing: 'linear' as const,
        }));
    } else {
        rotationKeyframes = kf(0);
    }

    return {
        x: xKeyframes,
        y: yKeyframes,
        scale: scaleKeyframes,
        rotation: rotationKeyframes,
        opacity: kf(data.opacity),
        anchorX: kf(0.5),
        anchorY: kf(0.5),
    };
}


/**
 * Get the flipX state at a given time by step-interpolating flipXKeyframes.
 * FlipX uses step interpolation: value holds until the next keyframe.
 */
function getFlipStateAtTime(flipKeyframes: { time: number; flipX: boolean }[], time: number): boolean {
    if (!flipKeyframes || flipKeyframes.length === 0) return false;
    // Find the last keyframe at or before the given time
    let state = flipKeyframes[0].flipX;
    for (const fk of flipKeyframes) {
        if (fk.time <= time) {
            state = fk.flipX;
        } else {
            break;
        }
    }
    return state;
}


/**
 * Simple linear interpolation between TimelineKeyframes at a given time.
 * Used to compute scale values at flipX transition points.
 */
function interpolateValue(keyframes: TimelineKeyframe[], time: number): number {
    if (!keyframes || keyframes.length === 0) return 1;
    if (keyframes.length === 1) return Math.abs(keyframes[0].value);
    if (time <= keyframes[0].time) return Math.abs(keyframes[0].value);
    if (time >= keyframes[keyframes.length - 1].time) return Math.abs(keyframes[keyframes.length - 1].value);

    for (let i = 0; i < keyframes.length - 1; i++) {
        if (time >= keyframes[i].time && time <= keyframes[i + 1].time) {
            const t = (time - keyframes[i].time) / (keyframes[i + 1].time - keyframes[i].time);
            return Math.abs(keyframes[i].value + (keyframes[i + 1].value - keyframes[i].value) * t);
        }
    }
    return Math.abs(keyframes[0].value);
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

        const transform = createStaticTransform({
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
function createStaticTransform(props: {
    x: number;
    y: number;
    scale?: number;
    opacity?: number;
}): TransformData {
    const kf = (value: number): TimelineKeyframe[] => [{ time: 0, value, easing: 'linear' }];

    return {
        x: kf(props.x),
        y: kf(props.y),
        scale: kf(props.scale ?? 1),
        rotation: kf(0),
        opacity: kf(props.opacity ?? 1),
        anchorX: kf(0.5),
        anchorY: kf(0.5),
    };
}
