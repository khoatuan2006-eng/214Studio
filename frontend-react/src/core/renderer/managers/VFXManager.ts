import * as PIXI from 'pixi.js';

interface CustomParticle {
    sprite: PIXI.Sprite;
    vx: number;
    vy: number;
    life: number;
    maxLife: number;
    scaleSpd: number;
}

export class VFXManager {
    private app: PIXI.Application;
    private sceneContainer: PIXI.Container;
    private overlayContainer: PIXI.Container;
    
    private particles: CustomParticle[] = [];
    private flashGraphics: PIXI.Graphics;
    
    // States for Screen FX
    private flashActive: boolean = false;
    private flashDuration: number = 0;
    private flashElapsed: number = 0;
    
    private shakeActive: boolean = false;
    private shakeIntensity: number = 20;
    private shakeDuration: number = 0;
    private shakeElapsed: number = 0;
    
    // Default circle texture for generic Toon smoke/fire
    private particleTexture: PIXI.Texture | null = null;
    private particleContainer: PIXI.Container;

    constructor(app: PIXI.Application, sceneContainer: PIXI.Container) {
        this.app = app;
        this.sceneContainer = sceneContainer;
        
        // Overlay container sits on top of everything for full-screen flashes
        this.overlayContainer = new PIXI.Container();
        this.overlayContainer.zIndex = 10000;
        this.app.stage.addChild(this.overlayContainer);
        
        this.flashGraphics = new PIXI.Graphics();
        this.overlayContainer.addChild(this.flashGraphics);
        
        this.particleContainer = new PIXI.Container();
        this.particleContainer.zIndex = 5000;
        this.sceneContainer.addChild(this.particleContainer);
        
        this._generateParticleTexture();
    }

    private _generateParticleTexture() {
        // Generating a soft simple white circle for toon-fire/smoke recoloring
        const g = new PIXI.Graphics();
        g.circle(8, 8, 8);
        g.fill({ color: 0xffffff, alpha: 1.0 });
        this.particleTexture = this.app.renderer.generateTexture(g);
    }

    /**
     * Spawns a Toon-style Smoke/Fire explosion at the given X,Y (in Scene coords).
     */
    public triggerExplosion(x: number, y: number) {
        if (!this.particleTexture) return;

        const numParticles = 30;
        for (let i = 0; i < numParticles; i++) {
            const sprite = new PIXI.Sprite(this.particleTexture);
            sprite.anchor.set(0.5);
            sprite.position.set(x, y);
            
            // Random properties
            const angle = Math.random() * Math.PI * 2;
            const speed = 100 + Math.random() * 200;
            
            this.particleContainer.addChild(sprite);
            
            this.particles.push({
                sprite,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 0,
                maxLife: 0.3 + Math.random() * 0.4,
                scaleSpd: 0.5 + Math.random() * 2
            });
        }
    }

    public triggerFlashScreen(durationSecs: number = 0.5) {
        this.flashActive = true;
        this.flashDuration = durationSecs;
        this.flashElapsed = 0;
        
        this.flashGraphics.clear();
        this.flashGraphics.rect(0, 0, this.app.screen.width, this.app.screen.height);
        this.flashGraphics.fill({ color: 0xffffff, alpha: 1.0 });
        this.flashGraphics.alpha = 1.0;
    }

    public triggerCameraShake(durationSecs: number = 0.5, intensity: number = 20) {
        this.shakeActive = true;
        this.shakeDuration = durationSecs;
        this.shakeElapsed = 0;
        this.shakeIntensity = intensity;
    }

    public update(deltaS: number) {
        // Update Custom Particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life += deltaS;
            
            if (p.life >= p.maxLife) {
                p.sprite.destroy();
                this.particles.splice(i, 1);
                continue;
            }
            
            // Move
            p.sprite.x += p.vx * deltaS;
            p.sprite.y += p.vy * deltaS;
            
            // Friction
            p.vx *= 0.9;
            p.vy *= 0.9;
            
            const progress = p.life / p.maxLife;
            
            // Scale and Alpha
            p.sprite.scale.set(0.5 + progress * p.scaleSpd);
            p.sprite.alpha = 1.0 - progress;
            
            // Color gradient: Yellow -> Orange -> Grey -> Dark Grey
            if (progress < 0.3) {
                p.sprite.tint = 0xffcc00; // Yellow
            } else if (progress < 0.6) {
                p.sprite.tint = 0xff6600; // Orange
            } else if (progress < 0.8) {
                p.sprite.tint = 0x666666; // Grey
            } else {
                p.sprite.tint = 0x333333; // Dark Grey
            }
        }

        // Update Flash Screen
        if (this.flashActive) {
            this.flashElapsed += deltaS;
            if (this.flashElapsed >= this.flashDuration) {
                this.flashActive = false;
                this.flashGraphics.alpha = 0;
            } else {
                // Fade out
                this.flashGraphics.alpha = 1.0 - (this.flashElapsed / this.flashDuration);
            }
        }
        
        // Update Camera Shake
        if (this.shakeActive) {
            this.shakeElapsed += deltaS;
            if (this.shakeElapsed >= this.shakeDuration) {
                this.shakeActive = false;
                this.app.stage.position.set(0, 0); // Reset
            } else {
                // Damping
                const progress = this.shakeElapsed / this.shakeDuration;
                const currentIntensity = this.shakeIntensity * (1 - progress);
                
                const dx = (Math.random() - 0.5) * 2 * currentIntensity;
                const dy = (Math.random() - 0.5) * 2 * currentIntensity;
                this.app.stage.position.set(dx, dy);
            }
        }
    }
    
    public destroy() {
        this.particles.forEach(p => p.sprite.destroy());
        this.particles = [];
        if (!this.particleContainer.destroyed) {
            this.particleContainer.destroy({ children: true });
        }
        if (!this.overlayContainer.destroyed) {
            this.overlayContainer.destroy({ children: true });
        }
    }
}
