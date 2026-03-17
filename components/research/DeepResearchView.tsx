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
  LayoutList,
  ArrowUpDown
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
    selectedWebSourceUris,
    toggleWebSourceSelection,
    activeSearchMode,
    setActiveSearchMode,
    clearDeepResearchResults,
    clearPaperResults,
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
    handleScroll,
  } = useUI();

  // Derive web sources from searchState
  const webSearchSources = searchState?.data?.sources || [];

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

  // ─── Separate sort states for each tab ─────────────────────────────────────
  // Deep Research tab: 'most-relevant-notes' | 'relevant-papers' | 'newest-papers'
  const [sortByDeep, setSortByDeep] = useState<SortOption>('relevant-papers');
  // My Results tab: 'most-relevant-notes' | 'recent-research' | 'alphabetical'
  const [sortByResults, setSortByResults] = useState<any>('recent-research');

  // Use correct sort state and handler based on active tab
  const currentSort = activeTab === 'results' ? sortByResults : sortByDeep;
  const handleSortChange = activeTab === 'results' ? setSortByResults : setSortByDeep;

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
      if (activeTab === 'results') {
        // For "My Results" tab, use the new clear function
        clearPaperResults();
      } else {
        // For "Deep Research" tab, use the existing function
        clearDeepResearchResults();
      }
      setSelectedNoteIds([]);
      setShowClearModal(false);
    } finally {
      setIsClearingResults(false);
    }
  }, [activeTab, clearDeepResearchResults, clearPaperResults]);

  return (
    <div className="flex flex-col h-full bg-cream dark:bg-dark-card animate-in fade-in duration-700">

      {/* ── STICKY HEADER ────────────────────────────────────────────────────── */}
      {(
        <div className="sticky top-0 z-40 bg-cream/95 dark:bg-dark-card/95 backdrop-blur-sm border-b border-gray-100 dark:border-gray-700 pb-0 px-4 sm:px-6 shadow-sm flex justify-center">
          <div className="flex items-center justify-between py-3 gap-4 w-full max-w-5xl">
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

            <div className="flex items-center gap-2 z-50">
              {(activeTab === 'deep' || activeTab === 'results') && (currentTabCandidates.length > 0 || (activeTab === 'results')) && (
                <div className="relative">
                  <button
                    onClick={() => setIsSortOpen(!isSortOpen)}
                    className="flex items-center gap-2 px-3 py-2.5 text-xs font-bold text-gray-600 dark:text-gray-300 hover:text-scholar-600 dark:hover:text-scholar-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-all"
                  >
                    <span className="truncate max-w-[120px]">
                      {activeTab === 'results' ? (
                        <>
                          {currentSort === 'most-relevant-notes' && 'Most Relevant Notes'}
                          {currentSort === 'recent-research' && 'Recent Research'}
                          {currentSort === 'alphabetical' && 'Alphabetical'}
                        </>
                      ) : (
                        <>
                          {currentSort === 'most-relevant-notes' && 'Most Relevant Notes'}
                          {currentSort === 'relevant-papers' && 'Most Relevant Papers'}
                          {currentSort === 'newest-papers' && 'Newest Papers'}
                        </>
                      )}
                    </span>
                    <ChevronDown size={16} className={`text-gray-400 transition-transform ${isSortOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {isSortOpen && (
                    <>
                      <div className="fixed inset-0 z-[100]" onClick={() => setIsSortOpen(false)} />
                      <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-dark-card rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 py-1.5 z-[110] animate-fade-in">
                        {activeTab === 'results' ? (
                          <>
                            {/* My Results tab sorting options */}
                            <button onClick={() => { handleSortChange('most-relevant-notes'); setIsSortOpen(false); }} className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800">
                              <Star size={16} className={currentSort === 'most-relevant-notes' ? "text-scholar-600" : "text-gray-400"} />
                              <span className="text-sm font-medium">Most Relevant Notes</span>
                            </button>
                            <div className="h-px bg-gray-100 dark:bg-gray-700 mx-3 my-1" />
                            <button onClick={() => { handleSortChange('recent-research'); setIsSortOpen(false); }} className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800">
                              <Calendar size={16} className={currentSort === 'recent-research' ? "text-scholar-600" : "text-gray-400"} />
                              <span className="text-sm font-medium">Recent Research</span>
                            </button>
                            <button onClick={() => { handleSortChange('alphabetical'); setIsSortOpen(false); }} className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800">
                              <ArrowUpDown size={16} className={currentSort === 'alphabetical' ? "text-scholar-600" : "text-gray-400"} />
                              <span className="text-sm font-medium">Alphabetical</span>
                            </button>
                          </>
                        ) : (
                          <>
                            {/* Deep Research tab sorting options - unchanged */}
                            <button onClick={() => { handleSortChange('most-relevant-notes'); setIsSortOpen(false); }} className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800">
                              <Star size={16} className={currentSort === 'most-relevant-notes' ? "text-scholar-600" : "text-gray-400"} />
                              <span className="text-sm font-medium">Most Relevant Notes</span>
                            </button>
                            <div className="h-px bg-gray-100 dark:bg-gray-700 mx-3 my-1" />
                            <button onClick={() => { handleSortChange('relevant-papers'); setAllNotesExpanded(false); setIsSortOpen(false); }} className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800">
                              <Layers size={16} className={currentSort === 'relevant-papers' ? "text-scholar-600" : "text-gray-400"} />
                              <span className="text-sm font-medium">Relevant Papers</span>
                            </button>
                            <button onClick={() => { handleSortChange('newest-papers'); setAllNotesExpanded(false); setIsSortOpen(false); }} className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800">
                              <Calendar size={16} className={currentSort === 'newest-papers' ? "text-scholar-600" : "text-gray-400"} />
                              <span className="text-sm font-medium">Newest Papers</span>
                            </button>
                          </>
                        )}
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
      <div onScroll={handleScroll} className="flex-1 overflow-y-auto overflow-x-hidden py-4 custom-scrollbar">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          {activeTab === 'web' ? (
            <div className="space-y-6">
              {searchState?.isLoading && (!webSearchSources || webSearchSources.length === 0) ? (
                <div className="flex flex-col items-center justify-center h-screen min-h-[400px] p-8 space-y-6 animate-fade-in">
                  <div className="relative">
                    <div className="w-20 h-20 border-4 border-scholar-100 dark:border-scholar-900 border-t-scholar-600 dark:border-t-scholar-500 rounded-full animate-spin"></div>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Search size={24} className="text-scholar-600 dark:text-scholar-500 animate-pulse" />
                    </div>
                  </div>
                  <div className="text-center space-y-3 max-w-md mx-auto">
                    <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100">Searching the Web</h3>
                    <p className="text-gray-500 dark:text-gray-400 leading-relaxed animate-pulse">Finding relevant sources...</p>
                  </div>
                </div>
              ) : webSearchSources.length > 0 ? (
                webSearchSources.map((source, idx) => (
                  <WebSearchView
                    key={`${source.url}-${idx}`}
                    source={source}
                    isSelected={selectedWebSourceUris.has(source.uri)}
                    onToggle={(checked) => toggleWebSourceSelection(source.uri, checked)}
                  />
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
              sortBy={currentSort}
              isSortOpen={isSortOpen}
              showFilters={showFilters}
              searchQuery={searchQuery}
              localFilters={localFilters}
              currentPage={currentPage}
              isSelectMenuOpen={isSelectMenuOpen}
              isNoteSelectMenuOpen={isNoteSelectMenuOpen}
              justCopiedNotes={justCopiedNotes}
              onSortChange={handleSortChange}
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
              sortBy={currentSort}
              isSortOpen={isSortOpen}
              showFilters={showFilters}
              searchQuery={searchQuery}
              localFilters={localFilters}
              currentPage={currentPage}
              isSelectMenuOpen={isSelectMenuOpen}
              isNoteSelectMenuOpen={isNoteSelectMenuOpen}
              justCopiedNotes={justCopiedNotes}
              onSortChange={handleSortChange}
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
                <br />Are you sure you want to discard your research notes found?
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