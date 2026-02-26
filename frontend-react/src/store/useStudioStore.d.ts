/** Type declaration for useStudioStore.js (Zustand store) */

export interface StudioCharacterPart {
  id: string;
  type: string;
  name: string;
  offsetX: number;
  offsetY: number;
  zIndex: number;
  src: string;
}

export interface StudioCharacter {
  id: string;
  name: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  parts: StudioCharacterPart[];
}

export interface StudioState {
  stage: { width: number; height: number; backgroundColor: string };
  characters: StudioCharacter[];
  selectedCharacterId: string;
  getSelectedCharacter: () => StudioCharacter | null;
  selectCharacter: (id: string) => void;
  addCharacter: (payload?: Partial<StudioCharacter>) => void;
  updateCharacterTransform: (id: string, partial: Partial<Pick<StudioCharacter, 'x' | 'y' | 'scale' | 'rotation'>>) => void;
  updateCharacterPosition: (id: string, x: number, y: number) => void;
  updatePartOffset: (characterId: string, partId: string, offsetX: number, offsetY: number) => void;
}

export function useStudioStore<T>(selector: (state: StudioState) => T): T;
