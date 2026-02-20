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
  AlertTriangle,
  Filter,
  ChevronLeft,
  ChevronRight,
  Minus
} from 'lucide-react';
import { ExternalLinkIcon } from '../ui/icons';

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

const ITEMS_PER_PAGE = 15;

const getNoteId = (paperId: string, page: number, index: number) => `${paperId}-p${page}-i${index}`;

const getSafeTimestamp = (dateStr: string) => {
  if (!dateStr || dateStr.trim() === '') return 0;

  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d.getTime();

  // Regex fallback: Search for any 4-digit year (1900-2099)
  const yearMatch = dateStr.match(/\b(19|20)\d{2}\b/);
  if (yearMatch) return new Date(parseInt(yearMatch[0], 10), 0, 1).getTime();

  return 0;
};

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
    performDeepResearch,
    activeSearchMode,
    setActiveSearchMode,
    stopDeepResearch,
    // NEW: Timing tracking
    researchTimings,
    timeToFirstNotes,
    timeToFirstPaper
  } = useResearch();

  // State Management
  // Initialize from current mode in context to avoid reset when column opens
  const [activeTab, setActiveTab] = useState<TabType>(
    (activeSearchMode === 'web' || activeSearchMode === 'deep') ? activeSearchMode : 'deep'
  );
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortOption>('relevant-papers');
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [allNotesExpanded, setAllNotesExpanded] = useState(true);

  // Filter State
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [localFilters, setLocalFilters] = useState({
    paper: 'all',
    query: 'all',
    hasNotes: false
  });

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [isSelectMenuOpen, setIsSelectMenuOpen] = useState(false);

  // Clear Confirmation Modal State
  const [showClearModal, setShowClearModal] = useState(false);
  const [isClearingResults, setIsClearingResults] = useState(false);

  // Sync: Switch tab based on active search mode (keeps SearchBar and View in sync)
  useEffect(() => {
    if (activeSearchMode === 'web' || activeSearchMode === 'deep') {
      setActiveTab(activeSearchMode);
    }
  }, [activeSearchMode]);

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

  // STEP 1: Filter papers based on criteria
  const filteredPapers = useMemo(() => {
    let base = [...currentTabCandidates];

    // Filter 1: Text search across titles, abstracts, and notes
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      base = base.filter(paper => {
        const titleMatch = paper.title.toLowerCase().includes(q);
        const abstractMatch = paper.summary?.toLowerCase().includes(q);
        const notesMatch = paper.notes?.some(note =>
          note.quote.toLowerCase().includes(q) ||
          note.justification?.toLowerCase().includes(q)
        );
        return titleMatch || abstractMatch || notesMatch;
      });
    }

    // Filter 2: Specific paper
    if (localFilters.paper !== 'all') {
      base = base.filter(p => p.id === localFilters.paper);
    }

    // Filter 3: Specific research query
    if (localFilters.query !== 'all') {
      base = base.filter(p =>
        p.notes?.some(note => note.relatedQuestion === localFilters.query)
      );
    }

    // Filter 4: Only papers with notes
    if (localFilters.hasNotes) {
      base = base.filter(p => p.notes && p.notes.length > 0);
    }

    return base;
  }, [currentTabCandidates, searchQuery, localFilters]);

  // STEP 2: Sort the filtered results
  const content = useMemo(() => {
    if (sortBy === 'most-relevant-notes') {
      // Flat note list sorted by relevance score — filtered by active query if set
      const allNotes = filteredPapers.flatMap(paper =>
        (paper.notes || [])
          .filter(note => {
            if ((note?.quote || '').toString().trim().length === 0) return false;
            if (localFilters.query && localFilters.query !== 'all') {
              return note.relatedQuestion === localFilters.query;
            }
            return true;
          })
          .map((note, idx) => ({
            ...note,
            sourcePaper: paper,
            uniqueId: getNoteId(paper.id, note.pageNumber, idx)
          }))
      );
      return allNotes.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));

    } else if (sortBy === 'newest-papers') {
      // Pure date sort — no live reordering while processing
      return [...filteredPapers].sort((a, b) =>
        getSafeTimestamp(b.publishedDate) - getSafeTimestamp(a.publishedDate)
      );

    } else {
      // 'relevant-papers' (default): papers with notes bubble up live as processing runs
      return [...filteredPapers].sort((a, b) => {
        const aNotes = a.notes?.length || 0;
        const bNotes = b.notes?.length || 0;
        const aIsProcessing = ['downloading', 'processing', 'extracting'].includes(a.analysisStatus || '');
        const bIsProcessing = ['downloading', 'processing', 'extracting'].includes(b.analysisStatus || '');

        // TIER 1: Papers WITH notes float to the top immediately (live re-order as notes arrive)
        const aHasNotes = aNotes > 0;
        const bHasNotes = bNotes > 0;
        if (aHasNotes !== bHasNotes) return bHasNotes ? 1 : -1;

        // TIER 2: Among papers with notes, most notes first
        if (aNotes !== bNotes) return bNotes - aNotes;

        // TIER 3: Among papers with no notes yet, actively-processing papers come next
        if (aIsProcessing !== bIsProcessing) return bIsProcessing ? 1 : -1;

        // TIER 4: Tiebreak by relevance score
        const aScore = a.relevanceScore || 0;
        const bScore = b.relevanceScore || 0;
        return bScore - aScore;
      });
    }
  }, [filteredPapers, sortBy, selectedArxivIds]);

  // Pagination: Reset to page 1 when filters or sorting change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, localFilters, sortBy]);

  // Pagination: Slice content for current page
  const paginatedContent = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return content.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [content, currentPage]);

  const totalPages = Math.ceil(content.length / ITEMS_PER_PAGE);

  // Generate paper dropdown options based on current filter context
  // Excludes the paper filter itself to show what papers are available given other active filters
  const uniquePapers = useMemo(() => {
    let base = [...currentTabCandidates];

    // Apply text search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      base = base.filter(paper => {
        const titleMatch = paper.title.toLowerCase().includes(q);
        const abstractMatch = paper.summary?.toLowerCase().includes(q);
        const notesMatch = paper.notes?.some(note =>
          note.quote.toLowerCase().includes(q) ||
          note.justification?.toLowerCase().includes(q)
        );
        return titleMatch || abstractMatch || notesMatch;
      });
    }

    // Apply "has notes" filter
    if (localFilters.hasNotes) {
      base = base.filter(p => p.notes && p.notes.length > 0);
    }

    // Apply query filter (but NOT paper filter - that's what we're generating options for)
    if (localFilters.query !== 'all') {
      base = base.filter(p =>
        p.notes?.some(note => note.relatedQuestion === localFilters.query)
      );
    }

    // Extract and sort unique papers
    return base
      .map(p => ({ id: p.id, title: p.title }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [currentTabCandidates, searchQuery, localFilters.hasNotes, localFilters.query]);

  // Generate query dropdown options based on current filter context
  // Excludes the query filter itself to show what queries are available given other active filters
  const uniqueQueries = useMemo(() => {
    let base = [...currentTabCandidates];

    // Apply text search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      base = base.filter(paper => {
        const titleMatch = paper.title.toLowerCase().includes(q);
        const abstractMatch = paper.summary?.toLowerCase().includes(q);
        const notesMatch = paper.notes?.some(note =>
          note.quote.toLowerCase().includes(q) ||
          note.justification?.toLowerCase().includes(q)
        );
        return titleMatch || abstractMatch || notesMatch;
      });
    }

    // Apply "has notes" filter
    if (localFilters.hasNotes) {
      base = base.filter(p => p.notes && p.notes.length > 0);
    }

    // Apply paper filter (but NOT query filter - that's what we're generating options for)
    if (localFilters.paper !== 'all') {
      base = base.filter(p => p.id === localFilters.paper);
    }

    // Extract unique queries and sort
    const queries = new Set<string>();
    base.forEach(paper => {
      paper.notes?.forEach(note => {
        if (note.relatedQuestion) queries.add(note.relatedQuestion);
      });
    });

    return Array.from(queries).sort();
  }, [currentTabCandidates, searchQuery, localFilters.hasNotes, localFilters.paper]);

  const handleResetFilters = useCallback(() => {
    setSearchQuery('');
    setLocalFilters({
      paper: 'all',
      query: 'all',
      hasNotes: false
    });
  }, []);

  // Auto-reset invalid filter selections when dropdown options change
  // This prevents showing a selected paper/query that's been filtered out
  useEffect(() => {
    // If selected paper is no longer in the available options, reset it
    if (localFilters.paper !== 'all') {
      const paperExists = uniquePapers.some(p => p.id === localFilters.paper);
      if (!paperExists) {
        setLocalFilters(prev => ({ ...prev, paper: 'all' }));
      }
    }
  }, [uniquePapers, localFilters.paper]);

  useEffect(() => {
    // If selected query is no longer in the available options, reset it
    if (localFilters.query !== 'all') {
      const queryExists = uniqueQueries.includes(localFilters.query);
      if (!queryExists) {
        setLocalFilters(prev => ({ ...prev, query: 'all' }));
      }
    }
  }, [uniqueQueries, localFilters.query]);

  const handleSelectAllPapers = useCallback(() => {
    // Only handle ArXiv candidates selection
    if (selectedArxivIds.size === candidates.length) {
      clearArxivSelection();
    } else {
      // FIXED: Only select papers that haven't failed
      const selectablePapers = candidates.filter(p => p.analysisStatus !== 'failed');
      selectAllArxivPapers(selectablePapers.map(p => p.id));
    }
  }, [selectedArxivIds.size, candidates, clearArxivSelection, selectAllArxivPapers]);

  // Select all papers on current page
  const handleSelectPage = useCallback(() => {
    // FIXED: Filter out failed papers from both views
    const pagePaperIds = sortBy === 'most-relevant-notes'
      ? Array.from(new Set(
          paginatedContent
            .map(n => (n as any).sourcePaper)
            .filter(p => p.analysisStatus !== 'failed')
            .map(p => p.id)
        ))
      : (paginatedContent as ArxivPaper[])
        .filter(p => p.analysisStatus !== 'failed')
        .map(p => p.id);

    // Check if everything on page is already selected
    const allPageSelected = pagePaperIds.every(id => selectedArxivIds.has(id));

    if (allPageSelected) {
      // Deselect only these papers
      pagePaperIds.forEach(id => {
        if (selectedArxivIds.has(id)) {
          clearArxivSelection();
          // Re-add all except page items
          const remainingIds = Array.from(selectedArxivIds).filter(sid => !pagePaperIds.includes(sid));
          if (remainingIds.length > 0) {
            selectAllArxivPapers(remainingIds);
          }
        }
      });
    } else {
      // Add all page items to selection
      const currentSelection = Array.from(selectedArxivIds);
      const newSelection = Array.from(new Set([...currentSelection, ...pagePaperIds]));
      selectAllArxivPapers(newSelection);
    }
    setIsSelectMenuOpen(false);
  }, [paginatedContent, selectedArxivIds, sortBy, selectAllArxivPapers, clearArxivSelection]);

  // Select all papers in current filtered/sorted results
  const handleSelectAllTotal = useCallback(() => {
    // FIXED: Only select papers that haven't failed
    const selectableContent = sortBy === 'most-relevant-notes'
      ? content
        .filter(n => (n as any).sourcePaper.analysisStatus !== 'failed')
        .map(n => (n as any).sourcePaper.id)
      : (content as ArxivPaper[])
        .filter(p => p.analysisStatus !== 'failed')
        .map(p => p.id);
    
    // Deduplicate in case of notes view
    const allIds = Array.from(new Set(selectableContent));
    selectAllArxivPapers(allIds);
    setIsSelectMenuOpen(false);
  }, [content, sortBy, selectAllArxivPapers]);

  // Handle clear all results confirmation
  const handleConfirmClear = useCallback(async () => {
    setIsClearingResults(true);
    try {
      clearDeepResearchResults();
      setShowClearModal(false);
    } finally {
      setIsClearingResults(false);
    }
  }, [clearDeepResearchResults]);

  // FIXED: Calculate selectable papers (excluding failed ones)
  const selectablePapersCount = useMemo(() => {
    if (sortBy === 'most-relevant-notes') {
      const uniquePapers = new Set(
        paginatedContent
          .map(n => (n as any).sourcePaper)
          .filter(p => p.analysisStatus !== 'failed')
          .map(p => p.id)
      );
      return uniquePapers.size;
    }
    return (paginatedContent as ArxivPaper[])
      .filter(p => p.analysisStatus !== 'failed').length;
  }, [paginatedContent, sortBy]);

  // FIXED: Calculate total selectable papers (excluding failed ones)
  const selectableTotalCount = useMemo(() => {
    if (sortBy === 'most-relevant-notes') {
      const uniquePapers = new Set(
        content
          .map(n => (n as any).sourcePaper)
          .filter(p => p.analysisStatus !== 'failed')
          .map(p => p.id)
      );
      return uniquePapers.size;
    }
    return (content as ArxivPaper[])
      .filter(p => p.analysisStatus !== 'failed').length;
  }, [content, sortBy]);

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
              {/* Select All Papers - Dropdown Menu */}
              {sortBy !== 'most-relevant-notes' && currentTabCandidates.length > 0 && (
                <div className="relative">
                  <button
                    onClick={() => setIsSelectMenuOpen(!isSelectMenuOpen)}
                    className="flex items-center gap-1 p-2 text-gray-500 dark:text-gray-400 hover:text-scholar-600 dark:hover:text-scholar-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-all"
                    title="Selection options"
                  >
                    <div className={`w-6 h-6 rounded border-2 transition-colors flex items-center justify-center ${selectedArxivIds.size === content.length ? 'bg-scholar-600 border-scholar-600' :
                      selectedArxivIds.size > 0 ? 'bg-scholar-100 dark:bg-scholar-900/30 border-scholar-600' : 'border-gray-400 dark:border-gray-500'
                      }`}>
                      {selectedArxivIds.size === content.length ? <Check size={16} color="white" strokeWidth={3} /> :
                        selectedArxivIds.size > 0 ? <Minus size={16} className="text-scholar-600 dark:text-scholar-400" strokeWidth={3} /> : null}
                    </div>
                    <ChevronDown size={14} className="opacity-60" />
                  </button>

                  {isSelectMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setIsSelectMenuOpen(false)} />
                      <div className="absolute left-0 top-full mt-2 w-64 bg-white dark:bg-dark-card rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 z-50 py-1.5 animate-fade-in">
                        <button
                          onClick={handleSelectPage}
                          className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                        >
                          <LayoutList size={16} className="text-gray-400" />
                          <span className="text-sm font-medium text-gray-700 dark:text-white">Select Current Page ({selectablePapersCount})</span>
                        </button>
                        <button
                          onClick={handleSelectAllTotal}
                          className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                        >
                          <Layers size={16} className="text-gray-400" />
                          <span className="text-sm font-medium text-gray-700 dark:text-white">Select All Total ({selectableTotalCount})</span>
                        </button>
                        <div className="h-px bg-gray-100 dark:bg-gray-700 mx-3 my-1" />
                        <button
                          onClick={() => { clearArxivSelection(); setIsSelectMenuOpen(false); }}
                          className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        >
                          <X size={16} className="text-red-500" />
                          <span className="text-sm font-medium text-red-600 dark:text-red-400">Clear Selection</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              <button
                onClick={() => { setActiveTab('web'); setActiveSearchMode('web'); }}
                className={`deep-tab-button px-4 py-1  text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${activeTab === 'web' ? 'border-scholar-600 text-scholar-600 dark:text-scholar-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}
              >
                <Search size={20} className="flex-shrink-0" />
                <span className="tab-label deep-tab-label">Web Search</span>
              </button>

              <button
                onClick={() => { setActiveTab('deep'); setActiveSearchMode('deep'); }}
                className={`deep-tab-button px-4 py-1 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${activeTab === 'deep' ? 'border-scholar-600 text-scholar-600 dark:text-scholar-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}
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
              {activeTab === 'deep' && !isBlurred && (currentTabCandidates.length > 0 || totalNotes > 0) && (
                <div className="relative">
                  <button
                    onClick={() => setIsSortOpen(!isSortOpen)}
                    className="flex items-center gap-2 px-3 py-2.5 text-xs font-bold text-gray-600 dark:text-gray-300 hover:text-scholar-600 dark:hover:text-scholar-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-all"
                    title="Sort options"
                  >
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
                          <Star size={16} className={sortBy === 'most-relevant-notes' ? "text-scholar-600 dark:text-scholar-400" : "text-gray-400"} />
                          <span className="text-sm font-medium text-gray-700 dark:text-white">Most Relevant Notes</span>
                        </button>
                        <div className="h-px bg-gray-100 dark:bg-gray-700 mx-3 my-1"></div>
                        <button onClick={() => { setSortBy('relevant-papers'); setAllNotesExpanded(false); setIsSortOpen(false); }} className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                          <Layers size={16} className={sortBy === 'relevant-papers' ? "text-scholar-600 dark:text-scholar-400" : "text-gray-400"} />
                          <span className="text-sm font-medium text-gray-700 dark:text-white">Relevant Papers</span>
                        </button>
                        <button onClick={() => { setSortBy('newest-papers'); setAllNotesExpanded(false); setIsSortOpen(false); }} className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                          <Calendar size={16} className={sortBy === 'newest-papers' ? "text-scholar-600 dark:text-scholar-400" : "text-gray-400"} />
                          <span className="text-sm font-medium text-gray-700 dark:text-white">Newest Papers</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>)}

            </div>
          </div>

          {/* Secondary Action Bar - Below Header */}
          {activeTab === 'deep' && !isBlurred && (currentTabCandidates.length > 0 || totalNotes > 0) && (
            <div className="flex items-center justify-between mb-4 px-1 animate-fade-in">
              {/* LEFT SIDE - Clear All */}
              <div>
                {researchPhase !== 'searching' && (
                  <button
                    onClick={() => setShowClearModal(true)}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    title="Clear all results"
                  >
                    <X size={20} />
                    <span className="hidden sm:inline">Clear All Results</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
              <div className="flex items-center gap-2">
                {/* Filter Button */}
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className={`flex items-center gap-2 px-3 py-2.5 text-xs font-bold rounded-lg transition-all ${showFilters || searchQuery || localFilters.paper !== 'all' || localFilters.query !== 'all' || localFilters.hasNotes
                    ? 'text-scholar-600 dark:text-scholar-400 bg-scholar-50 dark:bg-scholar-900/30'
                    : 'text-gray-600 dark:text-gray-300 hover:text-scholar-600 dark:hover:text-scholar-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  title="Filter options"
                >
                  <Filter size={20} />
                  <span className="deep-sort-text">Filters</span>
                </button>
 
                {searchQuery || localFilters.paper !== 'all' || localFilters.query !== 'all' || localFilters.hasNotes
                    ? (
                <button
                  onClick={handleResetFilters}
                  className="text-[8px] font-bold text-red-700 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 hover:underline transition-all"
                >
                  Reset Filters
                </button>
                    ): null}

                </div>

                {/* Collapse/Expand All Notes */}
                {sortBy !== 'most-relevant-notes' && currentTabCandidates.some(p => p.notes && p.notes.length > 0) && (
                  <button
                    onClick={() => setAllNotesExpanded(!allNotesExpanded)}
                    className="p-2.5 text-gray-500 dark:text-gray-400 font-bold hover:text-scholar-600 dark:hover:text-scholar-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-all"
                    title={allNotesExpanded ? 'Collapse all notes' : 'Expand all notes'}
                  >
                    {allNotesExpanded ? <ChevronsUp size={24} /> : <ChevronsDown size={24} />}
                  </button>
                )}
                </div>
              </div>
          )}


          {/* Filter Panel */}
          {showFilters && activeTab === 'deep' && !isBlurred && (
            <div className="relative bg-white/80 dark:bg-gray-950/90 backdrop-blur-xl border border-gray-100 dark:border-gray-800 rounded-2xl p-5 pt-2 sm:p-7 pb-1 sm:pb-2  mb-6 shadow-xl animate-fade-in ring-1 ring-black/5 dark:ring-white/5">
              {/* Close Button */}
              <button
                onClick={() => setShowFilters(false)}
                className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-all z-10"
                title="Close filters"
              >
                <X size={18} />
              </button>

              <div className="flex flex-col gap-5 sm:grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 sm:gap-6 pt-2">

                {/* Search Input */}
                <div className="sm:col-span-2 space-y-2">
                  <label className="text-[10px] sm:text-[11px] font-black text-gray-400 dark:text-scholar-400 uppercase tracking-widest pl-1">
                    Keywords
                  </label>
                  <div className="relative group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-scholar-600 dark:group-focus-within:text-scholar-400 transition-colors" />
                    <input
                      className="w-full bg-white/80 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800 rounded-xl pl-11 pr-10 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 outline-none focus:ring-2 focus:ring-scholar-500/10 shadow-sm transition-all"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search title, notes, insights..."
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Paper Filter */}
                <div className="space-y-2">
                  <label className="text-[10px] sm:text-[11px] font-black text-gray-400 dark:text-scholar-400 uppercase tracking-widest pl-1">
                    Source Paper
                  </label>
                  <select
                    value={localFilters.paper}
                    onChange={(e) => setLocalFilters(prev => ({ ...prev, paper: e.target.value }))}
                    className="w-full bg-white/80 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-scholar-500/10 shadow-sm transition-all appearance-none cursor-pointer"
                  >
                    <option value="all">All Papers ({uniquePapers.length})</option>
                    {uniquePapers.map(p => (
                      <option key={p.id} value={p.id}>{p.title}</option>
                    ))}
                  </select>
                </div>

                {/* Query Filter */}
                <div className="space-y-2">
                  <label className="text-[10px] sm:text-[11px] font-black text-gray-400 dark:text-scholar-400 uppercase tracking-widest pl-1">
                    Research Query
                  </label>
                  <select
                    value={localFilters.query}
                    onChange={(e) => setLocalFilters(prev => ({ ...prev, query: e.target.value }))}
                    className="w-full bg-white/80 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-scholar-500/10 shadow-sm transition-all appearance-none cursor-pointer"
                  >
                    <option value="all">All Queries ({uniqueQueries.length})</option>
                    {uniqueQueries.map(q => (
                      <option key={q} value={q}>{q}</option>
                    ))}
                  </select>
                </div>

                {/* Has Notes Toggle */}
                <div className="space-y-2">
                  <label className="text-[10px] sm:text-[11px] font-black text-gray-400 dark:text-scholar-400 uppercase tracking-widest pl-1">
                    Refine
                  </label>
                  <div className="flex gap-2">
                    {/* Hide "With Notes" filter in note view - all items are notes by definition */}
                    {sortBy !== 'most-relevant-notes' && (
                      <button
                        onClick={() => setLocalFilters(prev => ({ ...prev, hasNotes: !prev.hasNotes }))}
                        className={`flex-1 px-3 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${localFilters.hasNotes
                          ? 'bg-scholar-600 text-white shadow-md'
                          : 'bg-white/80 dark:bg-gray-900/50 text-gray-600 dark:text-gray-300 border border-gray-100 dark:border-gray-800'
                          }`}
                      >
                        With Notes
                      </button>
                    )}
                  </div>
                </div>

              </div>

              {/* Filter Panel Footer - Minimal Reset */}
              <div className="flex justify-end mt-2">
                <button
                  onClick={handleResetFilters}
                  className="text-[10px] font-bold text-red-700 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 hover:underline transition-all"
                >
                  Reset Filters
                </button>
              </div>
            </div>
          )}
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
            <Search size={64} className="mb-6 text-gray-300 dark:text-gray-600" />
            <h3 className="text-xl font-bold text-gray-800 dark:text-white">No web search results</h3>
            <p className="text-xs max-w-xs leading-relaxed text-gray-500 dark:text-gray-400">Enter a query in the search bar to find relevant sources.</p>
          </div>
        )}

        {/* Deep Research Tab - Show results */}
        {activeTab === 'deep' && !isBlurred && currentTabCandidates.length > 0 && (
          <div className="flex items-center justify-between px-1 mb-2 animate-fade-in">
            <div className="text-sm text-gray-500 dark:text-gray-400 font-medium flex items-center gap-2">
              <BookOpenText size={14} className="opacity-60" />
              About {currentTabCandidates.length} paper{currentTabCandidates.length !== 1 ? 's' : ''} with {totalNotes} note{totalNotes !== 1 ? 's' : ''} found
            
                {/* NEW: Add timing display */}
                  {timeToFirstNotes !== null && (
                    <>
                      <span className="text-xs text-gray-400 mx-0.5">•</span>
                      <span className="text-sm text-gray-500 dark:text-scholar-400 font-medium">
                         {(timeToFirstNotes / 1000).toFixed(2)}s
                      </span>
                    </>
                  )}
            </div>

            {/* Abort Button - Visible during active research phases */}
            {(['initializing', 'searching', 'filtering', 'extracting'].includes(researchPhase)) && (
              <button
                onClick={stopDeepResearch}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/50 rounded-md hover:bg-red-100 dark:hover:bg-red-900/40 transition-all animate-pulse shadow-sm"
                title="Stop research"
              >
                <Square size={10} fill="currentColor" />
                Stop Research
              </button>
            )}
          </div>
        )}

        {/* Empty state when filters return no results */}
        {activeTab === 'deep' && !isBlurred && currentTabCandidates.length > 0 && filteredPapers.length === 0 && (
          <div className="py-16 flex flex-col items-center justify-center text-center opacity-60 animate-fade-in">
            <TextSearch size={48} className="mb-4 text-gray-300 dark:text-gray-600" />
            <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-2">No papers match your filters</h3>
            <p className="text-xs max-w-xs leading-relaxed text-gray-500 dark:text-gray-400 mb-4">
              Try adjusting your search or filter criteria
            </p>
            <button
              onClick={handleResetFilters}
              className="text-xs font-medium text-scholar-600 dark:text-scholar-400 hover:underline"
            >
              Reset all filters
            </button>
          </div>
        )}

        {activeTab === 'deep' && (
          <div className={sortBy === 'most-relevant-notes' ? "space-y-4" : "space-y-8"}>
            {sortBy === 'most-relevant-notes' ? (
              (paginatedContent as any[]).filter((note: any) => (note?.quote || '').trim().length > 0).map((note) => (
                <ResearchCardNote
                  key={note.uniqueId}
                  id={note.uniqueId}
                  note={note}
                  isSelected={selectedNoteIds.includes(note.uniqueId)}
                  onSelect={() => handleSelectNote(note.uniqueId)}
                  sourceTitle={note.sourcePaper.title}
                  sourcePaper={note.sourcePaper}
                  showScore={true}
                />
              ))
            ) : (
              (paginatedContent as ArxivPaper[]).map((paper) => (
                <PaperCard
                  key={paper.id}
                  paper={paper}
                  selectedNoteIds={selectedNoteIds}
                  onSelectNote={handleSelectNote}
                  forceExpanded={allNotesExpanded}
                  onView={() => onViewPdf && onViewPdf(paper)}
                  isLocal={false}
                  activeQuery={localFilters.query}
                />
              ))
            )}
          </div>
        )}

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
            <BookOpenText size={64} className="mb-6 text-gray-300 dark:text-gray-600" />
            <h3 className="text-xl font-bold text-gray-800 dark:text-white">No deep research results</h3>
            <p className="text-xs max-w-xs leading-relaxed text-gray-500 dark:text-gray-400">Enter topics in the search bar to find academic papers.</p>
          </div>
        )}

        {/* Pagination Bar - NotesManager Style */}
        {activeTab === 'deep' && !isBlurred && totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-8 mt-12 sm:mt-16 mb-12 pagination-controls border-t border-gray-100 dark:border-gray-800 pt-8">
            <div className="flex items-center gap-4">
              <button
                onClick={() => {
                  setCurrentPage(prev => Math.max(1, prev - 1));
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                disabled={currentPage === 1}
                className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-card hover:bg-scholar-50 dark:hover:bg-scholar-900/20 hover:border-scholar-200 dark:hover:border-scholar-800 disabled:opacity-30 disabled:hover:bg-transparent shadow-sm transition-all"
                title="Previous page"
              >
                <ChevronLeft size={20} className="text-gray-600 dark:text-gray-300" />
              </button>

              <span className="text-sm font-bold text-gray-500 dark:text-gray-400 font-mono tracking-widest uppercase">
                PAGE {currentPage} <span className="text-gray-300 dark:text-gray-700 mx-2">/</span> {totalPages}
              </span>

              <button
                onClick={() => {
                  setCurrentPage(prev => Math.min(totalPages, prev + 1));
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                disabled={currentPage === totalPages}
                className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-card hover:bg-scholar-50 dark:hover:bg-scholar-900/20 hover:border-scholar-200 dark:hover:border-scholar-800 disabled:opacity-30 disabled:hover:bg-transparent shadow-sm transition-all"
                title="Next page"
              >
                <ChevronRight size={20} className="text-gray-600 dark:text-gray-300" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Clear All Confirmation Modal */}
      {showClearModal && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-transparent" onClick={() => !isClearingResults && setShowClearModal(false)} />

          <div className="relative w-full max-w-sm bg-white dark:bg-gray-900 rounded-xl shadow-2xl ring-1 ring-gray-900/5 dark:ring-white/10 p-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="text-center mb-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Clear All Research Results?
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                This will remove all {activeTab === 'web' ? 'web search' : 'deep research'} results and any unsaved notes. This action cannot be undone.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setShowClearModal(false)}
                disabled={isClearingResults}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmClear}
                disabled={isClearingResults}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm transition-colors flex items-center justify-center gap-2"
              >
                {isClearingResults ? <Loader2 size={16} className="animate-spin" /> : null}
                Clear All
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingDeepResearchQuery && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-transparent" onClick={() => setPendingDeepResearchQuery(null)} />

          <div className="relative w-full max-w-lg bg-white dark:bg-gray-900 rounded-xl shadow-2xl ring-1 ring-gray-900/5 dark:ring-white/10 p-8 animate-in fade-in zoom-in-95 duration-200">
            <div className="text-center mb-8">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">
                Start New Research Session?
              </h3>
              <p className="text-base text-gray-500 dark:text-gray-400 leading-relaxed">
                Starting a new search will <span className="font-semibold text-gray-900 dark:text-gray-200">permanently clear</span> your current research results and any unsaved notes.
                <br /><br />
                Are you sure you want to discard your current progress?
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setPendingDeepResearchQuery(null)}
                className="px-6 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors border border-gray-200 dark:border-gray-700"
              >
                Go Back
              </button>
              <button
                onClick={() => {
                  performDeepResearch(pendingDeepResearchQuery);
                  setPendingDeepResearchQuery(null);
                }}
                className="px-6 py-3 text-sm font-bold text-white bg-scholar-600 hover:bg-scholar-700 rounded-lg shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 transform hover:-translate-y-0.5"
              >
                <Sparkles size={18} />
                Start New Session
              </button>
            </div>
          </div>
        </div>
      )}
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
  activeQuery?: string; // 'all' or specific query string — filters which notes render
}

const PaperCard: React.FC<PaperCardProps> = React.memo(({ paper, selectedNoteIds, onSelectNote, onView, isLocal = false, forceExpanded = true, activeQuery = 'all' }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isAbstractExpanded, setIsAbstractExpanded] = useState(false);
  const { toggleArxivSelection, selectedArxivIds } = useResearch();
  const { isPaperSaved, savePaper, deletePaper } = useDatabase();
  const { loadedPdfs, isPdfInContext, togglePdfContext, loadPdfFromUrl, setActivePdf, failedUrlErrors, downloadingUris } = useLibrary();
  const { setColumnVisibility, openColumn: openUIColumn } = useUI();

  const isSelected = isLocal ? isPdfInContext(paper.id) : selectedArxivIds.has(paper.id);
  const isSaved = isPaperSaved(paper.pdfUri);

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
  const visibleNotes = (notes || []).filter(n => {
    if ((n?.quote || '').toString().trim().length === 0) return false;
    if (activeQuery && activeQuery !== 'all') return n.relatedQuestion === activeQuery;
    return true;
  });

  useEffect(() => {
    if (visibleNotes.length > 0) {
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
    
    // FIXED: If paper failed to download, open external link instead
    if (isFailed && paper.pdfUri) {
      window.open(paper.pdfUri, '_blank', 'noopener,noreferrer');
      return;
    }
    
    if (isLocal) {
      setActivePdf(paper.id);
      openUIColumn('right');
    } else if (onView) {
      onView();
    }
  };

  const handleAddToSources = async (e: React.MouseEvent) => {
    e.stopPropagation();

    if (isSaved) {
      // Now does a true delete (paper + cascade deletes notes)
      deletePaper(paper.pdfUri);
      return;
    }
    // Save the paper to Sources without loading or activating the PDF.
    // Loading the PDF (via `loadPdfFromUrl`) sets the active PDF which
    // can cause the right-hand PDF viewer to open. We avoid that here so
    // "Add to Sources" only saves the paper.
    const paperData = {
      ...paper,
      uri: paper.pdfUri,
      pdfUri: paper.pdfUri
    };

    savePaper(paperData);
    openUIColumn('left');
  };

  return (
    <div className="group/paper animate-fade-in relative transition-colors">
      <div className={isExpanded ? 'p-1' : ''}>
        <div className="flex items-start">
          <div className="pt-1 mr-2 sm:mr-4">
            <button onClick={handleSelectionToggle} className={`hover:text-scholar-600 dark:hover:text-scholar-400 transition-colors opacity-100 sm:group-hover/paper:opacity-100 ${isSelected ? 'text-scholar-600 dark:text-scholar-400' : 'text-gray-400 dark:text-gray-500 sm:opacity-0'}`}>
              {(isDownloading || isProcessing) ? <Loader2 size={24} className="animate-spin" />
                : isSelected ? <Check size={24} className="text-scholar-600 dark:text-scholar-400" /> : <Square size={24} />}
            </button>
          </div>

          <div className="flex-grow min-w-0">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <span className="font-semibold text-scholar-600 dark:text-scholar-400 uppercase tracking-wider">
                  {isLocal ? 'LOCAL' : (paper.publishedDate?.match(/\b(19|20)\d{2}\b/)?.[0] || <span className="lowercase text-[10px] opacity-70">unknown</span>)}
                </span>
                <span>•</span>
                <span className="truncate max-w-[400px] font-serif italic opacity-80">
                  {paper.authors.slice(0, 2).join(', ') + (paper.authors.length > 2 ? ' et al.' : '')}
                </span>

                <div className="flex items-center gap-2 ml-4 opacity-100 sm:opacity-0 sm:group-hover/paper:opacity-100 transition-opacity">
                  {paper.pdfUri ? (
                    <a
                      href={paper.pdfUri}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(ev) => ev.stopPropagation()}
                      className="text-gray-400 hover:text-gray-600 mr-1"
                      title="Open PDF externally"
                    >
                      <ExternalLinkIcon className="h-4 w-4" />
                    </a>
                  ) : null}

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

            <h3 className="text-base sm:text-2xl font-bold text-gray-900 dark:text-gray-100 leading-snug mb-1 cursor-pointer hover:text-scholar-600 dark:hover:text-scholar-400 transition-colors" onClick={handleOpenPdf}>
              {paper.title}
            </h3>

            

            {paper.harvardReference && (
              <p className="text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 font-serif italic mb-2 leading-tight">
                {paper.harvardReference}
              </p>
            )}

            <p
              role="button"
              aria-expanded={isAbstractExpanded}
              onClick={(e) => { e.stopPropagation(); setIsAbstractExpanded(prev => !prev); }}
              className={`text-sm text-gray-600 dark:text-gray-300 leading-relaxed ${isAbstractExpanded ? '' : 'line-clamp-2'} mb-3 cursor-pointer`}
            >
              {paper.summary}
              {isAbstractExpanded && (
                <span className="inline-flex items-center dark:text-scholar-400 ml-2 pt-3 text-gray-500 hover:text-gray-700" aria-hidden="true">
                  <ChevronUp size={30} />
                </span>
              )}
            </p>

            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-3">
                {(isDownloading || isProcessing || isExtracting) ? (
                  <div className="flex items-center gap-1.5 text-xs font-medium text-scholar-600 dark:text-scholar-400">
                    <Loader2 size={12} className="animate-spin" />
                    <span className="animate-pulse">{getStatusText()}</span>
                  </div>
                ) : visibleNotes.length > 0 ? (
                  <button onClick={() => setIsExpanded(!isExpanded)} className="flex items-center gap-1.5 text-base font-semibold text-scholar-600 dark:text-scholar-400 hover:text-scholar-800 dark:hover:text-scholar-300 transition-colors">
                    {visibleNotes.length} Note{visibleNotes.length !== 1 ? 's' : ''} {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </button>
                ) : isCompleted ? (
                  <span className="text-xs text-gray-400 italic">No notes extracted</span>
                ) : isStopped ? (
                  <span className="text-xs text-gray-400 italic flex items-center gap-1"><Square size={12} /> stopped</span>
                ) : isFailed ? (
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-red-700 dark:text-red-400">
                    <X size={14} className="text-red-800 dark:text-red-500 flex-shrink-0" />
                    <span className="truncate">
                      {failedUrlErrors?.[paper.pdfUri]?.reason || "Load Failed"}: {failedUrlErrors?.[paper.pdfUri]?.actionableMsg || "Could not access file."}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs font-medium text-scholar-600 dark:text-scholar-400">
                    <Check size={12} className="text-success-600" />
                    <span>Ready to analyze</span>
                  </div>
                )}
              </div>
            </div>

            {isExpanded && visibleNotes.length > 0 && (
              <div className="mt-4 pl-0 sm:pl-4 border-l-0 sm:border-l-2 border-gray-100 dark:border-gray-800 space-y-3">
                {visibleNotes.map((note, idx) => {
                  const noteId = getNoteId(paper.id, note.pageNumber, idx);
                  return <ResearchCardNote key={noteId} id={noteId} note={note} isSelected={selectedNoteIds.includes(noteId)} onSelect={() => onSelectNote(noteId)} sourceTitle={paper.title} sourcePaper={paper} />;
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
    prevProps.activeQuery === nextProps.activeQuery &&
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
  sourcePaper?: ArxivPaper;  // ADD: Full paper metadata for rich note saving
}> = React.memo(({ id, note, isSelected, onSelect, sourceTitle, showScore, sourcePaper }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [justCopied, setJustCopied] = useState(false);

  const { toggleContextNote, isNoteInContext, setActiveSearchMode } = useResearch();
  const { isNoteSaved, deleteNote, saveNote, savedNotes } = useDatabase();
  const { setSearchHighlight, loadPdfFromUrl, setActivePdf } = useLibrary();
  const { openColumn: openUIColumn } = useUI();

  // Helper function for smart paper metadata extraction with multiple fallbacks
  const createPaperMetadata = useCallback((
    note: DeepResearchNote,
    sourcePaper?: ArxivPaper,
    sourceTitle?: string
  ) => {
    // Priority 1: Use sourcePaper prop if available (most complete data)
    if (sourcePaper) {
      return {
        uri: sourcePaper.pdfUri,
        pdfUri: sourcePaper.pdfUri,
        title: sourcePaper.title,
        summary: sourcePaper.summary || '',
        authors: sourcePaper.authors || [],
        publishedDate: sourcePaper.publishedDate,
      };
    }

    // Priority 2: Check if note has sourcePaper attached (from "Most Relevant Notes" view)
    if ('sourcePaper' in note && (note as any).sourcePaper) {
      const paper = (note as any).sourcePaper as ArxivPaper;
      return {
        uri: paper.pdfUri,
        pdfUri: paper.pdfUri,
        title: paper.title,
        summary: paper.summary || '',
        authors: paper.authors || [],
        publishedDate: paper.publishedDate,
      };
    }

    // Priority 3: Fallback to minimal data (maintains backward compatibility)
    return {
      uri: note.pdfUri,
      pdfUri: note.pdfUri,
      title: sourceTitle || 'Untitled Paper',
      summary: '',
      authors: [],
      publishedDate: new Date().toISOString(),
    };
  }, []);

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
      sourceTitle,
      hasSourcePaper: !!sourcePaper
    });

    if (isSaved) {
      const savedNote = savedNotes.find(n => n.paper_uri === note.pdfUri && n.content === note.quote);
      if (savedNote && savedNote.id) {
        console.log('[Note Card] Deleting note:', savedNote.id);
        deleteNote(savedNote.id);
      }
    } else {
      console.log('[Note Card] Saving note with complete paper metadata');
      // FIXED: Use smart metadata extraction instead of hardcoded empty values
      const paperMetadata = createPaperMetadata(note, sourcePaper, sourceTitle);
      console.log('[Note Card] Paper metadata being saved:', paperMetadata);
      saveNote(note, paperMetadata);
    }
  };

  const handleViewPdf = (e: React.MouseEvent) => {
    e.stopPropagation();

    console.log('\n🔍 [VIEW PDF] User clicked "View PDF" button');
    console.log('   📄 Paper:', sourceTitle);
    console.log('   📝 Note quote:', note.quote.substring(0, 60) + '...');
    console.log('   📍 Page number:', note.pageNumber);
    console.log('   🔗 Note pdfUri:', note.pdfUri);
    console.log('   ❓ Is pdfUri defined:', !!note.pdfUri);
    console.log('   ❓ pdfUri type:', typeof note.pdfUri);
    console.log('   ❓ pdfUri value:', note.pdfUri === undefined ? 'UNDEFINED' : note.pdfUri);

    const cleanedQuote = note.quote.replace(/^[\W\d]+|[\W\d]+$/g, '').trim();
    loadPdfFromUrl(note.pdfUri, sourceTitle);
    setActivePdf(note.pdfUri);
    setSearchHighlight({ text: cleanedQuote, fallbackPage: note.pageNumber });
    openUIColumn('right');
  };

  // Resolve the full paper object — priority: sourcePaper prop → note.sourcePaper (attached during flatmap)
  const resolvedPaper: ArxivPaper | null =
    sourcePaper || (('sourcePaper' in note) ? (note as any).sourcePaper as ArxivPaper : null);
  const paperYear = resolvedPaper?.publishedDate?.match(/\b(19|20)\d{2}\b/)?.[0] ?? null;
  const harvardRef = resolvedPaper?.harvardReference ?? null;

  return (
    <div
      className={`relative group/note transition-all duration-300 ease-in-out border rounded-xl overflow-hidden cursor-pointer
        ${isExpanded ? "bg-white dark:bg-dark-card" : "bg-white/50 dark:bg-dark-card"}
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
              className={`transition-all ${isSelected ? 'text-scholar-600 dark:text-scholar-400' : 'text-gray-300 dark:text-gray-500 hover:text-scholar-600 dark:hover:text-scholar-400'}`}
            >
              {isSelected ? <Check size={20} strokeWidth={3} /> : <Square size={20} />}
            </button>
          </div>

          <div className="flex-grow min-w-0">
            {/* Paper title header — shown in "Most Relevant Notes" view */}
            {sourceTitle && showScore && (
              <div className="mb-2 flex items-baseline gap-2 flex-wrap">
                <button
                  onClick={(e) => { e.stopPropagation(); handleViewPdf(e); }}
                  className="text-sm font-bold text-gray-800 dark:text-gray-100 hover:text-scholar-600 dark:hover:text-scholar-400 transition-colors text-left leading-snug"
                  title="Open in PDF viewer"
                >
                  {sourceTitle}
                </button>
                {paperYear && (
                  <span className="text-xs font-semibold text-scholar-600 dark:text-scholar-400 flex-shrink-0">
                    {paperYear}
                  </span>
                )}
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
                <span className="text-xs text-scholar-600 dark:text-scholar-400 font-medium ml-auto opacity-0 group-hover/note:opacity-100 transition-opacity">
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
          <button onClick={handleSaveToggle} className={`p-1.5 rounded-md ${isSaved ? 'text-scholar-600 bg-scholar-50 dark:bg-scholar-900/30' : 'text-gray-400 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`} title="Save to Library">
            <Plus size={16} />
          </button>
          <button onClick={handleContextToggle} className={`p-1.5 rounded-md ${isInContext ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/30' : 'text-gray-400 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`} title="Add to Context">
            <BookmarkPlus size={16} />
          </button>
          <button onClick={handleViewPdf} className="p-1.5 rounded-md text-gray-400 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-scholar-600 dark:hover:text-scholar-400" title="View in PDF Viewer">
            <BookText size={16} />
          </button>
          <button onClick={handleCopy} className="p-1.5 rounded-md text-gray-400 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700" title="Copy text">
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
            {/* Harvard reference — shown above justification in Most Relevant Notes view */}
            {showScore && harvardRef && (
              <div className="bg-gray-50 dark:bg-gray-900/40 rounded-xl p-3 border border-gray-100 dark:border-gray-800 mb-4">
                <h4 className="text-gray-400 text-[10px] font-black uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                  <Library size={11} /> Harvard Reference
                </h4>
                <p className="text-gray-600 dark:text-gray-300 text-xs leading-relaxed italic">
                  {harvardRef}
                </p>
              </div>
            )}
            {note.justification && (
              <div className="bg-scholar-50 dark:bg-scholar-900/20 rounded-xl p-4 border border-scholar-100 dark:border-scholar-800/30 mb-4">
                <h4 className="text-scholar-800 dark:text-scholar-300 text-md font-black uppercase mb-2 flex items-center gap-2">
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
                    <li key={idx} className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 leading-relaxed pl-3 border-l-2 border-scholar-200 dark:border-scholar-800">
                      <span className="font-bold text-scholar-700 dark:text-scholar-400 mr-2 bg-scholar-50 dark:bg-scholar-900/30 px-1 rounded">{cit.inline}</span>
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