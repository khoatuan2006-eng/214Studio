import { memo, useState, useCallback } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { useWorkflowStore } from '@/stores/useWorkflowStore';
import { GripVertical, Clapperboard, Sparkles, Loader2, Users, ChevronDown, ChevronRight } from 'lucide-react';
import { API_BASE_URL } from '@/config/api';


export interface ScriptAnalyzerNodeData {
    label: string;
    srtContent?: string;
    analysisResult?: any;
    analyzedCharacters?: any[];
    createdNodeIds?: string[];
    [key: string]: unknown;
}

type ScriptAnalyzerNodeType = Node<ScriptAnalyzerNodeData, 'scriptAnalyzer'>;

const EMOTION_EMOJI: Record<string, string> = {
    happy: '😊', sad: '😢', angry: '😠', surprised: '😲',
    neutral: '😐', scared: '😨', serious: '🤨', excited: '🤩',
};
const POSE_EMOJI: Record<string, string> = {
    standing: '🧍', sitting: '🪑', walking: '🚶', running: '🏃',
    pointing: '👉', arms_crossed: '🙅', hands_on_hips: '💪',
};

function ScriptAnalyzerNodeComponent({ id, data, selected }: NodeProps<ScriptAnalyzerNodeType>) {
    const updateNodeData = useWorkflowStore((s) => s.updateNodeData);
    const addNode = useWorkflowStore((s) => s.addNode);
    const edges = useWorkflowStore((s) => s.edges);
    const nodes = useWorkflowStore((s) => s.nodes);

    const [analyzing, setAnalyzing] = useState(false);
    const [error, setError] = useState('');
    const [expandedChar, setExpandedChar] = useState<string | null>(null);


    // Get SRT content from connected Audio TTS node
    const connectedSrt = (() => {
        const srtEdge = edges.find(e => e.target === id && e.targetHandle === 'srt-in');
        if (!srtEdge) return data.srtContent || '';
        const sourceNode = nodes.find(n => n.id === srtEdge.source);
        return (sourceNode?.data as any)?.ttsSrtContent || data.srtContent || '';
    })();

    const handleAnalyze = useCallback(async () => {
        if (!connectedSrt) { setError('Kết nối SRT từ Audio TTS node trước'); return; }

        setAnalyzing(true);
        setError('');
        try {
            const resp = await fetch(`${API_BASE_URL}/api/ai/analyze-script`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ srt_content: connectedSrt }),
            });
            if (!resp.ok) {
                const err = await resp.json().catch(() => ({ detail: 'Lỗi server' }));
                throw new Error(err.detail || `HTTP ${resp.status}`);
            }
            const result = await resp.json();

            // Store result
            updateNodeData(id, {
                srtContent: connectedSrt,
                analysisResult: result,
                analyzedCharacters: result.characters,
            });

            // Auto-create Character nodes
            const thisNode = nodes.find(n => n.id === id);
            const baseX = (thisNode?.position?.x || 0) + 350;
            const baseY = (thisNode?.position?.y || 0) - 50;
            const createdIds: string[] = [];

            for (let i = 0; i < result.characters.length; i++) {
                const char = result.characters[i];
                const nodeId = addNode('character' as any, {
                    x: baseX,
                    y: baseY + i * 200,
                });
                if (nodeId) {
                    createdIds.push(nodeId);
                    // Update new node with character analysis data
                    setTimeout(() => {
                        updateNodeData(nodeId, {
                            label: char.name,
                            scriptCharacter: char,
                            scriptActions: char.actions,
                        });
                    }, 100);
                }
            }

            updateNodeData(id, { createdNodeIds: createdIds });

        } catch (err: any) {
            setError(err.message || 'Phân tích thất bại');
        } finally {
            setAnalyzing(false);
        }
    }, [id, connectedSrt, nodes, edges, updateNodeData, addNode]);

    const result = data.analysisResult;
    const chars = data.analyzedCharacters || [];

    return (
        <div
            className={`rounded-xl overflow-hidden shadow-2xl transition-all duration-200 min-w-[260px] max-w-[300px] ${selected
                ? 'ring-2 ring-amber-400 shadow-amber-500/30'
                : 'ring-1 ring-white/10 hover:ring-white/20'
                }`}
            style={{ background: 'linear-gradient(135deg, #1e2a1e 0%, #1a1a2e 50%, #2e1a2e 100%)' }}
        >
            {/* Header */}
            <div
                className="flex items-center gap-2 px-3 py-2 border-b border-white/10"
                style={{ background: 'linear-gradient(90deg, rgba(234,179,8,0.25), rgba(168,85,247,0.15))' }}
            >
                <GripVertical className="w-3 h-3 text-white/30 cursor-grab" />
                <Clapperboard className="w-4 h-4 text-amber-300" />
                <span className="text-xs font-bold text-white/90 truncate flex-1">
                    {data.label || 'Script Analyzer'}
                </span>
                {chars.length > 0 && (
                    <span className="text-[8px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold">
                        {chars.length} nhân vật
                    </span>
                )}
            </div>

            {/* Input Handle — SRT from Audio TTS */}
            <Handle
                type="target"
                position={Position.Left}
                id="srt-in"
                style={{ top: '50%' }}
                className="!w-3.5 !h-3.5 !bg-violet-500 !border-2 !border-violet-300 !shadow-lg !shadow-violet-500/50 !rounded-sm !rotate-45"
            />

            {/* SRT Status */}
            <div className="px-3 pt-2 pb-1">
                {connectedSrt ? (
                    <div className="flex items-center gap-1.5 text-[9px] text-green-400 bg-green-500/10 rounded px-2 py-1 border border-green-500/20">
                        <span>📝</span>
                        <span>SRT kết nối • {connectedSrt.split('\n').filter((l: string) => !l.match(/^\d+$/) && !l.match(/-->/) && l.trim()).length} câu</span>
                    </div>
                ) : (
                    <div className="flex items-center gap-1.5 text-[9px] text-neutral-500 bg-black/20 rounded px-2 py-1 border border-white/5">
                        <span>⬅</span>
                        <span>Kết nối SRT output từ Audio TTS</span>
                    </div>
                )}
            </div>


            {/* Analyze Button */}
            <div className="px-3 py-1.5">
                <button
                    onClick={(e) => { e.stopPropagation(); handleAnalyze(); }}
                    disabled={analyzing || !connectedSrt}
                    className={`w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${analyzing
                        ? 'bg-amber-500/20 border-amber-500/30 text-amber-300 animate-pulse cursor-wait'
                        : !connectedSrt
                            ? 'bg-neutral-800 border-neutral-700 text-neutral-600 cursor-not-allowed'
                            : 'bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20'
                        }`}
                >
                    {analyzing ? (
                        <><Loader2 className="w-3 h-3 animate-spin" /> AI đang phân tích...</>
                    ) : (
                        <><Sparkles className="w-3 h-3" /> 🎬 Phân tích kịch bản</>
                    )}
                </button>
                {error && <p className="text-[8px] text-red-400 mt-1">{error}</p>}
            </div>

            {/* Results */}
            {result && (
                <div className="px-3 pb-2 space-y-1.5">
                    {/* Title & Summary */}
                    {result.title && (
                        <div className="bg-black/30 rounded px-2 py-1 border border-white/5">
                            <p className="text-[9px] text-amber-300 font-bold">{result.title}</p>
                            {result.summary && <p className="text-[7px] text-neutral-400 mt-0.5">{result.summary}</p>}
                        </div>
                    )}

                    {/* Character List */}
                    <div className="space-y-1">
                        <p className="text-[8px] text-neutral-500 font-bold flex items-center gap-1">
                            <Users className="w-3 h-3" /> Nhân vật ({chars.length})
                        </p>
                        {chars.map((char: any) => (
                            <div
                                key={char.id}
                                className="rounded border border-white/5 overflow-hidden"
                                style={{ borderLeftColor: char.color, borderLeftWidth: 3 }}
                            >
                                {/* Character header */}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setExpandedChar(expandedChar === char.id ? null : char.id);
                                    }}
                                    className="w-full flex items-center gap-1.5 px-2 py-1 bg-black/20 hover:bg-black/30 transition-colors"
                                >
                                    {expandedChar === char.id
                                        ? <ChevronDown className="w-2.5 h-2.5 text-neutral-500" />
                                        : <ChevronRight className="w-2.5 h-2.5 text-neutral-500" />
                                    }
                                    <span className="text-[9px] font-bold" style={{ color: char.color }}>
                                        {char.gender === 'male' ? '🧑' : char.gender === 'female' ? '👩' : '🧑'} {char.name}
                                    </span>
                                    <span className="text-[7px] text-neutral-500 ml-auto">
                                        {char.role} • {char.actions?.length || 0} actions
                                    </span>
                                </button>

                                {/* Expanded: Action timeline */}
                                {expandedChar === char.id && (
                                    <div className="px-2 py-1 max-h-[100px] overflow-y-auto bg-black/10">
                                        {char.actions?.map((act: any, i: number) => (
                                            <div key={i} className="flex items-start gap-1 py-0.5 border-b border-white/3 last:border-0">
                                                <span className="text-[7px] text-neutral-600 font-mono w-12 flex-shrink-0">
                                                    {act.start_time.toFixed(1)}s
                                                </span>
                                                <span className="text-[7px]">
                                                    {EMOTION_EMOJI[act.emotion] || '😐'}
                                                    {POSE_EMOJI[act.pose] || '🧍'}
                                                </span>
                                                <span className="text-[7px] text-neutral-400 flex-1 truncate">
                                                    {act.description || act.action}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Output handles — one per character */}
            {chars.length > 0 && chars.map((char: any, i: number) => (
                <Handle
                    key={char.id}
                    type="source"
                    position={Position.Right}
                    id={`char-${char.id}`}
                    style={{ top: `${30 + ((i + 1) / (chars.length + 1)) * 70}%` }}
                    className="!w-3 !h-3 !border-2 !shadow-lg !rounded-full"
                />
            ))}

            {/* Handle labels */}
            <div className="absolute left-5 text-[7px] font-bold" style={{ top: 'calc(50% - 4px)' }}>
                <span className="text-violet-400">📝 SRT</span>
            </div>
        </div>
    );
}

export const ScriptAnalyzerNode = memo(ScriptAnalyzerNodeComponent);
