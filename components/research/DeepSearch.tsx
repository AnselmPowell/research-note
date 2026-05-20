import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
// The ResearchPurposeModal is only rendered when researchPhase === 'awaiting_purpose'
// After submission or skip, the phase transitions to 'reviewing_insights'
// ═══════════════════════════════════════════════════════════════════════════════

import { ArxivPaper, DeepResearchNote } from '../../types';
import { useResearch } from '../../contexts/ResearchContext';
import { useLibrary } from '../../contexts/LibraryContext';
import { useUI } from '../../contexts/UIContext';
import { useDatabase } from '../../database/DatabaseContext';
import { DynamicLoadingBox } from './DynamicLoadingBox';
import { ResearchPurposeModal } from './ResearchPurposeModal';
import { ResearchCardNote } from './ResearchCardNote';
import { Top5SquareCards } from './Top5SquareCards';
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
  LayoutList,
  Minus,
  Filter,
  ChevronsUp,
  ChevronsDown,
  TextSearch,
  ChevronLeft,
  ChevronRight,
  Library,
  Upload,
  User,
  X,
  AlertTriangle
} from 'lucide-react';
import { ExternalLinkIcon } from '../ui/icons';

// ─── Types ─────────────────────────────────────────────────────────────────────
type SortOption = 'most-relevant-notes' | 'relevant-papers' | 'newest-papers';

const ITEMS_PER_PAGE = 15;

// ─── Helpers ───────────────────────────────────────────────────────────────────
const getNoteId = (paperId: string, page: number, index: number) => `${paperId}-p${page}-i${index}`;

const getSafeTimestamp = (dateStr: string) => {
  if (!dateStr || dateStr.trim() === '') return 0;
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d.getTime();
  const yearMatch = dateStr.match(/\b(19|20)\d{2}\b/);
  if (yearMatch) return new Date(parseInt(yearMatch[0], 10), 0, 1).getTime();
  return 0;
};

// Normalise text for case-insensitive, accent-insensitive search
// NFD decomposes accented chars (é → e + ́), then the regex strips the diacritics
const normalizeText = (str: string): string =>
  (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// Truncate a string to a maximum number of words, appending ellipsis if longer
const truncateWords = (str: string, max = 11): string => {
  const words = (str || '').trim().split(/\s+/);
  return words.length <= max ? str : words.slice(0, max).join(' ') + '…';
};

const formatDuration = (ms: number): string => {
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) return `${totalSeconds.toFixed(1)}s`;
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
  return `${mins}m ${secs}s`;
};

// ─── PaperCard Props ───────────────────────────────────────────────────────────
interface PaperCardProps {
  paper: ArxivPaper;
  selectedNoteIds: string[];
  onSelectNote: (id: string) => void;
  onView?: () => void;
  isLocal?: boolean;
  forceExpanded?: boolean;
  activeQuery?: string;
}

// ─── PaperCard ─────────────────────────────────────────────────────────────────
const PaperCard: React.FC<PaperCardProps> = React.memo(({ paper, selectedNoteIds, onSelectNote, onView, isLocal = false, forceExpanded = true, activeQuery = 'all' }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isAbstractExpanded, setIsAbstractExpanded] = useState(false);
  const [expandedNoteIds, setExpandedNoteIds] = useState<Set<string>>(new Set()); // NEW: Track expanded notes
  const { toggleArxivSelection, selectedArxivIds, isPaperSelectedByUri } = useResearch();
  const { isPaperSaved, savePaper, deletePaper } = useDatabase();
  const { loadedPdfs, isPdfInContext, togglePdfContext, loadPdfFromUrl, setActivePdf, failedUrlErrors, downloadingUris, contextUris } = useLibrary();
  const { setColumnVisibility, openColumn: openUIColumn } = useUI();

  // ✅ Check GLOBAL selection state by pdfUri (works across all components)
  const isGloballySelected = isPaperSelectedByUri(paper.pdfUri);

  // ✅ Check if title exists in PDF context (deduplication check)
  const normalizedTitle = paper.title.toLowerCase().trim();
  const isInPdfContext = Array.from(contextUris).some(uri => {
    const lp = loadedPdfs.find(p => p.uri === uri);
    return (lp?.metadata?.title || lp?.file?.name || '').toLowerCase().trim() === normalizedTitle;
  });

  const isSelected = isLocal ? isPdfInContext(paper.id) : (isGloballySelected || selectedArxivIds.has(paper.id) || isInPdfContext);
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
    setIsExpanded(forceExpanded);
  }, [forceExpanded]);

  const handleSelectionToggle = (e: React.MouseEvent) => {
    e.stopPropagation();

    // ✅ Cross-context deduplication check (blocking)
    const normalizedTitle = (paper.title || '').toLowerCase().trim();
    const isDuplicateInPdfContext = Array.from(contextUris).some(uri => {
      const lp = loadedPdfs.find(p => p.uri === uri);
      const lpTitle = (lp?.metadata?.title || lp?.file?.name || '').toLowerCase().trim();
      return lpTitle && lpTitle === normalizedTitle;
    });

    if (!isSelected && isDuplicateInPdfContext) {
      console.warn(`[DeepSearch] Selection blocked: "${paper.title}" is already active via Library context.`);
      // Optional: Trigger a notification if available
      return;
    }

    if (isLocal) {
      togglePdfContext(paper.id, paper.title);
    } else {
      toggleArxivSelection(paper.id);
    }
  };

  const handleOpenPdf = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isFailed && paper.pdfUri) {
      window.open(paper.pdfUri, '_blank', 'noopener,noreferrer');
      return;
    }
    if (isLocal) {
      setActivePdf(paper.id);
      setColumnVisibility(prev => ({ ...prev, left: false, right: true }));
    } else if (onView) {
      onView();
    }
  };

  const handleAddToSources = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSaved) {
      deletePaper(paper.pdfUri);
      return;
    }
    const paperData = {
      ...paper,
      uri: paper.pdfUri,
      pdfUri: paper.pdfUri
    };
    savePaper(paperData);
  };


  return (
    <div className="group/paper animate-fade-in relative transition-colors">
      <div className={isExpanded ? 'p-1' : ''}>
        <div className="flex items-start">
          <div className={`pt-1 mr-2 sm:mr-4  ${paper.previewImage && paper.analysisStatus !== 'failed' ? 'absolute top-1 left-1' : ""} `}>
            <button onClick={handleSelectionToggle} className={`hover:text-scholar-600 dark:hover:text-scholar-400 transition-colors opacity-100 sm:group-hover/paper:opacity-100 ${isSelected ? 'text-scholar-600 dark:text-scholar-400' : 'text-gray-400 dark:text-gray-500 sm:opacity-0'}`}>
              {(isDownloading || isProcessing) ? <Loader2 size={24} className="animate-spin" />
                : isSelected ? <Check size={24} className="text-scholar-600 dark:text-scholar-400" /> : <Square size={24} />}
            </button>
          </div>

          {/* Preview Image - Larger and aligned with title */}
          {paper.previewImage && paper.analysisStatus !== 'failed' ? (
            <div className="flex-shrink-0 mt-10 mr-3 sm:mr-4 pt-0.5 flex flex-col items-center">
              <img
                src={paper.previewImage}
                alt={`Preview of ${paper.title}`}
                className="w-20 sm:w-24 h-28 sm:h-36 object-cover rounded shadow-sm border border-gray-200 dark:border-gray-700"
              />
              {paper.pageCount && (
                <span className="mt-2.5 text-xs font-medium text-scholar-800 dark:text-scholar-400">
                  {paper.pageCount} pages
                </span>
              )}
            </div>
          ) : null}

          <div className="flex-grow min-w-0">
            <div className="flex items-center justify-between ">
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
                      }`}
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

            <h3 className="text-3xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 leading-snug my-3 cursor-pointer hover:text-scholar-600 dark:hover:text-scholar-400 transition-colors" onClick={handleOpenPdf}>
              {paper.title}
            </h3>

            {/* {paper.harvardReference && (
              <p className="text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 font-serif italic mb-2 leading-tight">
                {paper.harvardReference}
              </p>
            )} */}

            <p
              role="button"
              aria-expanded={isAbstractExpanded}
              onClick={(e) => { e.stopPropagation(); if (!isAbstractExpanded) setIsAbstractExpanded(true); }}
              className={`text-sm text-gray-600 dark:text-gray-300 leading-relaxed ${isAbstractExpanded ? '' : 'line-clamp-2'} mb-3 ${!isAbstractExpanded ? 'cursor-pointer' : 'cursor-default'}`}
            >
              {paper.summary}
              {isAbstractExpanded && (
                <span
                  role="button"
                  aria-label="Collapse abstract"
                  className="inline-flex items-center dark:text-scholar-400 ml-2 pt-3 text-gray-500 hover:text-gray-700 cursor-pointer"
                  onClick={(e) => { e.stopPropagation(); setIsAbstractExpanded(false); }}
                >
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
                  <span className="text-sm text-gray-400 italic">No notes found</span>
                ) : isStopped ? (
                  <span className="text-xs text-gray-400 italic flex items-center gap-1"><Square size={12} /> stopped</span>
                ) : isFailed ? (
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-red-700 dark:text-red-400">
                    <X size={14} className="text-red-800 dark:text-red-500 flex-shrink-0" />
                    <span className="truncate">
                      {failedUrlErrors?.[paper.pdfUri]?.reason || "Could not access pdf"}: {failedUrlErrors?.[paper.pdfUri]?.actionableMsg || "Could not access file."}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs font-medium text-scholar-600 dark:text-scholar-400">
                    <Check size={12} className="text-success-600" />
                    <span>Waiting to be analysed</span>
                  </div>
                )}
              </div>
            </div>

            {isExpanded && visibleNotes.length > 0 && (
              <div className="flex">
                <span className="relative top-16 -left-14 h-100 border-l-4  sm:border-l-4 border-gray-100 dark:border-gray-800 space-y-3"></span>
                <div className="mt-4  -pl-2 border-gray-100 dark:border-gray-800 space-y-3">
                  {visibleNotes.map((note, idx) => {
                    const noteId = getNoteId(paper.id, note.pageNumber, idx);
                    return (
                      <ResearchCardNote
                        key={noteId} 
                        id={noteId}
                        note={note}
                        isSelected={selectedNoteIds.includes(noteId)}
                        onSelect={() => onSelectNote(noteId)}
                        sourceTitle={paper.title}
                        sourcePaper={paper}
                        isExpanded={expandedNoteIds.has(noteId)} 
                        onToggleExpand={() => {
                          setExpandedNoteIds(prev => {
                            const next = new Set(prev);
                            if (next.has(noteId)) {
                              next.delete(noteId);
                            } else {
                              next.add(noteId);
                            }
                            return next;
                          });
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );


}, (prevProps, nextProps) => {
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

// ─── Main DeepSearch Component ─────────────────────────────────────────────────
// ─── DeepSearch Main Component ─────────────────────────────────────────────────
// Self-contained deep research tab — reads all data from context (no prop drilling)

interface DeepSearchProps {
  onShowClearModal: () => void;
}

export const DeepSearch: React.FC<DeepSearchProps> = ({ onShowClearModal }) => {
  const [allNotesExpanded, setAllNotesExpanded] = useState(false);
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [localFilters, setLocalFilters] = useState({ paper: 'all', query: 'all', hasNotes: false });
  const [currentPage, setCurrentPage] = useState(1);
  const [isSelectMenuOpen, setIsSelectMenuOpen] = useState(false);
  const [isNoteSelectMenuOpen, setIsNoteSelectMenuOpen] = useState(false);
  const [justCopiedNotes, setJustCopiedNotes] = useState(false);
  const [showBulkCopyMenu, setShowBulkCopyMenu] = useState(false);
  const bulkCopyRef = useRef<HTMLDivElement>(null);
  const [isPaperDropdownOpen, setIsPaperDropdownOpen] = useState(false);
  const [isQueryDropdownOpen, setIsQueryDropdownOpen] = useState(false);


  const { loadedPdfs, isPdfInContext, loadPdfFromUrl, setActivePdf, downloadingUris, failedUris } = useLibrary();
  const { openColumn, setColumnVisibility } = useUI();

  // ─── Local Sort State ─────────────────────────────────────────────────────────
  const [sortBy, setSortBy] = useState<SortOption>('relevant-papers');
  const [isSortOpen, setIsSortOpen] = useState(false);
  const sortDropdownRef = useRef<HTMLDivElement>(null);

  // ✅ Track which note from Top 5 should be highlighted/expanded (only one at a time)
  const [highlightedNoteId, setHighlightedNoteId] = useState<string | null>(null);
  const highlightTimerRef = useRef<NodeJS.Timeout | null>(null);

  // ✅ Control which single note is expanded (only one at a time)
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);

  // ✅ Track which Top 5 note was clicked to move it to position 0
  const [clickedTopNoteId, setClickedTopNoteId] = useState<string | null>(null);

  // ✅ NEW: Track which square card was clicked (for showing single note below squares in paper views)
  const [clickedSquareNoteId, setClickedSquareNoteId] = useState<string | null>(null);

  // Define setters to match expected handler names (minimizes diff)
  const onAllNotesExpandedChange = setAllNotesExpanded;
  const onSelectedNoteIdsChange = setSelectedNoteIds;
  const onShowFiltersChange = setShowFilters;
  const onSearchQueryChange = setSearchQuery;
  const onLocalFiltersChange = setLocalFilters;
  const onCurrentPageChange = setCurrentPage;
  const onSelectMenuOpenChange = setIsSelectMenuOpen;
  const onNoteSelectMenuOpenChange = setIsNoteSelectMenuOpen;

  const {
    researchPhase,
    candidates,
    filteredCandidates,
    arxivCandidates,
    topFilteredPapers,
    selectedArxivIds,
    isDeepResearching,
    deepResearchResults,
    showUploadedTab,
    uploadedPaperStatuses,
    timeToFirstNotes,
    stopDeepResearch,
    insightQuestions,
    selectedInsightQuestions,
    toggleInsightQuestion,
    updateInsightQuestion,
    addInsightQuestion,
    resolveInsights,
    hasSubmittedInsights,
    submitResearchPurpose,
    skipResearchPurpose,
    researchPurpose,
    showPurposeModal,  // ✅ NEW: Control modal visibility
    status,
    arxivKeywords: generatedKeywords,
    topNoteIds,
    hasRankedOnce,  // ✅ NEW: Import flag to hide button
    rankTopNotes
  } = useResearch();


   // ─── Helper: Status Priority for Sorting ──────────────────────────────────────
  // 8-tier ordering — reads both status AND notes count for precise live-sort
  const getStatusPriority = (paper: ArxivPaper): number => {
    const status = paper.analysisStatus;
    const hasNotes = (paper.notes?.length || 0) > 0;

    if (status === 'completed' && hasNotes) return 7; // TOP: finished with results
    if (status === 'extracting') return 6; // Actively extracting notes
    if (status === 'downloaded') return 5; // Ready, queued for extraction
    if (status === 'downloading') return 4; // Fetching PDF
    if (status === 'processing') return 4; // Uploaded PDFs reading pages
    if (status === 'completed' && !hasNotes) return 3; // Done, no notes found
    if (status === 'stopped') return 2; // Stopped by user
    if (status === 'pending') return 1; // Not yet started
    if (status === 'failed') return 0; // Bottom: errored
    return 4; // undefined status — treat as active
  };

   // Determine candidates based on research phase (same logic as before)
  const currentTabCandidates = useMemo(() => {
    return researchPhase === 'downloading' || researchPhase === 'downloaded' || researchPhase === 'extracting' || researchPhase === 'completed' || researchPhase === 'ranking_notes'
      ? filteredCandidates
      : arxivCandidates;
  }, [researchPhase, filteredCandidates, arxivCandidates]);

  
  // ─── Filter Step 1: Text + field filters ──────────────────────────────────────
  const filteredPapers = useMemo(() => {
    let base = [...currentTabCandidates];
    if (searchQuery.trim()) {
      const q = normalizeText(searchQuery);
      base = base.filter(paper => {
        const titleMatch = normalizeText(paper.title).includes(q);
        const abstractMatch = normalizeText(paper.summary ?? '').includes(q);
        const notesMatch = paper.notes?.some(note =>
          normalizeText(note.quote).includes(q) ||
          normalizeText(note.justification ?? '').includes(q)
        );
        return titleMatch || abstractMatch || notesMatch;
      });
    }
    if (localFilters.paper !== 'all') {
      base = base.filter(p => p.id === localFilters.paper);
    }
    if (localFilters.query !== 'all') {
      base = base.filter(p =>
        p.notes?.some(note => note.relatedQuestion === localFilters.query)
      );
    }
    if (localFilters.hasNotes) {
      base = base.filter(p => p.notes && p.notes.length > 0);
    }
    return base;
  }, [currentTabCandidates, searchQuery, localFilters]);

  
  const content = useMemo(() => {
    if (sortBy === 'most-relevant-notes') {
      const allNotes = filteredPapers.flatMap(paper =>
        (paper.notes || [])
          .filter(note => {
            if ((note?.quote || '').toString().trim().length === 0) return false;
            if (localFilters.query && localFilters.query !== 'all') {
              return note.relatedQuestion === localFilters.query;
            }
            return true;
          })
          .map((note, filterIdx) => {
            // ✅ CRITICAL FIX: Use full quote length for uniqueness guarantee
            // Substring(0, 50) can collide if two notes on same page start identically
            // Using full quote ensures truly unique IDs
            const fullQuoteHash = String(note.quote || '')
              .replace(/[|\/\\]/g, '_')
              .substring(0, 60);

            // Get actual index in paper.notes array for consistency with rankTopNotes
            const actualIndex = (paper.notes || []).findIndex((n: any) =>
              n.quote === note.quote && n.pageNumber === note.pageNumber
            );

            // ✅ Include filterIdx as tiebreaker — prevents collisions when two notes
            // on the same page share an identical quote prefix (truncated to 60 chars)
            const uniqueId = actualIndex >= 0
              ? `${paper.id}|p${note.pageNumber}|i${actualIndex}|${filterIdx}|${fullQuoteHash}`
              : `${paper.id}|p${note.pageNumber}|i${filterIdx}|${filterIdx}|${fullQuoteHash}`;

            return {
              ...note,
              sourcePaper: paper,
              sourceId: paper.id,  // ← Track source paper
              uniqueId
            };
          })
      );

      // ✅ Deduplicate allNotes by uniqueId (safety measure)
      const seenIds = new Set<string>();
      const uniqueAllNotes = allNotes.filter(note => {
        if (seenIds.has(note.uniqueId)) {
          console.warn('[DeepSearch] Duplicate note in allNotes filtered:', note.uniqueId.substring(0, 50));
          return false;
        }
        seenIds.add(note.uniqueId);
        return true;
      });

      // Sort by: status priority first, then relevance score
      const sorted = uniqueAllNotes.sort((a, b) => {
        const priorityDiff = getStatusPriority(b.sourcePaper) - getStatusPriority(a.sourcePaper);
        if (priorityDiff !== 0) return priorityDiff;
        return (b.relevanceScore || 0) - (a.relevanceScore || 0);
      });

      // 🔥 Refined Reordering: Bubble Top 5 insights to the absolute top
      if (topNoteIds && topNoteIds.length > 0) {
        const topOnes = uniqueAllNotes
          .filter(n => topNoteIds.includes(n.uniqueId))
          .sort((a, b) => topNoteIds.indexOf(a.uniqueId) - topNoteIds.indexOf(b.uniqueId));

        // ✅ If user clicked a specific Top 5 note, move it to position 0
        if (clickedTopNoteId && topOnes.some(n => n.uniqueId === clickedTopNoteId)) {
          const clickedNote = topOnes.find(n => n.uniqueId === clickedTopNoteId)!;
          const otherTopNotes = topOnes.filter(n => n.uniqueId !== clickedTopNoteId);
          const finalTopOnes = [clickedNote, ...otherTopNotes];
          const remaining = uniqueAllNotes.filter(n => !topNoteIds.includes(n.uniqueId));

          console.log('[DeepSearch] Moved clicked note to position 0:', {
            clickedNoteId: clickedTopNoteId.substring(0, 50),
            totalTopNotes: finalTopOnes.length,
            remainingNotes: remaining.length
          });

          return [...finalTopOnes, ...remaining];
        }

        const remaining = uniqueAllNotes.filter(n => !topNoteIds.includes(n.uniqueId));
        return [...topOnes, ...remaining];
      }

      return sorted;
    } else if (sortBy === 'newest-papers') {
      return [...filteredPapers].sort((a, b) => {
        const priorityDiff = getStatusPriority(b) - getStatusPriority(a);
        if (priorityDiff !== 0) return priorityDiff;
        return getSafeTimestamp(b.publishedDate) - getSafeTimestamp(a.publishedDate);
      });
    } else {
      // 'relevant-papers' default: sort by status priority first, then notes count
      return [...filteredPapers].sort((a, b) => {
        const priorityDiff = getStatusPriority(b) - getStatusPriority(a);
        if (priorityDiff !== 0) return priorityDiff;
        return (b.notes?.length || 0) - (a.notes?.length || 0);
      });
    }
  }, [filteredPapers, sortBy, localFilters.query, topNoteIds, clickedTopNoteId]);




  const handleBulkCopyNotes = useCallback((mode: 'raw' | 'full') => {
    if (selectedNoteIds.length === 0) return;
    // ✅ FIX: Filter from `content` (has uniqueId) not `accumulatedNotes` (does not)
    const notesToCopy = (content as any[]).filter(n => selectedNoteIds.includes(n.uniqueId));
    let text = '';
    if (mode === 'raw') {
      text = notesToCopy.map(n => `"${n.quote}"`).join('\n\n');
    } else {
      text = notesToCopy.map(n => {
        const paper = n.sourcePaper;
        const authors = paper?.authors
          ? (Array.isArray(paper.authors) ? paper.authors.join(', ') : paper.authors)
          : '';
        const citationLines = n.citations?.map((c: any) => `${c.inline} ${c.full}`).join('\n') || '';
        return [
          `Title: ${paper?.title || 'Untitled Paper'}`,
          authors ? `Authors: ${authors}` : null,
          `Page: ${n.pageNumber}`,
          '---',
          n.quote,
          '---',
          citationLines ? `Citations:\n${citationLines}` : null,
          `Source: ${n.pdfUri}`,
          paper?.harvardReference ? `Reference: ${paper.harvardReference}` : null,
        ].filter(Boolean).join('\n');
      }).join('\n\n========================\n\n');
    }
    navigator.clipboard.writeText(text);
    setJustCopiedNotes(true);
    setShowBulkCopyMenu(false);
    setTimeout(() => setJustCopiedNotes(false), 2000);
  }, [selectedNoteIds, content]);

  const onSelectNote = useCallback((id: string) => {
    setSelectedNoteIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  }, []);



  // Close sort dropdown when user clicks outside it
  useEffect(() => {
    if (!isSortOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(e.target as Node)) {
        setIsSortOpen(false);
      }
    };
    document.addEventListener('mouseup', handleClickOutside);
    return () => document.removeEventListener('mouseup', handleClickOutside);
  }, [isSortOpen]);

  // Reset sort view and pagination to default when new research starts
  useEffect(() => {
    if (researchPhase === 'initialising') {
      setSortBy('relevant-papers');
      setCurrentPage(1);
    }
  }, [researchPhase]);

  // Reset to page 1 when filters or search query change (prevents empty pages)
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, localFilters]);


  // Calculate lightweight paper data (titles + relevance scores) for dynamic loading box
  // During filtering phase, use top 10 papers from ResearchContext; other phases use appropriate source
  const paperDataList = useMemo(() => {
    if (researchPhase === 'filtering') {
      // ✅ Use real-time top 10 papers (with relevance scores calculated by backend)
      return topFilteredPapers;
    } else if (researchPhase === 'searching') {
      // Show papers as they're found during search phase
      return arxivCandidates.slice(0, 10).map(p => ({
        title: p.title,
        relevanceScore: p.relevanceScore || 0
      }));
    }
    return [];
  }, [topFilteredPapers, arxivCandidates, researchPhase]);  // ← FIXED: Full arrays, not .length

  // handleViewPdf — replicated here, no longer needs to come from App.tsx as a prop
  const handleViewPdf = useCallback((paper: ArxivPaper) => {
    setActivePdf(paper.pdfUri);
    // Open viewer, close sidebar
    setColumnVisibility(prev => ({ ...prev, left: false, right: true }));
    loadPdfFromUrl(paper.pdfUri, paper.title, paper.authors.join(', ')).then((result: any) => {
      if (!result.success && result.error) {
        setActivePdf(null);
      }
    });
  }, [setActivePdf, openColumn, loadPdfFromUrl]);

  const isBlurred = useMemo(() => {
    // Blur during filtering phase
    if (researchPhase === 'filtering') return true;

    // Blur during reviewing insights phase (user is providing feedback)
    if (researchPhase === 'reviewing_insights') return true;

    // Blur during download phase - stay blurred until 15 papers with data OR all downloads complete
    if (researchPhase === 'downloading') {
      if (filteredCandidates.length === 0) return true;

      const papersWithData = filteredCandidates.filter(p =>
        (p.analysisStatus === 'downloaded' ||
          p.analysisStatus === 'extracting' ||
          p.analysisStatus === 'completed') &&
        (p.previewImage || p.analysisStatus === 'failed')
      ).length;

      // Stay blurred until 15 papers have data OR all downloads complete
      const allDownloadsComplete = filteredCandidates.every(p =>
        p.analysisStatus === 'downloaded' ||
        p.analysisStatus === 'extracting' ||
        p.analysisStatus === 'completed' ||
        p.analysisStatus === 'failed' ||
        p.analysisStatus === 'stopped'
      );

      // Unblur once we have 15 papers with data OR all downloads complete
      return papersWithData < 15 && !allDownloadsComplete;
    }

    // Don't blur during 'downloaded' or 'extracting' phases (already unblurred from downloading phase)
    if (researchPhase === 'downloaded' || researchPhase === 'extracting') {
      // Unblur once extraction has STARTED (not waiting for completion)
      // Check if ANY papers are actively extracting
      const extractingCount = filteredCandidates.filter(p =>
        p.analysisStatus === 'extracting'
      ).length;

      // Keep blurred until at least ONE paper starts extracting
      // Once extraction starts, show results immediately
      return extractingCount === 0;
    }

    // Default: don't blur
    return false;
  }, [researchPhase, filteredCandidates]);

  const isSearching = researchPhase === 'searching' || researchPhase === 'initialising';
  const isFiltered = !!(searchQuery.trim() || localFilters.paper !== 'all' || localFilters.query !== 'all' || localFilters.hasNotes);

  const totalNotes = useMemo(() =>
    filteredPapers.reduce((acc, paper) => {
      const notes = paper.notes || [];
      const count = localFilters.query !== 'all'
        ? notes.filter(n => n.relatedQuestion === localFilters.query && (n.quote || '').trim().length > 0).length
        : notes.length;
      return acc + count;
    }, 0),
    [filteredPapers, localFilters.query]
  );

  const papersWithNotes = useMemo(() =>
    currentTabCandidates.filter(p => (p.notes?.length || 0) > 0).length,
    [currentTabCandidates]
  );



  // ✅ Handler for Top 5 card clicks - moves clicked note to position 0 and expands it
  const handleHighlightNote = useCallback((noteId: string) => {
    // ✅ Clear previous timer if exists
    if (highlightTimerRef.current) {
      clearTimeout(highlightTimerRef.current);
    }

    // ✅ NEW: Different behavior for different views
    if (sortBy === 'most-relevant-notes') {
      // ✅ MOST-RELEVANT-NOTES VIEW: Scroll + expand in main list (existing behavior)
      setClickedSquareNoteId(null);  // Clear paper view state

      setClickedTopNoteId(noteId);
      setExpandedNoteId(noteId);
      setHighlightedNoteId(noteId);

      if (currentPage !== 1) {
        setCurrentPage(1);
      }

      highlightTimerRef.current = setTimeout(() => {
        setHighlightedNoteId(null);
        highlightTimerRef.current = null;
      }, 3000);
    } else {
      // ✅ PAPER VIEWS: Show note below square cards
      setClickedTopNoteId(null);  // Clear most-relevant-notes state
      setExpandedNoteId(null);
      setHighlightedNoteId(null);

      setClickedSquareNoteId(noteId);
    }
  }, [currentPage, sortBy]);



  // ─── Pagination ────────────────────────────────────────────────────────────────
  const totalPages = useMemo(() => Math.max(1, Math.ceil(content.length / ITEMS_PER_PAGE)), [content]);
  const paginatedContent = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return content.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [content, currentPage]);

  // ✅ Extract Top 5 notes from ALL papers (works in ALL views)
  const top5Notes = useMemo(() => {
    if (topNoteIds.length === 0) {
      return [];
    }

    const uniqueTopNoteIds = Array.from(new Set(topNoteIds)).slice(0, 5);
    const seenIds = new Set<string>();

    // ✅ CRITICAL: Extract from filteredCandidates (all papers), NOT content (view-specific)
    const allNotes = filteredCandidates.flatMap(paper =>
      (paper.notes || [])
        .filter(note => (note?.quote || '').trim().length > 0)
        .map((note, noteIdx) => {
          const quoteHash = String(note.quote).substring(0, 60).replace(/[|\/\\]/g, '_');
          // ✅ Include noteIdx tiebreaker — matches the format used in content useMemo
          const uniqueId = `${paper.id}|p${note.pageNumber}|i${noteIdx}|${noteIdx}|${quoteHash}`;

          return {
            ...note,
            uniqueId,
            sourcePaper: paper,
            sourceId: paper.id
          };
        })
    );

    const uniqueNotes = allNotes
      .filter(note => {
        if (!uniqueTopNoteIds.includes(note.uniqueId)) return false;
        if (seenIds.has(note.uniqueId)) {
          console.warn('[Top5Notes] Duplicate note filtered:', note.uniqueId.substring(0, 50));
          return false;
        }
        seenIds.add(note.uniqueId);
        return true;
      })
      .sort((a, b) =>
        uniqueTopNoteIds.indexOf(a.uniqueId) - uniqueTopNoteIds.indexOf(b.uniqueId)
      );

    console.log('[Top5Notes] Built for all views:', {
      currentView: sortBy,
      topNoteIds: topNoteIds.length,
      allNotesExtracted: allNotes.length,
      foundInTop5: uniqueNotes.length
    });

    return uniqueNotes;
  }, [topNoteIds, filteredCandidates, sortBy]);


  // ─── Selection Actions ────────────────────────────────────────────────────────
  const { selectAllArxivPapers, clearArxivSelection } = useResearch();

  const handleSelectPage = useCallback(() => {
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

    const allPageSelected = (pagePaperIds as string[]).every(id => selectedArxivIds.has(id));

    if (allPageSelected) {
      const currentSelection = Array.from(selectedArxivIds) as string[];
      const newSelection = currentSelection.filter(id => !(pagePaperIds as string[]).includes(id));
      selectAllArxivPapers(newSelection);
    } else {
      const currentSelection = Array.from(selectedArxivIds) as string[];
      const newSelection = Array.from(new Set([...currentSelection, ...(pagePaperIds as string[])]));
      selectAllArxivPapers(newSelection);
    }
    onSelectMenuOpenChange(false);
  }, [paginatedContent, selectedArxivIds, sortBy, selectAllArxivPapers, onSelectMenuOpenChange]);

  const handleSelectAllTotal = useCallback(() => {
    const selectableContent = sortBy === 'most-relevant-notes'
      ? content
        .filter(n => (n as any).sourcePaper.analysisStatus !== 'failed')
        .map(n => (n as any).sourcePaper.id)
      : (content as ArxivPaper[])
        .filter(p => p.analysisStatus !== 'failed')
        .map(p => p.id);

    const allIds = Array.from(new Set(selectableContent));
    selectAllArxivPapers(allIds);
    onSelectMenuOpenChange(false);
  }, [content, sortBy, selectAllArxivPapers, onSelectMenuOpenChange]);

  const handleSelectNotesPage = useCallback(() => {
    if (sortBy !== 'most-relevant-notes') return;
    const pageNoteIds = (paginatedContent as any[])
      .filter((note: any) => (note?.quote || '').trim().length > 0)
      .map((note: any) => note.uniqueId);
    const allPageSelected = pageNoteIds.every(id => selectedNoteIds.includes(id));
    if (allPageSelected) {
      onSelectedNoteIdsChange(selectedNoteIds.filter(id => !pageNoteIds.includes(id)));
    } else {
      onSelectedNoteIdsChange(Array.from(new Set([...selectedNoteIds, ...pageNoteIds])));
    }
    onNoteSelectMenuOpenChange(false);
  }, [paginatedContent, selectedNoteIds, sortBy, onSelectedNoteIdsChange, onNoteSelectMenuOpenChange]);

  const handleSelectAllNotes = useCallback(() => {
    if (sortBy !== 'most-relevant-notes') return;
    const allNoteIds = (content as any[])
      .filter((note: any) => (note?.quote || '').trim().length > 0)
      .map((note: any) => note.uniqueId);
    const allSelected = allNoteIds.every(id => selectedNoteIds.includes(id));
    if (allSelected) {
      onSelectedNoteIdsChange([]);
    } else {
      onSelectedNoteIdsChange(allNoteIds);
    }
    onNoteSelectMenuOpenChange(false);
  }, [content, selectedNoteIds, sortBy, onSelectedNoteIdsChange, onNoteSelectMenuOpenChange]);







  // ─── Dropdown options ──────────────────────────────────────────────────────────
  const uniquePapers = useMemo(() => {
    let base = [...currentTabCandidates];
    if (searchQuery.trim()) {
      const q = normalizeText(searchQuery);
      base = base.filter(paper =>
        normalizeText(paper.title).includes(q) ||
        normalizeText(paper.summary ?? '').includes(q) ||
        paper.notes?.some(note =>
          normalizeText(note.quote).includes(q) ||
          normalizeText(note.justification ?? '').includes(q)
        )
      );
    }
    if (localFilters.query !== 'all') {
      base = base.filter(p => p.notes?.some(note => note.relatedQuestion === localFilters.query));
    }
    if (localFilters.hasNotes) {
      base = base.filter(p => p.notes && p.notes.length > 0);
    }
    return base.map(p => ({
      id: p.id,
      title: p.title,
      noteCount: (p.notes || []).filter(n => {
        if ((n?.quote || '').trim().length === 0) return false;
        if (localFilters.query !== 'all') return n.relatedQuestion === localFilters.query;
        return true;
      }).length
    }));
  }, [currentTabCandidates, searchQuery, localFilters.query, localFilters.hasNotes]);

  const uniqueQueries = useMemo(() => {
    let base = [...currentTabCandidates];
    if (searchQuery.trim()) {
      const q = normalizeText(searchQuery);
      base = base.filter(paper =>
        normalizeText(paper.title).includes(q) ||
        normalizeText(paper.summary ?? '').includes(q) ||
        paper.notes?.some(note =>
          normalizeText(note.quote).includes(q) ||
          normalizeText(note.justification ?? '').includes(q)
        )
      );
    }
    if (localFilters.paper !== 'all') {
      base = base.filter(p => p.id === localFilters.paper);
    }
    if (localFilters.hasNotes) {
      base = base.filter(p => p.notes && p.notes.length > 0);
    }
    const queryMap = new Map<string, number>();
    base.forEach(paper => {
      (paper.notes || []).forEach(note => {
        if (note.relatedQuestion) {
          // Ensure every question appears — initialise to 0 if not yet seen
          if (!queryMap.has(note.relatedQuestion)) {
            queryMap.set(note.relatedQuestion, 0);
          }
          // Only count notes that have a real quote
          if ((note.quote || '').trim().length > 0) {
            queryMap.set(note.relatedQuestion, (queryMap.get(note.relatedQuestion) || 0) + 1);
          }
        }
      });
    });
    return Array.from(queryMap.entries()).map(([query, noteCount]) => ({ query, noteCount }));
  }, [currentTabCandidates, searchQuery, localFilters.paper, localFilters.hasNotes]);

  // ─── Auto-reset stale filters ──────────────────────────────────────────────────
  useEffect(() => {
    if (localFilters.paper !== 'all') {
      const paperExists = uniquePapers.some(p => p.id === localFilters.paper);
      if (!paperExists) onLocalFiltersChange({ ...localFilters, paper: 'all' });
    }
  }, [uniquePapers, localFilters.paper]);

  useEffect(() => {
    if (localFilters.query !== 'all') {
      const queryExists = uniqueQueries.some(q => q.query === localFilters.query);
      if (!queryExists) onLocalFiltersChange({ ...localFilters, query: 'all' });
    }
  }, [uniqueQueries, localFilters.query]);

  // ─── Selectable counts ────────────────────────────────────────────────────────
  const selectablePapersCount = useMemo(() => {
    if (sortBy === 'most-relevant-notes') {
      const uq = new Set(
        (paginatedContent as any[]).map(n => (n as any).sourcePaper).filter(p => p.analysisStatus !== 'failed').map(p => p.id)
      );
      return uq.size;
    }
    return (paginatedContent as ArxivPaper[]).filter(p => p.analysisStatus !== 'failed').length;
  }, [paginatedContent, sortBy]);

  const selectableTotalCount = useMemo(() => {
    if (sortBy === 'most-relevant-notes') {
      const uq = new Set(
        (content as any[]).map(n => (n as any).sourcePaper).filter(p => p.analysisStatus !== 'failed').map(p => p.id)
      );
      return uq.size;
    }
    return (content as ArxivPaper[]).filter(p => p.analysisStatus !== 'failed').length;
  }, [content, sortBy]);

  const selectableNotesPageCount = useMemo(() => {
    if (sortBy !== 'most-relevant-notes') return 0;
    return (paginatedContent as any[]).filter((note: any) => (note?.quote || '').trim().length > 0).length;
  }, [paginatedContent, sortBy]);

  const selectableNotesTotalCount = useMemo(() => {
    // ✅ Count ALL notes from ALL papers (works in all views)
    const allNotes = filteredCandidates.flatMap(paper =>
      (paper.notes || []).filter(note => (note?.quote || '').trim().length > 0)
    );
    return allNotes.length;
  }, [filteredCandidates]);

  const handleResetFilters = useCallback(() => {
    onSearchQueryChange('');
    onLocalFiltersChange({ paper: 'all', query: 'all', hasNotes: false });
  }, [onSearchQueryChange, onLocalFiltersChange]);


  return (
    <>
      {/* ── Header Controls (Selection, Bulk Copy, Filters, Collapse) ─────────── */}
      {!isBlurred && (currentTabCandidates.length > 0 || totalNotes > 0) && (
        <div className="relative z-20 flex items-center justify-between mb-4 px-1 animate-fade-in">

          {/* LEFT: Selection + Bulk actions */}
          <div className="flex items-center gap-2">

            {/* Paper Selection Dropdown */}
            {sortBy !== 'most-relevant-notes' && currentTabCandidates.length > 0 && (
              <div className="relative z-30" style={{ overflow: 'visible' }}>
                <button
                  onClick={() => onSelectMenuOpenChange(!isSelectMenuOpen)}
                  className="flex items-center gap-1 p-2 opacity-100 text-gray-500 dark:text-gray-400 hover:text-scholar-600 dark:hover:text-scholar-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-all "
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
                    <div className="fixed inset-0 z-40 pointer-events-auto" onClick={() => onSelectMenuOpenChange(false)} />
                    <div className="absolute left-0 top-full mt-2 w-64 bg-white dark:bg-dark-card rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 py-1.5 animate-fade-in pointer-events-auto" style={{ overflow: 'visible' }}>
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
                        onClick={() => { clearArxivSelection(); onSelectMenuOpenChange(false); }}
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

            {/* Note Selection Dropdown (Most Relevant Notes mode) */}
            {sortBy === 'most-relevant-notes' && selectableNotesTotalCount > 0 && (
              <div className="relative z-30" style={{ overflow: 'visible' }}>
                <button
                  onClick={() => onNoteSelectMenuOpenChange(!isNoteSelectMenuOpen)}
                  className="flex items-center gap-1 p-2 opacity-100 text-gray-500 dark:text-gray-400 hover:text-scholar-600 dark:hover:text-scholar-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-all"
                  title="Select notes options"
                >
                  <div className={`w-6 h-6 rounded border-2 transition-colors flex items-center justify-center ${selectedNoteIds.length === selectableNotesTotalCount ? 'bg-scholar-600 border-scholar-600' :
                    selectedNoteIds.length > 0 ? 'bg-scholar-100 dark:bg-scholar-900/30 border-scholar-600' : 'border-gray-400 dark:border-gray-500'
                    }`}>
                    {selectedNoteIds.length === selectableNotesTotalCount ? <Check size={16} color="white" strokeWidth={3} /> :
                      selectedNoteIds.length > 0 ? <Minus size={16} className="text-scholar-600 dark:text-scholar-400" strokeWidth={3} /> : null}
                  </div>
                  <ChevronDown size={14} className="opacity-60" />
                </button>

                {isNoteSelectMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40 pointer-events-auto" onClick={() => onNoteSelectMenuOpenChange(false)} />
                    <div className="absolute left-0 top-full mt-2 w-72 bg-white dark:bg-dark-card rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 py-1.5 animate-fade-in pointer-events-auto" style={{ overflow: 'visible' }}>
                      <button
                        onClick={handleSelectNotesPage}
                        className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                      >
                        <LayoutList size={16} className="text-gray-400" />
                        <span className="text-sm font-medium text-gray-700 dark:text-white">Select Page ({selectableNotesPageCount})</span>
                      </button>
                      <button
                        onClick={handleSelectAllNotes}
                        className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                      >
                        <Layers size={16} className="text-gray-400" />
                        <span className="text-sm font-medium text-gray-700 dark:text-white">Select All Total ({selectableNotesTotalCount})</span>
                      </button>
                      <div className="h-px bg-gray-100 dark:bg-gray-700 mx-3 my-1" />
                      <button
                        onClick={() => { onSelectedNoteIdsChange([]); onNoteSelectMenuOpenChange(false); }}
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

            {/* Bulk Copy Notes Button */}
            {sortBy === 'most-relevant-notes' && selectedNoteIds.length > 0 && (
              <div className="relative" ref={bulkCopyRef}>
                <button
                  onClick={() => setShowBulkCopyMenu(!showBulkCopyMenu)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg shadow-sm transition-all ${justCopiedNotes
                    ? 'bg-scholar-500 dark:bg-scholar-400 text-white'
                    : 'text-white bg-scholar-600 dark:bg-scholar-700 hover:bg-scholar-700 dark:hover:bg-scholar-600'
                    }`}
                  title={`Copy ${selectedNoteIds.length} selected notes`}
                >
                  {justCopiedNotes ? <Check size={16} className="stroke-[3]" /> : <Copy size={16} />}
                  <span className="hidden sm:inline">
                    {justCopiedNotes ? `Copied! ${selectedNoteIds.length} Notes` : `Copy ${selectedNoteIds.length} Notes`}
                  </span>
                  <ChevronDown size={12} className={`transition-transform ${showBulkCopyMenu ? 'rotate-180' : ''}`} />
                </button>
                {showBulkCopyMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowBulkCopyMenu(false)} />
                    <div className="absolute left-0 top-full mt-2 w-52 bg-white dark:bg-dark-card rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 py-1.5 z-50 animate-fade-in">
                      <button
                        onClick={() => handleBulkCopyNotes('raw')}
                        className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                      >
                        <FileText size={16} className="text-gray-400" />
                        <span className="text-sm font-medium text-gray-700 dark:text-white">Copy Quotes Only</span>
                      </button>
                      <button
                        onClick={() => handleBulkCopyNotes('full')}
                        className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                      >
                        <FileText size={16} className="text-scholar-600 dark:text-scholar-400" />
                        <span className="text-sm font-medium text-gray-700 dark:text-white">Copy Full Notes</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Clear All Results Button (Redirects to parent modal) */}
            {researchPhase !== 'searching' && (
              <button
                onClick={onShowClearModal}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-gray-600 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                title="Clear all results"
              >
                <X size={20} />
                <span className="hidden sm:inline">Clear All Results</span>
              </button>
            )}
          </div>

          {/* RIGHT: Filter Toggle + Expand/Collapse */}
          <div className="relative flex items-center gap-2 z-20">
            {/* Top 5 Insights Button - NOW SHOWS IN ALL VIEWS */}
            {selectableNotesTotalCount > 10 && researchPhase === 'completed' && !hasRankedOnce && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  console.log('[🔴 DeepSearch] Top 5 button CLICKED');
                  console.log('[🔴 DeepSearch] About to call rankTopNotes()');
                  rankTopNotes();
                }}
                disabled={researchPhase === 'ranking_notes'}
                className={`flex items-center gap-2 px-3 py-2.5 text-xs font-bold rounded-lg transition-all ${topNoteIds.length > 0
                  ? 'text-scholar-700   dark:text-scholar-300  bg-scholar-50 dark:bg-scholar-900/30 border border-scholar-200/50'
                  : 'text-scholar-600 dark:text-scholar-300 hover:text-scholar-600 dark:hover:text-scholar-300 hover:bg-scholar-50 dark:hover:bg-scholar-900/20'
                  }`}
                title="Identify top 5 most critical insights"
              >
                {researchPhase === 'ranking_notes' ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : (
                  <Sparkles size={20} className={topNoteIds.length > 0 ? "fill-amber-500" : ""} />
                )}
                <span>Top 5 Insights</span>
              </button>
            )}

            {/* Sort Dropdown */}
            <div ref={sortDropdownRef} className="relative z-30">
              <button
                onClick={() => {
                  // If already in most-relevant-notes view, toggle dropdown
                  // Otherwise, switch to most-relevant-notes view
                  if (sortBy === 'most-relevant-notes') {
                    setIsSortOpen(!isSortOpen);
                  } else {
                    setSortBy('most-relevant-notes'); setCurrentPage(1);
                  }
                }}
                className="flex items-center gap-2 px-3 py-2.5 text-xs font-bold text-gray-600 dark:text-gray-300 hover:text-scholar-600 dark:hover:text-scholar-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-all"
              >
                <span className="truncate max-w-[140px]">
                  Most Relevant Notes
                </span>
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsSortOpen(!isSortOpen);
                  }}
                  className="flex items-center justify-center"
                >
                  <ChevronDown size={16} className={`text-gray-400 transition-transform ${isSortOpen ? 'rotate-180' : ''}`} />
                </div>
              </button>

              {isSortOpen && (
                <>
                  <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-dark-card rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 py-1.5 z-50 animate-fade-in pointer-events-auto">
                    <button onClick={() => { setSortBy('most-relevant-notes'); setCurrentPage(1); setIsSortOpen(false); }} className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                      <Star size={16} className={sortBy === 'most-relevant-notes' ? "text-scholar-600 dark:text-scholar-400" : "text-gray-400"} />
                      <span className="text-sm font-medium dark:text-white">Most Relevant Notes</span>
                    </button>
                    <div className="h-px bg-gray-100 dark:bg-gray-700 mx-3 my-1" />
                    <button onClick={() => { setSortBy('relevant-papers'); onAllNotesExpandedChange(false); setCurrentPage(1); setIsSortOpen(false); }} className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                      <Layers size={16} className={sortBy === 'relevant-papers' ? "text-scholar-600 dark:text-scholar-400" : "text-gray-400"} />
                      <span className="text-sm font-medium dark:text-white">Relevant Papers</span>
                    </button>
                    <button onClick={() => { setSortBy('newest-papers'); onAllNotesExpandedChange(false); setCurrentPage(1); setIsSortOpen(false); }} className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                      <Calendar size={16} className={sortBy === 'newest-papers' ? "text-scholar-600 dark:text-scholar-400" : "text-gray-400"} />
                      <span className="text-sm font-medium dark:text-white">Newest Papers</span>
                    </button>
                  </div>
                </>
              )}
            </div>

            <button
              onClick={() => onShowFiltersChange(!showFilters)}
              className={`flex items-center gap-2 px-3 py-2.5 text-xs font-bold rounded-lg transition-all ${showFilters || searchQuery || localFilters.paper !== 'all' || localFilters.query !== 'all' || localFilters.hasNotes
                ? 'text-scholar-600 dark:text-scholar-400 bg-scholar-50 dark:bg-scholar-900/30'
                : 'text-gray-600 dark:text-gray-300 hover:text-scholar-600 dark:hover:text-scholar-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              title="Filter options"
            >
              <Filter size={20} />
              <span>Filters</span>
            </button>

            {sortBy !== 'most-relevant-notes' && currentTabCandidates.some(p => p.notes && p.notes.length > 0) && (
              <button
                onClick={() => onAllNotesExpandedChange(!allNotesExpanded)}
                className="flex items-center gap-2 px-3 py-2.5 text-xs font-bold text-gray-600 dark:text-gray-300 hover:text-scholar-600 dark:hover:text-scholar-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-all"
                title={allNotesExpanded ? 'Collapse all notes' : 'Expand all notes'}
              >
                {allNotesExpanded ? <ChevronsUp size={20} /> : <ChevronsDown size={20} />}
                <span>{allNotesExpanded ? 'Collapse' : 'Expand'} Notes</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Filter Panel ────────────────────────────────────────────────────── */}
      {showFilters && !isBlurred && (
        <div className="relative z-30 bg-white/80 dark:bg-gray-950/90 backdrop-blur-xl border border-gray-100 dark:border-gray-800 rounded-2xl p-5 pt-2 sm:p-7 pb-1 sm:pb-2 mb-6 shadow-xl animate-fade-in ring-1 ring-black/5 dark:ring-white/5">
          <button
            onClick={() => onShowFiltersChange(false)}
            className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-all z-10"
            title="Close filters"
          >
            <X size={18} />
          </button>

          {/* ROW 1: Keyword search — full width */}
          <div className="pt-2 mb-5">
            <label className="text-[10px] sm:text-[11px] font-black text-gray-400 dark:text-scholar-400 uppercase tracking-widest pl-1 block mb-2">Keywords</label>
            <div className="relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-scholar-600 dark:group-focus-within:text-scholar-400 transition-colors" />
              <input
                className="w-full bg-white/80 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800 rounded-xl pl-11 pr-10 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 outline-none focus:ring-2 focus:ring-scholar-500/10 shadow-sm transition-all"
                value={searchQuery}
                onChange={(e) => onSearchQueryChange(e.target.value)}
                placeholder="Search title, notes, insights..."
                autoFocus
              />
              {searchQuery && (
                <button onClick={() => onSearchQueryChange('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                  <X size={16} />
                </button>
              )}
            </div>
          </div>

          {/* ROW 2: Papers + Queries + Refine (Refine hidden in most-relevant-notes) */}
          <div className={`flex flex-col gap-5 sm:grid sm:gap-6 ${sortBy !== 'most-relevant-notes' ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
            {/* Paper Filter */}
            <div className="space-y-2">
              <label className="text-[10px] sm:text-[11px] font-black text-gray-400 dark:text-scholar-400 uppercase tracking-widest pl-1">Papers</label>
              <div className="relative" style={{ overflow: 'visible' }}>
                <button
                  onClick={() => { setIsPaperDropdownOpen(!isPaperDropdownOpen); setIsQueryDropdownOpen(false); }}
                  className="w-full bg-white/80 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800 rounded-xl px-4 py-2.5 text-sm text-left text-gray-900 dark:text-white outline-none shadow-sm transition-all flex items-center justify-between gap-2 hover:border-gray-200 dark:hover:border-gray-700"
                >
                  <span className="truncate text-sm" title={localFilters.paper !== 'all' ? (uniquePapers.find(p => p.id === localFilters.paper)?.title || '') : undefined}>
                    {localFilters.paper === 'all'
                      ? `All Papers (${uniquePapers.length})`
                      : truncateWords(uniquePapers.find(p => p.id === localFilters.paper)?.title || '', 11)
                    }
                  </span>
                  <ChevronDown size={14} className={`flex-shrink-0 text-gray-400 transition-transform duration-200 ${isPaperDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                {isPaperDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsPaperDropdownOpen(false)} />
                    <div className="absolute left-0 top-full mt-1 w-full min-w-[380px] max-h-60 overflow-y-auto custom-scrollbar bg-white dark:bg-dark-card rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 py-1.5 z-50 animate-fade-in pointer-events-auto">
                      <button
                        onClick={() => { onLocalFiltersChange({ ...localFilters, paper: 'all' }); setIsPaperDropdownOpen(false); }}
                        className={`w-full text-left px-4 py-2.5 text-sm font-medium flex items-center justify-between gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${localFilters.paper === 'all' ? 'text-scholar-600 dark:text-scholar-400' : 'text-gray-700 dark:text-gray-200'}`}
                      >
                        All Papers ({uniquePapers.length})
                      </button>
                      {uniquePapers.map(p => (
                        <button
                          key={p.id}
                          onClick={() => { onLocalFiltersChange({ ...localFilters, paper: p.id }); setIsPaperDropdownOpen(false); }}
                          className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${localFilters.paper === p.id ? 'text-scholar-600 dark:text-scholar-400' : 'text-gray-700 dark:text-gray-200'}`}
                        >
                          <span className="text-sm font-medium truncate" title={p.title}>{truncateWords(p.title, 11)}</span>
                          {p.noteCount > 0 && (
                            <span className="flex-shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-[10px] font-black flex items-center justify-center">
                              {p.noteCount}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Query Filter */}
            <div className="space-y-2">
              <label className="text-[10px] sm:text-[11px] font-black text-gray-400 dark:text-scholar-400 uppercase tracking-widest pl-1">Queries</label>
              <div className="relative" style={{ overflow: 'visible' }}>
                <button
                  onClick={() => { setIsQueryDropdownOpen(!isQueryDropdownOpen); setIsPaperDropdownOpen(false); }}
                  className="w-full bg-white/80 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800 rounded-xl px-4 py-2.5 text-sm text-left text-gray-900 dark:text-white outline-none shadow-sm transition-all flex items-center justify-between gap-2 hover:border-gray-200 dark:hover:border-gray-700"
                >
                  <span className="truncate text-sm" title={localFilters.query !== 'all' ? localFilters.query : undefined}>
                    {localFilters.query === 'all'
                      ? `All Queries (${uniqueQueries.length})`
                      : truncateWords(localFilters.query, 11)
                    }
                  </span>
                  <ChevronDown size={14} className={`flex-shrink-0 text-gray-400 transition-transform duration-200 ${isQueryDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                {isQueryDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsQueryDropdownOpen(false)} />
                    <div className="absolute left-0 top-full mt-1 w-full min-w-[380px] max-h-60 overflow-y-auto custom-scrollbar bg-white dark:bg-dark-card rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 py-1.5 z-50 animate-fade-in pointer-events-auto">
                      <button
                        onClick={() => { onLocalFiltersChange({ ...localFilters, query: 'all' }); setIsQueryDropdownOpen(false); }}
                        className={`w-full text-left px-4 py-2.5 text-sm font-medium flex items-center justify-between gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${localFilters.query === 'all' ? 'text-scholar-600 dark:text-scholar-400' : 'text-gray-700 dark:text-gray-200'}`}
                      >
                        All Queries ({uniqueQueries.length})
                      </button>
                      {uniqueQueries.map(({ query, noteCount }) => (
                        <button
                          key={query}
                          onClick={() => { onLocalFiltersChange({ ...localFilters, query }); setIsQueryDropdownOpen(false); }}
                          className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${
                            localFilters.query === query
                              ? 'text-scholar-600 dark:text-scholar-400'
                              : noteCount === 0
                                ? 'text-gray-400 dark:text-gray-500'
                                : 'text-gray-700 dark:text-gray-200'
                          }`}
                        >
                          <span className="text-sm font-medium truncate" title={query}>{truncateWords(query, 11)}</span>
                          {noteCount > 0 && (
                            <span className="flex-shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-[10px] font-black flex items-center justify-center">
                              {noteCount}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Refine — hidden entirely in most-relevant-notes view */}
            {sortBy !== 'most-relevant-notes' && (
              <div className="space-y-2">
                <label className="text-[10px] sm:text-[11px] font-black text-gray-400 dark:text-scholar-400 uppercase tracking-widest pl-1">Refine</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => onLocalFiltersChange({ ...localFilters, hasNotes: !localFilters.hasNotes })}
                    className={`flex-1 px-3 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${localFilters.hasNotes
                      ? 'bg-scholar-600 text-white shadow-md'
                      : 'bg-white/80 dark:bg-gray-900/50 text-gray-600 dark:text-gray-300 border border-gray-100 dark:border-gray-800'
                      }`}
                  >
                    With Notes
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end mt-2">
            <button
            onClick={handleResetFilters}
            className="text-[12px] font-black text-scholar-600 dark:text-scholar-400 hover:text-scholar-800 dark:hover:text-scholar-300 uppercase tracking-widest transition-all hover:underline"
          >
            Reset Filters
          </button>
          </div>
        </div>
      )}

      {/* ── Main Results ─────────────────────────────────────────────────────── */}
      <div className={`space-y-6 transition-all duration-500 ${isBlurred ? 'blur-sm opacity-75 pointer-events-none select-none' : 'blur-0 opacity-100'}`}>

        {/* Results count + stop button */}
        {!isBlurred && currentTabCandidates.length > 0 && (
          <div className="flex items-center justify-between px-1 mb-2 animate-fade-in">
            <div className="text-sm text-gray-500 dark:text-gray-400 font-medium flex items-center gap-2">

              {isFiltered ? (
                // FILTERED: "3 papers with 18 notes"
                <span>
                  {filteredPapers.length} paper{filteredPapers.length !== 1 ? 's' : ''} with {totalNotes} note{totalNotes !== 1 ? 's' : ''}
                </span>
              ) : (
                // UNFILTERED: "17 papers ● 5 papers with 83 notes"
                <>
                  <span>{currentTabCandidates.length} paper{currentTabCandidates.length !== 1 ? 's' : ''}</span>
                  {totalNotes > 0 && (
                    <>
                      <span className="text-gray-300 dark:text-gray-600">●</span>
                      <span>{papersWithNotes} paper{papersWithNotes !== 1 ? 's' : ''} with {totalNotes} note{totalNotes !== 1 ? 's' : ''}</span>
                    </>
                  )}
                </>
              )}

              {timeToFirstNotes !== null && (
                <>
                  <span className="text-gray-300 dark:text-gray-600">●</span>
                  <span className="text-gray-500 dark:text-gray-600">{formatDuration(timeToFirstNotes)}</span>
                </>
              )}

            </div>
            {(['initialising', 'searching', 'filtering', 'extracting'].includes(researchPhase)) && (
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

        {/* Empty state — no filter results */}
        {!isBlurred && currentTabCandidates.length > 0 && filteredPapers.length === 0 && (
          <div className="py-16 flex flex-col items-center justify-center text-center opacity-60 animate-fade-in">
            <TextSearch size={48} className="mb-4 text-gray-300 dark:text-gray-600" />
            <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-2">No papers match your filters</h3>
            <p className="text-xs max-w-xs leading-relaxed text-gray-500 dark:text-gray-400 mb-4">Try adjusting your search or filter criteria</p>
            <button onClick={handleResetFilters} className="text-xs font-medium text-scholar-600 dark:text-scholar-400 hover:underline">
              Reset all filters
            </button>
          </div>
        )}


        {/* ✅ TOP 5 INSIGHTS RANKING STATUS - Show above notes during ranking */}
        {researchPhase === 'ranking_notes' && (
          <div className="flex items-center justify-center gap-3 py-4 mb-6 animate-fade-in">
            <Loader2 size={20} className="animate-spin text-scholar-600 dark:text-scholar-400" />
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              {status || "Analyzing top 5 insights..."}
            </span>
          </div>
        )}

        {/* ✅ TOP 5 SQUARE CARDS - Horizontal row at top - NOW SHOWS IN ALL VIEWS */}
        {top5Notes.length > 0 && (
          <Top5SquareCards
            topNotes={top5Notes}
            topNoteIds={topNoteIds}
            onSelectNote={onSelectNote}
            onScrollToNote={handleHighlightNote}
          />
        )}

        {/* ✅ NEW: Show single expanded note below square cards in PAPER VIEWS ONLY */}
        {sortBy !== 'most-relevant-notes' && clickedSquareNoteId && top5Notes.length > 0 && (() => {
          // Find the clicked note from top5Notes
          const clickedNote = top5Notes.find(n => n.uniqueId === clickedSquareNoteId);

          if (!clickedNote) return null;

          return (
            <div className="mb-8 animate-fade-in">
              {/* Visual separator */}
              <div className="h-px bg-gray-200 dark:bg-gray-700 mb-6"></div>

              {/* Title above expanded note */}
              <div className="flex items-center gap-2 mb-4">
                <Sparkles size={16} className="text-scholar-600 dark:text-scholar-400" />
                <h4 className="text-sm font-bold uppercase tracking-wider text-scholar-700 dark:text-scholar-400">
                  Selected Insight Details
                </h4>
              </div>

              {/* Single expanded note */}
              <ResearchCardNote
                id={clickedNote.uniqueId}
                note={clickedNote}
                isSelected={selectedNoteIds.includes(clickedNote.uniqueId)}
                onSelect={() => onSelectNote(clickedNote.uniqueId)}
                sourceTitle={clickedNote.sourcePaper?.title}
                sourcePaper={clickedNote.sourcePaper}
                showScore={true}
                isTop5={true}
                topNoteIds={topNoteIds}
                isExpanded={true}
                onToggleExpand={() => setClickedSquareNoteId(null)}
              />

              {/* Visual separator */}
              <div className="h-px bg-gray-200 dark:bg-gray-700 mt-6"></div>
            </div>
          );
        })()}

        {/* Paper results */}
        <div className={sortBy === 'most-relevant-notes' ? "space-y-4 transition-all duration-300" : "space-y-8 transition-all duration-300"}>
          {sortBy === 'most-relevant-notes' ? (
            (paginatedContent as any[]).filter((note: any) => (note?.quote || '').trim().length > 0).map((note) => {
              const isHighlighted = highlightedNoteId === note.uniqueId;
              const isExpanded = expandedNoteId === note.uniqueId;
              return (
                <div
                  key={note.uniqueId}
                  data-note-id={note.uniqueId}
                  className={`transition-all duration-500 ${isHighlighted ? 'ring-2 ring-scholar-500 rounded-xl' : ''
                    }`}
                >
                  <ResearchCardNote
                    id={note.uniqueId}
                    note={note}
                    isSelected={selectedNoteIds.includes(note.uniqueId)}
                    onSelect={() => onSelectNote(note.uniqueId)}
                    sourceTitle={note.sourcePaper.title}
                    sourcePaper={note.sourcePaper}
                    showScore={true}
                    isTop5={topNoteIds.includes(note.uniqueId)}
                    topNoteIds={topNoteIds}
                    isExpanded={isExpanded}
                    onToggleExpand={() => setExpandedNoteId(
                      expandedNoteId === note.uniqueId ? null : note.uniqueId
                    )}
                  />
                </div>
              );
            })
          ) : (
            (paginatedContent as ArxivPaper[]).map((paper) => (
              <PaperCard
                key={paper.id}
                paper={paper}
                selectedNoteIds={selectedNoteIds}
                onSelectNote={onSelectNote}
                forceExpanded={allNotesExpanded}
                onView={() => handleViewPdf(paper)}
                isLocal={false}
                activeQuery={localFilters.query}
              />
            ))
          )}
        </div>

        {/* Empty state — idle */}
        {currentTabCandidates.length === 0 && researchPhase === 'idle' && (
          <div className="py-24 flex flex-col items-center justify-center text-center opacity-40">
            <BookOpenText size={64} className="mb-6 text-gray-300 dark:text-gray-600" />
            <h3 className="text-xl font-bold text-gray-800 dark:text-white">No deep research results</h3>
            <p className="text-xs max-w-xs leading-relaxed text-gray-500 dark:text-gray-400">Enter topics in the search bar to find academic papers.</p>
          </div>
        )}

        {/* Pagination */}
        {!isBlurred && totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-8 mt-12 sm:mt-16 mb-12 pagination-controls border-t border-gray-100 dark:border-gray-800 pt-8">
            <div className="flex items-center gap-4">
              <button
                onClick={() => { onCurrentPageChange(Math.max(1, currentPage - 1)); }}
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
                onClick={() => { onCurrentPageChange(Math.min(totalPages, currentPage + 1)); document.getElementById('research-scroll-container')?.scrollTo({ top: 0, behavior: 'smooth' }); }}
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

      {/* ── DYNAMIC LOADING BOX (Phases: initialising, searching, filtering, downloading) ──── */}
      {/* Hide when ResearchPurposeModal is showing */}
      {!showPurposeModal && (researchPhase === 'initialising' ||
        researchPhase === 'searching' ||
        researchPhase === 'filtering' ||
        researchPhase === 'downloading' ||
        researchPhase === 'reviewing_insights') && (
          <>
            {console.log('[DeepSearch] 📦 RENDERING DynamicLoadingBox', { showPurposeModal, researchPhase })}
            <DynamicLoadingBox
              researchPhase={researchPhase}
              paperData={paperDataList}
              gatheringStatus={status}
              paperCount={filteredCandidates.length} // NEW: Pass total filtered papers count
              insightQuestions={insightQuestions}
              selectedQuestions={selectedInsightQuestions}
              onToggleQuestion={toggleInsightQuestion}
              onUpdateQuestion={updateInsightQuestion}
              onAddQuestion={addInsightQuestion}
              onProceed={resolveInsights}
              hasSubmittedInsights={hasSubmittedInsights}
            />
          </>
        )}

      {/* ── RESEARCH PURPOSE MODAL (Non-blocking overlay) ────────────────── */}
      {showPurposeModal && (
        <>
          {console.log('[DeepSearch] 🎯 RENDERING ResearchPurposeModal', { showPurposeModal, researchPurpose })}
          <ResearchPurposeModal
            initialValue={researchPurpose}
            onSubmit={submitResearchPurpose}
            onSkip={skipResearchPurpose}
          />
        </>
      )}
    </>
  );
};
