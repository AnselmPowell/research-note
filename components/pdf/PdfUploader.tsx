import React, { useState, useCallback } from 'react';
import { Upload, Link, FileUp, Plus } from 'lucide-react';

interface PdfUploaderProps {
    onFileChange: (file: File) => void;
    onUrlSubmit: (url: string) => void;
    error?: string | null;
}

const PdfUploader: React.FC<PdfUploaderProps> = ({ onFileChange, onUrlSubmit, error }) => {
    const [isDragging, setIsDragging] = useState(false);
    const [url, setUrl] = useState('');

    const handleFileSelect = (files: FileList | null) => {
        if (files && files[0] && files[0].type === 'application/pdf') {
            onFileChange(files[0]);
        }
    };

    const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
    }, []);

    const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        handleFileSelect(e.dataTransfer.files);
    }, [onFileChange]);

    const handleUrlFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        onUrlSubmit(url);
    };

    return (
        <div className="w-full max-w-md mx-auto flex flex-col items-center animate-fade-in">


            {/* Dropzone */}
            <div
                className={`relative group w-full h-50 border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all duration-300 opacity-20 hover:opacity-100
                    ${isDragging
                        ? 'border-scholar-500 bg-scholar-50/50 dark:bg-scholar-900/20 scale-[1.02]'
                        : 'border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-gray-800/50  hover:border-scholar-300 dark:hover:border-scholar-700 hover:bg-white dark:hover:bg-gray-800'
                    }`}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => document.getElementById('file-upload')?.click()}
            >
                <div className="text-center mb-8">
                    <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-4  transform ">
                        <FileUp size={48} className="text-gray-500 dark:text-gray-500 " />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Upload Research</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                        Add PDF documents to your workspace .
                    </p>
                    <p className="text-xs text-gray-400 mt-1">or drag and drop</p>
                </div>

                <input
                    id="file-upload"
                    type="file"
                    className="hidden"
                    accept=".pdf"
                    onChange={(e) => handleFileSelect(e.target.files)}
                />
            </div>

            <div className="relative w-full py-6 flex items-center justify-center">
                <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-200 dark:border-gray-700"></div>
                </div>
                <div className="relative bg-cream dark:bg-dark-bg px-3 text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Or import via URL
                </div>
            </div>

            {/* URL Input */}
            <form onSubmit={handleUrlFormSubmit} className="w-full relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Link size={16} className="text-gray-400" />
                </div>
                <input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://arxiv.org/pdf/..."
                    className={`w-full pl-10 pr-12 py-3 bg-white dark:bg-gray-800 border ${error ? 'border-red-300 dark:border-red-900 focus:ring-red-200' : 'border-gray-200 dark:border-gray-700 focus:ring-scholar-500/20'} rounded-xl text-sm focus:outline-none focus:ring-2 focus:border-scholar-500 transition-all text-gray-900 dark:text-white placeholder-gray-400`}
                    required
                />
                <button
                    type="submit"
                    disabled={!url.trim()}
                    className="absolute right-1.5 top-1.5 p-1.5 bg-scholar-600 text-white rounded-lg hover:bg-scholar-700 disabled:opacity-50 disabled:hover:bg-scholar-600 transition-colors shadow-sm"
                >
                    <Plus size={18} />
                </button>
            </form>

            {error && (
                <div className="md:absolute top-full left-0 right-0 mt-2 text-center animate-fade-in">
                    <div className="inline-block px-3 py-1.5 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20 rounded-lg text-xs font-medium text-red-600 dark:text-red-400">
                        {error}
                    </div>
                </div>
            )}
        </div>
    );
};

export default PdfUploader;