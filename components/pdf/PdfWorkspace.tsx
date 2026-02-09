
import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as pdfjsLibWeb from 'pdfjs-dist';
import { PdfViewer } from './PdfViewer';
import PdfUploader from './PdfUploader';
import { X, FileText, Loader2, Plus, ChevronDown, Upload, Link as LinkIcon, ArrowRight } from 'lucide-react';
import { useLibrary } from '../../contexts/LibraryContext';
import { useUI } from '../../contexts/UIContext';

// Configure worker
pdfjsLibWeb.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs';

type PDFDocumentProxy = any;
type MapEntry = { itemIndex: number; charInItemIndex: number };
interface PageTextIndex { combinedText: string; charToItemMap: (MapEntry | null)[]; }
interface SearchResult { startPageIndex: number; startCharIndex: number; endPageIndex: number; endCharIndex: number; }

interface InternalPdf {
    id: string;
    file: File;
    doc: PDFDocumentProxy;
    numPages: number;
    currentPage: number;
    zoomLevel: number;
}

const TabBar = ({ internalPdfs, activePdfUri, onTabChange, onClosePdf, onAddClick, isVisible }: {
    internalPdfs: InternalPdf[],
    activePdfUri: string | null,
    onTabChange: (id: string) => void,
    onClosePdf: (id: string) => void,
    onAddClick: (e: React.MouseEvent) => void,
    isVisible: boolean
}) => (
    <div className={`w-full max-w-5xl px-4 pt-2 transition-all duration-300 transform origin-top z-30 bg-cream dark:bg-dark-bg ${isVisible ? 'translate-y-0 opacity-100 relative' : '-translate-y-full opacity-0 pointer-events-none absolute top-0'}`}>
        <div className="flex items-center border-b border-gray-300 dark:border-gray-700 overflow-x-auto no-scrollbar">
            {internalPdfs.map(pdf => (
                <div key={pdf.id} onClick={() => onTabChange(pdf.id)} className={`flex items-center cursor-pointer px-4 py-2 border-b-2 -mb-px whitespace-nowrap ${activePdfUri === pdf.id ? 'border-scholar-600 text-scholar-600 dark:text-scholar-400 dark:border-scholar-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}>
                    <FileText size={14} className="mr-2 opacity-70" />
                    <span className="text-sm font-medium truncate max-w-[150px]">{pdf.file.name}</span>
                    <button onClick={(e) => { e.stopPropagation(); onClosePdf(pdf.id); }} className="ml-2 p-0.5 rounded-full text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"><X className="w-3 h-3" /></button>
                </div>
            ))}
            <button onClick={onAddClick} className="flex-shrink-0 flex items-center ml-2 px-3 py-1.5 text-xs text-gray-500 bg-gray-100 rounded-md hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 transition-colors">
                <Plus className="w-3 h-3 mr-1" />Add
            </button>
        </div>
    </div>
);

/**
 * HELPER FUNCTION: Builds a PageTextIndex (combinedText + charToItemMap) from textContent.items
 * This is the same index format that applyHighlights() consumes
 * 
 * Extracted from the existing performSearch() indexing loop so both
 * performSearch and performNoteSearch can reuse it
 */
function buildPageTextIndex(items: any[]): PageTextIndex {
    let combinedText = '';
    const charToItemMap: (MapEntry | null)[] = [];
    let lastItem: any = null;

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const originalItemIndex = i;

        if (lastItem) {
            const lastY = lastItem.transform[5];
            const currentY = item.transform[5];
            const lastXEnd = lastItem.transform[4] + (lastItem.width || 0);
            const currentX = item.transform[4];
            const lineHeight = lastItem.height || 10;

            // Check for significant vertical movement (new line)
            const isNewLine = Math.abs(currentY - lastY) > lineHeight * 0.4;

            // Check for horizontal gap (more than ~1.5 average chars)
            // Average char width estimate
            const charWidth = lastItem.width / (lastItem.str.length || 1) || 5;
            const isHorizontalGap = currentX > lastXEnd + (charWidth * 0.5);

            if (isNewLine) {
                // Remove trailing hyphen if it exists at line end
                if (combinedText.endsWith('-')) {
                    combinedText = combinedText.slice(0, -1);
                    charToItemMap.pop();
                } else {
                    combinedText += ' ';
                    charToItemMap.push(null);
                }
            } else if (isHorizontalGap) {
                combinedText += ' ';
                charToItemMap.push(null);
            }
        }

        for (let k = 0; k < item.str.length; k++) {
            charToItemMap.push({ itemIndex: originalItemIndex, charInItemIndex: k });
        }
        combinedText += item.str;
        lastItem = item;
    }

    return { combinedText, charToItemMap };
}

/**
 * BRIDGE FUNCTION: Converts fuzzy match results into SearchResult format
 * that applyHighlights() already understands
 * 
 * Maps from word-level matches (itemIndex + charStart/End) to character positions
 * in the combinedText string using the charToItemMap
 */
function convertMatchToSearchResult(
    match: import('../../services/fuzzyPdfSearch').MatchResult,
    pageIndex: number,
    pageTextIndex: PageTextIndex
): SearchResult {
    const { matchedWords } = match;

    if (matchedWords.length === 0) {
        // Fallback: no highlighting
        return {
            startPageIndex: pageIndex,
            startCharIndex: 0,
            endPageIndex: pageIndex,
            endCharIndex: 0,
        };
    }

    // Find the character positions in combinedText that correspond to:
    // - First matched word's start
    // - Last matched word's end

    const firstWord = matchedWords[0];
    const lastWord = matchedWords[matchedWords.length - 1];

    let startCharIndex = -1;
    let endCharIndex = -1;

    // Walk the charToItemMap to find where these words appear in combinedText
    for (let i = 0; i < pageTextIndex.charToItemMap.length; i++) {
        const entry = pageTextIndex.charToItemMap[i];
        if (!entry) continue;

        // Find start: first character of the first matched word
        if (startCharIndex === -1 &&
            entry.itemIndex === firstWord.itemIndex &&
            entry.charInItemIndex === firstWord.charStart) {
            startCharIndex = i;
        }

        // Find end: last character of the last matched word
        // (charEnd is exclusive, so last char is charEnd - 1)
        if (entry.itemIndex === lastWord.itemIndex &&
            entry.charInItemIndex === lastWord.charEnd - 1) {
            endCharIndex = i + 1; // +1 because SearchResult endCharIndex is exclusive
        }
    }

    // Safety fallback: if we couldn't map precisely, highlight all matched item indices
    if (startCharIndex === -1 || endCharIndex === -1) {
        const allItemIndices = new Set(matchedWords.map(w => w.itemIndex));

        startCharIndex = -1;
        endCharIndex = -1;

        for (let i = 0; i < pageTextIndex.charToItemMap.length; i++) {
            const entry = pageTextIndex.charToItemMap[i];
            if (!entry) continue;

            if (allItemIndices.has(entry.itemIndex)) {
                if (startCharIndex === -1) startCharIndex = i;
                endCharIndex = i + 1;
            }
        }
    }

    // Final safety: if still nothing, return empty range
    if (startCharIndex === -1) startCharIndex = 0;
    if (endCharIndex === -1) endCharIndex = 0;

    return {
        startPageIndex: pageIndex,
        startCharIndex,
        endPageIndex: pageIndex,
        endCharIndex,
    };
}

export const PdfWorkspace: React.FC = () => {
    const { loadedPdfs, activePdfUri, loadPdfFromUrl, addPdfFile, removePdf, setActivePdf, searchHighlight, setSearchHighlight, failedUrlErrors } = useLibrary();

    const [internalPdfs, setInternalPdfs] = useState<InternalPdf[]>([]);
    const [pdfjsLib, setPdfjsLib] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isUiVisible, setIsUiVisible] = useState(true);

    // Add Menu state
    const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
    const [addMenuCoords, setAddMenuCoords] = useState<{ left: number; top: number } | null>(null);
    const [showUrlInput, setShowUrlInput] = useState(false);
    const [urlInputValue, setUrlInputValue] = useState('');
    const addMenuRef = useRef<HTMLDivElement>(null);

    // Search state
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
    const [activeResultIndex, setActiveResultIndex] = useState<number | null>(null);
    const [isIndexing, setIsIndexing] = useState(false);
    const documentTextIndexCache = useRef<PageTextIndex[] | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const activePdf = internalPdfs.find(p => p.id === activePdfUri) || null;
    const isNewPdfLoading = activePdfUri !== null && !internalPdfs.some(p => p.id === activePdfUri);

    useEffect(() => { setPdfjsLib(pdfjsLibWeb); }, []);

    useEffect(() => {
        if (!pdfjsLib) return;
        const syncPdfs = async () => {
            const currentIds = new Set(internalPdfs.map(p => p.id));
            const contextIds = new Set(loadedPdfs.map(p => p.uri));
            const toAdd = loadedPdfs.filter(p => !currentIds.has(p.uri));

            const keptPdfs = internalPdfs.filter(p => contextIds.has(p.id));

            let newInternalPdfs: InternalPdf[] = [];
            for (const p of toAdd) {
                try {
                    const loadingTask = pdfjsLib.getDocument({ data: p.data.slice(0) });
                    const doc = await loadingTask.promise;
                    newInternalPdfs.push({ id: p.uri, file: p.file, doc: doc, numPages: doc.numPages, currentPage: 1, zoomLevel: 1.0 });
                } catch (err) {
                    // PDF loading failed - silently skip
                }
            }

            if (keptPdfs.length !== internalPdfs.length || newInternalPdfs.length > 0) {
                setInternalPdfs([...keptPdfs, ...newInternalPdfs]);
            }
        };
        syncPdfs();
    }, [loadedPdfs, pdfjsLib, internalPdfs.length]);

    const resetSearchState = () => {
        setSearchQuery(''); setSearchResults([]); setActiveResultIndex(null); documentTextIndexCache.current = null;
    }

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            setIsLoading(true);
            addPdfFile(file).finally(() => {
                setIsLoading(false);
                setIsAddMenuOpen(false);
            });
        }
        if (event.target) event.target.value = '';
    };

    const [uploadError, setUploadError] = useState<string | null>(null);

    const handleUrlSubmit = async (url: string) => {
        if (internalPdfs.length >= 10) { alert('Limit of open PDFs reached.'); return; }
        setUploadError(null);
        setIsLoading(true);
        const result = await loadPdfFromUrl(url);
        setIsLoading(false);
        if (result.success) {
            setIsAddMenuOpen(false);
            setShowUrlInput(false);
            setUrlInputValue('');
        } else {
            // Show friendly error inline
            if (result.error) {
                setUploadError(`${result.error.reason}: ${result.error.actionableMsg}`);
            } else {
                setUploadError("Failed to load PDF");
            }
        }
    };

    const handleTabChange = (id: string) => { if (id !== activePdfUri) { setActivePdf(id); resetSearchState(); } }

    const handleClosePdf = (id: string) => {
        removePdf(id);
        resetSearchState();
    };

    const handlePageChange = useCallback((page: number) => {
        setInternalPdfs(prev => prev.map(pdf => pdf.id === activePdfUri ? { ...pdf, currentPage: page } : pdf));
    }, [activePdfUri]);

    const handleZoom = useCallback((direction: 'in' | 'out') => {
        setInternalPdfs(prev => prev.map(pdf => {
            if (pdf.id !== activePdfUri) return pdf;
            const step = 0.25;
            let newZoom = direction === 'in' ? pdf.zoomLevel + step : pdf.zoomLevel - step;
            return { ...pdf, zoomLevel: Math.max(0.25, Math.min(newZoom, 5)) };
        }));
    }, [activePdfUri]);

    const handleScrollActivity = useCallback(() => {
        if (isUiVisible) {
            setIsUiVisible(false);
            setIsAddMenuOpen(false); // Close menu on scroll
        }
    }, [isUiVisible]);

    const openAddMenuAt = (e: React.MouseEvent) => {
        const target = e.currentTarget as HTMLElement | null;
        if (target) {
            const rect = target.getBoundingClientRect();
            // Position menu centered under the button, slightly below
            setAddMenuCoords({ left: rect.left + rect.width / 2, top: rect.bottom + 8 });
        } else {
            setAddMenuCoords(null);
        }
        setShowUrlInput(false);
        setIsAddMenuOpen(prev => !prev);
    };

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
                setIsAddMenuOpen(false);
                setShowUrlInput(false);
            }
        };
        if (isAddMenuOpen) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isAddMenuOpen]);

    const performSearch = useCallback(async (query: string) => {
        if (!activePdf || !query) {
            setSearchResults([]);
            setActiveResultIndex(null);
            return;
        }

        const needsFullIndex = !documentTextIndexCache.current ||
            documentTextIndexCache.current.some((page) => page === null);

        if (needsFullIndex) {
            setIsIndexing(true);
            const textIndex: PageTextIndex[] = [];
            for (let i = 1; i <= activePdf.doc.numPages; i++) {
                const page = await activePdf.doc.getPage(i);
                const textContent = await page.getTextContent();
                textIndex.push(buildPageTextIndex(textContent.items));
            }
            documentTextIndexCache.current = textIndex;
            setIsIndexing(false);
        }

        const index = documentTextIndexCache.current;
        let results: SearchResult[] = [];
        const words = query.trim().split(/\s+/);
        const lowerCaseQuery = query.toLowerCase();

        const fullText = index.map(p => p.combinedText).join('\n');
        const lowerCaseFullText = fullText.toLowerCase();
        const pageStarts = index.map((p, i) => i === 0 ? 0 : index.slice(0, i).reduce((acc, curr) => acc + curr.combinedText.length + 1, 0));

        const findAbsToRel = (absIndex: number) => {
            let pageIndex = pageStarts.findIndex((start, i) => {
                const nextStart = pageStarts[i + 1];
                return absIndex >= start && (nextStart === undefined || absIndex < nextStart);
            });
            if (pageIndex === -1) pageIndex = pageStarts.length - 1;
            const charIndex = absIndex - pageStarts[pageIndex];
            return { pageIndex, charIndex };
        };

        if (words.length > 0 && words.length <= 5) {
            index.forEach((pageIndexData, pageIndex) => {
                const lowerCaseText = pageIndexData.combinedText.toLowerCase();
                let startIndex = 0;
                while ((startIndex = lowerCaseText.indexOf(lowerCaseQuery, startIndex)) !== -1) {
                    results.push({
                        startPageIndex: pageIndex,
                        startCharIndex: startIndex,
                        endPageIndex: pageIndex,
                        endCharIndex: startIndex + query.length,
                    });
                    startIndex += 1;
                }
            });
        }

        if (results.length === 0 && words.length >= 2) {
            if (words.length >= 6) {
                const startPhrase = words.slice(0, 3).join(' ').toLowerCase();
                const endPhrase = words.slice(-3).join(' ').toLowerCase();
                let searchFromIndex = 0;
                let finalStartIdx = -1;
                let finalEndIdx = -1;
                while (searchFromIndex < lowerCaseFullText.length) {
                    const potentialStartIdx = lowerCaseFullText.indexOf(startPhrase, searchFromIndex);
                    if (potentialStartIdx === -1) break;
                    const potentialEndIdx = lowerCaseFullText.indexOf(endPhrase, potentialStartIdx + startPhrase.length);
                    if (potentialEndIdx === -1) break;
                    const interveningStartIdx = lowerCaseFullText.indexOf(startPhrase, potentialStartIdx + 1);
                    if (interveningStartIdx !== -1 && interveningStartIdx < potentialEndIdx) {
                        searchFromIndex = interveningStartIdx;
                    } else {
                        finalStartIdx = potentialStartIdx;
                        finalEndIdx = potentialEndIdx;
                        break;
                    }
                }
                if (finalStartIdx !== -1 && finalEndIdx !== -1) {
                    const startPos = findAbsToRel(finalStartIdx);
                    const endPos = findAbsToRel(finalEndIdx + endPhrase.length);
                    results.push({
                        startPageIndex: startPos.pageIndex, startCharIndex: startPos.charIndex,
                        endPageIndex: endPos.pageIndex, endCharIndex: endPos.charIndex
                    });
                }
            }
            if (results.length === 0 && words.length >= 2) {
                const startPhrase = words.slice(0, 2).join(' ').toLowerCase();
                const startIdx = lowerCaseFullText.indexOf(startPhrase);
                if (startIdx !== -1) {
                    const startPos = findAbsToRel(startIdx);
                    const endPos = findAbsToRel(startIdx + startPhrase.length);
                    results.push({
                        startPageIndex: startPos.pageIndex, startCharIndex: startPos.charIndex,
                        endPageIndex: endPos.pageIndex, endCharIndex: endPos.charIndex
                    });
                }
            }
        }

        setSearchResults(results);
        if (results.length > 0) { setActiveResultIndex(0); handlePageChange(results[0].startPageIndex + 1); }
        return results.length;
    }, [activePdf, handlePageChange]);

    /**
     * NEW: Fuzzy search function for note-to-PDF matching
     * Uses word-level fuzzy matching with OCR tolerance
     * Falls back to page navigation if no match found
     */
    const performNoteSearch = useCallback(async (noteText: string, fallbackPage: number) => {
        if (!activePdf || !noteText) {
            setSearchResults([]);
            setActiveResultIndex(null);
            return false;
        }

        try {
            // Import the fuzzy search logic
            const { fuzzyFindInPage } = await import('../../services/fuzzyPdfSearch');

            // Run the fuzzy search (tries target page, then ±1)
            const result = await fuzzyFindInPage(
                activePdf.doc,
                fallbackPage,
                noteText,
                activePdf.numPages
            );

            // Navigate to the matched (or fallback) page
            handlePageChange(result.pageNumber);

            // If we found a match, build the highlight data
            if (result.match) {
                const pageIndex = result.pageNumber - 1; // Convert to 0-based

                // Get the page's textContent to build the index
                const page = await activePdf.doc.getPage(result.pageNumber);
                const textContent = await page.getTextContent();

                // Build the PageTextIndex for this page
                const pageTextIndex = buildPageTextIndex(textContent.items);

                // Ensure documentTextIndexCache exists (create sparse array if needed)
                if (!documentTextIndexCache.current) {
                    documentTextIndexCache.current = new Array(activePdf.numPages).fill(null);
                }
                // Store this page's index (sparse array is OK - performSearch will rebuild if needed)
                documentTextIndexCache.current[pageIndex] = pageTextIndex;

                // Convert the fuzzy match into a SearchResult
                const searchResult = convertMatchToSearchResult(result.match, pageIndex, pageTextIndex);

                // Set the results so applyHighlights() can render them
                setSearchResults([searchResult]);
                setActiveResultIndex(0);

                return true; // Match found and highlighted
            } else {
                // No match — just navigated to fallback page
                setSearchResults([]);
                setActiveResultIndex(null);
                return false;
            }

        } catch (error) {
            // Fuzzy search failed - fallback to page navigation
            // Fallback: just navigate to the page
            handlePageChange(fallbackPage);
            setSearchResults([]);
            setActiveResultIndex(null);
            return false;
        }
    }, [activePdf, handlePageChange]);

    useEffect(() => {
        if (searchHighlight && activePdf && !isIndexing && !isLoading) {
            const { text, fallbackPage } = searchHighlight;
            setSearchQuery(text); // Still show the text in the search bar

            setTimeout(async () => {
                if (fallbackPage && fallbackPage >= 1 && fallbackPage <= activePdf.numPages) {
                    // Note click: use fuzzy word matching with page knowledge
                    await performNoteSearch(text, fallbackPage);
                } else {
                    // Manual search from search bar: use existing substring search
                    await performSearch(text);
                }
                setSearchHighlight(null);
            }, 400); // Reduced from 500ms since fuzzy search is page-scoped
        }
    }, [searchHighlight, activePdf, isIndexing, isLoading, performSearch, performNoteSearch, setSearchHighlight, handlePageChange]);


    const navigateToResult = useCallback((dir: 'next' | 'prev') => {
        if (!searchResults.length || activeResultIndex === null) return;
        let newIndex = dir === 'next' ? activeResultIndex + 1 : activeResultIndex - 1;
        if (newIndex >= searchResults.length) newIndex = 0; else if (newIndex < 0) newIndex = searchResults.length - 1;
        setActiveResultIndex(newIndex);
        handlePageChange(searchResults[newIndex].startPageIndex + 1);
    }, [searchResults, activeResultIndex, handlePageChange]);

    return (
        <div className={`h-full flex flex-col bg-cream dark:bg-dark-bg text-gray-900 dark:text-gray-100 font-sans group/workspace relative`}>
            <input id="pdf-upload-hidden" type="file" accept="application/pdf" onChange={handleFileChange} ref={fileInputRef} className="hidden" />

            {/* Top Hover Zone */}
            {internalPdfs.length > 0 && (
                <div
                    className={`absolute top-0 left-0 right-0 h-16 z-[40] transition-opacity ${isUiVisible ? 'pointer-events-none opacity-0' : 'pointer-events-auto opacity-100'}`}
                    onMouseEnter={() => setIsUiVisible(true)}
                />
            )}

            {isLoading || isIndexing || (isNewPdfLoading && internalPdfs.length === 0) ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-4"><Loader2 className="w-10 h-10 text-scholar-600 animate-spin" /><p className="text-sm font-medium text-gray-500 dark:text-gray-400">{isIndexing ? 'Indexing...' : 'Preparing document...'}</p></div>
            ) : internalPdfs.length === 0 ? (
                <div className="flex-1 flex items-center justify-center bg-cream dark:bg-dark-bg p-6">
                    <PdfUploader
                        onFileChange={(f) => {
                            setIsLoading(true);
                            addPdfFile(f).finally(() => setIsLoading(false));
                        }}
                        onUrlSubmit={handleUrlSubmit}
                        error={uploadError}
                    />
                </div>
            ) : (
                <>
                    <TabBar
                        internalPdfs={internalPdfs}
                        activePdfUri={activePdfUri}
                        onTabChange={handleTabChange}
                        onClosePdf={handleClosePdf}
                        onAddClick={(e) => openAddMenuAt(e)}
                        isVisible={isUiVisible}
                    />

                    {/* ADD MENU DROPDOWN */}
                    {isAddMenuOpen && (
                        <div
                            ref={addMenuRef}
                            className={`fixed z-[100] w-64 bg-white dark:bg-dark-card rounded-xl shadow-2xl border border-gray-100 dark:border-gray-700 p-2 animate-fade-in transition-all`}
                            style={addMenuCoords ? { left: addMenuCoords.left, top: addMenuCoords.top, transform: 'translateX(-50%)' } as React.CSSProperties : { left: '50%', top: '6rem', transform: 'translateX(-50%)' }}
                        >
                            {showUrlInput ? (
                                <div className="p-2 space-y-2">
                                    <div className="flex items-center justify-between px-1">
                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Enter PDF URL</span>
                                        <button onClick={() => setShowUrlInput(false)} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
                                    </div>
                                    <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-lg px-2 py-1 border border-gray-100 dark:border-gray-700">
                                        <LinkIcon size={14} className="text-gray-400" />
                                        <input
                                            autoFocus
                                            type="url"
                                            value={urlInputValue}
                                            onChange={(e) => setUrlInputValue(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleUrlSubmit(urlInputValue)}
                                            placeholder="https://..."
                                            className="flex-1 bg-transparent text-xs outline-none py-1"
                                        />
                                        <button
                                            onClick={() => handleUrlSubmit(urlInputValue)}
                                            disabled={!urlInputValue.trim()}
                                            className="text-scholar-600 disabled:opacity-30"
                                        >
                                            <ArrowRight size={16} />
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col">
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg text-sm text-gray-700 dark:text-gray-200 transition-colors"
                                    >
                                        <Upload size={18} className="text-scholar-600" />
                                        <div className="text-left">
                                            <div className="font-bold">Upload file</div>
                                            <div className="text-[10px] text-gray-400">From your computer</div>
                                        </div>
                                    </button>
                                    <button
                                        onClick={() => setShowUrlInput(true)}
                                        className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg text-sm text-gray-700 dark:text-gray-200 transition-colors"
                                    >
                                        <LinkIcon size={18} className="text-scholar-600" />
                                        <div className="text-left">
                                            <div className="font-bold">Enter URL</div>
                                            <div className="text-[10px] text-gray-400">Import from web link</div>
                                        </div>
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="flex-1 overflow-hidden relative flex flex-col">
                        {activePdf ? (
                            <PdfViewer
                                pdfDoc={activePdf.doc}
                                pdfjsLib={pdfjsLib}
                                currentPage={activePdf.currentPage}
                                numPages={activePdf.numPages}
                                onPageChange={handlePageChange}
                                onNewFile={() => openAddMenuAt('bottom')}
                                zoomLevel={activePdf.zoomLevel}
                                onZoom={handleZoom}
                                searchQuery={searchQuery}
                                setSearchQuery={setSearchQuery}
                                searchResults={searchResults}
                                activeResultIndex={activeResultIndex}
                                performSearch={performSearch}
                                navigateToResult={navigateToResult}
                                documentTextIndex={documentTextIndexCache.current}
                                onScrollActivity={handleScrollActivity}
                            />
                        ) : isNewPdfLoading ? (
                            <div className="flex-1 flex flex-col items-center justify-center gap-4">
                                <Loader2 className="w-10 h-10 text-scholar-600 animate-spin" />
                                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Preparing document...</p>
                            </div>
                        ) : (
                            <div className="flex-1 flex items-center justify-center text-gray-400">Select a document</div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};
