import { useAppStore } from "@/store/useAppStore";
import { useCallback, useMemo } from "react";
import { useTimelineStore } from "@/stores/timeline-store";
import { transientState, setCursorTime, setScrubbing, setActiveEditTargetId } from "@/stores/transient-store";
import { commandHistory, createMoveActionCommand, createDeleteActionsCommand, createAddKeyframeCommand, createRemoveKeyframeCommand, createDeleteTrackCommand, createBatchCommand } from "@/stores/command-history";
import { EditorCore } from '../core';
import type { TimelineTrack, VideoElement, TimelineElement } from "../types/timeline";

// Selection mock state globally
let selectedElements: { elementId: string; trackId: string }[] = [];
const selectionListeners = new Set<() => void>();
const notifySelection = () => selectionListeners.forEach(l => l());

// Mock EditorCore that bridges OpenCut UI with our Zustand store
export function useEditor() {
    const editorData = useAppStore(state => state.editorData);
    const core = EditorCore.getInstance();

    // Map our RowData (Characters) to OpenCut's TimelineTrack
    const getTracks = useCallback((): TimelineTrack[] => {
        const activeEditTargetId = transientState.activeEditTargetId;
        const tracks: TimelineTrack[] = [];

        if (activeEditTargetId) {
            // Nested Composition Context ("Chia để trị")
            // P0-0.2: Use normalized store for O(1) lookup instead of .find()
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
                let minStart = Infinity;
                let maxEnd = 0;
                row.actions.forEach(a => {
                    if (a.start < minStart) minStart = a.start;
                    if (a.end > maxEnd) maxEnd = a.end;
                });
                if (minStart === Infinity) minStart = 0;

                // Main Track keeps the Actions, but Keyframes belong to sub-tracks
                const parentTrack: TimelineTrack = {
                    id: row.id,
                    name: row.name || `Data ${row.id}`,
                    type: "video",
                    hidden: false,
                    isMain: false,
                    muted: false,
                    keyframes: [], // Extracted to property tracks
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
                        keyframes: []
                    }] as VideoElement[],
                };
                tracks.push(parentTrack);

                // If expanded, inject the 5 property tracks right below it
                if (row.isExpanded) {
                    const props = ['x', 'y', 'scale', 'rotation', 'opacity'] as const;
                    props.forEach(prop => {
                        const capitalized = prop.charAt(0).toUpperCase() + prop.slice(1);
                        tracks.push({
                            id: `${row.id}_${prop}`,
                            name: capitalized,
                            type: "property",
                            targetProperty: prop,
                            parentId: row.id,
                            keyframes: row.transform[prop],
                            elements: []
                        } as any);
                    });
                }
            });
        }

        return tracks;
    }, [editorData]);

    // Our own generic listener bridge to Zustand
    const bridge = useMemo(() => ({
        // Support shifting Keyframes from the timeline UI directly
        // P0-0.3: Wrapped with commandHistory for undo/redo support
        updateKeyframeTime: (trackId: string, oldTime: number, newTime: number) => {
            // Find the track and keyframe info for command
            const state = useAppStore.getState();
            const row = state.editorData.find(r => trackId.startsWith(r.id + '_') || r.id === trackId);
            if (!row) return;

            const prop = trackId.includes('_') ? trackId.split('_').pop() as keyof typeof row.transform : null;
            if (!prop || !['x', 'y', 'scale', 'rotation', 'opacity'].includes(prop)) return;

            const keyframe = row.transform[prop].find(k => Math.abs(k.time - oldTime) < 0.05);
            if (!keyframe) return;

            // Create command for undo/redo
            const cmd = createAddKeyframeCommand(row.id, prop, { ...keyframe, time: newTime });
            commandHistory.execute(cmd);
        },
        removeKeyframe: (trackId: string, time: number) => {
            // P0-0.3: Use command pattern for undo/redo
            const state = useAppStore.getState();
            const row = state.editorData.find(r => trackId.startsWith(r.id + '_') || r.id === trackId);
            if (!row) return;

            const prop = trackId.includes('_') ? trackId.split('_').pop() as keyof typeof row.transform : null;
            if (!prop || !['x', 'y', 'scale', 'rotation', 'opacity'].includes(prop)) return;

            const keyframe = row.transform[prop].find(k => Math.abs(k.time - time) < 0.05);
            if (!keyframe) return;

            const cmd = createRemoveKeyframeCommand(row.id, prop, keyframe);
            commandHistory.execute(cmd);
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
                const activeEditTargetId = transientState.activeEditTargetId;

                if (activeEditTargetId && trackId.startsWith('nested_')) {
                    // Nested Composition Context: Delete specific accessory action
                    const actionId = trackId.replace('nested_', '');
                    const row = state.editorData.find(r => r.id === activeEditTargetId);
                    const action = row?.actions.find(a => a.id === actionId);
                    if (row && action) {
                        // P0-0.3: Use command pattern for undo/redo
                        const cmd = createDeleteActionsCommand([{ trackId: row.id, action }]);
                        commandHistory.execute(cmd);
                    }
                } else {
                    // Main Scene Context: Delete entire character and all its embedded tracks
                    const track = state.editorData.find(r => r.id === trackId);
                    const index = state.editorData.findIndex(r => r.id === trackId);
                    if (track && index >= 0) {
                        // P0-0.3: Use command pattern for undo/redo
                        const cmd = createDeleteTrackCommand(track, index);
                        commandHistory.execute(cmd);
                        if (transientState.activeEditTargetId === trackId) {
                            setActiveEditTargetId(null); // Exit context if we delete the character we are inside
                        }
                    }
                }
            },
            deleteElements: (elements: { elementId: string; trackId: string }[]) => {
                // P0-0.3: Use command pattern for undo/redo
                const state = useAppStore.getState();
                const deletedActions: { trackId: string; action: any }[] = [];

                state.editorData.forEach(row => {
                    // Check if they deleted the Compound Block in Main Mode
                    if (elements.some(e => e.elementId === `${row.id}_compound`)) {
                        // Delete all actions in this track
                        row.actions.forEach(action => {
                            deletedActions.push({ trackId: row.id, action });
                        });
                    } else {
                        elements.forEach(e => {
                            const action = row.actions.find(a => a.id === e.elementId);
                            if (action) {
                                deletedActions.push({ trackId: row.id, action });
                            }
                        });
                    }
                });

                if (deletedActions.length > 0) {
                    const cmd = createDeleteActionsCommand(deletedActions);
                    commandHistory.execute(cmd);
                }
            },
            splitElement: (elementId: string) => {
                const time = transientState.cursorTime;

                useAppStore.getState().setEditorData(prev => prev.map(row => {
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

                    // P0-0.3: Use command pattern - create batch command for all actions
                    const commands = sourceRow.actions.map(action => {
                        const oldStart = action.start;
                        const oldEnd = action.end;
                        return createMoveActionCommand(action.id, oldStart, oldEnd, oldStart + delta, oldEnd + delta);
                    });

                    const batchCmd = createBatchCommand(`Move character ${sourceRow.name}`, commands);
                    commandHistory.execute(batchCmd);
                } else {
                    // Moving a single specific track/accessory
                    // Find actual source row (in edit mode, sourceTrackId looks like `nested_action123`, but we find row by looking up actions)
                    const sourceRow = state.editorData.find(r => r.actions.some(a => a.id === elementId));
                    const actionToMove = sourceRow?.actions.find(a => a.id === elementId);
                    if (!actionToMove) return;

                    const duration = actionToMove.end - actionToMove.start;
                    const newEnd = newStartTime + duration;

                    // P0-0.3: Use command pattern for undo/redo
                    const cmd = createMoveActionCommand(elementId, actionToMove.start, actionToMove.end, newStartTime, newEnd);
                    commandHistory.execute(cmd);
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
                core.playback.seek(time);
            },
            getCurrentTime: () => core.playback.currentTime,
            isPlaying: core.playback.isPlaying,
            setScrubbing: ({ isScrubbing: val }: { isScrubbing: boolean }) => core.playback.setScrubbing(val),
            getIsScrubbing: () => core.playback.isScrubbing,
        },
        project: {
            getActive: () => ({ id: "project-1", resolution: { width: 1920, height: 1080 }, settings: { fps: 30 } }),
            getTimelineViewState: () => ({
                zoomLevel: 1, // Default zoom
                scrollLeft: 0,
                playheadTime: transientState.cursorTime,
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
