import React, { useCallback, useRef, useMemo, useState, useEffect } from 'react';
import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    BackgroundVariant,
    Panel,
    type OnConnect,
    type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useWorkflowStore, type WorkflowNodeType } from '@/store/useWorkflowStore';
import { CharacterNode } from './nodes/CharacterNode';
import { BackgroundNode } from './nodes/BackgroundNode';
import { SceneNode } from './nodes/SceneNode';
import { PropNode } from './nodes/PropNode';
import { AudioNode } from './nodes/AudioNode';
import { CameraNode } from './nodes/CameraNode';
import { ForegroundNode } from './nodes/ForegroundNode';
import { MapNode } from './nodes/MapNode';
import NodePalette from './NodePalette';
import NodeInspector from './NodeInspector';
import PoseSequenceEditor from './PoseSequenceEditor';
import MapSequenceEditor from './MapSequenceEditor';
import SaveLoadDialog from './SaveLoadDialog';
import WorkflowPreview from './WorkflowPreview';
import AIGeneratePanel from './AIGeneratePanel';
import { executeWorkflow } from '@/core/workflowExecutor';
import { useAppStore } from '@/store/useAppStore';
import { toast } from 'sonner';
import { Save, FolderOpen, Trash2, Undo2, Redo2, Workflow, Sparkles } from 'lucide-react';

// Register custom node types
const nodeTypes: NodeTypes = {
    character: CharacterNode,
    background: BackgroundNode,
    scene: SceneNode,
    prop: PropNode,
    audio: AudioNode,
    camera: CameraNode,
    foreground: ForegroundNode,
    map: MapNode,
};

const WorkflowMode: React.FC = () => {
    const reactFlowWrapper = useRef<HTMLDivElement>(null);
    const {
        nodes,
        edges,
        onNodesChange,
        onEdgesChange,
        onConnect,
        addNode,
        selectNode,
        clearWorkflow,
    } = useWorkflowStore();

    // Pose Sequence Editor modal state
    const [editingNodeId, setEditingNodeId] = useState<string | null>(null);

    // Save/Load dialog state
    const [dialogMode, setDialogMode] = useState<'save' | 'load' | null>(null);

    // Preview state
    const [showPreview, setShowPreview] = useState(false);

    // AI Generate panel state
    const [showAIPanel, setShowAIPanel] = useState(false);

    // Load saved workflows on mount
    useEffect(() => {
        useWorkflowStore.getState().loadSavedWorkflows();
    }, []);

    // Listen for Execute Workflow event from SceneNode
    useEffect(() => {
        const handleExecute = () => {
            const { nodes: currentNodes, edges: currentEdges } = useWorkflowStore.getState();
            const result = executeWorkflow(currentNodes, currentEdges);

            if (result.errors.length > 0) {
                result.errors.forEach((err) => toast.error(err));
            }

            if (result.tracks.length > 0) {
                // Push generated tracks to the app store (Studio tab uses this)
                useAppStore.getState().setEditorData(result.tracks);
                toast.success(
                    `Workflow executed! ${result.tracks.length} tracks generated (${result.duration.toFixed(1)}s). Switch to Studio tab to preview.`
                );
            } else if (result.errors.length === 0) {
                toast.warning('No tracks generated. Make sure nodes are connected and configured.');
            }
        };

        window.addEventListener('workflow:execute', handleExecute);
        return () => window.removeEventListener('workflow:execute', handleExecute);
    }, []);

    // Listen for Preview event from SceneNode
    useEffect(() => {
        const handlePreview = () => setShowPreview(true);
        window.addEventListener('workflow:preview', handlePreview);
        return () => window.removeEventListener('workflow:preview', handlePreview);
    }, []);

    // Handle new connections
    const handleConnect: OnConnect = useCallback(
        (connection) => {
            onConnect(connection);
        },
        [onConnect]
    );

    // Handle drag-drop from palette
    const handleDragOver = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    const handleDrop = useCallback(
        (event: React.DragEvent) => {
            event.preventDefault();
            const nodeType = event.dataTransfer.getData('application/workflow-node') as WorkflowNodeType;
            if (!nodeType) return;

            // Calculate drop position relative to the flow canvas
            const bounds = reactFlowWrapper.current?.getBoundingClientRect();
            if (!bounds) return;

            const position = {
                x: event.clientX - bounds.left - 110,
                y: event.clientY - bounds.top - 50,
            };

            addNode(nodeType, position);
        },
        [addNode]
    );

    // Click-to-add from palette
    const handleAddFromPalette = useCallback(
        (type: WorkflowNodeType) => {
            // Place new node at center-ish of viewport
            const x = 300 + Math.random() * 200;
            const y = 150 + Math.random() * 200;
            addNode(type, { x, y });
        },
        [addNode]
    );

    // Handle node click for selection
    const handleNodeClick = useCallback(
        (_event: React.MouseEvent, node: any) => {
            selectNode(node.id);
        },
        [selectNode]
    );

    // Map Sequence Editor state
    const [editingMapNodeId, setEditingMapNodeId] = useState<string | null>(null);

    // Handle double-click on character nodes to open PoseSequenceEditor
    // Handle double-click on map nodes to open MapSequenceEditor
    const handleNodeDoubleClick = useCallback(
        (_event: React.MouseEvent, node: any) => {
            if (node.type === 'character' && node.data?.characterId) {
                setEditingNodeId(node.id);
            } else if (node.type === 'map') {
                setEditingMapNodeId(node.id);
            }
        },
        []
    );

    // Handle pane click to deselect
    const handlePaneClick = useCallback(() => {
        selectNode(null);
    }, [selectNode]);

    // Custom minimap node color
    const minimapNodeColor = useCallback((node: any) => {
        switch (node.type) {
            case 'character':
                return '#6366f1';
            case 'background':
                return '#10b981';
            case 'scene':
                return '#f59e0b';
            case 'map':
                return '#22c55e';
            default:
                return '#6b7280';
        }
    }, []);

    // Memoize proOptions
    const proOptions = useMemo(() => ({ hideAttribution: true }), []);

    return (
        <div className="flex h-full w-full overflow-hidden" data-no-select>
            {/* ═══ Left Panel: Node Palette ═══ */}
            <div
                className="w-56 flex-shrink-0 flex flex-col border-r border-white/5 overflow-hidden"
                style={{ background: 'var(--surface-raised)' }}
            >
                <NodePalette onAddNode={handleAddFromPalette} />
            </div>

            {/* ═══ AI Generate Panel (left of canvas) ═══ */}
            {showAIPanel && (
                <AIGeneratePanel onClose={() => setShowAIPanel(false)} />
            )}

            {/* ═══ Center: ReactFlow Canvas ═══ */}
            <div className="flex-1 relative" ref={reactFlowWrapper}>
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={handleConnect}
                    onNodeClick={handleNodeClick}
                    onNodeDoubleClick={handleNodeDoubleClick}
                    onPaneClick={handlePaneClick}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    nodeTypes={nodeTypes}
                    proOptions={proOptions}
                    fitView
                    snapToGrid
                    snapGrid={[20, 20]}
                    defaultEdgeOptions={{
                        animated: true,
                        style: { stroke: 'rgba(99, 102, 241, 0.5)', strokeWidth: 2 },
                    }}
                    style={{ background: '#08080f' }}
                >
                    <Background
                        variant={BackgroundVariant.Dots}
                        gap={20}
                        size={1}
                        color="rgba(255, 255, 255, 0.03)"
                    />
                    <Controls
                        position="bottom-left"
                        className="!bg-neutral-900 !border-neutral-700 !shadow-xl !rounded-lg [&_button]:!bg-neutral-800  [&_button]:!border-neutral-700 [&_button]:!text-neutral-400 [&_button:hover]:!bg-neutral-700"
                    />
                    <MiniMap
                        position="bottom-right"
                        nodeColor={minimapNodeColor}
                        maskColor="rgba(0, 0, 0, 0.7)"
                        className="!bg-neutral-900/80 !border-neutral-700 !rounded-lg !shadow-xl"
                        pannable
                        zoomable
                    />

                    {/* Top Toolbar */}
                    <Panel position="top-center">
                        <div
                            className="flex items-center gap-1 px-2 py-1.5 rounded-xl border shadow-2xl"
                            style={{
                                background: 'rgba(17, 17, 24, 0.9)',
                                borderColor: 'rgba(255, 255, 255, 0.08)',
                                backdropFilter: 'blur(20px)',
                            }}
                        >
                            <ToolbarButton icon={Workflow} label="Workflow" disabled />
                            <div className="w-px h-5 bg-white/10 mx-1" />
                            <ToolbarButton icon={Save} label="Save" onClick={() => setDialogMode('save')} />
                            <ToolbarButton icon={FolderOpen} label="Load" onClick={() => setDialogMode('load')} />
                            <div className="w-px h-5 bg-white/10 mx-1" />
                            <ToolbarButton icon={Undo2} label="Undo" disabled />
                            <ToolbarButton icon={Redo2} label="Redo" disabled />
                            <div className="w-px h-5 bg-white/10 mx-1" />
                            <ToolbarButton
                                icon={Trash2}
                                label="Clear"
                                onClick={clearWorkflow}
                                danger
                            />
                            <div className="w-px h-5 bg-white/10 mx-1" />
                            <button
                                onClick={() => setShowAIPanel(!showAIPanel)}
                                className={`px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 text-[11px] font-bold transition-all ${showAIPanel
                                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                                        : 'hover:bg-white/5 text-neutral-400 hover:text-white'
                                    }`}
                                title="AI Scene Generator"
                            >
                                <Sparkles className="w-3.5 h-3.5" />
                                AI
                            </button>
                        </div>
                    </Panel>

                    {/* Empty state overlay */}
                    {nodes.length === 0 && (
                        <Panel position="top-center" className="!top-1/3">
                            <div className="text-center animate-fade-scale-in">
                                <Workflow className="w-16 h-16 text-neutral-600 mx-auto mb-4" />
                                <h2 className="text-lg font-bold text-neutral-400 mb-2">Workflow Editor</h2>
                                <p className="text-sm text-neutral-600 max-w-xs">
                                    Drag nodes from the palette on the left, or click to add them.
                                    Connect Character and Background nodes to a Scene node.
                                </p>
                            </div>
                        </Panel>
                    )}
                </ReactFlow>
            </div>

            {/* ═══ Right Panel: Node Inspector ═══ */}
            <div
                className="w-64 flex-shrink-0 flex flex-col border-l border-white/5 overflow-hidden"
                style={{ background: 'var(--surface-raised)' }}
            >
                <NodeInspector />
            </div>

            {/* Pose Sequence Editor Modal */}
            {editingNodeId && (
                <PoseSequenceEditor
                    nodeId={editingNodeId}
                    onClose={() => setEditingNodeId(null)}
                />
            )}

            {/* Save/Load Dialog */}
            {dialogMode && (
                <SaveLoadDialog
                    mode={dialogMode}
                    onClose={() => setDialogMode(null)}
                />
            )}

            {/* Workflow Preview */}
            {showPreview && (
                <WorkflowPreview onClose={() => setShowPreview(false)} />
            )}

            {/* Map Sequence Editor Modal */}
            {editingMapNodeId && (
                <MapSequenceEditor
                    nodeId={editingMapNodeId}
                    onClose={() => setEditingMapNodeId(null)}
                />
            )}
        </div>
    );
};

// ── Toolbar Button ──
function ToolbarButton({
    icon: Icon,
    label,
    onClick,
    disabled,
    danger,
}: {
    icon: React.FC<{ className?: string }>;
    label: string;
    onClick?: () => void;
    disabled?: boolean;
    danger?: boolean;
}) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`p-2 rounded-lg transition-all duration-150 ${disabled
                ? 'opacity-30 cursor-not-allowed'
                : danger
                    ? 'hover:bg-red-500/10 text-red-400 hover:text-red-300'
                    : 'hover:bg-white/5 text-neutral-400 hover:text-white'
                }`}
            title={label}
        >
            <Icon className="w-4 h-4" />
        </button>
    );
}

export default WorkflowMode;
