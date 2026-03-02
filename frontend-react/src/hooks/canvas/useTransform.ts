import { useState, useCallback, useRef } from 'react';

interface TransformState {
    isTransforming: boolean;
    transformType: 'resize' | 'rotate' | 'anchor' | null;
    startPosition: { x: number; y: number };
    initialBounds: { x: number; y: number; width: number; height: number; rotation: number };
    handlePosition: string | null;
}

interface UseTransformOptions {
    onTransformStart?: (state: TransformState) => void;
    onTransform?: (state: TransformState, delta: { x: number; y: number }) => void;
    onTransformEnd?: (state: TransformState) => void;
}

/**
 * Hook for handling transform operations (resize, rotate, anchor)
 */
export function useTransform({
    onTransformStart,
    onTransform,
    onTransformEnd,
}: UseTransformOptions = {}) {
    const [transformState, setTransformState] = useState<TransformState>({
        isTransforming: false,
        transformType: null,
        startPosition: { x: 0, y: 0 },
        initialBounds: { x: 0, y: 0, width: 0, height: 0, rotation: 0 },
        handlePosition: null,
    });

    const transformRef = useRef<TransformState>(transformState);

    // Update ref when state changes
    const updateTransformState = (newState: Partial<TransformState>) => {
        const updated = { ...transformState, ...newState };
        setTransformState(updated);
        transformRef.current = updated;
    };

    // Handle resize based on handle position
    const calculateResize = useCallback((
        handlePos: string,
        deltaX: number,
        deltaY: number,
        initial: { x: number; y: number; width: number; height: number }
    ) => {
        let newX = initial.x;
        let newY = initial.y;
        let newWidth = initial.width;
        let newHeight = initial.height;

        // Horizontal resize
        if (handlePos.includes('e')) {
            newWidth = Math.max(10, initial.width + deltaX);
        } else if (handlePos.includes('w')) {
            newX = initial.x + deltaX;
            newWidth = Math.max(10, initial.width - deltaX);
        }

        // Vertical resize
        if (handlePos.includes('s')) {
            newHeight = Math.max(10, initial.height + deltaY);
        } else if (handlePos.includes('n')) {
            newY = initial.y + deltaY;
            newHeight = Math.max(10, initial.height - deltaY);
        }

        return { x: newX, y: newY, width: newWidth, height: newHeight };
    }, []);

    // Handle transform start
    const handleTransformStart = useCallback((
        e: React.MouseEvent,
        type: 'resize' | 'rotate' | 'anchor',
        handlePosition?: string,
        initialBounds?: { x: number; y: number; width: number; height: number; rotation: number }
    ) => {
        e.stopPropagation();
        e.preventDefault();

        const state: TransformState = {
            isTransforming: true,
            transformType: type,
            startPosition: { x: e.clientX, y: e.clientY },
            initialBounds: initialBounds || { x: 0, y: 0, width: 0, height: 0, rotation: 0 },
            handlePosition: handlePosition || null,
        };

        updateTransformState(state);
        onTransformStart?.(state);

        // Add global event listeners
        document.addEventListener('mousemove', handleTransformMove);
        document.addEventListener('mouseup', handleTransformEnd);
    }, [onTransformStart]);

    // Handle transform move
    const handleTransformMove = useCallback((e: MouseEvent) => {
        if (!transformRef.current.isTransforming) return;

        const { transformType, startPosition, initialBounds, handlePosition } = transformRef.current;
        const deltaX = e.clientX - startPosition.x;
        const deltaY = e.clientY - startPosition.y;

        if (transformType === 'resize' && handlePosition && initialBounds) {
            const newBounds = calculateResize(handlePosition, deltaX, deltaY, initialBounds);
            onTransform?.(transformRef.current, { x: deltaX, y: deltaY });
        } else if (transformType === 'rotate' && initialBounds) {
            // Calculate rotation angle based on mouse position
            const centerX = initialBounds.x + initialBounds.width / 2;
            const centerY = initialBounds.y + initialBounds.height / 2;
            const angle = Math.atan2(e.clientY - centerY, e.clientX - centerX);
            const rotation = (angle * 180 / Math.PI) + 90; // Convert to degrees
            onTransform?.(transformRef.current, { x: rotation, y: 0 });
        } else if (transformType === 'anchor') {
            onTransform?.(transformRef.current, { x: deltaX, y: deltaY });
        }
    }, [onTransform, calculateResize]);

    // Handle transform end
    const handleTransformEnd = useCallback(() => {
        if (!transformRef.current.isTransforming) return;

        const state = transformRef.current;
        onTransformEnd?.(state);

        updateTransformState({
            isTransforming: false,
            transformType: null,
            startPosition: { x: 0, y: 0 },
            initialBounds: { x: 0, y: 0, width: 0, height: 0, rotation: 0 },
            handlePosition: null,
        });

        // Remove global event listeners
        document.removeEventListener('mousemove', handleTransformMove);
        document.removeEventListener('mouseup', handleTransformEnd);
    }, [onTransformEnd, handleTransformMove]);

    return {
        transformState,
        handleTransformStart,
        handleTransformMove,
        handleTransformEnd,
        isTransforming: transformState.isTransforming,
    };
}
