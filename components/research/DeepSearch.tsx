import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ArxivPaper } from '../../types';
import { useResearch } from '../../contexts/ResearchContext';
import { useLibrary } from '../../contexts/LibraryContext';
import { useUI } from '../../contexts/UIContext';
import { DynamicLoadingBox } from './DynamicLoadingBox';
import { ResearchPurposeModal } from './ResearchPurposeModal';
import { ResearchCardNote } from './ResearchCardNote';
import { Top5SquareCards } from './Top5SquareCards';
import { PaperCard } from './PaperCard';
import { DeepSearchToolbar } from './DeepSearchToolbar';
import { DeepSearchFilterPanel } from './DeepSearchFilterPanel';
import { SortOption, ITEMS_PER_PAGE, getSafeTimestamp, normalizeText, formatDuration } from './deepSearchUtils';
import {
  Loader2,
  BookOpenText,
  Sparkles,
  Square,
  ChevronLeft,
  ChevronRight,
  TextSearch,
  X,
} from 'lucide-react';

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

  const { loadPdfFromUrl, setActivePdf } = useLibrary();
  const { openColumn, setColumnVisibility } = useUI();

  // ─── Local Sort State ─────────────────────────────────────────────────────────
  const [sortBy, setSortBy] = useState<SortOption>('relevant-papers');
  const [isSortOpen, setIsSortOpen] = useState(false);

  // ✅ Track which note from Top 5 should be highlighted/expanded (only one at a time)
  const [highlightedNoteId, setHighlightedNoteId] = useState<string | null>(null);
  const highlightTimerRef = useRef<NodeJS.Timeout | null>(null);

  // ✅ Control which single note is expanded (only one at a time)
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);

  // ✅ Track which Top 5 note was clicked to move it to position 0
  const [clickedTopNoteId, setClickedTopNoteId] = useState<string | null>(null);

  // ✅ Track which square card was clicked (for showing single note below squares in paper views)
  const [clickedSquareNoteId, setClickedSquareNoteId] = useState<string | null>(null);

  // Define setters to match expected handler names (minimizes diff)
  const onSelectedNoteIdsChange = setSelectedNoteIds;
  const onSearchQueryChange = setSearchQuery;
  const onLocalFiltersChange = setLocalFilters;
  const onCurrentPageChange = setCurrentPage;
  const onSelectMenuOpenChange = setIsSelectMenuOpen;
  const onNoteSelectMenuOpenChange = setIsNoteSelectMenuOpen;

  const {
    researchPhase,
    filteredCandidates,
    arxivCandidates,
    topFilteredPapers,
    selectedArxivIds,
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
    showPurposeModal,
    status,
    topNoteIds,
    hasRankedOnce,
    rankTopNotes
  } = useResearch();


  // ─── Helper: Status Priority for Sorting ──────────────────────────────────────
  const getStatusPriority = (paper: ArxivPaper): number => {
    const status = paper.analysisStatus;
    const hasNotes = (paper.notes?.length || 0) > 0;

    if (status === 'completed' && hasNotes) return 7;
    if (status === 'extracting') return 6;
    if (status === 'downloaded') return 5;
    if (status === 'downloading') return 4;
    if (status === 'processing') return 4;
    if (status === 'completed' && !hasNotes) return 3;
    if (status === 'stopped') return 2;
    if (status === 'pending') return 1;
    if (status === 'failed') return 0;
    return 4;
  };

  // Determine candidates based on research phase
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
            const fullQuoteHash = String(note.quote || '')
              .replace(/[|\/\\]/g, '_')
              .substring(0, 60);
            const actualIndex = (paper.notes || []).findIndex((n: any) =>
              n.quote === note.quote && n.pageNumber === note.pageNumber
            );
            const uniqueId = actualIndex >= 0
              ? `${paper.id}|p${note.pageNumber}|i${actualIndex}|${fullQuoteHash}`
              : `${paper.id}|p${note.pageNumber}|i${filterIdx}|${fullQuoteHash}`;
            return { ...note, sourcePaper: paper, sourceId: paper.id, uniqueId };
          })
      );

      const seenIds = new Set<string>();
      const uniqueAllNotes = allNotes.filter(note => {
        if (seenIds.has(note.uniqueId)) return false;
        seenIds.add(note.uniqueId);
        return true;
      });

      const sorted = uniqueAllNotes.sort((a, b) => {
        const priorityDiff = getStatusPriority(b.sourcePaper) - getStatusPriority(a.sourcePaper);
        if (priorityDiff !== 0) return priorityDiff;
        return (b.relevanceScore || 0) - (a.relevanceScore || 0);
      });

      if (topNoteIds && topNoteIds.length > 0) {
        const topOnes = uniqueAllNotes
          .filter(n => topNoteIds.includes(n.uniqueId))
          .sort((a, b) => topNoteIds.indexOf(a.uniqueId) - topNoteIds.indexOf(b.uniqueId));

        if (clickedTopNoteId && topOnes.some(n => n.uniqueId === clickedTopNoteId)) {
          const clickedNote = topOnes.find(n => n.uniqueId === clickedTopNoteId)!;
          const otherTopNotes = topOnes.filter(n => n.uniqueId !== clickedTopNoteId);
          const finalTopOnes = [clickedNote, ...otherTopNotes];
          const remaining = uniqueAllNotes.filter(n => !topNoteIds.includes(n.uniqueId));
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
      return [...filteredPapers].sort((a, b) => {
        const priorityDiff = getStatusPriority(b) - getStatusPriority(a);
        if (priorityDiff !== 0) return priorityDiff;
        return (b.notes?.length || 0) - (a.notes?.length || 0);
      });
    }
  }, [filteredPapers, sortBy, localFilters.query, topNoteIds, clickedTopNoteId]);

  const handleBulkCopyNotes = useCallback((mode: 'raw' | 'full') => {
    if (selectedNoteIds.length === 0) return;
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

  // Reset sort view and pagination to default when new research starts
  useEffect(() => {
    if (researchPhase === 'initialising') {
      setSortBy('relevant-papers');
      setCurrentPage(1);
    }
  }, [researchPhase]);

  // Reset to page 1 when filters or search query change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, localFilters]);

  const paperDataList = useMemo(() => {
    if (researchPhase === 'filtering') {
      return topFilteredPapers;
    } else if (researchPhase === 'searching') {
      return arxivCandidates.slice(0, 10).map(p => ({
        title: p.title,
        relevanceScore: p.relevanceScore || 0
      }));
    }
    return [];
  }, [topFilteredPapers, arxivCandidates, researchPhase]);

  const handleViewPdf = useCallback((paper: ArxivPaper) => {
    setActivePdf(paper.pdfUri);
    setColumnVisibility(prev => ({ ...prev, left: false, right: true }));
    loadPdfFromUrl(paper.pdfUri, paper.title, paper.authors.join(', ')).then((result: any) => {
      if (!result.success && result.error) {
        setActivePdf(null);
      }
    });
  }, [setActivePdf, openColumn, loadPdfFromUrl]);

  const isBlurred = useMemo(() => {
    if (researchPhase === 'filtering') return true;
    if (researchPhase === 'reviewing_insights') return true;
    if (researchPhase === 'downloading') {
      if (filteredCandidates.length === 0) return true;
      const papersWithData = filteredCandidates.filter(p =>
        (p.analysisStatus === 'downloaded' || p.analysisStatus === 'extracting' || p.analysisStatus === 'completed') &&
        (p.previewImage || p.analysisStatus === 'failed')
      ).length;
      const allDownloadsComplete = filteredCandidates.every(p =>
        p.analysisStatus === 'downloaded' || p.analysisStatus === 'extracting' ||
        p.analysisStatus === 'completed' || p.analysisStatus === 'failed' || p.analysisStatus === 'stopped'
      );
      return papersWithData < 15 && !allDownloadsComplete;
    }
    if (researchPhase === 'downloaded' || researchPhase === 'extracting') {
      const extractingCount = filteredCandidates.filter(p => p.analysisStatus === 'extracting').length;
      return extractingCount === 0;
    }
    return false;
  }, [researchPhase, filteredCandidates]);

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

  const handleHighlightNote = useCallback((noteId: string) => {
    if (highlightTimerRef.current) {
      clearTimeout(highlightTimerRef.current);
    }
    if (sortBy === 'most-relevant-notes') {
      setClickedSquareNoteId(null);
      setClickedTopNoteId(noteId);
      setExpandedNoteId(noteId);
      setHighlightedNoteId(noteId);
      if (currentPage !== 1) { setCurrentPage(1); }
      highlightTimerRef.current = setTimeout(() => {
        setHighlightedNoteId(null);
        highlightTimerRef.current = null;
      }, 3000);
    } else {
      setClickedTopNoteId(null);
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
    if (topNoteIds.length === 0) return [];
    const uniqueTopNoteIds = Array.from(new Set(topNoteIds)).slice(0, 5);
    const seenIds = new Set<string>();
    const allNotes = filteredCandidates.flatMap(paper =>
      (paper.notes || [])
        .filter(note => (note?.quote || '').trim().length > 0)
        .map((note, noteIdx) => {
          const quoteHash = String(note.quote).substring(0, 60).replace(/[|\/\\]/g, '_');
          const uniqueId = `${paper.id}|p${note.pageNumber}|i${noteIdx}|${quoteHash}`;
          return { ...note, uniqueId, sourcePaper: paper, sourceId: paper.id };
        })
    );
    return allNotes
      .filter(note => {
        if (!uniqueTopNoteIds.includes(note.uniqueId)) return false;
        if (seenIds.has(note.uniqueId)) return false;
        seenIds.add(note.uniqueId);
        return true;
      })
      .sort((a, b) => uniqueTopNoteIds.indexOf(a.uniqueId) - uniqueTopNoteIds.indexOf(b.uniqueId));
  }, [topNoteIds, filteredCandidates, sortBy]);

  // ─── Selection Actions ────────────────────────────────────────────────────────
  const { selectAllArxivPapers, clearArxivSelection } = useResearch();

  const handleSelectPage = useCallback(() => {
    const pagePaperIds = sortBy === 'most-relevant-notes'
      ? Array.from(new Set(paginatedContent.map(n => (n as any).sourcePaper).filter(p => p.analysisStatus !== 'failed').map(p => p.id)))
      : (paginatedContent as ArxivPaper[]).filter(p => p.analysisStatus !== 'failed').map(p => p.id);
    const allPageSelected = (pagePaperIds as string[]).every(id => selectedArxivIds.has(id));
    if (allPageSelected) {
      const currentSelection = Array.from(selectedArxivIds) as string[];
      selectAllArxivPapers(currentSelection.filter(id => !(pagePaperIds as string[]).includes(id)));
    } else {
      const currentSelection = Array.from(selectedArxivIds) as string[];
      selectAllArxivPapers(Array.from(new Set([...currentSelection, ...(pagePaperIds as string[])])));
    }
    onSelectMenuOpenChange(false);
  }, [paginatedContent, selectedArxivIds, sortBy, selectAllArxivPapers, onSelectMenuOpenChange]);

  const handleSelectAllTotal = useCallback(() => {
    const selectableContent = sortBy === 'most-relevant-notes'
      ? content.filter(n => (n as any).sourcePaper.analysisStatus !== 'failed').map(n => (n as any).sourcePaper.id)
      : (content as ArxivPaper[]).filter(p => p.analysisStatus !== 'failed').map(p => p.id);
    selectAllArxivPapers(Array.from(new Set(selectableContent)));
    onSelectMenuOpenChange(false);
  }, [content, sortBy, selectAllArxivPapers, onSelectMenuOpenChange]);

  const handleSelectNotesPage = useCallback(() => {
    if (sortBy !== 'most-relevant-notes') return;
    const pageNoteIds = (paginatedContent as any[]).filter((note: any) => (note?.quote || '').trim().length > 0).map((note: any) => note.uniqueId);
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
    const allNoteIds = (content as any[]).filter((note: any) => (note?.quote || '').trim().length > 0).map((note: any) => note.uniqueId);
    const allSelected = allNoteIds.every(id => selectedNoteIds.includes(id));
    if (allSelected) { onSelectedNoteIdsChange([]); } else { onSelectedNoteIdsChange(allNoteIds); }
    onNoteSelectMenuOpenChange(false);
  }, [content, selectedNoteIds, sortBy, onSelectedNoteIdsChange, onNoteSelectMenuOpenChange]);

  // ─── Dropdown options ──────────────────────────────────────────────────────────
  const uniquePapers = useMemo(() => {
    let base = [...currentTabCandidates];
    if (searchQuery.trim()) {
      const q = normalizeText(searchQuery);
      base = base.filter(paper =>
        normalizeText(paper.title).includes(q) || normalizeText(paper.summary ?? '').includes(q) ||
        paper.notes?.some(note => normalizeText(note.quote).includes(q) || normalizeText(note.justification ?? '').includes(q))
      );
    }
    if (localFilters.query !== 'all') { base = base.filter(p => p.notes?.some(note => note.relatedQuestion === localFilters.query)); }
    if (localFilters.hasNotes) { base = base.filter(p => p.notes && p.notes.length > 0); }
    return base.map(p => ({
      id: p.id, title: p.title,
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
        normalizeText(paper.title).includes(q) || normalizeText(paper.summary ?? '').includes(q) ||
        paper.notes?.some(note => normalizeText(note.quote).includes(q) || normalizeText(note.justification ?? '').includes(q))
      );
    }
    if (localFilters.paper !== 'all') { base = base.filter(p => p.id === localFilters.paper); }
    if (localFilters.hasNotes) { base = base.filter(p => p.notes && p.notes.length > 0); }
    const queryMap = new Map<string, number>();
    base.forEach(paper => {
      (paper.notes || []).forEach(note => {
        if (note.relatedQuestion) {
          if (!queryMap.has(note.relatedQuestion)) { queryMap.set(note.relatedQuestion, 0); }
          if ((note.quote || '').trim().length > 0) { queryMap.set(note.relatedQuestion, (queryMap.get(note.relatedQuestion) || 0) + 1); }
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
      return new Set((paginatedContent as any[]).map(n => (n as any).sourcePaper).filter(p => p.analysisStatus !== 'failed').map(p => p.id)).size;
    }
    return (paginatedContent as ArxivPaper[]).filter(p => p.analysisStatus !== 'failed').length;
  }, [paginatedContent, sortBy]);

  const selectableTotalCount = useMemo(() => {
    if (sortBy === 'most-relevant-notes') {
      return new Set((content as any[]).map(n => (n as any).sourcePaper).filter(p => p.analysisStatus !== 'failed').map(p => p.id)).size;
    }
    return (content as ArxivPaper[]).filter(p => p.analysisStatus !== 'failed').length;
  }, [content, sortBy]);

  const selectableNotesPageCount = useMemo(() => {
    if (sortBy !== 'most-relevant-notes') return 0;
    return (paginatedContent as any[]).filter((note: any) => (note?.quote || '').trim().length > 0).length;
  }, [paginatedContent, sortBy]);

  const selectableNotesTotalCount = useMemo(() => {
    return filteredCandidates.flatMap(paper => (paper.notes || []).filter(note => (note?.quote || '').trim().length > 0)).length;
  }, [filteredCandidates]);

  const handleResetFilters = useCallback(() => {
    onSearchQueryChange('');
    onLocalFiltersChange({ paper: 'all', query: 'all', hasNotes: false });
  }, [onSearchQueryChange, onLocalFiltersChange]);

  // ─── Derived booleans for toolbar ──────────────────────────────────────────────
  const hasAnyNotes = currentTabCandidates.some(p => (p.notes?.length || 0) > 0);
  const isFilterActive = !!(searchQuery.trim() || localFilters.paper !== 'all' || localFilters.query !== 'all' || localFilters.hasNotes);

  return (
    <>
      {/* ── Toolbar (Selection, Bulk Copy, Sort, Filters, Collapse) ────────── */}
      {!isBlurred && (currentTabCandidates.length > 0 || totalNotes > 0) && (
        <DeepSearchToolbar
          sortBy={sortBy}
          setSortBy={setSortBy}
          isSortOpen={isSortOpen}
          setIsSortOpen={setIsSortOpen}
          showFilters={showFilters}
          setShowFilters={setShowFilters}
          allNotesExpanded={allNotesExpanded}
          setAllNotesExpanded={setAllNotesExpanded}
          selectedArxivIds={selectedArxivIds}
          selectedNoteIds={selectedNoteIds}
          isSelectMenuOpen={isSelectMenuOpen}
          setIsSelectMenuOpen={setIsSelectMenuOpen}
          isNoteSelectMenuOpen={isNoteSelectMenuOpen}
          setIsNoteSelectMenuOpen={setIsNoteSelectMenuOpen}
          showBulkCopyMenu={showBulkCopyMenu}
          setShowBulkCopyMenu={setShowBulkCopyMenu}
          justCopiedNotes={justCopiedNotes}
          selectablePapersCount={selectablePapersCount}
          selectableTotalCount={selectableTotalCount}
          selectableNotesPageCount={selectableNotesPageCount}
          selectableNotesTotalCount={selectableNotesTotalCount}
          contentLength={content.length}
          hasAnyNotes={hasAnyNotes}
          isFilterActive={isFilterActive}
          researchPhase={researchPhase}
          hasRankedOnce={hasRankedOnce}
          topNoteIds={topNoteIds}
          onSelectPage={handleSelectPage}
          onSelectAllTotal={handleSelectAllTotal}
          onSelectNotesPage={handleSelectNotesPage}
          onSelectAllNotes={handleSelectAllNotes}
          onClearSelection={() => { clearArxivSelection(); setIsSelectMenuOpen(false); }}
          onClearSelectedNotes={() => { setSelectedNoteIds([]); setIsNoteSelectMenuOpen(false); }}
          onBulkCopyNotes={handleBulkCopyNotes}
          onShowClearModal={onShowClearModal}
          onSetCurrentPage={setCurrentPage}
          rankTopNotes={rankTopNotes}
        />
      )}

      {/* ── Filter Panel ────────────────────────────────────────────────────── */}
      {showFilters && !isBlurred && (
        <DeepSearchFilterPanel
          sortBy={sortBy}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          localFilters={localFilters}
          setLocalFilters={setLocalFilters}
          uniquePapers={uniquePapers}
          uniqueQueries={uniqueQueries}
          onClose={() => setShowFilters(false)}
          onReset={handleResetFilters}
        />
      )}

      {/* ── Main Results ─────────────────────────────────────────────────────── */}
      <div className={`space-y-6 transition-all duration-500 ${isBlurred ? 'blur-sm opacity-75 pointer-events-none select-none' : 'blur-0 opacity-100'}`}>

        {/* Results count + stop button */}
        {!isBlurred && currentTabCandidates.length > 0 && (
          <div className="flex items-center justify-between px-1 mb-2 animate-fade-in">
            <div className="text-sm text-gray-500 dark:text-gray-400 font-medium flex items-center gap-2">
              {isFiltered ? (
                <span>{filteredPapers.length} paper{filteredPapers.length !== 1 ? 's' : ''} with {totalNotes} note{totalNotes !== 1 ? 's' : ''}</span>
              ) : (
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

        {/* ✅ TOP 5 INSIGHTS RANKING STATUS */}
        {researchPhase === 'ranking_notes' && (
          <div className="flex items-center justify-center gap-3 py-4 mb-6 animate-fade-in">
            <Loader2 size={20} className="animate-spin text-scholar-600 dark:text-scholar-400" />
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              {status || "Analyzing top 5 insights..."}
            </span>
          </div>
        )}

        {/* ✅ TOP 5 SQUARE CARDS */}
        {top5Notes.length > 0 && (
          <Top5SquareCards
            topNotes={top5Notes}
            topNoteIds={topNoteIds}
            onSelectNote={onSelectNote}
            onScrollToNote={handleHighlightNote}
          />
        )}

        {/* ✅ Show single expanded note below square cards in PAPER VIEWS ONLY */}
        {sortBy !== 'most-relevant-notes' && clickedSquareNoteId && top5Notes.length > 0 && (() => {
          const clickedNote = top5Notes.find(n => n.uniqueId === clickedSquareNoteId);
          if (!clickedNote) return null;
          return (
            <div className="mb-8 animate-fade-in">
              <div className="h-px bg-gray-200 dark:bg-gray-700 mb-6"></div>
              <div className="flex items-center gap-2 mb-4">
                <Sparkles size={16} className="text-scholar-600 dark:text-scholar-400" />
                <h4 className="text-sm font-bold uppercase tracking-wider text-scholar-700 dark:text-scholar-400">
                  Selected Insight Details
                </h4>
              </div>
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
                  className={`transition-all duration-500 ${isHighlighted ? 'ring-2 ring-scholar-500 rounded-xl' : ''}`}
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
                    onToggleExpand={() => setExpandedNoteId(expandedNoteId === note.uniqueId ? null : note.uniqueId)}
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

      {/* ── DYNAMIC LOADING BOX ──── */}
      {!showPurposeModal && (researchPhase === 'initialising' ||
        researchPhase === 'searching' ||
        researchPhase === 'filtering' ||
        researchPhase === 'downloading' ||
        researchPhase === 'reviewing_insights') && (
          <DynamicLoadingBox
            researchPhase={researchPhase}
            paperData={paperDataList}
            gatheringStatus={status}
            paperCount={filteredCandidates.length}
            insightQuestions={insightQuestions}
            selectedQuestions={selectedInsightQuestions}
            onToggleQuestion={toggleInsightQuestion}
            onUpdateQuestion={updateInsightQuestion}
            onAddQuestion={addInsightQuestion}
            onProceed={resolveInsights}
            hasSubmittedInsights={hasSubmittedInsights}
          />
        )}

      {/* ── RESEARCH PURPOSE MODAL (Non-blocking overlay) ────────────────── */}
      {showPurposeModal && (
        <ResearchPurposeModal
          initialValue={researchPurpose}
          onSubmit={submitResearchPurpose}
          onSkip={skipResearchPurpose}
        />
      )}
    </>
  );
};
