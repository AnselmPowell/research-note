
import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { SearchState, SearchMode, DeepResearchQuery, ArxivPaper, DeepResearchNote, LoadedPdf, SearchBarState, ResearchPhase } from '../types';
import { performSearch, generateArxivSearchTerms, filterRelevantPapers, findRelevantPages, extractNotesFromPages, generateInsightQueries } from '../services/geminiService';
import { extractPdfData, fetchPdfBuffer } from '../services/pdfService';
import { searchArxiv, buildArxivQueries } from '../services/arxivService';

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
}

const ResearchContext = createContext<ResearchContextType | undefined>(undefined);

export const ResearchProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeSearchMode, setActiveSearchMode] = useState<SearchMode>('web');
  
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

  const getNoteId = (note: DeepResearchNote) => `${note.pdfUri}-${note.pageNumber}-${note.quote.slice(0, 20)}`;

  const isNoteInContext = useCallback((note: DeepResearchNote) => {
    const id = getNoteId(note);
    return contextNotes.some(n => getNoteId(n) === id);
  }, [contextNotes]);

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
  }, []);

  // Complete reset for sign out - clears all research and search data
  const resetAllResearchData = useCallback(() => {
    resetSearch();
    clearSearchBar();
    setActiveSearchMode('web');
    setGatheringStatus('');
    setArxivKeywords([]);
    setContextNotes([]);
  }, [resetSearch, clearSearchBar]);

  const performWebSearch = async (query: string) => {
    setActiveSearchMode('web');
    setSearchBarState(prev => ({ ...prev, mainInput: query }));
    addToHistory(query);
    setSearchState(prev => ({ ...prev, query, isLoading: true, hasSearched: true, error: null, data: null }));
    try {
      const data = await performSearch(query);
      setSearchState(prev => ({ ...prev, isLoading: false, data }));
    } catch (error) {
      setSearchState(prev => ({ ...prev, isLoading: false, error: "Search failed. Please try again." }));
    }
  };

  const stopDeepResearch = useCallback(() => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    setFilteredCandidates(prev => prev.map(p => (!p.analysisStatus || ['pending', 'downloading', 'processing'].includes(p.analysisStatus)) ? { ...p, analysisStatus: 'stopped' } : p));
    setIsDeepResearching(false);
    setResearchPhase(prev => {
        if (prev === 'extracting') { setGatheringStatus("Research stopped. Showing partial results."); return 'completed'; } 
        else { setGatheringStatus("Research stopped."); setArxivCandidates([]); setFilteredCandidates([]); return 'idle'; }
    });
  }, []);

  const analyzeArxivPapers = async (papers: ArxivPaper[], userQuestions: string[], keywords: string[], signal?: AbortSignal) => {
    const PAPER_CONCURRENCY = 3;
    const processPaper = async (paper: ArxivPaper) => {
        if (signal?.aborted) return;
        setFilteredCandidates(prev => prev.map(p => p.id === paper.id ? { ...p, analysisStatus: 'downloading' } : p));
        try {
            if (signal?.aborted) throw new Error("Aborted");
            const buffer = await fetchPdfBuffer(paper.pdfUri);
            if (signal?.aborted) throw new Error("Aborted");
            const extracted = await extractPdfData(buffer);
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
  };

  const performDeepResearch = async (query: DeepResearchQuery) => {
     setActiveSearchMode('deep');
     if (query.topics.length > 0) addToHistory(query.topics[0]);
     if (abortControllerRef.current) abortControllerRef.current.abort();
     abortControllerRef.current = new AbortController();
     const signal = abortControllerRef.current.signal;
     setResearchPhase('initializing');
     setGatheringStatus("Understanding topics...");
     setArxivCandidates([]);
     setFilteredCandidates([]);
     setSearchState(prev => ({...prev, query: query.topics.join(', ')}));
     try {
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
            const filtered = await filterRelevantPapers(candidates, query.questions, displayKeywords);
            if (signal.aborted) return;
            setResearchPhase('extracting');
            setFilteredCandidates(filtered);
            setGatheringStatus(`Found ${filtered.length} relevant sources. Gathering notes...`);
            await analyzeArxivPapers(filtered, query.questions, displayKeywords, signal);
            if (signal.aborted) return;
            setResearchPhase('completed');
        } else { setGatheringStatus("No matches found."); setResearchPhase('completed'); }
     } catch (err: any) { if (!signal.aborted) { setGatheringStatus("Research failed."); setResearchPhase('failed'); } }
  };

  const analyzeLoadedPdfs = async (pdfs: LoadedPdf[], questions: string, signal?: AbortSignal) => {
    setIsDeepResearching(true);
    setDeepResearchResults([]);
    try {
        const queries = await generateInsightQueries(questions, searchState.query);
        const onStreamUpdate = (newNotes: DeepResearchNote[]) => setDeepResearchResults(prev => [...prev, ...newNotes]);
        for (const pdf of pdfs) {
            if (signal?.aborted) break;
            try {
                const relevantPages = await findRelevantPages([{ uri: pdf.uri, pages: pdf.pages }], questions, queries);
                if (relevantPages.length > 0) {
                    await extractNotesFromPages(
                      relevantPages, 
                      questions, 
                      pdf.metadata.title, 
                      pdf.text, 
                      pdf.references, 
                      onStreamUpdate
                    );
                }
            } catch (e) { console.error(e); }
        }
    } catch (e) { console.error(e); } finally { setIsDeepResearching(false); }
  };

  const performHybridResearch = async (pdfs: LoadedPdf[], arxivPapers: ArxivPaper[], questions: string[], keywords: string[]) => {
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
      if (!signal.aborted) { if (arxivPapers.length > 0) setResearchPhase('completed'); setGatheringStatus("Analysis complete."); }
  };

  return (
    <ResearchContext.Provider value={{
      activeSearchMode, setActiveSearchMode, searchState, searchBarState, updateSearchBar, clearSearchBar,
      searchHistory, addToHistory, removeFromHistory, clearHistory,
      researchPhase, gatheringStatus, arxivKeywords, arxivCandidates, filteredCandidates,
      selectedArxivIds, toggleArxivSelection, selectAllArxivPapers, clearArxivSelection,
      isDeepResearching, deepResearchResults, contextNotes, toggleContextNote, isNoteInContext,
      performWebSearch, performDeepResearch, performHybridResearch, stopDeepResearch, resetSearch,
      analyzeLoadedPdfs, analyzeArxivPapers, resetAllResearchData
    }}>
      {children}
    </ResearchContext.Provider>
  );
};

export const useResearch = () => {
  const context = useContext(ResearchContext);
  if (!context) throw new Error("useResearch must be used within a ResearchProvider");
  return context;
};
