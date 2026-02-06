
import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { ThreeColumnLayout } from './components/layout/ThreeColumnLayout';
import { SearchBar } from './components/search/SearchBar';
import { WebSearchView } from './components/websearch/WebSearchView';
import { DeepResearchView } from './components/research/DeepResearchView';
import { PdfWorkspace } from './components/pdf/PdfWorkspace';
import { AgentResearcher } from './components/researcherAI/AgentResearcher';
import { LayoutControls } from './components/layout/LayoutControls';
import { NotesManagerSidebar } from './components/library/NotesManagerSidebar';
import { NotesManager } from './components/library/NotesManager';
import { SourcesPanel } from './components/sources/SourcesPanel';
import { useUI } from './contexts/UIContext';
import { useResearch } from './contexts/ResearchContext';
import { useLibrary } from './contexts/LibraryContext';
import { useAuth } from './contexts/AuthContext';
import { AuthModal } from './components/auth/AuthModal';
import { Globe, Check, Library, ChevronsDown, ChevronsUp, AlertTriangle, User, LogOut, Settings, Sun, Moon, X, Search } from 'lucide-react';

// Import configuration to validate on app start
import { getConfig } from './config/env';
import { dataMigrationService } from './utils/dataMigrationService';
import { cleanupExpiredCache } from './utils/metadataCache';

const ALL_SUGGESTIONS = [
  "Renewable Energy Solutions",
  "Basics of Machine Learning",
  "Cybersecurity Threats Today",
  "Mental Health in Young Adults",
  "History of World War II",
  "Supply and Demand in Economics",
  "Dental Hygiene and Oral Health",
  "Basics of Financial Literacy"
];

const ResearchNoteLogo: React.FC<{ className?: string }> = ({ className = "" }) => (
  <div className={`font-bold tracking-tight ${className}`}>
    <span className="text-gray-900 dark:text-gray-100">Research</span>
    <span className="text-scholar-600 dark:text-scholar-400">Notes</span>
  </div>
);

const App: React.FC = () => {
  const { isAuthenticated, isLoading: authLoading, user, signOut } = useAuth();
  const [configError, setConfigError] = useState<string | null>(null);
  const [isConfigLoading, setIsConfigLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Validate configuration on app startup
  useEffect(() => {
    try {
      getConfig(); // This will throw if required config is missing

      // Clean up expired metadata cache entries
      cleanupExpiredCache();

      setIsConfigLoading(false);
    } catch (error) {
      setConfigError(error instanceof Error ? error.message : 'Configuration error');
      setIsConfigLoading(false);
    }
  }, []);

  const {
    columnVisibility,
    openColumn,
    isHomeExiting,
    setIsHomeExiting,
    setColumnVisibility,
    isLibraryOpen,
    isLibraryExpanded,
    setLibraryExpanded,
    setLibraryOpen,
    libraryActiveView,
    resetUI,
    isHeaderVisible,
    setHeaderVisible
  } = useUI();

  const {
    searchState,
    performWebSearch,
    performDeepResearch,
    researchPhase,
    gatheringStatus,
    arxivKeywords,
    arxivCandidates,
    filteredCandidates,
    isDeepResearching,
    deepResearchResults,
    updateSearchBar,
    resetAllResearchData,
    clearWebSearchResults,
    setPendingDeepResearchQuery,
    activeSearchMode,
    isDeepSearchBarExpanded
  } = useResearch();

  const { loadedPdfs, downloadingUris, loadPdfFromUrl, setActivePdf, isPdfInContext, togglePdfContext, failedUris, resetLibrary } = useLibrary();

  const [allWebNotesExpanded, setAllWebNotesExpanded] = useState(false);

  const suggestions = useMemo(() => {
    return [...ALL_SUGGESTIONS]
      .sort(() => 0.5 - Math.random())
      .slice(0, 5);
  }, []);

  // Memoized content components - must be called before any conditional returns
  const renderSourcesColumn = useCallback(() => {
    return <SourcesPanel />;
  }, []);

  // Calculate showDeepResearch first - include web search results
  const hasWebSearchResults = searchState.data?.sources && searchState.data.sources.length > 0;
  const showDeepResearch = researchPhase !== 'idle' || loadedPdfs.length > 0 || hasWebSearchResults;

  // Memoize middle content to prevent unnecessary re-renders
  const middleContent = useMemo(() => {
    if (showDeepResearch) {
      return (
        <DeepResearchView
          researchPhase={researchPhase}
          status={gatheringStatus}
          candidates={researchPhase === 'extracting' || researchPhase === 'completed' ? filteredCandidates : arxivCandidates}
          generatedKeywords={arxivKeywords}
          webSearchSources={searchState.data?.sources || []}
          webSearchLoading={searchState.isLoading}
          webSearchError={searchState.error}
          onViewPdf={(paper) => {
            setActivePdf(paper.pdfUri);
            openColumn('right');
            loadPdfFromUrl(paper.pdfUri, paper.title, paper.authors.join(', ')).then(result => {
              if (!result.success && result.error) {
                setActivePdf(null);
              }
            });
          }}
        />
      );
    } else {
      return (
        <div className="p-12 flex flex-col items-center justify-center text-center opacity-50 h-full">
          <Library size={48} className="text-gray-300 dark:text-gray-600 mb-4" />
          <p className="text-gray-400">Deep Research Inactive</p>
        </div>
      );
    }
  }, [
    showDeepResearch,
    researchPhase,
    gatheringStatus,
    filteredCandidates,
    arxivCandidates,
    arxivKeywords,
    searchState.data?.sources,
    searchState.isLoading,
    searchState.error,
    loadPdfFromUrl,
    setActivePdf,
    openColumn
  ]);

  // Memoize library content
  const libraryContent = useMemo(() => {
    return <NotesManager activeView={libraryActiveView} />;
  }, [libraryActiveView]);

  // Memoize right content
  const rightContent = useMemo(() => {
    return <PdfWorkspace />;
  }, []);

  const handleSearchTrigger = useCallback((query: any, mode: 'web' | 'deep') => {
    if (isLibraryOpen) {
      setLibraryOpen(false);
    }

    if (!searchState.hasSearched && researchPhase === 'idle' && arxivCandidates.length === 0) {
      setIsHomeExiting(true);
    }

    setTimeout(() => {
      if (mode === 'web' && typeof query === 'string') {
        performWebSearch(query);
        openColumn('middle'); // Open Research column for web searches
      } else if (mode === 'deep') {
        // Only show pending dialog if there are VISIBLE results (filtered candidates or deep research results)
        // arxivCandidates alone doesn't count - they might have been filtered out to 0
        if (deepResearchResults.length > 0 || filteredCandidates.length > 0) {
          setPendingDeepResearchQuery(query);
        } else {
          performDeepResearch(query);
        }
        openColumn('middle');
      }

      setTimeout(() => {
        setIsHomeExiting(false);
      }, 500);
    }, 50);
  }, [isLibraryOpen, setLibraryOpen, searchState.hasSearched, researchPhase, arxivCandidates.length, filteredCandidates.length, setIsHomeExiting, performWebSearch, openColumn, deepResearchResults.length, setPendingDeepResearchQuery, performDeepResearch]);

  const allColumnsClosed = useMemo(() => !columnVisibility.left && !columnVisibility.middle && !columnVisibility.library && !columnVisibility.right, [columnVisibility]);
  const showHeaderSearch = useMemo(() => !allColumnsClosed, [allColumnsClosed]);

  const headerContainerClass = useMemo(() =>
    `flex-none transition-all duration-500 ease-in-out relative z-40 ${(isHeaderVisible || allColumnsClosed)
      ? 'opacity-100 translate-y-0 max-h-[300px]'
      : 'opacity-0 -translate-y-full max-h-0 pointer-events-none'
    }`
    , [isHeaderVisible, allColumnsClosed]);

  // Show loading screen during authentication or config loading
  if (authLoading || isConfigLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-cream dark:bg-dark-bg">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-scholar-200 border-t-scholar-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">
            {authLoading ? 'Loading...' : 'Initializing...'}
          </p>
        </div>
      </div>
    );
  }

  // Configuration error handling
  if (configError) {
    return (
      <div className="h-screen flex items-center justify-center bg-cream dark:bg-dark-bg">
        <div className="text-center p-8">
          <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">Configuration Error</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-4">{configError}</p>
          <p className="text-sm text-gray-500 dark:text-gray-500">
            Please check your environment variables in Railway dashboard.
          </p>
        </div>
      </div>
    );
  }

  // Remove the unauthenticated landing page barrier - let everyone use the app

  return (
    <div className="h-screen flex flex-col bg-cream dark:bg-dark-bg font-sans transition-colors duration-300 overflow-hidden">

      <NotesManagerSidebar
        onShowAuthModal={() => setShowAuthModal(true)}
        resetCallbacks={[resetUI, resetAllResearchData, resetLibrary]}
      />
      <AgentResearcher />

      {/* Search Tag - Visible only when header is hidden and columns are open */}
      {!isHeaderVisible && !allColumnsClosed && (
        <button
          onClick={() => setHeaderVisible(true)}
          className="fixed top-0 left-1/2 -translate-x-1/2 z-[100] bg-white dark:bg-gray-800 px-6 py-2.5 rounded-b-2xl shadow-xl border-x border-b border-gray-200 dark:border-gray-700 animate-slide-down hover:pb-4 transition-all group"
          aria-label="Restore Search Header"
        >
          <Search size={20} className="text-scholar-600 dark:text-scholar-400 group-hover:scale-110 transition-transform" />
        </button>
      )}

      <div className={headerContainerClass}>
        <div className={`pt-4 pb-2 px-6 flex items-start justify-center relative ${allColumnsClosed ? 'min-h-[64px]' : ''}`}>
          {!isLibraryOpen && !allColumnsClosed && (
            <div className="absolute left-6 top-6 z-40">
              <ResearchNoteLogo className="text-2xl" />
            </div>
          )}
          {showHeaderSearch && (
            <div className="w-full max-w-3xl relative animate-fade-in">
              <SearchBar centered={true} onSearch={handleSearchTrigger} />
            </div>
          )}
          {!isLibraryOpen && (
            <div className="absolute right-2 top-4 flex items-center gap-3 pr-5">
              <LayoutControls />
            </div>
          )}
        </div>
      </div>

      {allColumnsClosed ? (
        <main
          className={`flex-grow flex flex-col items-center justify-center px-4 -mt-20 transition-all duration-500 ease-in-out ${isHomeExiting ? 'opacity-0 scale-95' : 'animate-slide-up'
            } ${activeSearchMode === 'deep' && isDeepSearchBarExpanded ? '-mt-72' : ''
            }`}
        >
          <div className="mb-10 text-center select-none">
            <div className="text-6xl sm:text-7xl lg:text-8xl font-semibold tracking-tight mb-4">
              <span className="text-gray-900 dark:text-gray-100">Research</span>
              <span className="text-scholar-600 dark:text-scholar-400">Notes</span>
            </div>
            <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">The #1 tool for students to find meaningful quotes and insights from academic papers in minutes.</p>
          </div>
          <div className="w-full max-w-3xl mb-8 relative z-20">
            <SearchBar centered={true} onSearch={handleSearchTrigger} />
          </div>
          <div className="flex flex-wrap justify-center gap-3 relative max-w-4xl px-4 z-1">
            {suggestions.map((tag) => (
              <button
                key={tag}
                onClick={() => updateSearchBar({ mainInput: tag })}
                className="px-4 py-2 bg-white/50 dark:bg-gray-800/50 hover:bg-white dark:hover:bg-gray-700 backdrop-blur-sm border border-gray-200 dark:border-gray-700 rounded-full text-sm text-gray-600 dark:text-gray-300 transition-all hover:scale-105 hover:shadow-sm hover:border-scholar-200 dark:hover:border-scholar-800"
              >
                {tag}
              </button>
            ))}
          </div>
        </main>
      ) : (
        <ThreeColumnLayout
          sourcesContent={renderSourcesColumn()}
          middleContent={middleContent}
          libraryContent={libraryContent}
          rightContent={rightContent}
        />
      )}

      {/* Auth Modal for anonymous users to sign up */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
      />
    </div>
  );
};

export default App;
