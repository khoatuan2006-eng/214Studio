import { EditorCore } from '../core';

export function useCore(): EditorCore {
    return EditorCore.getInstance();
}
