import React, { useEffect, useRef, useState } from 'react';

interface AutoCropImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
    src: string;
}

const AutoCropImage: React.FC<AutoCropImageProps> = ({ src, className, style, ...props }) => {
    const [croppedSrc, setCroppedSrc] = useState<string>(src); // Default to full until processed
    const [loading, setLoading] = useState<boolean>(true);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        let isMounted = true;
        setLoading(true);

        const img = new Image();
        img.crossOrigin = "Anonymous"; // Important for canvas CORS
        img.onload = () => {
            if (!isMounted) return;

            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);

            // Fetch pixel data
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imgData.data;

            let top = -1, bottom = -1, left = -1, right = -1;

            // Find top
            for (let y = 0; y < canvas.height; y++) {
                for (let x = 0; x < canvas.width; x++) {
                    const alpha = data[(y * canvas.width + x) * 4 + 3];
                    if (alpha > 5) {
                        top = y;
                        break;
                    }
                }
                if (top !== -1) break;
            }

            // If completely transparent
            if (top === -1) {
                setCroppedSrc(src);
                setLoading(false);
                return;
            }

            // Find bottom
            for (let y = canvas.height - 1; y >= 0; y--) {
                for (let x = 0; x < canvas.width; x++) {
                    const alpha = data[(y * canvas.width + x) * 4 + 3];
                    if (alpha > 5) {
                        bottom = y;
                        break;
                    }
                }
                if (bottom !== -1) break;
            }

            // Find left
            for (let x = 0; x < canvas.width; x++) {
                for (let y = top; y <= bottom; y++) {
                    const alpha = data[(y * canvas.width + x) * 4 + 3];
                    if (alpha > 5) {
                        left = x;
                        break;
                    }
                }
                if (left !== -1) break;
            }

            // Find right
            for (let x = canvas.width - 1; x >= 0; x--) {
                for (let y = top; y <= bottom; y++) {
                    const alpha = data[(y * canvas.width + x) * 4 + 3];
                    if (alpha > 5) {
                        right = x;
                        break;
                    }
                }
                if (right !== -1) break;
            }

            // Add slight padding
            const padding = 20;
            top = Math.max(0, top - padding);
            bottom = Math.min(canvas.height, bottom + padding);
            left = Math.max(0, left - padding);
            right = Math.min(canvas.width, right + padding);

            const cropWidth = right - left;
            const cropHeight = bottom - top;

            const cropCanvas = document.createElement('canvas');
            cropCanvas.width = cropWidth;
            cropCanvas.height = cropHeight;
            const cropCtx = cropCanvas.getContext('2d');
            
            if (cropCtx) {
                cropCtx.drawImage(
                    canvas,
                    left, top, cropWidth, cropHeight,
                    0, 0, cropWidth, cropHeight
                );
                setCroppedSrc(cropCanvas.toDataURL());
            } else {
                setCroppedSrc(src);
            }
            setLoading(false);
        };

        img.onerror = () => {
            if (isMounted) setLoading(false);
        };

        img.src = src;

        return () => {
            isMounted = false;
        };
    }, [src]);

    return (
        <div className={`relative ${className}`} style={style}>
            <img src={croppedSrc} className="w-full h-full object-contain" {...props} />
            {loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                    <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
            )}
        </div>
    );
};

export default AutoCropImage;
