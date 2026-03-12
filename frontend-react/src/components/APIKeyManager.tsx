/**
 * APIKeyManager — modal for centralized Gemini API key + model management.
 * Supports: paste multiple keys, view masked keys, delete keys, select model.
 */
import { useState, useEffect, useCallback } from 'react';
import { X, Key, Trash2, Plus, Loader2, CheckCircle, Cpu } from 'lucide-react';
import { API_BASE_URL } from '@/config/api';

interface MaskedKey {
    index: number;
    label: string;
}

interface AIModel {
    id: string;
    name: string;
    status: string;
    status_message: string;
    type: string;
}

interface APIKeyManagerProps {
    open: boolean;
    onClose: () => void;
}

export default function APIKeyManager({ open, onClose }: APIKeyManagerProps) {
    const [keys, setKeys] = useState<MaskedKey[]>([]);
    const [total, setTotal] = useState(0);
    const [currentLabel, setCurrentLabel] = useState('');
    const [loading, setLoading] = useState(false);
    const [input, setInput] = useState('');
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [models, setModels] = useState<AIModel[]>([]);
    const [selectedModel, setSelectedModel] = useState('');
    const [loadingModels, setLoadingModels] = useState(false);

    const loadKeys = useCallback(async () => {
        setLoading(true);
        try {
            const resp = await fetch(`${API_BASE_URL}/api/ai/keys`);
            const data = await resp.json();
            setKeys(data.keys || []);
            setTotal(data.total || 0);
            setCurrentLabel(data.current || '');
        } catch {
            setMessage('❌ Không kết nối được server');
        } finally {
            setLoading(false);
        }
    }, []);

    const loadModels = useCallback(async () => {
        setLoadingModels(true);
        try {
            const resp = await fetch(`${API_BASE_URL}/api/ai/models`);
            const data = await resp.json();
            if (data.models?.length) {
                setModels(data.models);
                // Get current config to pre-select
                const cfgResp = await fetch(`${API_BASE_URL}/api/ai/config`);
                const cfg = await cfgResp.json();
                setSelectedModel(cfg.model || data.models[0].id);
            }
        } catch { /* ignore */ }
        finally { setLoadingModels(false); }
    }, []);

    useEffect(() => {
        if (open) {
            loadKeys();
            loadModels();
            setInput('');
            setMessage('');
        }
    }, [open, loadKeys, loadModels]);

    const handleAddKeys = async () => {
        const lines = input
            .split(/[\n,;]+/)
            .map(s => s.trim())
            .filter(s => s.length > 10);
        if (lines.length === 0) {
            setMessage('⚠️ Chưa có key hợp lệ');
            return;
        }
        setSaving(true);
        setMessage('');
        try {
            const resp = await fetch(`${API_BASE_URL}/api/ai/keys/bulk`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ api_keys: lines }),
            });
            const data = await resp.json();
            setMessage(`✅ Đã thêm ${data.added} key (tổng: ${data.total_keys})`);
            setInput('');
            loadKeys();
        } catch {
            setMessage('❌ Lưu thất bại');
        } finally {
            setSaving(false);
        }
    };

    const handleModelChange = async (modelId: string) => {
        setSelectedModel(modelId);
        try {
            await fetch(`${API_BASE_URL}/api/ai/config`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: modelId, vision_model: modelId }),
            });
            setMessage(`✅ Model: ${modelId}`);
        } catch {
            setMessage('❌ Lưu model thất bại');
        }
    };

    const handleRemove = async (index: number) => {
        try {
            await fetch(`${API_BASE_URL}/api/ai/keys/${index}`, { method: 'DELETE' });
            loadKeys();
        } catch {
            setMessage('❌ Xóa thất bại');
        }
    };

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
            onClick={onClose}
        >
            <div
                className="w-[480px] max-h-[80vh] overflow-y-auto rounded-2xl border"
                style={{
                    background: 'linear-gradient(145deg, rgba(23,23,30,0.98), rgba(15,15,20,0.98))',
                    borderColor: 'rgba(99,102,241,0.2)',
                    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5), 0 0 40px -10px rgba(99,102,241,0.15)',
                }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                            style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.3), rgba(168,85,247,0.3))' }}>
                            <Key className="w-4 h-4 text-indigo-300" />
                        </div>
                        <div>
                            <h2 className="text-sm font-bold text-white">AI Settings</h2>
                            <p className="text-[10px] text-neutral-500">
                                {total > 0 ? `${total} key · ${currentLabel}` : 'Chưa có key'}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
                        <X className="w-4 h-4 text-neutral-400" />
                    </button>
                </div>

                {/* Add keys area */}
                <div className="p-5 space-y-3">
                    <label className="block text-[11px] font-medium text-neutral-300">
                        Dán API Keys <span className="text-neutral-500">(mỗi dòng 1 key, hoặc ngăn bằng dấu phẩy)</span>
                    </label>
                    <textarea
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        placeholder={"AIzaSyBk1234567890abcdef\nAIzaSyXx0987654321fedcba\n..."}
                        rows={4}
                        className="w-full rounded-xl px-4 py-3 text-xs text-white placeholder:text-neutral-600 outline-none resize-none font-mono"
                        style={{
                            background: 'rgba(0,0,0,0.4)',
                            border: '1px solid rgba(255,255,255,0.08)',
                        }}
                        onFocus={e => (e.target.style.borderColor = 'rgba(99,102,241,0.4)')}
                        onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.08)')}
                    />
                    <button
                        onClick={handleAddKeys}
                        disabled={saving || !input.trim()}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all disabled:opacity-40"
                        style={{
                            background: 'linear-gradient(135deg, rgba(99,102,241,0.3), rgba(168,85,247,0.2))',
                            border: '1px solid rgba(99,102,241,0.3)',
                            color: '#c7d2fe',
                        }}
                    >
                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                        {saving ? 'Đang lưu...' : 'Thêm Keys'}
                    </button>

                    {message && (
                        <p className={`text-[11px] flex items-center gap-1.5 ${message.startsWith('✅') ? 'text-emerald-400' : message.startsWith('❌') ? 'text-red-400' : 'text-amber-400'}`}>
                            {message.startsWith('✅') && <CheckCircle className="w-3 h-3" />}
                            {message}
                        </p>
                    )}
                </div>

                {/* Model Selector */}
                {total > 0 && (
                    <div className="px-5 pb-4 space-y-2">
                        <div className="flex items-center gap-2 mb-2">
                            <Cpu className="w-3.5 h-3.5 text-violet-400" />
                            <span className="text-[11px] font-medium text-neutral-300">AI Model</span>
                        </div>
                        {loadingModels ? (
                            <div className="flex items-center gap-2 text-[10px] text-neutral-500">
                                <Loader2 className="w-3 h-3 animate-spin" /> Đang tải models...
                            </div>
                        ) : models.length > 0 ? (
                            <div className="space-y-1">
                                {models.map(m => {
                                    const isSelected = selectedModel === m.id;
                                    const statusIcon = m.status === 'available' ? '✅' : m.status === 'rate_limited' ? '⚠️' : m.status === 'no_access' ? '🔒' : '❓';
                                    return (
                                        <button
                                            key={m.id}
                                            onClick={() => handleModelChange(m.id)}
                                            disabled={m.status === 'no_access'}
                                            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition-all disabled:opacity-30 ${isSelected
                                                    ? 'ring-1 ring-violet-500/50'
                                                    : 'hover:bg-white/5'
                                                }`}
                                            style={isSelected ? {
                                                background: 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(99,102,241,0.1))',
                                            } : { background: 'rgba(255,255,255,0.02)' }}
                                        >
                                            <div className="flex items-center gap-2 min-w-0">
                                                <span className="text-[11px]">{statusIcon}</span>
                                                <div className="min-w-0">
                                                    <p className={`text-[11px] font-medium truncate ${isSelected ? 'text-violet-200' : 'text-neutral-300'}`}>
                                                        {m.name}
                                                    </p>
                                                    <p className="text-[9px] text-neutral-600 truncate">{m.id}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1.5 shrink-0">
                                                {m.type === 'text+vision' && (
                                                    <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-sky-500/15 text-sky-400 font-medium">👁 vision</span>
                                                )}
                                                {isSelected && (
                                                    <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-violet-500/20 text-violet-300 font-bold">ACTIVE</span>
                                                )}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        ) : (
                            <p className="text-[10px] text-neutral-500">Thêm API key trước để xem models</p>
                        )}
                    </div>
                )}

                {/* Existing keys list */}
                {loading ? (
                    <div className="px-5 pb-5 text-center">
                        <Loader2 className="w-5 h-5 mx-auto text-indigo-400 animate-spin" />
                    </div>
                ) : keys.length > 0 ? (
                    <div className="px-5 pb-5 space-y-1.5">
                        <p className="text-[10px] font-medium text-neutral-500 uppercase tracking-wider mb-2">
                            Keys đã lưu ({keys.length})
                        </p>
                        {keys.map(k => (
                            <div
                                key={k.index}
                                className="flex items-center justify-between px-3 py-2 rounded-lg group"
                                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.04)' }}
                            >
                                <div className="flex items-center gap-2">
                                    <Key className="w-3 h-3 text-indigo-400/60" />
                                    <span className="text-xs text-neutral-300 font-mono">{k.label}</span>
                                    <span className="text-[9px] text-neutral-600">#{k.index + 1}</span>
                                </div>
                                <button
                                    onClick={() => handleRemove(k.index)}
                                    className="p-1 rounded hover:bg-red-500/20 text-neutral-600 hover:text-red-400 transition-all opacity-0 group-hover:opacity-100"
                                    title="Xóa key này"
                                >
                                    <Trash2 className="w-3 h-3" />
                                </button>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="px-5 pb-5 text-center">
                        <p className="text-xs text-neutral-500">Chưa có API key nào</p>
                        <a
                            href="https://aistudio.google.com/apikey"
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] text-indigo-400 hover:text-indigo-300 underline mt-1 inline-block"
                        >
                            → Lấy key tại Google AI Studio
                        </a>
                    </div>
                )}
            </div>
        </div>
    );
}
