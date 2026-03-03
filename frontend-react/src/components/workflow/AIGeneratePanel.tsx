/**
 * AIGeneratePanel — Frontend panel for AI Agent Team scene generation
 *
 * UI flow:
 * 1. User enters prompt + optional config
 * 2. Shows progress: Director → Builder → Reviewer rounds
 * 3. On complete: "Apply to Workflow" button
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useWorkflowStore } from '@/store/useWorkflowStore';
import { useAppStore } from '@/store/useAppStore';
import { API_BASE } from '@/config/api';
import {
    Sparkles, X, Send, Loader2, CheckCircle2, AlertCircle,
    Settings2, ChevronDown, ChevronRight, Wand2, Eye, Hammer,
    Film, Key,
} from 'lucide-react';

interface AIGeneratePanelProps {
    onClose: () => void;
}

interface AgentLogEntry {
    agent: string;
    status: string;
    message: string;
}

interface GenerateResult {
    success: boolean;
    workflow: {
        nodes: any[];
        edges: any[];
        sceneId: string;
    } | null;
    review: {
        approved: boolean;
        round: number;
        feedback: string;
        score: number;
        corrections: any[];
    } | null;
    plan_summary: string;
    logs: AgentLogEntry[];
    total_rounds: number;
}

interface AIConfig {
    provider: string;
    model: string;
    vision_model: string;
    max_review_rounds: number;
    temperature: number;
    has_api_key: boolean;
}

// ── Agent Icon ──
function AgentIcon({ agent, status }: { agent: string; status: string }) {
    const iconProps = { size: 14 };
    const color = status === 'completed' ? '#34d399' :
        status === 'error' ? '#f87171' :
            status === 'running' ? '#60a5fa' : '#64748b';

    const icon = agent === 'director' ? <Film {...iconProps} color={color} /> :
        agent === 'builder' ? <Hammer {...iconProps} color={color} /> :
            <Eye {...iconProps} color={color} />;

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {status === 'running' && <Loader2 size={12} className="animate-spin" style={{ color }} />}
            {status === 'completed' && <CheckCircle2 size={12} style={{ color }} />}
            {status === 'error' && <AlertCircle size={12} style={{ color }} />}
            {icon}
        </div>
    );
}


export default function AIGeneratePanel({ onClose }: AIGeneratePanelProps) {
    const [prompt, setPrompt] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [result, setResult] = useState<GenerateResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [showConfig, setShowConfig] = useState(false);
    const [config, setConfig] = useState<AIConfig | null>(null);
    const [apiKeyInput, setApiKeyInput] = useState('');

    const characters = useAppStore((s) => s.characters);
    const { setNodes, setEdges } = useWorkflowStore();

    // Load AI config on mount
    useEffect(() => {
        fetch(`${API_BASE}/ai/config`)
            .then(r => r.json())
            .then(setConfig)
            .catch(() => { });
    }, []);

    // ── Generate Scene ──
    const handleGenerate = useCallback(async () => {
        if (!prompt.trim() || isGenerating) return;

        setIsGenerating(true);
        setResult(null);
        setError(null);

        try {
            const availableChars = characters.map(c => ({
                id: c.id,
                name: c.name,
            }));

            // Get available backgrounds
            let availableBgs: any[] = [];
            try {
                const bgRes = await fetch(`${API_BASE}/backgrounds`);
                if (bgRes.ok) availableBgs = await bgRes.json();
            } catch { }

            const res = await fetch(`${API_BASE}/ai/generate-scene`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: prompt.trim(),
                    available_characters: availableChars,
                    available_backgrounds: availableBgs,
                }),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
                throw new Error(err.detail || `HTTP ${res.status}`);
            }

            const data: GenerateResult = await res.json();
            setResult(data);
        } catch (err: any) {
            setError(err.message || 'Generation failed');
        } finally {
            setIsGenerating(false);
        }
    }, [prompt, isGenerating, characters]);

    // ── Apply Workflow ──
    const applyWorkflow = useCallback(() => {
        if (!result?.workflow) return;
        const { nodes, edges } = result.workflow;
        setNodes(nodes);
        setEdges(edges);
        onClose();
    }, [result, setNodes, setEdges, onClose]);

    // ── Save API Key ──
    const saveApiKey = useCallback(async () => {
        if (!apiKeyInput.trim()) return;
        try {
            const res = await fetch(`${API_BASE}/ai/config`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ api_key: apiKeyInput.trim() }),
            });
            if (res.ok) {
                const updated = await res.json();
                setConfig(updated);
                setApiKeyInput('');
            }
        } catch { }
    }, [apiKeyInput]);

    return (
        <div style={{
            width: 360,
            background: '#0f172a',
            borderRight: '1px solid rgba(255,255,255,0.1)',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            overflow: 'hidden',
        }}>
            {/* Header */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 14px',
                borderBottom: '1px solid rgba(255,255,255,0.1)',
                background: 'linear-gradient(135deg, rgba(99,102,241,0.1), rgba(168,85,247,0.1))',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Sparkles size={16} color="#a78bfa" />
                    <span style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 700 }}>
                        AI Scene Generator
                    </span>
                </div>
                <button
                    onClick={onClose}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#64748b' }}
                >
                    <X size={14} />
                </button>
            </div>

            {/* API Key Warning */}
            {config && !config.has_api_key && (
                <div style={{
                    margin: '8px 10px',
                    padding: '10px 12px',
                    background: 'rgba(245,158,11,0.1)',
                    border: '1px solid rgba(245,158,11,0.3)',
                    borderRadius: 8,
                    fontSize: 11,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#fbbf24', fontWeight: 600, marginBottom: 6 }}>
                        <Key size={12} /> API Key Required
                    </div>
                    <input
                        type="password"
                        placeholder="Google Gemini API Key..."
                        value={apiKeyInput}
                        onChange={(e) => setApiKeyInput(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '6px 8px',
                            background: 'rgba(0,0,0,0.3)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: 4,
                            color: '#e2e8f0',
                            fontSize: 11,
                            outline: 'none',
                            marginBottom: 6,
                        }}
                        onKeyDown={(e) => e.key === 'Enter' && saveApiKey()}
                    />
                    <button
                        onClick={saveApiKey}
                        disabled={!apiKeyInput.trim()}
                        style={{
                            padding: '4px 12px',
                            background: apiKeyInput.trim() ? 'rgba(245,158,11,0.3)' : 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(245,158,11,0.4)',
                            borderRadius: 4,
                            color: '#fbbf24',
                            fontSize: 10,
                            fontWeight: 600,
                            cursor: apiKeyInput.trim() ? 'pointer' : 'default',
                        }}
                    >
                        Save Key
                    </button>
                </div>
            )}

            {/* Prompt Input */}
            <div style={{ padding: '12px 10px' }}>
                <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Mô tả scene bạn muốn tạo...\n\nVD: Hai nhân vật đứng đối diện nhau trong rừng lúc hoàng hôn, camera zoom in chậm, có tuyết rơi nhẹ"
                    rows={4}
                    style={{
                        width: '100%',
                        padding: '10px',
                        background: 'rgba(0,0,0,0.3)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 8,
                        color: '#e2e8f0',
                        fontSize: 12,
                        resize: 'vertical',
                        outline: 'none',
                        fontFamily: 'inherit',
                        lineHeight: 1.5,
                    }}
                    onFocus={(e) => e.target.style.borderColor = 'rgba(99,102,241,0.5)'}
                    onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                />

                <button
                    onClick={handleGenerate}
                    disabled={!prompt.trim() || isGenerating}
                    style={{
                        width: '100%',
                        marginTop: 8,
                        padding: '10px',
                        background: !prompt.trim() || isGenerating
                            ? 'rgba(255,255,255,0.05)'
                            : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                        border: 'none',
                        borderRadius: 8,
                        color: !prompt.trim() || isGenerating ? '#475569' : '#fff',
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: !prompt.trim() || isGenerating ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                    }}
                >
                    {isGenerating ? (
                        <>
                            <Loader2 size={16} className="animate-spin" />
                            Đang tạo scene...
                        </>
                    ) : (
                        <>
                            <Wand2 size={16} />
                            🎬 Generate Scene
                        </>
                    )}
                </button>
            </div>

            {/* Progress / Logs */}
            <div style={{ flex: 1, overflow: 'auto', padding: '0 10px 10px' }}>
                {/* Error */}
                {error && (
                    <div style={{
                        padding: '10px 12px',
                        background: 'rgba(239,68,68,0.1)',
                        border: '1px solid rgba(239,68,68,0.3)',
                        borderRadius: 8,
                        marginBottom: 10,
                        fontSize: 11,
                        color: '#fca5a5',
                    }}>
                        ⚠️ {error}
                    </div>
                )}

                {/* Agent Logs */}
                {(result?.logs || []).map((log, i) => (
                    <div
                        key={i}
                        style={{
                            display: 'flex',
                            gap: 8,
                            padding: '8px 10px',
                            marginBottom: 4,
                            background: log.status === 'error'
                                ? 'rgba(239,68,68,0.05)'
                                : log.status === 'completed'
                                    ? 'rgba(52,211,153,0.05)'
                                    : 'rgba(255,255,255,0.02)',
                            borderRadius: 6,
                            border: '1px solid rgba(255,255,255,0.05)',
                        }}
                    >
                        <AgentIcon agent={log.agent} status={log.status} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                                fontSize: 10,
                                fontWeight: 700,
                                color: '#94a3b8',
                                textTransform: 'uppercase',
                                letterSpacing: 0.5,
                                marginBottom: 2,
                            }}>
                                {log.agent === 'director' ? '🎬 Director' :
                                    log.agent === 'builder' ? '🏗️ Builder' : '👁️ Reviewer'}
                            </div>
                            <div style={{ fontSize: 11, color: '#cbd5e1', lineHeight: 1.4 }}>
                                {log.message}
                            </div>
                        </div>
                    </div>
                ))}

                {/* Review Score */}
                {result?.review && (
                    <div style={{
                        margin: '10px 0',
                        padding: '10px 12px',
                        background: result.review.approved
                            ? 'rgba(52,211,153,0.1)'
                            : 'rgba(245,158,11,0.1)',
                        border: `1px solid ${result.review.approved
                            ? 'rgba(52,211,153,0.3)'
                            : 'rgba(245,158,11,0.3)'}`,
                        borderRadius: 8,
                    }}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginBottom: 6,
                        }}>
                            <span style={{
                                fontSize: 12,
                                fontWeight: 700,
                                color: result.review.approved ? '#34d399' : '#fbbf24',
                            }}>
                                {result.review.approved ? '✅ Approved' : '⚠️ Needs Improvement'}
                            </span>
                            <span style={{
                                fontSize: 18,
                                fontWeight: 900,
                                color: result.review.score >= 7 ? '#34d399' :
                                    result.review.score >= 5 ? '#fbbf24' : '#f87171',
                            }}>
                                {result.review.score}/10
                            </span>
                        </div>
                        {result.review.feedback && (
                            <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.4 }}>
                                {result.review.feedback}
                            </div>
                        )}
                    </div>
                )}

                {/* Apply Button */}
                {result?.success && result.workflow && (
                    <button
                        onClick={applyWorkflow}
                        style={{
                            width: '100%',
                            marginTop: 8,
                            padding: '12px',
                            background: 'linear-gradient(135deg, #059669, #0d9488)',
                            border: 'none',
                            borderRadius: 8,
                            color: '#fff',
                            fontSize: 13,
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8,
                            boxShadow: '0 4px 12px rgba(5,150,105,0.3)',
                        }}
                    >
                        <CheckCircle2 size={16} />
                        Apply to Workflow ({result.workflow.nodes.length} nodes)
                    </button>
                )}

                {/* Config Toggle */}
                {config && (
                    <div style={{ marginTop: 12 }}>
                        <button
                            onClick={() => setShowConfig(!showConfig)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                                background: 'none',
                                border: 'none',
                                color: '#475569',
                                fontSize: 10,
                                cursor: 'pointer',
                                padding: '4px 0',
                            }}
                        >
                            {showConfig ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                            <Settings2 size={10} />
                            AI Config
                        </button>
                        {showConfig && (
                            <div style={{
                                padding: '8px',
                                background: 'rgba(0,0,0,0.2)',
                                borderRadius: 6,
                                marginTop: 4,
                                fontSize: 10,
                                color: '#64748b',
                            }}>
                                <div>Provider: <span style={{ color: '#94a3b8' }}>{config.provider}</span></div>
                                <div>Model: <span style={{ color: '#94a3b8' }}>{config.model}</span></div>
                                <div>Vision: <span style={{ color: '#94a3b8' }}>{config.vision_model}</span></div>
                                <div>Max Rounds: <span style={{ color: '#94a3b8' }}>{config.max_review_rounds}</span></div>
                                <div>API Key: <span style={{ color: config.has_api_key ? '#34d399' : '#f87171' }}>
                                    {config.has_api_key ? '✓ Configured' : '✗ Missing'}
                                </span></div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
