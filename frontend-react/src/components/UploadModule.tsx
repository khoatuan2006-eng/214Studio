import React, { useRef, useState } from 'react';
import { UploadCloud, Loader2, FileVideo } from 'lucide-react';
import axios from 'axios';
import { API_BASE, useAppStore } from '../store/useAppStore';

const UploadModule: React.FC = () => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadText, setUploadText] = useState('');
    const [uploadProgress, setUploadProgress] = useState(0);

    const fetchCharacters = useAppStore(state => state.fetchCharacters);

    const handleFileSelect = async (file: File) => {
        if (!file.name.toLowerCase().endsWith('.psd')) {
            alert('Please drop a valid .psd file.');
            return;
        }

        const formData = new FormData();
        formData.append('file', file);

        setIsUploading(true);
        setUploadText(`Uploading ${file.name}...`);
        setUploadProgress(0);

        try {
            await axios.post(`${API_BASE}/upload-psd/`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                onUploadProgress: (progressEvent) => {
                    const percentCompleted = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 1));
                    setUploadProgress(percentCompleted);
                }
            });

            setUploadText("Upload successful! Extracting...");

            // Refresh global state
            await fetchCharacters();
            alert("Character extracted and added to the list!");
        } catch (err: any) {
            console.error("Upload error:", err);
            alert(err.response?.data?.detail || err.message || 'Upload failed');
        } finally {
            setIsUploading(false);
            setUploadProgress(0);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFileSelect(e.dataTransfer.files[0]);
            e.dataTransfer.clearData();
        }
    };

    return (
        <div
            className={`rounded-xl p-6 text-center cursor-pointer relative overflow-hidden transition-all duration-300 ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}
            style={{
                background: isDragOver ? 'rgba(99,102,241,0.06)' : 'var(--surface-card)',
                border: isDragOver ? '2px dashed var(--accent-500)' : '2px dashed var(--border-strong)',
                boxShadow: isDragOver ? 'var(--shadow-glow)' : 'none',
                transform: isDragOver ? 'scale(1.01)' : 'scale(1)',
            }}
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={(e) => { e.preventDefault(); setIsDragOver(false); }}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
        >
            <input
                type="file"
                ref={fileInputRef}
                onChange={(e) => e.target.files && handleFileSelect(e.target.files[0])}
                accept=".psd"
                className="hidden"
            />

            {isDragOver && (
                <div className="absolute inset-0 pointer-events-none opacity-10"
                    style={{ background: 'radial-gradient(circle at center, var(--accent-500), transparent 70%)' }} />
            )}

            {isUploading ? (
                <div className="flex flex-col items-center gap-3">
                    <div className="relative">
                        <Loader2 className="w-8 h-8 animate-spin-smooth" style={{ color: 'var(--accent-400)' }} />
                        {uploadProgress > 0 && (
                            <svg className="absolute inset-0 w-8 h-8 -rotate-90" viewBox="0 0 36 36">
                                <circle cx="18" cy="18" r="16" fill="none" stroke="currentColor" strokeWidth="3"
                                    style={{ color: 'var(--accent-500)' }} strokeDasharray={`${uploadProgress}, 100`} />
                            </svg>
                        )}
                    </div>
                    <div className="flex flex-col items-center gap-1">
                        <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>{uploadText}</p>
                        {uploadProgress > 0 && (
                            <p className="text-xs font-semibold gradient-text">{uploadProgress}%</p>
                        )}
                    </div>
                </div>
            ) : (
                <div className="flex flex-col items-center gap-3">
                    <div className={`transition-transform duration-300 ${isDragOver ? 'scale-110 -translate-y-1' : ''}`}>
                        {isDragOver ? (
                            <FileVideo className="w-8 h-8" style={{ color: 'var(--accent-400)' }} />
                        ) : (
                            <UploadCloud className="w-8 h-8" style={{ color: 'var(--text-muted)' }} />
                        )}
                    </div>
                    <div className="flex flex-col items-center gap-1">
                        <h3 className="text-base font-semibold" style={{ color: isDragOver ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                            {isDragOver ? 'Drop to Upload' : 'Upload PSD'}
                        </h3>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            {isDragOver ? 'Release to start uploading' : 'Drag & Drop your .psd file here'}
                        </p>
                    </div>
                    {isDragOver && (
                        <div className="flex items-center gap-3 text-xs mt-1" style={{ color: 'var(--accent-400)' }}>
                            <span>✓ Auto-extract layers</span>
                            <span>✓ Add to library</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default UploadModule;
