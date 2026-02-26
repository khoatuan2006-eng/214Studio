import React, { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import PreviewCanvas from '../components/Canvas/PreviewCanvas';
import { useStudioStore } from '../store/useStudioStore';
import type { StudioState, StudioCharacter } from '../store/useStudioStore';
import TimelineContainer from '../components/timeline/TimelineContainer';

const AssetSidebar: React.FC = () => {
  const { characters, selectedCharacterId, selectCharacter } = useStudioStore(
    useShallow((state: StudioState) => ({
      characters: state.characters,
      selectedCharacterId: state.selectedCharacterId,
      selectCharacter: state.selectCharacter,
    })),
  );

  return (
    <aside className="h-full w-full bg-neutral-900 border-r border-neutral-800 flex flex-col">
      <div className="px-4 py-3 border-b border-neutral-800 bg-neutral-800/70">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
          Asset Sidebar
        </h2>
        <p className="mt-1 text-[11px] text-neutral-500">
          Về sau sẽ kéo thả Face / Body / Accessories từ đây.
        </p>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {characters.map((char: StudioCharacter) => {
          const isActive = char.id === selectedCharacterId;
          return (
            <button
              key={char.id}
              type="button"
              onClick={() => selectCharacter(char.id)}
              className={`w-full flex flex-col items-start rounded-md border px-3 py-2 text-left text-xs transition-colors ${
                isActive
                  ? 'border-indigo-500 bg-indigo-600/20 text-indigo-200'
                  : 'border-neutral-700 bg-neutral-800/50 text-neutral-200 hover:border-neutral-500 hover:bg-neutral-800'
              }`}
            >
              <span className="font-semibold truncate">{char.name}</span>
              <span className="mt-0.5 text-[10px] text-neutral-400">Track = Character</span>
            </button>
          );
        })}
        {characters.length === 0 && (
          <p className="text-[11px] text-neutral-500">
            Chưa có nhân vật nào trong Studio Store. Sau này sẽ spawn từ Base/Dressing.
          </p>
        )}
      </div>
    </aside>
  );
};

const PropertiesPanel: React.FC = () => {
  const { selectedCharacter, updateCharacterPosition, updateCharacterTransform } = useStudioStore(
    useShallow((state: StudioState) => ({
      selectedCharacter: state.getSelectedCharacter(),
      updateCharacterPosition: state.updateCharacterPosition,
      updateCharacterTransform: state.updateCharacterTransform,
    })),
  );

  const handleChangeNumber = useCallback(
    (field: 'x' | 'y' | 'scale', value: string) => {
      if (!selectedCharacter) return;
      const parsed = parseFloat(value);
      if (Number.isNaN(parsed)) return;

      if (field === 'x' || field === 'y') {
        const nextX = field === 'x' ? parsed : selectedCharacter.x;
        const nextY = field === 'y' ? parsed : selectedCharacter.y;
        updateCharacterPosition(selectedCharacter.id, nextX, nextY);
      } else {
        updateCharacterTransform(selectedCharacter.id, { scale: parsed });
      }
    },
    [selectedCharacter, updateCharacterPosition, updateCharacterTransform],
  );

  return (
    <aside className="h-full w-full bg-neutral-900 border-l border-neutral-800 flex flex-col">
      <div className="px-4 py-3 border-b border-neutral-800 bg-neutral-800/70">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
          Properties
        </h2>
        <p className="mt-1 text-[11px] text-neutral-500">
          Chỉ số cơ bản của nhân vật đang chọn (X, Y, Scale).
        </p>
      </div>

      <div className="flex-1 p-4 space-y-4 text-xs">
        {selectedCharacter ? (
          <>
            <div className="text-[11px] text-neutral-400">
              Đang chỉnh: <span className="font-semibold text-neutral-100">{selectedCharacter.name}</span>
            </div>
            <div className="space-y-3">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-neutral-400">X Position</label>
                <input
                  type="number"
                  className="w-full rounded border border-neutral-700 bg-neutral-800/60 px-2 py-1 text-xs outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  value={Math.round(selectedCharacter.x)}
                  onChange={(e) => handleChangeNumber('x', e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-neutral-400">Y Position</label>
                <input
                  type="number"
                  className="w-full rounded border border-neutral-700 bg-neutral-800/60 px-2 py-1 text-xs outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  value={Math.round(selectedCharacter.y)}
                  onChange={(e) => handleChangeNumber('y', e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-neutral-400">Scale</label>
                <input
                  type="number"
                  step="0.1"
                  className="w-full rounded border border-neutral-700 bg-neutral-800/60 px-2 py-1 text-xs outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  value={selectedCharacter.scale.toFixed(2)}
                  onChange={(e) => handleChangeNumber('scale', e.target.value)}
                />
              </div>
            </div>
          </>
        ) : (
          <p className="text-[11px] text-neutral-500">
            Chưa có nhân vật nào được chọn. Chọn một Track bên trái hoặc click trực tiếp trên canvas.
          </p>
        )}
      </div>
    </aside>
  );
};

const StudioMain: React.FC = () => {
  return (
    <div className="flex flex-col flex-1 min-h-0 w-full bg-neutral-900 text-neutral-100">
      {/* Top: Sidebar (assets) + Preview + Properties */}
      <div className="flex-1 min-h-0 grid grid-cols-[minmax(220px,260px)_minmax(0,1fr)_minmax(240px,280px)] border-b border-neutral-800 overflow-hidden">
        <AssetSidebar />

        <div className="flex min-h-0 w-full items-center justify-center bg-neutral-950 overflow-hidden">
          <div className="w-full h-full min-h-0 flex items-center justify-center">
            <PreviewCanvas />
          </div>
        </div>

        <PropertiesPanel />
      </div>

      {/* Bottom: Timeline editor shell */}
      <div className="flex-shrink-0 h-64 min-h-[14rem] bg-neutral-900 border-t border-neutral-800">
        <TimelineContainer />
      </div>
    </div>
  );
};

export default StudioMain;

