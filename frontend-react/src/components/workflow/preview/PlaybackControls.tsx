import React from 'react';
import { Play, Pause, Square, SkipBack, SkipForward, Download, Layers, X } from 'lucide-react';

interface PlaybackControlsProps {
    isPlaying: boolean;
    playbackSpeed: number;
    exporting: boolean;
    tracksEmpty: boolean;
    showSceneContext: boolean;
    play: () => void;
    pause: () => void;
    stop: () => void;
    skipBack: () => void;
    skipForward: () => void;
    setPlaybackSpeed: (speed: number) => void;
    setShowSceneContext: (show: boolean) => void;
    exportVideo: () => void;
    onClose: () => void;
}

const PlaybackControls: React.FC<PlaybackControlsProps> = ({
    isPlaying,
    playbackSpeed,
    exporting,
    tracksEmpty,
    showSceneContext,
    play,
    pause,
    stop,
    skipBack,
    skipForward,
    setPlaybackSpeed,
    setShowSceneContext,
    exportVideo,
    onClose,
}) => {
    return (
        <div className="flex items-center justify-center gap-3 px-6 py-4 border-t border-white/5">
            <button onClick={skipBack} className="p-2 rounded-lg hover:bg-white/5 text-neutral-400 hover:text-white">
                <SkipBack className="w-4 h-4" />
            </button>
            {isPlaying ? (
                <button onClick={pause} className="w-12 h-12 rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-xl shadow-indigo-500/30 hover:from-indigo-500 hover:to-purple-500 active:scale-90 transition-all">
                    <Pause className="w-5 h-5" />
                </button>
            ) : (
                <button onClick={play} className="w-12 h-12 rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-xl shadow-indigo-500/30 hover:from-indigo-500 hover:to-purple-500 active:scale-90 transition-all">
                    <Play className="w-5 h-5 ml-0.5" />
                </button>
            )}
            <button onClick={stop} className="p-2 rounded-lg hover:bg-white/5 text-neutral-400 hover:text-white">
                <Square className="w-4 h-4" />
            </button>
            <button onClick={skipForward} className="p-2 rounded-lg hover:bg-white/5 text-neutral-400 hover:text-white">
                <SkipForward className="w-4 h-4" />
            </button>

            {/* Speed */}
            <div className="ml-4 flex items-center gap-1">
                {[0.5, 1, 1.5, 2].map((speed) => (
                    <button
                        key={speed}
                        onClick={() => setPlaybackSpeed(speed)}
                        className={`px-2 py-1 rounded text-[10px] font-bold transition-all ${playbackSpeed === speed
                            ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                            : 'text-neutral-500 hover:text-white hover:bg-white/5'
                            }`}
                    >
                        {speed}×
                    </button>
                ))}
            </div>

            {/* Scene Context Toggle */}
            <button
                onClick={() => setShowSceneContext(!showSceneContext)}
                className={`ml-4 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all ${showSceneContext
                    ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                    : 'text-neutral-400 hover:text-white hover:bg-white/5 border border-white/10'
                    }`}
                title="Toggle Scene Context Panel"
            >
                <Layers className="w-4 h-4" />
                Context
            </button>

            {/* Export Button (WebCodecs GPU) */}
            <button
                onClick={exportVideo}
                disabled={exporting || tracksEmpty}
                className="ml-2 flex items-center gap-2 px-4 py-2 rounded-lg text-white text-xs font-bold shadow-lg active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-gradient-to-r from-emerald-600 to-teal-600 shadow-emerald-500/30 hover:from-emerald-500 hover:to-teal-500"
                title="Export MP4 via WebCodecs (GPU-accelerated, no FFmpeg)"
            >
                <Download className="w-4 h-4" />
                Export MP4
            </button>

            {/* Exit Preview */}
            <button
                onClick={onClose}
                className="ml-4 flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-bold hover:bg-red-500/20 hover:text-red-300 active:scale-95 transition-all"
                title="Exit Preview"
            >
                <X className="w-4 h-4" />
                Exit
            </button>
        </div>
    );
};

export default PlaybackControls;
