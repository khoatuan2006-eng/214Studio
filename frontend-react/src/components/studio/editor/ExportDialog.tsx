/**
 * ExportDialog — UI for exporting the scene as a video file.
 *
 * Shows resolution options, progress bar, and download button.
 */

import React, { useState, useCallback, useRef } from 'react';
import { X, Download, Film, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { useSceneGraphStore } from '@/stores/useSceneGraphStore';
import { exportCanvasToVideo, downloadBlobUrl } from '@/core/export/VideoExporter';
import type { ExportProgress } from '@/core/export/VideoExporter';

interface ExportDialogProps {
    isOpen: boolean;
    onClose: () => void;
}

export const ExportDialog: React.FC<ExportDialogProps> = ({ isOpen, onClose }) => {
    const [resolution, setResolution] = useState<'720p' | '1080p'>('1080p');
    const [progress, setProgress] = useState<ExportProgress | null>(null);
    const [blobUrl, setBlobUrl] = useState<string | null>(null);
    const duration = useSceneGraphStore(s => s.duration);
    const setTime = useSceneGraphStore(s => s.setTime);

    const handleExport = useCallback(async () => {
        // Find the PixiJS canvas element
        const canvas = document.querySelector('canvas') as HTMLCanvasElement | null;
        if (!canvas) {
            setProgress({ currentFrame: 0, totalFrames: 0, percent: 0, status: 'error', error: 'Canvas not found' });
            return;
        }

        setBlobUrl(null);
        const fps = 30;

        try {
            // Step through the scene timeline to render each frame
            const totalFrames = Math.ceil(duration * fps);

            setProgress({ currentFrame: 0, totalFrames, percent: 0, status: 'preparing' });

            // First, reset to start
            setTime(0);
            await new Promise(r => setTimeout(r, 100));

            const url = await exportCanvasToVideo(
                canvas,
                duration,
                fps,
                (p) => {
                    setProgress(p);
                    // Also advance the scene time to match the current frame
                    if (p.status === 'recording') {
                        const time = (p.currentFrame / fps);
                        setTime(Math.min(time, duration));
                    }
                },
            );

            setBlobUrl(url);
        } catch (err: any) {
            setProgress({
                currentFrame: 0,
                totalFrames: 0,
                percent: 0,
                status: 'error',
                error: err.message || 'Export failed',
            });
        }
    }, [duration, setTime]);

    const handleDownload = useCallback(() => {
        if (blobUrl) {
            const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
            downloadBlobUrl(blobUrl, `animestudio_${timestamp}.webm`);
        }
    }, [blobUrl]);

    if (!isOpen) return null;

    const isExporting = progress?.status === 'preparing' || progress?.status === 'recording' || progress?.status === 'encoding';

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div
                className="w-[420px] rounded-2xl border border-white/10 shadow-2xl"
                style={{
                    background: 'linear-gradient(160deg, #1a1a2e, #16213e)',
                    boxShadow: '0 0 60px rgba(99,102,241,0.1), 0 8px 32px rgba(0,0,0,0.6)',
                }}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                            <Film className="w-4 h-4 text-white" />
                        </div>
                        <div>
                            <h2 className="text-sm font-bold text-white">Export Video</h2>
                            <p className="text-[10px] text-neutral-400">Render scene to WebM</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={isExporting}
                        className="p-1.5 rounded-lg hover:bg-white/10 text-neutral-400 hover:text-white transition-colors disabled:opacity-30"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Body */}
                <div className="px-6 py-5 space-y-4">
                    {/* Settings */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[10px] text-neutral-400 mb-1.5 font-medium">Resolution</label>
                            <select
                                value={resolution}
                                onChange={e => setResolution(e.target.value as any)}
                                disabled={isExporting}
                                className="w-full bg-black/40 rounded-lg px-3 py-2 text-xs border border-white/10 text-white focus:border-indigo-500/50 focus:outline-none disabled:opacity-50"
                            >
                                <option value="1080p">1920×1080 (Full HD)</option>
                                <option value="720p">1280×720 (HD)</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] text-neutral-400 mb-1.5 font-medium">Duration</label>
                            <div className="bg-black/40 rounded-lg px-3 py-2 text-xs border border-white/10 text-white font-mono">
                                {duration.toFixed(1)}s · {Math.ceil(duration * 30)} frames
                            </div>
                        </div>
                    </div>

                    <div className="bg-black/20 rounded-lg px-3 py-2 text-[10px] text-neutral-500 border border-white/5">
                        Format: <span className="text-neutral-300">WebM (VP9)</span> · FPS: <span className="text-neutral-300">30</span> · Bitrate: <span className="text-neutral-300">8 Mbps</span>
                    </div>

                    {/* Progress */}
                    {progress && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-[10px]">
                                <span className={`font-medium ${
                                    progress.status === 'error' ? 'text-red-400' :
                                    progress.status === 'done' ? 'text-emerald-400' : 'text-indigo-400'
                                }`}>
                                    {progress.status === 'preparing' && '⏳ Preparing...'}
                                    {progress.status === 'recording' && `🎬 Recording frame ${progress.currentFrame}/${progress.totalFrames}`}
                                    {progress.status === 'encoding' && '🔄 Encoding...'}
                                    {progress.status === 'done' && '✅ Export complete!'}
                                    {progress.status === 'error' && `❌ ${progress.error}`}
                                </span>
                                <span className="text-neutral-500 font-mono">{progress.percent}%</span>
                            </div>
                            <div className="w-full h-2 bg-black/40 rounded-full overflow-hidden">
                                <div
                                    className="h-full rounded-full transition-all duration-300"
                                    style={{
                                        width: `${progress.percent}%`,
                                        background: progress.status === 'error'
                                            ? 'linear-gradient(90deg, #ef4444, #f97316)'
                                            : progress.status === 'done'
                                            ? 'linear-gradient(90deg, #10b981, #06b6d4)'
                                            : 'linear-gradient(90deg, #6366f1, #8b5cf6)',
                                    }}
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-white/5 flex gap-3">
                    {blobUrl ? (
                        <button
                            onClick={handleDownload}
                            className="flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold text-white transition-all"
                            style={{
                                background: 'linear-gradient(135deg, #10b981, #06b6d4)',
                                boxShadow: '0 2px 16px rgba(16,185,129,0.4)',
                            }}
                        >
                            <Download className="w-4 h-4" />
                            Download WebM
                        </button>
                    ) : (
                        <button
                            onClick={handleExport}
                            disabled={isExporting}
                            className="flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold text-white transition-all disabled:opacity-50"
                            style={{
                                background: isExporting
                                    ? 'rgba(255,255,255,0.1)'
                                    : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                boxShadow: isExporting ? 'none' : '0 2px 16px rgba(99,102,241,0.4)',
                            }}
                        >
                            {isExporting ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Exporting...
                                </>
                            ) : (
                                <>
                                    <Film className="w-4 h-4" />
                                    Start Export
                                </>
                            )}
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        disabled={isExporting}
                        className="px-5 py-2.5 rounded-xl text-xs font-medium text-neutral-400 bg-white/5 hover:bg-white/10 transition-colors disabled:opacity-30"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};
