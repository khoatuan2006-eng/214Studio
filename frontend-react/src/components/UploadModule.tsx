import React, { useRef, useState } from 'react';
import { UploadCloud, Loader2 } from 'lucide-react';
import axios from 'axios';
import { API_BASE, useAppStore } from '../store/useAppStore';

const UploadModule: React.FC = () => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadText, setUploadText] = useState('');

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

        try {
            await axios.post(`${API_BASE}/upload-psd/`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
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
            className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer ${isDragOver ? 'border-indigo-500 bg-indigo-500/10' : 'border-neutral-700 hover:border-indigo-400 hover:bg-neutral-800'
                } ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}
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

            {isUploading ? (
                <div className="flex flex-col items-center gap-2">
                    <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
                    <p className="text-sm font-medium text-neutral-300">{uploadText}</p>
                </div>
            ) : (
                <div className="flex flex-col items-center gap-2">
                    <UploadCloud className="w-8 h-8 text-neutral-400" />
                    <h3 className="text-base font-semibold text-neutral-200">Upload PSD</h3>
                    <p className="text-xs text-neutral-500">Drag & Drop your .psd file here</p>
                </div>
            )}
        </div>
    );
};

export default UploadModule;
