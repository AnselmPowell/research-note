import React, { useState, useMemo, useCallback } from 'react';
import { useDatabase } from '../../database/DatabaseContext';
import { useLibrary } from '../../contexts/LibraryContext';
import { useUI } from '../../contexts/UIContext';
import { FileText, X, Plus, Upload, Link, Search, Loader2, AlertCircle, CheckSquare, Square, Trash2, Check, Brain } from 'lucide-react';

export const SourcesPanel: React.FC = () => {
    const { savedPapers, deletePaper, savePaper } = useDatabase();
    const { setActivePdf, loadPdfFromUrl, addPdfFile, addPdfFileAndReturn, isPdfInContext, togglePdfContext, loadedPdfs, downloadingUris, removePdf } = useLibrary();
    const { openColumn } = useUI();

    const [searchQuery, setSearchQuery] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [uploadMode, setUploadMode] = useState<'search' | 'url' | 'menu'>('search');
    const [urlInput, setUrlInput] = useState('');
    const [showUploadMenu, setShowUploadMenu] = useState(false);

    // Multiple file upload state
    const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number; currentFileName: string } | null>(null);

    // Selection state for bulk operations
    const [selectedPaperUris, setSelectedPaperUris] = useState<string[]>([]);

    // Delete confirmation modal state
    const [deleteModal, setDeleteModal] = useState<{
        isOpen: boolean;
        isBulk: boolean;
        uri?: string;
        title?: string;
        count?: number;
        isProcessing: boolean;
    }>({
        isOpen: false,
        isBulk: false,
        isProcessing: false
    });

    // Show all papers - memoize this computation
    const sourcePapers = useMemo(() =>
        savedPapers,
        [savedPapers]
    );

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



    const handleOpenPaper = useCallback((uri: string, title: string) => {
        setActivePdf(uri);
        openColumn('right');
        loadPdfFromUrl(uri, title).then(result => {
            if (!result.success && result.error) {
                setActivePdf(null);
            }
        });
    }, [loadPdfFromUrl, setActivePdf, openColumn]);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []) as File[];
        if (files.length === 0) return;

        // Validate all files first
        const pdfFiles = files.filter(file => file.type === 'application/pdf');
        const invalidFiles = files.filter(file => file.type !== 'application/pdf');

        if (invalidFiles.length > 0) {
            setUploadError(`${invalidFiles.length} file(s) skipped: Only PDF files are allowed`);
        }

        if (pdfFiles.length === 0) {
            e.target.value = '';
            return;
        }

        if (pdfFiles.length > 8) {
            setUploadError('Maximum 8 files allowed at once');
            e.target.value = '';
            return;
        }

        setIsLoading(true);
        setUploadError(null);

        try {
            // Process files sequentially for better user feedback
            for (let i = 0; i < pdfFiles.length; i++) {
                const file = pdfFiles[i];

                setUploadProgress({
                    current: i + 1,
                    total: pdfFiles.length,
                    currentFileName: file.name
                });

                // Load PDF into memory and get the result directly
                const loadedPdf = await addPdfFileAndReturn(file);

                if (loadedPdf) {
                    // Create paper data using the returned PDF (eliminates stale closure issue)
                    const paperData = {
                        uri: loadedPdf.uri,
                        pdfUri: loadedPdf.uri,
                        title: loadedPdf.metadata?.title || file.name.replace('.pdf', ''),
                        authors: loadedPdf.metadata?.author ? [loadedPdf.metadata.author] : [],
                        abstract: loadedPdf.metadata?.subject || '',
                        summary: loadedPdf.metadata?.subject || '',
                        publishedDate: loadedPdf.metadata?.publishedDate || null,
                        harvardReference: loadedPdf.metadata?.harvardReference || null,
                        publisher: loadedPdf.metadata?.publisher || null,
                        categories: [],
                        numPages: loadedPdf.numPages
                    };

                    // Save to database/localStorage
                    await savePaper(paperData);

                    // FIXED: Also add to AgentResearcher context for consistency
                    togglePdfContext(paperData.uri, paperData.title);
                }
            }

            setUploadMode('search');
            setShowUploadMenu(false);
            setUploadProgress(null);
        } catch (error) {
            console.error('[SourcesPanel] File upload failed:', error);
            setUploadError(`Failed to upload ${uploadProgress?.currentFileName || 'file'}`);
            setUploadProgress(null);
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
            if (result.success && result.pdf) {
                // Use the PDF object directly from the result (eliminates stale closure issue)
                const loadedPdf = result.pdf;

                // Create paper data using the returned PDF
                const paperData = {
                    uri: loadedPdf.uri,
                    pdfUri: loadedPdf.uri,
                    title: loadedPdf.metadata?.title || 'Untitled Document',
                    authors: loadedPdf.metadata?.author ? [loadedPdf.metadata.author] : [],
                    abstract: loadedPdf.metadata?.subject || '',
                    summary: loadedPdf.metadata?.subject || '',
                    publishedDate: loadedPdf.metadata?.publishedDate || null,
                    harvardReference: loadedPdf.metadata?.harvardReference || null,
                    publisher: loadedPdf.metadata?.publisher || null,
                    categories: [],
                    numPages: loadedPdf.numPages
                };

                // Save to database/localStorage
                await savePaper(paperData);

                // FIXED: Also add to AgentResearcher context for consistency
                togglePdfContext(paperData.uri, paperData.title);

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

    const handleRemovePaper = (uri: string, title: string) => {
        setDeleteModal({
            isOpen: true,
            isBulk: false,
            uri,
            title,
            isProcessing: false
        });
    };

    const handleConfirmDelete = async () => {
        setDeleteModal(prev => ({ ...prev, isProcessing: true }));
        try {
            if (deleteModal.isBulk) {
                // Bulk delete
                for (const uri of selectedPaperUris) {
                    await deletePaper(uri);
                    const isLoaded = loadedPdfs.some(p => p.uri === uri);
                    if (isLoaded) {
                        removePdf(uri);
                    }
                }
                setSelectedPaperUris([]);
            } else {
                // Single delete
                if (deleteModal.uri) {
                    await deletePaper(deleteModal.uri);
                    const isLoaded = loadedPdfs.some(p => p.uri === deleteModal.uri);
                    if (isLoaded) {
                        removePdf(deleteModal.uri);
                    }
                    setSelectedPaperUris(prev => prev.filter(u => u !== deleteModal.uri));
                }
            }
        } catch (error) {
            console.error('[SourcesPanel] Delete failed:', error);
        } finally {
            setDeleteModal({
                isOpen: false,
                isBulk: false,
                isProcessing: false
            });
        }
    };

    const handleSelectAll = useCallback(() => {
        const allSelected = selectedPaperUris.length === filteredPapers.length && selectedPaperUris.length > 0;

        if (allSelected) {
            // Deselect all: Remove from selection and AI context
            setSelectedPaperUris([]);
            for (const paper of filteredPapers) {
                if (isPdfInContext(paper.uri)) {
                    togglePdfContext(paper.uri, paper.title);
                }
            }
        } else {
            // Select all: Add ALL filtered papers to selection
            setSelectedPaperUris(filteredPapers.map(p => p.uri));
            
            // Add already-loaded papers to AI context
            for (const paper of filteredPapers) {
                const isLoaded = loadedPdfs.some(p => p.uri === paper.uri);
                if (isLoaded && !isPdfInContext(paper.uri)) {
                    togglePdfContext(paper.uri, paper.title);
                }
            }
        }
    }, [selectedPaperUris.length, filteredPapers, loadedPdfs, isPdfInContext, togglePdfContext]);

    const handleToggleSelect = useCallback(async (uri: string, title: string) => {
        const isCurrentlySelected = selectedPaperUris.includes(uri);

        if (isCurrentlySelected) {
            // Unchecking: Remove from both selection and AI context
            setSelectedPaperUris(prev => prev.filter(u => u !== uri));
            if (isPdfInContext(uri)) {
                togglePdfContext(uri, title);
            }
        } else {
            // Checking: Add to selection and AI context
            setSelectedPaperUris(prev => [...prev, uri]);

            // Ensure PDF is loaded before adding to context
            const isLoaded = loadedPdfs.some(p => p.uri === uri);
            if (!isLoaded) {
                const result = await loadPdfFromUrl(uri, title);
                if (result && !result.success) {
                    // If loading failed, don't add to selection
                    setSelectedPaperUris(prev => prev.filter(u => u !== uri));
                    return;
                }
            }

            // Add to AI context
            if (!isPdfInContext(uri)) {
                togglePdfContext(uri, title);
            }
        }
    }, [selectedPaperUris, isPdfInContext, togglePdfContext, loadedPdfs, loadPdfFromUrl]);

    const handleBulkDelete = () => {
        if (selectedPaperUris.length === 0) return;

        setDeleteModal({
            isOpen: true,
            isBulk: true,
            count: selectedPaperUris.length,
            isProcessing: false
        });
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
                                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Upload from computer (max 8)</span>
                                                <input
                                                    type="file"
                                                    accept="application/pdf"
                                                    multiple
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

                {/* Upload Progress - Simplified and Mobile Friendly */}
                {(uploadProgress || (isLoading && uploadMode === 'url')) && (
                    <div className="bg-scholar-50 dark:bg-scholar-900/30 border border-scholar-100 dark:border-scholar-800 rounded-lg p-2 text-xs mb-2">
                        <div className="flex items-center gap-2">
                            <Loader2 size={12} className="animate-spin text-scholar-600 dark:text-scholar-400 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                                {uploadProgress ? (
                                    <>
                                        <div className="text-scholar-800 dark:text-scholar-200 font-medium">
                                            Processing {uploadProgress.current}/{uploadProgress.total}
                                        </div>
                                        <div className="text-scholar-600 dark:text-scholar-400 truncate">
                                            {uploadProgress.currentFileName}
                                        </div>
                                    </>
                                ) : (
                                    <div className="text-scholar-800 dark:text-scholar-200 font-medium">
                                        Loading PDF from URL...
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Error Message */}
                {uploadError && (
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-3 py-2 rounded-lg text-xs">
                        <div className="flex items-start gap-2">
                            <AlertCircle size={12} className="text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                            <span>{uploadError}</span>
                        </div>
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

            {/* Select All Row + Action Bar */}
            {filteredPapers.length > 0 && (
                <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                    <div className="flex items-center justify-between">
                        <button
                            onClick={handleSelectAll}
                            className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 hover:text-scholar-600 transition-colors"
                        >
                            <div className={`w-4 h-4 rounded border-2 transition-colors flex items-center justify-center ${selectedPaperUris.length === filteredPapers.length && selectedPaperUris.length > 0
                                ? 'bg-scholar-600 border-scholar-600'
                                : selectedPaperUris.length > 0
                                    ? 'bg-scholar-600/50 border-scholar-600'
                                    : 'border-gray-400 dark:border-gray-500'
                                }`}>
                                {selectedPaperUris.length === filteredPapers.length && selectedPaperUris.length > 0 ? (
                                    <Check size={10} className="text-white" />
                                ) : selectedPaperUris.length > 0 ? (
                                    <span className="w-1.5 h-0.5 bg-white rounded"></span>
                                ) : null}
                            </div>
                            <span className="font-medium">
                                {selectedPaperUris.length > 0
                                    ? `${selectedPaperUris.length} selected`
                                    : 'Select all'}
                            </span>
                        </button>

                        {selectedPaperUris.length > 0 && (
                            <button
                                onClick={handleBulkDelete}
                                className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                            >
                                <Trash2 size={12} />
                                Delete
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Papers List - Always Accessible */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
                {filteredPapers.length === 0 ? (
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
                            const isInContext = isPdfInContext(paper.uri);
                            const isSelected = selectedPaperUris.includes(paper.uri) || isInContext; // Show as selected if in AI context
                            const isDownloading = downloadingUris.has(paper.uri);
                            return (
                                <div
                                    key={paper.uri}
                                    className={`p-2.5 bg-cream dark:bg-dark-card rounded-lg border transition-all duration-200 group cursor-pointer hover:z-[9999] hover:relative hover:shadow-xl hover:scale-[1.02] ${isSelected
                                        ? 'border-scholar-500 ring-1 ring-scholar-500 shadow-sm '
                                        : isInContext
                                            ? 'border-scholar-300 dark:border-scholar-700'
                                            : 'border-gray-200 dark:border-gray-700 hover:border-scholar-300 dark:hover:border-scholar-700'
                                        }`}
                                    onClick={() => handleOpenPaper(paper.uri, paper.title)}
                                >
                                    <div className="flex items-start gap-2">
                                        <div className="items-center gap-1">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleToggleSelect(paper.uri, paper.title); }}
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

                                            {/* Brain icon: Shows if paper is in AI context */}
                                            {isInContext && (
                                                <Brain size={18} className="text-scholar-600 dark:text-scholar-400 flex-shrink-0" title="Added to AI context" />
                                            )}
                                        </div>

                                        
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

            {/* Delete Confirmation Modal */}
            {deleteModal.isOpen && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-transparent" onClick={() => !deleteModal.isProcessing && setDeleteModal(prev => ({ ...prev, isOpen: false }))} />

                    <div className="relative w-full max-w-sm bg-white dark:bg-gray-900 rounded-xl shadow-2xl ring-1 ring-gray-900/5 dark:ring-white/10 p-6 animate-in fade-in zoom-in-95 duration-200">
                        <div className="text-center mb-6">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                                {deleteModal.isBulk ? 'Remove Sources?' : 'Remove Source?'}
                            </h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                                {deleteModal.isBulk
                                    ? `You're about to remove ${deleteModal.count} ${deleteModal.count === 1 ? 'source' : 'sources'}. This action cannot be undone.`
                                    : `You're about to remove "${deleteModal.title}". This action cannot be undone.`}
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => setDeleteModal(prev => ({ ...prev, isOpen: false }))}
                                disabled={deleteModal.isProcessing}
                                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirmDelete}
                                disabled={deleteModal.isProcessing}
                                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {deleteModal.isProcessing ? <Loader2 size={16} className="animate-spin" /> : null}
                                Remove
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
