
import React, { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { SearchState, SearchMode, DeepResearchQuery, ArxivPaper, DeepResearchNote, LoadedPdf, SearchBarState, ResearchPhase, ResearchTimings, SearchMetrics } from '../types';
import { performSearch, generateArxivSearchTerms, filterRelevantPapers, findRelevantPages, extractNotesFromPages, generateInsightQueries, rankTopNotes as rankNotesAI } from '../services/geminiService';
import { extractPdfData, fetchPdfBuffer } from '../services/pdfService';
import { searchAllSources } from '../services/searchAggregator';
import { localStorageService } from '../utils/localStorageService';
import { toastService } from '../services/toastService';

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
  // New: track if deep research tab is active
  isResearchFindingsTabActive: boolean;
  setIsResearchFindingsTabActive: (active: boolean) => void;
  // New: track deep search bar expansion state for UI layout
  isDeepSearchBarExpanded: boolean;
  setIsDeepSearchBarExpanded: (expanded: boolean) => void;
  // NEW: timing tracking for pipeline phases
  researchTimings: ResearchTimings | null;
  timeToFirstNotes: number | null;
  timeToFirstPaper: number | null;
  // NEW: search metrics tracking
  searchMetrics: SearchMetrics | null;
  // NEW: Top Note Ranking
  topNoteIds: string[];
  hasRankedOnce: boolean;  // ✅ NEW: Track if user has ranked
  selectIntelligent40Notes: (
    allNotes: Array<{uniqueId: string; quote: string; relatedQuestion?: string; sourceId: string; pageNumber?: number}>,
    questions: string[],
    maxNotes?: number
  ) => Array<{uniqueId: string; quote: string; relatedQuestion?: string; score?: number}>;
  rankTopNotes: () => Promise<void>;
  // NEW: Accumulated results for "My Results" tab (persistent across searches)
  accumulatedPapers: ArxivPaper[];
  accumulatedNotes: DeepResearchNote[];
  paperResultsMetadata: Record<string, any>;
  addToPaperResults: (papers: ArxivPaper[], notes: DeepResearchNote[]) => void;
  clearPaperResults: () => void;
  removePaperFromResults: (paperId: string) => void;
  resetAccumulatedDataForMigration: () => void;
  // NEW: Insight questions for deepening research
  insightQuestions: string[];
  selectedInsightQuestions: string[];
  hasSubmittedInsights: boolean;
  toggleInsightQuestion: (q: string) => void;
  updateInsightQuestion: (index: number, newText: string) => void;
  addInsightQuestion: (newText: string) => void;
  resolveInsights: () => void;
  // NEW: Research Purpose for deeper context
  researchPurpose: string;
  submitResearchPurpose: (purpose: string) => void;
  skipResearchPurpose: () => void;
  // NEW: Control research purpose modal visibility independently
  showPurposeModal: boolean;
}

const ResearchContext = createContext<ResearchContextType | undefined>(undefined);

/**
 * Intelligently select up to 40 notes from a larger pool using multi-strategy sampling
 * 
 * Strategy:
 * 1. Question Coverage: Ensure each question has representation (up to 5 notes per question)
 * 2. Paper Diversity: Sample from different papers to avoid bias toward one source
 * 3. Page Distribution: Prefer notes from different pages to capture document breadth
 * 4. Fallback: If still under 40, add remaining notes by paper order
 */
const selectIntelligent40Notes = (
  allNotes: Array<{uniqueId: string; quote: string; relatedQuestion?: string; sourceId: string; pageNumber?: number}>,
  questions: string[],
  maxNotes: number = 40
): Array<{uniqueId: string; quote: string; relatedQuestion?: string; score?: number}> => {
  
  console.log('[selectIntelligent40] 🎯 Starting intelligent selection:', {
    totalNotes: allNotes.length,
    targetMax: maxNotes,
    questionsCount: questions.length
  });
  
  // If 40 or fewer notes, return all
  if (allNotes.length <= maxNotes) {
    console.log('[selectIntelligent40] ✅ Note count within limit, returning all notes');
    return allNotes.map(n => ({
      uniqueId: n.uniqueId,
      quote: n.quote,
      relatedQuestion: n.relatedQuestion || 'General research',
      score: 0  // Preserve for API compatibility
    }));
  }
  
  const selected: Set<string> = new Set();
  const selectedNotes: Array<any> = [];
  
  // STRATEGY 1: Question Coverage (5 notes per question max)
  console.log('[selectIntelligent40] 📋 STRATEGY 1: Question coverage sampling...');
  const notesPerQuestion = Math.min(5, Math.floor(maxNotes / Math.max(questions.length, 1)));
  
  questions.forEach(question => {
    const questionNotes = allNotes.filter(n => 
      (n.relatedQuestion || '').toLowerCase().includes(question.toLowerCase()) ||
      question.toLowerCase().includes((n.relatedQuestion || '').toLowerCase())
    );
    
    // Take first N notes for this question (varied by page/paper)
    const sampled = questionNotes
      .slice(0, notesPerQuestion)
      .filter(n => !selected.has(n.uniqueId));
    
    sampled.forEach(note => {
      if (selected.size < maxNotes) {
        selected.add(note.uniqueId);
        selectedNotes.push({
          uniqueId: note.uniqueId,
          quote: note.quote,
          relatedQuestion: note.relatedQuestion || 'General research',
          score: 0
        });
      }
    });
  });
  
  console.log('[selectIntelligent40] ✅ After question coverage:', selected.size, 'notes selected');
  
  // STRATEGY 2: Paper Diversity (sample from each paper)
  if (selected.size < maxNotes) {
    console.log('[selectIntelligent40] 📚 STRATEGY 2: Paper diversity sampling...');
    
    // Group notes by source paper
    const notesByPaper = new Map<string, typeof allNotes>();
    allNotes.forEach(note => {
      if (!notesByPaper.has(note.sourceId)) {
        notesByPaper.set(note.sourceId, []);
      }
      notesByPaper.get(note.sourceId)!.push(note);
    });
    
    // Round-robin sample from each paper
    const paperIds = Array.from(notesByPaper.keys());
    let paperIndex = 0;
    let notesAdded = 0;
    
    while (selected.size < maxNotes && notesAdded < allNotes.length) {
      const paperId = paperIds[paperIndex % paperIds.length];
      const paperNotes = notesByPaper.get(paperId)!;
      
      // Find next unselected note from this paper
      const unselected = paperNotes.find(n => !selected.has(n.uniqueId));
      
      if (unselected) {
        selected.add(unselected.uniqueId);
        selectedNotes.push({
          uniqueId: unselected.uniqueId,
          quote: unselected.quote,
          relatedQuestion: unselected.relatedQuestion || 'General research',
          score: 0
        });
      }
      
      paperIndex++;
      notesAdded++;
    }
    
    console.log('[selectIntelligent40] ✅ After paper diversity:', selected.size, 'notes selected');
  }
  
  // STRATEGY 3: Fallback - Add remaining notes if still under 40
  if (selected.size < maxNotes) {
    console.log('[selectIntelligent40] 📦 STRATEGY 3: Filling remaining slots...');
    
    const remaining = allNotes
      .filter(n => !selected.has(n.uniqueId))
      .slice(0, maxNotes - selected.size);
    
    remaining.forEach(note => {
      selected.add(note.uniqueId);
      selectedNotes.push({
        uniqueId: note.uniqueId,
        quote: note.quote,
        relatedQuestion: note.relatedQuestion || 'General research',
        score: 0
      });
    });
    
    console.log('[selectIntelligent40] ✅ After fallback:', selected.size, 'notes selected');
  }
  
  console.log('[selectIntelligent40] 🎉 FINAL SELECTION:', {
    totalSelected: selectedNotes.length,
    fromPapers: new Set(allNotes.filter(n => selected.has(n.uniqueId)).map(n => n.sourceId)).size,
    coverage: `${selectedNotes.length}/${allNotes.length} notes`
  });
  
  return selectedNotes;
};

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

  // Load persisted research purpose
  useEffect(() => {
    try {
      const savedPurpose = localStorageService.getResearchPurpose();
      if (savedPurpose) {
        setResearchPurpose(savedPurpose);
        researchPurposeRef.current = savedPurpose;
      }
    } catch (e) {
      console.error("Failed to load research purpose", e);
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
        
        if (savedDeepResearch.topNoteIds) {
          setTopNoteIds(savedDeepResearch.topNoteIds);
          setHasRankedOnce(true);  // ✅ NEW: If topNoteIds exist, user has ranked
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
  // NEW: Top 10 filtered papers for loading box display (real-time relevance scores)
  const [topFilteredPapers, setTopFilteredPapers] = useState<Array<{
    title: string;
    relevanceScore: number;
  }>>([]);
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
  const [isResearchFindingsTabActive, setIsResearchFindingsTabActive] = useState(false);

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
  const [topNoteIds, setTopNoteIds] = useState<string[]>([]);
  const [hasRankedOnce, setHasRankedOnce] = useState<boolean>(false);

  const [insightQuestions, setInsightQuestions] = useState<string[]>([]);
  const [selectedInsightQuestions, setSelectedInsightQuestions] = useState<string[]>([]);
  const selectedInsightQuestionsRef = useRef<string[]>([]);
  const insightQuestionsRef = useRef<string[]>([]); // NEW: Ref for synchronous access

  useEffect(() => {
    selectedInsightQuestionsRef.current = selectedInsightQuestions;
  }, [selectedInsightQuestions]);

  // NEW: Keep insightQuestionsRef in sync with state
  useEffect(() => {
    insightQuestionsRef.current = insightQuestions;
  }, [insightQuestions]);

  const [hasSubmittedInsights, setHasSubmittedInsights] = useState(false);
  const [insightPromiseResolver, setInsightPromiseResolver] = useState<(() => void) | null>(null);

  const toggleInsightQuestion = useCallback((q: string) => {
    setSelectedInsightQuestions(prev =>
      prev.includes(q) ? prev.filter(item => item !== q) : [...prev, q]
    );
  }, []);

  const updateInsightQuestion = useCallback((index: number, newText: string) => {
    setInsightQuestions(prev => {
      const oldText = prev[index];
      const next = [...prev];
      next[index] = newText;

      // Update selection list if the old version was selected
      setSelectedInsightQuestions(selected =>
        selected.map(q => q === oldText ? newText : q)
      );

      return next;
    });
  }, []);

  const addInsightQuestion = useCallback((newText: string) => {
    if (!newText.trim()) return;
    setInsightQuestions(prev => {
      if (prev.includes(newText.trim())) return prev;
      return [...prev, newText.trim()];
    });
  }, []);

  const resolveInsights = useCallback(() => {
    setHasSubmittedInsights(true);
    // Pipeline no longer awaits a promise, so resolver is no longer needed.
    // Keep call for safety in case stopDeepResearch triggers it concurrently.
    if (insightPromiseResolver) {
      insightPromiseResolver();
      setInsightPromiseResolver(null);
    }
    // Show the purpose modal now that the user has submitted/skipped insights.
    // The pipeline pre-loaded the saved purpose into researchPurposeRef already,
    // so the modal opens pre-filled and ready.
    setShowPurposeModal(true);
  }, [insightPromiseResolver]);

  // ═══════════════════════════════════════════════════════════════════════════════
  // CRITICAL DATA FLOW: Research Purpose vs Questions
  // ═══════════════════════════════════════════════════════════════════════════════
  // 
  // ResearchPurposeModal → Saves purpose to context and localStorage
  //   ├─ Purpose is ONLY used for "Top 5 Insights" LLM (rankTopNotes)
  //   ├─ Purpose is NOT sent to /extract-notes endpoint
  //   └─ /extract-notes receives ONLY the user's questions (no purpose metadata)
  //
  // DeepResearchFAB → Collects additional/extra questions from user
  //   ├─ These questions ARE sent to /extract-notes endpoint
  //   └─ Used alongside the original search terms for note extraction
  //
  // When submitResearchPurpose is called:
  //   - Empty string "" means user skipped or didn't submit new text
  //   - Non-empty string means user explicitly entered/modified the purpose
  //   - The purpose is saved to localStorage for future sessions
  //   - Pipeline continues without blocking (async, non-blocking resolution)
  // ═══════════════════════════════════════════════════════════════════════════════

  // NEW: Research Purpose gating
  const [researchPurpose, setResearchPurpose] = useState<string>('');
  const researchPurposeRef = useRef<string>('');
  // NEW: Control modal visibility independently of research phase
  const [showPurposeModal, setShowPurposeModal] = useState<boolean>(false);

  // Keep ref in sync for async pipeline access
  useEffect(() => {
    researchPurposeRef.current = researchPurpose;
  }, [researchPurpose]);

  const submitResearchPurpose = useCallback((purpose: string) => {
    // CRITICAL: This is ONLY used for "Top 5 Insights" LLM ranking
    // It is NOT sent to /extract-notes endpoint
    // The /extract-notes endpoint receives ONLY the selected extra questions
    
    // If purpose string is empty, user skipped or didn't submit new text
    // In either case, update the state and continue
    setResearchPurpose(purpose);
    researchPurposeRef.current = purpose;
    
    // Only persist if there's actual content (avoid overwriting with empty)
    if (purpose.trim()) {
      localStorageService.saveResearchPurpose(purpose); // Persist
    }
    
    // Close the modal
    setShowPurposeModal(false);
  }, []);

  const skipResearchPurpose = useCallback(() => {
    // CRITICAL: Skip keeps localStorage value (for next modal pre-fill)
    // BUT clears in-memory state so it's NOT used for ranking/analysis
    // This means:
    // - Next time modal opens: pre-fills with saved value
    // - rankTopNotes receives: empty string (no purpose used)
    
    setResearchPurpose('');  // Clear in-memory state
    researchPurposeRef.current = '';  // Clear ref
    // NOTE: Does NOT clear localStorage - value persists for next modal
    
    // Close the modal
    setShowPurposeModal(false);
  }, []);

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
        const phaseData = data as any;
        if (phaseData?.duration !== undefined) {
          const percentage = ((phaseData.duration / totalDuration) * 100).toFixed(1);
          lines.push(`  ${phase.padEnd(15)} ${phaseData.duration.toFixed(2)}ms (${percentage}%)`);
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
      if (next.has(id)) {
        next.delete(id);
      } else {
        // ✅ Duplicate detection logic (ID + Title)
        // 1. Determine title of incoming paper
        const paper = [...arxivCandidates, ...filteredCandidates].find(p => p.id === id);
        const incomingTitle = paper?.title;

        if (incomingTitle) {
          const normalizedIncoming = incomingTitle.toLowerCase().trim();
          const genericTitles = ['untitled document', 'document', 'pdf document', 'untitled', 'unknown'];

          if (normalizedIncoming && !genericTitles.includes(normalizedIncoming)) {
            // 2. Check if a paper with this title is already selected
            const existingTitleMatchId = Array.from(next).find(selectedId => {
              const selectedPaper = [...arxivCandidates, ...filteredCandidates].find(p => p.id === selectedId);
              return selectedPaper?.title && selectedPaper.title.toLowerCase().trim() === normalizedIncoming;
            });

            if (existingTitleMatchId) {
              console.warn(`[ResearchContext] Duplicate ArXiv paper detected by title: "${incomingTitle}". Already selected via ID: ${existingTitleMatchId}`);
              return prev; // Skip adding duplicate title
            }
          }
        }

        next.add(id);
      }
      return next;
    });
  }, [arxivCandidates, filteredCandidates]);



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

  const toggleWebSourceSelection = useCallback((uri: string, forceState?: boolean) => {
    setSelectedWebSourceUris(prev => {
      const next = new Set(prev);
      const isAdding = forceState !== undefined ? forceState : !next.has(uri);

      if (isAdding) {
        next.add(uri);
        addToSelectionByUri(uri);
      } else {
        next.delete(uri);
        removeFromSelectionByUri(uri);
      }
      return next;
    });
  }, [addToSelectionByUri, removeFromSelectionByUri]);

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

  // ✅ NEW: Complete reset of accumulated data (called on successful migration)
  // Clears React state to match what's now in the database (not localStorage)
  const resetAccumulatedDataForMigration = useCallback(() => {
    console.log('[ResearchContext] 🔄 Resetting accumulated data for migration...');

    // Reset ref to prevent pending debounces from writing back cleared data
    hasAppendedResultsRef.current = false;

    // Clear React state completely
    setAccumulatedPapers([]);
    setAccumulatedNotes([]);
    setPaperResultsMetadata({});

    console.log('[ResearchContext] ✅ Accumulated data reset for migration');
  }, []);

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
    setTopFilteredPapers([]);  // Clear top 10 papers
    setDeepResearchResults([]);
    setSelectedArxivIds(new Set());
    setProcessedPdfs([]); // Clear processed PDFs
    setTopNoteIds([]);        // ✅ NEW: Clear rankings
    setHasRankedOnce(false);  // ✅ NEW: Reset flag
    setShowUploadedTab(false); // Reset tab signal
    setUploadedPaperStatuses({}); // Clear uploaded paper statuses
    setShouldOpenPdfViewer(false); // Reset navigation intent
    setNavigationHandled(false); // Reset navigation flag
    setInsightQuestions([]); // RESET
    setSelectedInsightQuestions([]); // RESET
    setHasSubmittedInsights(false); // RESET
    // NOTE: researchPurpose is NOT reset here to allow persistence across searches

    // RESOLVE any hanging promises to avoid memory leaks/hanging async functions
    if (insightPromiseResolver) {
      insightPromiseResolver();
      setInsightPromiseResolver(null);
    }
    // Close purpose modal if open
    setShowPurposeModal(false);
  }, [insightPromiseResolver]);

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
    setTopNoteIds([]);        // ✅ NEW: Clear rankings
    setHasRankedOnce(false);  // ✅ NEW: Reset flag

    // Clear persisted search results
    localStorageService.clearWebSearchResults();
    localStorageService.clearDeepResearchResults();

    // Clear purpose on full reset
    setResearchPurpose('');
    localStorageService.clearResearchPurpose();
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
      toastService.error('Search failed. Please check your connection and try again.', 6000, {
        label: 'Try Again',
        onClick: () => performWebSearch(query)
      });
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
      if (prev === 'downloading' || prev === 'downloaded' || prev === 'extracting') { 
        setGatheringStatus("Research stopped. Showing partial results."); 
        return 'completed'; 
      }
      else { 
        setGatheringStatus("Research stopped."); 
        setArxivCandidates([]); 
        setFilteredCandidates([]); 
        return 'idle'; 
      }
    });

    // RESOLVE any hanging promises to allow the async function to exit gracefully
    if (insightPromiseResolver) {
      insightPromiseResolver();
      setInsightPromiseResolver(null);
    }
    // Close purpose modal if open
    setShowPurposeModal(false);
  }, [insightPromiseResolver]);

  const analyzeArxivPapers = useCallback(async (papers: ArxivPaper[], userQuestions: string[], keywords: string[], signal?: AbortSignal) => {
    
    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE A: DOWNLOAD ALL PDFs FIRST (5 concurrent)
    // ═══════════════════════════════════════════════════════════════════════════
    
    const DOWNLOAD_CONCURRENCY = 5;
    console.log(`[🔴 analyzeArxivPapers] Starting DOWNLOAD phase for ${papers.length} papers (${DOWNLOAD_CONCURRENCY} concurrent)`);
    
    const downloadResults = await asyncPool(DOWNLOAD_CONCURRENCY, papers, async (paper) => {
      try {
        if (signal?.aborted) throw new Error("Aborted");
        
        // Update UI: Downloading
        setFilteredCandidates(prev => 
          prev.map(p => p.id === paper.id 
            ? { ...p, analysisStatus: 'downloading' } 
            : p
          )
        );
        syncPaperStatusToAccumulated(paper.id, 'downloading');
        
        // Download PDF
        const buffer = await fetchPdfBuffer(paper.pdfUri, signal);
        if (signal?.aborted) throw new Error("Aborted");
        
        // Extract data (includes preview!)
        const extracted = await extractPdfData(buffer, signal);
        
        const aiYear = extracted.metadata.year?.match(/\b(19|20)\d{2}\b/)?.[0];
        const currentYear = paper.publishedDate?.match(/\b(19|20)\d{2}\b/)?.[0];
        
        // Update paper with extracted metadata + preview
        setFilteredCandidates(prev => prev.map(p => {
          if (p.id !== paper.id) return p;
          const hasNoAuthors = !p.authors || p.authors.length === 0;
          return {
            ...p,
            analysisStatus: 'downloaded',  // NEW STATUS
            title: extracted.metadata.title || p.title,
            authors: (hasNoAuthors && extracted.metadata.author && extracted.metadata.author !== 'Unknown Author')
              ? [extracted.metadata.author]
              : p.authors,
            publishedDate: aiYear && !currentYear ? aiYear : p.publishedDate,
            harvardReference: extracted.metadata.harvardReference,
            publisher: extracted.metadata.publisher,
            categories: extracted.metadata.categories,
            previewImage: extracted.previewImage  // STORE PREVIEW
          };
        }));
        syncPaperStatusToAccumulated(paper.id, 'downloaded');
        
        return { success: true, paper, extracted };
        
      } catch (error: any) {
        console.error(`[🔴 analyzeArxivPapers] ❌ Download failed for paper ${paper.id}:`, error.message);
        const finalStatus = (error.message === "Aborted" || signal?.aborted) ? 'stopped' : 'failed';
        setFilteredCandidates(prev => 
          prev.map(p => p.id === paper.id 
            ? { ...p, analysisStatus: finalStatus } 
            : p
          )
        );
        syncPaperStatusToAccumulated(paper.id, finalStatus);
        return { success: false, paper, error };
      }
    });
    
    // ═══════════════════════════════════════════════════════════════════════════
    // SORT: Successful downloads FIRST, failed downloads LAST
    // ═══════════════════════════════════════════════════════════════════════════
    
    const successfulDownloads = downloadResults.filter(r => r.success);
    const failedDownloads = downloadResults.filter(r => !r.success);
    
    console.log(`[🔴 analyzeArxivPapers] ✅ Downloads complete: ${successfulDownloads.length}/${papers.length} successful`);
    
    // Reorder papers: successful at top, failed at bottom
    // SCOPED to this batch only — other batches' papers stay in place
    const batchPaperIds = new Set(papers.map(p => p.id));
    setFilteredCandidates(prev => {
      const successIds = new Set(successfulDownloads.map(r => r.paper.id));
      const batchPapers = prev.filter(p => batchPaperIds.has(p.id));
      const otherPapers = prev.filter(p => !batchPaperIds.has(p.id));
      const successful = batchPapers.filter(p => successIds.has(p.id));
      const failed = batchPapers.filter(p => !successIds.has(p.id));
      return [...otherPapers, ...successful, ...failed];
    });
    
    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE B: EXTRACT NOTES FROM SUCCESSFUL DOWNLOADS (3 concurrent)
    // ═══════════════════════════════════════════════════════════════════════════
    
    const NOTE_CONCURRENCY = 3;
    console.log(`[🔴 analyzeArxivPapers] Starting NOTE EXTRACTION phase for ${successfulDownloads.length} papers (${NOTE_CONCURRENCY} concurrent)`);

    // TRANSITION: Start extracting notes from downloaded PDFs
    setResearchPhase('extracting');
    setGatheringStatus('Extracting notes from papers...');

    await asyncPool(NOTE_CONCURRENCY, successfulDownloads, async (result) => {
      const { paper, extracted } = result;
      
      try {
        if (signal?.aborted) throw new Error("Aborted");
        
        // Update UI: Extracting notes
        setFilteredCandidates(prev => 
          prev.map(p => p.id === paper.id 
            ? { ...p, analysisStatus: 'extracting' } 
            : p
          )
        );
        syncPaperStatusToAccumulated(paper.id, 'extracting');
        
        // Find relevant pages
        const relevantPages = await findRelevantPages(
          [{ uri: paper.pdfUri, pages: extracted.pages }], 
          userQuestions.join("\n"), 
          keywords
        );
        
        if (relevantPages.length > 0) {
          // Stream notes callback
          const onStreamNotes = (newNotes: DeepResearchNote[]) => {
            setFilteredCandidates(prev => 
              prev.map(p => p.id === paper.id 
                ? { ...p, notes: [...(p.notes || []), ...newNotes] } 
                : p
              )
            );
            syncPaperStatusToAccumulated(paper.id, 'extracting', newNotes);
            
            setDeepResearchResults(prev => {
              const notesWithSourceId = newNotes.map(note => ({
                ...note,
                sourceId: note.sourceId || paper.id
              }));
              return [...prev, ...notesWithSourceId];
            });
          };
          
          // Extract notes
          const allNotes = await extractNotesFromPages(
            relevantPages,
            userQuestions.join("\n"),
            paper.title,
            paper.summary,
            extracted.references,
            onStreamNotes
          );
          
          if (signal?.aborted) throw new Error("Aborted");
          
          // Update UI: Completed
          setFilteredCandidates(prev => 
            prev.map(p => p.id === paper.id 
              ? { ...p, analysisStatus: 'completed', notes: allNotes } 
              : p
            )
          );
          syncPaperStatusToAccumulated(paper.id, 'completed', allNotes);
          
        } else {
          console.log(`[🔴 analyzeArxivPapers] ⚠️  No relevant pages found for paper ${paper.id}`);
          setFilteredCandidates(prev => 
            prev.map(p => p.id === paper.id 
              ? { ...p, analysisStatus: 'completed', notes: [] } 
              : p
            )
          );
          syncPaperStatusToAccumulated(paper.id, 'completed', []);
        }
        
      } catch (error: any) {
        console.error(`[🔴 analyzeArxivPapers] ❌ Note extraction failed for paper ${paper.id}:`, error.message);
        const finalStatus = (error.message === "Aborted" || signal?.aborted) ? 'stopped' : 'failed';
        setFilteredCandidates(prev => 
          prev.map(p => p.id === paper.id 
            ? { ...p, analysisStatus: finalStatus } 
            : p
          )
        );
        syncPaperStatusToAccumulated(paper.id, finalStatus);
      }
    });
    
    console.log(`[🔴 analyzeArxivPapers] ✅ Analysis complete`);
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
          // ✅ CRITICAL FIX: Set sourceId to note.pdfUri as fallback
          // This will be matched in rankTopNotes using filteredCandidates OR accumulatedPapers
          const notesWithSourceId = newNotes.map(note => ({
            ...note,
            sourceId: note.sourceId || note.pdfUri // sourceId defaults to pdfUri for lookup
          }));
          
          const updated = [...prev, ...notesWithSourceId];
          console.log(`[CONTEXT-STATE-UPDATE] ✅ deepResearchResults updated:`, {
            previousCount: prev.length,
            addedCount: notesWithSourceId.length,
            newTotalCount: updated.length,
            allPdfUris: updated.map(n => n.pdfUri),
            allPageNumbers: updated.map(n => n.pageNumber),
            allSourceIds: updated.map(n => n.sourceId)
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

      toastService.error('PDF analysis could not complete. Please check your connection.', null);
    } finally {
      setIsDeepResearching(false);
    }
  }, [searchState.query, updateUploadedPaperStatus, syncPaperStatusToAccumulated]);

  // ✅ NEW: Helper to deduplicate papers by title before analysis/accumulation
  const deduplicateAnalyzeInputs = useCallback((pdfs: LoadedPdf[], arxivPapers: ArxivPaper[]) => {
    const seenTitles = new Set<string>();
    const genericTitles = ['untitled document', 'document', 'pdf document', 'untitled', 'unknown'];

    // 1. Process PDFs First (Prefer PDF versions for full-text analysis)
    const uniquePdfs = pdfs.filter(pdf => {
      const title = (pdf.metadata?.title || pdf.file?.name || '').toLowerCase().trim();
      if (title && !genericTitles.includes(title)) {
        if (seenTitles.has(title)) return false;
        seenTitles.add(title);
      }
      return true;
    });

    // 2. Process ArXiv Papers (Only keep if title not already seen in PDFs or previous ArXiv)
    const uniqueArxiv = arxivPapers.filter(paper => {
      const title = (paper.title || '').toLowerCase().trim();
      if (title && !genericTitles.includes(title)) {
        if (seenTitles.has(title)) return false;
        seenTitles.add(title);
      }
      return true;
    });

    return { uniquePdfs, uniqueArxiv };
  }, []);

  const performHybridResearch = useCallback(async (pdfs: LoadedPdf[], arxivPapers: ArxivPaper[], questions: string[], keywords: string[]) => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    // ✅ Deduplicate before starting
    const { uniquePdfs, uniqueArxiv } = deduplicateAnalyzeInputs(pdfs, arxivPapers);

    console.log('[ResearchContext] 🔄 Setting processedPdfs (unique) to:', uniquePdfs.map(p => p.uri));
    setProcessedPdfs(uniquePdfs);

    console.log('[ResearchContext] 🔍 performHybridResearch (Deep Search):', {
      uniquePdfs: uniquePdfs.length,
      uniqueArxiv: uniqueArxiv.length,
      removedDuplicates: (pdfs.length + arxivPapers.length) - (uniquePdfs.length + uniqueArxiv.length)
    });

    setGatheringStatus("Analyzing documents...");
    if (uniquePdfs.length > 0 || uniqueArxiv.length > 0) {
      setResearchPhase('downloading');
    }
    const questionsStr = questions.join('\n');
    const tasks = [];
    if (uniquePdfs.length > 0) tasks.push(analyzeLoadedPdfs(uniquePdfs, questionsStr, signal));
    if (uniqueArxiv.length > 0) tasks.push(analyzeArxivPapers(uniqueArxiv, questions, keywords, signal));
    await Promise.all(tasks);

    if (!signal.aborted) {
      setResearchPhase('completed');
      setGatheringStatus("Analysis complete.");

      // Cleanup logic for Deep Search (prevent leakage into Agent Researcher results)
      const cleanIds = new Set([
        ...uniquePdfs.map(p => p.uri),
        ...uniqueArxiv.map(p => p.id)
      ]);

      setAccumulatedPapers(prev => prev.filter(p => !cleanIds.has(p.id)));
      setAccumulatedNotes(prev => prev.filter(n => !cleanIds.has(n.pdfUri)));
    }
  }, [analyzeLoadedPdfs, analyzeArxivPapers, setProcessedPdfs, deduplicateAnalyzeInputs, setAccumulatedPapers, setAccumulatedNotes]);

  // NEW: performHybridAnalysis - for Agent Researcher (WITH accumulation)
  const performHybridAnalysis = useCallback(async (pdfs: LoadedPdf[], arxivPapers: ArxivPaper[], questions: string[], keywords: string[]) => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    // ✅ NEW: Deduplicate by title BEFORE starting analysis or accumulation
    const { uniquePdfs, uniqueArxiv } = deduplicateAnalyzeInputs(pdfs, arxivPapers);

    console.log('[ResearchContext] 🔄 Setting processedPdfs (unique) to:', uniquePdfs.map(p => p.uri));
    setProcessedPdfs(uniquePdfs);

    // ✅ Add unique papers to accumulatedPapers IMMEDIATELY (at research start)
    if (uniquePdfs.length > 0 || uniqueArxiv.length > 0) {
      console.log('[ResearchContext] 📥 Adding unique papers to accumulatedPapers at research START (Agent Analysis)');

      const initialPapers = [
        ...uniquePdfs.map(pdf => ({
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
        ...uniqueArxiv.map(paper => ({
          ...paper,
          analysisStatus: 'pending' as const,
          notes: [],
          addedToAccumulationAt: Date.now()
        }))
      ];

      addToPaperResults(initialPapers, []);
    }

    console.log('[ResearchContext] 🔍 performHybridAnalysis (Agent Analysis):', {
      uniquePdfs: uniquePdfs.length,
      uniqueArxiv: uniqueArxiv.length
    });

    setGatheringStatus("Analyzing documents...");
    if (uniquePdfs.length > 0 || uniqueArxiv.length > 0) {
      setResearchPhase('extracting');
    }
    const questionsStr = questions.join('\n');
    const tasks = [];
    if (uniquePdfs.length > 0) tasks.push(analyzeLoadedPdfs(uniquePdfs, questionsStr, signal));
    if (uniqueArxiv.length > 0) tasks.push(analyzeArxivPapers(uniqueArxiv, questions, keywords, signal));
    await Promise.all(tasks);

    if (!signal.aborted) {
      setResearchPhase('completed');
      setGatheringStatus("Analysis complete.");
    }
  }, [analyzeLoadedPdfs, analyzeArxivPapers, setProcessedPdfs, deduplicateAnalyzeInputs, addToPaperResults]);

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

    setResearchPhase('initialising');
    startPhaseTimer('initialising');
    setArxivCandidates([]);
    setFilteredCandidates([]);
    setInsightQuestions([]); // RESET
    setSelectedInsightQuestions([]); // RESET
    setHasSubmittedInsights(false); // RESET
    setSearchState(prev => ({ ...prev, query: query.topics.join(', ') }));
    setTopNoteIds([]); // RESET Top 5 ranking
    setHasRankedOnce(false);  // ✅ NEW: Reset flag for new search

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

        // ✅ GENERATE KEYWORDS EVEN FOR URL-ONLY (for insight questions)
        endPhaseTimer('initialising');
        const structuredTerms = await generateArxivSearchTerms([], query.questions);
        const generatedQuestions = structuredTerms.insight_questions || [];
        setInsightQuestions(generatedQuestions);
        insightQuestionsRef.current = generatedQuestions;

        if (userPdfs.length > 0) {
          // ════════════════════════════════════════════════════════════════
          // ✅ NON-BLOCKING: Show insight questions WHILE extraction runs
          // ════════════════════════════════════════════════════════════════
          console.log('[ResearchContext] 🔍 Checking insight questions (URL-only path):', {
            hasInsights: insightQuestionsRef.current.length > 0,
            count: insightQuestionsRef.current.length,
            aborted: signal.aborted,
            hasSubmittedInsights
          });

          if (insightQuestionsRef.current.length > 0 && !signal.aborted && !hasSubmittedInsights) {
            console.log('[ResearchContext] ✅ Showing insight questions NON-BLOCKING (URL-only path)');
            // Set reviewing_insights phase so DynamicLoadingBox shows the insight
            // questions panel with correct text, timer, and countdown badge.
            // We do NOT await a promise here — extraction starts immediately below.
            setResearchPhase('reviewing_insights');
            setGatheringStatus("Extracting notes... Refine your questions while we work.");

            // Pre-load saved purpose so the purpose modal is ready when user submits
            const savedPurpose = localStorageService.getResearchPurpose();
            if (savedPurpose) {
              setResearchPurpose(savedPurpose);
              researchPurposeRef.current = savedPurpose;
            }
            // NOTE: showPurposeModal is NOT set here — it is triggered by
            // resolveInsights() → submitResearchPurpose() after user submits
          } else {
            setResearchPhase('extracting');
          }
          // ════════════════════════════════════════════════════════════════

          setGatheringStatus("Extracting notes from your PDFs...");

          // Build questions with whatever insights are selected RIGHT NOW.
          // selectedInsightQuestionsRef stays live — any questions the user
          // selects during extraction are picked up by papers not yet in Phase B.
          const finalQuestionsForExtraction = [
            ...(researchPurposeRef.current.trim()
              ? [`Context/Purpose of this research: ${researchPurposeRef.current.trim()}`]
              : []),
            ...query.questions,
            ...selectedInsightQuestionsRef.current
          ];

          console.log('[ResearchContext] 📝 Starting extraction (URL-only) with questions:', {
            original: query.questions.length,
            insights: selectedInsightQuestionsRef.current.length,
            total: finalQuestionsForExtraction.length
          });

          // Only analyze user PDFs
          await performHybridResearch(userPdfs, [], finalQuestionsForExtraction, []);
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
      endPhaseTimer('initialising');
      const structuredTerms = await generateArxivSearchTerms(query.topics, query.questions);
      const generatedQuestions = structuredTerms.insight_questions || [];
      setInsightQuestions(generatedQuestions); // CAPTURE in state
      insightQuestionsRef.current = generatedQuestions; // CAPTURE in ref (synchronous)
      const displayKeywords = [structuredTerms.primary_keyword, ...structuredTerms.secondary_keywords].filter(Boolean);
      setArxivKeywords(displayKeywords);

      if (signal.aborted) return;

      // START BACKGROUND SEARCH (No blocking - let search proceed immediately)
      startPhaseTimer('searching');
      setGatheringStatus("Searching academic repositories...");
      setResearchPhase('searching'); // Set phase immediately
      
      // KICK OFF SEARCH IN BACKGROUND
      const searchPromise = searchAllSources(structuredTerms, query.topics, query.questions, (msg) => setGatheringStatus(msg));

      // FIX: Do NOT block the pipeline for research purpose
      // The modal will appear as a non-blocking UI overlay
      // Pipeline continues immediately - purpose is optional enhancement

      if (signal.aborted) return;

      // ✅ CRITICAL: Continue immediately to search results
      // Do NOT wait for user input - let filtering/extraction proceed in parallel
      const searchResult = await searchPromise;
      endPhaseTimer('searching');

      // NEW: Store search metrics
      setSearchMetrics(searchResult.metrics);
      const candidates = searchResult.papers;

      if (signal.aborted) return;
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

        // ═══════════════════════════════════════════════════════════════
        // TWO-PHASE FILTERING: Get first 20, start downloads, then get remaining 20
        // ═══════════════════════════════════════════════════════════════
        const firstBatch = await filterRelevantPapers(candidates, query.questions, displayKeywords, 'first');

        // ✅ Extract top 10 papers with highest relevance scores
        const topTenPapers = firstBatch.slice(0, 10).map(p => ({
          title: p.title,
          relevanceScore: p.relevanceScore || 0
        }));

        const filterDuration = (performance.now() - filterStartTime).toFixed(0);
        console.log('[ResearchContext] ✅ First batch filtering COMPLETE:', {
          durationMs: filterDuration,
          durationSeconds: (parseInt(filterDuration) / 1000).toFixed(2),
          inputCount: candidates.length,
          outputCount: firstBatch.length,
          firstFilteredTitle: firstBatch[0]?.title
        });

        if (signal.aborted) return;

        // ✅ CRITICAL: Set data BEFORE changing phase
        setFilteredCandidates(firstBatch);
        setTopFilteredPapers(topTenPapers);

        endPhaseTimer('filtering');

        // ════════════════════════════════════════════════════════════════
        // ✅ NON-BLOCKING: Show insight questions WHILE downloads run
        // ════════════════════════════════════════════════════════════════
        console.log('[ResearchContext] 🔍 Checking insight questions AFTER filtering:', {
          hasInsights: insightQuestionsRef.current.length > 0,
          count: insightQuestionsRef.current.length,
          aborted: signal.aborted,
          hasSubmittedInsights,
          filteredPapersCount: firstBatch.length
        });

        if (insightQuestionsRef.current.length > 0 && !signal.aborted && !hasSubmittedInsights) {
          console.log('[ResearchContext] ✅ Showing insight questions NON-BLOCKING (topics path)');
          setResearchPhase('reviewing_insights');
          setGatheringStatus("Downloading papers... Refine your questions while we work.");

          const savedPurpose = localStorageService.getResearchPurpose();
          console.log('[ResearchContext] 📖 Pre-loading saved purpose:', savedPurpose ? savedPurpose.substring(0, 50) + '...' : 'none');
          if (savedPurpose) {
            setResearchPurpose(savedPurpose);
            researchPurposeRef.current = savedPurpose;
          }
        } else {
          setResearchPhase('downloading');
        }
        // ════════════════════════════════════════════════════════════════

        startPhaseTimer('extracting');

        // Build questions with whatever insights are selected RIGHT NOW
        const finalQuestionsForExtraction = [
          ...(researchPurposeRef.current.trim()
            ? [`Context/Purpose of this research: ${researchPurposeRef.current.trim()}`]
            : []),
          ...query.questions,
          ...selectedInsightQuestionsRef.current
        ];

        console.log('[ResearchContext] 📝 Two-phase download starting:', {
          firstBatchCount: firstBatch.length,
          userPdfsCount: userPdfs.length,
          questions: finalQuestionsForExtraction.length
        });

        // ═══════════════════════════════════════════════════════════════
        // KICK OFF REMAINING FILTER IN BACKGROUND (embeddings cached → Stage 1 instant)
        // ═══════════════════════════════════════════════════════════════
        const firstBatchIds = firstBatch.map(p => p.id);
        const remainingPromise = filterRelevantPapers(
          candidates, query.questions, displayKeywords, 'remaining', firstBatchIds
        ).catch(err => {
          console.warn('[ResearchContext] ⚠️ Remaining filter failed:', err.message);
          return [] as typeof firstBatch;
        });

        // Process user PDFs if any (fire-and-forget, runs concurrently)
        let userPdfPromise: Promise<void> | null = null;
        if (userPdfs.length > 0) {
          setProcessedPdfs(userPdfs);
          const questionsStr = finalQuestionsForExtraction.join('\n');
          userPdfPromise = analyzeLoadedPdfs(userPdfs, questionsStr, signal);
        }

        // START DOWNLOADING + EXTRACTING FIRST BATCH IMMEDIATELY
        const firstBatchPromise = analyzeArxivPapers(
          firstBatch, finalQuestionsForExtraction, displayKeywords, signal
        );

        // Wait for remaining batch to arrive, then process those too
        const remainingBatch = await remainingPromise;
        let secondBatchPromise: Promise<void> | null = null;

        if (remainingBatch.length > 0 && !signal.aborted) {
          console.log('[ResearchContext] 📥 Remaining batch arrived:', remainingBatch.length, 'papers');
          // Append to filteredCandidates — functional update prevents overwrite
          setFilteredCandidates(prev => {
            const existingIds = new Set(prev.map(p => p.id));
            const newPapers = remainingBatch.filter(p => !existingIds.has(p.id));
            return [...prev, ...newPapers];
          });

          secondBatchPromise = analyzeArxivPapers(
            remainingBatch, finalQuestionsForExtraction, displayKeywords, signal
          );
        }

        // Wait for ALL work to complete
        await firstBatchPromise;
        if (secondBatchPromise) await secondBatchPromise;
        if (userPdfPromise) await userPdfPromise;

        if (signal.aborted) return;
        endPhaseTimer('extracting');
        setResearchPhase('completed');
      } else if (userPdfs.length > 0) {
        // Only user PDFs, no ArXiv matches
        endPhaseTimer('filtering');
        
        // ════════════════════════════════════════════════════════════════
        // ✅ NON-BLOCKING: Show insight questions WHILE extraction runs
        // ════════════════════════════════════════════════════════════════
        console.log('[ResearchContext] 🔍 Checking insight questions (PDF-only path):', {
          hasInsights: insightQuestionsRef.current.length > 0,
          count: insightQuestionsRef.current.length,
          aborted: signal.aborted,
          hasSubmittedInsights
        });

        if (insightQuestionsRef.current.length > 0 && !signal.aborted && !hasSubmittedInsights) {
          console.log('[ResearchContext] ✅ Showing insight questions NON-BLOCKING (PDF-only path)');
          setResearchPhase('reviewing_insights');
          setGatheringStatus("Extracting notes... Refine your questions while we work.");

          const savedPurpose = localStorageService.getResearchPurpose();
          if (savedPurpose) {
            setResearchPurpose(savedPurpose);
            researchPurposeRef.current = savedPurpose;
          }
          // NOTE: showPurposeModal fires after resolveInsights(), not here
        } else {
          setResearchPhase('extracting');
        }
        // ════════════════════════════════════════════════════════════════

        startPhaseTimer('extracting');
        setGatheringStatus("Analyzing your provided PDFs...");

        const finalQuestionsForExtraction = [
          ...(researchPurposeRef.current.trim()
            ? [`Context/Purpose of this research: ${researchPurposeRef.current.trim()}`]
            : []),
          ...query.questions,
          ...selectedInsightQuestionsRef.current
        ];

        console.log('[ResearchContext] 📝 Starting extraction (PDF-only) with questions:', {
          original: query.questions.length,
          insights: selectedInsightQuestionsRef.current.length,
          total: finalQuestionsForExtraction.length
        });

        await performHybridResearch(userPdfs, [], finalQuestionsForExtraction, displayKeywords);
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
        setResearchPhase('idle'); // Reset to idle so spinner stops

        // Show toast with retry option
        toastService.error('Research could not complete. Please check your connection and try again.', null, {
          label: 'Try Again',
          onClick: () => performDeepResearch(query)
        });
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
    setTopNoteIds([]);        // ✅ NEW: Clear rankings
    setHasRankedOnce(false);  // ✅ NEW: Reset flag
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
    topFilteredPapers,  // ← NEW: Top 10 papers for loading box
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
    isResearchFindingsTabActive,
    setIsResearchFindingsTabActive,
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
    removePaperFromResults,
    resetAccumulatedDataForMigration,
    insightQuestions,
    selectedInsightQuestions,
    hasSubmittedInsights,
    toggleInsightQuestion,
    updateInsightQuestion,
    addInsightQuestion,
    resolveInsights,
    topNoteIds,
    hasRankedOnce,  // ✅ NEW: Export flag
    researchPurpose,  // ✅ Research purpose value
    submitResearchPurpose,
    skipResearchPurpose,
    showPurposeModal,  // ✅ NEW: Control modal visibility
    selectIntelligent40Notes,  // Reference to helper function defined above
    rankTopNotes: async () => {
      console.log('[🔴 rankTopNotes] BUTTON CLICKED - Function called');
      
      // ✅ CRITICAL FIX: Get notes from filteredCandidates directly (since that's where they actually are)
      const notesFromFilteredPapers = filteredCandidates.flatMap(paper => 
        (paper.notes || []).map(note => ({
          ...note,
          sourceId: paper.id,
          sourcePaper: paper
        }))
      );
      
      console.log('[🔴 rankTopNotes] 📊 Collected notes from filteredCandidates:', {
        papersCount: filteredCandidates.length,
        totalNotesCollected: notesFromFilteredPapers.length,
        notesByPaper: filteredCandidates.map(p => ({ paperId: p.id, noteCount: p.notes?.length || 0 }))
      });

      if (notesFromFilteredPapers.length === 0) {
        console.log('[🔴 rankTopNotes] ❌ ABORTED: No notes found in filteredCandidates');
        return;
      }
      
      console.log('[🔴 rankTopNotes] ✅ Starting ranking process with', notesFromFilteredPapers.length, 'total notes');
      
      const previousPhase = researchPhase;
      setResearchPhase('ranking_notes');
      setGatheringStatus("Identifying top 5 insights...");
      
      console.log('[🔴 rankTopNotes] Phase set to "ranking_notes", previous phase was:', previousPhase);
      
      try {
        // ✅ Validate notes have quotes before ranking
        const validNotes = notesFromFilteredPapers.filter(note => {
          const hasQuote = (note?.quote || '').trim().length > 0;
          if (!hasQuote) {
            console.warn('[🔴 rankTopNotes] ⚠️  Note missing quote:', {
              pageNumber: note.pageNumber,
              pdfUri: note.pdfUri,
              relatedQuestion: note.relatedQuestion
            });
          }
          return hasQuote;
        });

        console.log('[🔴 rankTopNotes] ✅ Validation complete:', {
          totalNotes: notesFromFilteredPapers.length,
          validNotesWithQuotes: validNotes.length,
          invalidNotes: notesFromFilteredPapers.length - validNotes.length
        });

        if (validNotes.length === 0) {
          console.log('[🔴 rankTopNotes] ❌ ABORTED: No valid notes with quotes');
          setResearchPhase(previousPhase);
          return;
        }

        // ✅ Build notes with matching IDs and sourceId
        const notesToRank = validNotes
          .map((note, idx) => {
            // Get source paper to build correct uniqueId
            // CRITICAL FIX: Match by BOTH id AND pdfUri to handle ArXiv and uploaded PDFs
            let sourcePaper = filteredCandidates.find(p => p.id === note.sourceId);
            if (!sourcePaper) {
              sourcePaper = accumulatedPapers.find(p => p.id === note.sourceId || p.pdfUri === note.sourceId);
            }
            
            if (!sourcePaper) {
              console.warn('[🔴 rankTopNotes] ❌ Could not find source paper:', {
                sourceId: note.sourceId,
                pdfUri: note.pdfUri
              });
              return null;
            }

            // Find the note's position in its paper's notes array
            const paperNotes = (sourcePaper as any).notes || [];
            const noteIndex = paperNotes.findIndex((n: any) => 
              n.quote === note.quote && n.pageNumber === note.pageNumber
            );

            if (noteIndex === -1) {
              console.warn('[🔴 rankTopNotes] ❌ Note not found in paper:', {
                paperId: sourcePaper.id,
                quote: note.quote.substring(0, 30)
              });
              return null;
            }

            // Generate SAME ID format as display uses
            // ✅ CRITICAL FIX: Use substring(0, 60) to match validation code below
            const quoteHash = String(note.quote).substring(0, 60).replace(/[|\/\\]/g, '_');
            const uniqueId = `${sourcePaper.id}|p${note.pageNumber}|i${noteIndex}|${quoteHash}`;

            console.log('[🔴 rankTopNotes] Built note ID:', {
              noteIdx: idx,
              paperId: sourcePaper.id,
              noteIndex,
              quoteLength: note.quote.length,
              hashLength: quoteHash.length,
              uniqueId: uniqueId.substring(0, 80)
            });

            return {
              uniqueId,
              quote: note.quote,
              relatedQuestion: note.relatedQuestion || 'General research',  // ✅ NEW: Include question context
              score: note.relevanceScore || 0  // ✅ NEW: Include score for filtering
            };
          })
          .filter(Boolean);

        console.log('[🔴 rankTopNotes] 📊 Built notes for ranking:', {
          totalValidNotes: validNotes.length,
          successfullyBuilt: notesToRank.length,
          failed: validNotes.length - notesToRank.length
        });

        if (notesToRank.length === 0) {
          console.log('[🔴 rankTopNotes] ❌ ABORTED: No notes could be built');
          toastService.error("No notes could be ranked (format mismatch)");
          setResearchPhase(previousPhase);
          return;
        }

        // ✅ INTELLIGENT SELECTION: If more than 40 notes, use smart sampling
        const queries = [...arxivKeywords, ...selectedInsightQuestions];
        
        // Prepare notes with sourceId and pageNumber for intelligent selection
        const notesWithMetadata = notesToRank.map(n => {
          const sourceId = n.uniqueId.split('|')[0] || '';
          const pageNumberMatch = n.uniqueId.split('|')[1]?.replace('p', '');
          const pageNumber = pageNumberMatch ? parseInt(pageNumberMatch) : 0;
          
          return {
            uniqueId: n.uniqueId,
            quote: n.quote,
            relatedQuestion: n.relatedQuestion || 'General research',
            sourceId,
            pageNumber
          };
        });
        
        const notesForRanking = selectIntelligent40Notes(
          notesWithMetadata,
          queries,
          40  // Max notes to send
        );

        console.log('[🔴 rankTopNotes] 🎯 Intelligent selection complete:', {
          original: notesToRank.length,
          selected: notesForRanking.length,
          strategy: 'question-coverage + paper-diversity'
        });
        
        console.log('[🔴 rankTopNotes] 🌐 Calling backend API:', {
          notesToRankCount: notesForRanking.length,
          queriesCount: queries.length,
          hasPurpose: !!researchPurpose,
          purposeLength: researchPurpose?.length || 0,
          sampleNoteIds: notesForRanking.slice(0, 2).map(n => n.uniqueId.substring(0, 50))
        });

        const result = await rankNotesAI(notesForRanking, queries, researchPurpose);
        
        console.log('[🔴 rankTopNotes] 📨 Backend API Response:', {
          success: !!result,
          isArray: Array.isArray(result),
          resultLength: result?.length || 0,
          resultType: typeof result,
          firstThreeIds: Array.isArray(result) ? result.slice(0, 3) : 'N/A'
        });
        
        if (result && Array.isArray(result) && result.length > 0) {
          console.log('[🔴 rankTopNotes] ✅ Result is valid array with', result.length, 'items');
          
          // ✅ Validate returned IDs match our format
          const displayIds = validNotes.map((note, idx) => {
            const sourcePaper = filteredCandidates.find(p => p.id === note.sourceId) || 
                               accumulatedPapers.find(p => p.id === note.sourceId);
            if (!sourcePaper) {
              console.warn('[🔴 rankTopNotes] ❌ Display validation: Could not find paper');
              return null;
            }
            const paperNotes = (sourcePaper as any).notes || [];
            const noteIndex = paperNotes.findIndex((n: any) => 
              n.quote === note.quote && n.pageNumber === note.pageNumber
            );
            if (noteIndex === -1) {
              console.warn('[🔴 rankTopNotes] ❌ Display validation: Note not found in paper');
              return null;
            }
            const quoteHash = String(note.quote).substring(0, 60).replace(/[|\/\\]/g, '_');
            return `${sourcePaper.id}|p${note.pageNumber}|i${noteIndex}|${quoteHash}`;
          }).filter(Boolean);

          const matchCount = result.filter(id => displayIds.includes(id)).length;
          
          console.log('[🔴 rankTopNotes] 🔍 Validation Results:', {
            returnedIds: result.length,
            displayIdsBuilt: displayIds.length,
            matchedIds: matchCount,
            matchPercentage: displayIds.length > 0 ? ((matchCount / displayIds.length) * 100).toFixed(0) + '%' : 'N/A',
            returnedIdsPreview: result.slice(0, 2),
            displayIdsPreview: displayIds.slice(0, 2)
          });

          console.log('[🔴 rankTopNotes] ✅ Setting topNoteIds state with', result.length, 'IDs');
          setTopNoteIds(result);
          setHasRankedOnce(true);  // ✅ NEW: Mark as ranked
          
          const current = localStorageService.getDeepResearchResults();
          if (current) {
            console.log('[🔴 rankTopNotes] 💾 Saving to localStorage');
            localStorageService.saveDeepResearchResults({
              ...current,
              topNoteIds: result,
              hasRankedOnce: true  // ✅ NEW: Save to localStorage
            });
          }
          console.log('[🔴 rankTopNotes] ✅ SUCCESS: Ranking complete');
        } else {
          console.warn('[🔴 rankTopNotes] ❌ API returned invalid response:', {
            result,
            isArray: Array.isArray(result),
            length: result?.length
          });
        }
      } catch (error) {
        console.error("[🔴 rankTopNotes] ❌ CRITICAL ERROR:", {
          errorMessage: error instanceof Error ? error.message : String(error),
          errorType: error instanceof Error ? error.constructor.name : typeof error,
          errorStack: error instanceof Error ? error.stack : undefined
        });
      } finally {
        console.log('[🔴 rankTopNotes] 🏁 Finally block: Restoring phase to:', previousPhase);
        setResearchPhase(previousPhase);
      }
    }
  }), [
    activeSearchMode, searchState, searchBarState, updateSearchBar, clearSearchBar,
    searchHistory, addToHistory, removeFromHistory, clearHistory,
    researchPhase, gatheringStatus, arxivKeywords, arxivCandidates, filteredCandidates, topFilteredPapers,
    selectedArxivIds, toggleArxivSelection, selectAllArxivPapers, clearArxivSelection,
    selectedWebSourceUris, toggleWebSourceSelection,
    selectedPaperUris, isPaperSelectedByUri, addToSelectionByUri, removeFromSelectionByUri, getSelectedPaperUris,
    isDeepResearching, deepResearchResults, contextNotes, toggleContextNote, isNoteInContext,
    performWebSearch, performDeepResearch, performHybridResearch, performHybridAnalysis, stopDeepResearch, resetSearch,
    analyzeLoadedPdfs, analyzeArxivPapers, resetAllResearchData, processedPdfs,
    showUploadedTab, shouldOpenPdfViewer, uploadedPaperStatuses, updateUploadedPaperStatus,
    navigationHandled, pendingDeepResearchQuery, isDeepSearchBarExpanded, isResearchFindingsTabActive,
    researchTimings, timeToFirstNotes, timeToFirstPaper, searchMetrics,
    accumulatedPapers, accumulatedNotes, paperResultsMetadata,
    addToPaperResults, clearPaperResults, removePaperFromResults, resetAccumulatedDataForMigration,
    insightQuestions, selectedInsightQuestions, hasSubmittedInsights, toggleInsightQuestion,
    updateInsightQuestion, addInsightQuestion, resolveInsights,
    topNoteIds, hasRankedOnce, researchPurpose, arxivKeywords, submitResearchPurpose, skipResearchPurpose,
    showPurposeModal
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
