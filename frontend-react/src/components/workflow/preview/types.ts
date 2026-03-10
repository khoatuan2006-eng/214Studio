import type { PoseFrame, CharacterNodeData } from '@/stores/useWorkflowStore';
import { STATIC_BASE, type Character } from '@/stores/useAppStore';

// ══════════════════════════════════════
//  SHARED TYPES
// ══════════════════════════════════════

export interface WorkflowPreviewProps {
    onClose: () => void;
}

/** Resolved frame with actual image URLs for rendering */
export interface ResolvedFrame {
    nodeId: string;
    nodeName: string;
    frameIndex: number;
    duration: number;
    transition: 'cut' | 'crossfade';
    transitionDuration: number;
    layerImages: { groupName: string; url: string; zIndex: number }[];
    posX: number;
    posY: number;
    scale: number;
    opacity: number;
    startX: number;
    startY: number;
    endX: number;
    endY: number;
}

/** A timeline track for one character */
export interface PreviewTrack {
    nodeId: string;
    characterName: string;
    frames: ResolvedFrame[];
    totalDuration: number;
}

// ══════════════════════════════════════
//  HELPER FUNCTIONS
// ══════════════════════════════════════

/** Resolve a PoseFrame's layer selections into actual image URLs */
export function resolveFrameLayers(
    frame: PoseFrame,
    character: Character
): { groupName: string; url: string; zIndex: number }[] {
    const result: { groupName: string; url: string; zIndex: number }[] = [];

    for (const [groupName, hash] of Object.entries(frame.layers)) {
        const assets = character.layer_groups[groupName];
        if (!assets) continue;

        const asset = assets.find((a) => a.hash === hash || a.name === hash);
        if (!asset) continue;

        const url = asset.path ? `${STATIC_BASE}/${asset.path}` : '';
        if (!url) continue;

        const groupIndex = character.group_order.indexOf(groupName);
        result.push({
            groupName,
            url,
            zIndex: groupIndex >= 0 ? groupIndex : 0,
        });
    }

    return result;
}

/** Interpolate position from keyframes at a given time */
export function getInterpolatedPos(
    data: CharacterNodeData,
    time: number
): { x: number; y: number } {
    const kfs = data.positionKeyframes;
    if (!kfs || kfs.length === 0) return { x: data.posX, y: data.posY };
    if (kfs.length === 1) return { x: kfs[0].x, y: kfs[0].y };
    if (time <= kfs[0].time) return { x: kfs[0].x, y: kfs[0].y };
    if (time >= kfs[kfs.length - 1].time) return { x: kfs[kfs.length - 1].x, y: kfs[kfs.length - 1].y };

    // Find the two keyframes to interpolate between
    for (let i = 0; i < kfs.length - 1; i++) {
        if (time >= kfs[i].time && time <= kfs[i + 1].time) {
            const t = (time - kfs[i].time) / (kfs[i + 1].time - kfs[i].time);
            return {
                x: Math.round(kfs[i].x + (kfs[i + 1].x - kfs[i].x) * t),
                y: Math.round(kfs[i].y + (kfs[i + 1].y - kfs[i].y) * t),
            };
        }
    }
    return { x: data.posX, y: data.posY };
}

/** Interpolate z-index from keyframes at a given time */
export function getInterpolatedZIndex(
    data: CharacterNodeData,
    time: number
): number {
    const kfs = data.zIndexKeyframes;
    if (!kfs || kfs.length === 0) return data.zIndex;
    if (kfs.length === 1) return kfs[0].z;
    if (time <= kfs[0].time) return kfs[0].z;
    if (time >= kfs[kfs.length - 1].time) return kfs[kfs.length - 1].z;

    for (let i = 0; i < kfs.length - 1; i++) {
        if (time >= kfs[i].time && time <= kfs[i + 1].time) {
            const t = (time - kfs[i].time) / (kfs[i + 1].time - kfs[i].time);
            return Math.round(kfs[i].z + (kfs[i + 1].z - kfs[i].z) * t);
        }
    }
    return data.zIndex;
}

/** Get the active frame for a track at a given time */
export function getActiveFrame(
    track: PreviewTrack,
    currentTime: number
): { frame: ResolvedFrame; progress: number } | null {
    let elapsed = 0;
    for (const frame of track.frames) {
        if (currentTime >= elapsed && currentTime < elapsed + frame.duration) {
            const progress = (currentTime - elapsed) / frame.duration;
            return { frame, progress };
        }
        elapsed += frame.duration;
    }
    if (track.frames.length > 0 && currentTime >= elapsed) {
        return { frame: track.frames[track.frames.length - 1], progress: 1 };
    }
    return null;
}
