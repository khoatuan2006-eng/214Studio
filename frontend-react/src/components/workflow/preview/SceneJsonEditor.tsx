import React, { useState, useEffect, useMemo } from 'react';
import { useWorkflowStore, type CharacterNodeData, type CameraNodeData } from '@/stores/useWorkflowStore';
import { FileJson, Check, AlertTriangle, Copy, Download, Upload, RotateCcw } from 'lucide-react';

/**
 * SceneJsonEditor — Serialize entire workflow into editable JSON.
 * Replaces the Stage Layers panel in Preview.
 */

interface SceneJsonEditorProps {
    currentTime: number;
}

/** Build a clean JSON representation of the entire film from workflow nodes. */
function serializeFilm(nodes: any[]): object {
    const sceneNode = nodes.find(n => n.type === 'scene');
    const stageNode = nodes.find(n => n.type === 'stage');
    const charNodes = nodes.filter(n => n.type === 'character');
    const camNodes = nodes.filter(n => n.type === 'camera');

    // Scene
    const sceneData = sceneNode?.data || {};
    const scene = {
        canvasWidth: sceneData.canvasWidth || 1920,
        canvasHeight: sceneData.canvasHeight || 1080,
        pixelsPerUnit: sceneData.pixelsPerUnit || 100,
        cameraCuts: sceneData.cameraCuts || [],
    };

    // Stage
    const stageData = stageNode?.data as any || {};
    const stage = {
        layers: (stageData.layers || []).map((l: any) => ({
            id: l.id,
            label: l.label,
            type: l.type,
            assetPath: l.assetPath,
            zIndex: l.zIndex,
            visible: l.visible !== false,
            posX: l.posX,
            posY: l.posY,
            width: l.width,
            height: l.height,
            opacity: l.opacity,
            rotation: l.rotation,
            blur: l.blur,
        })),
        sceneDescription: stageData.sceneDescription || '',
        sceneType: stageData.sceneType || '',
        groundY: stageData.groundY,
    };

    // Characters
    const characters = charNodes.map(n => {
        const d = n.data as CharacterNodeData;
        const char: any = {
            nodeId: n.id,
            label: d.characterName || d.label,
            characterId: d.characterId,
            posX: d.posX,
            posY: d.posY,
            zIndex: d.zIndex,
            scale: d.scale,
            opacity: d.opacity,
            flipX: d.flipX || false,
            startDelay: d.startDelay || 0,
        };

        // Only include keyframes if they exist
        if (d.positionKeyframes?.length) char.positionKeyframes = d.positionKeyframes;
        if (d.scaleKeyframes?.length) char.scaleKeyframes = d.scaleKeyframes;
        if (d.rotationKeyframes?.length) char.rotationKeyframes = d.rotationKeyframes;
        if (d.zIndexKeyframes?.length) char.zIndexKeyframes = d.zIndexKeyframes;
        if (d.flipXKeyframes?.length) char.flipXKeyframes = d.flipXKeyframes;

        // Pose sequence
        if (d.sequence?.length) {
            char.sequence = d.sequence.map((f: any) => ({
                id: f.id,
                duration: f.duration,
                layers: f.layers,
                transition: f.transition,
                transitionDuration: f.transitionDuration,
                description: f.description || '',
            }));
        }

        // Script actions
        if ((d as any).scriptActions?.length) char.scriptActions = (d as any).scriptActions;

        return char;
    });

    // Cameras
    const cameras = camNodes.map(n => {
        const d = n.data as CameraNodeData;
        return {
            nodeId: n.id,
            label: d.label || 'Camera',
            keyframes: d.keyframes || [],
        };
    });

    return { scene, stage, characters, cameras };
}

/** Apply JSON changes back to workflow store. */
function applyJsonToStore(
    json: any,
    nodes: any[],
    updateNodeData: (id: string, data: any) => void,
): string[] {
    const errors: string[] = [];

    // Apply characters
    if (json.characters && Array.isArray(json.characters)) {
        for (const char of json.characters) {
            const node = nodes.find(n => n.id === char.nodeId);
            if (!node) {
                errors.push(`Character node "${char.nodeId}" not found`);
                continue;
            }
            const updates: any = {};
            if (char.posX != null) updates.posX = char.posX;
            if (char.posY != null) updates.posY = char.posY;
            if (char.zIndex != null) updates.zIndex = char.zIndex;
            if (char.scale != null) updates.scale = char.scale;
            if (char.opacity != null) updates.opacity = char.opacity;
            if (char.flipX != null) updates.flipX = char.flipX;
            if (char.startDelay != null) updates.startDelay = char.startDelay;

            // Keyframes
            if (char.positionKeyframes !== undefined) updates.positionKeyframes = char.positionKeyframes;
            if (char.scaleKeyframes !== undefined) updates.scaleKeyframes = char.scaleKeyframes;
            if (char.rotationKeyframes !== undefined) updates.rotationKeyframes = char.rotationKeyframes;
            if (char.zIndexKeyframes !== undefined) updates.zIndexKeyframes = char.zIndexKeyframes;
            if (char.flipXKeyframes !== undefined) updates.flipXKeyframes = char.flipXKeyframes;

            // Sequence
            if (char.sequence) updates.sequence = char.sequence;
            if (char.scriptActions !== undefined) updates.scriptActions = char.scriptActions;

            updateNodeData(node.id, updates);
        }
    }

    // Apply stage
    if (json.stage) {
        const stageNode = nodes.find(n => n.type === 'stage');
        if (stageNode) {
            const updates: any = {};
            if (json.stage.layers) updates.layers = json.stage.layers;
            if (json.stage.sceneDescription !== undefined) updates.sceneDescription = json.stage.sceneDescription;
            if (json.stage.groundY !== undefined) updates.groundY = json.stage.groundY;
            updateNodeData(stageNode.id, updates);
        }
    }

    // Apply scene
    if (json.scene) {
        const sceneNode = nodes.find(n => n.type === 'scene');
        if (sceneNode) {
            const updates: any = {};
            if (json.scene.canvasWidth) updates.canvasWidth = json.scene.canvasWidth;
            if (json.scene.canvasHeight) updates.canvasHeight = json.scene.canvasHeight;
            if (json.scene.pixelsPerUnit) updates.pixelsPerUnit = json.scene.pixelsPerUnit;
            if (json.scene.cameraCuts !== undefined) updates.cameraCuts = json.scene.cameraCuts;
            updateNodeData(sceneNode.id, updates);
        }
    }

    // Apply cameras
    if (json.cameras && Array.isArray(json.cameras)) {
        for (const cam of json.cameras) {
            const node = nodes.find(n => n.id === cam.nodeId);
            if (!node) {
                errors.push(`Camera node "${cam.nodeId}" not found`);
                continue;
            }
            const updates: any = {};
            if (cam.label) updates.label = cam.label;
            if (cam.keyframes !== undefined) updates.keyframes = cam.keyframes;
            updateNodeData(node.id, updates);
        }
    }

    return errors;
}

const SceneJsonEditor: React.FC<SceneJsonEditorProps> = ({ currentTime }) => {
    const { nodes, updateNodeData } = useWorkflowStore();

    // Serialize the current state
    const filmJson = useMemo(() => serializeFilm(nodes), [nodes]);
    const prettyJson = useMemo(() => JSON.stringify(filmJson, null, 2), [filmJson]);

    // Local textarea state
    const [text, setText] = useState(prettyJson);
    const [status, setStatus] = useState<'idle' | 'modified' | 'applied' | 'error'>('idle');
    const [errorMsg, setErrorMsg] = useState('');

    // Sync when external state changes (but only when user hasn't modified)
    useEffect(() => {
        if (status !== 'modified') {
            setText(prettyJson);
            setStatus('idle');
        }
    }, [prettyJson]);

    const handleTextChange = (newText: string) => {
        setText(newText);
        setStatus('modified');
        setErrorMsg('');
    };

    const handleApply = () => {
        try {
            const parsed = JSON.parse(text);
            const errors = applyJsonToStore(parsed, nodes, updateNodeData);
            if (errors.length > 0) {
                setErrorMsg(errors.join('\n'));
                setStatus('error');
            } else {
                setStatus('applied');
                setTimeout(() => setStatus('idle'), 1500);
            }
        } catch (err: any) {
            setErrorMsg(`JSON parse error: ${err.message}`);
            setStatus('error');
        }
    };

    const handleReset = () => {
        setText(prettyJson);
        setStatus('idle');
        setErrorMsg('');
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(text);
    };

    const handleExport = () => {
        const blob = new Blob([text], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `scene_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleImport = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;
            const content = await file.text();
            setText(content);
            setStatus('modified');
        };
        input.click();
    };

    const lineCount = text.split('\n').length;
    const isModified = status === 'modified';

    return (
        <div className="w-72 shrink-0 bg-neutral-900/95 border-r border-white/5 flex flex-col">
            {/* Header */}
            <div className="px-3 py-2 border-b border-white/5">
                <div className="flex items-center gap-1.5 mb-1.5">
                    <FileJson className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-[10px] font-bold text-neutral-300 uppercase tracking-wider flex-1">
                        Scene JSON
                    </span>
                    <span className="text-[8px] text-neutral-600 font-mono">{lineCount} lines</span>
                </div>

                {/* Action buttons row */}
                <div className="flex items-center gap-1">
                    <button
                        onClick={handleApply}
                        disabled={!isModified}
                        className={`flex items-center gap-1 px-2 py-1 rounded text-[9px] font-bold border transition-all ${
                            status === 'applied'
                                ? 'bg-green-500/20 border-green-500/40 text-green-300'
                                : status === 'error'
                                    ? 'bg-red-500/20 border-red-500/40 text-red-300'
                                    : isModified
                                        ? 'bg-amber-500/20 border-amber-500/40 text-amber-300 hover:bg-amber-500/30'
                                        : 'bg-white/5 border-white/10 text-neutral-500 opacity-50 cursor-default'
                        }`}
                    >
                        {status === 'applied' ? <Check className="w-3 h-3" /> : status === 'error' ? <AlertTriangle className="w-3 h-3" /> : <Check className="w-3 h-3" />}
                        {status === 'applied' ? 'Applied!' : status === 'error' ? 'Error' : 'Apply'}
                    </button>

                    {isModified && (
                        <button
                            onClick={handleReset}
                            className="flex items-center gap-0.5 px-1.5 py-1 rounded text-[9px] text-neutral-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-all"
                            title="Reset to current state"
                        >
                            <RotateCcw className="w-2.5 h-2.5" /> Reset
                        </button>
                    )}

                    <div className="flex-1" />

                    <button onClick={handleCopy} className="p-1 rounded hover:bg-white/10 text-neutral-500 hover:text-white transition-colors" title="Copy JSON">
                        <Copy className="w-3 h-3" />
                    </button>
                    <button onClick={handleExport} className="p-1 rounded hover:bg-white/10 text-neutral-500 hover:text-white transition-colors" title="Export JSON file">
                        <Download className="w-3 h-3" />
                    </button>
                    <button onClick={handleImport} className="p-1 rounded hover:bg-white/10 text-neutral-500 hover:text-white transition-colors" title="Import JSON file">
                        <Upload className="w-3 h-3" />
                    </button>
                </div>
            </div>

            {/* Error message */}
            {errorMsg && (
                <div className="px-3 py-1.5 bg-red-500/10 border-b border-red-500/20">
                    <p className="text-[8px] text-red-300 font-mono whitespace-pre-wrap break-all">{errorMsg}</p>
                </div>
            )}

            {/* JSON Textarea */}
            <div className="flex-1 overflow-hidden relative">
                <textarea
                    value={text}
                    onChange={(e) => handleTextChange(e.target.value)}
                    spellCheck={false}
                    className={`w-full h-full resize-none bg-black/40 text-[10px] font-mono leading-relaxed text-neutral-300 
                        px-3 py-2 outline-none border-none
                        selection:bg-amber-500/30 
                        ${isModified ? 'ring-1 ring-inset ring-amber-500/30' : ''}
                    `}
                    style={{ tabSize: 2 }}
                />

                {/* Modified indicator */}
                {isModified && (
                    <div className="absolute top-1 right-2 px-1.5 py-0.5 rounded bg-amber-500/20 text-[7px] text-amber-400 font-bold">
                        MODIFIED
                    </div>
                )}
            </div>

            {/* Status bar */}
            <div className="px-3 py-1 border-t border-white/5 flex items-center gap-2">
                <span className="text-[8px] text-neutral-600 font-mono">
                    t={currentTime.toFixed(1)}s
                </span>
                <div className="flex-1" />
                <span className={`text-[8px] font-bold ${
                    status === 'applied' ? 'text-green-400'
                    : status === 'error' ? 'text-red-400'
                    : status === 'modified' ? 'text-amber-400'
                    : 'text-neutral-600'
                }`}>
                    {status === 'applied' ? '✓ Saved'
                        : status === 'error' ? '✗ Invalid'
                        : status === 'modified' ? '● Unsaved'
                        : '○ Synced'}
                </span>
            </div>
        </div>
    );
};

export default SceneJsonEditor;
