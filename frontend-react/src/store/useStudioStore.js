import { create } from 'zustand';

// Simple helper to create a unique id without adding extra dependencies
const createId = (prefix = 'char') => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// Tiny placeholder PNG (1x1 transparent or a small colored square) as data URL - no CORS
const PLACEHOLDER_SRC = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmiQQAAAABJRU5ErkJggg==';

const createDefaultCharacters = () => [
  {
    id: 'char-1',
    name: 'Hero',
    x: 640,
    y: 360,
    scale: 1,
    rotation: 0,
    parts: [
      {
        id: 'char-1-face',
        type: 'face',
        name: 'Face',
        offsetX: 0,
        offsetY: -60,
        zIndex: 2,
        src: PLACEHOLDER_SRC,
      },
      {
        id: 'char-1-body',
        type: 'body',
        name: 'Body',
        offsetX: 0,
        offsetY: 40,
        zIndex: 1,
        src: PLACEHOLDER_SRC,
      },
      {
        id: 'char-1-accessory',
        type: 'accessory',
        name: 'Accessory',
        offsetX: 80,
        offsetY: -80,
        zIndex: 3,
        src: PLACEHOLDER_SRC,
      },
    ],
  },
];

export const useStudioStore = create((set, get) => ({
  // Global stage configuration for the preview canvas
  stage: {
    width: 1280,
    height: 720,
    backgroundColor: '#050816',
  },

  // 1 Track = 1 Character (Parent)
  // Mỗi character tương ứng với một Group trong react-konva
  characters: createDefaultCharacters(),

  // UI selection state
  selectedCharacterId: 'char-1',

  // Selector helpers
  getSelectedCharacter: () => {
    const { characters, selectedCharacterId } = get();
    return characters.find((c) => c.id === selectedCharacterId) || null;
  },

  // Actions
  selectCharacter: (id) => set({ selectedCharacterId: id }),

  addCharacter: (payload = {}) =>
    set((state) => {
      const id = payload.id || createId('char');
      const newCharacter = {
        id,
        name: payload.name || `Character ${state.characters.length + 1}`,
        x: payload.x ?? 640,
        y: payload.y ?? 360,
        scale: payload.scale ?? 1,
        rotation: payload.rotation ?? 0,
        parts: payload.parts || [],
      };

      return {
        characters: [...state.characters, newCharacter],
        selectedCharacterId: id,
      };
    }),

  updateCharacterTransform: (id, partialTransform) =>
    set((state) => ({
      characters: state.characters.map((c) =>
        c.id === id
          ? {
              ...c,
              ...partialTransform,
            }
          : c,
      ),
    })),

  updateCharacterPosition: (id, x, y) =>
    set((state) => ({
      characters: state.characters.map((c) =>
        c.id === id
          ? {
              ...c,
              x,
              y,
            }
          : c,
      ),
    })),

  updatePartOffset: (characterId, partId, offsetX, offsetY) =>
    set((state) => ({
      characters: state.characters.map((c) => {
        if (c.id !== characterId) return c;
        return {
          ...c,
          parts: c.parts.map((p) =>
            p.id === partId
              ? {
                  ...p,
                  offsetX,
                  offsetY,
                }
              : p,
          ),
        };
      }),
    })),
}));

