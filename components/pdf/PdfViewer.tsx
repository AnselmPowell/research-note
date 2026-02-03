
import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
    ChevronLeft,
    ChevronRight,
    Copy,
    Search,
    ZoomIn,
    ZoomOut,
    File,
    Menu
} from 'lucide-react';

import { LeftArrowIcon, RightArrowIcon, NewFileIcon, CopyIcon, SearchIcon, ZoomInIcon, ZoomOutIcon } from '../ui/icons';

// Define a placeholder type for PDFDocumentProxy to avoid TypeScript errors
type PDFDocumentProxy = any;
type PDFRenderTask = any;

type MapEntry = { itemIndex: number; charInItemIndex: number };
interface PageTextIndex {
    combinedText: string;
    charToItemMap: (MapEntry | null)[];
}
interface SearchResult {
    startPageIndex: number;
    startCharIndex: number;
    endPageIndex: number;
    endCharIndex: number;
}

interface PdfViewerProps {
    pdfDoc: PDFDocumentProxy;
    pdfjsLib: any;
    currentPage: number;
    numPages: number;
    onPageChange: (page: number) => void;
    onNewFile: () => void;
    zoomLevel: number;
    onZoom: (direction: 'in' | 'out') => void;
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    searchResults: SearchResult[];
    activeResultIndex: number | null;
    performSearch: (query: string) => void;
    navigateToResult: (direction: 'next' | 'prev') => void;
    documentTextIndex: PageTextIndex[] | null;
    onScrollActivity?: () => void;
}

const regroupSpansByVisualLayout = (container: HTMLElement, spans: HTMLElement[], textItems: any[]) => {
    // SIMPLIFIED APPROACH: Preserve the original PDF.js span order
    // 
    // KEY INSIGHT: PDF.js already extracts text in the correct reading order for 
    // two-column academic papers. Our previous complex reorganization was BREAKING 
    // this correct order. When the function errored and fell back to appending spans 
    // in their original order, text selection worked correctly!
    //
    // This simplified function:
    // 1. Detects column layout (for informational/debugging purposes)
    // 2. Preserves the original PDF.js order (which is already correct)
    // 3. Adds column markers to spans for potential styling

    if (!textItems?.length || !spans?.length) {
        container.innerHTML = '';
        return;
    }

    // Type for column detection result
    type ColumnBounds = {
        leftEnd: number;
        rightStart: number;
        gapWidth: number;
        isTwoColumn: boolean;
    };

    // Detect column boundaries (for informational purposes)
    const detectColumnLayout = (textItems: any[]): ColumnBounds => {
        const allXStarts = textItems.map(item => item.transform[4]);
        const allXEnds = textItems.map(item => item.transform[4] + (item.width || 0));
        const pageLeft = Math.min(...allXStarts);
        const pageRight = Math.max(...allXEnds);
        const pageWidth = pageRight - pageLeft;

        // Density analysis to find column gap
        const buckets = 100;
        const bucketWidth = pageWidth / buckets;
        const density = new Array(buckets).fill(0);

        textItems.forEach(item => {
            const itemStart = item.transform[4];
            const itemEnd = itemStart + (item.width || 0);
            const startBucket = Math.floor((itemStart - pageLeft) / bucketWidth);
            const endBucket = Math.floor((itemEnd - pageLeft) / bucketWidth);
            for (let b = Math.max(0, startBucket); b <= Math.min(buckets - 1, endBucket); b++) {
                density[b]++;
            }
        });

        // Find largest gap in center region (30-70% of page)
        const searchStart = Math.floor(buckets * 0.3);
        const searchEnd = Math.floor(buckets * 0.7);
        let bestGapStart = -1;
        let bestGapWidth = 0;
        let currentGapStart = -1;

        for (let i = searchStart; i < searchEnd; i++) {
            if (density[i] === 0) {
                if (currentGapStart === -1) currentGapStart = i;
            } else {
                if (currentGapStart !== -1) {
                    const gapWidth = i - currentGapStart;
                    if (gapWidth > bestGapWidth) {
                        bestGapWidth = gapWidth;
                        bestGapStart = currentGapStart;
                    }
                    currentGapStart = -1;
                }
            }
        }

        if (currentGapStart !== -1) {
            const gapWidth = searchEnd - currentGapStart;
            if (gapWidth > bestGapWidth) {
                bestGapWidth = gapWidth;
                bestGapStart = currentGapStart;
            }
        }

        const leftEnd = bestGapStart >= 0 ? pageLeft + (bestGapStart * bucketWidth) : pageLeft + pageWidth * 0.5;
        const rightStart = bestGapStart >= 0 ? pageLeft + ((bestGapStart + bestGapWidth) * bucketWidth) : pageLeft + pageWidth * 0.5;
        const gapWidthPx = rightStart - leftEnd;

        // Validate two-column layout
        let leftCount = 0, rightCount = 0;
        textItems.forEach(item => {
            const x = item.transform[4];
            const end = x + (item.width || 0);
            if (end <= leftEnd + 5) leftCount++;
            else if (x >= rightStart - 5) rightCount++;
        });

        const isTwoColumn =
            leftCount > textItems.length * 0.15 &&
            rightCount > textItems.length * 0.15 &&
            gapWidthPx > 20;

        return { leftEnd, rightStart, gapWidth: gapWidthPx, isTwoColumn };
    };

    try {
        const columnBounds = detectColumnLayout(textItems);

        // CRITICAL: Preserve the original PDF.js span order!
        // PDF.js already provides text in the correct reading order for selection
        container.innerHTML = '';

        // Track Y-coordinate to detect line changes and add spacing
        let previousY: number | null = null;
        let previousSpan: HTMLElement | null = null;
        const LINE_CHANGE_THRESHOLD = 3; // Y difference that indicates a new line

        spans.forEach((span, index) => {
            span.style.position = span.style.position || 'absolute';

            // Get current Y-coordinate from textItems
            const currentY = textItems[index]?.transform[5];

            // If Y-coordinate changed significantly, append a space to the PREVIOUS span
            // This prevents words from being concatenated when selecting multiple lines
            if (previousY !== null && currentY !== undefined && previousSpan) {
                const yDiff = Math.abs(currentY - previousY);
                if (yDiff > LINE_CHANGE_THRESHOLD) {
                    // New line detected - append space to previous span's text
                    previousSpan.textContent = previousSpan.textContent + ' ';
                }
            }
            previousY = currentY;
            previousSpan = span;

            // Add column marker class for debugging/styling (optional)
            if (columnBounds.isTwoColumn && textItems[index]) {
                const x = textItems[index].transform[4];
                const end = x + (textItems[index].width || 0);

                if (end <= columnBounds.leftEnd + 8) {
                    span.classList.add('column-left');
                } else if (x >= columnBounds.rightStart - 8) {
                    span.classList.add('column-right');
                } else {
                    span.classList.add('column-header');
                }
            }

            container.appendChild(span);
        });

        container.classList.add('structurally-tagged',
            columnBounds.isTwoColumn ? 'two-column-layout' : 'single-column-layout'
        );

    } catch (error) {
        console.error('Error in regroupSpansByVisualLayout:', error);
        // Fallback: just append spans as-is (this is actually what works!)
        container.innerHTML = '';
        spans.forEach(span => {
            span.style.position = span.style.position || 'absolute';
            container.appendChild(span);
        });
        container.classList.add('structurally-tagged', 'fallback-layout');
    }
};


const SearchControls: React.FC<Pick<PdfViewerProps, 'searchQuery' | 'setSearchQuery' | 'performSearch' | 'searchResults' | 'activeResultIndex' | 'navigateToResult'>> =
    ({ searchQuery, setSearchQuery, performSearch, searchResults, activeResultIndex, navigateToResult }) => {

        const [showSearch, setShowSearch] = useState(false);

        const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') {
                performSearch(searchQuery);
            }
        };

        useEffect(() => {
            if (searchQuery === '') {
                performSearch('');
            }
        }, [searchQuery, performSearch]);

        return (
            <>
                <button
                    onClick={() => setShowSearch(!showSearch)}
                    className="p-2 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                    title="Search Document"
                >
                    <SearchIcon className="w-5 h-5" />
                </button>
                {showSearch && (
                    <div className="flex items-center space-x-2 border-l border-gray-300 dark:border-gray-600 ml-2 pl-2">
                        <input
                            type="text"
                            placeholder="Search..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={handleSearchKeyDown}
                            className="w-32 sm:w-40 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        {searchResults.length > 0 && activeResultIndex !== null ? (
                            <>
                                <span className="text-gray-600 dark:text-gray-400 text-sm font-medium">
                                    {activeResultIndex + 1} / {searchResults.length}
                                </span>
                                <button
                                    onClick={() => navigateToResult('prev')}
                                    className="p-1 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                                    title="Previous Result"
                                >
                                    <LeftArrowIcon className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => navigateToResult('next')}
                                    className="p-1 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                                    title="Next Result"
                                >
                                    <RightArrowIcon className="w-4 h-4" />
                                </button>
                            </>
                        ) : searchQuery && (
                            <span className="text-gray-500 dark:text-gray-400 text-sm">No results</span>
                        )}
                    </div>
                )}
            </>
        );
    };

export const PdfViewer: React.FC<PdfViewerProps> = (props) => {
    const { pdfDoc, pdfjsLib, currentPage, numPages, onPageChange, onNewFile, zoomLevel, onZoom, searchResults, activeResultIndex, documentTextIndex, onScrollActivity } = props;
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const textLayerRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const renderTaskRef = useRef<PDFRenderTask>(null);
    const [toastMessage, setToastMessage] = useState('');
    const toastTimer = useRef<number | null>(null);
    const textDivsRef = useRef<HTMLElement[]>([]);
    const [isUiVisible, setIsUiVisible] = useState(true);
    const [pageInput, setPageInput] = useState(currentPage.toString());
    const isInteractingWithUi = useRef(false);

    const [selectionDetails, setSelectionDetails] = useState<{
        visible: boolean;
        x: number;
        y: number;
        text: string;
    }>({ visible: false, x: 0, y: 0, text: '' });

    useEffect(() => {
        if (toastMessage) {
            if (toastTimer.current) clearTimeout(toastTimer.current);
            toastTimer.current = window.setTimeout(() => {
                setToastMessage('');
            }, 2000);
        }
        return () => {
            if (toastTimer.current) clearTimeout(toastTimer.current);
        }
    }, [toastMessage]);

    useEffect(() => {
        setPageInput(currentPage.toString());
    }, [currentPage]);

    useEffect(() => {
        const handleMouseUp = () => {
            const selection = window.getSelection();
            const selectedText = selection ? selection.toString().trim() : '';

            if (selectedText && selection && !selection.isCollapsed) {
                const range = selection.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                setSelectionDetails({
                    visible: true,
                    x: rect.left + rect.width / 2,
                    y: rect.top,
                    text: selectedText,
                });
            }
        };

        const handleMouseDown = (event: MouseEvent) => {
            if (selectionDetails.visible) {
                const copyButton = document.getElementById('selection-copy-button');
                if (!copyButton || !copyButton.contains(event.target as Node)) {
                    window.getSelection()?.removeAllRanges();
                    setSelectionDetails({ visible: false, x: 0, y: 0, text: '' });
                }
            }
        };

        const textLayerElement = textLayerRef.current;
        textLayerElement?.addEventListener('mouseup', handleMouseUp);
        document.addEventListener('mousedown', handleMouseDown);

        return () => {
            textLayerElement?.removeEventListener('mouseup', handleMouseUp);
            document.removeEventListener('mousedown', handleMouseDown);
        };
    }, [selectionDetails.visible]);

    useEffect(() => {
        const scrollEl = scrollContainerRef.current;
        if (!scrollEl) return;

        const handleScroll = () => {
            if (isUiVisible && !isInteractingWithUi.current) {
                setIsUiVisible(false);
                if (onScrollActivity) onScrollActivity();
            }
        };

        scrollEl.addEventListener('scroll', handleScroll, { passive: true });
        return () => scrollEl.removeEventListener('scroll', handleScroll);
    }, [isUiVisible, onScrollActivity]);

    const applyHighlights = useCallback(() => {
        if (!textLayerRef.current || !documentTextIndex) return;

        const spans = Array.from(textLayerRef.current.querySelectorAll('span'));
        spans.forEach(span => {
            (span as HTMLElement).classList.remove('search-highlight', 'search-highlight-active');
        });

        const currentPageIndex = currentPage - 1;
        const pageTextIndex = documentTextIndex[currentPageIndex];
        if (!pageTextIndex) return;

        searchResults.forEach((result, index) => {
            if (currentPageIndex >= result.startPageIndex && currentPageIndex <= result.endPageIndex) {
                const isActive = activeResultIndex === index;
                const highlightClass = isActive ? 'search-highlight-active' : 'search-highlight';

                const start = (currentPageIndex === result.startPageIndex) ? result.startCharIndex : 0;
                const end = (currentPageIndex === result.endPageIndex) ? result.endCharIndex : pageTextIndex.combinedText.length;

                // Debug: Show what text is being matched
                const matchedText = pageTextIndex.combinedText.substring(start, end);
                console.log('🔍 SEARCH HIGHLIGHT:', {
                    matchedText: `"${matchedText}"`,
                    charRange: `${start} → ${end}`,
                    isActive
                });

                const itemIndicesToHighlight = new Set<number>();
                for (let i = start; i < end; i++) {
                    const mapEntry = pageTextIndex.charToItemMap[i];
                    if (mapEntry) {
                        itemIndicesToHighlight.add(mapEntry.itemIndex);
                    }
                }

                console.log('🎯 SPANS TO HIGHLIGHT:', {
                    itemIndices: Array.from(itemIndicesToHighlight),
                    textDivsLength: textDivsRef.current.length,
                    spanTexts: Array.from(itemIndicesToHighlight).map(idx => {
                        const span = textDivsRef.current[idx];
                        return span ? `"${span.textContent}"` : `NOT FOUND (idx ${idx} > length ${textDivsRef.current.length})`;
                    })
                });

                itemIndicesToHighlight.forEach(itemIndex => {
                    const span = textDivsRef.current[itemIndex];
                    if (!span) {
                        console.warn(`⚠️ Span not found for itemIndex ${itemIndex} (textDivs length: ${textDivsRef.current.length})`);
                        return;
                    }

                    // Column-aware filtering: Only highlight spans that are in the
                    // same horizontal region (column) as the match start. This prevents
                    // matches from highlighting text in the opposite column on
                    // two-column pages.
                    let shouldHighlight = true;
                    try {
                        const startMapEntry = pageTextIndex.charToItemMap[start];
                        if (startMapEntry) {
                            const startSpan = textDivsRef.current[startMapEntry.itemIndex];
                            if (startSpan) {
                                const startRect = startSpan.getBoundingClientRect();
                                const spanRect = span.getBoundingClientRect();
                                const pageWidth = (textLayerRef.current && textLayerRef.current.clientWidth) || window.innerWidth;
                                // Threshold: allow matches within ~35% of page width from start X
                                const threshold = Math.max(48, pageWidth * 0.35);
                                if (Math.abs(spanRect.left - startRect.left) > threshold) {
                                    shouldHighlight = false;
                                }
                            }
                        }
                    } catch (e) {
                        // If any bounding rect lookup fails, fall back to highlighting
                        shouldHighlight = true;
                    }

                    if (shouldHighlight) {
                        (span as HTMLElement).classList.add(highlightClass);
                    }
                });

                if (isActive) {
                    const firstMapEntry = pageTextIndex.charToItemMap[start];
                    if (firstMapEntry) {
                        const activeSpan = textDivsRef.current[firstMapEntry.itemIndex];
                        activeSpan?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }
            }
        });
    }, [searchResults, activeResultIndex, currentPage, documentTextIndex]);

    useEffect(() => {
        applyHighlights();
    }, [searchResults, activeResultIndex, applyHighlights]);


    useEffect(() => {
        const renderPage = async () => {
            if (!pdfDoc || !canvasRef.current || !textLayerRef.current || !pdfjsLib) return;

            // CRITICAL FIX: Ensure previous render task is completely finished or cancelled
            // before starting a new one on the same canvas.
            if (renderTaskRef.current) {
                renderTaskRef.current.cancel();
                try {
                    // Await the cancellation to complete so canvas ownership is released
                    await renderTaskRef.current.promise;
                } catch (e) {
                    // Ignore expected RenderingCancelledException
                }
            }

            window.getSelection()?.removeAllRanges();
            setSelectionDetails({ visible: false, x: 0, y: 0, text: '' });

            const page = await pdfDoc.getPage(currentPage);
            const canvas = canvasRef.current;
            const textLayer = textLayerRef.current;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            const dpr = window.devicePixelRatio || 1;
            const pageViewport = page.getViewport({ scale: 1 });
            const containerWidth = Math.min(canvas.parentElement?.parentElement?.parentElement?.clientWidth || 800, 1200);
            const baseScale = containerWidth / pageViewport.width;
            const finalScale = baseScale * zoomLevel;

            const scaledViewport = page.getViewport({ scale: finalScale * dpr });
            const cssViewport = page.getViewport({ scale: finalScale });

            canvas.width = scaledViewport.width;
            canvas.height = scaledViewport.height;
            canvas.style.width = `${cssViewport.width}px`;
            canvas.style.height = `${cssViewport.height}px`;

            const renderContext = {
                canvasContext: ctx,
                viewport: scaledViewport,
            };

            const task = page.render(renderContext);
            renderTaskRef.current = task;

            try {
                await task.promise;

                textLayer.innerHTML = '';
                textLayer.style.width = `${cssViewport.width}px`;
                textLayer.style.height = `${cssViewport.height}px`;
                (textLayer as HTMLElement).style.setProperty('--scale-factor', cssViewport.scale.toString());

                const textContent = await page.getTextContent();
                const textDivs: HTMLElement[] = [];
                textDivsRef.current = textDivs;

                const textLayerRenderTask = pdfjsLib.renderTextLayer({
                    textContentSource: textContent,
                    container: textLayer,
                    viewport: cssViewport,
                    textDivs: textDivs,
                } as any);
                if (textLayerRenderTask && textLayerRenderTask.promise) {
                    await textLayerRenderTask.promise;
                }

                if (textContent.items.length > 0) {
                    (textLayer as HTMLElement).classList.add('structurally-tagged');
                    regroupSpansByVisualLayout(textLayer as HTMLElement, textDivs, textContent.items);
                } else {
                    (textLayer as HTMLElement).classList.remove('structurally-tagged');
                }

                applyHighlights();

            } catch (error: any) {
                if (error.name !== 'RenderingCancelledException') {
                    console.error("Error rendering page:", error);
                }
            } finally {
                if (renderTaskRef.current === task) {
                    renderTaskRef.current = null;
                }
            }
        };

        renderPage();
        const handleResize = () => renderPage();
        window.addEventListener('resize', handleResize);
        return () => {
            if (renderTaskRef.current) {
                renderTaskRef.current.cancel();
            }
            window.removeEventListener('resize', handleResize);
        }

    }, [pdfDoc, currentPage, pdfjsLib, zoomLevel, applyHighlights]);

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text).then(() => {
            setToastMessage('Copied to clipboard!');
        }).catch(err => {
            const textArea = document.createElement("textarea");
            textArea.value = text;
            textArea.style.position = "fixed";
            textArea.style.top = "-9999px";
            textArea.style.left = "-9999px";
            textArea.setAttribute("readonly", "");
            document.body.appendChild(textArea);
            textArea.select();
            try {
                const successful = document.execCommand('copy');
                if (successful) setToastMessage('Copied to clipboard!');
                else setToastMessage('Failed to copy text.');
            } catch (e) {
                setToastMessage('Failed to copy text.');
            }
            document.body.removeChild(textArea);
        });
    };

    const handlePageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        if (val === '' || /^\d+$/.test(val)) {
            setPageInput(val);
        }
    };

    const handlePageInputSubmit = () => {
        const newPage = parseInt(pageInput);
        if (!isNaN(newPage) && newPage >= 1 && newPage <= numPages) {
            onPageChange(newPage);
        } else {
            setPageInput(currentPage.toString());
        }
    };

    const handlePageInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            handlePageInputSubmit();
            e.currentTarget.blur();
        }
    };

    return (
        <div className="w-full h-full flex flex-col items-center relative overflow-hidden">
            {selectionDetails.visible && (
                <button
                    id="selection-copy-button"
                    className="selection-copy-button"
                    style={{
                        top: `${selectionDetails.y}px`,
                        left: `${selectionDetails.x}px`,
                    }}
                    onClick={(e) => {
                        e.stopPropagation();
                        copyToClipboard(selectionDetails.text);
                        window.getSelection()?.removeAllRanges();
                        setSelectionDetails({ ...selectionDetails, visible: false });
                    }}
                >
                    <CopyIcon />
                    Copy
                </button>
            )}

            <div
                ref={scrollContainerRef}
                className="flex-grow w-full max-w-5xl p-0 sm:p-4 mb-16 flex justify-center overflow-auto custom-scrollbar"
            >
                <div className="flex-shrink-0">
                    <div className="relative shadow-lg rounded-md my-8">
                        <canvas ref={canvasRef} className="block" />
                        <div
                            ref={textLayerRef}
                            className="textLayer"
                        />
                    </div>
                </div>
            </div>

            {toastMessage && (
                <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-gray-900/80 dark:bg-gray-100/90 text-white dark:text-black px-4 py-2 rounded-full shadow-lg z-[60] text-sm font-medium">
                    {toastMessage}
                </div>
            )}

            <div
                className={`absolute bottom-0 left-0 right-0 h-24 z-[40] transition-opacity ${isUiVisible ? 'pointer-events-none opacity-0' : 'pointer-events-auto opacity-100'}`}
                onMouseEnter={() => setIsUiVisible(true)}
            />

            {!isUiVisible && (
                <button
                    onClick={() => setIsUiVisible(true)}
                    className="sm:hidden fixed bottom-10 right-6 p-3 bg-scholar-600 text-white rounded-full shadow-lg z-[70] animate-fade-in"
                >
                    <Menu size={24} />
                </button>
            )}

            {/* Control hint text when controls are hidden */}
            {!isUiVisible && (
                <div className="fixed bottom-5 w-auto text-lg text-gray-400 dark:text-gray-500 bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm px-3 py-2  dark:border-gray-600/50 animate-fade-in pointer-events-none z-[30]">
                    Hover here for controls
                </div>
            )}

            <div
                className={`fixed bottom-4 w-auto bg-white/80 dark:bg-gray-800/80 backdrop-blur-md rounded-full shadow-xl px-4 py-2 flex items-center justify-center space-x-2 sm:space-x-4 z-[60] transition-all duration-300 transform ${isUiVisible ? 'translate-y-0 opacity-100' : 'translate-y-12 opacity-0 pointer-events-none'}`}
                onMouseEnter={() => { isInteractingWithUi.current = true; }}
                onMouseLeave={() => { isInteractingWithUi.current = false; }}
                onFocus={() => { isInteractingWithUi.current = true; }}
                onBlur={() => { isInteractingWithUi.current = false; }}
            >
                <button
                    onClick={onNewFile}
                    className="p-2 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                    title="Upload New File"
                >
                    <NewFileIcon className="w-5 h-5" />
                </button>
                <div className="flex items-center space-x-2 border-l border-r border-gray-300 dark:border-gray-600 px-2 sm:px-4">
                    <button
                        onClick={() => onPageChange(currentPage - 1)}
                        disabled={currentPage <= 1}
                        className="p-2 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        title="Previous Page"
                    >
                        <LeftArrowIcon className="w-5 h-5" />
                    </button>

                    <div className="flex items-center text-gray-800 dark:text-gray-200 font-medium text-sm tabular-nums min-w-[120px] justify-center">
                        <span className="mr-1">Page</span>
                        <input
                            type="text"
                            value={pageInput}
                            onChange={handlePageInputChange}
                            onKeyDown={handlePageInputKeyDown}
                            onBlur={handlePageInputSubmit}
                            className="w-10 bg-gray-100 dark:bg-gray-700 border-none rounded px-1 text-center focus:ring-2 focus:ring-scholar-500 outline-none transition-all"
                        />
                        <span className="ml-1 whitespace-nowrap">of {numPages}</span>
                    </div>

                    <button
                        onClick={() => onPageChange(currentPage + 1)}
                        disabled={currentPage >= numPages}
                        className="p-2 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        title="Next Page"
                    >
                        <RightArrowIcon className="w-5 h-5" />
                    </button>
                </div>
                <div className="flex items-center space-x-2">
                    <button
                        onClick={() => onZoom('out')}
                        disabled={zoomLevel <= 0.25}
                        className="p-2 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        title="Zoom Out"
                    >
                        <ZoomOutIcon className="w-5 h-5" />
                    </button>
                    <span className="text-gray-800 dark:text-gray-200 font-medium text-sm tabular-nums w-12 text-center">
                        {Math.round(zoomLevel * 100)}%
                    </span>
                    <button
                        onClick={() => onZoom('in')}
                        disabled={zoomLevel >= 5}
                        className="p-2 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        title="Zoom In"
                    >
                        <ZoomInIcon className="w-5 h-5" />
                    </button>
                </div>
                <SearchControls {...props} />
            </div>
        </div>
    );
};
