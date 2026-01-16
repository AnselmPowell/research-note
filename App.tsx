
import React, { useMemo, useState, useEffect } from 'react';
import { ThreeColumnLayout } from './components/layout/ThreeColumnLayout';
import { SearchBar } from './components/search/SearchBar';
import { WebSearchView } from './components/websearch/WebSearchView';
import { DeepResearchView } from './components/research/DeepResearchView';
import { PdfWorkspace } from './components/pdf/PdfWorkspace';
import { AgentResearcher } from './components/researcherAI/AgentResearcher';
import { LayoutControls } from './components/layout/LayoutControls';
import { NotesManagerSidebar } from './components/library/NotesManagerSidebar';
import { NotesManager } from './components/library/NotesManager';
import { useUI } from './contexts/UIContext';
import { useResearch } from './contexts/ResearchContext';
import { useLibrary } from './contexts/LibraryContext';
import { useAuth } from './contexts/AuthContext';
import { AuthModal } from './components/auth/AuthModal';
import { Globe, Check, Library, ChevronsDown, ChevronsUp, AlertTriangle, User, LogOut, Settings, Sun, Moon } from 'lucide-react';

// Import configuration to validate on app start
import { getConfig } from './config/env';
import { dataMigrationService } from './utils/dataMigrationService';

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

const App: React.FC = () => {
  const { isAuthenticated, isLoading: authLoading, user, signOut } = useAuth();
  const [configError, setConfigError] = useState<string | null>(null);
  const [isConfigLoading, setIsConfigLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Validate configuration on app startup
  useEffect(() => {
    try {
      getConfig(); // This will throw if required config is missing
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
    resetUI
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
    resetAllResearchData
  } = useResearch();
  
  const { loadedPdfs, downloadingUris, loadPdfFromUrl, setActivePdf, isPdfInContext, togglePdfContext, failedUris, resetLibrary } = useLibrary();

  const [allWebNotesExpanded, setAllWebNotesExpanded] = useState(false);

  const suggestions = useMemo(() => {
    return [...ALL_SUGGESTIONS]
      .sort(() => 0.5 - Math.random())
      .slice(0, 5);
  }, []);

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

  const handleSearchTrigger = (query: any, mode: 'web' | 'deep') => {
      if (isLibraryOpen) {
          setLibraryOpen(false);
      }

      if (!searchState.hasSearched && researchPhase === 'idle' && arxivCandidates.length === 0) {
          setIsHomeExiting(true);
      }

      setTimeout(() => {
        if (mode === 'web' && typeof query === 'string') {
            performWebSearch(query);
            openColumn('left');
        } else if (mode === 'deep') {
            performDeepResearch(query);
            openColumn('middle');
        }
        
        setTimeout(() => {
            setIsHomeExiting(false);
        }, 500);
      }, 50);
  };

  const renderLeftColumn = () => {
    const sources = searchState.data?.sources || [];
    const selectedCount = sources.filter(s => isPdfInContext(s.uri)).length;
    const isAllSelected = sources.length > 0 && selectedCount === sources.length;

    const sortedSources = [...sources].sort((a, b) => {
        const isProcessing = isDeepResearching;
        const aHasNotes = deepResearchResults.some(n => n.pdfUri === a.uri);
        const bHasNotes = deepResearchResults.some(n => n.pdfUri === b.uri);
        const aActive = (isProcessing && isPdfInContext(a.uri)) || aHasNotes;
        const bActive = (isProcessing && isPdfInContext(b.uri)) || bHasNotes;
        if (aActive !== bActive) return bActive ? 1 : -1;
        return 0;
    });

    const handleToggleAll = () => {
      if (isAllSelected) {
        sources.forEach(s => {
          if (isPdfInContext(s.uri)) togglePdfContext(s.uri);
        });
      } else {
        sources.forEach(s => {
          if (!isPdfInContext(s.uri)) {
              togglePdfContext(s.uri, s.title);
              loadPdfFromUrl(s.uri, s.title);
          }
        });
      }
    };

    return (
      <div className="flex flex-col gap-4 relative">
        {searchState.isLoading ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[500px] p-8 space-y-6 animate-fade-in">
            <div className="relative"><div className="w-20 h-20 border-4 border-scholar-100 dark:border-scholar-900 border-t-scholar-600 dark:t-scholar-500 rounded-full animate-spin"></div><div className="absolute inset-0 flex items-center justify-center"><Globe size={24} className="text-scholar-600 dark:text-scholar-500 animate-pulse" /></div></div>
            <div className="text-center space-y-3 max-w-md mx-auto"><h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100">Web Search in Progress</h3><p className="text-gray-500 dark:text-gray-400 leading-relaxed animate-pulse">Scanning the web...</p></div>
          </div>
        ) : searchState.error ? (
          <div className="bg-error-50 text-error-600 p-4 rounded-lg text-sm">{searchState.error}</div>
        ) : sources.length > 0 ? (
          <>
            <div className="sticky top-0 z-20 bg-cream/95 dark:bg-dark-card/95 backdrop-blur-sm border-b border-gray-100 dark:border-gray-700 pb-3 mb-2 -mx-3 px-4 shadow-sm">
              <div className="flex items-center justify-between">
                 <div className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-2">
                   {sources.length} Results
                 </div>
                 <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setAllWebNotesExpanded(!allWebNotesExpanded)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md text-[10px] font-bold uppercase text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm"
                      title={allWebNotesExpanded ? "Collapse all notes" : "Expand all notes"}
                    >
                       {allWebNotesExpanded ? <ChevronsUp size={14} /> : <ChevronsDown size={14} />}
                       {allWebNotesExpanded ? 'Collapse' : 'Expand'}
                    </button>
                    <button 
                      onClick={handleToggleAll}
                      className="flex items-center gap-2 px-2.5 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm group"
                    >
                       <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors ${isAllSelected ? 'bg-scholar-600 border-scholar-600' : 'border-gray-400 dark:border-gray-500 group-hover:border-scholar-500'}`}>
                          {isAllSelected && <Check size={10} className="text-white" />}
                       </div>
                       {isAllSelected ? 'Deselect All' : 'Select all documents'}
                    </button>
                 </div>
              </div>
            </div>
            <div className="space-y-6">
                {sortedSources.map((source, idx) => (
                  <WebSearchView 
                    key={`${source.uri}-${idx}`} 
                    source={source} 
                    isSelected={isPdfInContext(source.uri)} 
                    isDownloading={downloadingUris.has(source.uri)}
                    isFailed={failedUris.has(source.uri)}
                    isResearching={isPdfInContext(source.uri) && isDeepResearching} 
                    researchNotes={deepResearchResults.filter(n => n.pdfUri === source.uri)}
                    forceExpanded={allWebNotesExpanded}
                    onToggle={async () => {
                        const wasSelected = isPdfInContext(source.uri);
                        togglePdfContext(source.uri, source.title);
                        if (!wasSelected) {
                            const success = await loadPdfFromUrl(source.uri, source.title); 
                            if (success) {
                                setActivePdf(source.uri); 
                                openColumn('right');
                            }
                        }
                    }}
                    onView={async () => { 
                        const success = await loadPdfFromUrl(source.uri, source.title); 
                        if (success) {
                            setActivePdf(source.uri); 
                            openColumn('right');
                        }
                    }} 
                  />
                ))}
            </div>
          </>
        ) : (
            <div className="my-48 p-12 flex flex-col items-center justify-center text-center opacity-50 h-full"><Globe size={48} className="text-gray-300 dark:text-gray-600 mb-4" /><p className="text-gray-400 dark:text-gray-500">No results</p></div>
        )}
      </div>
    );
  };

  const allColumnsClosed = !columnVisibility.left && !columnVisibility.middle && !columnVisibility.library && !columnVisibility.right;
  // MODIFIED: Show DeepResearchView if phase is active OR if user has uploaded papers
  const showDeepResearch = researchPhase !== 'idle' || loadedPdfs.length > 0;
  const showHeaderSearch = !allColumnsClosed;

  // User dropdown component
  const UserDropdown: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const { toggleDarkMode, darkMode } = useUI();

    // Generate user initials from name
    const getUserInitials = (name: string): string => {
      return name
        .split(' ')
        .map(n => n[0])
        .join('')
        .substring(0, 2)
        .toUpperCase();
    };

    const handleLogout = () => {
      // Call signOut with all reset functions to clear app state
      signOut([resetUI, resetAllResearchData, resetLibrary]);
      setIsOpen(false);
    };

    return (
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-10 h-10 rounded-lg bg-white/60 dark:bg-dark-card/60 backdrop-blur-md shadow-sm border border-gray-200/50 dark:border-gray-700/50 hover:bg-white dark:hover:bg-gray-700 transition-colors flex items-center justify-center"
        >
          {isAuthenticated ? (
            <span className="text-sm font-semibold text-scholar-600 dark:text-scholar-400">
              {getUserInitials(user?.name || 'U')}
            </span>
          ) : (
            <User size={20} className="text-gray-600 dark:text-gray-400" />
          )}
        </button>

        {isOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
            <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 py-1 z-50">
              {/* User info section */}
              {isAuthenticated ? (
                <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{user?.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{user?.email}</p>
                </div>
              ) : (
                <button 
                  onClick={() => {
                    setShowAuthModal(true);
                    setIsOpen(false);
                  }} 
                  className="w-full text-left px-4 py-3 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <p className="text-sm font-medium text-scholar-600 hover:text-scholar-700 dark:text-scholar-400">Sign In</p>
                  {dataMigrationService.hasLocalDataToMigrate() && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">Save your research data</p>
                  )}
                </button>
              )}
              
              {/* Dark mode toggle */}
              <button 
                onClick={() => { 
                  toggleDarkMode(); 
                  setIsOpen(false); 
                }} 
                className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                {darkMode ? <Sun size={18} className="text-gray-500" /> : <Moon size={18} className="text-gray-500" />}
                <span className="text-sm text-gray-600 dark:text-gray-300">{darkMode ? 'Light Mode' : 'Dark Mode'}</span>
              </button>
              
              {/* Settings placeholder */}
              <button className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-gray-400 cursor-not-allowed">
                <Settings size={18} />
                <span className="text-sm">Settings</span>
                <span className="text-xs ml-auto">Soon</span>
              </button>
              
              {/* Sign out for authenticated users */}
              {isAuthenticated && (
                <button 
                  onClick={handleLogout} 
                  className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-red-600"
                >
                  <LogOut size={18} />
                  <span className="text-sm">Sign Out</span>
                </button>
              )}
            </div>
          </>
        )}
      </div>
    );
  };

  // Show loading screen while validating config
  if (isConfigLoading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-cream dark:bg-dark-bg font-sans">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-scholar-100 dark:border-scholar-900 border-t-scholar-600 dark:border-t-scholar-500 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Initializing Research Note...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-cream dark:bg-dark-bg font-sans transition-colors duration-300 overflow-hidden">
      
      <NotesManagerSidebar />
      <AgentResearcher />
      
      <div className="flex-none pt-4 pb-2 px-6 flex items-start justify-center relative z-40">
          {showHeaderSearch && (
            <div className="w-full max-w-3xl relative animate-fade-in">
              <SearchBar centered={true} onSearch={handleSearchTrigger} />
            </div>
          )}
          <div className="absolute right-2 top-4 flex items-center gap-3">
              <UserDropdown />
              <LayoutControls />
          </div>
      </div>

      {allColumnsClosed ? (
        <main className={`flex-grow flex flex-col items-center justify-center px-4 -mt-20 transition-all duration-500 ease-in-out ${isHomeExiting ? 'opacity-0 scale-95' : 'animate-slide-up'}`}>
          <div className="mb-10 text-center select-none">
            <div className="text-6xl sm:text-7xl lg:text-8xl font-light tracking-tight mb-4">
              <span className="text-gray-900 dark:text-gray-100">Research</span>
              <span className="text-scholar-600 dark:text-scholar-400">Notes</span>
            </div>
            <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">No.1 academic research gatherer</p>
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
          leftContent={renderLeftColumn()}
          middleContent={
              showDeepResearch ? (
                  <DeepResearchView 
                    researchPhase={researchPhase}
                    status={gatheringStatus} 
                    candidates={researchPhase === 'extracting' || researchPhase === 'completed' ? filteredCandidates : arxivCandidates} 
                    generatedKeywords={arxivKeywords}
                    onViewPdf={async (paper) => { 
                        const success = await loadPdfFromUrl(paper.pdfUri, paper.title, paper.authors.join(', '));
                        if (success) {
                            setActivePdf(paper.pdfUri);
                            openColumn('right');
                        }
                    }}
                  />
              ) : (
                  <div className="p-12 flex flex-col items-center justify-center text-center opacity-50 h-full">
                    <Library size={48} className="text-gray-300 dark:text-gray-600 mb-4" />
                    <p className="text-gray-400">Deep Research Inactive</p>
                  </div>
              )
          }
          libraryContent={<NotesManager activeView={libraryActiveView} />}
          rightContent={<PdfWorkspace />}
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
