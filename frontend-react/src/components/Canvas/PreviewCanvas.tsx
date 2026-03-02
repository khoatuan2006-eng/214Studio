import React, { useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useStudioStore } from '../../store/useStudioStore';
import { Compositor } from '../../core/renderer/Compositor';

const PreviewCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const compositorRef = useRef<Compositor | null>(null);

  const { stage } = useStudioStore(
    useShallow((state) => ({
      stage: state.stage,
    }))
  );

  const stageWidth = stage?.width ?? 1920;
  const stageHeight = stage?.height ?? 1080;
  const bg = stage?.backgroundColor ?? '#050816';

  // Keep the preview box visually scaled down to fit UI
  const scale = 0.5;
  const displayWidth = stageWidth * scale;
  const displayHeight = stageHeight * scale;

  useEffect(() => {
    if (!canvasRef.current) return;

    // Initialize the Vanilla PixiJS Engine
    compositorRef.current = new Compositor(
      canvasRef.current,
      stageWidth,
      stageHeight,
      bg
    );

    return () => {
      // Cleanup the renderer on unmount
      if (compositorRef.current) {
        compositorRef.current.destroy();
        compositorRef.current = null;
      }
    };
  }, []); // Run once on mount

  // Watch for background color changes natively
  useEffect(() => {
    if (compositorRef.current && compositorRef.current.app.renderer) {
      compositorRef.current.app.renderer.background.color = bg;
    }
  }, [bg]);

  // Watch for exact stage sizing (if changed from 1920x1080)
  useEffect(() => {
    if (compositorRef.current) {
      compositorRef.current.resize(stageWidth, stageHeight);
    }
  }, [stageWidth, stageHeight]);

  return (
    <div
      className="flex flex-col items-center justify-center w-full h-full min-h-[200px]"
      style={{ padding: 16, boxSizing: 'border-box' }}
    >
      <div
        className="relative rounded-xl overflow-hidden flex-shrink-0"
        style={{
          width: displayWidth,
          height: displayHeight,
          minWidth: displayWidth,
          minHeight: displayHeight,
          background: bg,
          boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
        }}
      >
        <canvas
          ref={canvasRef}
          style={{
            width: '100%',
            height: '100%',
            display: 'block',
          }}
        />
      </div>
      <span className="text-xs text-neutral-500 mt-2">
        Preview {stageWidth}x{stageHeight} (Decoupled Pixi Engine)
      </span>
    </div>
  );
};

export default PreviewCanvas;
