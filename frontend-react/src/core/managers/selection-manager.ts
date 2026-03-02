import { EditorCore } from '../index';

/**
 * SelectionManager
 * 
 * Manages which character/row is currently selected in the studio.
 */
export class SelectionManager {
    private selectedRowId: string = '';
    private listeners = new Set<() => void>();

    constructor(_core: EditorCore) {
    }

    setSelectedRowId(id: string): void {
        if (this.selectedRowId === id) return;
        this.selectedRowId = id;
        this.notify();
    }

    getSelectedRowId(): string {
        return this.selectedRowId;
    }

    subscribe(fn: () => void): () => void {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    }

    private notify(): void {
        this.listeners.forEach(fn => fn());
    }
}
