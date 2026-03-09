import React from 'react';

interface ExportOverlayProps {
    exportProgress: number;
    exportStatus: string;
}

const ExportOverlay: React.FC<ExportOverlayProps> = ({ exportProgress, exportStatus }) => {
    return (
        <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
            <div className="w-80">
                <div className="text-center mb-4">
                    <div className="w-12 h-12 mx-auto mb-3 border-3 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                    <p className="text-white text-sm font-medium">{exportStatus}</p>
                </div>
                <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-300"
                        style={{ width: `${exportProgress}%` }}
                    />
                </div>
                <p className="text-center text-neutral-500 text-[10px] mt-2">{exportProgress}%</p>
            </div>
        </div>
    );
};

export default ExportOverlay;
