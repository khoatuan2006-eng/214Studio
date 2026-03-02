import React, { useRef, useState, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { STATIC_BASE, getAssetPath, type Character, type LibraryAsset } from '@/store/useAppStore';

interface MediaLibraryGridProps {
    assets: LibraryAsset[];
    categoryName: string;
    categoryZIndex: number;
    characters: Character[];
    onAddAsset: (hash: string, zIndex: number) => void;
}

/**
 * Enhanced Media Library Grid with hover preview
 * Based on omniclip_reference omni-media component
 */
export const MediaLibraryGrid: React.FC<MediaLibraryGridProps> = ({
    assets,
    categoryName,
    categoryZIndex,
    characters,
    onAddAsset,
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [hoveredAsset, setHoveredAsset] = useState<string | null>(null);
    const [loadedImages, setLoadedImages] = useState<Record<string, boolean>>({});

    const handleMouseEnter = useCallback((assetHash: string) => {
        setHoveredAsset(assetHash);
        
        // Auto-play video on hover
        if (videoRef.current) {
            videoRef.current.currentTime = 0;
            videoRef.current.play().catch(() => {
                // Silent fail if autoplay is blocked
            });
        }
    }, []);

    const handleMouseLeave = useCallback(() => {
        setHoveredAsset(null);
        
        // Pause video on leave
        if (videoRef.current) {
            videoRef.current.pause();
            videoRef.current.currentTime = 0;
        }
    }, []);

    const handleImageLoad = useCallback((assetHash: string) => {
        setLoadedImages(prev => ({ ...prev, [assetHash]: true }));
    }, []);

    if (assets.length === 0) {
        return (
            <div className="text-xs text-neutral-600 block pl-5 py-2">
                Empty folder
            </div>
        );
    }

    return (
        <div className="grid grid-cols-3 gap-2">
            {assets.map(asset => {
                const assetPath = getAssetPath(characters, asset.hash);
                const isVideo = asset.name?.toLowerCase().match(/\.(mp4|webm|mov)$/i);
                const isHovered = hoveredAsset === asset.hash;

                return (
                    <div
                        key={asset.hash}
                        className="aspect-square bg-neutral-800 border border-neutral-700 rounded overflow-hidden cursor-pointer transition-all group relative hover:border-indigo-500 hover:shadow-lg hover:shadow-indigo-500/20 hover:-translate-y-1"
                        onClick={() => onAddAsset(asset.hash, categoryZIndex)}
                        title={asset.name}
                        draggable
                        onMouseEnter={() => handleMouseEnter(asset.hash)}
                        onMouseLeave={handleMouseLeave}
                        onDragStart={(e) => {
                            e.dataTransfer.setData('application/json', JSON.stringify({
                                id: asset.hash,
                                name: asset.name || "Asset",
                                type: "media",
                                mediaType: isVideo ? "video" : "image",
                                customZIndex: categoryZIndex
                            }));
                        }}
                    >
                        {/* Loading Skeleton */}
                        {!loadedImages[asset.hash] && !isVideo && (
                            <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-neutral-700 via-neutral-600 to-neutral-700" />
                        )}

                        {/* Image Thumbnail */}
                        {!isVideo && (
                            <img
                                src={`${STATIC_BASE}/${assetPath}`}
                                crossOrigin="anonymous"
                                className="w-full h-full object-cover p-1"
                                alt={asset.name}
                                onLoad={() => handleImageLoad(asset.hash)}
                            />
                        )}

                        {/* Video Thumbnail with Hover Preview */}
                        {isVideo && (
                            <>
                                {/* Static thumbnail when not hovered */}
                                {!isHovered && (
                                    <img
                                        src={`${STATIC_BASE}/${assetPath}`}
                                        crossOrigin="anonymous"
                                        className="w-full h-full object-cover p-1"
                                        alt={asset.name}
                                        onLoad={() => handleImageLoad(asset.hash)}
                                    />
                                )}
                                
                                {/* Video preview on hover */}
                                {isHovered && (
                                    <video
                                        ref={videoRef}
                                        src={`${STATIC_BASE}/${assetPath}`}
                                        className="w-full h-full object-cover p-1"
                                        muted
                                        loop
                                        playsInline
                                        autoPlay
                                    />
                                )}

                                {/* Video Badge */}
                                <div className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded font-medium">
                                    VIDEO
                                </div>
                            </>
                        )}

                        {/* Hover Overlay */}
                        <div className="absolute inset-0 bg-indigo-500/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity pointer-events-none">
                            <Plus className="w-5 h-5 text-white drop-shadow" />
                        </div>

                        {/* Asset Name Tooltip */}
                        {isHovered && asset.name && (
                            <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-neutral-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10 shadow-lg">
                                {asset.name}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};
