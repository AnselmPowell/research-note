
import React, { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { SearchState, SearchMode, DeepResearchQuery, ArxivPaper, DeepResearchNote, LoadedPdf, SearchBarState, ResearchPhase } from '../types';
import { performSearch, generateArxivSearchTerms, filterRelevantPapers, findRelevantPages, extractNotesFromPages, generateInsightQueries } from '../services/geminiService';
import { extractPdfData, fetchPdfBuffer } from '../services/pdfService';
import { searchArxiv, buildArxivQueries } from '../services/arxivService';
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
        setFilteredCandidates(savedDeepResearch.filteredCandidates || []);
        setDeepResearchResults(savedDeepResearch.deepResearchResults || []);
        if (savedDeepResearch.searchBarState) {
          setSearchBarState(savedDeepResearch.searchBarState);
        }
        // Set research phase to 'completed' so UI knows to display results
        if (savedDeepResearch.filteredCandidates?.length > 0 || savedDeepResearch.deepResearchResults?.length > 0) {
          setResearchPhase('completed');
        }
        console.log('[ResearchContext] Loaded persisted deep research results:', {
          arxivKeywords: savedDeepResearch.arxivKeywords?.length || 0,
          arxivCandidates: savedDeepResearch.arxivCandidates?.length || 0,
          filteredCandidates: savedDeepResearch.filteredCandidates?.length || 0,
          deepResearchResults: savedDeepResearch.deepResearchResults?.length || 0
        });
      }
    } catch (e) {
      console.error("Failed to load persisted deep research results", e);
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

  // Auto-save deep research results whenever they change (debounced to prevent excessive writes)
  useEffect(() => {
    // Only save if we have actual data (not initial empty state)
    if (filteredCandidates.length > 0 || deepResearchResults.length > 0 || arxivCandidates.length > 0) {
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
    }
  }, [arxivKeywords, arxivCandidates, filteredCandidates, deepResearchResults, searchBarState]);

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

  const selectAllArxivPapers = useCallback((ids: string[]) => setSelectedArxivIds(new Set(ids)), []);
  const clearArxivSelection = useCallback(() => setSelectedArxivIds(new Set()), []);

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
      try {
        if (signal?.aborted) throw new Error("Aborted");
        const buffer = await fetchPdfBuffer(paper.pdfUri);
        if (signal?.aborted) throw new Error("Aborted");
        const extracted = await extractPdfData(buffer, signal);
        setFilteredCandidates(prev => prev.map(p => p.id === paper.id ? { ...p, analysisStatus: 'processing' } : p));
        if (signal?.aborted) throw new Error("Aborted");
        const relevantPages = await findRelevantPages([{ uri: paper.pdfUri, pages: extracted.pages }], userQuestions.join("\n"), keywords);
        if (relevantPages.length > 0) {
          const onStreamNotes = (newNotes: DeepResearchNote[]) => setFilteredCandidates(prev => prev.map(p => p.id === paper.id ? { ...p, notes: [...(p.notes || []), ...newNotes] } : p));
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
        } else {
          setFilteredCandidates(prev => prev.map(p => p.id === paper.id ? { ...p, analysisStatus: 'completed', notes: [] } : p));
        }
      } catch (error: any) {
        setFilteredCandidates(prev => prev.map(p => p.id === paper.id ? { ...p, analysisStatus: (error.message === "Aborted" || signal?.aborted) ? 'stopped' : 'failed' } : p));
      }
    };
    await asyncPool(PAPER_CONCURRENCY, papers, processPaper);
  }, []);

  const analyzeLoadedPdfs = useCallback(async (pdfs: LoadedPdf[], questions: string, signal?: AbortSignal) => {
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
      const onStreamUpdate = (newNotes: DeepResearchNote[]) => setDeepResearchResults(prev => [...prev, ...newNotes]);

      for (const pdf of pdfs) {
        if (signal?.aborted) break;
        try {
          // Update status to analyzing
          updateUploadedPaperStatus(pdf.uri, 'processing');

          const relevantPages = await findRelevantPages([{ uri: pdf.uri, pages: pdf.pages }], questions, queries);

          if (relevantPages.length > 0) {
            // Update status to extracting
            if (!signal?.aborted) {
              updateUploadedPaperStatus(pdf.uri, 'extracting');
            }

            await extractNotesFromPages(
              relevantPages,
              questions,
              pdf.metadata.title,
              pdf.text,
              pdf.references,
              onStreamUpdate
            );
          }

          // Mark as completed
          if (!signal?.aborted) {
            updateUploadedPaperStatus(pdf.uri, 'completed');
          }

        } catch (e) {
          console.error(e);
          if (!signal?.aborted) {
            updateUploadedPaperStatus(pdf.uri, 'failed');
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
  }, [searchState.query, updateUploadedPaperStatus]);

  const performHybridResearch = useCallback(async (pdfs: LoadedPdf[], arxivPapers: ArxivPaper[], questions: string[], keywords: string[]) => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;
    setGatheringStatus("Analyzing documents...");
    if (arxivPapers.length > 0) { setResearchPhase('extracting'); setFilteredCandidates(arxivPapers); }
    const questionsStr = questions.join('\n');
    const tasks = [];
    if (pdfs.length > 0) tasks.push(analyzeLoadedPdfs(pdfs, questionsStr, signal));
    if (arxivPapers.length > 0) tasks.push(analyzeArxivPapers(arxivPapers, questions, keywords, signal));
    await Promise.all(tasks);

    if (!signal.aborted) {
      setResearchPhase('completed'); // Always set completed, regardless of arxiv papers
      setGatheringStatus("Analysis complete.");
    }
  }, [analyzeLoadedPdfs, analyzeArxivPapers]);

  const processUserUrls = useCallback(async (urls: string[], signal?: AbortSignal): Promise<LoadedPdf[]> => {
    const userPdfs: LoadedPdf[] = [];
    const CONCURRENCY = 2; // Process 2 URLs at a time to be gentle

    const processUrl = async (url: string) => {
      if (signal?.aborted) return null;

      try {
        const arrayBuffer = await fetchPdfBuffer(url);
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
        console.error(`Failed to process URL: ${url}`, error);
        return null;
      }
    };

    const results = await asyncPool(CONCURRENCY, urls, processUrl);
    return results.filter(pdf => pdf !== null);
  }, []);

  const performDeepResearch = useCallback(async (query: DeepResearchQuery) => {
    setActiveSearchMode('deep');
    if (query.topics.length > 0) addToHistory(query.topics[0]);

    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    setResearchPhase('initializing');
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
      const structuredTerms = await generateArxivSearchTerms(query.topics, query.questions);
      const displayKeywords = [...structuredTerms.exact_phrases, ...structuredTerms.title_terms, ...structuredTerms.abstract_terms, ...structuredTerms.general_terms];
      setArxivKeywords(displayKeywords);

      if (signal.aborted) return;
      setResearchPhase('searching');
      setGatheringStatus("Searching academic repositories...");
      const apiQueries = buildArxivQueries(structuredTerms, query.topics, query.questions);
      const candidates = await searchArxiv(apiQueries, (msg) => setGatheringStatus(msg), query.topics);

      if (signal.aborted) return;
      setArxivCandidates(candidates);

      if (candidates.length > 0) {
        setResearchPhase('filtering');
        setGatheringStatus("Verifying relevance...");

        console.log('[ResearchContext] 🔍 Starting paper filtering:', {
          candidatesCount: candidates.length,
          questionsCount: query.questions.length,
          questions: query.questions,
          keywordsCount: displayKeywords.length,
          keywords: displayKeywords,
          firstCandidateTitle: candidates[0]?.title
        });

        const filtered = await filterRelevantPapers(candidates, query.questions, displayKeywords);

        console.log('[ResearchContext] ✅ Filtering complete:', {
          inputCount: candidates.length,
          outputCount: filtered.length,
          firstFilteredTitle: filtered[0]?.title,
          firstFilteredScore: filtered[0]?.relevanceScore
        });

        if (signal.aborted) return;
        setResearchPhase('extracting');
        setFilteredCandidates(filtered);

        const totalSources = userPdfs.length + filtered.length;
        setGatheringStatus(`Found ${totalSources} relevant sources. Gathering notes...`);

        // Combine user PDFs + ArXiv papers (user PDFs processed first)
        await performHybridResearch(userPdfs, filtered, query.questions, displayKeywords);

        if (signal.aborted) return;
        setResearchPhase('completed');
      } else if (userPdfs.length > 0) {
        // Only user PDFs, no ArXiv matches
        setResearchPhase('extracting');
        setGatheringStatus("Analyzing your provided PDFs...");
        await performHybridResearch(userPdfs, [], query.questions, displayKeywords);
        if (signal.aborted) return;
        setResearchPhase('completed');
      } else {
        setGatheringStatus("No matches found.");
        setResearchPhase('completed');
      }
    } catch (err: any) {
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
    isDeepResearching,
    deepResearchResults,
    contextNotes,
    toggleContextNote,
    isNoteInContext,
    performWebSearch,
    performDeepResearch,
    performHybridResearch,
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
    setIsDeepSearchBarExpanded
  }), [
    activeSearchMode, searchState, searchBarState, updateSearchBar, clearSearchBar,
    searchHistory, addToHistory, removeFromHistory, clearHistory,
    researchPhase, gatheringStatus, arxivKeywords, arxivCandidates, filteredCandidates,
    selectedArxivIds, toggleArxivSelection, selectAllArxivPapers, clearArxivSelection,
    isDeepResearching, deepResearchResults, contextNotes, toggleContextNote, isNoteInContext,
    performWebSearch, performDeepResearch, performHybridResearch, stopDeepResearch, resetSearch,
    analyzeLoadedPdfs, analyzeArxivPapers, resetAllResearchData, processedPdfs,
    showUploadedTab, shouldOpenPdfViewer, uploadedPaperStatuses, updateUploadedPaperStatus,
    navigationHandled, pendingDeepResearchQuery, isDeepSearchBarExpanded
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
