import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useEditorDataStore } from '../editor-data-store';
import { useAppStore } from '@/store/useAppStore';

// Mock useAppStore
vi.mock('@/store/useAppStore', () => ({
    useAppStore: {
        getState: vi.fn(),
        subscribe: vi.fn(),
    },
}));

describe('useEditorDataStore', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should initialize with empty state', () => {
        const state = useEditorDataStore.getState().normalized;
        expect(state.tracks).toEqual({});
        expect(state.actions).toEqual({});
        expect(state.trackOrder).toEqual([]);
        expect(state.actionsByTrack).toEqual({});
    });

    it('should sync from legacy editorData', () => {
        const mockLegacyData = [
            {
                id: 'track-1',
                name: 'Track 1',
                transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
                actions: [
                    { id: 'action-1', assetHash: 'hash-1', start: 0, end: 10, zIndex: 0 },
                ],
            },
        ];

        (useAppStore.getState as any).mockReturnValue({ editorData: mockLegacyData });

        useEditorDataStore.getState().syncFromLegacy();

        const state = useEditorDataStore.getState().normalized;
        expect(state.trackOrder).toEqual(['track-1']);
        expect(state.tracks['track-1'].name).toBe('Track 1');
        expect(state.actions['action-1'].assetHash).toBe('hash-1');
        expect(state.actionsByTrack['track-1']).toEqual(['action-1']);
    });

    it('should provide O(1) selectors', () => {
        const mockLegacyData = [
            {
                id: 'track-1',
                name: 'Track 1',
                transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
                actions: [
                    { id: 'action-1', assetHash: 'hash-1', start: 0, end: 10, zIndex: 0 },
                ],
            },
        ];

        (useAppStore.getState as any).mockReturnValue({ editorData: mockLegacyData });
        useEditorDataStore.getState().syncFromLegacy();

        const track = useEditorDataStore.getState().getTrack('track-1');
        expect(track?.name).toBe('Track 1');

        const action = useEditorDataStore.getState().getAction('action-1');
        expect(action?.assetHash).toBe('hash-1');

        const actions = useEditorDataStore.getState().getActionsByTrack('track-1');
        expect(actions).toHaveLength(1);
        expect(actions[0].id).toBe('action-1');
    });
});
