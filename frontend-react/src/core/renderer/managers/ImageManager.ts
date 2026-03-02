import * as PIXI from 'pixi.js';
import { getAssetPath } from '../../../store/useAppStore';
import type { CharacterTrack, Character } from '../../../store/useAppStore';

export class ImageManager {
    private app: PIXI.Application;
    private container: PIXI.Container;
    private textureCache = new Map<string, PIXI.Texture>();
    private sprites: Map<string, PIXI.Container> = new Map();

    constructor(app: PIXI.Application, container: PIXI.Container) {
        this.app = app;
        this.container = container;
    }

    public async preloadTextures(tracks: CharacterTrack[], characters: Character[]) {
        const hashSet = new Set<string>();

        // Find all unique hashes needed
        tracks.forEach(track => {
            track.actions.forEach(action => {
                if (action.assetHash) {
                    hashSet.add(action.assetHash);
                }
            });
        });

        // Preload them into cache
        const promises = Array.from(hashSet).map(async (hash) => {
            if (this.textureCache.has(hash)) return;
            const path = getAssetPath(characters, hash);
            if (!path) return;

            try {
                const texture = await PIXI.Assets.load(path);
                this.textureCache.set(hash, texture);
            } catch (err) {
                console.warn(`[ImageManager] Failed to load texture for hash ${hash}: `, err);
            }
        });

        await Promise.all(promises);
    }

    public syncTracks(tracks: CharacterTrack[], currentTime: number) {
        // We will map tracks to groups (Containers) and their current active action

        // Track which track IDs are still valid
        const validTrackIds = new Set<string>();

        tracks.forEach((track) => {
            validTrackIds.add(track.id);

            let group = this.sprites.get(track.id);
            if (!group) {
                group = new PIXI.Container();
                // To allow center pivot like konva
                this.sprites.set(track.id, group);
                this.container.addChild(group);
            }

            // Find current active action
            const activeAction = track.actions.find(a => currentTime >= a.start && currentTime <= a.end);

            if (!activeAction) {
                group.visible = false;
                return;
            }

            group.visible = !activeAction.hidden;

            // Simple diffing: if the child sprite doesn't match the current assetHash, rebuild it
            const currentSprite = group.children[0] as PIXI.Sprite | undefined;
            const currentHash = (currentSprite as any)?._assetHash;

            if (currentHash !== activeAction.assetHash) {
                group.removeChildren();

                const texture = this.textureCache.get(activeAction.assetHash);
                if (texture) {
                    const sprite = new PIXI.Sprite(texture);
                    sprite.anchor.set(0.5); // Center origin
                    (sprite as any)._assetHash = activeAction.assetHash;
                    group.addChild(sprite);
                } else {
                    // Fallback square
                    const graphics = new PIXI.Graphics();
                    graphics.beginFill(0x404040);
                    graphics.lineStyle(2, 0x6366f1);
                    graphics.drawRect(-24, -24, 48, 48); // 48x48 centered
                    (graphics as any)._assetHash = activeAction.assetHash;
                    group.addChild(graphics);
                }
            }
        });

        // Cleanup removed tracks
        for (const [trackId, group] of this.sprites.entries()) {
            if (!validTrackIds.has(trackId)) {
                this.container.removeChild(group);
                group.destroy({ children: true });
                this.sprites.delete(trackId);
            }
        }
    }

    public getGroup(trackId: string): PIXI.Container | undefined {
        return this.sprites.get(trackId);
    }

    public destroy() {
        this.sprites.forEach(sprite => sprite.destroy({ children: true }));
        this.sprites.clear();
        this.textureCache.clear();
    }
}
