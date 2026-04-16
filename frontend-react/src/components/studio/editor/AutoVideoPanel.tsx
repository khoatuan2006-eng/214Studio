/**
 * AutoVideoPanel — One-Click Auto Video Generation UI.
 *
 * Simple interface:
 * 1. Paste script (or type an idea)
 * 2. Configure options (voice, TTS, etc.)
 * 3. Click "🎬 Create Video" → auto-pipeline runs
 * 4. See progress → result loads into SceneGraphStore
 */

import React, { useState, useEffect } from 'react';
import {
    Wand2, Play, Loader2, CheckCircle, AlertCircle,
    Volume2, ChevronDown, ChevronRight, Sparkles, Film,
    Clock, Users, Layers, Zap,
} from 'lucide-react';
import { useSceneGraphStore } from '@/stores/useSceneGraphStore';
import { API_BASE_URL } from '@/config/api';

// ══════════════════════════════════════════════
//  Sample Scripts
// ══════════════════════════════════════════════

const SAMPLE_SCRIPTS = [
    {
        label: '💬 2 nhân vật - Đơn giản',
        text: `Hoa: Xin chào! Hôm nay trời đẹp quá nhỉ?
Nam: Ừ, mình rất thích thời tiết này. Đi dạo không?
Hoa: Được chứ! Mình rất vui được đi cùng bạn.
Nam: Vậy đi thôi, cùng nhau nhé!`,
    },
    {
        label: '🎬 Multi-Scene - 3 cảnh',
        text: `[Background: classroom_scene]
Hoa: Chào các bạn, hôm nay chúng ta học bài gì?
Nam: Hôm nay học toán nhé! Cô giáo sẽ kiểm tra.
Hoa: Ôi không, mình chưa ôn bài!
---
[Background: park_scene]
[Transition: fade]
Hoa: Tan học rồi, đi công viên chơi không?
Nam: Đi thôi! Mệt quá rồi, cần thư giãn.
Hoa: Chỗ kia có ghế đá, ngồi nghỉ đi!
---
[Background: home_scene]
[Transition: dissolve]
Hoa: Về nhà rồi, hôm nay vui quá!
Nam: Ừ, mai gặp lại nhé! Nhớ ôn bài đấy!
Hoa: Được rồi, tạm biệt!`,
    },
    {
        label: '💕 Tình yêu học trò',
        text: `[Background: classroom_scene]
Hoa: Này, cho mình mượn cây bút được không?
Nam: Dĩ nhiên rồi! Đây, lấy đi.
Hoa: Cảm ơn bạn nhiều nhé!
Nam: Không có gì, bạn có cần gì thêm không?
---
[Transition: fade]
[Background: park_scene]
Nam: Hoa ơi, mình muốn nói với bạn một điều...
Hoa: Gì vậy? Sao mặt bạn đỏ thế?
Nam: Mình... mình thích bạn từ lâu rồi.
Hoa: Thật sao? Mình cũng thế!`,
    },
];

// ══════════════════════════════════════════════
//  Status Check
// ══════════════════════════════════════════════

interface PipelineStatus {
    available: boolean;
    characters: number;
    backgrounds: number;
    tts_available: boolean;
    message: string;
}

interface PipelineStep {
    step: string;
    message: string;
    elapsed: number;
}

interface GenerateResult {
    success: boolean;
    message: string;
    totalScenes: number;
    totalDuration: number;
    totalCharacters: number;
    steps: PipelineStep[];
}

// ══════════════════════════════════════════════
//  Component
// ══════════════════════════════════════════════

export const AutoVideoPanel: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
    const [scriptText, setScriptText] = useState(SAMPLE_SCRIPTS[1].text);
    const [voice, setVoice] = useState('BV074');
    const [generateTTS, setGenerateTTS] = useState(true);
    const [autoChars, setAutoChars] = useState(true);
    const [isLoading, setIsLoading] = useState(false);
    const [result, setResult] = useState<GenerateResult | null>(null);
    const [status, setStatus] = useState<PipelineStatus | null>(null);
    const [showOptions, setShowOptions] = useState(false);
    const [showSteps, setShowSteps] = useState(false);
    const [currentStep, setCurrentStep] = useState('');

    // Preflight UI states
    const [preflightData, setPreflightData] = useState<{
        detected_characters: string[],
        detected_scenes: number,
        available_characters: {id: string, name: string, avatar: string}[],
        available_backgrounds: {id: string, name: string}[]
    } | null>(null);
    const [charMap, setCharMap] = useState<Record<string, string>>({});
    const [bgMap, setBgMap] = useState<Record<string, string>>({});

    const loadVideoProject = useSceneGraphStore(s => s.loadVideoProject);

    // Check pipeline status on mount
    useEffect(() => {
        fetch(`${API_BASE_URL}/api/auto-video/status`)
            .then(r => r.json())
            .then(data => setStatus(data))
            .catch(() => setStatus({ available: false, characters: 0, backgrounds: 0, tts_available: false, message: 'Backend not available' }));
    }, []);

    const handlePreflight = async () => {
        setIsLoading(true);
        setResult(null);
        setCurrentStep('Phân tích kịch bản...');

        try {
            const res = await fetch(`${API_BASE_URL}/api/auto-video/preflight`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ script_text: scriptText }),
            });

            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            
            const data = await res.json();
            setPreflightData(data);
            
            // Render mappings
            setCharMap({});
            setBgMap({});
            setCurrentStep('');
        } catch (err: any) {
            setCurrentStep('');
            alert('Lỗi phân tích kịch bản: ' + err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleGenerate = async () => {
        setIsLoading(true);
        setResult(null);
        setCurrentStep('Starting pipeline...');

        try {
            const res = await fetch(`${API_BASE_URL}/api/auto-video/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    script_text: scriptText,
                    voice,
                    generate_tts: generateTTS,
                    auto_select_characters: false,
                    auto_select_background: false,
                    character_map: charMap,
                    background_map: bgMap,
                }),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
                throw new Error(err.detail || `HTTP ${res.status}`);
            }

            const data = await res.json();

            if (data.success && data.project) {
                // Load the VideoProject into the store
                loadVideoProject(data.project);

                setResult({
                    success: true,
                    message: data.message || 'Video created!',
                    totalScenes: data.total_scenes || 0,
                    totalDuration: data.total_duration || 0,
                    totalCharacters: data.total_characters || 0,
                    steps: data.pipeline_steps || [],
                });
                setCurrentStep('');
            } else {
                throw new Error(data.message || 'Unknown error');
            }
        } catch (err: any) {
            setResult({
                success: false,
                message: `❌ ${err.message}`,
                totalScenes: 0,
                totalDuration: 0,
                totalCharacters: 0,
                steps: [],
            });
            setCurrentStep('');
        } finally {
            setIsLoading(false);
        }
    };

    // ── Step icon mapping ──
    const stepIcon = (step: string) => {
        switch (step) {
            case 'parse': return '📝';
            case 'characters': return '🎭';
            case 'backgrounds': return '🏞️';
            case 'tts': return '🔊';
            case 'build': return '🎬';
            case 'package': return '📦';
            case 'done': return '✅';
            default: return '⚡';
        }
    };

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-2 p-3 border-b border-white/10 shrink-0">
                <div className="w-6 h-6 rounded-lg flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg, #f59e0b, #ef4444)' }}>
                    <Wand2 className="w-3.5 h-3.5 text-white" />
                </div>
                <div>
                    <h3 className="text-xs font-bold text-white">Auto Video</h3>
                    <p className="text-[9px] text-neutral-500">One-Click Video Creation</p>
                </div>
                {/* Status badge */}
                {status && (
                    <div className={`ml-auto px-2 py-0.5 rounded-full text-[8px] font-bold ${
                        status.available
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-red-500/20 text-red-400'
                    }`}>
                        {status.available ? `${status.characters} chars` : 'Offline'}
                    </div>
                )}
            </div>

            <div className="flex-1 min-h-0 p-2 overflow-y-auto space-y-2">
                {/* Quick Script Selector */}
                <div className="flex gap-1 flex-wrap">
                    {SAMPLE_SCRIPTS.map((sample, i) => (
                        <button
                            key={i}
                            onClick={() => setScriptText(sample.text)}
                            className="px-2 py-1 rounded text-[9px] bg-white/5 text-neutral-400 hover:text-white hover:bg-white/10 transition-colors border border-white/5 hover:border-amber-500/30"
                        >
                            {sample.label}
                        </button>
                    ))}
                </div>

                {/* Script Input */}
                <textarea
                    value={scriptText}
                    onChange={e => setScriptText(e.target.value)}
                    placeholder="Paste your script here... Use --- to separate scenes."
                    className="w-full h-48 bg-black/40 rounded-lg p-2.5 text-[11px] font-mono text-neutral-300 border border-white/10 focus:border-amber-500/50 focus:outline-none resize-none"
                    spellCheck={false}
                />

                {/* Quick info */}
                <div className="flex items-center gap-3 text-[9px] text-neutral-500">
                    <span className="flex items-center gap-1">
                        <Layers className="w-3 h-3" />
                        {(scriptText.match(/---/g) || []).length + 1} scene(s)
                    </span>
                    <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {new Set(
                            scriptText.split('\n')
                                .filter(l => l.match(/^[^:\[\-]{1,20}[:：]/))
                                .map(l => l.match(/^([^:：]+)/)?.[1]?.trim() || '')
                                .filter(Boolean)
                        ).size} character(s)
                    </span>
                </div>

                {/* Options */}
                <div className="rounded-lg bg-white/5 border border-white/5 overflow-hidden">
                    <button
                        onClick={() => setShowOptions(!showOptions)}
                        className="w-full flex items-center gap-2 p-2 text-[10px] font-bold text-neutral-400 hover:text-white transition-colors"
                    >
                        {showOptions ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        Options
                    </button>
                    {showOptions && (
                        <div className="px-3 pb-2 space-y-2">
                            {/* TTS */}
                            <label className="flex items-center gap-2 text-[10px] text-neutral-400 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={generateTTS}
                                    onChange={e => setGenerateTTS(e.target.checked)}
                                    className="rounded border-white/20 bg-black/40"
                                />
                                <Volume2 className="w-3 h-3" />
                                Generate TTS Audio + Lip-sync
                            </label>

                            {/* Auto character matching removed (user maps manually) */}

                            {/* Voice selector */}
                            {generateTTS && (
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-neutral-500">Voice:</span>
                                    <select
                                        value={voice}
                                        onChange={e => setVoice(e.target.value)}
                                        className="bg-black/40 rounded px-2 py-1 text-[10px] border border-white/10 text-neutral-300"
                                    >
                                        <option value="BV074">🎀 Nữ Việt</option>
                                        <option value="BV075">🎩 Nam Việt</option>
                                        <option value="BV421">✨ Thiên tài thiếu nữ</option>
                                        <option value="BV562">🌸 Nữ Việt 2</option>
                                    </select>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Result */}
                {result && (
                    <div className={`rounded-lg p-3 text-[10px] border ${result.success
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                            : 'bg-red-500/10 border-red-500/30 text-red-300'
                        }`}>
                        <div className="flex items-start gap-2">
                            {result.success
                                ? <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                            }
                            <div className="flex-1">
                                <p className="font-bold whitespace-pre-wrap">{result.message}</p>

                                {/* Stats */}
                                {result.success && (
                                    <div className="flex gap-3 mt-2 text-[9px] text-emerald-400/70">
                                        <span className="flex items-center gap-1">
                                            <Film className="w-3 h-3" />
                                            {result.totalScenes} scenes
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            {result.totalDuration.toFixed(1)}s
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <Users className="w-3 h-3" />
                                            {result.totalCharacters} chars
                                        </span>
                                    </div>
                                )}

                                {/* Pipeline steps log */}
                                {result.steps.length > 0 && (
                                    <div className="mt-2">
                                        <button
                                            onClick={() => setShowSteps(!showSteps)}
                                            className="text-[9px] text-emerald-400/60 hover:text-emerald-300 flex items-center gap-1"
                                        >
                                            {showSteps ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronRight className="w-2.5 h-2.5" />}
                                            Pipeline Log ({result.steps.length} steps)
                                        </button>
                                        {showSteps && (
                                            <div className="mt-1 space-y-0.5 text-[8px] font-mono text-emerald-400/50">
                                                {result.steps.map((step, i) => (
                                                    <div key={i} className="flex items-start gap-1">
                                                        <span>{stepIcon(step.step)}</span>
                                                        <span className="text-emerald-400/40">[{step.elapsed}s]</span>
                                                        <span>{step.message}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Loading indicator */}
                {isLoading && (
                    <div className="rounded-lg p-3 bg-amber-500/10 border border-amber-500/30 text-[10px] text-amber-300">
                        <div className="flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <div>
                                <p className="font-bold">Creating video...</p>
                                <p className="text-[9px] text-amber-400/60 mt-0.5">{currentStep}</p>
                            </div>
                        </div>
                        {/* Animated progress bar */}
                        <div className="mt-2 h-1 bg-amber-500/10 rounded-full overflow-hidden">
                            <div
                                className="h-full rounded-full animate-pulse"
                                style={{
                                    background: 'linear-gradient(90deg, #f59e0b, #ef4444, #f59e0b)',
                                    width: '60%',
                                    animation: 'progress-slide 2s ease-in-out infinite',
                                }}
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Mapping UI (Step 2) */}
            {preflightData && (
                <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-3 border-t border-white/10 pt-2 bg-black/20">
                    <h3 className="text-[10px] font-bold text-amber-400 uppercase flex items-center gap-1">
                        <Sparkles className="w-3 h-3" /> Bước 2: Chọn Tài Nguyên
                    </h3>
                    
                    {/* Character Mapping */}
                    <div className="space-y-1.5">
                        <div className="text-[9px] text-neutral-400 font-bold">NHÂN VẬT ({preflightData.detected_characters.length})</div>
                        {preflightData.detected_characters.length === 0 && (
                            <div className="text-[9px] text-neutral-500 italic">Không tìm thấy nhân vật nào.</div>
                        )}
                        {preflightData.detected_characters.map((charName) => (
                            <div key={charName} className="flex justify-between items-center bg-white/5 p-1.5 rounded border border-white/5">
                                <span className="text-[10px] font-bold text-white pl-1">{charName}</span>
                                <select 
                                    className={`bg-black/60 border ${charMap[charName] ? 'border-emerald-500/50 text-emerald-300' : 'border-red-500/50 text-red-300'} text-[9px] rounded p-1 w-32`}
                                    value={charMap[charName] || ""}
                                    onChange={e => setCharMap(prev => ({...prev, [charName]: e.target.value}))}
                                >
                                    <option value="" disabled>-- Chọn nhân vật --</option>
                                    {preflightData.available_characters.map(ac => (
                                        <option key={ac.id} value={ac.id}>{ac.name || ac.id}</option>
                                    ))}
                                </select>
                            </div>
                        ))}
                    </div>

                    {/* Scene Mapping */}
                    <div className="space-y-1.5">
                        <div className="text-[9px] text-neutral-400 font-bold">BỐI CẢNH ({preflightData.detected_scenes} cảnh)</div>
                        {Array.from({ length: preflightData.detected_scenes }).map((_, i) => (
                            <div key={i} className="flex justify-between items-center bg-white/5 p-1.5 rounded border border-white/5">
                                <span className="text-[10px] font-bold text-white pl-1">Cảnh {i+1}</span>
                                <select 
                                    className={`bg-black/60 border ${bgMap[String(i)] ? 'border-emerald-500/50 text-emerald-300' : 'border-red-500/50 text-red-300'} text-[9px] rounded p-1 w-32`}
                                    value={bgMap[String(i)] || ""}
                                    onChange={e => setBgMap(prev => ({...prev, [String(i)]: e.target.value}))}
                                >
                                    <option value="" disabled>-- Chọn bối cảnh --</option>
                                    {preflightData.available_backgrounds.map(ab => (
                                        <option key={ab.id} value={ab.id}>{ab.name}</option>
                                    ))}
                                </select>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Action Buttons */}
            <div className="p-2 border-t border-white/10 shrink-0 flex flex-col gap-2">
                {!preflightData ? (
                    <button
                        onClick={handlePreflight}
                        disabled={isLoading || !scriptText.trim()}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-blue-600 hover:bg-blue-500"
                    >
                        {isLoading ? (
                            <><Loader2 className="w-4 h-4 animate-spin" /> Đang phân tích...</>
                        ) : (
                            <><Zap className="w-4 h-4" /> Phân tích Kịch bản</>
                        )}
                    </button>
                ) : (
                    <div className="flex gap-2">
                        <button
                            onClick={() => setPreflightData(null)}
                            className="px-3 py-2.5 rounded-lg text-xs font-bold text-neutral-300 bg-white/5 hover:bg-white/10 transition-colors"
                        >
                            Quay lại
                        </button>
                        <button
                            onClick={handleGenerate}
                            disabled={
                                isLoading ||
                                preflightData.detected_characters.some(c => !charMap[c]) ||
                                Array.from({ length: preflightData.detected_scenes }).some((_, i) => !bgMap[String(i)])
                            }
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                            style={{
                                background: isLoading ? 'rgba(255,255,255,0.1)' : 'linear-gradient(135deg, #f59e0b, #ef4444)',
                                boxShadow: isLoading ? 'none' : '0 2px 16px rgba(245,158,11,0.3)',
                            }}
                        >
                            {isLoading ? (
                                <><Loader2 className="w-4 h-4 animate-spin" /> Đang tạo...</>
                            ) : (
                                <><Film className="w-4 h-4" /> Bấm Máy (Generate Video)</>
                            )}
                        </button>
                    </div>
                )}
            </div>

            {/* CSS for animated progress */}
            <style>{`
                @keyframes progress-slide {
                    0% { transform: translateX(-100%); }
                    50% { transform: translateX(60%); }
                    100% { transform: translateX(-100%); }
                }
            `}</style>
        </div>
    );
};
