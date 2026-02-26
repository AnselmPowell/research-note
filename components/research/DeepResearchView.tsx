import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Search,
  BookOpenText,
  ChevronDown,
  Check,
  Layers,
  Calendar,
  Star,
  Loader2,
  AlertTriangle,
  X,
  Sparkles,
  LayoutList
} from 'lucide-react';
import { useResearch } from '../../contexts/ResearchContext';
import { useLibrary } from '../../contexts/LibraryContext';
import { useUI } from '../../contexts/UIContext';
// import { useDatabase } from '../../contexts/DatabaseContext';
import { WebSearchView } from '../websearch/WebSearchView';
import { DeepSearch } from './DeepSearch';
import { PaperResults } from './PaperResults';

type TabType = 'web' | 'deep' | 'results';
type SortOption = 'relevant-papers' | 'newest-papers' | 'most-relevant-notes';

export const DeepResearchView: React.FC = () => {
  const {
    researchPhase,
    status,
    candidates,
    filteredCandidates,
    arxivCandidates,
    selectedArxivIds,
    selectAllArxivPapers,
    clearArxivSelection,
    activeSearchMode,
    setActiveSearchMode,
    clearDeepResearchResults,
    pendingDeepResearchQuery,
    setPendingDeepResearchQuery,
    performDeepResearch,
    searchState,
  } = useResearch();

  const {
    setActivePdf,
  } = useLibrary();

  const {
    openColumn,
  } = useUI();

  // Derive web sources from searchState
  const webSearchSources = searchState?.data?.sources || [];

  // Determine candidates based on research phase
  const currentTabCandidates = useMemo(() => {
    return researchPhase === 'extracting' || researchPhase === 'completed'
      ? filteredCandidates
      : arxivCandidates;
  }, [researchPhase, filteredCandidates, arxivCandidates]);

  const isBlurred = researchPhase === 'filtering';
  const isSearching = researchPhase === 'searching' || researchPhase === 'initializing';

  // ─── Shared UI State ───────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<TabType>(
    (activeSearchMode === 'web' || activeSearchMode === 'deep') ? activeSearchMode : 'deep'
  );
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortOption>('relevant-papers');
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [allNotesExpanded, setAllNotesExpanded] = useState(true);
  const [isNoteSelectMenuOpen, setIsNoteSelectMenuOpen] = useState(false);
  const [justCopiedNotes, setJustCopiedNotes] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [localFilters, setLocalFilters] = useState({ paper: 'all', query: 'all', hasNotes: false });
  const [currentPage, setCurrentPage] = useState(1);
  const [isSelectMenuOpen, setIsSelectMenuOpen] = useState(false);
  const [showClearModal, setShowClearModal] = useState(false);
  const [isClearingResults, setIsClearingResults] = useState(false);

  // Sync tab with search mode
  useEffect(() => {
    if (activeSearchMode === 'web' || activeSearchMode === 'deep') {
      setActiveTab(activeSearchMode);
    }
  }, [activeSearchMode]);

  const handleSelectNote = useCallback((id: string) => {
    setSelectedNoteIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }, []);

  const handleBulkCopyNotesFeedback = useCallback(() => {
    setJustCopiedNotes(true);
    setTimeout(() => setJustCopiedNotes(false), 2000);
  }, []);

  const handleClearResults = useCallback(async () => {
    setIsClearingResults(true);
    try {
      clearDeepResearchResults();
      setSelectedNoteIds([]);
      setShowClearModal(false);
    } finally {
      setIsClearingResults(false);
    }
  }, [clearDeepResearchResults]);

  return (
    <div className="flex flex-col h-full bg-cream dark:bg-dark-card animate-in fade-in duration-700">

      {/* ── STICKY HEADER ────────────────────────────────────────────────────── */}
      {!isBlurred && (
        <div className="sticky top-0 z-30 bg-cream/95 dark:bg-dark-card/95 backdrop-blur-sm border-b border-gray-100 dark:border-gray-700 pb-0 mb-3 px-3 sm:px-6 shadow-sm">
          <div className="flex items-center justify-between py-3 gap-4">
            <div className="flex items-center -mb-px">
              <button
                onClick={() => { setActiveTab('web'); setActiveSearchMode('web'); }}
                className={`px-4 py-1 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${activeTab === 'web' ? 'border-scholar-600 text-scholar-600 dark:text-scholar-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}
              >
                <Search size={20} className="flex-shrink-0" />
                <span className="hidden sm:inline">Web Search</span>
              </button>

              <button
                onClick={() => { setActiveTab('deep'); setActiveSearchMode('deep'); }}
                className={`px-4 py-1 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${activeTab === 'deep' ? 'border-scholar-600 text-scholar-600 dark:text-scholar-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}
              >
                <BookOpenText size={20} className="flex-shrink-0" />
                <span className="hidden sm:inline">Deep Research</span>
                {isSearching && activeTab === 'web' && (
                  <Loader2 size={14} className="animate-spin text-scholar-600" />
                )}
              </button>

              <button
                onClick={() => { setActiveTab('results'); setActiveSearchMode('results'); }}
                className={`px-4 py-1 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${activeTab === 'results' ? 'border-scholar-600 text-scholar-600 dark:text-scholar-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}
              >
                <LayoutList size={20} className="flex-shrink-0" />
                <span className="hidden sm:inline">My Results</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              {(activeTab === 'deep' || activeTab === 'results') && (currentTabCandidates.length > 0 || (activeTab === 'results')) && (
                <div className="relative">
                  <button
                    onClick={() => setIsSortOpen(!isSortOpen)}
                    className="flex items-center gap-2 px-3 py-2.5 text-xs font-bold text-gray-600 dark:text-gray-300 hover:text-scholar-600 dark:hover:text-scholar-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-all"
                  >
                    <span className="truncate max-w-[120px]">
                      {sortBy === 'most-relevant-notes' && 'Most Relevant Notes'}
                      {sortBy === 'relevant-papers' && 'Most Relevant Papers'}
                      {sortBy === 'newest-papers' && 'Newest Papers'}
                    </span>
                    <ChevronDown size={16} className={`text-gray-400 transition-transform ${isSortOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {isSortOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setIsSortOpen(false)} />
                      <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-dark-card rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 py-1.5 z-50 animate-fade-in">
                        <button onClick={() => { setSortBy('most-relevant-notes'); setIsSortOpen(false); }} className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800">
                          <Star size={16} className={sortBy === 'most-relevant-notes' ? "text-scholar-600" : "text-gray-400"} />
                          <span className="text-sm font-medium">Most Relevant Notes</span>
                        </button>
                        <div className="h-px bg-gray-100 dark:bg-gray-700 mx-3 my-1" />
                        <button onClick={() => { setSortBy('relevant-papers'); setAllNotesExpanded(false); setIsSortOpen(false); }} className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800">
                          <Layers size={16} className={sortBy === 'relevant-papers' ? "text-scholar-600" : "text-gray-400"} />
                          <span className="text-sm font-medium">Relevant Papers</span>
                        </button>
                        <button onClick={() => { setSortBy('newest-papers'); setAllNotesExpanded(false); setIsSortOpen(false); }} className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800">
                          <Calendar size={16} className={sortBy === 'newest-papers' ? "text-scholar-600" : "text-gray-400"} />
                          <span className="text-sm font-medium">Newest Papers</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB CONTENT ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-60 xs:px-4 py-4 custom-scrollbar">
        {activeTab === 'web' ? (
          <div className="space-y-6">
            {webSearchSources.length > 0 ? (
              webSearchSources.map((source, idx) => (
                <WebSearchView key={`${source.url}-${idx}`} source={source} />
              ))
            ) : (
              <div className="py-24 flex flex-col items-center justify-center text-center opacity-40">
                <Search size={64} className="mb-6" />
                <h3 className="text-xl font-bold">No web search results</h3>
                <p className="text-sm">Perform a search to see relevant web sources.</p>
              </div>
            )}
          </div>
        ) : activeTab === 'results' ? (
          <PaperResults
            allNotesExpanded={allNotesExpanded}
            onAllNotesExpandedChange={setAllNotesExpanded}
            selectedNoteIds={selectedNoteIds}
            onSelectedNoteIdsChange={setSelectedNoteIds}
            onSelectNote={handleSelectNote}
            sortBy={sortBy}
            isSortOpen={isSortOpen}
            showFilters={showFilters}
            searchQuery={searchQuery}
            localFilters={localFilters}
            currentPage={currentPage}
            isSelectMenuOpen={isSelectMenuOpen}
            isNoteSelectMenuOpen={isNoteSelectMenuOpen}
            justCopiedNotes={justCopiedNotes}
            onSortChange={setSortBy}
            onSortOpenChange={setIsSortOpen}
            onShowFiltersChange={setShowFilters}
            onSearchQueryChange={setSearchQuery}
            onLocalFiltersChange={setLocalFilters}
            onCurrentPageChange={setCurrentPage}
            onSelectMenuOpenChange={setIsSelectMenuOpen}
            onNoteSelectMenuOpenChange={setIsNoteSelectMenuOpen}
            onBulkCopyNotes={handleBulkCopyNotesFeedback}
            onShowClearModal={() => setShowClearModal(true)}
            status={status}
          />
        ) : (
          <DeepSearch
            allNotesExpanded={allNotesExpanded}
            onAllNotesExpandedChange={setAllNotesExpanded}
            selectedNoteIds={selectedNoteIds}
            onSelectedNoteIdsChange={setSelectedNoteIds}
            onSelectNote={handleSelectNote}
            sortBy={sortBy}
            isSortOpen={isSortOpen}
            showFilters={showFilters}
            searchQuery={searchQuery}
            localFilters={localFilters}
            currentPage={currentPage}
            isSelectMenuOpen={isSelectMenuOpen}
            isNoteSelectMenuOpen={isNoteSelectMenuOpen}
            justCopiedNotes={justCopiedNotes}
            onSortChange={setSortBy}
            onSortOpenChange={setIsSortOpen}
            onShowFiltersChange={setShowFilters}
            onSearchQueryChange={setSearchQuery}
            onLocalFiltersChange={setLocalFilters}
            onCurrentPageChange={setCurrentPage}
            onSelectMenuOpenChange={setIsSelectMenuOpen}
            onNoteSelectMenuOpenChange={setIsNoteSelectMenuOpen}
            onBulkCopyNotes={handleBulkCopyNotesFeedback}
            onShowClearModal={() => setShowClearModal(true)}
            status={status}
            generatedKeywords={[]} // Handled by context
          />
        )}
      </div>

      {/* ── CLEAR MODAL ─────────────────────────────────────────────────────── */}
      {showClearModal && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-transparent" onClick={() => !isClearingResults && setShowClearModal(false)} />
          <div className="relative w-full max-sm:max-w-[320px] max-w-sm bg-white dark:bg-gray-900 rounded-xl shadow-2xl p-6 ring-1 ring-black/5 animate-in zoom-in-95">
            <div className="text-center mb-6">
              <h3 className="text-lg font-bold mb-2">Clear Results?</h3>
              <p className="text-sm text-gray-500">This will remove all current results and unsaved notes.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setShowClearModal(false)}
                disabled={isClearingResults}
                className="px-4 py-2 text-sm font-medium bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors border border-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleClearResults}
                disabled={isClearingResults}
                className="px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm transition-all"
              >
                {isClearingResults ? 'Clearing...' : 'Clear All'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PENDING RESEARCH MODAL ─────────────────────────────────────────── */}
      {pendingDeepResearchQuery && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-transparent" onClick={() => setPendingDeepResearchQuery(null)} />
          <div className="relative w-full max-w-lg bg-white dark:bg-gray-900 rounded-xl shadow-2xl p-8 animate-in zoom-in-95">
            <div className="text-center mb-8">
              <h3 className="text-xl font-bold mb-3">Start New Research Session?</h3>
              <p className="text-base text-gray-500 leading-relaxed">
                Starting a new search will <span className="font-semibold text-gray-900 dark:text-gray-100">permanently clear</span> your current results.
                <br /><br />
                Are you sure you want to discard your progress?
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <button onClick={() => setPendingDeepResearchQuery(null)} className="px-6 py-3 text-sm font-medium border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                Go Back
              </button>
              <button
                onClick={() => { performDeepResearch(pendingDeepResearchQuery); setPendingDeepResearchQuery(null); }}
                className="px-6 py-3 text-sm font-bold text-white bg-scholar-600 hover:bg-scholar-700 rounded-lg shadow-md flex items-center justify-center gap-2"
              >
                <Sparkles size={18} />
                Start New Session
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};