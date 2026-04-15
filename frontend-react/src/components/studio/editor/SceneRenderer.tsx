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
 *
 * Rendering layers (back to front):
 * 1. Placeholder background (hidden when real BG layers exist)
 * 2. Background container (parallax layers, responds to camera)
 * 3. Scene container (characters, props — fully affected by camera)
 * 4. Subtitle container (text overlays — NOT affected by camera)
 */

import React, { useRef, useEffect, useCallback } from 'react';
import * as PIXI from 'pixi.js';
import { useSceneGraphStore } from '@/stores/useSceneGraphStore';
import type { CharacterFull } from '@/stores/useSceneGraphStore';
import type { NodeSnapshot } from '@/core/scene-graph/types';
import { TransitionRenderer } from '@/core/renderer/TransitionRenderer';
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
        const px = snap.x * ppu;
        const py = snap.y * ppu;

        this.container.position.set(px, py);
        this.container.scale.set(snap.scaleX, snap.scaleY);
        this.container.rotation = (snap.rotation || 0) * Math.PI / 180;
        this.container.alpha = snap.opacity;
        this.container.visible = snap.visible;
        this.container.zIndex = snap.zIndex;

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
//  Background rendering helper (placeholder)
// ══════════════════════════════════════════════
function drawBackground(g: PIXI.Graphics): void {
    g.clear();
    g.rect(0, 0, CANVAS_W, CANVAS_H * 0.65);
    g.fill(0x1a1c2e);
    g.rect(0, CANVAS_H * 0.65, CANVAS_W, CANVAS_H * 0.35);
    g.fill(0x3d5a32);
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
//  Background Display Object — single background layer sprite
// ══════════════════════════════════════════════
class BackgroundDisplayObject {
    container: PIXI.Container;
    sprite: PIXI.Sprite | null = null;
    private currentUrl: string = '';

    constructor() {
        this.container = new PIXI.Container();
    }

    async updateTexture(url: string): Promise<void> {
        if (url === this.currentUrl && this.sprite) return;
        this.currentUrl = url;

        try {
            const fullUrl = url.startsWith('http') ? url : `${API_BASE_URL}${url}`;
            const texture = await PIXI.Assets.load(fullUrl);
            
            if (this.sprite) {
                this.container.removeChild(this.sprite);
            }
            this.sprite = new PIXI.Sprite(texture);
            this.sprite.anchor.set(0, 0);
            
            const scaleX = CANVAS_W / texture.width;
            const scaleY = CANVAS_H / texture.height;
            const coverScale = Math.max(scaleX, scaleY);
            this.sprite.scale.set(coverScale, coverScale);
            
            this.container.addChild(this.sprite);
        } catch (err) {
            console.warn(`[SceneRenderer] Failed to load background layer: ${url}`, err);
        }
    }

    update(snap: NodeSnapshot, cameraSnap: NodeSnapshot | null, ppu: number): void {
        this.container.alpha = snap.opacity;
        this.container.visible = snap.visible;
        this.container.zIndex = snap.zIndex;

        if (cameraSnap && snap.parallaxSpeed !== undefined && snap.parallaxSpeed > 0) {
            const p = snap.parallaxSpeed;
            const cX = cameraSnap.x * ppu;
            const cY = cameraSnap.y * ppu;
            const cS = cameraSnap.scaleX || 1;

            const effS = 1 + (cS - 1) * p;
            this.container.pivot.set(cX, cY);

            const pX = cX + ((CANVAS_W / 2) - cX) * p;
            const pY = cY + ((CANVAS_H / 2) - cY) * p;

            this.container.position.set(pX, pY);
            this.container.scale.set(effS);
            
            const effR = -(cameraSnap.rotation || 0) * Math.PI / 180 * p;
            this.container.rotation = effR;
        } else {
            this.container.pivot.set(0, 0);
            this.container.position.set(0, 0);
            this.container.scale.set(1);
            this.container.rotation = 0;
        }
    }

    destroy(): void {
        this.container.destroy({ children: true });
    }
}

// ══════════════════════════════════════════════
//  Subtitle Display Object — cinematic text overlay
//  Positioned at bottom of canvas. NOT affected by camera.
// ══════════════════════════════════════════════
class SubtitleDisplayObject {
    container: PIXI.Container;
    private bgGraphics: PIXI.Graphics;
    private textObj: PIXI.Text;
    private currentContent: string = '';

    constructor() {
        this.container = new PIXI.Container();
        
        this.bgGraphics = new PIXI.Graphics();
        this.container.addChild(this.bgGraphics);
        
        this.textObj = new PIXI.Text({
            text: '',
            style: {
                fontSize: 36,
                fontFamily: '"Noto Sans SC", "Inter", "Arial", sans-serif',
                fontWeight: '600',
                fill: 0xffffff,
                stroke: { color: 0x000000, width: 5 },
                wordWrap: true,
                wordWrapWidth: CANVAS_W * 0.85,
                align: 'center',
            }
        });
        this.textObj.anchor.set(0.5, 1);
        this.container.addChild(this.textObj);
    }

    update(snap: NodeSnapshot, content: string): void {
        this.container.alpha = snap.opacity;
        this.container.visible = snap.visible && content.length > 0;
        this.container.zIndex = snap.zIndex;

        if (content !== this.currentContent) {
            this.currentContent = content;
            this.textObj.text = content;

            // Position: bottom center of canvas
            this.textObj.position.set(CANVAS_W / 2, CANVAS_H - 40);

            // Draw semi-transparent background bar
            this.bgGraphics.clear();
            if (content.length > 0) {
                const textBounds = this.textObj.getBounds();
                const padX = 30;
                const padY = 12;
                const barW = Math.min(textBounds.width + padX * 2, CANVAS_W);
                const barH = textBounds.height + padY * 2;
                const barX = (CANVAS_W - barW) / 2;
                const barY = CANVAS_H - 40 - textBounds.height - padY;

                this.bgGraphics.roundRect(barX, barY, barW, barH, 8);
                this.bgGraphics.fill({ color: 0x000000, alpha: 0.6 });
            }
        }
    }

    destroy(): void {
        this.container.destroy({ children: true });
    }
}

// ══════════════════════════════════════════════
//  Main Scene Renderer Component
// ══════════════════════════════════════════════
export const SceneRenderer: React.FC = () => {
    const canvasRef = useRef<HTMLDivElement>(null);
    const appRef = useRef<PIXI.Application | null>(null);
    const sceneContainerRef = useRef<PIXI.Container | null>(null);
    const bgContainerRef = useRef<PIXI.Container | null>(null);
    const subtitleContainerRef = useRef<PIXI.Container | null>(null);
    const placeholderBgRef = useRef<PIXI.Graphics | null>(null);
    const transitionRef = useRef<TransitionRenderer | null>(null);
    const charsRef = useRef(new Map<string, CharacterDisplayObject>());
    const bgsRef = useRef(new Map<string, BackgroundDisplayObject>());
    const subsRef = useRef(new Map<string, SubtitleDisplayObject>());

    const snapshot = useSceneGraphStore(s => s.snapshot);
    const manager = useSceneGraphStore(s => s.manager);
    const activeTransition = useSceneGraphStore(s => s.activeTransition);

    // ── Initialize PixiJS ──
    useEffect(() => {
        if (!canvasRef.current) return;
        let cancelled = false;

        const app = new PIXI.Application();
        appRef.current = app;

        app.init({
            width: CANVAS_W,
            height: CANVAS_H,
            backgroundColor: 0x0d0d14,
            antialias: true,
            resolution: window.devicePixelRatio || 1,
            autoDensity: true,
        }).then(() => {
            if (cancelled || !canvasRef.current) return;

            const canvas = app.canvas as HTMLCanvasElement;
            canvas.style.width = '100%';
            canvas.style.height = '100%';
            canvas.style.objectFit = 'contain';
            canvasRef.current.appendChild(canvas);

            app.stage.sortableChildren = true;

            // Layer 1: Placeholder background
            const bgPlaceholder = new PIXI.Graphics();
            drawBackground(bgPlaceholder);
            bgPlaceholder.zIndex = -2000;
            app.stage.addChild(bgPlaceholder);
            placeholderBgRef.current = bgPlaceholder;

            // Layer 2: Background container (parallax, responds to camera)
            const bgContainer = new PIXI.Container();
            bgContainer.sortableChildren = true;
            bgContainer.zIndex = -1000;
            app.stage.addChild(bgContainer);
            bgContainerRef.current = bgContainer;

            // Layer 3: Scene container (characters — affected by camera)
            const container = new PIXI.Container();
            container.sortableChildren = true;
            app.stage.addChild(container);
            sceneContainerRef.current = container;

            // Layer 4: Subtitle container (NOT affected by camera)
            const subtitleContainer = new PIXI.Container();
            subtitleContainer.sortableChildren = true;
            subtitleContainer.zIndex = 9000;
            app.stage.addChild(subtitleContainer);
            subtitleContainerRef.current = subtitleContainer;

            // Layer 5: Transition overlay (fade-to-black between scenes)
            transitionRef.current = new TransitionRenderer(app.stage);
        }).catch(err => {
            console.warn('[SceneRenderer] PIXI init failed:', err);
        });

        return () => {
            cancelled = true;
            charsRef.current.forEach(c => c.destroy());
            charsRef.current.clear();
            bgsRef.current.forEach(b => b.destroy());
            bgsRef.current.clear();
            subsRef.current.forEach(s => s.destroy());
            subsRef.current.clear();
            if (transitionRef.current) {
                transitionRef.current.destroy();
                transitionRef.current = null;
            }
            if (appRef.current) {
                try { appRef.current.destroy(true); } catch (_) {}
                appRef.current = null;
            }
        };
    }, []);

    // ── Sync snapshot to PIXI sprites ──
    useEffect(() => {
        const container = sceneContainerRef.current;
        const bgContainer = bgContainerRef.current;
        const subtitleContainer = subtitleContainerRef.current;
        if (!container) return;

        const ppu = manager.graph.ppu || 100;
        const chars = charsRef.current;
        const bgs = bgsRef.current;
        const subs = subsRef.current;
        const activeCharIds = new Set<string>();
        const activeBgIds = new Set<string>();
        const activeSubIds = new Set<string>();
        
        let hasBgLayers = false;

        // ═══════════════════════════════════════
        //  PASS 1: Find camera snapshot first
        // ═══════════════════════════════════════
        let cameraSnap: NodeSnapshot | null = null;
        for (const [, snap] of Object.entries(snapshot)) {
            if (snap.nodeType === 'camera') {
                cameraSnap = snap;
                break;
            }
        }

        // ═══════════════════════════════════════
        //  PASS 2: Render all nodes
        // ═══════════════════════════════════════
        for (const [nodeId, snap] of Object.entries(snapshot)) {
            if (snap.nodeType === 'camera') continue;

            // ── Background layers ──
            if (snap.nodeType === 'background_layer') {
                hasBgLayers = true;
                activeBgIds.add(nodeId);
                if (!bgContainer) continue;

                let bgObj = bgs.get(nodeId);
                if (!bgObj) {
                    bgObj = new BackgroundDisplayObject();
                    bgs.set(nodeId, bgObj);
                    bgContainer.addChild(bgObj.container);
                }
                bgObj.update(snap, cameraSnap, ppu);

                const node = manager.getNode(nodeId);
                if (node) {
                    const assetPath = (node as any).assetPath as string
                        || node.metadata?.assetPath as string;
                    if (assetPath) {
                        bgObj.updateTexture(assetPath);
                    }
                }
                continue;
            }

            // ── Subtitle / Text nodes ──
            if (snap.nodeType === 'text') {
                activeSubIds.add(nodeId);
                if (!subtitleContainer) continue;

                let subObj = subs.get(nodeId);
                if (!subObj) {
                    subObj = new SubtitleDisplayObject();
                    subs.set(nodeId, subObj);
                    subtitleContainer.addChild(subObj.container);
                }

                const node = manager.getNode(nodeId);
                const content = (node as any)?.content as string || '';
                subObj.update(snap, content);
                continue;
            }

            // ── Characters ──
            if (snap.nodeType !== 'character') continue;
            activeCharIds.add(nodeId);

            let charObj = chars.get(nodeId);
            if (!charObj) {
                charObj = new CharacterDisplayObject(snap.name);
                chars.set(nodeId, charObj);
                container.addChild(charObj.container);
            }

            charObj.update(snap, ppu);

            const node = manager.getNode(nodeId);
            if (node) {
                const poseUrl = node.metadata?.poseUrl as string;
                const faceUrl = node.metadata?.faceUrl as string;
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

        // ── Cleanup ──
        chars.forEach((charObj, id) => {
            if (!activeCharIds.has(id)) {
                container.removeChild(charObj.container);
                charObj.destroy();
                chars.delete(id);
            }
        });
        if (bgContainer) {
            bgs.forEach((bgObj, id) => {
                if (!activeBgIds.has(id)) {
                    bgContainer.removeChild(bgObj.container);
                    bgObj.destroy();
                    bgs.delete(id);
                }
            });
        }
        if (subtitleContainer) {
            subs.forEach((subObj, id) => {
                if (!activeSubIds.has(id)) {
                    subtitleContainer.removeChild(subObj.container);
                    subObj.destroy();
                    subs.delete(id);
                }
            });
        }

        // ── Toggle placeholder ──
        if (placeholderBgRef.current) {
            placeholderBgRef.current.visible = !hasBgLayers;
        }

        // ── Camera: affects sceneContainer ──
        if (cameraSnap) {
            container.pivot.set(cameraSnap.x * ppu, cameraSnap.y * ppu);
            container.position.set(CANVAS_W / 2, CANVAS_H / 2);
            container.scale.set(cameraSnap.scaleX || 1, cameraSnap.scaleY || 1);
            container.rotation = -(cameraSnap.rotation || 0) * Math.PI / 180;
        } else {
            container.pivot.set(CANVAS_W / 2, CANVAS_H / 2);
            container.position.set(CANVAS_W / 2, CANVAS_H / 2);
            container.scale.set(1, 1);
            container.rotation = 0;
        }

        // ── Transition overlay ──
        if (transitionRef.current) {
            transitionRef.current.update(activeTransition);
        }

    }, [snapshot, manager, activeTransition]);

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
