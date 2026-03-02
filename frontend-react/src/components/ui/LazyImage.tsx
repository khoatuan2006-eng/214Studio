import React, { useRef, useState, useEffect } from 'react';

interface LazyImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
    /** Placeholder shown while image loads (CSS background or color) */
    placeholderClass?: string;
    /** Fallback src if primary fails */
    fallbackSrc?: string;
    /** Root margin for IntersectionObserver (default: "200px") — preloads before visible */
    rootMargin?: string;
}

/**
 * LazyImage — only loads the image src when the element enters the viewport.
 * Uses IntersectionObserver with a 200px margin so images start loading 
 * slightly before they scroll into view for a seamless experience.
 * 
 * Also prevents browser drag ghost by setting draggable=false and
 * disables text selection / context menu on the image.
 */
const LazyImage: React.FC<LazyImageProps> = ({
    src,
    fallbackSrc,
    placeholderClass = 'bg-white/5 animate-pulse',
    rootMargin = '200px',
    className = '',
    onError,
    ...props
}) => {
    const imgRef = useRef<HTMLImageElement>(null);
    const [isInView, setIsInView] = useState(false);
    const [hasError, setHasError] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        const el = imgRef.current;
        if (!el) return;

        // If IntersectionObserver not supported, load immediately
        if (!('IntersectionObserver' in window)) {
            setIsInView(true);
            return;
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsInView(true);
                    observer.disconnect();
                }
            },
            { rootMargin, threshold: 0 }
        );

        observer.observe(el);
        return () => observer.disconnect();
    }, [rootMargin]);

    const handleError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
        if (!hasError && fallbackSrc) {
            setHasError(true);
            e.currentTarget.src = fallbackSrc;
        } else {
            e.currentTarget.style.display = 'none';
        }
        onError?.(e);
    };

    return (
        <img
            ref={imgRef}
            src={isInView ? (hasError && fallbackSrc ? fallbackSrc : src) : undefined}
            className={`${className} ${!isLoaded ? placeholderClass : ''}`}
            onLoad={() => setIsLoaded(true)}
            onError={handleError}
            draggable={false}
            loading="lazy"
            crossOrigin="anonymous"
            onContextMenu={(e) => e.preventDefault()}
            {...props}
        />
    );
};

export default LazyImage;
