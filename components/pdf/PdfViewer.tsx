
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
    if (!textItems || textItems.length === 0 || !spans || spans.length === 0) {
        container.innerHTML = '';
        return;
    };
    
    const itemsWithIndices = textItems.map((item, index) => ({ item, index }));
    const xList = itemsWithIndices.map(i => i.item.transform[4]);
    
    let sortedItemsWithIndices = itemsWithIndices;

    if (xList.length > 0) {
        const minX = Math.min(...xList);
        const maxX = Math.max(...itemsWithIndices.map(i => i.item.transform[4] + i.item.width));
        const midX = (minX + maxX) / 2;

        const crossers: typeof itemsWithIndices = [];
        const left: typeof itemsWithIndices = [];
        const right: typeof itemsWithIndices = [];

        itemsWithIndices.forEach(obj => {
            const x = obj.item.transform[4];
            const w = obj.item.width;
            if (x < midX && x + w > midX) {
                crossers.push(obj);
            } else if (x + w <= midX) {
                left.push(obj);
            } else {
                right.push(obj);
            }
        });

        const isTwoColumn = itemsWithIndices.length > 0 && (crossers.length / itemsWithIndices.length) < 0.2;

        const ySorter = (a: any, b: any) => {
            const y1 = a.item.transform[5]; const y2 = b.item.transform[5];
            if (Math.abs(y1 - y2) > 4) return y2 - y1; 
            return a.item.transform[4] - b.item.transform[4];
        };

        if (isTwoColumn) {
             sortedItemsWithIndices = [
                ...crossers.sort(ySorter),
                ...left.sort(ySorter),
                ...right.sort(ySorter)
            ];
        } else {
            sortedItemsWithIndices = itemsWithIndices.sort(ySorter);
        }
    }

    const lines: { y: number; height: number; items: { textItem: any, index: number }[] }[] = [];
    if (sortedItemsWithIndices.length > 0) {
        let currentLine = {
            y: sortedItemsWithIndices[0].item.transform[5],
            height: sortedItemsWithIndices[0].item.height,
            items: [{textItem: sortedItemsWithIndices[0].item, index: sortedItemsWithIndices[0].index}]
        };
        lines.push(currentLine);

        for (let i = 1; i < sortedItemsWithIndices.length; i++) {
            const currentItem = sortedItemsWithIndices[i];
            const lastLine = lines[lines.length - 1];
            const verticalDiff = lastLine.y - currentItem.item.transform[5]; 
            
            if (Math.abs(verticalDiff) < lastLine.height * 0.5) {
                lastLine.items.push({textItem: currentItem.item, index: currentItem.index});
                lastLine.height = Math.max(lastLine.height, currentItem.item.height);
            } else {
                currentLine = {
                    y: currentItem.item.transform[5],
                    height: currentItem.item.height,
                    items: [{textItem: currentItem.item, index: currentItem.index}]
                };
                lines.push(currentLine);
            }
        }
    }
    
    const paragraphs: { items: { textItem: any, index: number }[] }[] = [];
    if (lines.length > 0) {
        let currentParagraph = { items: [...lines[0].items] };
        paragraphs.push(currentParagraph);
        
        for (let i = 1; i < lines.length; i++) {
            const prevLine = lines[i - 1];
            const currentLine = lines[i];
            const verticalGap = prevLine.y - currentLine.y;
            const isParagraphBreak = verticalGap > prevLine.height * 1.5 || verticalGap < -10;

            if (isParagraphBreak) {
                currentParagraph = { items: [...currentLine.items] };
                paragraphs.push(currentParagraph);
            } else {
                currentParagraph.items.push(...currentLine.items);
            }
        }
    }
    
    const fragment = document.createDocumentFragment();
    const processedSpans = new Set<HTMLElement>();

    paragraphs.forEach(paragraph => {
        const groupWrapper = document.createElement('div');
        groupWrapper.className = 'structural-item';
        
        paragraph.items.sort((a, b) => {
            const y1 = a.textItem.transform[5];
            const y2 = b.textItem.transform[5];
            if (Math.abs(y1 - y2) > 2) return y2 - y1;
            return a.textItem.transform[4] - b.textItem.transform[4];
        });

        paragraph.items.forEach(({ index }) => {
            const span = spans[index];
            if (span && !processedSpans.has(span)) {
                groupWrapper.appendChild(span);
                processedSpans.add(span);
            }
        });

        if (groupWrapper.hasChildNodes()) {
            fragment.appendChild(groupWrapper);
        }
    });

    spans.forEach(span => {
        if (!processedSpans.has(span)) {
            fragment.appendChild(span);
        }
    });
    
    container.innerHTML = '';
    container.appendChild(fragment);
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
            if(toastTimer.current) clearTimeout(toastTimer.current);
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
            if (isUiVisible) {
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
                
                const itemIndicesToHighlight = new Set<number>();
                for (let i = start; i < end; i++) {
                    const mapEntry = pageTextIndex.charToItemMap[i];
                    if(mapEntry) {
                        itemIndicesToHighlight.add(mapEntry.itemIndex);
                    }
                }
                
                itemIndicesToHighlight.forEach(itemIndex => {
                    const span = textDivsRef.current[itemIndex];
                    if (span) {
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

            <div className={`fixed bottom-4 w-auto bg-white/80 dark:bg-gray-800/80 backdrop-blur-md rounded-full shadow-xl px-4 py-2 flex items-center justify-center space-x-2 sm:space-x-4 z-[60] transition-all duration-300 transform ${isUiVisible ? 'translate-y-0 opacity-100' : 'translate-y-12 opacity-0 pointer-events-none'}`}>
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
