import React, { useState, useMemo } from 'react';
import { useDatabase } from '../../database/DatabaseContext';
import { useLibrary } from '../../contexts/LibraryContext';
import { useUI } from '../../contexts/UIContext';
import { FileText, X, Plus, Upload, Link, Search, Loader2, AlertCircle, CheckSquare, Square } from 'lucide-react';

export const SourcesPanel: React.FC = () => {
    const { savedPapers, deletePaper } = useDatabase();
    const { setActivePdf, loadPdfFromUrl, addPdfFile, isPdfInContext, togglePdfContext, loadedPdfs, downloadingUris } = useLibrary();
    const { setColumnVisibility } = useUI();

    const [searchQuery, setSearchQuery] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [uploadMode, setUploadMode] = useState<'search' | 'url' | 'menu'>('search');
    const [urlInput, setUrlInput] = useState('');
    const [showUploadMenu, setShowUploadMenu] = useState(false);

    // Only show explicitly saved papers
    const sourcePapers = savedPapers.filter(p => p.is_explicitly_saved);

    // Filter and sort papers based on search query
    const filteredPapers = useMemo(() => {
        if (!searchQuery.trim()) return sourcePapers;

        const query = searchQuery.toLowerCase();
        return sourcePapers
            .map(paper => {
                const titleMatch = paper.title.toLowerCase().includes(query);
                const authorMatch = paper.authors?.some(a => a.toLowerCase().includes(query));
                const score = titleMatch ? 2 : authorMatch ? 1 : 0;
                return { paper, score };
            })
            .filter(({ score }) => score > 0)
            .sort((a, b) => b.score - a.score)
            .map(({ paper }) => paper);
    }, [sourcePapers, searchQuery]);

    const handleToggleButton = async (e: React.MouseEvent, paper: any) => {
        e.stopPropagation();
        const wasSelected = isPdfInContext(paper.uri);

        if (!wasSelected) {
            const isLoaded = loadedPdfs.some(p => p.uri === paper.uri);
            if (!isLoaded) {
                const result = await loadPdfFromUrl(paper.uri, paper.title);
                if (result && !result.success) return;
            }
        }
        togglePdfContext(paper.uri, paper.title);
    };

    const handleOpenPaper = async (uri: string, title: string) => {
        try {
            await loadPdfFromUrl(uri, title);
            setActivePdf(uri);
            setColumnVisibility(prev => ({ ...prev, right: true }));
        } catch (error) {
            console.error('[SourcesPanel] Failed to open paper:', error);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || file.type !== 'application/pdf') return;

        setIsLoading(true);
        setUploadError(null);
        try {
            await addPdfFile(file);
            setUploadMode('search');
            setShowUploadMenu(false);
        } catch (error) {
            console.error('[SourcesPanel] File upload failed:', error);
            setUploadError('Failed to upload file');
        } finally {
            setIsLoading(false);
            e.target.value = ''; // Reset input
        }
    };

    const handleUrlUpload = async () => {
        if (!urlInput.trim()) return;

        setIsLoading(true);
        setUploadError(null);
        try {
            const result = await loadPdfFromUrl(urlInput.trim());
            if (result.success) {
                setUrlInput('');
                setUploadMode('search');
                setShowUploadMenu(false);
            } else if (result.error) {
                setUploadError(`${result.error.reason}: ${result.error.actionableMsg}`);
            }
        } catch (error) {
            console.error('[SourcesPanel] URL upload failed:', error);
            setUploadError('Failed to load PDF from URL');
        } finally {
            setIsLoading(false);
        }
    };

    const handleRemovePaper = async (uri: string, title: string) => {
        if (confirm(`Remove "${title}" from sources?`)) {
            try {
                await deletePaper(uri);
            } catch (error) {
                console.error('[SourcesPanel] Failed to remove paper:', error);
            }
        }
    };

    return (
        <div className="h-full flex flex-col bg-cream dark:bg-dark-card">
            {/* Compact Header with Search/Upload */}
            <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                <div className="flex items-center gap-2 mb-2">
                    {/* Search/URL Input */}
                    {uploadMode === 'url' ? (
                        <div className="flex-1 flex items-center gap-1">
                            <input
                                type="text"
                                value={urlInput}
                                onChange={(e) => setUrlInput(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && handleUrlUpload()}
                                placeholder="Enter PDF URL..."
                                className="flex-1 px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-scholar-500"
                                autoFocus
                            />
                            <button
                                onClick={handleUrlUpload}
                                disabled={!urlInput.trim() || isLoading}
                                className="px-2 py-1.5 bg-scholar-600 text-white rounded text-xs font-medium hover:bg-scholar-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isLoading ? <Loader2 size={12} className="animate-spin" /> : 'Add'}
                            </button>
                            <button
                                onClick={() => { setUploadMode('search'); setUrlInput(''); setUploadError(null); }}
                                className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                            >
                                <X size={14} className="text-gray-500" />
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className="relative flex-1">
                                <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search sources..."
                                    className="w-full pl-7 pr-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-scholar-500"
                                />
                            </div>

                            {/* Add Button with Menu */}
                            <div className="relative">
                                <button
                                    onClick={() => setShowUploadMenu(!showUploadMenu)}
                                    className="p-1.5 bg-scholar-600 hover:bg-scholar-700 text-white rounded transition-colors"
                                    title="Add source"
                                >
                                    <Plus size={16} />
                                </button>

                                {showUploadMenu && (
                                    <>
                                        <div className="fixed inset-0 z-40" onClick={() => setShowUploadMenu(false)} />
                                        <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-1 z-50 animate-fade-in">
                                            <label className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors">
                                                <Upload size={16} className="text-gray-600 dark:text-gray-400" />
                                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Upload from computer</span>
                                                <input
                                                    type="file"
                                                    accept="application/pdf"
                                                    onChange={handleFileUpload}
                                                    className="hidden"
                                                />
                                            </label>
                                            <button
                                                onClick={() => { setUploadMode('url'); setShowUploadMenu(false); }}
                                                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                            >
                                                <Link size={16} className="text-gray-600 dark:text-gray-400" />
                                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Enter URL</span>
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        </>
                    )}
                </div>

                {/* Error Message */}
                {uploadError && (
                    <div className="flex items-start gap-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-xs">
                        <AlertCircle size={12} className="text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                        <span className="text-red-700 dark:text-red-300">{uploadError}</span>
                    </div>
                )}

                {/* Count Badge */}
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    {filteredPapers.length} {filteredPapers.length === 1 ? 'source' : 'sources'}
                    {searchQuery && filteredPapers.length !== sourcePapers.length && (
                        <span className="text-gray-400"> (filtered from {sourcePapers.length})</span>
                    )}
                </div>
            </div>

            {/* Papers List - Scrollable */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
                {isLoading && uploadMode !== 'url' ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 size={24} className="animate-spin text-scholar-600" />
                    </div>
                ) : filteredPapers.length === 0 ? (
                    <div className="text-center py-12 opacity-40">
                        {searchQuery ? (
                            <>
                                <Search size={40} className="mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                                <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">No sources match "{searchQuery}"</p>
                            </>
                        ) : (
                            <>
                                <FileText size={40} className="mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                                <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">No sources yet</p>
                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                                    Click <Plus size={10} className="inline" /> to add
                                </p>
                            </>
                        )}
                    </div>
                ) : (
                    <div className="space-y-2">
                        {filteredPapers.map(paper => {
                            const isSelected = isPdfInContext(paper.uri);
                            const isDownloading = downloadingUris.has(paper.uri);
                            return (
                                <div
                                    key={paper.uri}
                                    className={`p-2.5 bg-white dark:bg-gray-800 rounded-lg border transition-all group cursor-pointer ${isSelected
                                            ? 'border-scholar-500 ring-1 ring-scholar-500 shadow-sm'
                                            : 'border-gray-200 dark:border-gray-700 hover:shadow-md hover:border-scholar-300 dark:hover:border-scholar-700'
                                        }`}
                                    onClick={() => handleOpenPaper(paper.uri, paper.title)}
                                >
                                    <div className="flex items-start gap-2">
                                        <button
                                            onClick={(e) => handleToggleButton(e, paper)}
                                            disabled={isDownloading}
                                            className={`mt-0.5 flex-shrink-0 transition-colors ${isSelected ? 'text-scholar-600 dark:text-scholar-400' : 'text-gray-300 dark:text-gray-600 hover:text-gray-400'
                                                }`}
                                        >
                                            {isDownloading ? (
                                                <Loader2 size={16} className="animate-spin text-scholar-600" />
                                            ) : (
                                                isSelected ? <CheckSquare size={16} /> : <Square size={16} />
                                            )}
                                        </button>

                                        <FileText size={14} className="text-scholar-600 dark:text-scholar-400 mt-0.5 flex-shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-xs font-medium text-gray-900 dark:text-white line-clamp-2 leading-tight mb-1">
                                                {paper.title}
                                            </h3>
                                            {paper.authors && paper.authors.length > 0 && (
                                                <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">
                                                    {paper.authors.slice(0, 2).join(', ')}
                                                    {paper.authors.length > 2 && ' et al.'}
                                                </p>
                                            )}
                                            {paper.num_pages && (
                                                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                                                    {paper.num_pages} pages
                                                </p>
                                            )}
                                        </div>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleRemovePaper(paper.uri, paper.title); }}
                                            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-all flex-shrink-0 text-gray-400 hover:text-red-500"
                                            title="Remove from sources"
                                        >
                                            <X size={14} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};
