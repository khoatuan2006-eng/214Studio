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
import { VFXManager } from '@/core/renderer/managers/VFXManager';
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

    constructor(name: string, nodeId: string) {
        this.container = new PIXI.Container();
        this.container.sortableChildren = true;
        this.container.eventMode = 'static';
        this.container.cursor = 'pointer';
        
        // Handle click event to select the block
        this.container.on('pointerdown', (e) => {
            e.stopPropagation(); // Prevent deselecting if clicked on character
            const store = useSceneGraphStore.getState();
            store.setSelectedBlock({ nodeId, sceneId: store.scenes[store.activeSceneIndex].id });
            store.setSidebarTab('edit');
        });

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
            this.sprite.anchor.set(0.5, 0.5);
            this.sprite.position.set(CANVAS_W / 2, CANVAS_H / 2);
            
            const scaleX = CANVAS_W / texture.width;
            const scaleY = CANVAS_H / texture.height;
            const coverScale = Math.max(scaleX, scaleY);
            
            // To prevent black bars when zooming out, give backgrounds an extra 10% padding
            this.sprite.scale.set(coverScale * 1.1, coverScale * 1.1);
            
            this.container.addChild(this.sprite);
        } catch (err) {
            console.warn(`[SceneRenderer] Failed to load background layer: ${url}`, err);
        }
    }

    update(snap: NodeSnapshot, cameraSnap: NodeSnapshot | null, ppu: number): void {
        this.container.alpha = snap.opacity;
        this.container.visible = snap.visible;
        this.container.zIndex = snap.zIndex;

        if (cameraSnap) {
            // Use parallaxSpeed as a modifier (default 1 = fully coupled to camera)
            const p = snap.parallaxSpeed !== undefined ? snap.parallaxSpeed : 1;
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
//  Speech Bubble Display Object — manga/comic-style dialogue bubbles
//  Replaces SubtitleDisplayObject for comic art style.
//  Supports: speech (round), shout (spiky), thought (cloud), whisper (dashed)
// ══════════════════════════════════════════════

type BubbleStyle = 'none' | 'speech' | 'shout' | 'thought' | 'whisper';

class SpeechBubbleDisplayObject {
    container: PIXI.Container;
    private bgGraphics: PIXI.Graphics;
    private textObj: PIXI.Text;
    private speakerLabel: PIXI.Text;
    private currentContent: string = '';
    private currentStyle: BubbleStyle = 'none';
    private currentSpeaker: string = '';

    constructor() {
        this.container = new PIXI.Container();
        this.container.sortableChildren = true;

        this.bgGraphics = new PIXI.Graphics();
        this.bgGraphics.zIndex = 0;
        this.container.addChild(this.bgGraphics);

        // Speaker name label (bold, above the text)
        this.speakerLabel = new PIXI.Text({
            text: '',
            style: {
                fontSize: 18,
                fontFamily: '"Comic Sans MS", "Noto Sans SC", "Inter", sans-serif',
                fontWeight: '800',
                fill: 0x333333,
                align: 'center',
            }
        });
        this.speakerLabel.anchor.set(0.5, 1);
        this.speakerLabel.zIndex = 2;
        this.container.addChild(this.speakerLabel);

        // Main dialogue text
        this.textObj = new PIXI.Text({
            text: '',
            style: {
                fontSize: 22,
                fontFamily: '"Comic Sans MS", "Noto Sans SC", "Inter", sans-serif',
                fontWeight: '600',
                fill: 0x111111,
                wordWrap: true,
                wordWrapWidth: 300,
                align: 'center',
                lineHeight: 28,
            }
        });
        this.textObj.anchor.set(0.5, 0.5);
        this.textObj.zIndex = 2;
        this.container.addChild(this.textObj);
    }

    /**
     * Update bubble content and position.
     * @param snap - NodeSnapshot of this text node
     * @param content - Dialogue text
     * @param bubbleStyle - Bubble visual style
     * @param speakerName - Character name
     * @param targetSnap - Snapshot of the target character (for position tracking)
     * @param ppu - Pixels per unit
     */
    update(
        snap: NodeSnapshot,
        content: string,
        bubbleStyle: BubbleStyle,
        speakerName: string,
        targetSnap: NodeSnapshot | null,
        ppu: number,
    ): void {
        this.container.alpha = snap.opacity;
        this.container.visible = snap.visible && content.length > 0;
        this.container.zIndex = snap.zIndex;

        // Position: follow target character, or use own position
        let posX: number;
        let posY: number;
        if (targetSnap && bubbleStyle !== 'none') {
            // Position above the character's head
            posX = targetSnap.x * ppu;
            posY = Math.max(80, targetSnap.y * ppu - 320);
        } else if (bubbleStyle !== 'none') {
            // Fallback: use the node's own position
            posX = snap.x * ppu;
            posY = snap.y * ppu;
        } else {
            // Legacy subtitle mode: bottom center
            posX = CANVAS_W / 2;
            posY = CANVAS_H - 60;
        }
        this.container.position.set(posX, posY);

        const needsRedraw = content !== this.currentContent
            || bubbleStyle !== this.currentStyle
            || speakerName !== this.currentSpeaker;

        if (!needsRedraw) return;

        this.currentContent = content;
        this.currentStyle = bubbleStyle;
        this.currentSpeaker = speakerName;

        // Update text
        this.textObj.text = content;

        // Update speaker label
        if (speakerName && bubbleStyle !== 'none') {
            this.speakerLabel.text = speakerName;
            this.speakerLabel.visible = true;
        } else {
            this.speakerLabel.visible = false;
        }

        // Measure text for bubble sizing
        const textBounds = this.textObj.getBounds();
        const padX = 24;
        const padY = 16;
        const speakerH = speakerName && bubbleStyle !== 'none' ? 24 : 0;
        const bubbleW = Math.min(Math.max(textBounds.width + padX * 2, 120), 380);
        const bubbleH = textBounds.height + padY * 2 + speakerH;

        // Position text and speaker within bubble
        this.textObj.position.set(0, speakerH / 2);
        if (speakerName && bubbleStyle !== 'none') {
            this.speakerLabel.position.set(0, -textBounds.height / 2 - padY + 4);
        }

        // Draw bubble background
        this.bgGraphics.clear();

        if (bubbleStyle === 'none') {
            // Legacy subtitle bar (bottom of screen)
            this._drawSubtitleBar(bubbleW, bubbleH);
        } else if (bubbleStyle === 'speech') {
            this._drawSpeechBubble(bubbleW, bubbleH);
        } else if (bubbleStyle === 'shout') {
            this._drawShoutBubble(bubbleW, bubbleH);
        } else if (bubbleStyle === 'thought') {
            this._drawThoughtBubble(bubbleW, bubbleH);
        } else if (bubbleStyle === 'whisper') {
            this._drawWhisperBubble(bubbleW, bubbleH);
        }
    }

    /** Classic subtitle: semi-transparent bar at bottom */
    private _drawSubtitleBar(w: number, h: number): void {
        const g = this.bgGraphics;
        g.roundRect(-w / 2, -h / 2, w, h, 8);
        g.fill({ color: 0x000000, alpha: 0.65 });
        // White text for subtitle mode
        this.textObj.style.fill = 0xffffff;
        (this.textObj.style as any).stroke = { color: 0x000000, width: 3 };
    }

    /** Rounded speech bubble with a triangular tail pointing down */
    private _drawSpeechBubble(w: number, h: number): void {
        const g = this.bgGraphics;
        const r = 16; // corner radius

        // Main bubble body
        g.roundRect(-w / 2, -h / 2, w, h, r);
        g.fill({ color: 0xffffff, alpha: 0.95 });
        g.roundRect(-w / 2, -h / 2, w, h, r);
        g.stroke({ color: 0x333333, width: 3 });

        // Tail (triangle pointing down toward character)
        g.moveTo(-8, h / 2 - 2);
        g.lineTo(0, h / 2 + 22);
        g.lineTo(8, h / 2 - 2);
        g.fill({ color: 0xffffff, alpha: 0.95 });

        // Tail outline
        g.moveTo(-10, h / 2);
        g.lineTo(0, h / 2 + 24);
        g.lineTo(10, h / 2);
        g.stroke({ color: 0x333333, width: 3 });

        // Black text
        this.textObj.style.fill = 0x111111;
        (this.textObj.style as any).stroke = undefined;
    }

    /** Spiky/jagged bubble for shouting — angular zigzag border */
    private _drawShoutBubble(w: number, h: number): void {
        const g = this.bgGraphics;
        const hw = w / 2;
        const hh = h / 2;
        const spikes = 12;
        const outerScale = 1.25;

        // Build spiky polygon
        const points: number[] = [];
        for (let i = 0; i < spikes; i++) {
            const angle = (i / spikes) * Math.PI * 2 - Math.PI / 2;
            const nextAngle = ((i + 0.5) / spikes) * Math.PI * 2 - Math.PI / 2;
            // Outer spike
            points.push(
                Math.cos(angle) * hw * outerScale,
                Math.sin(angle) * hh * outerScale
            );
            // Inner valley
            points.push(
                Math.cos(nextAngle) * hw * 0.85,
                Math.sin(nextAngle) * hh * 0.85
            );
        }

        g.poly(points);
        g.fill({ color: 0xffffff, alpha: 0.95 });
        g.poly(points);
        g.stroke({ color: 0xcc2200, width: 3.5 });

        // Tail
        g.moveTo(-6, hh * outerScale - 4);
        g.lineTo(0, hh * outerScale + 18);
        g.lineTo(6, hh * outerScale - 4);
        g.fill({ color: 0xffffff, alpha: 0.95 });

        // Bold dark text for shout
        this.textObj.style.fill = 0x880000;
        this.textObj.style.fontWeight = '900';
        (this.textObj.style as any).stroke = undefined;
    }

    /** Cloud-shaped thought bubble with small circles trailing down */
    private _drawThoughtBubble(w: number, h: number): void {
        const g = this.bgGraphics;

        // Main cloud body (rounded rect with extra-round corners)
        g.roundRect(-w / 2, -h / 2, w, h, 24);
        g.fill({ color: 0xf0f0f0, alpha: 0.92 });
        g.roundRect(-w / 2, -h / 2, w, h, 24);
        g.stroke({ color: 0x888888, width: 2 });

        // Trailing thought circles (bottom)
        const circles = [
            { x: -4, y: h / 2 + 12, r: 8 },
            { x: -2, y: h / 2 + 26, r: 5 },
            { x: 0, y: h / 2 + 36, r: 3 },
        ];
        for (const c of circles) {
            g.circle(c.x, c.y, c.r);
            g.fill({ color: 0xf0f0f0, alpha: 0.92 });
            g.circle(c.x, c.y, c.r);
            g.stroke({ color: 0x888888, width: 2 });
        }

        // Italic gray text for thought
        this.textObj.style.fill = 0x555555;
        this.textObj.style.fontStyle = 'italic';
        (this.textObj.style as any).stroke = undefined;
    }

    /** Dashed-outline bubble for whispering */
    private _drawWhisperBubble(w: number, h: number): void {
        const g = this.bgGraphics;

        // Soft background
        g.roundRect(-w / 2, -h / 2, w, h, 14);
        g.fill({ color: 0xfafafa, alpha: 0.8 });

        // Dashed border (simulated with short line segments)
        const hw = w / 2;
        const hh = h / 2;
        const dashLen = 8;
        const gapLen = 6;

        // Top edge
        for (let x = -hw; x < hw; x += dashLen + gapLen) {
            g.moveTo(x, -hh);
            g.lineTo(Math.min(x + dashLen, hw), -hh);
        }
        // Bottom edge
        for (let x = -hw; x < hw; x += dashLen + gapLen) {
            g.moveTo(x, hh);
            g.lineTo(Math.min(x + dashLen, hw), hh);
        }
        // Left edge
        for (let y = -hh; y < hh; y += dashLen + gapLen) {
            g.moveTo(-hw, y);
            g.lineTo(-hw, Math.min(y + dashLen, hh));
        }
        // Right edge
        for (let y = -hh; y < hh; y += dashLen + gapLen) {
            g.moveTo(hw, y);
            g.lineTo(hw, Math.min(y + dashLen, hh));
        }
        g.stroke({ color: 0x999999, width: 2 });

        // Small tail
        g.moveTo(-5, hh);
        g.lineTo(0, hh + 14);
        g.lineTo(5, hh);
        g.stroke({ color: 0x999999, width: 1.5 });

        // Light gray text for whisper
        this.textObj.style.fill = 0x666666;
        this.textObj.style.fontSize = 20;
        (this.textObj.style as any).stroke = undefined;
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
    const subsRef = useRef(new Map<string, SpeechBubbleDisplayObject>());
    const vfxRef = useRef<VFXManager | null>(null);
    const activeSceneIdRef = useRef<string | null>(null);
    const vfxTriggeredRef = useRef<boolean>(false);

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
            app.stage.eventMode = 'static';
            app.stage.hitArea = new PIXI.Rectangle(0, 0, CANVAS_W, CANVAS_H);
            app.stage.on('pointerdown', (e) => {
                if (e.target === app.stage) {
                    useSceneGraphStore.getState().setSelectedBlock(null);
                }
            });

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
            
            // Layer 6: VFX Manager
            vfxRef.current = new VFXManager(app, container);
            
            // Ticker loop for VFX
            app.ticker.add((ticker) => {
                if (vfxRef.current) {
                    vfxRef.current.update(ticker.deltaMS / 1000);
                }
            });

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
            if (vfxRef.current) {
                vfxRef.current.destroy();
                vfxRef.current = null;
            }
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
        
        const playbackState = useSceneGraphStore.getState();
        const isPlaying = playbackState.isPlaying;
        const currentTime = playbackState.currentTime;

        if (manager.graph.id !== activeSceneIdRef.current) {
            activeSceneIdRef.current = manager.graph.id;
            vfxTriggeredRef.current = false;
        }

        if (isPlaying && currentTime >= 0 && currentTime < 0.2 && !vfxTriggeredRef.current) {
            vfxTriggeredRef.current = true;
            const meta = manager.graph.metadata || {};
            if (vfxRef.current) {
                if (meta.camera_shake) { vfxRef.current.triggerCameraShake(0.6, 25); }
                if (meta.flash_screen) { vfxRef.current.triggerFlashScreen(0.3); }
                if (meta.explosions) { vfxRef.current.triggerExplosion(9.6 * ppu, 7.5 * ppu); }
            }
        } else if (!isPlaying && currentTime < 0.1) {
            // Reset trigger when seeking to start while paused
            vfxTriggeredRef.current = false;
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

            // ── Text / Speech Bubble nodes ──
            if (snap.nodeType === 'text') {
                activeSubIds.add(nodeId);
                if (!subtitleContainer) continue;

                let subObj = subs.get(nodeId);
                if (!subObj) {
                    subObj = new SpeechBubbleDisplayObject();
                    subs.set(nodeId, subObj);
                    subtitleContainer.addChild(subObj.container);
                }

                const node = manager.getNode(nodeId);
                const content = (node as any)?.content as string || '';
                const bubbleStyle: BubbleStyle = (node as any)?.bubbleStyle || (node as any)?.bubble_style || 'none';
                const speakerName: string = (node as any)?.speakerName || (node as any)?.speaker_name || '';
                const bubbleTargetId: string = (node as any)?.bubbleTargetId || (node as any)?.bubble_target_id || '';

                // Find the target character's snapshot for position tracking
                let targetSnap: NodeSnapshot | null = null;
                if (bubbleTargetId && snapshot[bubbleTargetId]) {
                    targetSnap = snapshot[bubbleTargetId];
                }

                subObj.update(snap, content, bubbleStyle, speakerName, targetSnap, ppu);
                continue;
            }

            // ── Characters ──
            if (snap.nodeType !== 'character') continue;
            activeCharIds.add(nodeId);

            let charObj = chars.get(nodeId);
            if (!charObj) {
                charObj = new CharacterDisplayObject(snap.name, nodeId);
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

    // ── Playback animation loop & Synchronization with UI PlaybackManager ──
    useEffect(() => {
        const syncPlayback = (e: any) => {
            const time = e.detail?.time;
            if (typeof time === 'number') {
                useSceneGraphStore.getState().setTime(time);
            }
        };

        window.addEventListener('playback-update', syncPlayback);
        window.addEventListener('playback-seek', syncPlayback);

        let rafId: number;
        let lastTime = performance.now();

        const tick = (now: number) => {
            const dt = (now - lastTime) / 1000;
            lastTime = now;
            useSceneGraphStore.getState().tick(dt);
            rafId = requestAnimationFrame(tick);
        };

        rafId = requestAnimationFrame(tick);
        
        return () => {
            window.removeEventListener('playback-update', syncPlayback);
            window.removeEventListener('playback-seek', syncPlayback);
            cancelAnimationFrame(rafId);
        };
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
