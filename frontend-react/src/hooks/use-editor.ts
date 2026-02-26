import { useAppStore } from "@/store/useAppStore";
import { useCallback } from "react";
import type { TimelineTrack, TimelineElement } from "@/types/timeline";

// Selection mock state globally
let selectedElements: any[] = [];
const selectionListeners = new Set<() => void>();
const notifySelection = () => selectionListeners.forEach(l => l());

// Mock EditorCore that bridges OpenCut UI with our Zustand store
export function useEditor() {
    const { editorData, cursorTime, setCursorTime, isScrubbing, setIsScrubbing } = useAppStore();

    // Map our RowData (Characters) to OpenCut's TimelineTrack
    const getTracks = useCallback((): TimelineTrack[] => {
        return editorData.map(row => ({
            id: row.id,
            name: row.name,
            type: "video",
            isMain: false,
            muted: false,
            hidden: false,
            elements: row.actions.map(action => ({
                id: action.id,
                name: "Action",
                type: "image",
                startTime: action.start,
                duration: action.end - action.start,
                trimStart: 0,
                trimEnd: 0,
                trackId: row.id,
                layer: action.zIndex,
                mediaId: action.assetHash, // We'll map this to image hashes
                sourceUrl: "",
                hidden: false,
                opacity: 100,
                transform: {
                    x: 0, y: 0, scale: 1, rotation: 0
                }
            } as any)) // cast to any first, or ImageElement, any is safer here to bypass strict discrimination
        }));
    }, [editorData]);

    return {
        timeline: {
            getTracks,
            getTotalDuration: () => 60, // 60 seconds default timeline for now
            toggleTrackMute: () => { },
            toggleTrackVisibility: () => { },
            removeTrack: () => { },
            deleteElements: (elements: any[]) => {
                const elementIds = new Set(elements.map(e => e.elementId));
                useAppStore.getState().setEditorData(prev => prev.map(row => ({
                    ...row,
                    actions: row.actions.filter(a => !elementIds.has(a.id))
                })));
            },
            addTrack: (_args: any) => "mock-track-id", // we don't dynamically create character tracks from timeline dropping
            insertElement: ({ placement, element }: any) => {
                if (placement.mode === "explicit" && placement.trackId) {
                    useAppStore.getState().setEditorData(prev => prev.map(row => {
                        if (row.id === placement.trackId) {
                            return {
                                ...row,
                                actions: [
                                    ...row.actions,
                                    {
                                        id: `action_${Date.now()}_${Math.random()}`,
                                        start: element.startTime,
                                        end: element.startTime + element.duration,
                                        assetHash: element.mediaId,
                                        zIndex: element.layer ?? 10
                                    }
                                ]
                            };
                        }
                        return row;
                    }));
                }
            },
            moveElement: ({ sourceTrackId, targetTrackId, elementId, newStartTime }: any) => {
                const state = useAppStore.getState();
                const sourceRow = state.editorData.find(r => r.id === sourceTrackId);
                const actionToMove = sourceRow?.actions.find(a => a.id === elementId);
                if (!actionToMove) return;

                const duration = actionToMove.end - actionToMove.start;

                state.setEditorData(prev => prev.map(row => {
                    let actions = [...row.actions];
                    if (row.id === sourceTrackId) actions = actions.filter(a => a.id !== elementId);
                    if (row.id === targetTrackId) {
                        actions.push({ ...actionToMove, start: newStartTime, end: newStartTime + duration });
                    }
                    return { ...row, actions };
                }));
            },
            updateElementStartTime: ({ elements, startTime }: { elements: any[], startTime: number }) => {
                const element = elements[0];
                if (!element) return;
                useAppStore.getState().setEditorData(prev => prev.map(row => {
                    if (row.id !== element.trackId) return row;
                    return {
                        ...row,
                        actions: row.actions.map(a => {
                            if (a.id === element.elementId) {
                                const duration = a.end - a.start;
                                return { ...a, start: startTime, end: startTime + duration };
                            }
                            return a;
                        })
                    }
                }));
            },
            updateElementDuration: ({ trackId, elementId, duration }: any) => {
                useAppStore.getState().setEditorData(prev => prev.map(row => {
                    if (row.id !== trackId) return row;
                    return {
                        ...row,
                        actions: row.actions.map(a => a.id === elementId ? { ...a, end: a.start + duration } : a)
                    }
                }));
            },
            updateElementTrim: () => { } // Non-operational for images
        },
        playback: {
            seek: ({ time }: { time: number }) => {
                setCursorTime(time);
            },
            getCurrentTime: () => cursorTime,
            isPlaying: false,
            setScrubbing: ({ isScrubbing: val }: { isScrubbing: boolean }) => setIsScrubbing(val),
            getIsScrubbing: () => isScrubbing,
        },
        project: {
            getActive: () => ({ id: "project-1", resolution: { width: 1920, height: 1080 }, settings: { fps: 30 } }),
            getTimelineViewState: () => ({
                zoomLevel: 1, // Default zoom
                scrollLeft: 0,
                playheadTime: cursorTime,
            }),
            setTimelineViewState: (_args: any) => { }, // Mock
        },
        scenes: {
            getActiveScene: () => ({ id: "scene-1", name: "Scene 1", bookmarks: [] }),
            isBookmarked: (_args: any) => false
        },
        selection: {
            subscribe: (listener: () => void) => {
                selectionListeners.add(listener);
                return () => { selectionListeners.delete(listener); };
            },
            getSelectedElements: () => selectedElements,
            setSelectedElements: ({ elements }: { elements: any[] }) => {
                selectedElements = elements;
                notifySelection();
            },
            clearSelection: () => {
                selectedElements = [];
                notifySelection();
            },
        },
        media: {
            getAssets: (): any[] => [], // We will adapt this to return our CharacterAssets
        }
    };
}
