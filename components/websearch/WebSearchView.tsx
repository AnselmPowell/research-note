
import React, { useState, useEffect, useRef } from 'react';
import { SearchSource, DeepResearchNote } from '../../types';
import { useResearch } from '../../contexts/ResearchContext';
import { useLibrary } from '../../contexts/LibraryContext';
import { useUI } from '../../contexts/UIContext';
import { useDatabase } from '../../database/DatabaseContext';
import { ChevronDown, BookOpen, Check, Loader2, Sparkles, BookText, FileText, ChevronUp, Lightbulb, Copy, Plus, BookmarkPlus, Bookmark, Square, AlertCircle, Search, Library } from 'lucide-react';
import { ExternalLinkIcon } from '../ui/icons';

interface WebSearchdProps {
  source: SearchSource;
  isSelected: boolean;
  isDownloading: boolean;
  isFailed?: boolean;
  isResearching?: boolean;
  researchNotes?: DeepResearchNote[];
  forceExpanded?: boolean;
  onToggle: (checked: boolean) => void;
  onView?: () => void;
}

export const WebSearchView: React.FC<WebSearchdProps> = ({
  source,
  isSelected,
  isDownloading,
  isFailed = false,
  isResearching = false,
  researchNotes = [],
  forceExpanded = false,
  onToggle,
  onView
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasAutoExpanded = useRef(false);
  const { isPaperSaved, savePaper, deletePaper } = useDatabase();
  const { loadedPdfs, loadPdfFromUrl, togglePdfContext, setActivePdf } = useLibrary();
  const { openColumn } = useUI();
  const [viewFailed, setViewFailed] = useState(false);

  const isSaved = isPaperSaved(source.uri);

  // Sync with global toggle
  useEffect(() => {
    if (researchNotes.length > 0) {
      setIsExpanded(forceExpanded);
    }
  }, [forceExpanded]);

  useEffect(() => {
    if (researchNotes.length > 0 && !hasAutoExpanded.current) {
      setIsExpanded(true);
      hasAutoExpanded.current = true;
    } else if (researchNotes.length === 0) {
      hasAutoExpanded.current = false;
      setIsExpanded(false);
    }
  }, [researchNotes]);

  const getDomain = (url: string) => {
    try {
      return new URL(url).hostname;
    } catch {
      return '';
    }
  };



  const handleAddToSources = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (isSaved) {
      deletePaper(source.uri);
      return;
    }

    // First, ensure the PDF is loaded
    const loaded = loadedPdfs.find(p => p.uri === source.uri);
    let loadedPdf = loaded;
    
    if (!loaded) {
      // Need to load the PDF first
      const result = await loadPdfFromUrl(source.uri, source.title);
      // @ts-ignore
      if (result && !result.success) {
        // Failed to load PDF
        return;
      }
      
      // Use the PDF from the result to avoid stale closure issue
      loadedPdf = result.pdf;
    }

    // Save the paper to database using correct PDF reference
    savePaper({
      ...source,
      numPages: loadedPdf ? loadedPdf.numPages : undefined
    });

    // FIXED: Also add to AgentResearcher context like other workflows do
    togglePdfContext(source.uri, source.title);

    // Open the sources panel
    openColumn('left');
  };

  const domain = getDomain(source.uri);
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=48`;
  const displayUrl = source.uri.replace('https://', '').replace('http://', '').split('/').slice(0, 2).join(' › ');

  return (
    <div className="flex items-start gap-4 mb-6 px-2 sm:px-0 group/result animate-fade-in w-full max-w-full overflow-hidden transition-colors">
      <div className="pt-1 mr-2 flex-shrink-0">
        {isDownloading ? (
          <Loader2 size={24} className="text-scholar-600 animate-spin" />
        ) : (
          <button
            onClick={() => onToggle(!isSelected)}
            className={`hover:text-scholar-600 transition-colors opacity-100 sm:group-hover/result:opacity-100 ${isSelected ? 'text-scholar-600' : 'text-gray-400 sm:opacity-0'}`}
            aria-label={`Select ${source.title}`}
          >
            {isSelected ? <Check size={24} className="text-scholar-600" /> : <Square size={24} />}
          </button>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 text-sm text-[#202124] dark:text-gray-400 flex-wrap">
          <a href={source.uri} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 min-w-0">
            <img
              src={faviconUrl}
              alt=""
              className="w-8 h-8 rounded-full opacity-90"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <span className="truncate">{domain}</span>
            {/* <span className="text-gray-400 mx-0.5">•</span> */}
            {/* <span className="truncate opacity-70">{displayUrl}</span> */}
          </a>

          {isFailed && (
            <span className="flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400 animate-fade-in ml-2">
              <AlertCircle size={12} />
              Failed to load


              </span>
          )}

          

          <div className="flex items-center gap-2 ml-2 opacity-100 sm:opacity-0 sm:group-hover/result:opacity-100 transition-opacity">
            {onView && (
              <>
                {source.uri ? (
                  <a
                    href={source.uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(ev) => ev.stopPropagation()}
                    className="text-gray-400 hover:text-gray-600 mr-1"
                    title="Open page externally"
                  >
                    <ExternalLinkIcon className="h-4 w-4" />
                  </a>
                ) : null}

                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setViewFailed(false);
                    setActivePdf(source.uri);
                    openColumn('right');
                    loadPdfFromUrl(source.uri, source.title).then(result => {
                      // @ts-ignore
                      if (result && !result.success && result.error) {
                        setViewFailed(true);
                        setActivePdf(null);
                      }
                    }).catch(() => {
                      setViewFailed(true);
                      setActivePdf(null);
                    });
                  }}
                  className="text-xs font-medium text-scholar-700 hover:text-scholar-800 bg-scholar-50 hover:bg-scholar-100 dark:bg-scholar-900/30 dark:text-scholar-300 dark:hover:bg-scholar-900/50 px-2 py-0.5 rounded border border-scholar-200 dark:border-scholar-800 transition-colors flex items-center gap-1"
                >
                  <FileText size={12} /> View
                </button>
              </>
            )}

            <button
              onClick={handleAddToSources}
              disabled={isDownloading}
              className={`text-xs font-medium px-2 py-0.5 rounded border transition-colors flex items-center gap-1
                ${isSaved
                  ? 'bg-scholar-100 text-scholar-700 border-scholar-200 hover:bg-scholar-200 dark:bg-scholar-900/40 dark:text-scholar-300 dark:border-scholar-800'
                  : 'bg-white text-scholar-600 border-scholar-200 hover:bg-scholar-50 dark:bg-gray-800 dark:text-scholar-400 dark:border-gray-700 dark:hover:bg-gray-700'
                }
              `}
            >
              {isDownloading ? <Loader2 size={12} className="animate-spin" /> : (isSaved ? <Check size={12} /> : <Plus size={12} />)}
              {isSaved ? 'Added' : 'Add to Sources'}
            </button>
          </div>
        </div>

        <a
          href={source.uri}
          target="_blank"
          rel="noopener noreferrer"
          className="block group-hover/result:underline decoration-blue-600/30 mb-1"
          onClick={(e) => { if (onView) { e.preventDefault(); onView(); } }}
        >
          <h3 className="text-lg sm:text-xl font-medium text-[#1a0dab] dark:text-[#8ab4f8] leading-snug truncate cursor-pointer">
            {source.title}
          </h3>
        </a>

        <div className="text-sm text-[#4d5156] dark:text-gray-300 leading-relaxed line-clamp-3 mb-2">
          {source.snippet}
        </div>

        {(isResearching || researchNotes.length > 0) && (
          <div className="mt-3">
            {isResearching ? (
              <div className="flex items-center gap-2 text-xs font-medium text-scholar-600 dark:text-scholar-400">
                <Loader2 size={12} className="animate-spin" />
                <span className="animate-pulse">Deep reading & extracting notes...</span>
              </div>
            ) : (
              <div className="border-l-0 sm:border-l-2 border-scholar-100 dark:border-scholar-800 pl-0 sm:pl-4 transition-all">
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="flex items-center gap-1.5 text-xs font-medium text-scholar-700 dark:text-scholar-300 hover:text-scholar-800 transition-colors mb-3"
                >
                  <span>{researchNotes.length} Insight{researchNotes.length !== 1 ? 's' : ''} extracted</span>
                  {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>

                {isExpanded && (
                  <div className="space-y-3 mt-2">
                    {researchNotes.map((note, idx) => (
                      <InlineNoteCard key={idx} note={note} sourceTitle={source.title} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const InlineNoteCard: React.FC<{ note: DeepResearchNote, sourceTitle?: string }> = ({ note, sourceTitle }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [justCopied, setJustCopied] = useState(false);

  const { toggleContextNote, isNoteInContext } = useResearch();
  const { savedNotes, isNoteSaved, deleteNote, saveNote } = useDatabase();
  const { setSearchHighlight, loadPdfFromUrl, setActivePdf } = useLibrary();
  const { setColumnVisibility } = useUI();

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
      if (savedNote && savedNote.id) deleteNote(savedNote.id);
    } else {
      saveNote(note, { uri: note.pdfUri, title: sourceTitle });
    }
  };

  const handleViewPdf = (e: React.MouseEvent) => {
    e.stopPropagation();
    const cleanedQuote = note.quote.replace(/^[\W\d]+|[\W\d]+$/g, '').trim();
    loadPdfFromUrl(note.pdfUri, sourceTitle);
    setActivePdf(note.pdfUri);
    setSearchHighlight({ text: cleanedQuote, fallbackPage: note.pageNumber });
    setColumnVisibility(prev => ({ ...prev, right: true }));
  };

  return (
    <div
      className={`relative group/note transition-all duration-300 ease-in-out border rounded-xl overflow-hidden cursor-pointer
        ${isExpanded ? "bg-white dark:bg-gray-800" : "bg-cream dark:bg-dark-card"}
        ${isExpanded
          ? 'border-gray-200 dark:border-gray-700 shadow-md ring-1 ring-scholar-100 dark:ring-scholar-900'
          : 'border-gray-200 dark:border-gray-700 hover:shadow-sm'
        }
      `}
      onClick={() => setIsExpanded(!isExpanded)}
    >
      <div className={`p-3 sm:p-4 lg:p-5 ${isExpanded ? 'bg-opacity-50' : ''}`}>
        <div className="flex items-start">
          <div className="flex-grow min-w-0">
            <p className={`text-sm sm:text-base text-gray-800 dark:text-gray-200 leading-relaxed font-serif ${!isExpanded ? 'line-clamp-3 sm:line-clamp-4' : ''}`}>
              "{note.quote}"
            </p>
            <div className="flex items-center mt-3 gap-2 flex-wrap">
              <span className="bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-xs font-semibold px-2.5 py-1 rounded-full border border-gray-200 dark:border-gray-700 transition-colors">
                Page {note.pageNumber}
              </span>

              {isInContext && (
                <span className="bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm uppercase tracking-wider">
                  In Context
                </span>
              )}

              {isSaved && (
                <span className="bg-scholar-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm uppercase tracking-wider">
                  Saved to Library
                </span>
              )}

              {!isExpanded && (
                <span className="text-xs text-scholar-600 dark:text-scholar-400 font-medium hover:underline opacity-100 sm:opacity-0 sm:group-hover/note:opacity-100 transition-opacity ml-auto">
                  Show details
                </span>
              )}
            </div>
          </div>
        </div>

        <div
          className={`
             absolute top-0 right-0 flex items-center gap-1 sm:gap-2
             transition-all duration-300 
             bg-cream dark:bg-gray-800/95 backdrop-blur-sm p-1.5 rounded-lg border border-gray-100 dark:border-gray-700 shadow-sm
             ${isExpanded
              ? 'opacity-100 translate-y-0'
              : 'opacity-100 translate-y-0 sm:opacity-0 sm:-translate-y-2 sm:group-hover/note:opacity-100 sm:group-hover/note:translate-y-0'
            }
           `}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={handleSaveToggle}
            className={`
               w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200
               ${isSaved
                ? 'bg-scholar-600 text-white shadow-md'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-500 hover:bg-scholar-50 dark:hover:bg-scholar-900/30 hover:text-scholar-600'
              }
             `}
          >
            <Plus size={16} fill={isSaved ? "currentColor" : "none"} />
          </button>

          <button
            onClick={handleContextToggle}
            className={`
               w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200
               ${isInContext
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600'
              }
             `}
          >
            <BookmarkPlus size={16} fill={isInContext ? "currentColor" : "none"} />
          </button>

          <button onClick={handleViewPdf} className="w-8 h-8 rounded-full flex items-center justify-center bg-gray-100 dark:bg-gray-700 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600 hover:text-scholar-600 dark:hover:text-scholar-400 transition-all">
            <BookText size={16} />
          </button>

          <button onClick={handleCopy} className="w-8 h-8 rounded-full flex items-center justify-center bg-gray-100 dark:bg-gray-700 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600 hover:text-gray-900 dark:hover:text-gray-100 transition-all">
            {justCopied ? <Check size={16} /> : <Copy size={16} />}
          </button>
        </div>

        {isExpanded && (
          <div className="mt-4 ml-0 sm:ml-9 space-y-4 pt-4 border-t border-gray-100 dark:border-gray-800 relative animate-fade-in">
            {note.relevanceScore && (
              <div className="absolute top-8 right-2 text-right p-2">
                <div className="text-xl font-bold text-scholar-600 dark:text-scholar-400">{Math.round(note.relevanceScore * 100)}%</div>
              </div>
            )}
            {note.justification && (
              <div className="bg-scholar-50/50 dark:bg-scholar-900/20 rounded-lg p-3 sm:p-4 border border-scholar-100 dark:border-scholar-800/30 pr-16">
                <h4 className="text-scholar-700 dark:text-scholar-300 text-xs font-bold uppercase mb-2 flex items-center gap-1.5">
                  <Lightbulb size={14} className="text-scholar-500" /> Justification
                </h4>
                <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">{note.justification}</p>
                {note.relatedQuestion && (
                  <p className="text-gray-600 dark:text-gray-400 text-xs mt-2 leading-relaxed">
                    <span className="font-semibold">Query:</span> {note.relatedQuestion}
                  </p>
                )}
              </div>
            )}
            {note.citations && note.citations.length > 0 && (
              <div className="mt-3">
                <h4 className="text-gray-500 dark:text-gray-400 text-xs font-semibold mb-1.5 flex items-center gap-1.5">
                  <BookOpen size={12} /> References
                </h4>
                <ul className="space-y-2">
                  {note.citations.map((cit, idx) => (
                    <li key={idx} className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed pl-2 border-l-2 border-scholar-200 dark:border-scholar-800">
                      <span className="font-semibold text-scholar-700 dark:text-scholar-400 text-xs mr-1 bg-scholar-50 dark:bg-scholar-900/30 px-1 py-0.5 rounded">
                        {cit.inline}
                      </span>
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
};
