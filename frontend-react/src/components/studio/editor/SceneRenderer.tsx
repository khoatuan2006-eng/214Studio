/**
 * SceneRenderer — Imperative PixiJS renderer for Scene Graph nodes.
 *
 * Instead of using React Pixi JSX elements, this component manages
 * PIXI.Application and sprites imperatively for full control over
 * character compositing (pose + face overlay).
 *
 * Flow:
 * 1. useSceneGraphStore.snapshot changes (via evaluate)
 * 2. This component diffs the snapshot against current sprites
 * 3. Creates/updates/removes PIXI.Sprites as needed
 * 4. Character = Container { poseSprite, faceSprite, nameLabel }
 */

import React, { useRef, useEffect, useCallback } from 'react';
import * as PIXI from 'pixi.js';
import { useSceneGraphStore } from '@/stores/useSceneGraphStore';
import type { CharacterFull } from '@/stores/useSceneGraphStore';
import type { NodeSnapshot } from '@/core/scene-graph/types';
import { API_BASE_URL } from '@/config/api';

const CANVAS_W = 1920;
const CANVAS_H = 1080;

// ══════════════════════════════════════════════
//  Character Container — manages pose + face sprites
// ══════════════════════════════════════════════
class CharacterDisplayObject {
    container: PIXI.Container;
    poseSprite: PIXI.Sprite | null = null;
    faceSprite: PIXI.Sprite | null = null;
    label: PIXI.Text;

    private currentPoseUrl: string = '';
    private currentFaceUrl: string = '';

    constructor(name: string) {
        this.container = new PIXI.Container();
        this.container.sortableChildren = true;

        // Name label at bottom
        this.label = new PIXI.Text({
            text: name,
            style: {
                fontSize: 20,
                fontFamily: 'Inter, Arial, sans-serif',
                fontWeight: '600',
                fill: 0xffffff,
                stroke: { color: 0x000000, width: 4 },
            }
        });
        this.label.anchor.set(0.5, 0);
        this.label.zIndex = 100;
        this.container.addChild(this.label);
    }

    async updatePose(url: string): Promise<void> {
        if (url === this.currentPoseUrl && this.poseSprite) return;
        this.currentPoseUrl = url;

        try {
            const fullUrl = url.startsWith('http') ? url : `${API_BASE_URL}${url}`;
            const texture = await PIXI.Assets.load(fullUrl);
            
            if (this.poseSprite) {
                this.container.removeChild(this.poseSprite);
            }
            this.poseSprite = new PIXI.Sprite(texture);
            this.poseSprite.anchor.set(0.5, 0.85);
            this.poseSprite.zIndex = 0;
            this.container.addChild(this.poseSprite);
        } catch (err) {
            console.warn(`[SceneRenderer] Failed to load pose: ${url}`, err);
        }
    }

    async updateFace(url: string): Promise<void> {
        if (url === this.currentFaceUrl && this.faceSprite) return;
        this.currentFaceUrl = url;

        try {
            const fullUrl = url.startsWith('http') ? url : `${API_BASE_URL}${url}`;
            const texture = await PIXI.Assets.load(fullUrl);
            
            if (this.faceSprite) {
                this.container.removeChild(this.faceSprite);
            }
            this.faceSprite = new PIXI.Sprite(texture);
            this.faceSprite.anchor.set(0.5, 0.85);
            this.faceSprite.zIndex = 1; // On top of pose
            this.container.addChild(this.faceSprite);
        } catch (err) {
            console.warn(`[SceneRenderer] Failed to load face: ${url}`, err);
        }
    }

    update(snap: NodeSnapshot, ppu: number): void {
        // Convert world coordinates to pixel coordinates
        const px = snap.x * ppu;
        const py = snap.y * ppu;

        this.container.position.set(px, py);
        this.container.scale.set(snap.scaleX, snap.scaleY);
        this.container.rotation = (snap.rotation || 0) * Math.PI / 180;
        this.container.alpha = snap.opacity;
        this.container.visible = snap.visible;
        this.container.zIndex = snap.zIndex;

        // Update label position below character
        if (this.poseSprite) {
            this.label.y = (this.poseSprite.height * 0.15) / snap.scaleY;
        } else {
            this.label.y = 50;
        }
    }

    destroy(): void {
        this.container.destroy({ children: true });
    }
}

// ══════════════════════════════════════════════
//  Background rendering helper
// ══════════════════════════════════════════════
function drawBackground(g: PIXI.Graphics): void {
    // Night sky gradient (approximated with filled rects)
    g.clear();

    // Sky
    g.rect(0, 0, CANVAS_W, CANVAS_H * 0.65);
    g.fill(0x1a1c2e);

    // Ground
    g.rect(0, CANVAS_H * 0.65, CANVAS_W, CANVAS_H * 0.35);
    g.fill(0x3d5a32);

    // Simple mountain silhouettes
    g.moveTo(0, CANVAS_H * 0.5);
    for (let x = 0; x <= CANVAS_W; x += 40) {
        const y = CANVAS_H * 0.4 + Math.sin(x * 0.008) * 60 + Math.sin(x * 0.015) * 30;
        g.lineTo(x, y);
    }
    g.lineTo(CANVAS_W, CANVAS_H * 0.65);
    g.lineTo(0, CANVAS_H * 0.65);
    g.fill(0x2d2650);
}

// ══════════════════════════════════════════════
//  SceneRenderer Component
// ══════════════════════════════════════════════
export const SceneRenderer: React.FC = () => {
    const canvasRef = useRef<HTMLDivElement>(null);
    const appRef = useRef<PIXI.Application | null>(null);
    const charsRef = useRef<Map<string, CharacterDisplayObject>>(new Map());
    const bgRef = useRef<PIXI.Graphics | null>(null);
    const sceneContainerRef = useRef<PIXI.Container | null>(null);

    const snapshot = useSceneGraphStore(s => s.snapshot);
    const manager = useSceneGraphStore(s => s.manager);
    const characterCache = useSceneGraphStore(s => s.characterCache);

    // ── Initialize PIXI Application ──
    useEffect(() => {
        if (!canvasRef.current) return;
        if (appRef.current) return; // Already initialized

        let cancelled = false;
        const app = new PIXI.Application();

        app.init({
            width: CANVAS_W,
            height: CANVAS_H,
            backgroundColor: 0x111118,
            antialias: true,
            resolution: 1,
        }).then(() => {
            if (cancelled || !canvasRef.current) {
                // Component unmounted before init finished — destroy safely
                try { app.destroy(true); } catch (_) {}
                return;
            }
            canvasRef.current.appendChild(app.canvas as HTMLCanvasElement);
            appRef.current = app;

            // Background
            const bg = new PIXI.Graphics();
            drawBackground(bg);
            bg.zIndex = -1000;
            app.stage.addChild(bg);
            bgRef.current = bg;

            // Scene container (everything except background)
            const container = new PIXI.Container();
            container.sortableChildren = true;
            app.stage.addChild(container);
            app.stage.sortableChildren = true;
            sceneContainerRef.current = container;
        }).catch(err => {
            console.warn('[SceneRenderer] PIXI init failed:', err);
        });

        return () => {
            cancelled = true;
            charsRef.current.forEach(c => c.destroy());
            charsRef.current.clear();
            if (appRef.current) {
                try { appRef.current.destroy(true); } catch (_) {}
                appRef.current = null;
            }
        };
    }, []);

    // ── Sync snapshot to PIXI sprites ──
    useEffect(() => {
        const container = sceneContainerRef.current;
        if (!container) return;

        const ppu = manager.graph.ppu || 100;
        const chars = charsRef.current;
        const activeIds = new Set<string>();

        // Process each node in snapshot
        for (const [nodeId, snap] of Object.entries(snapshot)) {
            if (snap.nodeType !== 'character') continue;
            activeIds.add(nodeId);

            // Get or create CharacterDisplayObject
            let charObj = chars.get(nodeId);
            if (!charObj) {
                charObj = new CharacterDisplayObject(snap.name);
                chars.set(nodeId, charObj);
                container.addChild(charObj.container);
            }

            // Update transform
            charObj.update(snap, ppu);

            // Update pose/face textures
            const node = manager.getNode(nodeId);
            if (node) {
                const poseUrl = node.metadata?.poseUrl as string;
                const faceUrl = node.metadata?.faceUrl as string;

                // Get current active layers to find URLs
                const activePose = snap.activeLayers?.pose || (node as any).activeLayers?.pose;
                const activeFace = snap.activeLayers?.face || (node as any).activeLayers?.face;

                const poseUrls = node.metadata?.poseUrls as Record<string, { url: string }> | undefined;
                const faceUrls = node.metadata?.faceUrls as Record<string, { url: string }> | undefined;

                const resolvedPoseUrl = poseUrls?.[activePose]?.url || poseUrl || '';
                const resolvedFaceUrl = faceUrls?.[activeFace]?.url || faceUrl || '';

                if (resolvedPoseUrl) charObj.updatePose(resolvedPoseUrl);
                if (resolvedFaceUrl) charObj.updateFace(resolvedFaceUrl);
            }
        }

        // Remove characters no longer in snapshot
        chars.forEach((charObj, id) => {
            if (!activeIds.has(id)) {
                container.removeChild(charObj.container);
                charObj.destroy();
                chars.delete(id);
            }
        });

    }, [snapshot, manager]);

    // ── Playback animation loop ──
    useEffect(() => {
        let rafId: number;
        let lastTime = performance.now();

        const tick = (now: number) => {
            const dt = (now - lastTime) / 1000;
            lastTime = now;
            useSceneGraphStore.getState().tick(dt);
            rafId = requestAnimationFrame(tick);
        };

        rafId = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafId);
    }, []);

    return (
        <div
            ref={canvasRef}
            style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
            }}
        />
    );
};
