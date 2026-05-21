import React, { useState, useEffect } from 'react';
import { ArxivPaper } from '../../types';
import { useResearch } from '../../contexts/ResearchContext';
import { useLibrary } from '../../contexts/LibraryContext';
import { useUI } from '../../contexts/UIContext';
import { useDatabase } from '../../database/DatabaseContext';
import { ResearchCardNote } from './ResearchCardNote';
import { getNoteId } from './deepSearchUtils';
import {
  Loader2,
  BookText,
  Check,
  Square,
  Plus,
  X,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { ExternalLinkIcon } from '../ui/icons';

// ─── PaperCard Props ───────────────────────────────────────────────────────────
export interface PaperCardProps {
  paper: ArxivPaper;
  selectedNoteIds: string[];
  onSelectNote: (id: string) => void;
  onView?: () => void;
  isLocal?: boolean;
  forceExpanded?: boolean;
  activeQuery?: string;
}

// ─── PaperCard ─────────────────────────────────────────────────────────────────
export const PaperCard: React.FC<PaperCardProps> = React.memo(({ paper, selectedNoteIds, onSelectNote, onView, isLocal = false, forceExpanded = true, activeQuery = 'all' }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isAbstractExpanded, setIsAbstractExpanded] = useState(false);
  const [expandedNoteIds, setExpandedNoteIds] = useState<Set<string>>(new Set());
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
