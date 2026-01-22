import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ArxivPaper, DeepResearchNote, ResearchPhase, LoadedPdf } from '../../types';
import { useResearch } from '../../contexts/ResearchContext';
import { useLibrary } from '../../contexts/LibraryContext';
import { useUI } from '../../contexts/UIContext';
import { useDatabase } from '../../database/DatabaseContext';
import { WebSearchView } from '../websearch/WebSearchView';
import {
  Loader2,
  FileText,
  BookText,
  ChevronDown,
  ChevronUp,
  BookOpenText,
  Copy,
  Check,
  Lightbulb,
  Sparkles,
  ArrowUpDown,
  Calendar,
  Layers,
  Star,
  Plus,
  BookmarkPlus,
  Square,
  Search,
  TextSearch,
  Library,
  Upload,
  User,
  LayoutList,
  ChevronsDown,
  ChevronsUp,
  X,
  AlertTriangle
} from 'lucide-react';

interface DeepResearchViewProps {
  researchPhase: ResearchPhase;
  status: string;
  candidates: ArxivPaper[];
  generatedKeywords: string[];
  onViewPdf?: (paper: ArxivPaper) => void;
  // Web search data
  webSearchSources?: any[];
  webSearchLoading?: boolean;
  webSearchError?: string | null;
}

type SortOption = 'most-relevant-notes' | 'relevant-papers' | 'newest-papers';
type TabType = 'web' | 'deep';

const getNoteId = (paperId: string, page: number, index: number) => `${paperId}-p${page}-i${index}`;

const StatusTicker: React.FC<{ keywords: string[] }> = React.memo(({ keywords }) => {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (keywords.length === 0) return;
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % keywords.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [keywords]);

  if (keywords.length === 0) return null;

  return (
    <div className="flex flex-col items-center animate-fade-in">
      <span className="text-xs font-semibold text-scholar-600 dark:text-scholar-400 uppercase tracking-widest mb-2">Analyzing Topic</span>
      <p className="text-lg text-gray-700 dark:text-gray-200 font-medium transition-all duration-500 ease-in-out key={index}">
        Checking for papers on "{keywords[index]}"...
      </p>
    </div>
  );
});

export const DeepResearchView: React.FC<DeepResearchViewProps> = ({
  researchPhase,
  status,
  candidates,
  generatedKeywords,
  onViewPdf,
  webSearchSources = [],
  webSearchLoading = false,
  webSearchError = null
}) => {
  const { loadedPdfs, isPdfInContext, togglePdfContext, loadPdfFromUrl, downloadingUris, failedUris } = useLibrary();
  const {
    selectedArxivIds,
    selectAllArxivPapers,
    clearArxivSelection,
    isDeepResearching,
    deepResearchResults,
    searchBarState,
    analyzeLoadedPdfs,
    showUploadedTab,
    setShowUploadedTab,
    uploadedPaperStatuses,
    clearDeepResearchResults,
    pendingDeepResearchQuery,
    setPendingDeepResearchQuery,
    performDeepResearch
  } = useResearch();

  // State Management
  const [activeTab, setActiveTab] = useState<TabType>('web');
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortOption>('relevant-papers');
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [allNotesExpanded, setAllNotesExpanded] = useState(true);

  // Sync: Switch to Deep Research tab when deep research starts
  useEffect(() => {
    if (researchPhase === 'initializing') {
      setActiveTab('deep');
    }
  }, [researchPhase]);

  // Sync: Switch to Web Search tab when web search starts
  useEffect(() => {
    if (webSearchLoading) {
      setActiveTab('web');
    }
  }, [webSearchLoading]);

  // Auto-switch to deep research tab when ArXiv candidates are available DURING ACTIVE RESEARCH
  // Don't auto-switch when just loading persisted 'completed' results from localStorage
  useEffect(() => {
    const activeResearchPhases = ['initializing', 'searching', 'filtering', 'extracting'];
    if (candidates.length > 0 && activeResearchPhases.includes(researchPhase)) {
      setActiveTab('deep');
    }
  }, [candidates.length, researchPhase]);

  const handleSelectNote = useCallback((id: string) => {
    setSelectedNoteIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }, []);

  const isBlurred = researchPhase === 'filtering';
  const isSearching = researchPhase === 'searching' || researchPhase === 'initializing';

  // Tab-specific data: web search sources for 'web' tab, ArXiv candidates for 'deep' tab
  const currentTabCandidates = activeTab === 'web' ? [] : candidates; // Web search uses different rendering
  const currentWebSources = activeTab === 'web' ? webSearchSources : [];

  const totalNotes = useMemo(() => currentTabCandidates.reduce((acc, paper) => acc + (paper.notes?.length || 0), 0), [currentTabCandidates]);

  const content = useMemo(() => {
    if (sortBy === 'most-relevant-notes') {
      const allNotes = currentTabCandidates.flatMap(paper =>
        (paper.notes || []).map((note, idx) => ({
          ...note,
          sourcePaper: paper,
          uniqueId: getNoteId(paper.id, note.pageNumber, idx)
        }))
      );
      return allNotes.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
    } else if (sortBy === 'newest-papers') {
      return [...currentTabCandidates].sort((a, b) => new Date(b.publishedDate).getTime() - new Date(a.publishedDate).getTime());
    } else {
      return [...currentTabCandidates].sort((a, b) => {
        // First priority: Papers currently being processed move to top
        const aIsProcessing = ['downloading', 'processing', 'extracting'].includes(a.analysisStatus || '');
        const bIsProcessing = ['downloading', 'processing', 'extracting'].includes(b.analysisStatus || '');
        if (aIsProcessing !== bIsProcessing) return bIsProcessing ? 1 : -1;

        // Second priority: Selected papers during research (with any analysis status) come first
        const aIsSelected = selectedArxivIds.has(a.id);
        const bIsSelected = selectedArxivIds.has(b.id);
        if (aIsSelected !== bIsSelected) return bIsSelected ? 1 : -1;

        // Third priority: Papers with active analysis status
        const activeStatuses = ['downloading', 'processing', 'extracting', 'completed', 'failed', 'stopped'];
        const aActive = a.analysisStatus && activeStatuses.includes(a.analysisStatus) ? 1 : 0;
        const bActive = b.analysisStatus && activeStatuses.includes(b.analysisStatus) ? 1 : 0;
        if (aActive !== bActive) return bActive - aActive;

        // Fourth priority: Papers with notes
        const aHasNotes = (a.notes && a.notes.length > 0) ? 1 : 0;
        const bHasNotes = (b.notes && b.notes.length > 0) ? 1 : 0;
        if (aHasNotes !== bHasNotes) return bHasNotes - aHasNotes;

        // Fifth priority: Relevance score
        return (b.relevanceScore || 0) - (a.relevanceScore || 0);
      });
    }
  }, [currentTabCandidates, sortBy, selectedArxivIds]);

  const handleSelectAllPapers = useCallback(() => {
    // Only handle ArXiv candidates selection
    if (selectedArxivIds.size === candidates.length) {
      clearArxivSelection();
    } else {
      selectAllArxivPapers(candidates.map(p => p.id));
    }
  }, [selectedArxivIds.size, candidates, clearArxivSelection, selectAllArxivPapers]);

  return (
    <div className="p-3 sm:p-6 font-sans max-w-4xl mx-auto min-h-[500px] relative" style={{ containerType: 'inline-size' }}>
      <style>{`
        @container (max-width: 600px) {
          .deep-header-row { flex-direction: column !important; gap: 0.75rem !important; align-items: flex-start !important; }
          .deep-tab-label { font-size: 12px !important; }
          .deep-tab-button { padding-left: 0.75rem !important; padding-right: 0.75rem !important; }
          .deep-actions-right { justify-content: flex-start !important; }
        }
        @container (max-width: 400px) {
          .deep-tab-label { display: none !important; }
          .deep-sort-text { display: none !important; }
        }
      `}</style>

      {isBlurred && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center h-[80vh] pointer-events-none">
          <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-md p-6 sm:p-8 rounded-2xl shadow-scholar-lg border border-white/20 dark:border-gray-700/50 text-center max-w-md mx-4 animate-fade-in-up">
            <div className="mb-6 flex justify-center">
              <div className="w-12 h-12 sm:w-16 sm:h-16 border-4 border-scholar-200 border-t-scholar-600 rounded-full animate-spin"></div>
            </div>
            <StatusTicker keywords={generatedKeywords} />
            <p className="mt-4 text-sm text-gray-500">{status}</p>
          </div>
        </div>
      )}

      {!isBlurred && (
      <div className="sticky top-0 z-30 bg-cream/95 dark:bg-dark-card/95 backdrop-blur-sm border-b border-gray-100 dark:border-gray-700 pb-0 mb-3 -pt-3 -mt-3 -mx-3 sm:-mx-6 px-3 sm:px-6 shadow-sm">

        {/* SINGLE ROW - TABS LEFT, ACTIONS RIGHT */}
        <div className="flex items-center justify-between py-3 gap-4 deep-header-row">


            {/* LEFT SIDE - TABS */}
            <div className="flex items-center -mb-px">
              {/* Select All Papers - Icon Only */}
              {sortBy !== 'most-relevant-notes' && currentTabCandidates.length > 0 && (
                <button
                  onClick={handleSelectAllPapers}
                  className="p-2.5 text-gray-500 hover:text-scholar-600 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-all"
                  title={`Select all papers (${selectedArxivIds.size > 0 ? `${selectedArxivIds.size}/` : ''}${candidates.length})`}
                >
                  <div className={`w-6 h-6 rounded border-2 transition-colors flex items-center justify-center ${selectedArxivIds.size === candidates.length ? 'bg-scholar-600 border-scholar-600' : 'border-gray-400 dark:border-gray-500'
                    }`}>
                    {selectedArxivIds.size === candidates.length && <Check size={16} className="text-white" />}
                  </div>
                </button>
              )}

              <button
                onClick={() => { setActiveTab('web'); }}
                className={`deep-tab-button px-4 py-1  text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${activeTab === 'web' ? 'border-scholar-600 text-scholar-600' : 'border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-gray-100'}`}
              >
                <Search size={20} className="flex-shrink-0" />
                <span className="tab-label deep-tab-label">Web Search</span>
              </button>

              <button
                onClick={() => { setActiveTab('deep'); }}
                className={`deep-tab-button px-4 py-1 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${activeTab === 'deep' ? 'border-scholar-600 text-scholar-600' : 'border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-gray-100'}`}
              >
                <BookOpenText size={20} className="flex-shrink-0" />
                <span className="tab-label deep-tab-label">Deep Research</span>
                {isSearching && activeTab === 'web' && (
                  <Loader2 size={14} className="animate-spin text-scholar-600 flex-shrink-0" />
                )}
              </button>
            </div>

            {/* RIGHT SIDE - ACTIONS */}
            <div className="flex items-center gap-2 deep-actions-right">

              {/* Sort Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setIsSortOpen(!isSortOpen)}
                  className="flex items-center gap-2 px-3 py-2.5 text-xs font-bold text-gray-600 dark:text-gray-300 hover:text-scholar-600 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-all"
                  title="Sort options"
                >
                  <ArrowUpDown size={20} className="text-gray-400" />
                  <span className="deep-sort-text truncate">
                    {sortBy === 'most-relevant-notes' && 'Most Relevant Notes'}
                    {sortBy === 'relevant-papers' && 'Most Relevant Papers'}
                    {sortBy === 'newest-papers' && 'Newest Papers'}
                  </span>
                  <ChevronDown size={20} className={`text-gray-400 transition-transform ${isSortOpen ? 'rotate-180' : ''}`} />
                </button>

                {isSortOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsSortOpen(false)} />
                    <div className="absolute right-0 top-[110%] w-full sm:w-56 bg-white dark:bg-dark-card rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 py-1.5 overflow-hidden z-50 animate-fade-in flex flex-col">
                      <button onClick={() => { setSortBy('most-relevant-notes'); setIsSortOpen(false); }} className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                        <Star size={16} className={sortBy === 'most-relevant-notes' ? "text-scholar-600" : "text-gray-400"} />
                        <span className="text-sm font-medium">Most Relevant Notes</span>
                      </button>
                      <div className="h-px bg-gray-100 dark:bg-gray-700 mx-3 my-1"></div>
                      <button onClick={() => { setSortBy('relevant-papers'); setIsSortOpen(false); }} className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                        <Layers size={16} className={sortBy === 'relevant-papers' ? "text-scholar-600" : "text-gray-400"} />
                        <span className="text-sm font-medium">Relevant Papers</span>
                      </button>
                      <button onClick={() => { setSortBy('newest-papers'); setIsSortOpen(false); }} className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                        <Calendar size={16} className={sortBy === 'newest-papers' ? "text-scholar-600" : "text-gray-400"} />
                        <span className="text-sm font-medium">Newest Papers</span>
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Clear All Button - Only show when there are results */}
              {(currentTabCandidates.length > 0 || totalNotes > 0) && researchPhase !== 'searching' && (
                <button
                  onClick={() => {
                    if (confirm(`Clear all ${activeTab === 'web' ? 'web search' : 'deep research'} results?`)) {
                      clearDeepResearchResults();
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                  title="Clear all results"
                >
                  <X size={20} />
                  <span className="hidden sm:inline">Clear All Results</span>
                </button>
              )}

              {/* Collapse/Expand All Notes - Icon Only */}
              {sortBy !== 'most-relevant-notes' && currentTabCandidates.some(p => p.notes && p.notes.length > 0) && (
                <button
                  onClick={() => setAllNotesExpanded(!allNotesExpanded)}
                  className="p-2.5 -pl-3 text-gray-500 font-bold hover:text-scholar-600 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-all"
                  title={allNotesExpanded ? 'Collapse all notes' : 'Expand all notes'}
                >
                  {allNotesExpanded ? <ChevronsUp size={24} /> : <ChevronsDown size={24} />}
                </button>
              )}



          </div>
        </div>
      </div>
      )}

      <div className={`space-y-6 transition-all duration-500 ${isBlurred ? 'blur-sm opacity-50 pointer-events-none select-none overflow-hidden h-screen' : 'blur-0 opacity-100'}`}>
        {/* Web Search Tab - Show loading state */}
        {activeTab === 'web' && webSearchLoading && (
          <div className="flex flex-col items-center justify-center h-full min-h-[500px] p-8 space-y-6 animate-fade-in">
            <div className="relative">
              <div className="w-20 h-20 border-4 border-scholar-100 dark:border-scholar-900 border-t-scholar-600 dark:border-t-scholar-500 rounded-full animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <Search size={24} className="text-scholar-600 dark:text-scholar-500 animate-pulse" />
              </div>
            </div>
            <div className="text-center space-y-3 max-w-md mx-auto">
              <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100">Web Search in Progress</h3>
              <p className="text-gray-500 dark:text-gray-400 leading-relaxed animate-pulse">Scanning the web...</p>
            </div>
          </div>
        )}

        {/* Web Search Tab - Show error state */}
        {activeTab === 'web' && webSearchError && !webSearchLoading && (
          <div className="bg-error-50 text-error-600 p-4 rounded-lg text-sm">{webSearchError}</div>
        )}

        {/* Web Search Tab - Show results */}
        {activeTab === 'web' && !webSearchLoading && !webSearchError && currentWebSources.length > 0 && (
          <>
            <div className="text-sm text-gray-500 dark:text-gray-400 font-medium px-1 flex items-center gap-2 mb-2 animate-fade-in">
              <Search size={14} className="opacity-60" />
              {currentWebSources.length} web result{currentWebSources.length !== 1 ? 's' : ''} found
            </div>
            <div className="space-y-6">
              {currentWebSources.map((source: any, idx: number) => (
                <WebSearchView
                  key={`${source.uri}-${idx}`}
                  source={source}
                  isSelected={isPdfInContext(source.uri)}
                  isDownloading={downloadingUris.has(source.uri)}
                  isFailed={failedUris.has(source.uri)}
                  isResearching={isPdfInContext(source.uri) && isDeepResearching}
                  researchNotes={deepResearchResults.filter(n => n.pdfUri === source.uri)}
                  forceExpanded={allNotesExpanded}
                  onToggle={async () => {
                    const wasSelected = isPdfInContext(source.uri);
                    if (!wasSelected) {
                      // Ensure PDF is loaded before adding to context
                      const isLoaded = loadedPdfs.some(p => p.uri === source.uri);
                      if (!isLoaded) {
                        const result = await loadPdfFromUrl(source.uri, source.title);
                        // @ts-ignore
                        if (result && !result.success) return;
                      }
                    }
                    togglePdfContext(source.uri, source.title);
                  }}
                  onView={async () => {
                    // Handled by WebSearchView internally
                  }}
                />
              ))}
            </div>
          </>
        )}

        {/* Web Search Tab - Empty state */}
        {activeTab === 'web' && !webSearchLoading && !webSearchError && currentWebSources.length === 0 && (
          <div className="py-24 flex flex-col items-center justify-center text-center opacity-40">
            <Search size={64} className="mb-6 text-gray-300" />
            <h3 className="text-xl font-bold text-gray-800 dark:text-white">No web search results</h3>
            <p className="text-xs max-w-xs leading-relaxed dark:text-gray-300">Enter a query in the search bar to find relevant sources.</p>
          </div>
        )}

        {/* Deep Research Tab - Show results */}
        {activeTab === 'deep' && !isBlurred && currentTabCandidates.length > 0 && (
          <div className="text-sm text-gray-500 dark:text-gray-400 font-medium px-1 flex items-center gap-2 mb-2 animate-fade-in">
            <BookOpenText size={14} className="opacity-60" />
            About {currentTabCandidates.length} paper{currentTabCandidates.length !== 1 ? 's' : ''} with {totalNotes} note{totalNotes !== 1 ? 's' : ''} found
          </div>
        )}

        {activeTab === 'deep' && (sortBy === 'most-relevant-notes' ? (
          (content as any[]).map((note) => (
            <ResearchCardNote
              key={note.uniqueId}
              id={note.uniqueId}
              note={note}
              isSelected={selectedNoteIds.includes(note.uniqueId)}
              onSelect={() => handleSelectNote(note.uniqueId)}
              sourceTitle={note.sourcePaper.title}
              showScore={true}
            />
          ))
        ) : (
          (content as ArxivPaper[]).map((paper) => (
            <PaperCard
              key={paper.id}
              paper={paper}
              selectedNoteIds={selectedNoteIds}
              onSelectNote={handleSelectNote}
              forceExpanded={allNotesExpanded}
              onView={() => onViewPdf && onViewPdf(paper)}
              isLocal={false}
            />
          ))
        ))}

        {/* Deep Research Tab - Loading state (searching/initializing) */}
        {activeTab === 'deep' && isSearching && (
          <div className="flex flex-col items-center justify-center h-full min-h-[400px] p-8 space-y-6 animate-fade-in">
            <div className="relative">
              <div className="w-20 h-20 border-4 border-scholar-100 dark:border-scholar-900 border-t-scholar-600 dark:border-t-scholar-500 rounded-full animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <BookOpenText size={24} className="text-scholar-600 dark:text-scholar-500 animate-pulse" />
              </div>
            </div>
            <div className="text-center space-y-3 max-w-md mx-auto">
              <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100">Deep Research in Progress</h3>
              <p className="text-gray-500 dark:text-gray-400 leading-relaxed animate-pulse">{status || "Analysing topics..."}</p>
            </div>
          </div>
        )}

        {/* Deep Research Tab - Empty state */}
        {activeTab === 'deep' && candidates.length === 0 && researchPhase === 'idle' && (
          <div className="py-24 flex flex-col items-center justify-center text-center opacity-40">
            <BookOpenText size={64} className="mb-6 text-gray-300" />
            <h3 className="text-xl font-bold text-gray-800 dark:text-white">No deep research results</h3>
            <p className="text-xs max-w-xs leading-relaxed dark:text-gray-300">Enter topics in the search bar to find academic papers.</p>
          </div>
        )}
      </div>

      {pendingDeepResearchQuery && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 animate-fade-in">
          {/* Note Manager modal design without backdrop/red border as requested */}
          <div className="absolute inset-0" onClick={() => setPendingDeepResearchQuery(null)} />

          <div className="relative w-full max-w-md bg-white dark:bg-dark-card rounded-[1.5rem] sm:rounded-[2rem] shadow-2xl overflow-hidden animate-slide-up border border-gray-100 dark:border-gray-800">
            <div className="p-6 sm:p-10 text-center">
              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-red-50 dark:bg-red-900/20 rounded-2xl sm:rounded-3xl flex items-center justify-center mx-auto mb-6 sm:mb-8 transform rotate-3">
                <AlertTriangle size={32} className="sm:w-[40px] sm:h-[40px] text-red-600" />
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white mb-3 sm:mb-4 leading-tight uppercase tracking-tight">
                New Search?
              </h2>
              <p className="text-gray-500 dark:text-gray-400 leading-relaxed font-medium text-xs sm:text-sm">
                CAUTION: Starting a new search will remove your current deep research results and notes unless saved. Do you wish to continue?
              </p>
            </div>
            <div className="p-4 sm:p-6 bg-gray-50 dark:bg-gray-800/50 flex flex-col sm:flex-row gap-3 sm:gap-4">
              <button
                onClick={() => setPendingDeepResearchQuery(null)}
                className="flex-1 px-8 py-3 sm:py-4 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-bold rounded-xl sm:rounded-2xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 transition-colors text-xs sm:text-sm uppercase tracking-widest"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  performDeepResearch(pendingDeepResearchQuery);
                  setPendingDeepResearchQuery(null);
                }}
                className="flex-1 px-8 py-3 sm:py-4 bg-red-600 text-white font-bold rounded-xl sm:rounded-2xl shadow-lg hover:bg-red-700 transition-all flex items-center justify-center gap-3 text-xs sm:text-sm uppercase tracking-widest"
              >
                <Sparkles size={18} /> Continue
              </button>
            </div>
          </div>
        </div>
      )
      }
    </div >
  );
};

interface PaperCardProps {
  paper: ArxivPaper;
  selectedNoteIds: string[];
  onSelectNote: (id: string) => void;
  onView?: () => void;
  isLocal?: boolean;
  forceExpanded?: boolean;
}

const PaperCard: React.FC<PaperCardProps> = React.memo(({ paper, selectedNoteIds, onSelectNote, onView, isLocal = false, forceExpanded = true }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const { toggleArxivSelection, selectedArxivIds } = useResearch();
  const { isPaperSaved, savePaper, deletePaper, canDeletePaper } = useDatabase();
  const { loadedPdfs, isPdfInContext, togglePdfContext, loadPdfFromUrl, setActivePdf, failedUrlErrors, downloadingUris } = useLibrary();
  const { setColumnVisibility, openColumn } = useUI();

  const isSelected = isLocal ? isPdfInContext(paper.id) : selectedArxivIds.has(paper.id);
  const isSaved = isPaperSaved(paper.pdfUri);
  const canDelete = canDeletePaper(paper.pdfUri);

  const isDownloading = paper.analysisStatus === 'downloading';
  const isProcessing = paper.analysisStatus === 'processing';
  const isExtracting = paper.analysisStatus === 'extracting';
  const isFailed = paper.analysisStatus === 'failed';
  const isCompleted = paper.analysisStatus === 'completed';
  const isStopped = paper.analysisStatus === 'stopped';

  const getStatusText = () => {
    if (isDownloading) return "Downloading document...";
    if (isProcessing) return "Reading pages...";
    if (isExtracting) return "Extracting notes...";
    return "Analysis Paper...";
  };

  const notes = paper.notes || [];

  useEffect(() => {
    if (notes.length > 0) {
      setIsExpanded(forceExpanded);
    }
  }, [forceExpanded]);



  const handleSelectionToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isLocal) {
      togglePdfContext(paper.id, paper.title);
    } else {
      toggleArxivSelection(paper.id);
    }
  };

  const handleOpenPdf = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isLocal) {
      setActivePdf(paper.id);
      setColumnVisibility(prev => ({ ...prev, right: true }));
    } else if (onView) {
      onView();
    }
  };

  const handleAddToSources = async (e: React.MouseEvent) => {
    e.stopPropagation();

    if (isSaved) {
      if (!canDelete) {
        alert('Cannot unsave this paper because it has saved notes. Please remove all saved notes from this paper first.');
        return;
      }
      deletePaper(paper.pdfUri);
      return;
    }

    // Load if needed
    const loaded = loadedPdfs.find(p => p.uri === paper.pdfUri);
    let loadedPdf = loaded;
    
    if (!loaded) {
      const result = await loadPdfFromUrl(paper.pdfUri, paper.title);
      // @ts-ignore
      if (result && !result.success) return;
      
      // Use the PDF from the result to avoid stale closure issue
      loadedPdf = result.pdf;
    }

    // Save using the correct PDF reference
    const paperData = {
      ...paper,
      uri: paper.pdfUri,
      pdfUri: paper.pdfUri,
      numPages: loadedPdf ? loadedPdf.numPages : undefined
    };
    savePaper(paperData);
    openColumn('left');
  };

  return (
    <div className="group/paper animate-fade-in mb-6 relative transition-colors">
      <div className={isExpanded ? 'p-1' : ''}>
        <div className="flex items-start">
          <div className="pt-1 mr-2 sm:mr-4">
            <button onClick={handleSelectionToggle} className={`hover:text-scholar-600 transition-colors opacity-100 sm:group-hover/paper:opacity-100 ${isSelected ? 'text-scholar-600' : 'text-gray-400 sm:opacity-0'}`}>
              {(isDownloading || isProcessing) ? <Loader2 size={24} className="animate-spin" />
                : isSelected ? <Check size={24} className="text-scholar-600" /> : <Square size={24} />}
            </button>
          </div>

          <div className="flex-grow min-w-0">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <span className="font-semibold text-scholar-600 dark:text-scholar-400 uppercase tracking-wider">{isLocal ? 'LOCAL' : new Date(paper.publishedDate).getFullYear()}</span>
                <span>•</span>
                <span className="truncate max-w-[200px] opacity-70">{paper.authors.slice(0, 2).join(', ')}{paper.authors.length > 2 ? ' et al.' : ''}</span>

                <div className="flex items-center gap-2 ml-4 opacity-100 sm:opacity-0 sm:group-hover/paper:opacity-100 transition-opacity">
                  <button onClick={handleOpenPdf} className="text-xs font-medium px-2 py-1 rounded-md transition-colors flex items-center gap-1 shadow-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 ">
                    <BookText size={12} /> View
                  </button>

                  <button
                    onClick={handleAddToSources}
                    disabled={downloadingUris.has(paper.pdfUri)}
                    className={`text-xs font-medium px-2 py-1 rounded-md transition-colors flex items-center gap-1 shadow-sm
                      ${isSaved
                        ? 'bg-scholar-100 text-scholar-700 border border-scholar-200 hover:bg-scholar-200 dark:bg-scholar-900/40 dark:text-scholar-300 dark:border-scholar-800'
                        : 'bg-white text-scholar-600 border border-scholar-200 hover:bg-scholar-50 dark:bg-gray-800 dark:text-scholar-400 dark:border-gray-700 dark:hover:bg-gray-700'
                      }
                    `}
                  >
                    {downloadingUris.has(paper.pdfUri) ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      isSaved ? <Check size={12} /> : <Plus size={12} />
                    )}
                    {isSaved ? 'Added' : 'Add to Sources'}
                  </button>
                </div>
              </div>
            </div>

            <h3 className="text-base sm:text-xl font-medium text-gray-900 dark:text-gray-100 leading-snug mb-2 cursor-pointer hover:text-scholar-600 transition-colors" onClick={handleOpenPdf}>
              {paper.title}
            </h3>

            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed line-clamp-2 mb-3">{paper.summary}</p>

            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-3">
                {(isDownloading || isProcessing || isExtracting) ? (
                  <div className="flex items-center gap-1.5 text-xs font-medium text-scholar-600">
                    <Loader2 size={12} className="animate-spin" />
                    <span className="animate-pulse">{getStatusText()}</span>
                  </div>
                ) : notes.length > 0 ? (
                  <button onClick={() => setIsExpanded(!isExpanded)} className="flex items-center gap-1.5 text-md font-medium text-bold text-scholar-600 hover:text-scholar-800 transition-colors">
                    {notes.length} Note{notes.length !== 1 ? 's' : ''} {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </button>
                ) : isCompleted ? (
                  <span className="text-xs text-gray-400 italic">No notes extracted</span>
                ) : isStopped ? (
                  <span className="text-xs text-gray-400 italic flex items-center gap-1"><Square size={12} /> stopped</span>
                ) : isFailed ? (
                  // New Friendly Error Display
                  <div className="bg-red-50/50 dark:bg-red-900/10 rounded-lg p-2.5 border border-red-100 dark:border-red-900/20 text-xs w-full max-w-sm">
                    <span className="font-bold text-red-700 dark:text-red-400 block mb-0.5">
                      {failedUrlErrors?.[paper.pdfUri]?.reason || "Load Failed"}
                    </span>
                    <span className="text-red-600/80 dark:text-red-400/80 leading-snug block">
                      {failedUrlErrors?.[paper.pdfUri]?.actionableMsg || "Could not access file."}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs font-medium text-scholar-600">
                    <Check size={12} className="text-success-600" />
                    <span>Ready to analyze</span>
                  </div>
                )}
              </div>
            </div>

            {isExpanded && notes.length > 0 && (
              <div className="mt-4 pl-0 sm:pl-4 border-l-0 sm:border-l-2 border-gray-100 dark:border-gray-800 space-y-3">
                {notes.map((note, idx) => {
                  const noteId = getNoteId(paper.id, note.pageNumber, idx);
                  return <ResearchCardNote key={noteId} id={noteId} note={note} isSelected={selectedNoteIds.includes(noteId)} onSelect={() => onSelectNote(noteId)} sourceTitle={paper.title} />;
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison - only re-render if these specific props change
  return (
    prevProps.paper.id === nextProps.paper.id &&
    prevProps.paper.analysisStatus === nextProps.paper.analysisStatus &&
    prevProps.paper.notes?.length === nextProps.paper.notes?.length &&
    prevProps.selectedNoteIds === nextProps.selectedNoteIds &&
    prevProps.forceExpanded === nextProps.forceExpanded &&
    prevProps.isLocal === nextProps.isLocal
  );
});

const ResearchCardNote: React.FC<{
  id: string;
  note: DeepResearchNote;
  isSelected: boolean;
  onSelect: () => void;
  sourceTitle?: string;
  showScore?: boolean;
}> = React.memo(({ id, note, isSelected, onSelect, sourceTitle, showScore }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [justCopied, setJustCopied] = useState(false);

  const { toggleContextNote, isNoteInContext } = useResearch();
  const { isNoteSaved, deleteNote, saveNote, savedNotes } = useDatabase();
  const { setSearchHighlight, loadPdfFromUrl, setActivePdf } = useLibrary();
  const { setColumnVisibility } = useUI();

  const isInContext = isNoteInContext(note);
  const isSaved = isNoteSaved(note.pdfUri, note.quote);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(note.quote);
    setJustCopied(true);
    setTimeout(() => setJustCopied(false), 2000);
  };

  const handleContextToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleContextNote(note);
  };

  const handleSaveToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    console.log('[Note Card] Save toggle clicked:', {
      noteUri: note.pdfUri,
      isSaved,
      sourceTitle
    });

    if (isSaved) {
      const savedNote = savedNotes.find(n => n.paper_uri === note.pdfUri && n.content === note.quote);
      if (savedNote && savedNote.id) {
        console.log('[Note Card] Deleting note:', savedNote.id);
        deleteNote(savedNote.id);
      }
    } else {
      console.log('[Note Card] Saving note with paper metadata');
      // Include more complete paper metadata when saving note
      const paperMetadata = {
        uri: note.pdfUri,
        pdfUri: note.pdfUri, // Keep both for compatibility
        title: sourceTitle || 'Untitled Paper',
        summary: '', // We don't have summary in this context
        authors: [], // We don't have authors in this context
        publishedDate: new Date().toISOString(),
      };
      saveNote(note, paperMetadata);
    }
  };

  const handleViewPdf = (e: React.MouseEvent) => {
    e.stopPropagation();
    const cleanedQuote = note.quote.replace(/^[\W\d]+|[\W\d]+$/g, '').trim();
    loadPdfFromUrl(note.pdfUri, sourceTitle);
    setActivePdf(note.pdfUri);
    setSearchHighlight(cleanedQuote);
    setColumnVisibility(prev => ({ ...prev, right: true }));
  };

  return (
    <div
      className={`relative group/note transition-all duration-300 ease-in-out border rounded-xl overflow-hidden cursor-pointer
        ${isExpanded ? "bg-white dark:bg-gray-800" : "bg-white/50 dark:bg-dark-card"}
        ${isSelected ? 'border-scholar-500 ring-1 ring-scholar-500' : 'border-gray-200 dark:border-gray-700 hover:shadow-sm'}
        ${isExpanded ? 'shadow-md ring-1 ring-scholar-100 dark:ring-scholar-900' : ''}
      `}
      onClick={() => setIsExpanded(!isExpanded)}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="pt-1">
            <button
              onClick={(e) => { e.stopPropagation(); onSelect(); }}
              className={`transition-all ${isSelected ? 'text-scholar-600' : 'text-gray-300 hover:text-scholar-600'}`}
            >
              {isSelected ? <Check size={20} strokeWidth={3} /> : <Square size={20} />}
            </button>
          </div>

          <div className="flex-grow min-w-0">
            {/* Updated Note Header with faded paper title for "Most Relevant Notes" view */}
            {sourceTitle && showScore && (
              <div className="mb-1 text-[10px] text-gray-400 dark:text-gray-500 font-bold uppercase tracking-tight truncate">
                {sourceTitle}
              </div>
            )}
            <p className={`text-sm sm:text-base text-gray-800 dark:text-gray-200 leading-relaxed font-serif ${!isExpanded ? 'line-clamp-3' : ''}`}>
              "{note.quote}"
            </p>
            <div className="flex items-center mt-3 gap-2 flex-wrap">
              <span className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-gray-200 dark:border-gray-700">
                PAGE {note.pageNumber}
              </span>

              {isInContext && (
                <span className="bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">
                  IN CONTEXT
                </span>
              )}

              {isSaved && (
                <span className="bg-scholar-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">
                  SAVED
                </span>
              )}

              {!isExpanded && (
                <span className="text-xs text-scholar-600 font-medium ml-auto opacity-0 group-hover/note:opacity-100 transition-opacity">
                  Details
                </span>
              )}
            </div>
          </div>
        </div>

        <div
          className={`
             absolute top-2 right-2 flex items-center gap-1
             transition-all duration-300 
             bg-white dark:bg-gray-800 p-1 rounded-lg border border-gray-100 dark:border-gray-700 shadow-sm
             ${isExpanded ? 'opacity-100' : 'opacity-0 -translate-y-2 group-hover/note:opacity-100 group-hover/note:translate-y-0'}
           `}
          onClick={(e) => e.stopPropagation()}
        >
          <button onClick={handleSaveToggle} className={`p-1.5 rounded-md ${isSaved ? 'text-scholar-600 bg-scholar-50' : 'text-gray-400 hover:bg-gray-100'}`} title="Save to Library">
            <Plus size={16} />
          </button>
          <button onClick={handleContextToggle} className={`p-1.5 rounded-md ${isInContext ? 'text-blue-600 bg-blue-50' : 'text-gray-400 hover:bg-gray-100'}`} title="Add to Context">
            <BookmarkPlus size={16} />
          </button>
          <button onClick={handleViewPdf} className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-scholar-600" title="View in PDF Viewer">
            <BookText size={16} />
          </button>
          <button onClick={handleCopy} className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100" title="Copy text">
            {justCopied ? <Check size={16} /> : <Copy size={16} />}
          </button>
        </div>

        {isExpanded && (
          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 animate-fade-in">
            {showScore && note.relevanceScore && (
              <div className="absolute top-6 right-4 text-right">
                <div className="text-lg font-bold text-scholar-600 dark:text-scholar-400">{Math.round(note.relevanceScore * 100)}%</div>
              </div>
            )}
            {note.justification && (
              <div className="bg-scholar-50 dark:bg-scholar-900/20 rounded-xl p-4 border border-scholar-100 dark:border-scholar-800/30 mb-4">
                <h4 className="text-scholar-800 dark:text-scholar-400 text-md font-black uppercase mb-2 flex items-center gap-2">
                  Justification/Context
                </h4>
                <p className="text-gray-700 dark:text-gray-300 text-xs sm:text-sm leading-relaxed">{note.justification}</p>
                {note.relatedQuestion && (
                  <p className="text-gray-600 dark:text-gray-400 text-xs mt-3 leading-relaxed">
                    <span className="font-semibold">Query:</span> {note.relatedQuestion}
                  </p>
                )}
              </div>
            )}
            {note.citations && note.citations.length > 0 && (
              <div className="mt-4">
                <h4 className="text-gray-400 text-[10px] font-black uppercase mb-3 flex items-center gap-2">
                  <Library size={12} /> References
                </h4>
                <ul className="space-y-3">
                  {note.citations.map((cit, idx) => (
                    <li key={idx} className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 leading-relaxed pl-3 border-l-2 border-scholar-200">
                      <span className="font-bold text-scholar-700 mr-2 bg-scholar-50 px-1 rounded">{cit.inline}</span>
                      {cit.full}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison - only re-render if these specific props change
  return (
    prevProps.id === nextProps.id &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.showScore === nextProps.showScore
  );
});