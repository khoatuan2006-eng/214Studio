import { useAppStore } from "@/store/useAppStore";
import { useCallback, useMemo } from "react";
import { useTimelineStore } from "@/stores/timeline-store";
import type { TimelineTrack, VideoElement, TimelineElement } from "../types/timeline";

// Selection mock state globally
let selectedElements: { elementId: string; trackId: string }[] = [];
const selectionListeners = new Set<() => void>();
const notifySelection = () => selectionListeners.forEach(l => l());

// Mock EditorCore that bridges OpenCut UI with our Zustand store
export function useEditor() {
    const editorData = useAppStore(state => state.editorData);

    // Map our RowData (Characters) to OpenCut's TimelineTrack
    const getTracks = useCallback((): TimelineTrack[] => {
        const activeEditTargetId = useAppStore.getState().activeEditTargetId;
        const tracks: TimelineTrack[] = [];

        if (activeEditTargetId) {
            // Nested Composition Context ("Chia để trị")
            const character = editorData.find(c => c.id === activeEditTargetId);
            if (character) {
                const baseCharacter = useAppStore.getState().characters.find(c => c.id === character.characterId);

                // Unify keyframes for the entire character
                const uniqueTimes = new Set<number>();
                (['x', 'y', 'scale', 'rotation', 'opacity'] as const).forEach(prop => {
                    character.transform[prop].forEach(k => uniqueTimes.add(k.time));
                });
                const unifiedKeyframes = Array.from(uniqueTimes)
                    .sort((a, b) => a - b)
                    .map(time => ({ time }));

                const groupedActions = character.actions.map((action, index) => {
                    let groupName = "Other";
                    if (baseCharacter && baseCharacter.layer_groups) {
                        for (const [gName, assets] of Object.entries(baseCharacter.layer_groups)) {
                            if ((assets as any[]).some(a => a.hash === action.assetHash || a.path === action.assetHash)) {
                                groupName = gName;
                                break;
                            }
                        }
                    }
                    return { action, index, groupName, zIndex: action.zIndex || 0 };
                });

                // Group by zIndex
                const actionsByZIndex = new Map<number, typeof groupedActions>();
                groupedActions.forEach(item => {
                    const z = item.zIndex;
                    if (!actionsByZIndex.has(z)) actionsByZIndex.set(z, []);
                    actionsByZIndex.get(z)!.push(item);
                });

                // Sort z-indices descending (foreground to background)
                const sortedZIndices = Array.from(actionsByZIndex.keys()).sort((a, b) => b - a);

                let trackCounter = 0;
                sortedZIndices.forEach(z => {
                    const items = actionsByZIndex.get(z)!;
                    // Sort items by start time to pack them left-to-right
                    items.sort((a, b) => a.action.start - b.action.start);

                    // Pack into horizontal tracks
                    const packedTracks: (typeof items)[] = [];
                    items.forEach(item => {
                        let placed = false;
                        for (const track of packedTracks) {
                            const lastItem = track[track.length - 1];
                            if (lastItem.action.end <= item.action.start) {
                                track.push(item);
                                placed = true;
                                break;
                            }
                        }
                        if (!placed) {
                            packedTracks.push([item]);
                        }
                    });

                    packedTracks.forEach((trackItems, trackIndex) => {
                        const groupName = trackItems[0].groupName; // Typically all share the same groupName
                        tracks.push({
                            id: `nested_z${z}_t${trackCounter++}`,
                            name: `[${groupName}]${packedTracks.length > 1 ? ` Track ${trackIndex + 1}` : ''}`,
                            type: "video",
                            hidden: false,
                            isMain: false,
                            muted: false,
                            keyframes: [],
                            elements: trackItems.map(({ action, index }) => ({
                                id: action.id,
                                name: action.assetHash.split('/').pop() || `Layer ${index}`,
                                type: "video",
                                duration: action.end - action.start,
                                startTime: action.start,
                                trimStart: 0,
                                trimEnd: action.end - action.start,
                                mediaId: action.assetHash,
                                transform: { x: 0, y: 0, scale: 1, rotation: 0 },
                                opacity: 100,
                                hidden: action.hidden,
                                locked: action.locked,
                                keyframes: unifiedKeyframes.filter(k => k.time >= action.start && k.time <= action.end)
                            })) as VideoElement[]
                        });
                    });
                });
            }
        } else {
            // Main Scene Context (Compound View)
            editorData.forEach(row => {
                // Unify keyframes for parent track from all properties
                const uniqueTimes = new Set<number>();
                (['x', 'y', 'scale', 'rotation', 'opacity'] as const).forEach(prop => {
                    row.transform[prop].forEach(k => uniqueTimes.add(k.time));
                });
                const unifiedKeyframes = Array.from(uniqueTimes)
                    .sort((a, b) => a - b)
                    .map(time => ({ time }));

                let minStart = Infinity;
                let maxEnd = 0;
                row.actions.forEach(a => {
                    if (a.start < minStart) minStart = a.start;
                    if (a.end > maxEnd) maxEnd = a.end;
                });
                if (minStart === Infinity) minStart = 0;

                const parentTrack: TimelineTrack = {
                    id: row.id,
                    name: row.name || `Data ${row.id}`,
                    type: "video",
                    hidden: false,
                    isMain: false,
                    muted: false,
                    keyframes: unifiedKeyframes,
                    elements: row.actions.length === 0 ? [] : [{
                        id: row.id + "_compound", // Special ID for compound Dragging
                        name: row.name || `Data ${row.id}`,
                        type: "video",
                        duration: maxEnd - minStart,
                        startTime: minStart,
                        trimStart: 0,
                        trimEnd: maxEnd - minStart,
                        mediaId: row.actions[0]?.assetHash || "compound",
                        transform: { x: 0, y: 0, scale: 1, rotation: 0 },
                        opacity: 100,
                        hidden: false,
                        keyframes: unifiedKeyframes
                    }] as VideoElement[],
                };
                tracks.push(parentTrack);
            });
        }

        return tracks;
    }, [editorData]);

    // Our own generic listener bridge to Zustand
    const bridge = useMemo(() => ({
        // Support shifting Keyframes from the timeline UI directly
        updateKeyframeTime: (trackId: string, oldTime: number, newTime: number) => {
            useAppStore.getState().setEditorData(prev => prev.map(row => {
                if (trackId.startsWith(row.id + '_')) {
                    // Updating a specific sub-track keyframe
                    const prop = trackId.split('_').pop() as keyof typeof row.transform;
                    if (['x', 'y', 'scale', 'rotation', 'opacity'].includes(prop)) {
                        const newTransform = { ...row.transform };
                        const idx = newTransform[prop].findIndex(k => Math.abs(k.time - oldTime) < 0.05);
                        if (idx >= 0) {
                            newTransform[prop][idx] = { ...newTransform[prop][idx], time: newTime };
                            newTransform[prop].sort((a, b) => a.time - b.time);
                        }
                        return { ...row, transform: newTransform };
                    }
                } else if (row.id === trackId) {
                    // Updating unified (parent track) keyframe
                    const newTransform = { ...row.transform };
                    (['x', 'y', 'scale', 'rotation', 'opacity'] as const).forEach(prop => {
                        const idx = newTransform[prop].findIndex(k => Math.abs(k.time - oldTime) < 0.05);
                        if (idx >= 0) {
                            newTransform[prop][idx] = { ...newTransform[prop][idx], time: newTime };
                            newTransform[prop].sort((a, b) => a.time - b.time);
                        }
                    });
                    return { ...row, transform: newTransform };
                }
                return row;
            }));
        },
        removeKeyframe: (trackId: string, time: number) => {
            useAppStore.getState().setEditorData(prev => prev.map(row => {
                if (trackId.startsWith(row.id + '_')) {
                    const prop = trackId.split('_').pop() as keyof typeof row.transform;
                    if (['x', 'y', 'scale', 'rotation', 'opacity'].includes(prop)) {
                        const newTransform = { ...row.transform };
                        newTransform[prop] = newTransform[prop].filter(k => Math.abs(k.time - time) > 0.05);
                        return { ...row, transform: newTransform };
                    }
                } else if (row.id === trackId) {
                    const newTransform = { ...row.transform };
                    (['x', 'y', 'scale', 'rotation', 'opacity'] as const).forEach(prop => {
                        newTransform[prop] = newTransform[prop].filter(k => Math.abs(k.time - time) > 0.05);
                    });
                    return { ...row, transform: newTransform };
                }
                return row;
            }));
        },
    }), []);

    return {
        timeline: {
            getTracks,
            updateKeyframeTime: bridge.updateKeyframeTime,
            removeKeyframe: bridge.removeKeyframe,
            getTotalDuration: () => 60, // 60 seconds default timeline for now
            toggleTrackMute: (_params: { trackId: string }) => { },
            toggleTrackVisibility: (_params: { trackId: string }) => { },
            removeTrack: (trackId: string) => {
                const state = useAppStore.getState();
                const activeEditTargetId = state.activeEditTargetId;

                if (activeEditTargetId && trackId.startsWith('nested_')) {
                    // Nested Composition Context: Delete specific accessory action
                    const actionId = trackId.replace('nested_', '');
                    state.setEditorData(prev => prev.map(row => {
                        if (row.id === activeEditTargetId) {
                            return { ...row, actions: row.actions.filter(a => a.id !== actionId) };
                        }
                        return row;
                    }));
                } else {
                    // Main Scene Context: Delete entire character and all its embedded tracks
                    state.setEditorData(prev => prev.filter(row => row.id !== trackId));
                    if (state.activeEditTargetId === trackId) {
                        state.setActiveEditTargetId(null); // Exit context if we delete the character we are inside
                    }
                }
            },
            deleteElements: (elements: { elementId: string; trackId: string }[]) => {
                const elementIds = new Set(elements.map(e => e.elementId));
                useAppStore.getState().setEditorData(prev => prev.map(row => {
                    // Check if they deleted the Compound Block in Main Mode
                    if (elements.some(e => e.elementId === `${row.id}_compound`)) {
                        return { ...row, actions: [] };
                    }

                    return {
                        ...row,
                        actions: row.actions.filter(a => !elementIds.has(a.id))
                    };
                }));
            },
            splitElement: (elementId: string) => {
                const state = useAppStore.getState();
                const time = state.cursorTime;

                state.setEditorData(prev => prev.map(row => {
                    if (elementId.endsWith('_compound')) return row; // Compound split not supported yet

                    const actionIndex = row.actions.findIndex(a => a.id === elementId);
                    if (actionIndex > -1) {
                        const action = row.actions[actionIndex];
                        if (time > action.start && time < action.end) {
                            const newActions = [...row.actions];
                            // Right half (new)
                            newActions.push({
                                ...action,
                                id: `action_split_${Date.now()}`,
                                start: time
                            });
                            // Left half (shorten original)
                            newActions[actionIndex] = { ...action, end: time };
                            return { ...row, actions: newActions };
                        }
                    }
                    return row;
                }));
            },
            duplicateElement: (elementId: string) => {
                useAppStore.getState().setEditorData(prev => prev.map(row => {
                    if (elementId.endsWith('_compound')) return row;
                    const actionIndex = row.actions.findIndex(a => a.id === elementId);
                    if (actionIndex > -1) {
                        const action = row.actions[actionIndex];
                        return {
                            ...row,
                            actions: [
                                ...row.actions,
                                {
                                    ...action,
                                    id: `action_copy_${Date.now()}`,
                                    zIndex: action.zIndex + 1
                                }
                            ]
                        };
                    }
                    return row;
                }));
            },
            addTrack: (_args: { type: string, index?: number }) => "mock-track-id", // we don't dynamically create character tracks from timeline dropping
            insertElement: ({ placement, element }: { placement: { mode: string; trackId?: string }, element: TimelineElement | any }) => {
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
                                        assetHash: (element as any).mediaId,
                                        zIndex: (element as any).layer ?? 10
                                    }
                                ]
                            };
                        }
                        return row;
                    }));
                }
            },
            moveElement: ({ sourceTrackId, targetTrackId: _targetTrackId, elementId, newStartTime, createTrack: _createTrack }: { sourceTrackId: string, targetTrackId: string, elementId: string, newStartTime: number, createTrack?: { type: string, index: number } }) => {
                const state = useAppStore.getState();
                const isCompound = elementId.endsWith('_compound');

                if (isCompound) {
                    // Moving an entire character is essentially just an offset shift on all items (similar to updateStartTime)
                    const sourceRow = state.editorData.find(r => r.id === sourceTrackId);
                    if (!sourceRow) return;

                    let minStart = Infinity;
                    sourceRow.actions.forEach(a => { if (a.start < minStart) minStart = a.start; });
                    if (minStart === Infinity) minStart = 0;
                    const delta = newStartTime - minStart;

                    state.setEditorData(prev => prev.map(row => {
                        if (row.id === sourceTrackId) {
                            return {
                                ...row,
                                actions: row.actions.map(a => ({
                                    ...a,
                                    start: a.start + delta,
                                    end: a.end + delta
                                }))
                            }
                        }
                        return row;
                    }));
                } else {
                    // Moving a single specific track/accessory
                    // Find actual source row (in edit mode, sourceTrackId looks like `nested_action123`, but we find row by looking up actions)
                    const sourceRow = state.editorData.find(r => r.actions.some(a => a.id === elementId));
                    const actionToMove = sourceRow?.actions.find(a => a.id === elementId);
                    if (!actionToMove) return;

                    const duration = actionToMove.end - actionToMove.start;

                    state.setEditorData(prev => prev.map(row => {
                        let actions = [...row.actions];
                        if (row.id === sourceRow?.id) actions = actions.filter(a => a.id !== elementId);
                        // In nested mode, targetTrackId might not correspond to standard rows.
                        // For now, disallow moving Between characters when in nested edit mode.
                        // If moving inside the same character, just update the start time.
                        if (row.id === sourceRow?.id) {
                            actions.push({ ...actionToMove, start: newStartTime, end: newStartTime + duration });
                        }
                        return { ...row, actions };
                    }));
                }
            },
            updateElementStartTime: ({ elements, startTime }: { elements: { trackId: string; elementId: string }[], startTime: number }) => {
                const element = elements[0];
                if (!element) return;
                const isRippleEnabled = useTimelineStore.getState().rippleEditingEnabled;

                useAppStore.getState().setEditorData(prev => prev.map(row => {
                    const isCompound = element.elementId.endsWith('_compound');

                    if (isCompound && row.id === element.trackId) {
                        let minStart = Infinity;
                        row.actions.forEach(a => { if (a.start < minStart) minStart = a.start; });
                        if (minStart === Infinity) minStart = 0;
                        const delta = startTime - minStart;
                        return {
                            ...row,
                            actions: row.actions.map(a => ({
                                ...a,
                                start: a.start + delta,
                                end: a.end + delta
                            }))
                        };
                    } else if (row.actions.some(a => a.id === element.elementId)) {
                        const targetAction = row.actions.find(a => a.id === element.elementId)!;
                        const delta = startTime - targetAction.start;
                        const oldStart = targetAction.start;

                        return {
                            ...row,
                            actions: row.actions.map(a => {
                                if (a.id === element.elementId) {
                                    const duration = a.end - a.start;
                                    return { ...a, start: startTime, end: startTime + duration };
                                }
                                if (isRippleEnabled && a.start > oldStart) {
                                    return { ...a, start: a.start + delta, end: a.end + delta };
                                }
                                return a;
                            })
                        }
                    }
                    return row;
                }));
            },
            updateElementDuration: ({ trackId, elementId, duration }: { trackId: string, elementId: string, duration: number }) => {
                const isRippleEnabled = useTimelineStore.getState().rippleEditingEnabled;

                useAppStore.getState().setEditorData(prev => prev.map(row => {
                    const isCompound = elementId.endsWith('_compound');

                    if (isCompound && row.id === trackId) {
                        let minStart = Infinity;
                        let maxEnd = 0;
                        row.actions.forEach(a => {
                            if (a.start < minStart) minStart = a.start;
                            if (a.end > maxEnd) maxEnd = a.end;
                        });

                        return {
                            ...row,
                            actions: row.actions.map(a => {
                                // If this asset stops at the exact same maxEnd, extend it. Otherwise leave it untouched.
                                if (Math.abs(a.end - maxEnd) < 0.001) {
                                    return { ...a, end: minStart + duration };
                                }
                                return a;
                            })

                        };
                    } else if (row.actions.some(a => a.id === elementId)) {
                        const targetAction = row.actions.find(a => a.id === elementId)!;
                        const oldDuration = targetAction.end - targetAction.start;
                        const oldEnd = targetAction.end;
                        const delta = duration - oldDuration;

                        return {
                            ...row,
                            actions: row.actions.map(a => {
                                if (a.id === elementId) {
                                    return { ...a, end: a.start + duration };
                                }
                                if (isRippleEnabled && a.start >= oldEnd - 0.05) {
                                    return { ...a, start: a.start + delta, end: a.end + delta };
                                }
                                return a;
                            })
                        }
                    }
                    return row;
                }));
            },
            updateElementTrim: (_args: any) => { }, // Non-operational for images
        },
        playback: {
            seek: ({ time }: { time: number }) => {
                useAppStore.getState().setCursorTime(time);
            },
            getCurrentTime: () => useAppStore.getState().cursorTime,
            isPlaying: false,
            setScrubbing: ({ isScrubbing: val }: { isScrubbing: boolean }) => useAppStore.getState().setIsScrubbing(val),
            getIsScrubbing: () => useAppStore.getState().isScrubbing,
        },
        project: {
            getActive: () => ({ id: "project-1", resolution: { width: 1920, height: 1080 }, settings: { fps: 30 } }),
            getTimelineViewState: () => ({
                zoomLevel: 1, // Default zoom
                scrollLeft: 0,
                playheadTime: useAppStore.getState().cursorTime,
            }),
            setTimelineViewState: (_args: any) => { }, // Mock
        },
        scenes: {
            getActiveScene: () => ({ id: "scene-1", name: "Scene 1", bookmarks: [] }),
            isBookmarked: (_args: any) => false,
            moveBookmark: (_args: any) => { }
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
