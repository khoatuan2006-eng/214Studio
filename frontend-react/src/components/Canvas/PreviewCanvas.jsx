import React from 'react';
import { Stage, Layer, Group, Image as KonvaImage, Rect } from 'react-konva';
import useImage from 'use-image';
import { useShallow } from 'zustand/react/shallow';
import { useStudioStore } from '../../store/useStudioStore';

const CharacterPartImage = ({ src, x, y, zIndex }) => {
  const [image, status] = useImage(src || '', 'anonymous');

  if (!src) return null;

  const size = 48;
  const half = size / 2;

  if (!image || status === 'failed') {
    return (
      <Group x={x} y={y} listening={false}>
        <Rect
          offsetX={half}
          offsetY={half}
          width={size}
          height={size}
          fill="#404040"
          stroke="#6366f1"
          strokeWidth={2}
          zIndex={zIndex}
        />
      </Group>
    );
  }

  return (
    <KonvaImage
      image={image}
      x={x}
      y={y}
      offsetX={image.width / 2}
      offsetY={image.height / 2}
      listening={false}
      perfectDrawEnabled={false}
      transformsEnabled="position"
      zIndex={zIndex}
    />
  );
};

const PreviewCanvas = () => {
  const { stage, characters, selectedCharacterId, selectCharacter, updateCharacterPosition } =
    useStudioStore(
      useShallow((state) => ({
        stage: state.stage,
        characters: state.characters ?? [],
        selectedCharacterId: state.selectedCharacterId,
        selectCharacter: state.selectCharacter,
        updateCharacterPosition: state.updateCharacterPosition,
      })),
    );

  const stageWidth = stage?.width ?? 1280;
  const stageHeight = stage?.height ?? 720;
  const bg = stage?.backgroundColor ?? '#050816';
  const scale = 0.6;
  const displayWidth = stageWidth * scale;
  const displayHeight = stageHeight * scale;

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
          cursor: 'grab',
        }}
      >
        <Stage
          width={stageWidth}
          height={stageHeight}
          scaleX={scale}
          scaleY={scale}
          style={{ display: 'block' }}
        >
          <Layer>
            {characters.map((character) => {
              const isSelected = character.id === selectedCharacterId;

              return (
                <Group
                  key={character.id}
                  x={character.x}
                  y={character.y}
                  scaleX={character.scale}
                  scaleY={character.scale}
                  rotation={character.rotation ?? 0}
                  draggable
                  onDragEnd={(e) => {
                    const { x, y } = e.target.position();
                    updateCharacterPosition(character.id, x, y);
                  }}
                  onClick={() => selectCharacter(character.id)}
                  onTap={() => selectCharacter(character.id)}
                >
                  {isSelected && <Group />}

                  {(character.parts ?? [])
                    .slice()
                    .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0))
                    .map((part) => (
                      <CharacterPartImage
                        key={part.id}
                        src={part.src}
                        x={part.offsetX}
                        y={part.offsetY}
                        zIndex={part.zIndex}
                      />
                    ))}
                </Group>
              );
            })}
          </Layer>
        </Stage>
      </div>
      <span className="text-xs text-neutral-500 mt-2">Preview 16:9</span>
    </div>
  );
};

export default PreviewCanvas;

