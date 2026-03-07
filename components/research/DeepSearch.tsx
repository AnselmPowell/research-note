import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ArxivPaper, DeepResearchNote } from '../../types';
import { useResearch } from '../../contexts/ResearchContext';
import { useLibrary } from '../../contexts/LibraryContext';
import { useUI } from '../../contexts/UIContext';
import { useDatabase } from '../../database/DatabaseContext';
import { DynamicLoadingBox } from './DynamicLoadingBox';
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
  const [isExpanded, setIsExpanded] = useState(true);
  const [isAbstractExpanded, setIsAbstractExpanded] = useState(false);
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
    if (visibleNotes.length > 0) {
      setIsExpanded(forceExpanded);
    }
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
      openUIColumn('right');
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
    openUIColumn('left');
  };


  return (
    <div className="group/paper animate-fade-in relative transition-colors">
      <div className={isExpanded ? 'p-1' : ''}>
        <div className="flex items-start">
          <div className="pt-1 mr-2 sm:mr-4">
            <button onClick={handleSelectionToggle} className={`hover:text-scholar-600 dark:hover:text-scholar-400 transition-colors opacity-100 sm:group-hover/paper:opacity-100 ${isSelected ? 'text-scholar-600 dark:text-scholar-400' : 'text-gray-400 dark:text-gray-500 sm:opacity-0'}`}>
              {(isDownloading || isProcessing) ? <Loader2 size={24} className="animate-spin" />
                : isSelected ? <Check size={24} className="text-scholar-600 dark:text-scholar-400" /> : <Square size={24} />}
            </button>
          </div>

          <div className="flex-grow min-w-0">
            <div className="flex items-center justify-between mb-1">
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

            <h3 className="text-base sm:text-2xl font-bold text-gray-900 dark:text-gray-100 leading-snug mb-1 cursor-pointer hover:text-scholar-600 dark:hover:text-scholar-400 transition-colors" onClick={handleOpenPdf}>
              {paper.title}
            </h3>

            {paper.harvardReference && (
              <p className="text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 font-serif italic mb-2 leading-tight">
                {paper.harvardReference}
              </p>
            )}

            <p
              role="button"
              aria-expanded={isAbstractExpanded}
              onClick={(e) => { e.stopPropagation(); setIsAbstractExpanded(prev => !prev); }}
              className={`text-sm text-gray-600 dark:text-gray-300 leading-relaxed ${isAbstractExpanded ? '' : 'line-clamp-2'} mb-3 cursor-pointer`}
            >
              {paper.summary}
              {isAbstractExpanded && (
                <span className="inline-flex items-center dark:text-scholar-400 ml-2 pt-3 text-gray-500 hover:text-gray-700" aria-hidden="true">
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
                  <span className="text-xs text-gray-400 italic">No notes extracted</span>
                ) : isStopped ? (
                  <span className="text-xs text-gray-400 italic flex items-center gap-1"><Square size={12} /> stopped</span>
                ) : isFailed ? (
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-red-700 dark:text-red-400">
                    <X size={14} className="text-red-800 dark:text-red-500 flex-shrink-0" />
                    <span className="truncate">
                      {failedUrlErrors?.[paper.pdfUri]?.reason || "Load Failed"}: {failedUrlErrors?.[paper.pdfUri]?.actionableMsg || "Could not access file."}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs font-medium text-scholar-600 dark:text-scholar-400">
                    <Check size={12} className="text-success-600" />
                    <span>Ready to analyze</span>
                  </div>
                )}
              </div>
            </div>

            {isExpanded && visibleNotes.length > 0 && (
              <div className="mt-4 pl-0 sm:pl-4 border-l-0 sm:border-l-2 border-gray-100 dark:border-gray-800 space-y-3">
                {visibleNotes.map((note, idx) => {
                  const noteId = getNoteId(paper.id, note.pageNumber, idx);
                  return <ResearchCardNote key={noteId} id={noteId} note={note} isSelected={selectedNoteIds.includes(noteId)} onSelect={() => onSelectNote(noteId)} sourceTitle={paper.title} sourcePaper={paper} />;
                })}
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

// ─── ResearchCardNote ──────────────────────────────────────────────────────────
const ResearchCardNote: React.FC<{
  id: string;
  note: DeepResearchNote;
  isSelected: boolean;
  onSelect: () => void;
  sourceTitle?: string;
  showScore?: boolean;
  sourcePaper?: ArxivPaper;
}> = React.memo(({ id, note, isSelected, onSelect, sourceTitle, showScore, sourcePaper }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [justCopied, setJustCopied] = useState(false);

  const { toggleContextNote, isNoteInContext, setActiveSearchMode } = useResearch();
  const { isNoteSaved, deleteNote, saveNote, savedNotes } = useDatabase();
  const { setSearchHighlight, loadPdfFromUrl, setActivePdf } = useLibrary();
  const { openColumn: openUIColumn } = useUI();

  const createPaperMetadata = useCallback((
    note: DeepResearchNote,
    sourcePaper?: ArxivPaper,
    sourceTitle?: string
  ) => {
    if (sourcePaper) {
      return {
        uri: sourcePaper.pdfUri,
        pdfUri: sourcePaper.pdfUri,
        title: sourcePaper.title,
        summary: sourcePaper.summary || '',
        authors: sourcePaper.authors || [],
        publishedDate: sourcePaper.publishedDate,
      };
    }
    if ('sourcePaper' in note && (note as any).sourcePaper) {
      const paper = (note as any).sourcePaper as ArxivPaper;
      return {
        uri: paper.pdfUri,
        pdfUri: paper.pdfUri,
        title: paper.title,
        summary: paper.summary || '',
        authors: paper.authors || [],
        publishedDate: paper.publishedDate,
      };
    }
    return {
      uri: note.pdfUri,
      pdfUri: note.pdfUri,
      title: sourceTitle || 'Untitled Paper',
      summary: '',
      authors: [],
      publishedDate: new Date().toISOString(),
    };
  }, []);

  const isInContext = isNoteInContext(note);
  const isSaved = isNoteSaved(note.pdfUri, note.quote);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(note.quote);
    setJustCopied(true);
    setTimeout(() => setJustCopied(false), 2000);
  };

  const handleContextToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleContextNote(note);
  };

  const handleSaveToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    console.log('[Note Card] Save toggle clicked:', { noteUri: note.pdfUri, isSaved, sourceTitle, hasSourcePaper: !!sourcePaper });
    if (isSaved) {
      const savedNote = savedNotes.find(n => n.paper_uri === note.pdfUri && n.content === note.quote);
      if (savedNote && savedNote.id) {
        console.log('[Note Card] Deleting note:', savedNote.id);
        deleteNote(savedNote.id);
      }
    } else {
      console.log('[Note Card] Saving note with complete paper metadata');
      const paperMetadata = createPaperMetadata(note, sourcePaper, sourceTitle);
      console.log('[Note Card] Paper metadata being saved:', paperMetadata);
      saveNote(note, paperMetadata);
    }
  };

  const handleViewPdf = (e: React.MouseEvent) => {
    e.stopPropagation();
    console.log('\n🔍 [VIEW PDF] User clicked "View PDF" button');
    console.log('   📄 Paper:', sourceTitle);
    console.log('   📝 Note quote:', note.quote.substring(0, 60) + '...');
    console.log('   📍 Page number:', note.pageNumber);
    console.log('   🔗 Note pdfUri:', note.pdfUri);
    console.log('   ❓ Is pdfUri defined:', !!note.pdfUri);
    console.log('   ❓ pdfUri type:', typeof note.pdfUri);
    console.log('   ❓ pdfUri value:', note.pdfUri === undefined ? 'UNDEFINED' : note.pdfUri);
    const cleanedQuote = note.quote.replace(/^[\W\d]+|[\W\d]+$/g, '').trim();
    loadPdfFromUrl(note.pdfUri, sourceTitle);
    setActivePdf(note.pdfUri);
    setSearchHighlight({ text: cleanedQuote, fallbackPage: note.pageNumber });
    openUIColumn('right');
  };

  const resolvedPaper: ArxivPaper | null =
    sourcePaper || (('sourcePaper' in note) ? (note as any).sourcePaper as ArxivPaper : null);
  const paperYear = resolvedPaper?.publishedDate?.match(/\b(19|20)\d{2}\b/)?.[0] ?? null;
  const harvardRef = resolvedPaper?.harvardReference ?? null;


  return (
    <div
      className={`relative group/note transition-all duration-300 ease-in-out border rounded-xl overflow-hidden cursor-pointer
        ${isExpanded ? "bg-white dark:bg-dark-card" : "bg-white/50 dark:bg-dark-card"}
        ${isSelected ? 'border-scholar-500 ring-1 ring-scholar-500' : 'border-gray-200 dark:border-gray-700 hover:shadow-sm'}
        ${isExpanded ? 'shadow-md ring-1 ring-scholar-100 dark:ring-scholar-900' : ''}
      `}
      onClick={() => setIsExpanded(!isExpanded)}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="pt-1">
            <button
              onClick={(e) => { e.stopPropagation(); onSelect(); }}
              className={`transition-all ${isSelected ? 'text-scholar-600 dark:text-scholar-400' : 'text-gray-300 dark:text-gray-500 hover:text-scholar-600 dark:hover:text-scholar-400'}`}
            >
              {isSelected ? <Check size={20} strokeWidth={3} /> : <Square size={20} />}
            </button>
          </div>

          <div className="flex-grow min-w-0">
            {sourceTitle && showScore && (
              <div className="mb-2 flex items-baseline gap-2 flex-wrap">
                <button
                  onClick={(e) => { e.stopPropagation(); handleViewPdf(e); }}
                  className="text-sm font-bold text-gray-800 dark:text-gray-100 hover:text-scholar-600 dark:hover:text-scholar-400 transition-colors text-left leading-snug"
                  title="Open in PDF viewer"
                >
                  {sourceTitle}
                </button>
                {paperYear && (
                  <span className="text-xs font-semibold text-scholar-600 dark:text-scholar-400 flex-shrink-0">
                    {paperYear}
                  </span>
                )}
              </div>
            )}
            <p className={`text-sm sm:text-base text-gray-800 dark:text-gray-200 leading-relaxed font-serif ${!isExpanded ? 'line-clamp-3' : ''}`}>
              "{note.quote}"
            </p>

            <div className="flex items-center mt-3 gap-2 flex-wrap">
              <span className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-gray-200 dark:border-gray-700">
                PAGE {note.pageNumber}
              </span>
              {isInContext && (
                <span className="bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">
                  IN CONTEXT
                </span>
              )}
              {isSaved && (
                <span className="bg-scholar-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">
                  SAVED
                </span>
              )}
              {!isExpanded && (
                <span className="text-xs text-scholar-600 dark:text-scholar-400 font-medium ml-auto opacity-0 group-hover/note:opacity-100 transition-opacity">
                  Details
                </span>
              )}
            </div>
          </div>
        </div>

        <div
          className={`
             absolute top-2 right-2 flex items-center gap-1
             transition-all duration-300 
             bg-white dark:bg-gray-800 p-1 rounded-lg border border-gray-100 dark:border-gray-700 shadow-sm
             ${isExpanded ? 'opacity-100' : 'opacity-0 -translate-y-2 group-hover/note:opacity-100 group-hover/note:translate-y-0'}
           `}
          onClick={(e) => e.stopPropagation()}
        >
          <button onClick={handleSaveToggle} className={`p-1.5 rounded-md ${isSaved ? 'text-scholar-600 bg-scholar-50 dark:bg-scholar-900/30' : 'text-gray-400 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`} title="Save to Library">
            <Plus size={16} />
          </button>
          <button onClick={handleContextToggle} className={`p-1.5 rounded-md ${isInContext ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/30' : 'text-gray-400 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`} title="Add to Context">
            <BookmarkPlus size={16} />
          </button>
          <button onClick={handleViewPdf} className="p-1.5 rounded-md text-gray-400 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-scholar-600 dark:hover:text-scholar-400" title="View in PDF Viewer">
            <BookText size={16} />
          </button>
          <button onClick={handleCopy} className="p-1.5 rounded-md text-gray-400 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700" title="Copy text">
            {justCopied ? <Check size={16} /> : <Copy size={16} />}
          </button>
        </div>

        {isExpanded && (
          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 animate-fade-in">
            {showScore && note.relevanceScore && (
              <div className="absolute top-6 right-4 text-right">
                <div className="text-lg font-bold text-scholar-600 dark:text-scholar-400">{Math.round(note.relevanceScore * 100)}%</div>
              </div>
            )}
            {showScore && harvardRef && (
              <div className="bg-gray-50 dark:bg-gray-900/40 rounded-xl p-3 border border-gray-100 dark:border-gray-800 mb-4">
                <h4 className="text-gray-400 text-[10px] font-black uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                  <Library size={11} /> Harvard Reference
                </h4>
                <p className="text-gray-600 dark:text-gray-300 text-xs leading-relaxed italic">
                  {harvardRef}
                </p>
              </div>
            )}
            {note.justification && (
              <div className="bg-scholar-50 dark:bg-scholar-900/20 rounded-xl p-4 border border-scholar-100 dark:border-scholar-800/30 mb-4">
                <h4 className="text-scholar-800 dark:text-scholar-300 text-md font-black uppercase mb-2 flex items-center gap-2">
                  Justification/Context
                </h4>
                <p className="text-gray-700 dark:text-gray-300 text-xs sm:text-sm leading-relaxed">{note.justification}</p>
                {note.relatedQuestion && (
                  <p className="text-gray-600 dark:text-gray-400 text-xs mt-3 leading-relaxed">
                    <span className="font-semibold">Query:</span> {note.relatedQuestion}
                  </p>
                )}
              </div>
            )}
            {note.citations && note.citations.length > 0 && (
              <div className="mt-4">
                <h4 className="text-gray-400 text-[10px] font-black uppercase mb-3 flex items-center gap-2">
                  <Library size={12} /> References
                </h4>
                <ul className="space-y-3">
                  {note.citations.map((cit, idx) => (
                    <li key={idx} className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 leading-relaxed pl-3 border-l-2 border-scholar-200 dark:border-scholar-800">
                      <span className="font-bold text-scholar-700 dark:text-scholar-400 mr-2 bg-scholar-50 dark:bg-scholar-900/30 px-1 rounded">{cit.inline}</span>
                      {cit.full}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.id === nextProps.id &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.showScore === nextProps.showScore
  );
});

// ─── DeepSearch Main Component ─────────────────────────────────────────────────
// Self-contained deep research tab — reads all data from context (no prop drilling)

interface DeepSearchProps {
  allNotesExpanded: boolean;
  onAllNotesExpandedChange: (expanded: boolean) => void;
  selectedNoteIds: string[];
  onSelectedNoteIdsChange: (ids: string[]) => void;
  onSelectNote: (id: string) => void;
  sortBy: SortOption;
  isSortOpen: boolean;
  showFilters: boolean;
  searchQuery: string;
  localFilters: { paper: string; query: string; hasNotes: boolean };
  currentPage: number;
  isSelectMenuOpen: boolean;
  isNoteSelectMenuOpen: boolean;
  justCopiedNotes: boolean;
  onSortChange: (sort: SortOption) => void;
  onSortOpenChange: (open: boolean) => void;
  onShowFiltersChange: (show: boolean) => void;
  onSearchQueryChange: (q: string) => void;
  onLocalFiltersChange: (filters: { paper: string; query: string; hasNotes: boolean }) => void;
  onCurrentPageChange: (page: number) => void;
  onSelectMenuOpenChange: (open: boolean) => void;
  onNoteSelectMenuOpenChange: (open: boolean) => void;
  onBulkCopyNotes: () => void;
  onShowClearModal: () => void;
  status: string;
  generatedKeywords: string[];
}

export const DeepSearch: React.FC<DeepSearchProps> = ({
  allNotesExpanded,
  onAllNotesExpandedChange,
  selectedNoteIds,
  onSelectedNoteIdsChange,
  onSelectNote,
  sortBy,
  isSortOpen,
  showFilters,
  searchQuery,
  localFilters,
  currentPage,
  isSelectMenuOpen,
  isNoteSelectMenuOpen,
  justCopiedNotes,
  onSortChange,
  onSortOpenChange,
  onShowFiltersChange,
  onSearchQueryChange,
  onLocalFiltersChange,
  onCurrentPageChange,
  onSelectMenuOpenChange,
  onNoteSelectMenuOpenChange,
  onBulkCopyNotes,
  onShowClearModal,
  status,
  generatedKeywords,
}) => {
  const {
    researchPhase,
    candidates,
    filteredCandidates,
    arxivCandidates,
    topFilteredPapers,  // ← NEW: Top 10 papers for loading box
    selectedArxivIds,
    isDeepResearching,
    deepResearchResults,
    showUploadedTab,
    uploadedPaperStatuses,
    timeToFirstNotes,
    stopDeepResearch,
  } = useResearch();

  const { loadedPdfs, isPdfInContext, loadPdfFromUrl, setActivePdf, downloadingUris, failedUris } = useLibrary();
  const { openColumn } = useUI();

  // Determine candidates based on research phase (same logic as before)
  const currentTabCandidates = useMemo(() => {
    return researchPhase === 'extracting' || researchPhase === 'completed'
      ? filteredCandidates
      : arxivCandidates;
  }, [researchPhase, filteredCandidates, arxivCandidates]);

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
    openColumn('right');
    loadPdfFromUrl(paper.pdfUri, paper.title, paper.authors.join(', ')).then((result: any) => {
      if (!result.success && result.error) {
        setActivePdf(null);
      }
    });
  }, [setActivePdf, openColumn, loadPdfFromUrl]);

  const isBlurred = researchPhase === 'filtering';
  const isSearching = researchPhase === 'searching' || researchPhase === 'initializing';

  const totalNotes = useMemo(() =>
    currentTabCandidates.reduce((acc, paper) => acc + (paper.notes?.length || 0), 0),
    [currentTabCandidates]
  );

  // ─── Filter Step 1: Text + field filters ──────────────────────────────────────
  const filteredPapers = useMemo(() => {
    let base = [...currentTabCandidates];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      base = base.filter(paper => {
        const titleMatch = paper.title.toLowerCase().includes(q);
        const abstractMatch = paper.summary?.toLowerCase().includes(q);
        const notesMatch = paper.notes?.some(note =>
          note.quote.toLowerCase().includes(q) ||
          note.justification?.toLowerCase().includes(q)
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

  // ─── Filter Step 2: Sort ──────────────────────────────────────────────────────
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
          .map((note, idx) => ({
            ...note,
            sourcePaper: paper,
            uniqueId: getNoteId(paper.id, note.pageNumber, idx)
          }))
      );
      return allNotes.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
    } else if (sortBy === 'newest-papers') {
      return [...filteredPapers].sort((a, b) => getSafeTimestamp(b.publishedDate) - getSafeTimestamp(a.publishedDate));
    } else {
      return [...filteredPapers].sort((a, b) => (b.notes?.length || 0) - (a.notes?.length || 0));
    }
  }, [filteredPapers, sortBy, localFilters.query]);


  // ─── Pagination ────────────────────────────────────────────────────────────────
  const totalPages = useMemo(() => Math.max(1, Math.ceil(content.length / ITEMS_PER_PAGE)), [content]);
  const paginatedContent = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return content.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [content, currentPage]);

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
      const currentSelection = Array.from(selectedArxivIds);
      const newSelection = currentSelection.filter(id => !(pagePaperIds as string[]).includes(id));
      selectAllArxivPapers(newSelection);
    } else {
      const currentSelection = Array.from(selectedArxivIds);
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

  const handleBulkCopyNotes = useCallback(() => {
    if (selectedNoteIds.length === 0) return;
    const notesToCopy = selectedNoteIds
      .map(noteId => {
        const note = (content as any[]).find((n: any) => n.uniqueId === noteId);
        if (!note) return null;
        return `Quote: "${note.quote}"\nSource: ${note.sourcePaper?.title || 'Unknown'}\nPage: ${note.pageNumber}\nReference : ${note.sourcePaper?.harvardReference || 'N/A'}\n`;
      })
      .filter(Boolean)
      .join('\n---\n\n');

    if (notesToCopy) {
      navigator.clipboard.writeText(notesToCopy);
      onBulkCopyNotes();
    }
  }, [selectedNoteIds, content, onBulkCopyNotes]);





  // ─── Dropdown options ──────────────────────────────────────────────────────────
  const uniquePapers = useMemo(() => {
    let base = [...currentTabCandidates];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      base = base.filter(paper =>
        paper.title.toLowerCase().includes(q) ||
        paper.summary?.toLowerCase().includes(q) ||
        paper.notes?.some(note => note.quote.toLowerCase().includes(q) || note.justification?.toLowerCase().includes(q))
      );
    }
    if (localFilters.query !== 'all') {
      base = base.filter(p => p.notes?.some(note => note.relatedQuestion === localFilters.query));
    }
    if (localFilters.hasNotes) {
      base = base.filter(p => p.notes && p.notes.length > 0);
    }
    return base.map(p => ({ id: p.id, title: p.title }));
  }, [currentTabCandidates, searchQuery, localFilters.query, localFilters.hasNotes]);

  const uniqueQueries = useMemo(() => {
    let base = [...currentTabCandidates];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      base = base.filter(paper =>
        paper.title.toLowerCase().includes(q) ||
        paper.summary?.toLowerCase().includes(q) ||
        paper.notes?.some(note => note.quote.toLowerCase().includes(q) || note.justification?.toLowerCase().includes(q))
      );
    }
    if (localFilters.paper !== 'all') {
      base = base.filter(p => p.id === localFilters.paper);
    }
    if (localFilters.hasNotes) {
      base = base.filter(p => p.notes && p.notes.length > 0);
    }
    const queries = new Set<string>();
    base.forEach(paper => {
      (paper.notes || []).forEach(note => {
        if (note.relatedQuestion) queries.add(note.relatedQuestion);
      });
    });
    return Array.from(queries);
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
      const queryExists = uniqueQueries.includes(localFilters.query);
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
    if (sortBy !== 'most-relevant-notes') return 0;
    return (content as any[]).filter((note: any) => (note?.quote || '').trim().length > 0).length;
  }, [content, sortBy]);

  const handleResetFilters = useCallback(() => {
    onSearchQueryChange('');
    onLocalFiltersChange({ paper: 'all', query: 'all', hasNotes: false });
  }, [onSearchQueryChange, onLocalFiltersChange]);


  return (
    <>
      {/* ── Header Controls (Selection, Bulk Copy, Filters, Collapse) ─────────── */}
      {!isBlurred && (currentTabCandidates.length > 0 || totalNotes > 0) && (
        <div className="relative z-40 flex items-center justify-between mb-4 px-1 animate-fade-in">

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
                    <div className="fixed inset-0 z-40 pointer-events-none" onClick={() => onSelectMenuOpenChange(false)} />
                    <div className="absolute left-0 top-full mt-2 w-64 bg-white dark:bg-dark-card rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 z-50 py-1.5 animate-fade-in pointer-events-auto" style={{ overflow: 'visible' }}>
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
                    <div className="fixed inset-0 z-40 pointer-events-none" onClick={() => onNoteSelectMenuOpenChange(false)} />
                    <div className="absolute left-0 top-full mt-2 w-72 bg-white dark:bg-dark-card rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 z-50 py-1.5 animate-fade-in pointer-events-auto" style={{ overflow: 'visible' }}>
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
              <button
                onClick={handleBulkCopyNotes}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg shadow-sm transition-all ${justCopiedNotes
                  ? 'bg-scholar-500 dark:bg-scholar-400 text-white hover:bg-scholar-500 dark:hover:bg-scholar-400'
                  : 'text-white bg-scholar-600 dark:bg-scholar-700 hover:bg-scholar-700 dark:hover:bg-scholar-600'
                  }`}
                title={justCopiedNotes ? `Copied! ${selectedNoteIds.length} Notes` : `Copy ${selectedNoteIds.length} selected notes`}
              >
                {justCopiedNotes ? <Check size={16} className="stroke-[3]" /> : <Copy size={16} />}
                <span className="hidden sm:inline">
                  {justCopiedNotes ? `Copied! ${selectedNoteIds.length} Notes` : `Copy ${selectedNoteIds.length} Notes`}
                </span>
              </button>
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
          <div className="flex items-center gap-2">
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

          <div className="flex flex-col gap-5 sm:grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 sm:gap-6 pt-2">
            {/* Search Input */}
            <div className="sm:col-span-2 space-y-2">
              <label className="text-[10px] sm:text-[11px] font-black text-gray-400 dark:text-scholar-400 uppercase tracking-widest pl-1">Keywords</label>
              <div className="relative group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-scholar-600 dark:group-focus-within:text-scholar-400 transition-colors" />
                <input
                  className="w-full bg-white/80 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800 rounded-xl pl-11 pr-10 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 outline-none focus:ring-2 focus:ring-scholar-500/10 shadow-sm transition-all"
                  value={searchQuery}
                  onChange={(e) => onSearchQueryChange(e.target.value)}
                  placeholder="Search title, notes, insights..."
                />
                {searchQuery && (
                  <button onClick={() => onSearchQueryChange('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                    <X size={16} />
                  </button>
                )}
              </div>
            </div>

            {/* Paper Filter */}
            <div className="space-y-2">
              <label className="text-[10px] sm:text-[11px] font-black text-gray-400 dark:text-scholar-400 uppercase tracking-widest pl-1">Papers</label>
              <select
                value={localFilters.paper}
                onChange={(e) => onLocalFiltersChange({ ...localFilters, paper: e.target.value })}
                className="w-full bg-white/80 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-scholar-500/10 shadow-sm transition-all appearance-none cursor-pointer"
              >
                <option value="all">All Papers ({uniquePapers.length})</option>
                {uniquePapers.map(p => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
            </div>

            {/* Query Filter */}
            <div className="space-y-2">
              <label className="text-[10px] sm:text-[11px] font-black text-gray-400 dark:text-scholar-400 uppercase tracking-widest pl-1">Queries</label>
              <select
                value={localFilters.query}
                onChange={(e) => onLocalFiltersChange({ ...localFilters, query: e.target.value })}
                className="w-full bg-white/80 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-scholar-500/10 shadow-sm transition-all appearance-none cursor-pointer"
              >
                <option value="all">All Queries ({uniqueQueries.length})</option>
                {uniqueQueries.map(q => (
                  <option key={q} value={q}>{q}</option>
                ))}
              </select>
            </div>

            {/* Has Notes Toggle */}
            <div className="space-y-2">
              <label className="text-[10px] sm:text-[11px] font-black text-gray-400 dark:text-scholar-400 uppercase tracking-widest pl-1">Refine</label>
              <div className="flex gap-2">
                {sortBy !== 'most-relevant-notes' && (
                  <button
                    onClick={() => onLocalFiltersChange({ ...localFilters, hasNotes: !localFilters.hasNotes })}
                    className={`flex-1 px-3 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${localFilters.hasNotes
                      ? 'bg-scholar-600 text-white shadow-md'
                      : 'bg-white/80 dark:bg-gray-900/50 text-gray-600 dark:text-gray-300 border border-gray-100 dark:border-gray-800'
                      }`}
                  >
                    With Notes
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-end mt-2">
            <button onClick={handleResetFilters} className="text-[10px] font-bold text-red-700 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 hover:underline transition-all">
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
              <BookOpenText size={14} className="opacity-60" />
              About {currentTabCandidates.length} paper{currentTabCandidates.length !== 1 ? 's' : ''} with {totalNotes} note{totalNotes !== 1 ? 's' : ''} found
              {timeToFirstNotes !== null && (
                <>
                  <span className="text-xs text-gray-400 mx-0.5">•</span>
                  <span className="text-sm text-gray-500 dark:text-scholar-400 font-medium">
                    {(timeToFirstNotes / 1000).toFixed(2)}s
                  </span>
                </>
              )}
            </div>
            {(['initializing', 'searching', 'filtering', 'extracting'].includes(researchPhase)) && (
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


        {/* Paper results */}
        <div className={sortBy === 'most-relevant-notes' ? "space-y-4" : "space-y-8"}>
          {sortBy === 'most-relevant-notes' ? (
            (paginatedContent as any[]).filter((note: any) => (note?.quote || '').trim().length > 0).map((note) => (
              <ResearchCardNote
                key={note.uniqueId}
                id={note.uniqueId}
                note={note}
                isSelected={selectedNoteIds.includes(note.uniqueId)}
                onSelect={() => onSelectNote(note.uniqueId)}
                sourceTitle={note.sourcePaper.title}
                sourcePaper={note.sourcePaper}
                showScore={true}
              />
            ))
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
                onClick={() => { onCurrentPageChange(Math.max(1, currentPage - 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
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
                onClick={() => { onCurrentPageChange(Math.min(totalPages, currentPage + 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
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

      {/* ── DYNAMIC LOADING BOX (Phases: initializing, searching, filtering) ──── */}
      {(researchPhase === 'initializing' || 
        researchPhase === 'searching' || 
        researchPhase === 'filtering') && (
        <DynamicLoadingBox 
          researchPhase={researchPhase}
          paperData={paperDataList}
          gatheringStatus={status}
        />
      )}
    </>
  );
};
