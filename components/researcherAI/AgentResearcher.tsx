import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Sparkles, MessageSquareText, X, BookOpenText, Plus, Loader2, FileText, Play, Search, ArrowRight, Library, AlertCircle, ChevronUp, ChevronDown, Trash2, Square } from 'lucide-react';
import { useLibrary } from '../../contexts/LibraryContext';
import { useResearch } from '../../contexts/ResearchContext';
import { useUI } from '../../contexts/UIContext';
import { useDatabase } from '../../database/DatabaseContext';
import { agentService, AgentCitation } from '../../services/agentService';
import { ChatInterface } from './ChatInterface';

// Define Message type to include citations
export interface ChatMessage {
    id: string;
    role: 'user' | 'model';
    text: string;
    timestamp: Date;
    citations?: AgentCitation[];
}

export const AgentResearcher: React.FC = () => {
    // --- STATE ---
    const [activeTool, setActiveTool] = useState<'chat' | 'deep' | null>(null);
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const [isLocked, setIsLocked] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);

    // Deep Research Bar State
    const [isBarExpanded, setIsBarExpanded] = useState(false);
    const [deepQuestions, setDeepQuestions] = useState<string[]>([]);
    const [deepInput, setDeepInput] = useState('');

    // Tag Management & Visibility State
    const [showAllDocs, setShowAllDocs] = useState(false);
    const [isDismissed, setIsDismissed] = useState(false);
    const prevContextCountRef = useRef(0);
    const hasAppendedResultsRef = useRef(false);

    const sidebarRef = useRef<HTMLDivElement>(null);
    const barRef = useRef<HTMLDivElement>(null);
    const fabContainerRef = useRef<HTMLDivElement>(null);

    const prevRightRef = useRef(false);
    const prevAllClosedRef = useRef(false);

    const { savedPapers } = useDatabase();

    const { contextUris, downloadingUris, failedUris, loadedPdfs, isPdfInContext, setActivePdf, loadPdfFromUrl, removePdf, togglePdfContext } = useLibrary();
    const {
        contextNotes,
        performHybridResearch,
        performHybridAnalysis,
        stopDeepResearch,
        researchPhase,
        selectedArxivIds,
        filteredCandidates,
        isDeepResearching,
        arxivKeywords,
        toggleArxivSelection,
        clearArxivSelection,
        setActiveSearchMode,
        addToPaperResults,
        deepResearchResults,
        uploadedPaperStatuses,
        processedPdfs,
        searchState,
        selectedWebSourceUris
    } = useResearch();

    const { columnVisibility, setColumnVisibility, openColumn, setLibraryActiveView } = useUI();

    // Unified loading state: ArXiv Loading OR PDF Loading
    const isDeepResearchLoading = (researchPhase !== 'idle' && researchPhase !== 'completed' && researchPhase !== 'failed') || isDeepResearching;

    // Filter loadedPdfs to only include those that are "Checked" (In Context)
    const contextPdfs = loadedPdfs.filter(p => contextUris.has(p.uri));

    // Calculate total selected items for Deep Research
    const selectedArxivPapers = filteredCandidates.filter(p => selectedArxivIds.has(p.id));

    // Unified Context Items List (DEDUPLICATED BY TITLE) - INCLUDING LOADING ITEMS
    const contextItems = useMemo(() => {
        // 1. Map all intent-based URIs from LibraryContext
        const pdfItems = Array.from(contextUris).map(uriOrUnknown => {
            const uri = uriOrUnknown as string;
            const loaded = loadedPdfs.find(p => p.uri === uri);
            const saved = savedPapers.find(p => p.uri === uri);
            const isDownloading = downloadingUris.has(uri);

            return {
                id: uri,
                // Fallback chain: Memory -> Database -> Filename -> Fallback
                title: loaded?.metadata?.title || saved?.title || uri.split('/').pop()?.replace('.pdf', '') || 'Loading...',
                type: 'pdf' as const,
                status: loaded ? 'loaded' as const : (isDownloading ? 'loading' as const : 'pending' as const)
            };
        });

        const arxivItems = selectedArxivPapers.map(p => ({
            id: p.id,
            title: p.title.trim(),
            type: 'arxiv' as const,
            status: 'loaded' as const
        }));

        const allItems = [...pdfItems, ...arxivItems];

        // Unique items by normalized title
        const seenTitles = new Set<string>();
        const genericTitles = ['untitled document', 'document', 'pdf document', 'untitled', 'unknown'];
        const deduplicated: typeof allItems = [];

        for (const item of allItems) {
            const normalized = item.title.toLowerCase().trim();
            const isGeneric = genericTitles.includes(normalized);

            if (!isGeneric && seenTitles.has(normalized)) {
                // Duplicate detected - skip adding this version
                continue;
            }

            if (!isGeneric) {
                seenTitles.add(normalized);
            }
            deduplicated.push(item);
        }

        return deduplicated;
    }, [contextUris, downloadingUris, loadedPdfs, savedPapers, selectedArxivPapers]);

    const isAnyPaperLoading = contextItems.some(item => item.status === 'loading' || item.status === 'pending');

    const hasContext = contextItems.length > 0;

    // Auto-undismiss if items are added
    useEffect(() => {
        if (contextItems.length > prevContextCountRef.current) {
            setIsDismissed(false);
        }
        prevContextCountRef.current = contextItems.length;
    }, [contextItems.length]);

    // ✅ WATCHDOG: Auto-remove papers from context if they fail to load
    useEffect(() => {
        failedUris.forEach(uri => {
            if (contextUris.has(uri)) {
                console.warn(`[AgentResearcher] Auto-removing failed source: ${uri}`);
                togglePdfContext(uri);
            }
        });
    }, [failedUris, contextUris, togglePdfContext]);

    // ✅ LAYOUT WATCHDOG: Auto-dismiss bar on specific layout transitions
    useEffect(() => {
        // Detect "Main Search View" (Home)
        const isAllClosed = !columnVisibility.left && !columnVisibility.middle && !columnVisibility.library && !columnVisibility.right;
        
        // Detect Transitions: Use refs to ensure we only trigger on the MOMENT of transition
        const transitionedToRightOpen = columnVisibility.right && !prevRightRef.current;
        const transitionedToHome = isAllClosed && !prevAllClosedRef.current;

        if (transitionedToRightOpen || transitionedToHome) {
            // If bar is open or showing, dismiss it
            if (activeTool === 'deep' || !isDismissed) {
                console.log(`[AgentResearcher] Auto-dismissing bar: Home=${transitionedToHome}, PDF=${transitionedToRightOpen}`);
                handleDismiss();
            }
        }

        // Update tracking refs
        prevRightRef.current = columnVisibility.right;
        prevAllClosedRef.current = isAllClosed;
    }, [columnVisibility, activeTool, isDismissed]);

    // Logic to determine if the bar should be visible
    const showDeepBar = activeTool === 'deep' || (hasContext && !isDismissed);

    // --- SYNC FILES FUNCTION ---
    const syncFiles = async () => {
        if (contextPdfs.length === 0) return;

        setIsSyncing(true);

        const promises = contextPdfs.map(pdf => {
            const meta = {
                title: pdf.metadata.title || pdf.file.name,
                author: pdf.metadata.author || 'Unknown'
            };
            return agentService.uploadPdf(pdf.file, pdf.uri, meta);
        });

        await Promise.all(promises);
        setIsSyncing(false);
    };

    // --- SYNC FILES WHEN CONTEXT CHANGES ---
    useEffect(() => {
        if (contextPdfs.length > 0) {
            console.log(`[AgentResearcher] Syncing ${contextPdfs.length} PDFs to agent...`);
            syncFiles().catch(error => {
                console.error('[AgentResearcher] Error syncing files:', error);
            });
        }
    }, [contextPdfs.length]); // Dependency on count to avoid infinite loops

    // --- CLICK OUTSIDE LOGIC ---
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            if (fabContainerRef.current && fabContainerRef.current.contains(target)) return;
            if (activeTool === 'chat' && !isLocked && sidebarRef.current && !sidebarRef.current.contains(target)) {
                setActiveTool(null);
                setIsMenuOpen(false);
            }
            if (showDeepBar && isBarExpanded && barRef.current && !barRef.current.contains(target)) {
                setIsBarExpanded(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [activeTool, isLocked, isBarExpanded, showDeepBar]);

    // --- HANDLERS ---
    const handleDismiss = (e?: React.MouseEvent) => {
        e?.stopPropagation();
        setIsDismissed(true);
        setIsBarExpanded(false);
        setActiveTool(null);
    };

    const handleSendMessage = async (text: string) => {
        const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text, timestamp: new Date() };
        setMessages(prev => [...prev, userMsg]);
        setIsProcessing(true);

        try {
            // ✅ CRITICAL: Only send PDFs that are in the deduplicated contextItems
            const selectedFileUris = contextPdfs
                .filter(p => contextItems.some(item => item.id === p.uri && item.type === 'pdf'))
                .map(p => p.uri);

            console.log(`[Chat] Sending message with ${selectedFileUris.length} unique PDFs`);

            const response = await agentService.sendMessage(
                text,
                contextNotes,
                selectedFileUris
            );

            const aiMsg: ChatMessage = {
                id: (Date.now() + 1).toString(),
                role: 'model',
                text: response.text,
                timestamp: new Date(),
                citations: response.citations
            };
            setMessages(prev => [...prev, aiMsg]);
        } catch (error) {
            console.error("Agent Error", error);
            const errorMsg: ChatMessage = { id: (Date.now() + 1).toString(), role: 'model', text: "I'm sorry, I encountered an error. Please try again.", timestamp: new Date() };
            setMessages(prev => [...prev, errorMsg]);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleClearChat = () => {
        setMessages([]);
        agentService.reset();
    };

    const handleViewCitation = (citation: AgentCitation) => {
        loadPdfFromUrl(citation.sourceId, citation.title);
        setActivePdf(citation.sourceId);
        // Viewer from agent: close sidebar, keep viewer
        setColumnVisibility(prev => ({ ...prev, left: false, right: true }));
    };

    const handleStartDeepResearch = async () => {
        if (isDeepResearchLoading) {
            stopDeepResearch();
            return;
        }

        // ✅ NEW: Prevent starting if Main Deep Research is running
        const isMainDeepResearchRunning = researchPhase !== 'idle' && researchPhase !== 'completed' && researchPhase !== 'failed';
        if (isMainDeepResearchRunning) {
            return; // Main research is active - button is disabled so this shouldn't be reached, but safety check
        }

        const currentQuestions = [...deepQuestions];
        if (deepInput.trim()) {
            currentQuestions.push(deepInput.trim());
        }

        if (currentQuestions.length === 0 || !hasContext) return;

        // ✅ CRITICAL: Only analyse papers that are in the deduplicated contextItems
        const uniquePdfs = contextPdfs.filter(p => contextItems.some(item => item.id === p.uri && item.type === 'pdf'));
        const uniqueArxivPapers = selectedArxivPapers.filter(p => contextItems.some(item => item.id === p.id && item.type === 'arxiv'));

        console.log(`[AgentResearcher] 🔬 Starting Hybrid Analysis on ${uniquePdfs.length} unique PDFs and ${uniqueArxivPapers.length} unique ArXiv papers.`);

        // Use performHybridAnalysis for Agent-selected papers (WITH accumulation to "My Results")
        performHybridAnalysis(uniquePdfs, uniqueArxivPapers, currentQuestions, arxivKeywords);

        // Open library column and switch to research tab
        openColumn('library');
        setLibraryActiveView('research');

        // Ensure middle view stays open alongside the library for splitscreen
        setColumnVisibility(prev => ({ ...prev, middle: true }));

        setIsBarExpanded(false);
        setActiveTool(null);
        setDeepQuestions([]);
        setDeepInput('');
    };

    const addDeepQuestion = () => {
        if (deepInput.trim()) {
            setDeepQuestions(prev => [...prev, deepInput.trim()]);
            setDeepInput('');
        }
    };

    const removeItem = (item: { id: string, title: string, type: 'pdf' | 'arxiv' }) => {
        // ✅ Unified removal: Remove ANY paper matching this title (handles duplicates)
        const normalizedTitle = item.title.toLowerCase().trim();

        // 1. Remove from local PDF context
        contextPdfs.forEach(p => {
            const pTitle = (p.metadata.title || p.file.name).toLowerCase().trim();
            if (pTitle === normalizedTitle) {
                togglePdfContext(p.uri);
            }
        });

        // 2. Remove from ArXiv selection
        selectedArxivPapers.forEach(p => {
            if (p.title.toLowerCase().trim() === normalizedTitle) {
                toggleArxivSelection(p.id);
            }
        });

        // 3. Fallback: ensure the specific ID is removed even if title matching failed
        if (item.type === 'pdf' && isPdfInContext(item.id)) togglePdfContext(item.id);
        else if (item.type === 'arxiv' && selectedArxivIds.has(item.id)) toggleArxivSelection(item.id);
    };

    const clearAllDocuments = () => {
        // Uncheck all PDFs
        contextPdfs.forEach(p => togglePdfContext(p.uri));
        // Uncheck all ArXiv
        clearArxivSelection();
        setActiveTool(null);
    };

    const toggleTool = (tool: 'chat' | 'deep') => {
        if (activeTool === tool) {
            setActiveTool(null);
            setIsMenuOpen(false);
        } else {
            setActiveTool(tool);
            setIsMenuOpen(false);
            if (tool === 'deep') {
                setIsBarExpanded(true);
                setIsDismissed(false);
            }
        }
    };

    const MAX_VISIBLE_TAGS = 5;
    const visibleContextItems = showAllDocs ? contextItems : contextItems.slice(0, MAX_VISIBLE_TAGS);
    const hiddenCount = contextItems.length - MAX_VISIBLE_TAGS;

    return (
        <>
            {/* TOOL: CHAT SIDEBAR */}
            <div
                ref={sidebarRef}
                className={`fixed right-0 top-20 bottom-0 w-full sm:w-[480px] z-[60] transition-transform duration-300 ease-in-out transform ${activeTool === 'chat' ? 'translate-x-0' : 'translate-x-full'
                    }`}
            >
                <ChatInterface
                    messages={messages}
                    isProcessing={isProcessing}
                    onSendMessage={handleSendMessage}
                    onClearChat={handleClearChat}
                    syncStatus={isSyncing ? 'syncing' : 'uptodate'}
                    onClose={() => setActiveTool(null)}
                    pdfCount={contextPdfs.length} // Show count of CHECKED PDFs
                    isLocked={isLocked}
                    onToggleLock={() => setIsLocked(!isLocked)}
                    onViewCitation={handleViewCitation}
                />
            </div>

            {/* TOOL: DEEP RESEARCH BAR */}
            {showDeepBar && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 z-[999] group">
                    {/* HOVER CLOSE BUTTON */}
                    {!isBarExpanded && (
                        <div className="absolute -top-10 left-0 w-full flex justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-600 pointer-events-none group-hover:pointer-events-auto">
                            <div className="absolute bg-gray-800 p-1.5 w-full h-10 pt-10 opacity-0"></div>
                            <button
                                onClick={handleDismiss}
                                className="bg-gray-800 text-white dark:bg-white dark:text-gray-900 p-1.5 rounded-full shadow-lg transform hover:scale-110 transition-transform"
                                title="Dismiss Research Bar"
                            >
                                <X size={22} />
                            </button>

                        </div>
                    )}

                    <div
                        ref={barRef}
                        className={`
                            relative bg-white dark:bg-dark-card border border-gray-200 dark:border-gray-700 shadow-2xl transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]
                            ${isBarExpanded ? 'rounded-xl p-3' : 'rounded-2xl p-3 cursor-text hover:shadow-scholar-lg hover:border-scholar-200'}
                        `}
                        onClick={() => !isBarExpanded && setIsBarExpanded(true)}>
                        {isBarExpanded && (
                            <div className="mb-4 opacity-0 animate-fade-in space-y-3 delay-150 fill-mode-forwards" style={{ animationFillMode: 'forwards' }}>
                                <div className="flex justify-between items-center pb-2 border-b border-gray-100 dark:border-gray-700">
                                    <h3 className="text-sm font-bold flex items-center gap-2 text-scholar-600 dark:text-scholar-400">
                                        <BookOpenText size={16} /> Deep Research
                                    </h3>
                                    <button onClick={handleDismiss} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                                        <X size={16} />
                                    </button>
                                </div>

                                <div>
                                    <div className="flex justify-between items-center mb-2 px-1">
                                        <div className="flex items-center gap-3">
                                            <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1">
                                                Active Documents ({contextItems.length})
                                            </label>
                                            {hasContext && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); clearAllDocuments(); }}
                                                    className="text-[10px] font-medium text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 px-1.5 py-0.5 rounded transition-colors flex items-center gap-1"
                                                >
                                                    <Trash2 size={10} /> Clear All
                                                </button>
                                            )}
                                        </div>
                                        <button onClick={() => setIsBarExpanded(false)} className="text-gray-400 hover:text-gray-600" title="Collapse">
                                            <ChevronDown size={14} />
                                        </button>
                                    </div>

                                    {hasContext ? (
                                        <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto custom-scrollbar">
                                            {visibleContextItems.map((item) => (
                                                <div key={item.id} className="flex items-center gap-1.5 bg-scholar-600/10 text-scholar-700 dark:text-scholar-300 px-3 py-1.5 rounded-full text-xs font-medium border border-scholar-200 dark:border-scholar-800 animate-fade-in">
                                                    {item.status === 'loading' ? (
                                                        <Loader2 size={12} className="animate-spin text-scholar-600 dark:text-scholar-400 flex-shrink-0" />
                                                    ) : (
                                                        <FileText size={12} className="opacity-70 flex-shrink-0" />
                                                    )}
                                                    <span className="truncate max-w-[150px] sm:max-w-[200px]">{item.title}</span>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); removeItem(item); }}
                                                        className="ml-1 p-0.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors flex-shrink-0"
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                            ))}
                                            {!showAllDocs && hiddenCount > 0 && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setShowAllDocs(true); }}
                                                    className="text-xs font-semibold text-scholar-600 dark:text-scholar-400 bg-scholar-50 dark:bg-scholar-900/30 px-3 py-1.5 rounded-full border border-scholar-100 dark:border-scholar-800 hover:bg-scholar-100 dark:hover:bg-scholar-900/50 transition-colors"
                                                >
                                                    +{hiddenCount} more...
                                                </button>
                                            )}
                                            {showAllDocs && contextItems.length > MAX_VISIBLE_TAGS && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setShowAllDocs(false); }}
                                                    className="text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 px-2 py-1.5"
                                                >
                                                    Show Less
                                                </button>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2 text-sm text-gray-400 bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg border border-dashed border-gray-200 dark:border-gray-700">
                                            <AlertCircle size={16} />
                                            <span>Select papers from Library or Search first</span>
                                        </div>
                                    )}
                                </div>

                                {deepQuestions.length > 0 && (
                                    <div>
                                        <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 block px-1">
                                            Research Questions
                                        </label>
                                        <div className="flex flex-wrap gap-2">
                                            {deepQuestions.map((q, i) => (
                                                <div key={i} className="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 px-3 py-1.5 rounded-full text-xs font-medium border border-gray-200 dark:border-gray-700">
                                                    <span className="truncate max-w-[300px]">{q}</span>
                                                    <button
                                                        onClick={() => setDeepQuestions(prev => prev.filter((_, idx) => idx !== i))}
                                                        className="p-0.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10"
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* INPUT AREA */}
                        <div className={`flex items-center gap-2 ${isBarExpanded ? 'bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2 border border-gray-200 dark:border-gray-700 focus-within:bg-white dark:focus-within:bg-gray-900 focus-within:border-scholar-500 shadow-inner' : 'pl-3'}`}>
                            <div className={`flex-shrink-0 text-scholar-600 dark:text-scholar-400`}>
                                {isDeepResearchLoading ? <Loader2 size={20} className="animate-spin" /> : <Sparkles size={20} />}
                            </div>

                            <input
                                type="text"
                                value={deepInput}
                                onChange={(e) => setDeepInput(e.target.value)}
                                onFocus={() => setIsBarExpanded(true)}
                                onKeyDown={(e) => e.key === 'Enter' && addDeepQuestion()}
                                placeholder={isBarExpanded ? "Add a specific question..." : `Ask about ${contextItems.length} selected document${contextItems.length !== 1 ? 's' : ''}...`}
                                disabled={(!hasContext && isBarExpanded) || isDeepResearchLoading}
                                className={`flex-1 bg-transparent py-2 text-sm text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none ${!isBarExpanded && 'cursor-pointer'}`}
                            />

                            {isBarExpanded ? (
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={addDeepQuestion}
                                        disabled={!deepInput.trim() || isDeepResearchLoading}
                                        className="p-1.5 text-gray-400 hover:text-scholar-600 dark:hover:text-scholar-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
                                        title="Add Question"
                                    >
                                        <Plus size={18} />
                                    </button>
                                    <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1"></div>
                                    <button
                                        onClick={handleStartDeepResearch}
                                        disabled={
                                            (!isDeepResearchLoading && (deepQuestions.length === 0 && !deepInput.trim())) ||
                                            !hasContext ||
                                            isAnyPaperLoading ||
                                            (researchPhase !== 'idle' && researchPhase !== 'completed' && researchPhase !== 'failed' && !isDeepResearchLoading)
                                        }
                                        className={`
                                flex items-center gap-2 px-4 py-1.5 rounded-lg font-semibold text-xs transition-all shadow-sm
                                ${isDeepResearchLoading
                                                ? 'bg-white text-gray-800 border border-gray-300 hover:text-red-600 hover:border-red-300'
                                                : (isAnyPaperLoading || (researchPhase !== 'idle' && researchPhase !== 'completed' && researchPhase !== 'failed' && !isDeepResearchLoading))
                                                    ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                                                    : 'bg-scholar-600 hover:bg-scholar-700 text-white disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-300'
                                            }
                             `}
                                        title={
                                            isDeepResearchLoading ? "Stop Hybrid Analysis" :
                                                isAnyPaperLoading ? "Waiting for documents to load..." :
                                                    (researchPhase !== 'idle' && researchPhase !== 'completed' && researchPhase !== 'failed' && !isDeepResearchLoading) ? "Main Deep Research in progress. Stop it first." :
                                                        "Start Hybrid Analysis"
                                        }
                                    >
                                        {isDeepResearchLoading ? (
                                            <>
                                                <Square size={12} fill="currentColor" className="opacity-50" />
                                                Stop Research
                                            </>
                                        ) : (researchPhase !== 'idle' && researchPhase !== 'completed' && researchPhase !== 'failed' && !isDeepResearchLoading) ? (
                                            <>
                                                <Loader2 size={12} className="animate-spin opacity-50" />
                                                <span>Main Research...</span>
                                            </>
                                        ) : 'Start Research'}
                                    </button>
                                </div>
                            ) : isDeepResearchLoading ? (
                                <button
                                    onClick={handleStartDeepResearch}
                                    className="p-2 bg-red-600 hover:bg-red-700 rounded-full text-white shadow-sm transition-all flex-shrink-0 animate-pulse"
                                    title="Stop Hybrid Analysis"
                                >
                                    <Square size={16} fill="currentColor" />
                                </button>
                            ) : (
                                <div className="pr-1">
                                    <button className="p-2 bg-scholar-600 rounded-full text-white shadow-sm">
                                        <ArrowRight size={16} />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* FAB */}
            <div ref={fabContainerRef} className="fixed bottom-6 right-6 z-[50] flex flex-col items-end gap-3">
                {isMenuOpen && (
                    <div className="flex items-center gap-3 animate-slide-up origin-bottom">
                        <span className="bg-white dark:bg-gray-800 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-md border border-gray-100 dark:border-gray-700 text-gray-600 dark:text-gray-300">Deep Research</span>
                        <button
                            onClick={() => toggleTool('deep')}
                            className={`w-12 h-12 rounded-full shadow-lg border border-gray-200 dark:border-gray-700 flex items-center justify-center transition-transform hover:scale-105 ${activeTool === 'deep' ? 'bg-scholar-600 text-white' : 'bg-white dark:bg-gray-800 text-scholar-600 dark:text-scholar-400'}`}
                        >
                            <BookOpenText size={20} />
                        </button>
                    </div>
                )}

                {isMenuOpen && (
                    <div className="flex items-center gap-3 animate-slide-up origin-bottom" style={{ animationDelay: '0.05s' }}>
                        <span className="bg-white dark:bg-gray-800 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-md border border-gray-100 dark:border-gray-700 text-gray-600 dark:text-gray-300">AI Assistant</span>
                        <button
                            onClick={() => toggleTool('chat')}
                            className={`w-12 h-12 rounded-full shadow-lg border border-gray-200 dark:border-gray-700 flex items-center justify-center transition-transform hover:scale-105 ${activeTool === 'chat' ? 'bg-scholar-600 text-white' : 'bg-white dark:bg-gray-800 text-scholar-600 dark:text-scholar-400'}`}
                        >
                            <MessageSquareText size={20} />
                        </button>
                    </div>
                )}

                <button
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                    className={`group flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-full shadow-xl transition-all duration-300 ${isMenuOpen || activeTool ? 'bg-gray-800 hover:bg-gray-900' : 'bg-scholar-600 hover:bg-scholar-700'} text-white hover:scale-105`}
                >
                    {isMenuOpen ? (
                        <X size={28} />
                    ) : (
                        <div className="relative">
                            <Sparkles size={28} className="transition-transform duration-300" />
                            {/* CHANGED: Counter uses contextItems.length (checked only) */}
                            {contextItems.length > 0 && !isMenuOpen && (
                                <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold border-2 border-white">
                                    {contextItems.length}
                                </span>
                            )}
                        </div>
                    )}
                </button>
            </div>
        </>
    );
};
