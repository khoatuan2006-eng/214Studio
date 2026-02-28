import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TrackGroupHeader } from '../track-group-header';
import '@testing-library/jest-dom';

// Mock lucide-react
vi.mock('lucide-react', () => ({
    ChevronRight: () => <div data-testid="chevron-icon" />,
    Trash2: () => <div data-testid="trash-icon" />,
    Pencil: () => <div data-testid="pencil-icon" />,
}));

// Mock useAppStore
const mockUpdateTrackGroup = vi.fn();
const mockRemoveTrackGroup = vi.fn();

vi.mock('@/store/useAppStore', () => ({
    useAppStore: () => ({
        updateTrackGroup: mockUpdateTrackGroup,
        removeTrackGroup: mockRemoveTrackGroup,
    }),
}));

describe('TrackGroupHeader', () => {
    const mockGroup = {
        id: 'group-1',
        name: 'Test Group',
        color: '#ff0000',
        isCollapsed: false,
    };

    it('renders group name and color', () => {
        render(
            <TrackGroupHeader
                group={mockGroup}
                trackCount={5}
            />
        );

        expect(screen.getByText('Test Group')).toBeInTheDocument();
        expect(screen.getByText('(5)')).toBeInTheDocument();
    });

    it('calls updateTrackGroup when collapse button clicked', () => {
        render(
            <TrackGroupHeader
                group={mockGroup}
                trackCount={5}
            />
        );

        const toggleBtn = screen.getByTitle(/collapse group/i);
        fireEvent.click(toggleBtn);
        expect(mockUpdateTrackGroup).toHaveBeenCalledWith('group-1', { isCollapsed: true });
    });

    it('calls removeTrackGroup when delete button clicked', () => {
        render(
            <TrackGroupHeader
                group={mockGroup}
                trackCount={5}
            />
        );

        const deleteBtn = screen.getByTitle(/delete group/i);
        fireEvent.click(deleteBtn);
        expect(mockRemoveTrackGroup).toHaveBeenCalledWith('group-1');
    });
});
