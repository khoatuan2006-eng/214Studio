import { memo, useState, useCallback, useRef } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { useWorkflowStore } from '@/stores/useWorkflowStore';
import { GripVertical, Music, Mic, FileText, Play, Loader2, Upload } from 'lucide-react';
import { API_BASE_URL } from '@/config/api';

export interface AudioNodeData {
    label: string;
    audioType: 'bgm' | 'sfx' | 'voice';
    assetPath: string;
    volume: number;
    startTime: number;
    loop: boolean;
    fadeIn: number;
    fadeOut: number;
    // TTS fields
    ttsText?: string;
    ttsVoice?: string;
    ttsAudioUrl?: string;
    ttsSrtUrl?: string;
    ttsSrtContent?: string;
    ttsDuration?: number;
    ttsLines?: { index: number; text: string; start_time: number; end_time: number; duration: number }[];
    [key: string]: unknown;
}

type AudioNodeType = Node<AudioNodeData, 'audio'>;

interface VoiceInfo {
    code: string;
    id: string;
    name: string;
    gender: string;
    lang: string;
}

function AudioNodeComponent({ id, data, selected }: NodeProps<AudioNodeType>) {
    const updateNodeData = useWorkflowStore((s) => s.updateNodeData);

    const [voices, setVoices] = useState<VoiceInfo[]>([]);
    const [selectedVoice, setSelectedVoice] = useState(data.ttsVoice || 'BV074');
    const [synthesizing, setSynthesizing] = useState(false);
    const [error, setError] = useState('');
    const [dragOver, setDragOver] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Load voices on first interaction
    const loadVoices = useCallback(async () => {
        if (voices.length > 0) return;
        try {
            const resp = await fetch(`${API_BASE_URL}/api/tts/voices`);
            const data = await resp.json();
            setVoices(data.voices || []);
        } catch { /* ignore */ }
    }, [voices.length]);

    // Handle TXT file upload
    const handleFileUpload = useCallback((file: File) => {
        if (!file.name.toLowerCase().endsWith('.txt')) {
            setError('Chỉ hỗ trợ file .txt');
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            if (text?.trim()) {
                updateNodeData(id, { ttsText: text.trim(), ttsFileName: file.name });
                setError('');
            }
        };
        reader.readAsText(file, 'utf-8');
    }, [id, updateNodeData]);

    // Synthesize
    const handleSynthesize = useCallback(async () => {
        const text = data.ttsText?.trim();
        if (!text) { setError('Tải file .txt trước'); return; }

        setSynthesizing(true);
        setError('');
        try {
            const resp = await fetch(`${API_BASE_URL}/api/tts/synthesize`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, voice: selectedVoice, pause_ms: 400 }),
            });
            if (!resp.ok) {
                const err = await resp.json().catch(() => ({ detail: 'Lỗi server' }));
                throw new Error(err.detail || `HTTP ${resp.status}`);
            }
            const result = await resp.json();
            updateNodeData(id, {
                ttsText: text,
                ttsVoice: selectedVoice,
                ttsAudioUrl: result.audio_url,
                ttsSrtUrl: result.srt_url,
                ttsSrtContent: result.srt_content,
                ttsDuration: result.total_duration,
                ttsLines: result.lines,
                audioType: 'voice',
                assetPath: result.audio_url,
            });
        } catch (err: any) {
            setError(err.message || 'Synthesis failed');
        } finally {
            setSynthesizing(false);
        }
    }, [id, data.ttsText, selectedVoice, updateNodeData]);

    const hasResult = !!data.ttsAudioUrl;

    return (
        <div
            className={`rounded-xl overflow-hidden shadow-2xl transition-all duration-200 min-w-[240px] max-w-[280px] ${selected
                ? 'ring-2 ring-purple-400 shadow-purple-500/30'
                : 'ring-1 ring-white/10 hover:ring-white/20'
                }`}
            style={{ background: 'linear-gradient(135deg, #261b4e 0%, #1a1a2e 100%)' }}
        >
            {/* Header */}
            <div
                className="flex items-center gap-2 px-3 py-2 border-b border-white/10"
                style={{ background: 'linear-gradient(90deg, rgba(168,85,247,0.3), rgba(139,92,246,0.15))' }}
            >
                <GripVertical className="w-3 h-3 text-white/30 cursor-grab" />
                <Mic className="w-4 h-4 text-purple-300" />
                <span className="text-xs font-bold text-white/90 truncate flex-1">
                    {data.label || 'Audio TTS'}
                </span>
                {hasResult && (
                    <span className="text-[8px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-300 font-mono">
                        {data.ttsDuration?.toFixed(1)}s
                    </span>
                )}
            </div>

            {/* TXT file upload */}
            <div className="px-3 pt-2 pb-1">
                <div
                    className={`border rounded-lg text-center cursor-pointer transition-all py-2 ${dragOver
                        ? 'border-purple-400 bg-purple-500/10 border-solid'
                        : data.ttsText
                            ? 'border-solid border-green-500/30 bg-green-500/5'
                            : 'border-dashed border-white/10 hover:border-white/20'
                        }`}
                    onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
                    onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(false); }}
                    onDrop={(e) => {
                        e.preventDefault(); e.stopPropagation(); setDragOver(false);
                        if (e.dataTransfer.files?.[0]) handleFileUpload(e.dataTransfer.files[0]);
                    }}
                >
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={(e) => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0]); }}
                        accept=".txt"
                        className="hidden"
                    />
                    {data.ttsText ? (
                        <div className="flex flex-col items-center gap-0.5">
                            <FileText className="w-4 h-4 text-green-400" />
                            <span className="text-[9px] text-green-300 font-semibold">
                                {(data as any).ttsFileName || 'script.txt'}
                            </span>
                            <span className="text-[8px] text-neutral-500">
                                {data.ttsText.split('\n').filter((l: string) => l.trim()).length} dòng • Click để đổi file
                            </span>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-0.5">
                            <Upload className="w-4 h-4 text-neutral-500" />
                            <span className="text-[9px] text-neutral-500">
                                {dragOver ? 'Thả file .txt' : 'Kéo thả hoặc click chọn file .txt'}
                            </span>
                            <span className="text-[7px] text-neutral-600">Mỗi dòng = 1 câu</span>
                        </div>
                    )}
                </div>

                {/* Text preview */}
                {data.ttsText && !hasResult && (
                    <div className="mt-1 rounded bg-black/30 border border-white/5 px-2 py-1 max-h-[60px] overflow-y-auto">
                        {data.ttsText.split('\n').filter((l: string) => l.trim()).slice(0, 5).map((line: string, i: number) => (
                            <div key={i} className="text-[7px] text-neutral-400 leading-tight truncate">
                                <span className="text-purple-400 font-mono">{i + 1}.</span> {line}
                            </div>
                        ))}
                        {data.ttsText.split('\n').filter((l: string) => l.trim()).length > 5 && (
                            <div className="text-[7px] text-neutral-600">...và {data.ttsText.split('\n').filter((l: string) => l.trim()).length - 5} dòng nữa</div>
                        )}
                    </div>
                )}
            </div>

            {/* Voice selector + Synthesize */}
            <div className="px-3 pb-2 space-y-1.5">
                <div className="flex gap-1">
                    <select
                        value={selectedVoice}
                        onFocus={loadVoices}
                        onChange={(e) => { e.stopPropagation(); setSelectedVoice(e.target.value); }}
                        onClick={(e) => e.stopPropagation()}
                        className="flex-1 bg-black/30 border border-white/10 rounded px-1.5 py-1 text-[9px] text-white outline-none focus:border-purple-400/50"
                    >
                        {voices.length > 0 ? (
                            voices.map(v => (
                                <option key={v.code} value={v.code}>
                                    {v.gender === 'male' ? '🧑' : '👩'} {v.name}
                                </option>
                            ))
                        ) : (
                            <>
                                <option value="BV074">👩 Nữ Việt</option>
                                <option value="BV075">🧑 Nam Việt</option>
                                <option value="BV421">👩 Đa ngữ</option>
                                <option value="BV562">👩 Nữ Việt 2</option>
                            </>
                        )}
                    </select>
                </div>

                <button
                    onClick={(e) => { e.stopPropagation(); handleSynthesize(); }}
                    disabled={synthesizing}
                    className={`w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${synthesizing
                        ? 'bg-purple-500/20 border-purple-500/30 text-purple-300 animate-pulse cursor-wait'
                        : 'bg-purple-500/10 border-purple-500/30 text-purple-300 hover:bg-purple-500/20 hover:border-purple-400/50'
                        }`}
                >
                    {synthesizing ? (
                        <><Loader2 className="w-3 h-3 animate-spin" /> Đang tạo...</>
                    ) : (
                        <><Play className="w-3 h-3" /> 🎤 Tạo giọng nói</>
                    )}
                </button>

                {error && <p className="text-[8px] text-red-400">{error}</p>}
            </div>

            {/* Results — SRT preview + audio player */}
            {hasResult && (
                <div className="px-3 pb-2 space-y-1.5">
                    {/* Mini SRT preview */}
                    <div className="rounded bg-black/30 border border-white/5 px-2 py-1 max-h-[80px] overflow-y-auto">
                        <p className="text-[7px] text-neutral-500 font-bold mb-0.5">📝 SRT ({data.ttsLines?.length} câu)</p>
                        {data.ttsLines?.map((line) => (
                            <div key={line.index} className="text-[7px] text-neutral-400 leading-tight">
                                <span className="text-purple-400 font-mono">{line.start_time.toFixed(1)}s</span>
                                {' '}{line.text}
                            </div>
                        ))}
                    </div>

                    {/* Audio player */}
                    <audio
                        src={`${API_BASE_URL}${data.ttsAudioUrl}`}
                        controls
                        className="w-full h-7"
                        style={{ filter: 'invert(1) hue-rotate(180deg)', opacity: 0.7 }}
                        onClick={(e) => e.stopPropagation()}
                    />

                    {/* Download links */}
                    <div className="flex gap-1">
                        <a
                            href={`${API_BASE_URL}${data.ttsAudioUrl}`}
                            download
                            onClick={(e) => e.stopPropagation()}
                            className="flex-1 flex items-center justify-center gap-1 text-[8px] text-purple-300 bg-purple-500/10 rounded py-0.5 hover:bg-purple-500/20"
                        >
                            <Music className="w-2.5 h-2.5" /> MP3
                        </a>
                        <a
                            href={`${API_BASE_URL}${data.ttsSrtUrl}`}
                            download
                            onClick={(e) => e.stopPropagation()}
                            className="flex-1 flex items-center justify-center gap-1 text-[8px] text-violet-300 bg-violet-500/10 rounded py-0.5 hover:bg-violet-500/20"
                        >
                            <FileText className="w-2.5 h-2.5" /> SRT
                        </a>
                    </div>
                </div>
            )}

            {/* Output Handles — 2 outputs: MP3 (top) + SRT (bottom) */}
            <Handle
                type="source"
                position={Position.Right}
                id="mp3-out"
                style={{ top: '40%' }}
                className="!w-3 !h-3 !bg-purple-500 !border-2 !border-purple-300 !shadow-lg !shadow-purple-500/50"
            />
            <Handle
                type="source"
                position={Position.Right}
                id="srt-out"
                style={{ top: '60%' }}
                className="!w-3 !h-3 !bg-violet-500 !border-2 !border-violet-300 !shadow-lg !shadow-violet-500/50"
            />

            {/* Handle labels */}
            <div className="absolute right-5 text-[7px] font-bold" style={{ top: 'calc(40% - 4px)' }}>
                <span className="text-purple-400">🎵 MP3</span>
            </div>
            <div className="absolute right-5 text-[7px] font-bold" style={{ top: 'calc(60% - 4px)' }}>
                <span className="text-violet-400">📝 SRT</span>
            </div>
        </div>
    );
}

export const AudioNode = memo(AudioNodeComponent);
