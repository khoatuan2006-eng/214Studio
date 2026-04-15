/**
 * ScriptImport — UI for importing scripts/SRT and auto-generating scenes.
 *
 * Three modes:
 * 1. Script mode: paste lines with character + emotion hints (single scene)
 * 2. Multi-Scene mode: paste script with --- separators + [Background:] directives
 * 3. SRT mode: paste SRT subtitle file
 *
 * After importing, calls the automation API to build SceneGraph(s)
 * with characters, pose/face keyframes, and lip-sync.
 */

import React, { useState, useEffect } from 'react';
import { FileText, Play, Upload, Loader2, CheckCircle, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { useSceneGraphStore } from '@/stores/useSceneGraphStore';
import type { CharacterSummary } from '@/stores/useSceneGraphStore';
import { API_BASE_URL } from '@/config/api';

type ImportMode = 'script' | 'srt' | 'multi';

interface ScriptLine {
    character: string;
    text: string;
    emotion: string;
    action: string;
}

const SAMPLE_SCRIPT = `Hoa: Chào bạn, hôm nay trời đẹp quá!
Nam: Ừ, mình cũng nghĩ vậy. Đi dạo không?
Hoa: Được chứ! Mình rất vui.
Nam: Vậy đi thôi, cùng nhau nhé!`;

const SAMPLE_MULTI_SCENE = `[Background: classroom_scene]
Hoa: Chào các bạn, hôm nay chúng ta học bài gì?
Nam: Hôm nay học toán nhé!
---
[Background: park_scene]
[Transition: fade]
Hoa: Tan học rồi, đi công viên chơi không?
Nam: Đi thôi! Trời đẹp quá!
---
[Background: home_scene]
[Transition: dissolve]
Hoa: Về nhà rồi, tạm biệt nhé!
Nam: Tạm biệt, mai gặp lại!`;

const SAMPLE_SRT = `1
00:00:00,000 --> 00:00:02,500
Hoa: Chào bạn, hôm nay trời đẹp quá!

2
00:00:03,000 --> 00:00:05,500
Nam: Ừ, mình cũng nghĩ vậy. Đi dạo không?

3
00:00:06,000 --> 00:00:08,000
Hoa: Được chứ! Mình rất vui.

4
00:00:08,500 --> 00:00:11,000
Nam: Vậy đi thôi, cùng nhau nhé!`;

function parseScriptText(text: string): ScriptLine[] {
    const lines = text.trim().split('\n').filter(l => l.trim());
    return lines.map(line => {
        // Format: "Character: text" or "Character (emotion, action): text"
        const match = line.match(/^([^:：]{1,20})(?:\s*\(([^)]*)\))?\s*[:\s：]\s*(.+)$/);
        if (match) {
            const [, character, hints, dialogueText] = match;
            let emotion = '';
            let action = '';
            if (hints) {
                const parts = hints.split(',').map(s => s.trim());
                emotion = parts[0] || '';
                action = parts[1] || '';
            }
            return { character: character.trim(), text: dialogueText.trim(), emotion, action };
        }
        return { character: 'Narrator', text: line.trim(), emotion: '', action: '' };
    });
}

function extractUniqueCharacters(lines: ScriptLine[]): string[] {
    return [...new Set(lines.map(l => l.character))].filter(c => c !== 'Narrator');
}

export const ScriptImport: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
    const [mode, setMode] = useState<ImportMode>('script');
    const [scriptText, setScriptText] = useState(SAMPLE_SCRIPT);
    const [multiSceneText, setMultiSceneText] = useState(SAMPLE_MULTI_SCENE);
    const [srtText, setSrtText] = useState(SAMPLE_SRT);
    const [parsedLines, setParsedLines] = useState<ScriptLine[]>([]);
    const [charNames, setCharNames] = useState<string[]>([]);
    const [charMap, setCharMap] = useState<Record<string, string>>({});
    const [generateTTS, setGenerateTTS] = useState(true);
    const [isLoading, setIsLoading] = useState(false);
    const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
    const [showMapping, setShowMapping] = useState(true);
    const [backgrounds, setBackgrounds] = useState<string[]>([]);
    const [selectedBackground, setSelectedBackground] = useState<string>('');

    const characters = useSceneGraphStore(s => s.characters);
    const fetchCharacters = useSceneGraphStore(s => s.fetchCharacters);
    const applySceneData = useSceneGraphStore(s => s.applySceneData);
    const loadVideoProject = useSceneGraphStore(s => s.loadVideoProject);

    useEffect(() => {
        fetchCharacters();
        // Fetch stages
        const fetchStages = async () => {
            try {
                const res = await fetch(`${API_BASE_URL}/api/stages`);
                const items: any[] = await res.json();
                const stageIds = new Set<string>();
                items.forEach(item => {
                    if (item.name.endsWith('.png')) {
                        const match = item.name.match(/^(.+?_\d{13})/);
                        if (match) {
                            stageIds.add(match[1]);
                        } else {
                            stageIds.add(item.name.split('.')[0]);
                        }
                    }
                });
                const stageArray = Array.from(stageIds);
                setBackgrounds(stageArray);
                if (stageArray.length > 0) {
                    setSelectedBackground(stageArray[0]);
                }
            } catch (err) {
                console.error("Failed to fetch stages", err);
            }
        };
        fetchStages();
    }, [fetchCharacters]);

    // Parse script when text changes
    useEffect(() => {
        const extractNames = (text: string) => {
            const lines = text.split('\n').filter(l => {
                const m = l.match(/^([^:：]{1,20})[:\s：]\s*.+$/);
                return m && !l.match(/^\d/) && !l.includes('-->') && !l.match(/^\[/);
            });
            return [...new Set(lines.map(l => {
                const m = l.match(/^([^:：]{1,20})[:\s：]/);
                return m ? m[1].trim() : '';
            }).filter(Boolean))];
        };

        if (mode === 'script') {
            const lines = parseScriptText(scriptText);
            setParsedLines(lines);
            setCharNames(extractUniqueCharacters(lines));
        } else if (mode === 'multi') {
            const names = extractNames(multiSceneText);
            setCharNames(names.length > 0 ? names : ['Default']);
        } else {
            // SRT mode
            const names = extractNames(srtText);
            setCharNames(names.length > 0 ? names : ['Default']);
        }
    }, [scriptText, srtText, multiSceneText, mode]);

    // Auto-map characters if only one available
    useEffect(() => {
        if (characters.length > 0 && charNames.length > 0) {
            const newMap: Record<string, string> = {};
            charNames.forEach((name, i) => {
                if (!charMap[name] && characters[i]) {
                    newMap[name] = characters[i].id;
                }
            });
            if (Object.keys(newMap).length > 0) {
                setCharMap(prev => ({ ...prev, ...newMap }));
            }
        }
    }, [characters, charNames]);

    const handleGenerate = async () => {
        setIsLoading(true);
        setResult(null);

        try {
            let response;

            if (mode === 'multi') {
                // Multi-scene mode — calls /api/automation/multi-scene
                response = await fetch(`${API_BASE_URL}/api/automation/multi-scene`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        script_text: multiSceneText,
                        character_map: charMap,
                        generate_tts: generateTTS,
                        default_background: selectedBackground,
                    }),
                });

                if (!response.ok) {
                    const err = await response.json().catch(() => ({ detail: `HTTP ${response!.status}` }));
                    throw new Error(err.detail || `HTTP ${response.status}`);
                }

                const data = await response.json();

                if (data.success && data.project) {
                    loadVideoProject(data.project);
                    setResult({
                        success: true,
                        message: `✅ ${data.message}\n${data.total_scenes} scenes, ${data.total_duration?.toFixed(1)}s total`,
                    });
                } else {
                    throw new Error(data.message || 'Unknown error');
                }
            } else if (mode === 'script') {
                const lines = parseScriptText(scriptText);
                response = await fetch(`${API_BASE_URL}/api/automation/script-to-scene`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        lines: lines.map(l => ({
                            character: l.character,
                            text: l.text,
                            emotion: l.emotion,
                            action: l.action,
                        })),
                        character_map: charMap,
                        background_id: selectedBackground,
                        generate_tts: generateTTS,
                    }),
                });

                if (!response.ok) {
                    const err = await response.json().catch(() => ({ detail: `HTTP ${response!.status}` }));
                    throw new Error(err.detail || `HTTP ${response.status}`);
                }

                const data = await response.json();
                if (data.success && data.scene) {
                    applySceneData(data.scene);
                    setResult({
                        success: true,
                        message: `✅ ${data.message}\n${data.characters_added} nhân vật, ${data.keyframes_added} keyframes`,
                    });
                } else {
                    throw new Error(data.message || 'Unknown error');
                }
            } else {
                // SRT mode
                response = await fetch(`${API_BASE_URL}/api/automation/srt-to-scene`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        srt_text: srtText,
                        character_map: charMap,
                        default_character: Object.values(charMap)[0] || '',
                        generate_tts: false,
                    }),
                });

                if (!response.ok) {
                    const err = await response.json().catch(() => ({ detail: `HTTP ${response!.status}` }));
                    throw new Error(err.detail || `HTTP ${response.status}`);
                }

                const data = await response.json();
                if (data.success && data.scene) {
                    applySceneData(data.scene);
                    setResult({
                        success: true,
                        message: `✅ ${data.message}\n${data.characters_added} nhân vật, ${data.keyframes_added} keyframes`,
                    });
                } else {
                    throw new Error(data.message || 'Unknown error');
                }
            }
        } catch (err: any) {
            setResult({ success: false, message: `❌ ${err.message}` });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-full text-white text-xs">
            {/* Header */}
            <div className="p-3 border-b border-white/5 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-emerald-400" />
                    <span className="font-bold text-emerald-400 uppercase tracking-wider text-[10px]">
                        Script Import
                    </span>
                </div>
            </div>

            {/* Mode Toggle */}
            <div className="flex gap-1 p-2 shrink-0">
                <button
                    onClick={() => setMode('script')}
                    className={`flex-1 px-2 py-1.5 rounded text-[10px] font-bold transition-all ${mode === 'script'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-white/5 text-neutral-500 border border-white/5 hover:text-neutral-300'
                        }`}
                >
                    📝 Script
                </button>
                <button
                    onClick={() => setMode('multi')}
                    className={`flex-1 px-2 py-1.5 rounded text-[10px] font-bold transition-all ${mode === 'multi'
                            ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                            : 'bg-white/5 text-neutral-500 border border-white/5 hover:text-neutral-300'
                        }`}
                >
                    🎬 Multi
                </button>
                <button
                    onClick={() => setMode('srt')}
                    className={`flex-1 px-2 py-1.5 rounded text-[10px] font-bold transition-all ${mode === 'srt'
                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                            : 'bg-white/5 text-neutral-500 border border-white/5 hover:text-neutral-300'
                        }`}
                >
                    📄 SRT
                </button>
            </div>

            {/* Text Area */}
            <div className="flex-1 min-h-0 p-2 overflow-y-auto space-y-2">
                <textarea
                    value={mode === 'script' ? scriptText : mode === 'multi' ? multiSceneText : srtText}
                    onChange={e => {
                        if (mode === 'script') setScriptText(e.target.value);
                        else if (mode === 'multi') setMultiSceneText(e.target.value);
                        else setSrtText(e.target.value);
                    }}
                    placeholder={mode === 'script'
                        ? 'Hoa: Chào bạn!\nNam (vui): Chào!'
                        : mode === 'multi'
                        ? '[Background: bg_id]\nHoa: Hello!\n---\n[Transition: fade]\nNam: Scene 2!'
                        : '1\n00:00:00,000 --> 00:00:02,500\nHoa: Chào bạn!'
                    }
                    className={`w-full ${mode === 'multi' ? 'h-40' : 'h-32'} bg-black/40 rounded-lg p-2.5 text-[11px] font-mono text-neutral-300 border border-white/10 focus:border-emerald-500/50 focus:outline-none resize-none`}
                    spellCheck={false}
                />

                {/* Multi-scene help hint */}
                {mode === 'multi' && (
                    <div className="text-[9px] text-neutral-500 bg-violet-500/5 border border-violet-500/10 rounded px-2 py-1.5">
                        <strong className="text-violet-400">Cú pháp:</strong> Dùng <code className="text-violet-300">---</code> để phân cách scenes.
                        <br />Thêm <code className="text-violet-300">[Background: id]</code> và <code className="text-violet-300">[Transition: fade|cut|dissolve]</code> cho mỗi scene.
                    </div>
                )}

                {/* Character Mapping */}
                <div className="rounded-lg bg-white/5 border border-white/5 overflow-hidden">
                    <button
                        onClick={() => setShowMapping(!showMapping)}
                        className="w-full flex items-center gap-2 p-2 text-[10px] font-bold text-neutral-400 hover:text-white transition-colors"
                    >
                        {showMapping ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        Character Mapping ({charNames.length})
                    </button>
                    {showMapping && (
                        <div className="px-2 pb-2 space-y-1.5">
                            {charNames.map(name => (
                                <div key={name} className="flex items-center gap-2">
                                    <span className="text-neutral-400 min-w-[60px] truncate">{name}</span>
                                    <span className="text-neutral-600">→</span>
                                    <select
                                        value={charMap[name] || ''}
                                        onChange={e => setCharMap(prev => ({ ...prev, [name]: e.target.value }))}
                                        className="flex-1 bg-black/40 rounded px-2 py-1 text-[10px] border border-white/10 text-neutral-300 focus:border-emerald-500/50 focus:outline-none"
                                    >
                                        <option value="">-- Chọn nhân vật --</option>
                                        {characters.map(c => (
                                            <option key={c.id} value={c.id}>
                                                {c.name} ({c.poses}P / {c.faces}F)
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Background Selection */}
                <div className="rounded-lg bg-white/5 border border-white/5 overflow-hidden p-2">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-neutral-400 mb-1.5">
                        <span className="w-3" />
                        Bối cảnh (Background)
                    </div>
                    <select
                        value={selectedBackground}
                        onChange={e => setSelectedBackground(e.target.value)}
                        className="w-full bg-black/40 rounded px-2 py-1.5 text-[10px] border border-white/10 text-neutral-300 focus:border-emerald-500/50 focus:outline-none"
                    >
                        {backgrounds.map(bg => (
                            <option key={bg} value={bg}>{bg}</option>
                        ))}
                    </select>
                </div>

                {/* Options */}
                {(mode === 'script' || mode === 'multi') && (
                    <label className="flex items-center gap-2 px-2 text-[10px] text-neutral-400 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={generateTTS}
                            onChange={e => setGenerateTTS(e.target.checked)}
                            className="rounded border-white/20 bg-black/40"
                        />
                        🔊 Generate TTS audio (lip-sync)
                    </label>
                )}

                {/* Result */}
                {result && (
                    <div className={`rounded-lg p-2.5 text-[10px] border ${result.success
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                            : 'bg-red-500/10 border-red-500/30 text-red-300'
                        }`}>
                        <div className="flex items-start gap-1.5">
                            {result.success
                                ? <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                : <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            }
                            <pre className="whitespace-pre-wrap">{result.message}</pre>
                        </div>
                    </div>
                )}
            </div>

            {/* Generate Button */}
            <div className="p-2 border-t border-white/5 shrink-0">
                <button
                    onClick={handleGenerate}
                    disabled={isLoading || charNames.some(n => !charMap[n])}
                    className="w-full flex items-center justify-center gap-2 rounded-lg py-2.5 text-[11px] font-bold transition-all disabled:opacity-40"
                    style={{
                        background: isLoading
                            ? 'rgba(255,255,255,0.1)'
                            : mode === 'multi'
                            ? 'linear-gradient(135deg, #8b5cf6, #06b6d4)'
                            : 'linear-gradient(135deg, #10b981, #06b6d4)',
                        boxShadow: isLoading
                            ? 'none'
                            : mode === 'multi'
                            ? '0 2px 12px rgba(139,92,246,0.3)'
                            : '0 2px 12px rgba(16,185,129,0.3)',
                    }}
                >
                    {isLoading ? (
                        <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            {mode === 'multi' ? 'Đang tạo multi-scene...' : 'Đang tạo scene...'}
                        </>
                    ) : (
                        <>
                            <Play className="w-3.5 h-3.5" />
                            {mode === 'multi' ? '🎬 Generate Multi-Scene' : 'Generate Scene'}
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};
