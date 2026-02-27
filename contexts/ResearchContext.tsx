
import React, { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { SearchState, SearchMode, DeepResearchQuery, ArxivPaper, DeepResearchNote, LoadedPdf, SearchBarState, ResearchPhase, ResearchTimings, SearchMetrics } from '../types';
import { performSearch, generateArxivSearchTerms, filterRelevantPapers, findRelevantPages, extractNotesFromPages, generateInsightQueries } from '../services/geminiService';
import { extractPdfData, fetchPdfBuffer } from '../services/pdfService';
import { searchAllSources } from '../services/searchAggregator';
import { localStorageService } from '../utils/localStorageService';

// Debounce utility function
function debounce<T extends (...args: any[]) => any>(func: T, wait: number) {
  let timeout: NodeJS.Timeout | null = null;
  const debounced = (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
  debounced.cancel = () => {
    if (timeout) clearTimeout(timeout);
  };
  return debounced;
}

// Reusable Async Pool
async function asyncPool<T, R>(concurrency: number, items: T[], worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  async function runNext() {
    const index = i++;
    if (index >= items.length) return;
    try { results[index] = await worker(items[index]); } catch (e) { console.error(e); }
    return runNext();
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => runNext());
  await Promise.all(workers);
  return results;
}

interface ResearchContextType {
  activeSearchMode: SearchMode;
  searchState: SearchState;
  searchBarState: SearchBarState;
  updateSearchBar: (updates: Partial<SearchBarState>) => void;
  clearSearchBar: () => void;
  searchHistory: string[];
  addToHistory: (query: string) => void;
  removeFromHistory: (query: string) => void;
  clearHistory: () => void;
  researchPhase: ResearchPhase;
  gatheringStatus: string;
  arxivKeywords: string[];
  arxivCandidates: ArxivPaper[];
  filteredCandidates: ArxivPaper[];
  selectedArxivIds: Set<string>;
  toggleArxivSelection: (id: string) => void;
  selectAllArxivPapers: (ids: string[]) => void;
  clearArxivSelection: () => void;
  isDeepResearching: boolean;
  deepResearchResults: DeepResearchNote[];
  contextNotes: DeepResearchNote[];
  toggleContextNote: (note: DeepResearchNote) => void;
  isNoteInContext: (note: DeepResearchNote) => boolean;
  performWebSearch: (query: string) => Promise<void>;
  performDeepResearch: (query: DeepResearchQuery) => Promise<void>;
  performHybridResearch: (pdfs: LoadedPdf[], arxivPapers: ArxivPaper[], questions: string[], keywords: string[]) => Promise<void>;
  performHybridAnalysis: (pdfs: LoadedPdf[], arxivPapers: ArxivPaper[], questions: string[], keywords: string[]) => Promise<void>;
  stopDeepResearch: () => void;
  resetSearch: () => void;
  setActiveSearchMode: (mode: SearchMode) => void;
  analyzeLoadedPdfs: (pdfs: LoadedPdf[], questions: string, signal?: AbortSignal) => Promise<void>;
  analyzeArxivPapers: (papers: ArxivPaper[], userQuestions: string[], keywords: string[]) => Promise<void>;
  // Complete reset for sign out
  resetAllResearchData: () => void;
  // New: expose processed PDFs for navigation
  processedPdfs: LoadedPdf[];
  // New: individual status tracking for uploaded papers
  uploadedPaperStatuses: Record<string, string>;
  updateUploadedPaperStatus: (uri: string, status: string) => void;
  // New: store navigation intent for column opening
  shouldOpenPdfViewer: boolean;
  setShouldOpenPdfViewer: (open: boolean) => void;
  // New: track if navigation has been handled
  navigationHandled: boolean;
  setNavigationHandled: (handled: boolean) => void;
  // New: allow clearing processed PDFs
  setProcessedPdfs: (pdfs: LoadedPdf[]) => void;
  // New: clear search results from localStorage
  clearWebSearchResults: () => void;
  clearDeepResearchResults: () => void;
  pendingDeepResearchQuery: DeepResearchQuery | null;
  setPendingDeepResearchQuery: (query: DeepResearchQuery | null) => void;
  // New: track deep search bar expansion state for UI layout
  isDeepSearchBarExpanded: boolean;
  setIsDeepSearchBarExpanded: (expanded: boolean) => void;
  // New: timing tracking for pipeline phases
  researchTimings: ResearchTimings | null;
  timeToFirstNotes: number | null;
  timeToFirstPaper: number | null;
  // NEW: search metrics tracking
  searchMetrics: SearchMetrics | null;
  // NEW: Accumulated results for "My Results" tab (persistent across searches)
  accumulatedPapers: ArxivPaper[];
  accumulatedNotes: DeepResearchNote[];
  paperResultsMetadata: Record<string, any>;
  addToPaperResults: (papers: ArxivPaper[], notes: DeepResearchNote[]) => void;
  clearPaperResults: () => void;
  removePaperFromResults: (paperId: string) => void;
}

const ResearchContext = createContext<ResearchContextType | undefined>(undefined);

export const ResearchProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeSearchMode, setActiveSearchMode] = useState<SearchMode>('deep');

  const [searchState, setSearchState] = useState<SearchState>({
    query: '',
    isLoading: false,
    data: null,
    hasSearched: false,
    error: null,
  });

  const [searchBarState, setSearchBarState] = useState<SearchBarState>({
    mainInput: '',
    additionalTopics: [],
    urls: [],
    questions: [],
    urlInput: '',
    questionInput: ''
  });

  const [searchHistory, setSearchHistory] = useState<string[]>([]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('research_history');
      if (saved) setSearchHistory(JSON.parse(saved));
    } catch (e) {
      console.error("Failed to load search history", e);
    }
  }, []);

  // Load persisted web search results
  useEffect(() => {
    try {
      const savedWebSearch = localStorageService.getWebSearchResults();
      if (savedWebSearch) {
        setSearchState({
          query: savedWebSearch.query,
          isLoading: false,
          data: savedWebSearch.results,
          hasSearched: true,
          error: null
        });
        console.log('[ResearchContext] Loaded persisted web search results');
      }
    } catch (e) {
      console.error("Failed to load persisted web search results", e);
    }
  }, []);

  // Load persisted deep research results
  useEffect(() => {
    try {
      const savedDeepResearch = localStorageService.getDeepResearchResults();
      console.log('[ResearchContext] Attempting to load deep research results:', savedDeepResearch);
      if (savedDeepResearch) {
        setArxivKeywords(savedDeepResearch.arxivKeywords || []);
        setArxivCandidates(savedDeepResearch.arxivCandidates || []);
        
        // NEW: Clean up in-progress status indicators on page reload
        // If research was interrupted (user refreshed), papers might have stale statuses
        // like 'downloading', 'processing', 'extracting' - convert these to 'completed'
        const cleanedCandidates = (savedDeepResearch.filteredCandidates || []).map(paper => {
          if (['downloading', 'processing', 'extracting'].includes(paper.analysisStatus)) {
            console.log(`[ResearchContext] Cleaning stale status '${paper.analysisStatus}' for paper: ${paper.title?.substring(0, 50)}`);
            return { ...paper, analysisStatus: 'completed' as const };
          }
          return paper;
        });
        
        setFilteredCandidates(cleanedCandidates);
        setDeepResearchResults(savedDeepResearch.deepResearchResults || []);
        
        if (savedDeepResearch.searchBarState) {
          setSearchBarState(savedDeepResearch.searchBarState);
        }
        
        // Set research phase to 'completed' so UI knows to display results
        if (cleanedCandidates.length > 0 || savedDeepResearch.deepResearchResults?.length > 0) {
          setResearchPhase('completed');
        }
        
        console.log('[ResearchContext] Loaded persisted deep research results:', {
          arxivKeywords: savedDeepResearch.arxivKeywords?.length || 0,
          arxivCandidates: savedDeepResearch.arxivCandidates?.length || 0,
          filteredCandidates: cleanedCandidates.length || 0,
          deepResearchResults: savedDeepResearch.deepResearchResults?.length || 0,
          statusesCleaned: cleanedCandidates.filter((p, idx) => p.analysisStatus !== savedDeepResearch.filteredCandidates[idx]?.analysisStatus).length
        });
      }
    } catch (e) {
      console.error("Failed to load persisted deep research results", e);
    }
  }, []);

  // Load persisted paper results (My Results tab) on component mount
  useEffect(() => {
    try {
      console.log('[ResearchContext] 🔍 STARTUP: Loading paper results from localStorage...');
      
      const savedPaperResults = localStorageService.getPaperResultsAccumulation();
      console.log('[ResearchContext] 🔍 STARTUP: paper_results_accumulation contents:', {
        exists: !!savedPaperResults,
        papers: savedPaperResults?.accumulatedPapers?.length || 0,
        notes: savedPaperResults?.accumulatedNotes?.length || 0,
        metadata: savedPaperResults?.paperResultsMetadata,
        paperIds: savedPaperResults?.accumulatedPapers?.map((p: any) => p.id || p.pdfUri) || []
      });
      
      if (savedPaperResults) {
        setAccumulatedPapers(savedPaperResults.accumulatedPapers || []);
        setAccumulatedNotes(savedPaperResults.accumulatedNotes || []);
        setPaperResultsMetadata(savedPaperResults.paperResultsMetadata || {});
        console.log('[ResearchContext] ✅ STARTUP: Loaded persisted paper results:', {
          papers: savedPaperResults.accumulatedPapers?.length || 0,
          notes: savedPaperResults.accumulatedNotes?.length || 0
        });
      } else {
        console.log('[ResearchContext] ✅ STARTUP: No persisted paper results found - starting fresh');
      }
    } catch (e) {
      console.error("[ResearchContext] ❌ STARTUP: Failed to load persisted paper results", e);
    }
  }, []);

  const saveHistory = (newHistory: string[]) => {
    setSearchHistory(newHistory);
    localStorage.setItem('research_history', JSON.stringify(newHistory));
  };

  const addToHistory = useCallback((query: string) => {
    if (!query || !query.trim()) return;
    const cleanQuery = query.trim();
    setSearchHistory(prev => {
      const filtered = prev.filter(item => item.toLowerCase() !== cleanQuery.toLowerCase());
      const next = [cleanQuery, ...filtered].slice(0, 10);
      localStorage.setItem('research_history', JSON.stringify(next));
      return next;
    });
  }, []);

  const removeFromHistory = useCallback((query: string) => {
    setSearchHistory(prev => {
      const next = prev.filter(item => item !== query);
      localStorage.setItem('research_history', JSON.stringify(next));
      return next;
    });
  }, []);

  const clearHistory = useCallback(() => saveHistory([]), []);
  const updateSearchBar = useCallback((updates: Partial<SearchBarState>) => setSearchBarState(prev => ({ ...prev, ...updates })), []);
  const clearSearchBar = useCallback(() => setSearchBarState({ mainInput: '', additionalTopics: [], urls: [], questions: [], urlInput: '', questionInput: '' }), []);

  const [researchPhase, setResearchPhase] = useState<ResearchPhase>('idle');
  const [gatheringStatus, setGatheringStatus] = useState("");
  const [arxivKeywords, setArxivKeywords] = useState<string[]>([]);
  const [arxivCandidates, setArxivCandidates] = useState<ArxivPaper[]>([]);
  const [filteredCandidates, setFilteredCandidates] = useState<ArxivPaper[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [selectedArxivIds, setSelectedArxivIds] = useState<Set<string>>(new Set());
  const [selectedWebSourceUris, setSelectedWebSourceUris] = useState<Set<string>>(new Set());
  // ─── NEW: Unified selection state for papers by URI ─────────────────────────
  // Tracks selected papers across ALL components (SourcesPanel, WebSearchView, DeepSearch, PaperResults)
  // URI key: paper.uri (SavedPaper), source.uri (WebSearch), or paper.pdfUri (ArxivPaper)
  // This enables deduplication and cross-component visibility
  const [selectedPaperUris, setSelectedPaperUris] = useState<Set<string>>(new Set());
  const [isDeepResearching, setIsDeepResearching] = useState(false);
  const [deepResearchResults, setDeepResearchResults] = useState<DeepResearchNote[]>([]);
  const [contextNotes, setContextNotes] = useState<DeepResearchNote[]>([]);
  const [processedPdfs, setProcessedPdfs] = useState<LoadedPdf[]>([]);
  const [showUploadedTab, setShowUploadedTab] = useState(false);
  const [uploadedPaperStatuses, setUploadedPaperStatuses] = useState<Record<string, string>>({});
  const [shouldOpenPdfViewer, setShouldOpenPdfViewer] = useState(false);
  const [navigationHandled, setNavigationHandled] = useState(false);
  const [pendingDeepResearchQuery, setPendingDeepResearchQuery] = useState<DeepResearchQuery | null>(null);
  const [isDeepSearchBarExpanded, setIsDeepSearchBarExpanded] = useState(false);

  // NEW: Accumulated results for "My Results" tab (persistent across searches)
  const [accumulatedPapers, setAccumulatedPapers] = useState<ArxivPaper[]>([]);
  const [accumulatedNotes, setAccumulatedNotes] = useState<DeepResearchNote[]>([]);
  const [paperResultsMetadata, setPaperResultsMetadata] = useState<Record<string, any>>({});
  
  // Track if we've already appended results this session (to avoid duplicates)
  const hasAppendedResultsRef = useRef(false);
  
  // CRITICAL FIX: Store PDFs in ref so they're available when append trigger fires
  // This avoids race condition where setProcessedPdfs() hasn't updated yet
  const currentAnalyzingPdfsRef = useRef<LoadedPdf[]>([]);

  // NEW: Timing tracking for deep research pipeline
  const [researchTimings, setResearchTimings] = useState<ResearchTimings | null>(null);
  const [timeToFirstNotes, setTimeToFirstNotes] = useState<number | null>(null);
  const [timeToFirstPaper, setTimeToFirstPaper] = useState<number | null>(null);
  // NEW: Search metrics tracking
  const [searchMetrics, setSearchMetrics] = useState<SearchMetrics | null>(null);

  // Auto-save deep research results whenever they change (debounced to prevent excessive writes)
  useEffect(() => {
    // Only save if we have VISIBLE results (filtered candidates or deep research notes)
    // arxivCandidates alone doesn't count - they might have been filtered out to 0
    if (filteredCandidates.length > 0 || deepResearchResults.length > 0) {
      const debouncedSave = debounce(() => {
        console.log('[ResearchContext] Auto-saving deep research results to localStorage:', {
          arxivKeywords: arxivKeywords.length,
          arxivCandidates: arxivCandidates.length,
          filteredCandidates: filteredCandidates.length,
          deepResearchResults: deepResearchResults.length
        });
        localStorageService.saveDeepResearchResults({
          arxivKeywords,
          arxivCandidates,
          filteredCandidates,
          deepResearchResults,
          searchBarState
        });
      }, 1000); // Batch saves - max once per second

      debouncedSave();
      return () => debouncedSave.cancel();
    } else if (arxivCandidates.length === 0 && filteredCandidates.length === 0 && deepResearchResults.length === 0) {
      // Clear localStorage if there are no results at all
      console.log('[ResearchContext] Clearing deep research cache - no visible results');
      localStorageService.clearDeepResearchResults();
    }
  }, [arxivKeywords, arxivCandidates, filteredCandidates, deepResearchResults, searchBarState]);

  // Auto-save accumulated paper results when they change (debounced)
  useEffect(() => {
    if (accumulatedPapers.length > 0 || accumulatedNotes.length > 0) {
      const debouncedSave = debounce(() => {
        console.log('[ResearchContext] Auto-saving accumulated paper results:', {
          papers: accumulatedPapers.length,
          notes: accumulatedNotes.length
        });
        localStorageService.savePaperResultsAccumulation({
          accumulatedPapers,
          accumulatedNotes,
          paperResultsMetadata
        });
      }, 1500); // Debounce to prevent thrashing

      debouncedSave();
      return () => debouncedSave.cancel();
    }
  }, [accumulatedPapers.length, accumulatedNotes.length, paperResultsMetadata.lastUpdated]);

  // NEW: CRITICAL FIX - Immediately save paper results when research completes
  // This prevents notes from being lost if user refreshes before debounce fires
  useEffect(() => {
    if (researchPhase === 'completed' && (accumulatedPapers.length > 0 || accumulatedNotes.length > 0)) {
      console.log('[ResearchContext] 🔒 RESEARCH COMPLETED - Saving paper results to localStorage immediately!', {
        papers: accumulatedPapers.length,
        notes: accumulatedNotes.length,
        timestamp: new Date().toISOString()
      });
      
      // IMMEDIATE save (no debounce) to guarantee data is persisted
      localStorageService.savePaperResultsAccumulation({
        accumulatedPapers,
        accumulatedNotes,
        paperResultsMetadata
      });
      
      console.log('[ResearchContext] ✅ Paper results saved to localStorage on completion');
    }
  }, [researchPhase]);

  // NEW: Track when first note is received (check filteredCandidates where notes actually live)
  useEffect(() => {
    if (timeToFirstNotes === null && researchTimings) {
      const hasNotes = filteredCandidates.some(p => (p.notes?.length || 0) > 0);
      if (hasNotes) {
        const elapsed = performance.now() - researchTimings.startedAt;
        setTimeToFirstNotes(elapsed);
        console.log(`[📊 Timing] 📝 First note received: ${(elapsed / 1000).toFixed(2)}s`);
      }
    }
  }, [filteredCandidates, timeToFirstNotes, researchTimings]);

  // NEW: Track when first paper with notes appears
  useEffect(() => {
    if (timeToFirstPaper === null && researchTimings && filteredCandidates.some(p => (p.notes?.length || 0) > 0)) {
      const elapsed = performance.now() - researchTimings.startedAt;
      setTimeToFirstPaper(elapsed);
      console.log(`[📊 Timing] 📄 First paper with notes: ${(elapsed / 1000).toFixed(2)}s`);
    }
  }, [filteredCandidates, timeToFirstPaper, researchTimings]);

  // NEW: Log timing report when research completes
  useEffect(() => {
    if (researchPhase === 'completed' && researchTimings) {
      const totalDuration = performance.now() - researchTimings.startedAt;
      const lines = [
        '\n╔════════════════════════════════════════════════╗',
        '║      DEEP RESEARCH PIPELINE TIMING REPORT      ║',
        '╚════════════════════════════════════════════════╝\n'
      ];

      // Phase breakdown
      lines.push('📊 PHASE BREAKDOWN:');
      Object.entries(researchTimings.phases).forEach(([phase, data]) => {
        if (data?.duration !== undefined) {
          const percentage = ((data.duration / totalDuration) * 100).toFixed(1);
          lines.push(`  ${phase.padEnd(15)} ${data.duration.toFixed(2)}ms (${percentage}%)`);
        }
      });

      // Milestone timings
      lines.push('\n⏱️  MILESTONES:');
      if (timeToFirstNotes !== null) {
        lines.push(`  First note received: ${(timeToFirstNotes / 1000).toFixed(2)}s`);
      }
      if (timeToFirstPaper !== null) {
        lines.push(`  First paper w/ notes: ${(timeToFirstPaper / 1000).toFixed(2)}s`);
      }

      // Total
      lines.push(`\n✅ TOTAL DURATION: ${(totalDuration / 1000).toFixed(2)}s\n`);
      console.log(lines.join('\n'));
    }
  }, [researchPhase, researchTimings, timeToFirstNotes, timeToFirstPaper]);

  const getNoteId = useCallback(
    (note: DeepResearchNote) => `${note.pdfUri}-${note.pageNumber}-${note.quote.slice(0, 20)}`,
    []
  );

  const isNoteInContext = useCallback((note: DeepResearchNote) => {
    const id = getNoteId(note);
    return contextNotes.some(n => getNoteId(n) === id);
  }, [contextNotes]);

  const updateUploadedPaperStatus = useCallback((uri: string, status: string) => {
    setUploadedPaperStatuses(prev => ({ ...prev, [uri]: status }));
  }, []);

  const toggleContextNote = useCallback((note: DeepResearchNote) => {
    const id = getNoteId(note);
    setContextNotes(prev => {
      const currentlyIn = prev.some(n => getNoteId(n) === id);
      return currentlyIn ? prev.filter(n => getNoteId(n) !== id) : [...prev, note];
    });
  }, []);

  const toggleArxivSelection = useCallback((id: string) => {
    setSelectedArxivIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleWebSourceSelection = useCallback((uri: string) => {
    setSelectedWebSourceUris(prev => {
      const next = new Set(prev);
      if (next.has(uri)) next.delete(uri); else next.add(uri);
      return next;
    });
  }, []);

  const selectAllArxivPapers = useCallback((ids: string[]) => setSelectedArxivIds(new Set(ids)), []);
  const clearArxivSelection = useCallback(() => setSelectedArxivIds(new Set()), []);

  // ─── NEW: Unified selection functions by URI ──────────────────────────────
  // These functions work across ALL components using paper URI as the key
  const isPaperSelectedByUri = useCallback((uri?: string): boolean => {
    if (!uri) return false;
    return selectedPaperUris.has(uri);
  }, [selectedPaperUris]);

  const addToSelectionByUri = useCallback((uri: string) => {
    if (!uri) return;
    setSelectedPaperUris(prev => new Set(prev).add(uri));
  }, []);

  const removeFromSelectionByUri = useCallback((uri: string) => {
    if (!uri) return;
    setSelectedPaperUris(prev => {
      const next = new Set(prev);
      next.delete(uri);
      return next;
    });
  }, []);

  const getSelectedPaperUris = useCallback((): string[] => {
    return Array.from(selectedPaperUris);
  }, [selectedPaperUris]);

  // NEW: Helper functions for timing tracking
  const startPhaseTimer = useCallback((phase: ResearchPhase) => {
    setResearchTimings(prev => {
      if (!prev) return null;
      const now = performance.now();
      const updatedPhases = { ...prev.phases };
      updatedPhases[phase] = { start: now };
      console.log(`[📊 Timing] Phase "${phase}" started`);
      return { ...prev, phases: updatedPhases };
    });
  }, []);

  const endPhaseTimer = useCallback((phase: ResearchPhase) => {
    setResearchTimings(prev => {
      if (!prev?.phases[phase]) return prev;
      const now = performance.now();
      const phaseData = { ...prev.phases[phase] };
      const duration = now - phaseData.start;
      phaseData.end = now;
      phaseData.duration = duration;
      
      const totalElapsed = now - prev.startedAt;
      console.log(
        `[📊 Timing] Phase "${phase}" completed\n` +
        `  Duration: ${duration.toFixed(2)}ms\n` +
        `  Total elapsed: ${totalElapsed.toFixed(2)}ms`
      );
      
      const allPhases = { ...prev.phases };
      allPhases[phase] = phaseData;
      return { ...prev, phases: allPhases };
    });
  }, []);

  // NEW: Sync paper status from processing to accumulated papers
  // Updates analysisStatus and progressively adds notes as they're extracted
  const syncPaperStatusToAccumulated = useCallback((paperId: string, newStatus: string, newNotes?: DeepResearchNote[]) => {
    setAccumulatedPapers(prev => prev.map(paper => {
      if (paper.id === paperId || paper.pdfUri === paperId) {
        const updated = { ...paper, analysisStatus: newStatus };
        if (newNotes && newNotes.length > 0) {
          // Merge new notes with existing, dedup by quote
          const existingQuotes = new Set((paper.notes || []).map(n => n.quote));
          const uniqueNewNotes = newNotes.filter(n => !existingQuotes.has(n.quote));
          updated.notes = [...(paper.notes || []), ...uniqueNewNotes];
        }
        return updated;
      }
      return paper;
    }));
  }, []);

  // NEW: Add papers and notes to accumulation (APPEND, not replace)
  // Handles duplicate merging intelligently
  const addToPaperResults = useCallback((papers: ArxivPaper[], notes: DeepResearchNote[]) => {
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║ [CONTEXT-ADDTOPAPER] addToPaperResults - CALLED              ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    
    console.log('[CONTEXT-ADDTOPAPER] 📥 Function called with:', {
      papersCount: papers.length,
      papersIds: papers.map(p => p.id || p.pdfUri),
      papersTitles: papers.map(p => p.title),
      notesCount: notes.length,
      notesStructure: notes.slice(0, 3).map(n => ({
        pdfUri: n.pdfUri,
        pageNumber: n.pageNumber,
        quoteLength: n.quote?.length,
        hasJustification: !!n.justification
      }))
    });

    setAccumulatedPapers(prev => {
      console.log('[CONTEXT-ADDTOPAPER] 📊 Current accumulated papers before merge:', {
        count: prev.length,
        ids: prev.map(p => p.id || p.pdfUri).slice(0, 5)
      });

      // Convert to map for smart merging
      const merged: Record<string, ArxivPaper> = {};
      
      // Add existing papers to map
      prev.forEach(p => { 
        merged[p.id] = { ...p }; 
      });
      
      // Merge new papers (combine notes if duplicate ID)
      papers.forEach(newPaper => {
        if (merged[newPaper.id]) {
          // Paper already exists - preserve existing notes unless new ones are provided
          const existingNotes = merged[newPaper.id].notes || [];
          const newNotes = newPaper.notes || [];
          
          // Deduplicate notes by pdfUri + quote hash
          const noteMap = new Map<string, DeepResearchNote>();
          [...existingNotes, ...newNotes].forEach(n => {
            const hash = `${n.pdfUri}::${n.quote.substring(0, 50)}`;
            if (!noteMap.has(hash)) {
              noteMap.set(hash, n);
            }
          });
          
          merged[newPaper.id] = {
            ...newPaper,  // 🔑 FIRST: Fresh paper with fresh timestamp (addedToAccumulationAt)
            addedToAccumulationAt: Date.now(),  // ✅ UPDATE timestamp when re-processing
            notes: Array.from(noteMap.values())  // 🔑 SECOND: Merged notes (preserve old + new)
          };
          console.log(`[CONTEXT-ADDTOPAPER] 🔄 Merged notes for paper ${newPaper.id}: ${Array.from(noteMap.values()).length} total notes`);
        } else {
          // New paper - add to map
          console.log(`[CONTEXT-ADDTOPAPER] ✨ Adding NEW paper: ${newPaper.id} with ${newPaper.notes?.length || 0} notes`);
          merged[newPaper.id] = newPaper;
        }
      });
      
      // Return merged papers with new papers first
      const newPaperIds = new Set(papers.map(p => p.id));
      const allPapersArray = Object.values(merged);
      
      // Separate new vs old papers for proper ordering
      const newPapers = allPapersArray.filter(p => newPaperIds.has(p.id));
      const oldPapers = allPapersArray.filter(p => !newPaperIds.has(p.id));
      
      const finalResult = [...newPapers, ...oldPapers];  // New papers first, then old
      console.log('[CONTEXT-ADDTOPAPER] ✅ Papers state updated:', {
        totalAfterMerge: finalResult.length,
        newPapersCount: newPapers.length,
        oldPapersCount: oldPapers.length,
        allIds: finalResult.map(p => p.id),
        totalNotesInAll: finalResult.reduce((sum, p) => sum + (p.notes?.length || 0), 0)
      });
      
      return finalResult;
    });
    
    // Add notes to accumulation
    console.log('[CONTEXT-ADDTOPAPER] 📝 Adding notes to accumulation...');
    setAccumulatedNotes(prev => {
      // Create set of existing note keys for deduplication
      const existingNoteKeys = new Set(
        prev.map(n => `${n.pdfUri}::${n.quote.substring(0, 50)}`)
      );
      
      // Filter new notes that aren't already in accumulation
      const uniqueNewNotes = notes.filter(n => 
        !existingNoteKeys.has(`${n.pdfUri}::${n.quote.substring(0, 50)}`)
      );
      
      const finalNotes = [...uniqueNewNotes, ...prev];
      console.log('[CONTEXT-ADDTOPAPER] ✅ Notes state updated:', {
        previousCount: prev.length,
        incomingCount: notes.length,
        deduplicatedAdded: uniqueNewNotes.length,
        newTotalCount: finalNotes.length,
        newNotesUris: uniqueNewNotes.map(n => n.pdfUri),
        newNotesPages: uniqueNewNotes.map(n => n.pageNumber)
      });
      
      // Prepend new notes (newest first)
      return finalNotes;
    });
    
    // Update metadata
    setPaperResultsMetadata(prev => {
      const newMetadata = {
        ...prev,
        lastUpdated: new Date().toISOString(),
        totalPapersProcessed: (prev.totalPapersProcessed || 0) + papers.length,
        totalNotesExtracted: (prev.totalNotesExtracted || 0) + notes.length,
        lastAddedCount: {
          papers: papers.length,
          notes: notes.length,
          timestamp: new Date().toISOString()
        }
      };
      console.log('[CONTEXT-ADDTOPAPER] 📊 Metadata updated:', newMetadata);
      return newMetadata;
    });
    
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║ [CONTEXT-ADDTOPAPER] addToPaperResults - COMPLETE            ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
  }, []);

  const clearPaperResults = useCallback(() => {
    console.log('[ResearchContext] 🔴 CLEARING ALL PAPER RESULTS');
    console.log('[ResearchContext] Papers being cleared:', {
      count: accumulatedPapers.length,
      ids: accumulatedPapers.map(p => p.id || p.pdfUri)
    });
    
    // Clear React state
    setAccumulatedPapers([]);
    setAccumulatedNotes([]);
    setPaperResultsMetadata({});
    
    // Clear primary localStorage key
    localStorageService.clearPaperResultsAccumulation();
    
    // IMPORTANT: Also remove all accumulated papers from database 
    // (they were added during research sessions and shouldn't persist)
    // This prevents the papers from reappearing after page refresh
    accumulatedPapers.forEach(paper => {
      const paperUri = paper.pdfUri || paper.id;
      if (paperUri) {
        console.log('[ResearchContext] 🗑️ Deleting paper from database:', paperUri);
        try {
          localStorageService.deletePaper(paperUri);
        } catch (error) {
          console.error('[ResearchContext] Failed to delete paper:', paperUri, error);
        }
      }
    });
    
    console.log('[ResearchContext] ✅ Cleared all paper results and removed from database');
  }, [accumulatedPapers]);

  // NEW: Remove a single paper from results
  const removePaperFromResults = useCallback((paperId: string) => {
    setAccumulatedPapers(prev => prev.filter(p => p.id !== paperId));
    setAccumulatedNotes(prev => prev.filter(n => n.pdfUri !== paperId));
    console.log('[ResearchContext] Removed paper from results:', paperId);
  }, []);

  const resetSearch = useCallback(() => {
    if (abortControllerRef.current) { abortControllerRef.current.abort(); abortControllerRef.current = null; }
    setSearchState({ query: '', isLoading: false, data: null, hasSearched: false, error: null });
    setResearchPhase('idle');
    setArxivCandidates([]);
    setFilteredCandidates([]);
    setDeepResearchResults([]);
    setSelectedArxivIds(new Set());
    setProcessedPdfs([]); // Clear processed PDFs
    setShowUploadedTab(false); // Reset tab signal
    setUploadedPaperStatuses({}); // Clear uploaded paper statuses
    setShouldOpenPdfViewer(false); // Reset navigation intent
    setNavigationHandled(false); // Reset navigation flag
  }, []);

  // Complete reset for sign out - clears all research and search data
  const resetAllResearchData = useCallback(() => {
    resetSearch();
    clearSearchBar();
    setActiveSearchMode('web');
    setGatheringStatus('');
    setArxivKeywords([]);
    setContextNotes([]);
    setProcessedPdfs([]);
    setShowUploadedTab(false);
    setUploadedPaperStatuses({});
    setShouldOpenPdfViewer(false);
    setNavigationHandled(false);
    setIsDeepSearchBarExpanded(false); // Reset deep search bar expansion

    // Clear persisted search results
    localStorageService.clearWebSearchResults();
    localStorageService.clearDeepResearchResults();
  }, [resetSearch, clearSearchBar, setIsDeepSearchBarExpanded]);

  const performWebSearch = useCallback(async (query: string) => {
    setActiveSearchMode('web');
    setSearchBarState(prev => ({ ...prev, mainInput: query }));
    addToHistory(query);

    // Clear old web search results before new search
    localStorageService.clearWebSearchResults();

    setSearchState(prev => ({ ...prev, query, isLoading: true, hasSearched: true, error: null, data: null }));
    try {
      const data = await performSearch(query);
      setSearchState(prev => ({ ...prev, isLoading: false, data }));

      // Save web search results to localStorage
      localStorageService.saveWebSearchResults(query, data);
    } catch (error) {
      setSearchState(prev => ({ ...prev, isLoading: false, error: "Search failed. Please try again." }));
    }
  }, [addToHistory]);

  const stopDeepResearch = useCallback(() => {
    if (abortControllerRef.current) abortControllerRef.current.abort();

    // Stop ArXiv papers
    setFilteredCandidates(prev => prev.map(p => (!p.analysisStatus || ['pending', 'downloading', 'processing'].includes(p.analysisStatus)) ? { ...p, analysisStatus: 'stopped' } : p));

    // Stop uploaded papers
    setUploadedPaperStatuses(prev => {
      const updated = { ...prev };
      Object.keys(updated).forEach(uri => {
        if (['processing', 'extracting'].includes(updated[uri])) {
          updated[uri] = 'stopped';
        }
      });
      return updated;
    });

    setIsDeepResearching(false);
    setResearchPhase(prev => {
      if (prev === 'extracting') { setGatheringStatus("Research stopped. Showing partial results."); return 'completed'; }
      else { setGatheringStatus("Research stopped."); setArxivCandidates([]); setFilteredCandidates([]); return 'idle'; }
    });
  }, []);

  const analyzeArxivPapers = useCallback(async (papers: ArxivPaper[], userQuestions: string[], keywords: string[], signal?: AbortSignal) => {
    const PAPER_CONCURRENCY = 3;
    const processPaper = async (paper: ArxivPaper) => {
      if (signal?.aborted) return;
      setFilteredCandidates(prev => prev.map(p => p.id === paper.id ? { ...p, analysisStatus: 'downloading' } : p));
      syncPaperStatusToAccumulated(paper.id, 'downloading');  // NEW: Sync to accumulated
      try {
        if (signal?.aborted) throw new Error("Aborted");
        // FIXED: Pass AbortSignal to fetchPdfBuffer for cancellation support
        const buffer = await fetchPdfBuffer(paper.pdfUri, signal);
        if (signal?.aborted) throw new Error("Aborted");
        const extracted = await extractPdfData(buffer, signal);

        const aiYear = extracted.metadata.year?.match(/\b(19|20)\d{2}\b/)?.[0];
        const currentYear = paper.publishedDate?.match(/\b(19|20)\d{2}\b/)?.[0];

        setFilteredCandidates(prev => prev.map(p => {
          if (p.id !== paper.id) return p;
          const hasNoAuthors = !p.authors || p.authors.length === 0;
          return {
            ...p,
            analysisStatus: 'processing',
            title: extracted.metadata.title || p.title,
            // Only replace authors with AI-extracted lead author if the paper has no authors at all
            authors: (hasNoAuthors && extracted.metadata.author && extracted.metadata.author !== 'Unknown Author')
              ? [extracted.metadata.author]
              : p.authors,
            // Update date only if AI found a year and the paper has no extractable year
            publishedDate: aiYear && !currentYear ? aiYear : p.publishedDate,
            harvardReference: extracted.metadata.harvardReference,
            publisher: extracted.metadata.publisher,
            categories: extracted.metadata.categories
          };
        }));
        syncPaperStatusToAccumulated(paper.id, 'processing');  // NEW: Sync to accumulated
        
        if (signal?.aborted) throw new Error("Aborted");
        const relevantPages = await findRelevantPages([{ uri: paper.pdfUri, pages: extracted.pages }], userQuestions.join("\n"), keywords);
        if (relevantPages.length > 0) {
          const onStreamNotes = (newNotes: DeepResearchNote[]) => {
            setFilteredCandidates(prev => prev.map(p => p.id === paper.id ? { ...p, notes: [...(p.notes || []), ...newNotes] } : p));
            syncPaperStatusToAccumulated(paper.id, 'extracting', newNotes);  // NEW: Sync notes AND status
          };
          const allNotes = await extractNotesFromPages(
            relevantPages,
            userQuestions.join("\n"),
            paper.title,
            paper.summary,
            extracted.references,
            onStreamNotes
          );
          if (signal?.aborted) throw new Error("Aborted");
          setFilteredCandidates(prev => prev.map(p => p.id === paper.id ? { ...p, analysisStatus: 'completed', notes: allNotes } : p));
          syncPaperStatusToAccumulated(paper.id, 'completed', allNotes);  // NEW: Final sync
        } else {
          setFilteredCandidates(prev => prev.map(p => p.id === paper.id ? { ...p, analysisStatus: 'completed', notes: [] } : p));
          syncPaperStatusToAccumulated(paper.id, 'completed', []);  // NEW: Final sync
        }
      } catch (error: any) {
        const finalStatus = (error.message === "Aborted" || signal?.aborted) ? 'stopped' : 'failed';
        setFilteredCandidates(prev => prev.map(p => p.id === paper.id ? { ...p, analysisStatus: finalStatus } : p));
        syncPaperStatusToAccumulated(paper.id, finalStatus);  // NEW: Sync failure status
      }
    };
    await asyncPool(PAPER_CONCURRENCY, papers, processPaper);
  }, [syncPaperStatusToAccumulated]);

  const analyzeLoadedPdfs = useCallback(async (pdfs: LoadedPdf[], questions: string, signal?: AbortSignal) => {
    // CRITICAL: Store PDFs in ref immediately so they're available for append trigger
    currentAnalyzingPdfsRef.current = pdfs;
    console.log('[CONTEXT-ANALYZE-PDF] 📌 Stored PDFs in ref:', pdfs.map(p => p.uri));
    
    setIsDeepResearching(true);
    setDeepResearchResults([]);

    // Clear previous statuses and set all selected papers to processing
    const newStatuses: Record<string, string> = {};
    pdfs.forEach(pdf => {
      newStatuses[pdf.uri] = 'processing';
    });
    setUploadedPaperStatuses(newStatuses);

    try {
      const queries = await generateInsightQueries(questions, searchState.query);
      
      // DIAGNOSTIC: Enhanced callback with logging
      const onStreamUpdate = (newNotes: DeepResearchNote[]) => {
        console.log(`\n[CONTEXT-STATE-UPDATE] 📥 onStreamUpdate called with ${newNotes?.length || 0} notes`);
        console.log(`[CONTEXT-STATE-UPDATE] 📊 Notes received structure:`, {
          isArray: Array.isArray(newNotes),
          count: newNotes?.length,
          firstNote: newNotes?.[0] ? {
            pdfUri: newNotes[0].pdfUri,
            pageNumber: newNotes[0].pageNumber,
            quoteLength: newNotes[0].quote?.length,
            hasRelatedQuestion: !!newNotes[0].relatedQuestion
          } : 'N/A',
          allNotesUris: newNotes?.map(n => n.pdfUri) || []
        });
        
        console.log(`[CONTEXT-STATE-UPDATE] 🔄 Calling setDeepResearchResults...`);
        setDeepResearchResults(prev => {
          const updated = [...prev, ...newNotes];
          console.log(`[CONTEXT-STATE-UPDATE] ✅ deepResearchResults updated:`, {
            previousCount: prev.length,
            addedCount: newNotes.length,
            newTotalCount: updated.length,
            allPdfUris: updated.map(n => n.pdfUri),
            allPageNumbers: updated.map(n => n.pageNumber)
          });
          return updated;
        });
        
        // NEW: Sync notes to accumulated papers for first PDF's notes
        if (newNotes.length > 0 && pdfs.length > 0) {
          const pdfUri = newNotes[0].pdfUri;
          syncPaperStatusToAccumulated(pdfUri, 'extracting', newNotes);  // NEW: Sync notes as they arrive
        }
      };

      for (const pdf of pdfs) {
        if (signal?.aborted) break;
        try {
          // Update status to analyzing
          updateUploadedPaperStatus(pdf.uri, 'processing');
          syncPaperStatusToAccumulated(pdf.uri, 'processing');  // NEW: Sync to accumulated

          const relevantPages = await findRelevantPages([{ uri: pdf.uri, pages: pdf.pages }], questions, queries);

          if (relevantPages.length > 0) {
            // Update status to extracting
            if (!signal?.aborted) {
              updateUploadedPaperStatus(pdf.uri, 'extracting');
              syncPaperStatusToAccumulated(pdf.uri, 'extracting');  // NEW: Sync to accumulated
            }

            console.log(`\n[CONTEXT-ANALYZE-PDF] 🔄 Calling extractNotesFromPages for PDF: ${pdf.uri}`);
            console.log(`[CONTEXT-ANALYZE-PDF] 📊 Input: ${relevantPages.length} relevant pages`);
            
            const allNotes = await extractNotesFromPages(
              relevantPages,
              questions,
              pdf.metadata.title,
              pdf.text,
              pdf.references,
              onStreamUpdate
            );
            
            // CRITICAL FIX: Capture returned notes and add to deepResearchResults
            console.log(`[CONTEXT-ANALYZE-PDF] ✅ extractNotesFromPages returned: ${allNotes?.length || 0} notes`);
            console.log(`[CONTEXT-ANALYZE-PDF] 📊 Notes Structure (first 3):`, {
              notesArray: Array.isArray(allNotes),
              totalCount: allNotes?.length,
              firstNote: allNotes?.[0] ? {
                pdfUri: allNotes[0].pdfUri,
                pageNumber: allNotes[0].pageNumber,
                quoteLength: allNotes[0].quote?.length,
                hasJustification: !!allNotes[0].justification
              } : 'No notes',
              secondNote: allNotes?.[1] ? {
                pdfUri: allNotes[1].pdfUri,
                pageNumber: allNotes[1].pageNumber,
                quoteLength: allNotes[1].quote?.length
              } : 'No second note',
              thirdNote: allNotes?.[2] ? {
                pdfUri: allNotes[2].pdfUri,
                pageNumber: allNotes[2].pageNumber,
                quoteLength: allNotes[2].quote?.length
              } : 'No third note'
            });
            
            if (allNotes && allNotes.length > 0) {
              console.log(`[CONTEXT-ANALYZE-PDF] 🎯 Calling onStreamUpdate with ${allNotes.length} notes`);
              onStreamUpdate(allNotes);
              syncPaperStatusToAccumulated(pdf.uri, 'completed', allNotes);  // NEW: Final sync with all notes
              console.log(`[CONTEXT-ANALYZE-PDF] ✅ onStreamUpdate complete - notes should be in deepResearchResults now`);
            } else {
              console.log(`[CONTEXT-ANALYZE-PDF] ⚠️  No notes returned from extractNotesFromPages`);
              syncPaperStatusToAccumulated(pdf.uri, 'completed', []);  // NEW: Final sync
            }
          } else {
            // No relevant pages - mark as completed anyway
            syncPaperStatusToAccumulated(pdf.uri, 'completed', []);  // NEW: Sync completion
          }

          // Mark as completed
          if (!signal?.aborted) {
            updateUploadedPaperStatus(pdf.uri, 'completed');
          }

        } catch (e) {
          console.error(e);
          if (!signal?.aborted) {
            updateUploadedPaperStatus(pdf.uri, 'failed');
            syncPaperStatusToAccumulated(pdf.uri, 'failed');  // NEW: Sync failure
          }
        }
      }
    } catch (e) {
      console.error(e);
      // Mark all remaining papers as failed
      pdfs.forEach(pdf => {
        if (!signal?.aborted) {
          updateUploadedPaperStatus(pdf.uri, 'failed');
        }
      });
    } finally {
      setIsDeepResearching(false);
    }
  }, [searchState.query, updateUploadedPaperStatus, syncPaperStatusToAccumulated]);

  const performHybridResearch = useCallback(async (pdfs: LoadedPdf[], arxivPapers: ArxivPaper[], questions: string[], keywords: string[]) => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;
    
    // CRITICAL FIX: Store the PDFs being analyzed BEFORE setting phase
    // Must happen before phase change to avoid race condition in AgentResearcher append trigger
    console.log('[ResearchContext] 🔄 Setting processedPdfs to:', pdfs.map(p => p.uri));
    setProcessedPdfs(pdfs);
    
    // NOTE: performHybridResearch is for Deep Search ONLY
    // NO addToPaperResults() call here - use performHybridAnalysis for Agent papers
    
    console.log('[ResearchContext] 🔍 performHybridResearch called (Deep Search):', {
      pdfsCount: pdfs.length,
      arxivPapersCount: arxivPapers.length,
      shouldSetExtractingPhase: pdfs.length > 0 || arxivPapers.length > 0
    });
    
    setGatheringStatus("Analyzing documents...");
    // CRITICAL: Set extracting phase even if only PDFs (no ArXiv)
    // This triggers AgentResearcher's reset useEffect for new research sessions
    if (pdfs.length > 0 || arxivPapers.length > 0) {
      console.log('[ResearchContext] ⏱️ Setting phase to extracting');
      setResearchPhase('extracting');
    }
    const questionsStr = questions.join('\n');
    const tasks = [];
    if (pdfs.length > 0) tasks.push(analyzeLoadedPdfs(pdfs, questionsStr, signal));
    if (arxivPapers.length > 0) tasks.push(analyzeArxivPapers(arxivPapers, questions, keywords, signal));
    await Promise.all(tasks);

    if (!signal.aborted) {
      setResearchPhase('completed'); // Always set completed, regardless of arxiv papers
      setGatheringStatus("Analysis complete.");
      
      // 🔑 CRITICAL FIX: Remove any synced papers from accumulation
      // (They were synced for UI updates during analysis but shouldn't persist in "My Results")
      // This ensures Deep Search papers don't leak into the Agent's "My Results" tab
      const deepSearchPaperIds = new Set([
        ...pdfs.map(p => p.uri),
        ...arxivPapers.map(p => p.id)
      ]);
      
      console.log('[ResearchContext] 🧹 Cleaning up synced papers from accumulation (Deep Search only):', {
        removedCount: Array.from(deepSearchPaperIds).length,
        removedIds: Array.from(deepSearchPaperIds)
      });
      
      setAccumulatedPapers(prev => {
        const filtered = prev.filter(p => !deepSearchPaperIds.has(p.id));
        console.log('[ResearchContext] 🧹 Accumulated papers after cleanup:', {
          before: prev.length,
          after: filtered.length,
          removed: prev.length - filtered.length
        });
        return filtered;
      });
      
      setAccumulatedNotes(prev => {
        const filtered = prev.filter(n => !deepSearchPaperIds.has(n.pdfUri));
        console.log('[ResearchContext] 🧹 Accumulated notes after cleanup:', {
          before: prev.length,
          after: filtered.length,
          removed: prev.length - filtered.length
        });
        return filtered;
      });
    }
  }, [analyzeLoadedPdfs, analyzeArxivPapers, setProcessedPdfs]);

  // NEW: performHybridAnalysis - for Agent Researcher (WITH accumulation)
  const performHybridAnalysis = useCallback(async (pdfs: LoadedPdf[], arxivPapers: ArxivPaper[], questions: string[], keywords: string[]) => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;
    
    // CRITICAL FIX: Store the PDFs being analyzed BEFORE setting phase
    console.log('[ResearchContext] 🔄 Setting processedPdfs to:', pdfs.map(p => p.uri));
    setProcessedPdfs(pdfs);
    
    // ✅ ADDED: Add papers to accumulatedPapers IMMEDIATELY (at research start)
    // Papers start with 'pending' status and empty notes, then get updated in real-time
    // IMPORTANT: These are USER-SELECTED papers from Agent, so they SHOULD persist in "My Results"
    if (pdfs.length > 0 || arxivPapers.length > 0) {
      console.log('[ResearchContext] 📥 Adding papers to accumulatedPapers at research START (Agent Analysis)');
      
      const initialPapers = [
        // Add PDFs as paper objects
        ...pdfs.map(pdf => ({
          id: pdf.uri,
          pdfUri: pdf.uri,
          title: pdf.metadata.title || pdf.file.name,
          authors: pdf.metadata.author ? [pdf.metadata.author] : [],
          analysisStatus: 'pending' as const,
          notes: [],
          summary: pdf.text?.substring(0, 500) || '',
          publishedDate: new Date().toISOString(),
          references: pdf.references || [],
          harvardReference: '',
          publisher: '',
          categories: [],
          addedToAccumulationAt: Date.now()
        } as ArxivPaper)),
        // Add ArXiv papers with reset status
        ...arxivPapers.map(paper => ({
          ...paper,
          analysisStatus: 'pending' as const,
          notes: [],
          addedToAccumulationAt: Date.now()
        }))
      ];
      
      // Call addToPaperResults to add all papers at once
      addToPaperResults(initialPapers, []);
      console.log('[ResearchContext] ✅ Added', initialPapers.length, 'papers to accumulatedPapers');
    }
    
    console.log('[ResearchContext] 🔍 performHybridAnalysis called (Agent Analysis):', {
      pdfsCount: pdfs.length,
      arxivPapersCount: arxivPapers.length,
      shouldSetExtractingPhase: pdfs.length > 0 || arxivPapers.length > 0
    });
    
    setGatheringStatus("Analyzing documents...");
    // CRITICAL: Set extracting phase even if only PDFs (no ArXiv)
    if (pdfs.length > 0 || arxivPapers.length > 0) {
      console.log('[ResearchContext] ⏱️ Setting phase to extracting');
      setResearchPhase('extracting');
    }
    const questionsStr = questions.join('\n');
    const tasks = [];
    if (pdfs.length > 0) tasks.push(analyzeLoadedPdfs(pdfs, questionsStr, signal));
    if (arxivPapers.length > 0) tasks.push(analyzeArxivPapers(arxivPapers, questions, keywords, signal));
    await Promise.all(tasks);

    if (!signal.aborted) {
      setResearchPhase('completed');
      setGatheringStatus("Analysis complete.");
      // ✅ NO CLEANUP - Papers stay in accumulation (desired behavior for Agent)
    }
  }, [analyzeLoadedPdfs, analyzeArxivPapers, setProcessedPdfs, addToPaperResults]);

  const processUserUrls = useCallback(async (urls: string[], signal?: AbortSignal): Promise<LoadedPdf[]> => {
    const userPdfs: LoadedPdf[] = [];
    const CONCURRENCY = 2; // Process 2 URLs at a time to be gentle

    const processUrl = async (url: string) => {
      if (signal?.aborted) return null;

      try {
        // FIXED: Pass AbortSignal to fetchPdfBuffer for cancellation support
        const arrayBuffer = await fetchPdfBuffer(url, signal);
        if (signal?.aborted) return null;

        const extractedData = await extractPdfData(arrayBuffer, signal);
        const filename = url.split('/').pop()?.split('?')[0] || 'document.pdf';

        const pdf: LoadedPdf = {
          uri: url,
          file: new File([arrayBuffer], filename, { type: 'application/pdf' }),
          data: arrayBuffer,
          ...extractedData
        };

        return pdf;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.warn(`[ResearchContext] Failed to process user URL: ${url} - ${errorMsg}`);
        // Silent return is acceptable here (batch processing)
        // Error is logged to console for debugging
        return null;
      }
    };

    const results = await asyncPool(CONCURRENCY, urls, processUrl);
    return results.filter(pdf => pdf !== null);
  }, []);

  const performDeepResearch = useCallback(async (query: DeepResearchQuery) => {
    console.log('[ResearchContext] 🚀 performDeepResearch START - Initiating research:', {
      topicsCount: query.topics.length,
      urlsCount: query.urls.length,
      questionsCount: query.questions.length
    });

    setActiveSearchMode('deep');
    if (query.topics.length > 0) addToHistory(query.topics[0]);

    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    // NEW: Initialize timing tracker
    const now = performance.now();
    setResearchTimings({ startedAt: now, phases: {} });
    setTimeToFirstNotes(null);
    setTimeToFirstPaper(null);
    console.log('[📊 Timing] 🔍 Deep research pipeline started');

    setResearchPhase('initializing');
    startPhaseTimer('initializing');
    setArxivCandidates([]);
    setFilteredCandidates([]);
    setSearchState(prev => ({ ...prev, query: query.topics.join(', ') }));

    try {
      // CASE 1: URLs only (no topics) = Search only user PDFs
      if (query.urls.length > 0 && query.topics.length === 0) {
        setGatheringStatus("Processing provided PDFs...");

        // Set navigation intent based on single URL
        setShouldOpenPdfViewer(query.urls.length === 1);
        setNavigationHandled(false); // Reset navigation flag

        const userPdfs = await processUserUrls(query.urls, signal);
        setProcessedPdfs(userPdfs); // Store for navigation
        if (signal.aborted) return;

        if (userPdfs.length > 0) {
          setResearchPhase('extracting');
          setGatheringStatus("Extracting notes from your PDFs...");

          // Only analyze user PDFs
          await performHybridResearch(userPdfs, [], query.questions, []);
        } else {
          setGatheringStatus("No valid PDFs found.");
          setResearchPhase('completed');
        }
        return;
      }

      // CASE 2: Topics with optional URLs = Search ArXiv + user PDFs
      setGatheringStatus("Understanding topics...");

      // Process user URLs first if provided
      let userPdfs: LoadedPdf[] = [];
      if (query.urls.length > 0) {
        setGatheringStatus("Processing provided PDFs...");

        // For mixed searches, never open PDF viewer (only middle column)
        setShouldOpenPdfViewer(false);
        setNavigationHandled(false); // Reset navigation flag

        userPdfs = await processUserUrls(query.urls, signal);
        setProcessedPdfs(userPdfs); // Store for navigation
        if (signal.aborted) return;
      }

      // Then do ArXiv search
      if (signal.aborted) return;
      endPhaseTimer('initializing');
      const structuredTerms = await generateArxivSearchTerms(query.topics, query.questions);
      const displayKeywords = [structuredTerms.primary_keyword, ...structuredTerms.secondary_keywords].filter(Boolean);
      setArxivKeywords(displayKeywords);

      if (signal.aborted) return;
      setResearchPhase('searching');
      startPhaseTimer('searching');
      setGatheringStatus("Searching academic repositories...");
      const searchResult = await searchAllSources(structuredTerms, query.topics, query.questions, (msg) => setGatheringStatus(msg));
      
      // NEW: Store search metrics
      setSearchMetrics(searchResult.metrics);
      const candidates = searchResult.papers;

      if (signal.aborted) return;
      endPhaseTimer('searching');
      setArxivCandidates(candidates);

      if (candidates.length > 0) {
        setResearchPhase('filtering');
        startPhaseTimer('filtering');
        setGatheringStatus("Verifying relevance...");

        console.log('[ResearchContext] 🔍 Starting paper filtering:', {
          candidatesCount: candidates.length,
          questionsCount: query.questions.length,
          questions: query.questions,
          keywordsCount: displayKeywords.length,
          keywords: displayKeywords,
          firstCandidateTitle: candidates[0]?.title
        });

        // === INVESTIGATION: Add filter timing ===
        const filterStartTime = performance.now();
        console.log('[ResearchContext] ⏱️  Filtering START');
        
        const filtered = await filterRelevantPapers(candidates, query.questions, displayKeywords);

        const filterDuration = (performance.now() - filterStartTime).toFixed(0);
        console.log('[ResearchContext] ✅ Filtering COMPLETE:', {
          durationMs: filterDuration,
          durationSeconds: (parseInt(filterDuration) / 1000).toFixed(2),
          inputCount: candidates.length,
          outputCount: filtered.length,
          firstFilteredTitle: filtered[0]?.title
        });

        if (signal.aborted) return;
        endPhaseTimer('filtering');
        setResearchPhase('extracting');
        startPhaseTimer('extracting');
        setFilteredCandidates(filtered);

        const totalSources = userPdfs.length + filtered.length;
        setGatheringStatus(`Found ${totalSources} relevant sources. Gathering notes...`);

        // Combine user PDFs + ArXiv papers (user PDFs processed first)
        await performHybridResearch(userPdfs, filtered, query.questions, displayKeywords);

        if (signal.aborted) return;
        endPhaseTimer('extracting');
        setResearchPhase('completed');
      } else if (userPdfs.length > 0) {
        // Only user PDFs, no ArXiv matches
        endPhaseTimer('filtering');
        setResearchPhase('extracting');
        startPhaseTimer('extracting');
        setGatheringStatus("Analyzing your provided PDFs...");
        await performHybridResearch(userPdfs, [], query.questions, displayKeywords);
        if (signal.aborted) return;
        endPhaseTimer('extracting');
        setResearchPhase('completed');
      } else {
        endPhaseTimer('filtering');
        setGatheringStatus("No matches found.");
        setResearchPhase('completed');
      }
    } catch (err: any) {
      // === INVESTIGATION: Log filtering errors ===
      console.error('[ResearchContext] ❌ Filtering ERROR:', {
        message: err.message,
        name: err.name
      });
      if (!signal.aborted) {
        setGatheringStatus("Research failed.");
        setResearchPhase('failed');
      }
    }
  }, [addToHistory, processUserUrls, performHybridResearch]);

  const clearWebSearchResults = useCallback(() => {
    localStorageService.clearWebSearchResults();
    setSearchState({
      query: '',
      isLoading: false,
      data: null,
      hasSearched: false,
      error: null
    });
    console.log('[ResearchContext] Web search results cleared');
  }, []);

  const clearDeepResearchResults = useCallback(() => {
    localStorageService.clearDeepResearchResults();
    setArxivKeywords([]);
    setArxivCandidates([]);
    setFilteredCandidates([]);
    setDeepResearchResults([]);
    setResearchPhase('idle');
    setGatheringStatus('');
    console.log('[ResearchContext] Deep research results cleared');
  }, []);

  const contextValue = useMemo(() => ({
    activeSearchMode,
    setActiveSearchMode,
    searchState,
    searchBarState,
    updateSearchBar,
    clearSearchBar,
    searchHistory,
    addToHistory,
    removeFromHistory,
    clearHistory,
    researchPhase,
    gatheringStatus,
    arxivKeywords,
    arxivCandidates,
    filteredCandidates,
    selectedArxivIds,
    toggleArxivSelection,
    selectAllArxivPapers,
    clearArxivSelection,
    selectedWebSourceUris,
    toggleWebSourceSelection,
    // ─── NEW: Unified selection by URI ─────────────────────────────────────
    selectedPaperUris,
    isPaperSelectedByUri,
    addToSelectionByUri,
    removeFromSelectionByUri,
    getSelectedPaperUris,
    isDeepResearching,
    deepResearchResults,
    contextNotes,
    toggleContextNote,
    isNoteInContext,
    performWebSearch,
    performDeepResearch,
    performHybridResearch,
    performHybridAnalysis,
    stopDeepResearch,
    resetSearch,
    analyzeLoadedPdfs,
    analyzeArxivPapers,
    resetAllResearchData,
    processedPdfs,
    showUploadedTab,
    setShowUploadedTab,
    shouldOpenPdfViewer,
    setShouldOpenPdfViewer,
    uploadedPaperStatuses,
    updateUploadedPaperStatus,
    navigationHandled,
    setNavigationHandled,
    setProcessedPdfs,
    clearWebSearchResults,
    clearDeepResearchResults,
    pendingDeepResearchQuery,
    setPendingDeepResearchQuery,
    isDeepSearchBarExpanded,
    setIsDeepSearchBarExpanded,
    // NEW: Timing tracking
    researchTimings,
    timeToFirstNotes,
    timeToFirstPaper,
    // NEW: Search metrics tracking
    searchMetrics,
    // NEW: Accumulated results for "My Results" tab
    accumulatedPapers,
    accumulatedNotes,
    paperResultsMetadata,
    addToPaperResults,
    clearPaperResults,
    removePaperFromResults
  }), [
    activeSearchMode, searchState, searchBarState, updateSearchBar, clearSearchBar,
    searchHistory, addToHistory, removeFromHistory, clearHistory,
    researchPhase, gatheringStatus, arxivKeywords, arxivCandidates, filteredCandidates,
    selectedArxivIds, toggleArxivSelection, selectAllArxivPapers, clearArxivSelection,
    selectedWebSourceUris, toggleWebSourceSelection,
    selectedPaperUris, isPaperSelectedByUri, addToSelectionByUri, removeFromSelectionByUri, getSelectedPaperUris,
    isDeepResearching, deepResearchResults, contextNotes, toggleContextNote, isNoteInContext,
    performWebSearch, performDeepResearch, performHybridResearch, performHybridAnalysis, stopDeepResearch, resetSearch,
    analyzeLoadedPdfs, analyzeArxivPapers, resetAllResearchData, processedPdfs,
    showUploadedTab, shouldOpenPdfViewer, uploadedPaperStatuses, updateUploadedPaperStatus,
    navigationHandled, pendingDeepResearchQuery, isDeepSearchBarExpanded,
    researchTimings, timeToFirstNotes, timeToFirstPaper, searchMetrics,
    // NEW: Accumulated results
    accumulatedPapers, accumulatedNotes, paperResultsMetadata,
    addToPaperResults, clearPaperResults, removePaperFromResults
  ]);

  return (
    <ResearchContext.Provider value={contextValue}>
      {children}
    </ResearchContext.Provider>
  );
};

export const useResearch = () => {
  const context = useContext(ResearchContext);
  if (!context) throw new Error("useResearch must be used within a ResearchProvider");
  return context;
};
