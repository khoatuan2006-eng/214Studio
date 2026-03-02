import React from 'react';

/**
 * Loading Skeleton Components
 * Used for perceived performance improvement
 */

/**
 * Timeline Track Skeleton
 */
export function TimelineSkeleton({ count = 5 }: { count?: number }) {
    return (
        <div className="animate-pulse space-y-2 p-2">
            {[...Array(count)].map((_, i) => (
                <div
                    key={i}
                    className="h-12 bg-gradient-to-r from-neutral-800 via-neutral-700 to-neutral-800 rounded-lg"
                    style={{
                        backgroundSize: '200% 100%',
                        animation: 'shimmer 1.5s infinite'
                    }}
                />
            ))}
        </div>
    );
}

/**
 * Media Grid Skeleton
 */
export function MediaSkeleton({ count = 9 }: { count?: number }) {
    return (
        <div className="grid grid-cols-3 gap-2 animate-pulse">
            {[...Array(count)].map((_, i) => (
                <div
                    key={i}
                    className="aspect-square bg-gradient-to-br from-neutral-700 via-neutral-600 to-neutral-700 rounded-lg"
                    style={{
                        backgroundSize: '200% 100%',
                        animation: 'shimmer 1.5s infinite'
                    }}
                />
            ))}
        </div>
    );
}

/**
 * Character Card Skeleton
 */
export function CharacterSkeleton({ count = 4 }: { count?: number }) {
    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-pulse">
            {[...Array(count)].map((_, i) => (
                <div key={i} className="flex flex-col items-center gap-2">
                    <div className="w-20 h-20 bg-neutral-700 rounded-lg" />
                    <div className="w-24 h-4 bg-neutral-700 rounded" />
                </div>
            ))}
        </div>
    );
}

/**
 * Properties Panel Skeleton
 */
export function PropertiesSkeleton() {
    return (
        <div className="space-y-4 animate-pulse p-4">
            <div className="h-6 bg-neutral-700 rounded w-32" />
            <div className="space-y-2">
                <div className="h-4 bg-neutral-700 rounded w-full" />
                <div className="h-4 bg-neutral-700 rounded w-3/4" />
                <div className="h-4 bg-neutral-700 rounded w-1/2" />
            </div>
            <div className="h-10 bg-neutral-700 rounded" />
        </div>
    );
}

/**
 * Generic Content Skeleton
 */
export function ContentSkeleton({
    lines = 3,
    className = ''
}: {
    lines?: number;
    className?: string;
}) {
    return (
        <div className={`space-y-2 animate-pulse ${className}`}>
            {[...Array(lines)].map((_, i) => (
                <div
                    key={i}
                    className="h-4 bg-neutral-700 rounded"
                    style={{
                        width: i === lines - 1 ? '60%' : '100%',
                        background: 'linear-gradient(90deg, #404040 0%, #525252 50%, #404040 100%)',
                        backgroundSize: '200% 100%',
                        animation: 'shimmer 1.5s infinite'
                    }}
                />
            ))}
        </div>
    );
}

/**
 * Video Player Skeleton
 */
export function VideoPlayerSkeleton() {
    return (
        <div className="aspect-video bg-neutral-800 animate-pulse rounded-lg overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-neutral-700/50 to-transparent animate-shimmer" />
        </div>
    );
}

// Add shimmer animation to global styles
const shimmerStyles = `
@keyframes shimmer {
    0% {
        background-position: -200% 0;
    }
    100% {
        background-position: 200% 0;
    }
}

@keyframes shine {
    0% {
        opacity: 0;
    }
    50% {
        opacity: 1;
    }
    100% {
        opacity: 0;
    }
}

.animate-shimmer {
    animation: shimmer 1.5s infinite;
}

.animate-shine {
    animation: shine 1.5s infinite;
}
`;

// Inject styles
if (typeof document !== 'undefined') {
    const styleSheet = document.createElement('style');
    styleSheet.textContent = shimmerStyles;
    document.head.appendChild(styleSheet);
}
