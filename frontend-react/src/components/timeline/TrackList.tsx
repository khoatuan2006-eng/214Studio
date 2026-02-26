import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useStudioStore, type StudioState, type StudioCharacter } from '../../store/useStudioStore';

interface TrackListProps {
  pixelsPerSecond: number;
  totalDuration: number;
}

const ROW_HEIGHT = 28;

const TrackList: React.FC<TrackListProps> = ({ pixelsPerSecond, totalDuration }) => {
  const { characters, selectedCharacterId, selectCharacter } = useStudioStore(
    useShallow((state: StudioState) => ({
      characters: state.characters ?? [],
      selectedCharacterId: state.selectedCharacterId,
      selectCharacter: state.selectCharacter,
    })),
  );

  const width = pixelsPerSecond * totalDuration;

  return (
    <div className="relative">
      {characters.map((char: StudioCharacter, index: number) => {
        const isActive = char.id === selectedCharacterId;
        const top = index * ROW_HEIGHT;

        return (
          <button
            key={char.id}
            type="button"
            onClick={() => selectCharacter(char.id)}
            className={`absolute left-0 flex w-full items-center border-b px-2 text-left text-[11px] transition-colors ${
              isActive
                ? 'border-indigo-500/80 bg-indigo-600/20 text-indigo-100'
                : 'border-neutral-800 bg-neutral-900/80 text-neutral-300 hover:bg-neutral-800/80'
            }`}
            style={{ top, height: ROW_HEIGHT }}
          >
            <div className="mr-2 flex w-40 items-center justify-between pr-1 text-[11px] text-neutral-400">
              <span className="truncate font-semibold text-neutral-100">{char.name}</span>
              <span className="ml-1 rounded bg-neutral-800/80 px-1.5 py-[1px] text-[10px] uppercase tracking-wide">
                Track
              </span>
            </div>

            <div className="relative h-4 flex-1">
              {/* Placeholder clip block spanning entire duration for now.
                  Sau này sẽ được thay bằng Action Blocks thực sự. */}
              <div
                className="absolute inset-y-0 rounded-sm bg-neutral-700/40 ring-1 ring-neutral-700/70"
                style={{ width }}
              />
            </div>
          </button>
        );
      })}

      {/* Container height adapts to number of character tracks */}
      <div style={{ height: characters.length * ROW_HEIGHT }} />
    </div>
  );
};

export default TrackList;

