
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
    if (!textItems?.length || !spans?.length) {
        container.innerHTML = '';
        return;
    }

    // Type definitions for the COLUMN-FIRST approach
    type ItemWithIndex = {
        item: any;
        originalIndex: number;
    };

    type ColumnBounds = {
        leftEnd: number;      // Right edge of left column
        rightStart: number;   // Left edge of right column  
        gapStart: number;     // Start of column gap
        gapEnd: number;       // End of column gap
        isTwoColumn: boolean;
    };

    type ColumnLine = {
        y: number;
        tolerance: number;
        items: ItemWithIndex[];
        columnType: 'header' | 'left' | 'right' | 'single';
        leftMost: number;
        rightMost: number;
    };

    // PHASE 1: ULTRA-PRECISE COLUMN BOUNDARY DETECTION
    const detectPreciseColumnBoundary = (textItems: any[]): ColumnBounds => {
        // Get page boundaries
        const allXStarts = textItems.map(item => item.transform[4]);
        const allXEnds = textItems.map(item => item.transform[4] + (item.width || 0));
        const pageLeft = Math.min(...allXStarts);
        const pageRight = Math.max(...allXEnds);
        const pageWidth = pageRight - pageLeft;

        console.log('🔍 PAGE ANALYSIS:', {
            pageLeft: pageLeft.toFixed(1),
            pageRight: pageRight.toFixed(1),
            pageWidth: pageWidth.toFixed(1),
            totalTextItems: textItems.length
        });

        // Ultra-high-resolution density analysis (pixel-perfect)
        const buckets = 1000;
        const bucketWidth = pageWidth / buckets;
        const density = new Array(buckets).fill(0);

        // Fill density histogram - mark ALL pixels occupied by text
        textItems.forEach(item => {
            const itemStart = item.transform[4];
            const itemEnd = itemStart + (item.width || 0);

            const startBucket = Math.floor((itemStart - pageLeft) / bucketWidth);
            const endBucket = Math.floor((itemEnd - pageLeft) / bucketWidth);

            for (let b = Math.max(0, startBucket); b <= Math.min(buckets - 1, endBucket); b++) {
                density[b]++;
            }
        });

        // Find largest continuous gap in center region (20-80% of page)
        const searchStart = Math.floor(buckets * 0.2);
        const searchEnd = Math.floor(buckets * 0.8);

        let bestGapStart = -1;
        let bestGapWidth = 0;
        let currentGapStart = -1;

        for (let i = searchStart; i < searchEnd; i++) {
            if (density[i] === 0) {
                // Empty bucket - continue or start gap
                if (currentGapStart === -1) {
                    currentGapStart = i;
                }
            } else {
                // Non-empty bucket - end current gap if exists
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

        // Handle gap extending to search boundary
        if (currentGapStart !== -1) {
            const gapWidth = searchEnd - currentGapStart;
            if (gapWidth > bestGapWidth) {
                bestGapWidth = gapWidth;
                bestGapStart = currentGapStart;
            }
        }

        // Convert bucket coordinates back to PDF coordinates
        const gapStartX = bestGapStart >= 0 ? pageLeft + (bestGapStart * bucketWidth) : pageLeft + pageWidth * 0.5;
        const gapEndX = bestGapStart >= 0 ? pageLeft + ((bestGapStart + bestGapWidth) * bucketWidth) : pageLeft + pageWidth * 0.5;

        // Define column boundaries
        const leftEnd = gapStartX;
        const rightStart = gapEndX;

        // Validate if this is actually a two-column layout
        const isTwoColumn = validateTwoColumnLayout(leftEnd, rightStart, textItems);

        const result = {
            leftEnd,
            rightStart,
            gapStart: gapStartX,
            gapEnd: gapEndX,
            isTwoColumn
        };

        console.log('📊 COLUMN DETECTION RESULT:', {
            layout: isTwoColumn ? '📖 TWO COLUMN' : '📄 SINGLE COLUMN',
            leftColumnEnd: leftEnd.toFixed(1),
            gapStart: gapStartX.toFixed(1),
            gapEnd: gapEndX.toFixed(1),
            rightColumnStart: rightStart.toFixed(1),
            gapWidth: (gapEndX - gapStartX).toFixed(1),
            bucketAnalysis: {
                bestGapStart,
                bestGapWidth,
                bucketWidth: bucketWidth.toFixed(3)
            }
        });

        return result;
    };

    // PHASE 1.1: Validate Two-Column Hypothesis  
    const validateTwoColumnLayout = (leftBoundary: number, rightBoundary: number, textItems: any[]): boolean => {
        let leftCount = 0, rightCount = 0, spanningCount = 0;

        // Classify items by position relative to boundaries
        textItems.forEach(item => {
            const start = item.transform[4];
            const end = start + (item.width || 0);

            if (end <= leftBoundary + 5) { // Small tolerance
                leftCount++;
            } else if (start >= rightBoundary - 5) {
                rightCount++;
            } else {
                spanningCount++;
            }
        });

        const totalItems = textItems.length;
        const leftPercent = leftCount / totalItems;
        const rightPercent = rightCount / totalItems;
        const spanPercent = spanningCount / totalItems;

        // Valid two-column if:
        // 1. Both columns have substantial content (>15% each)
        // 2. Spanning items are minimal (<20% - headers/titles only)
        // 3. Gap is significant (at least 30 units)
        const hasSubstantialColumns = leftPercent > 0.15 && rightPercent > 0.15;
        const hasMinimalSpanning = spanPercent < 0.2;
        const hasSignificantGap = (rightBoundary - leftBoundary) > 30;

        return hasSubstantialColumns && hasMinimalSpanning && hasSignificantGap;
    };

    // PHASE 2: COLUMN-AWARE ITEM CLASSIFICATION
    const classifyItemsByColumn = (textItems: any[], columnBounds: ColumnBounds): {
        headers: ItemWithIndex[],
        leftItems: ItemWithIndex[],
        rightItems: ItemWithIndex[]
    } => {
        const headers: ItemWithIndex[] = [];
        const leftItems: ItemWithIndex[] = [];
        const rightItems: ItemWithIndex[] = [];

        // Calculate median height for header detection
        const heights = textItems.map(item => item.height || 10);
        const sortedHeights = heights.slice().sort((a, b) => a - b);
        const medianHeight = sortedHeights[Math.floor(sortedHeights.length / 2)];

        const TOLERANCE = 8; // Boundary tolerance

        console.log('🔍 CLASSIFICATION BOUNDARIES:', {
            leftColumnEnd: columnBounds.leftEnd.toFixed(1),
            rightColumnStart: columnBounds.rightStart.toFixed(1),
            tolerance: TOLERANCE,
            medianHeight: medianHeight.toFixed(1)
        });

        textItems.forEach((item, index) => {
            const start = item.transform[4];
            const end = start + (item.width || 0);
            const height = item.height || 10;

            // HEADER DETECTION: Multiple criteria
            const spansColumns = start < columnBounds.leftEnd - 10 && end > columnBounds.rightStart + 10;
            const isLargeFont = height > medianHeight * 1.4;
            const isBold = item.fontName?.toLowerCase().includes('bold');
            const isTitle = item.fontName?.toLowerCase().includes('title') ||
                item.fontName?.toLowerCase().includes('header');
            const isInGap = start >= columnBounds.gapStart - 10 && end <= columnBounds.gapEnd + 10;

            if (spansColumns || isLargeFont || isBold || isTitle || (!columnBounds.isTwoColumn && isInGap)) {
                headers.push({ item, originalIndex: index });
            }
            // LEFT COLUMN: Completely within left boundary - STRICT END DETECTION
            else if (end <= columnBounds.leftEnd + TOLERANCE) {
                leftItems.push({ item, originalIndex: index });
            }
            // RIGHT COLUMN: Starts after right boundary  
            else if (start >= columnBounds.rightStart - TOLERANCE) {
                rightItems.push({ item, originalIndex: index });
            }
            // EDGE CASE: Assign to nearest boundary
            else {
                const distToLeft = Math.abs(end - columnBounds.leftEnd);
                const distToRight = Math.abs(start - columnBounds.rightStart);
                if (distToLeft < distToRight) {
                    leftItems.push({ item, originalIndex: index });
                } else {
                    rightItems.push({ item, originalIndex: index });
                }
            }
        });

        // DETAILED LOGGING: Column classification results
        console.log('📋 COLUMN CLASSIFICATION RESULTS:', {
            headers: headers.length,
            leftColumn: leftItems.length,
            rightColumn: rightItems.length,
            total: textItems.length
        });

        // Helper function to log item details
        const logItemDetails = (item: any, label: string, column: string) => {
            const start = item.transform[4];
            const end = start + (item.width || 0);
            return {
                text: `"${item.str}"`,
                column,
                position: label,
                x_start: start.toFixed(1),
                x_end: end.toFixed(1),
                width: (item.width || 0).toFixed(1),
                y: item.transform[5].toFixed(1)
            };
        };

        // LOG FIRST AND LAST ITEMS OF EACH COLUMN
        if (headers.length > 0) {
            const sortedHeaders = headers.slice().sort((a, b) => b.item.transform[5] - a.item.transform[5]);
            console.log('📄 HEADERS:', {
                first: logItemDetails(sortedHeaders[0].item, 'FIRST', 'HEADER'),
                last: logItemDetails(sortedHeaders[sortedHeaders.length - 1].item, 'LAST', 'HEADER')
            });
        }

        if (leftItems.length > 0) {
            // Sort left items by Y-coordinate (top to bottom)
            const sortedLeft = leftItems.slice().sort((a, b) => b.item.transform[5] - a.item.transform[5]);

            console.log('👈 LEFT COLUMN ITEMS:', {
                count: leftItems.length,
                first: logItemDetails(sortedLeft[0].item, 'FIRST', 'LEFT'),
                last: logItemDetails(sortedLeft[sortedLeft.length - 1].item, 'LAST', 'LEFT')
            });

            // Show first few left items for debugging
            console.log('👈 FIRST 5 LEFT ITEMS:',
                sortedLeft.slice(0, 5).map((item, i) =>
                    logItemDetails(item.item, `#${i + 1}`, 'LEFT')
                )
            );
        }

        if (rightItems.length > 0) {
            // Sort right items by Y-coordinate (top to bottom)  
            const sortedRight = rightItems.slice().sort((a, b) => b.item.transform[5] - a.item.transform[5]);

            console.log('👉 RIGHT COLUMN ITEMS:', {
                count: rightItems.length,
                first: logItemDetails(sortedRight[0].item, 'FIRST', 'RIGHT'),
                last: logItemDetails(sortedRight[sortedRight.length - 1].item, 'LAST', 'RIGHT')
            });

            // Show first few right items for debugging
            console.log('👉 FIRST 5 RIGHT ITEMS:',
                sortedRight.slice(0, 5).map((item, i) =>
                    logItemDetails(item.item, `#${i + 1}`, 'RIGHT')
                )
            );
        }

        return { headers, leftItems, rightItems };
    };

    // PHASE 3: COLUMN-SPECIFIC LINE BUILDING
    const buildLinesWithinColumn = (items: ItemWithIndex[], columnType: 'header' | 'left' | 'right' | 'single'): ColumnLine[] => {
        if (items.length === 0) return [];

        console.log(`🔨 BUILDING LINES FOR ${columnType.toUpperCase()} COLUMN:`, {
            inputItems: items.length,
            firstItem: items[0] ? {
                text: `"${items[0].item.str}"`,
                y: items[0].item.transform[5].toFixed(1),
                x: items[0].item.transform[4].toFixed(1)
            } : 'none'
        });

        // Sort by Y-coordinate first (top to bottom)
        const sortedByY = items.sort((a, b) => b.item.transform[5] - a.item.transform[5]);

        const lines: ColumnLine[] = [];

        sortedByY.forEach(({ item, originalIndex }) => {
            const y = item.transform[5];
            const height = item.height || 10;

            // Find existing line with compatible Y-coordinate
            let targetLine = null;
            let bestDistance = Infinity;

            for (const line of lines) {
                const distance = Math.abs(line.y - y);
                const tolerance = Math.max(height * 0.6, line.tolerance, 4);

                if (distance <= tolerance && distance < bestDistance) {
                    targetLine = line;
                    bestDistance = distance;
                }
            }

            if (targetLine) {
                // Add to existing line
                targetLine.items.push({ item, originalIndex });
                targetLine.tolerance = Math.max(targetLine.tolerance, height * 0.6);

                // Update line boundaries for this column
                const itemStart = item.transform[4];
                const itemEnd = itemStart + (item.width || 0);
                targetLine.leftMost = Math.min(targetLine.leftMost, itemStart);
                targetLine.rightMost = Math.max(targetLine.rightMost, itemEnd);

                console.log(`📎 ADDED TO EXISTING ${columnType.toUpperCase()} LINE:`, {
                    text: `"${item.str}"`,
                    y: y.toFixed(1),
                    lineY: targetLine.y.toFixed(1),
                    distance: distance.toFixed(1),
                    tolerance: targetLine.tolerance.toFixed(1),
                    totalItemsInLine: targetLine.items.length
                });
            } else {
                // Create new line
                const itemStart = item.transform[4];
                const itemEnd = itemStart + (item.width || 0);

                const newLine = {
                    y: y,
                    tolerance: Math.max(height * 0.6, 4),
                    items: [{ item, originalIndex }],
                    columnType: columnType,
                    leftMost: itemStart,
                    rightMost: itemEnd
                };

                lines.push(newLine);

                console.log(`🆕 CREATED NEW ${columnType.toUpperCase()} LINE:`, {
                    text: `"${item.str}"`,
                    y: y.toFixed(1),
                    tolerance: newLine.tolerance.toFixed(1),
                    lineIndex: lines.length - 1
                });
            }
        });

        // Sort items within each line left-to-right
        lines.forEach((line, lineIndex) => {
            line.items.sort((a, b) => a.item.transform[4] - b.item.transform[4]);

            console.log(`📋 ${columnType.toUpperCase()} LINE #${lineIndex}:`, {
                y: line.y.toFixed(1),
                itemCount: line.items.length,
                items: line.items.map(({ item }) => `"${item.str}"`).join(' + '),
                xRange: `${line.leftMost.toFixed(1)} → ${line.rightMost.toFixed(1)}`
            });
        });

        console.log(`✅ ${columnType.toUpperCase()} LINE BUILDING COMPLETE:`, {
            totalLines: lines.length,
            totalItems: items.length
        });

        return lines;
    };

    // PHASE 4: READING ORDER ASSEMBLY
    const assembleReadingOrder = (headerLines: ColumnLine[], leftLines: ColumnLine[], rightLines: ColumnLine[]): ColumnLine[] => {
        // Sort all sections by Y-coordinate (top to bottom)
        const allHeaders = headerLines.sort((a, b) => b.y - a.y);
        const allLefts = leftLines.sort((a, b) => b.y - a.y);
        const allRights = rightLines.sort((a, b) => b.y - a.y);

        // For single column or simple layouts, interleave by Y position
        if (allHeaders.length === 0 && (allLefts.length === 0 || allRights.length === 0)) {
            // Single column layout
            return [...allHeaders, ...allLefts, ...allRights];
        }

        // Two-column layout: Headers first, then left column, then right column
        // This ensures proper column separation for hover effects
        const orderedSections: ColumnLine[] = [];

        // Simple approach: Add all headers first, then left, then right
        // This ensures proper column separation for hover effects
        orderedSections.push(...allHeaders);
        orderedSections.push(...allLefts);
        orderedSections.push(...allRights);

        return orderedSections;
    };

    // PHASE 5: PRECISE DOM CONSTRUCTION
    const generatePreciseDOM = (orderedLines: ColumnLine[], spans: HTMLElement[]): DocumentFragment => {
        const fragment = document.createDocumentFragment();
        const processedSpans = new Set<HTMLElement>();

        console.log('🏗️ GENERATING DOM STRUCTURE:', {
            totalLines: orderedLines.length,
            lineTypes: orderedLines.map(line => `${line.columnType}(${line.items.length})`).join(', ')
        });

        orderedLines.forEach((line, index) => {
            const groupWrapper = document.createElement('div');
            groupWrapper.className = 'structural-item';

            // Add column-specific classes for debugging/styling
            if (line.columnType === 'header') {
                groupWrapper.classList.add('header-line');
            } else if (line.columnType === 'left') {
                groupWrapper.classList.add('left-column-line');
            } else if (line.columnType === 'right') {
                groupWrapper.classList.add('right-column-line');
            } else if (line.columnType === 'single') {
                groupWrapper.classList.add('single-column-line');
            }

            console.log(`🔧 DOM GROUP #${index} (${line.columnType.toUpperCase()}):`, {
                y: line.y.toFixed(1),
                itemCount: line.items.length,
                texts: line.items.map(({ item }) => `"${item.str}"`),
                xRange: `${line.leftMost.toFixed(1)} → ${line.rightMost.toFixed(1)}`,
                className: groupWrapper.className
            });

            // Items are already sorted left-to-right within line
            // BUT we need to add spaces between different Y-coordinates (visual lines)
            let previousY = null;
            line.items.forEach(({ originalIndex, item }) => {
                const span = spans[originalIndex];
                if (span && !processedSpans.has(span)) {
                    const currentY = item.transform[5];

                    // Add a space if this span is on a different Y-coordinate (different visual line)
                    if (previousY !== null && Math.abs(currentY - previousY) > 2) {
                        const spaceNode = document.createTextNode(' ');
                        groupWrapper.appendChild(spaceNode);
                        console.log(`📝 Added space between lines: Y ${previousY.toFixed(1)} → ${currentY.toFixed(1)}`);
                    }

                    span.style.position = span.style.position || 'absolute';
                    groupWrapper.appendChild(span);
                    processedSpans.add(span);
                    previousY = currentY;
                } else if (!span) {
                    console.warn(`⚠️ Missing span for originalIndex ${originalIndex}`);
                } else {
                    console.warn(`⚠️ Span already processed for originalIndex ${originalIndex}`);
                }
            });

            if (groupWrapper.hasChildNodes()) {
                fragment.appendChild(groupWrapper);
                console.log(`✅ Added DOM group #${index} with ${groupWrapper.children.length} spans`);
            } else {
                console.warn(`⚠️ Empty DOM group #${index} - no children added`);
            }
        });

        // Handle any unprocessed spans
        spans.forEach((span, index) => {
            if (!processedSpans.has(span)) {
                console.warn(`⚠️ Unprocessed span #${index}: "${span.textContent}"`);
                fragment.appendChild(span);
            }
        });

        console.log('✅ DOM GENERATION COMPLETE:', {
            totalGroups: fragment.children.length,
            processedSpans: processedSpans.size,
            totalSpans: spans.length
        });

        return fragment;
    };

    // MAIN EXECUTION: COLUMN-FIRST PIPELINE
    try {
        console.log('🚀 STARTING COLUMN-FIRST PDF TEXT ANALYSIS...');

        // Phase 1: Detect precise column boundaries FIRST
        const columnBounds = detectPreciseColumnBoundary(textItems);

        // Phase 2: Classify items into columns using hard boundaries
        const { headers, leftItems, rightItems } = classifyItemsByColumn(textItems, columnBounds);

        // Phase 3: Build lines within each column separately  
        const headerLines = buildLinesWithinColumn(headers, 'header');
        const leftLines = buildLinesWithinColumn(leftItems, 'left');
        const rightLines = buildLinesWithinColumn(rightItems, 'right');

        console.log('📊 LINE BUILDING RESULTS:', {
            headerLines: headerLines.length,
            leftLines: leftLines.length,
            rightLines: rightLines.length,
            totalStructuralItems: headerLines.length + leftLines.length + rightLines.length
        });

        // Handle single column case
        if (!columnBounds.isTwoColumn) {
            const allItems = [...headers, ...leftItems, ...rightItems];
            const singleLines = buildLinesWithinColumn(allItems, 'single');
            const fragment = generatePreciseDOM(singleLines, spans);

            console.log('✅ SINGLE COLUMN LAYOUT APPLIED:', {
                totalLines: singleLines.length,
                totalItems: allItems.length
            });

            container.innerHTML = '';
            container.appendChild(fragment);
            container.classList.add('structurally-tagged', 'single-column-layout');
            return;
        }

        // Phase 4: Assemble proper reading order
        const orderedLines = assembleReadingOrder(headerLines, leftLines, rightLines);

        // Phase 5: Generate precise DOM with column separation
        const fragment = generatePreciseDOM(orderedLines, spans);

        // Apply to container
        container.innerHTML = '';
        container.appendChild(fragment);

        // CSS classes for styling and debugging
        container.classList.add('structurally-tagged', 'two-column-layout');

        console.log('✅ TWO COLUMN LAYOUT APPLIED:', {
            readingOrder: 'Headers → Left Column → Right Column',
            totalStructuralItems: orderedLines.length,
            finalDomStructure: {
                headerGroups: headerLines.length,
                leftGroups: leftLines.length,
                rightGroups: rightLines.length
            }
        });

        console.log('🎯 PDF TEXT ANALYSIS COMPLETE!');


    } catch (error) {
        console.error('Error in COLUMN-FIRST regroupSpansByVisualLayout:', error);
        // Fallback: just append spans as-is
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

                const itemIndicesToHighlight = new Set<number>();
                for (let i = start; i < end; i++) {
                    const mapEntry = pageTextIndex.charToItemMap[i];
                    if (mapEntry) {
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
