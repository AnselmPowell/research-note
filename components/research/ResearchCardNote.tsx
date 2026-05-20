import React, { useState, useCallback, useEffect } from 'react';
import { DeepResearchNote, ArxivPaper } from '../../types';
import { useResearch } from '../../contexts/ResearchContext';
import { useDatabase } from '../../database/DatabaseContext';
import { useLibrary } from '../../contexts/LibraryContext';
import { useUI } from '../../contexts/UIContext';
import {
  Check,
  Square,
  Plus,
  BookmarkPlus,
  TextSearch,
  Copy,
  Library
} from 'lucide-react';

interface ResearchCardNoteProps {
  id: string;
  note: DeepResearchNote;
  isSelected: boolean;
  onSelect: () => void;
  sourceTitle?: string;
  showScore?: boolean;
  sourcePaper?: ArxivPaper;
  isTop5?: boolean;
  topNoteIds?: string[];
  isExpanded: boolean;  // ✅ Controlled from parent
  onToggleExpand: () => void;  // ✅ Callback to parent
}

export const ResearchCardNote: React.FC<ResearchCardNoteProps> = React.memo(({
  id,
  note,
  isSelected,
  onSelect,
  sourceTitle,
  showScore,
  sourcePaper,
  isTop5,
  topNoteIds = [],
  isExpanded,  // ✅ Controlled from parent
  onToggleExpand  // ✅ Callback to parent
}) => {
  const [justCopied, setJustCopied] = useState(false);

  const { toggleContextNote, isNoteInContext, setActiveSearchMode, researchPhase } = useResearch();
  const { isNoteSaved, deleteNote, saveNote, savedNotes } = useDatabase();
  const { setSearchHighlight, loadPdfFromUrl, setActivePdf } = useLibrary();
  const { openColumn: openUIColumn, setColumnVisibility } = useUI();

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
    if (isSaved) {
      const savedNote = savedNotes.find(n => n.paper_uri === note.pdfUri && n.content === note.quote);
      if (savedNote && savedNote.id) {
        deleteNote(savedNote.id);
      }
    } else {
      const paperMetadata = createPaperMetadata(note, sourcePaper, sourceTitle);
      saveNote(note, paperMetadata);
    }
  };

  const handleViewPdf = (e: React.MouseEvent) => {
    e.stopPropagation();
    const cleanedQuote = note.quote.replace(/^[\W\d]+|[\W\d]+$/g, '').trim();
    loadPdfFromUrl(note.pdfUri, sourceTitle);
    setActivePdf(note.pdfUri);
    setSearchHighlight({ text: cleanedQuote, fallbackPage: note.pageNumber });
    setColumnVisibility(prev => ({ ...prev, left: false, right: true }));
  };

  const resolvedPaper: ArxivPaper | null =
    sourcePaper || (('sourcePaper' in note) ? (note as any).sourcePaper as ArxivPaper : null);
  const paperYear = resolvedPaper?.publishedDate?.match(/\b(19|20)\d{2}\b/)?.[0] ?? null;
  const harvardRef = resolvedPaper?.harvardReference ?? null;

  return (
    <div
      className={`relative group/note transition-all duration-300 ease-in-out border rounded-xl overflow-hidden cursor-pointer pt-6
        ${researchPhase === 'ranking_notes' ? 'opacity-50 pointer-events-none' : ''}
        ${isExpanded ? "bg-white dark:bg-dark-card" : "bg-white/50 dark:bg-dark-card"}
        ${isSelected ? 'border-scholar-500 ring-1 ring-scholar-500' : 'border-gray-200 dark:border-gray-700 hover:shadow-sm'}
        ${isExpanded ? 'shadow-md ring-1 ring-scholar-100 dark:ring-scholar-900' : ''}
      `}
      onClick={() => {
        if (researchPhase === 'ranking_notes') return;
        if (window.getSelection()?.toString()) return; // user is selecting text, don't toggle
        onToggleExpand();
      }}
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
             absolute top-1 right-1 flex items-center gap-3
             transition-all duration-300  
             bg-white dark:bg-gray-800 p-1 rounded-lg border border-gray-100 dark:border-gray-700 shadow-sm
             ${isExpanded ? 'opacity-100' : 'opacity-0 -translate-y-2 group-hover/note:opacity-100 group-hover/note:translate-y-0'}
           `}
          onClick={(e) => e.stopPropagation()}
        >
          <button onClick={handleSaveToggle} className={`p-1.5 rounded-md ${isSaved ? 'text-scholar-600 bg-scholar-50 dark:bg-scholar-900/30' : 'text-gray-400 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`} title="Save to Library">
            <Plus size={18} />
          </button>
          <button onClick={handleContextToggle} className={`p-1.5 rounded-md ${isInContext ? 'text-scholar-600 bg-scholar-50 dark:bg-scholar-900/30' : 'text-gray-400 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`} title="Add to Context">
            <BookmarkPlus size={18} />
          </button>
          <button onClick={handleViewPdf} className="p-1.5 rounded-md text-gray-400 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-scholar-600 dark:hover:text-scholar-400" title="View text in PDF">
            <TextSearch size={18} />
          </button>
          <button onClick={handleCopy} className="p-1.5 rounded-md text-gray-400 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700" title="Copy text">
            {justCopied ? <Check size={18} /> : <Copy size={18} />}
          </button>
        </div>

        {isExpanded && (
          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 animate-fade-in" onClick={(e) => e.stopPropagation()}>
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
});
