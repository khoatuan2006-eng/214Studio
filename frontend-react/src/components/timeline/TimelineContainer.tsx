import React, { useState } from 'react';
import type { MouseEvent } from 'react';
import { useStudioStore, type StudioState } from '../../store/useStudioStore';
import TrackList from './TrackList';

const TOTAL_DURATION_SECONDS = 12;
const PIXELS_PER_SECOND = 80;

const TimelineContainer: React.FC = () => {
  const characters = useStudioStore((state: StudioState) => state.characters);
  const safeCharacters = Array.isArray(characters) ? characters : [];
  const [cursorTime, setCursorTime] = useState(0);

  const width = TOTAL_DURATION_SECONDS * PIXELS_PER_SECOND;

  const clampTime = (t: number) => Math.max(0, Math.min(TOTAL_DURATION_SECONDS, t));

  const handleClickRuler = (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const nextTime = clampTime(x / PIXELS_PER_SECOND);
    setCursorTime(nextTime);
  };

  const playheadLeft = cursorTime * PIXELS_PER_SECOND;

  return (
    <div className="flex h-full flex-col border-t border-neutral-800 bg-neutral-900 text-[11px] text-neutral-300">
      {/* Header: time readout */}
      <div className="flex items-center justify-between border-b border-neutral-800 bg-neutral-800/80 px-4 py-1.5">
        <div className="text-[11px] uppercase tracking-wide text-neutral-400">Timeline</div>
        <div className="font-mono text-xs text-indigo-300">
          {cursorTime.toFixed(2)}
          s
        </div>
      </div>

      {/* Ruler + Playhead */}
      <div className="relative border-b border-neutral-800 bg-neutral-900">
        <div
          className="relative h-7 overflow-x-auto"
          onClick={handleClickRuler}
        >
          <div className="relative h-full" style={{ width }}>
            {/* Ruler ticks */}
            {Array.from({ length: TOTAL_DURATION_SECONDS + 1 }).map((_, second) => {
              const left = second * PIXELS_PER_SECOND;
              return (
                <div
                  key={second}
                  className="absolute top-0 flex h-full flex-col items-center"
                  style={{ left }}
                >
                  <div className="h-3 w-px bg-neutral-600" />
                  <span className="mt-0.5 text-[10px] text-neutral-500">{second}s</span>
                </div>
              );
            })}

            {/* Minor ticks */}
            {Array.from({ length: TOTAL_DURATION_SECONDS * 4 }).map((_, idx) => {
              const left = (idx + 1) * (PIXELS_PER_SECOND / 4);
              return (
                <div
                  key={`minor-${idx}`}
                  className="absolute bottom-0 h-2 w-px bg-neutral-700/70"
                  style={{ left }}
                />
              );
            })}

            {/* Playhead line (inside scroll area so it moves with content) */}
            <div
              className="pointer-events-none absolute inset-y-0 w-[2px] bg-red-500 shadow-[0_0_6px_rgba(248,113,113,0.9)]"
              style={{ left: playheadLeft }}
            />
          </div>
        </div>
      </div>

      {/* Tracks area */}
      <div className="flex-1 overflow-x-auto bg-neutral-900/90">
        <div className="relative" style={{ width }}>
          <TrackList pixelsPerSecond={PIXELS_PER_SECOND} totalDuration={TOTAL_DURATION_SECONDS} />

          {/* Overlay playhead spanning all tracks */}
          <div
            className="pointer-events-none absolute top-0 bottom-0 w-[2px] bg-red-500/80"
            style={{ left: playheadLeft }}
          />
        </div>
      </div>

      {safeCharacters.length === 0 && (
        <div className="border-t border-neutral-800 bg-neutral-900/95 px-4 py-1.5 text-[11px] text-neutral-500">
          Chưa có Track nào. Mỗi nhân vật trong `useStudioStore` sẽ tương ứng với 1 hàng (Track) tại đây.
        </div>
      )}
    </div>
  );
};

export default TimelineContainer;

