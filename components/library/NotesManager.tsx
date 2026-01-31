import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { 
  Square, 
  Check, 
  ChevronDown, 
  ChevronUp, 
  Star, 
  Flag, 
  Edit3, 
  Trash2, 
  Search, 
  Filter, 
  Copy, 
  X,
  BookText,
  LayoutList,
  FileText,
  Table as TableIcon,
  Library,
  Bookmark,
  ArrowUpDown,
  TextSearch,
  BookOpenText,
  Lightbulb,
  FileJson,
  Loader2
} from 'lucide-react';
import { useDatabase } from '../../database/DatabaseContext';
import { useLibrary } from '../../contexts/LibraryContext';
import { useUI } from '../../contexts/UIContext';
import { PapersTable } from './PapersTable';
import { NotesTable } from './NotesTable';

interface NotesManagerProps {
  activeView: string;
}

const formatFullNote = (note: any, paper: any) => {
  const authors = paper?.authors ? (Array.isArray(paper.authors) ? paper.authors.join(', ') : paper.authors) : '';
  const citationLines = note.citations?.map((c: any) => `${c.inline} ${c.full}`).join('\n') || '';

  return `
Title: ${paper?.title || 'Untitled Paper'}
${authors ? `Authors: ${authors}` : ''}
Details: Page ${note.page_number}
---
${note.content}
---
${citationLines ? `Citations:\n${citationLines}\n` : ''}
Source: ${note.paper_uri}
`.trim();
};

export const NotesManager: React.FC<NotesManagerProps> = ({ activeView }) => {
  const { 
    savedNotes, 
    savedPapers, 
    deleteNote, 
    toggleStar, 
    toggleFlag, 
    updateNote,
    deletePaper
  } = useDatabase();
  
  const { 
    loadPdfFromUrl, 
    setActivePdf, 
    setSearchHighlight,
    isPdfInContext,
    togglePdfContext,
    downloadingUris,
    failedUris
  } = useLibrary();

  const { setColumnVisibility } = useUI();

  // --- STATE ---
  const [activeTab, setActiveTab] = useState<'notes' | 'papers'>('notes');
  
  // Sync tab with external navigation view
  useEffect(() => {
    if (activeView === 'papers') {
        setActiveTab('papers');
    } else if (['all', 'recent', 'flagged', 'starred'].includes(activeView)) {
        setActiveTab('notes');
    }
  }, [activeView]);

  const [paperSubFilter, setPaperSubFilter] = useState<'all' | 'noted'>('all');
  const [viewMode, setViewMode] = useState<'list' | 'table'>('table');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [localFilters, setLocalFilters] = useState({
    source: 'all',
    query: 'all',
    flagged: false
  });
  const [sortColumn, setSortColumn] = useState('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [selectedNoteIds, setSelectedNoteIds] = useState<number[]>([]);
  const [selectedPaperUris, setSelectedPaperUris] = useState<string[]>([]);
  const [uiSelectedPaperUris, setUiSelectedPaperUris] = useState<string[]>([]); // NEW: UI-only selection
  const [expandedNotes, setExpandedNotes] = useState<Set<number>>(new Set());
  const [expandedPapers, setExpandedPapers] = useState<Set<string>>(new Set());
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [showBulkCopyMenu, setShowBulkCopyMenu] = useState(false);
  const bulkCopyRef = useRef<HTMLDivElement>(null);

  const [deleteModal, setDeleteModal] = useState<{ 
    isOpen: boolean; 
    ids: number[]; 
    paperUri?: string; 
    paperTitle?: string;
    notesCount?: number;
    isProcessing: boolean 
  }>({
    isOpen: false,
    ids: [],
    isProcessing: false
  });

  const PAGE_SIZE = activeTab === 'notes' && viewMode === 'grid' ? 12 : 10;

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (bulkCopyRef.current && !bulkCopyRef.current.contains(e.target as Node)) {
        setShowBulkCopyMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const openDeleteNoteModal = (ids: number[]) => {
    setDeleteModal({ isOpen: true, ids, isProcessing: false });
  };

  const openDeletePaperModal = (paper: any) => {
    const paperNotesCount = savedNotes.filter(n => n.paper_uri === paper.uri).length;
    setDeleteModal({ 
      isOpen: true, 
      ids: [], 
      paperUri: paper.uri, 
      paperTitle: paper.title,
      notesCount: paperNotesCount,
      isProcessing: false 
    });
  };

  const handleBulkDeletePapers = async () => {
      const totalNotes = savedNotes.filter(n => selectedPaperUris.includes(n.paper_uri)).length;
      setDeleteModal({
          isOpen: true,
          ids: [],
          paperUri: 'bulk',
          paperTitle: `${selectedPaperUris.length} selected papers`,
          notesCount: totalNotes,
          isProcessing: false
      });
  };

  const handleConfirmDelete = async () => {
    setDeleteModal(prev => ({ ...prev, isProcessing: true }));
    try {
      if (deleteModal.paperUri === 'bulk') {
          // FIXED: Use uiSelectedPaperUris instead of selectedPaperUris for bulk delete
          for (const uri of uiSelectedPaperUris) {
              await deletePaper(uri);
          }
          setUiSelectedPaperUris([]); // Clear UI selection after delete
      } else if (deleteModal.paperUri) {
        await deletePaper(deleteModal.paperUri);
      } else {
        for (const id of deleteModal.ids) {
          await deleteNote(id);
        }
        setSelectedNoteIds(prev => prev.filter(id => !deleteModal.ids.includes(id)));
      }
      setDeleteModal({ isOpen: false, ids: [], isProcessing: false });
    } catch (error) {
      console.error("Delete failed", error);
      setDeleteModal(prev => ({ ...prev, isProcessing: false }));
    }
  };

 
  const paperByUri = useMemo(() => 
    new Map(savedPapers.map(paper => [paper.uri, paper])), 
    [savedPapers]
  );

  const notesCountByPaperUri = useMemo(() => {
    const map = new Map<string, number>();
    savedNotes.forEach(note => {
      map.set(note.paper_uri, (map.get(note.paper_uri) || 0) + 1);
    });
    return map;
  }, [savedNotes]);

  const filteredNotes = useMemo(() => {
    let base = [...savedNotes];
    if (activeView === 'starred') base = base.filter(n => n.is_starred);
    else if (activeView === 'flagged') base = base.filter(n => n.is_flagged);
    else if (activeView === 'recent') {
      const oneDayAgo = new Date().getTime() - 86400000;
      base = base.filter(n => new Date(n.created_at || 0).getTime() > oneDayAgo);
    }
    if (localFilters.source !== 'all') base = base.filter(n => n.paper_uri === localFilters.source);
    if (localFilters.query !== 'all') base = base.filter(n => n.related_question === localFilters.query);
    if (localFilters.flagged) base = base.filter(n => n.is_flagged);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      base = base.filter(n => n.content.toLowerCase().includes(q) || n.justification?.toLowerCase().includes(q));
    }
    base.sort((a, b) => {
      let valA, valB;
      if (sortColumn === 'createdAt') {
        valA = new Date(a.created_at || 0).getTime();
        valB = new Date(b.created_at || 0).getTime();
      } else if (sortColumn === 'publishedYear') {
  
        const paperA = paperByUri.get(a.paper_uri);
        const paperB = paperByUri.get(b.paper_uri);
        const yearA = paperA?.created_at || paperA?.published || paperA?.publishedDate ? new Date(paperA.created_at || paperA.published || paperA.publishedDate).getFullYear() : 0;
        const yearB = paperB?.created_at || paperB?.published || paperB?.publishedDate ? new Date(paperB.created_at || paperB.published || paperB.publishedDate).getFullYear() : 0;
        valA = yearA;
        valB = yearB;
      } else {
        valA = a.content; valB = b.content;
      }
      return sortDirection === 'asc' ? (valA < valB ? -1 : 1) : (valA > valB ? -1 : 1);
    });
    return base;
  }, [savedNotes, savedPapers, activeView, searchQuery, localFilters, sortColumn, sortDirection, paperByUri]); // FIXED: Added missing dependencies

  const filteredPapers = useMemo(() => {
    let base = [...savedPapers];
    
    if (paperSubFilter === 'noted') {

      const papersWithNotes = new Set(savedNotes.map(n => n.paper_uri));
      base = base.filter(p => papersWithNotes.has(p.uri));
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      base = base.filter(p => p.title?.toLowerCase().includes(q) || p.abstract?.toLowerCase().includes(q));
    }
    
    base.sort((a, b) => {

      const notesA = notesCountByPaperUri.get(a.uri) || 0;
      const notesB = notesCountByPaperUri.get(b.uri) || 0;
      if (notesA > 0 && notesB === 0) return -1;
      if (notesB > 0 && notesA === 0) return 1;
      
      // Apply the selected sort column
      let valA, valB;
      if (sortColumn === 'publishedYear') {
        const yearA = a.created_at || a.published || a.publishedDate ? new Date(a.created_at || a.published || a.publishedDate).getFullYear() : 0;
        const yearB = b.created_at || b.published || b.publishedDate ? new Date(b.created_at || b.published || b.publishedDate).getFullYear() : 0;
        valA = yearA;
        valB = yearB;
      } else {
        // Default to creation date for 'createdAt' and any other values
        valA = new Date(a.created_at || 0).getTime();
        valB = new Date(b.created_at || 0).getTime();
      }
      return sortDirection === 'asc' ? valA - valB : valB - valA;
    });
    return base;
  }, [savedPapers, savedNotes, searchQuery, sortDirection, sortColumn, paperSubFilter, notesCountByPaperUri]);

  const paginatedNotes = filteredNotes.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const paginatedPapers = filteredPapers.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handleToggleExpand = useCallback((id: number) => {
    setExpandedNotes(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleLocateNote = useCallback((note: any) => {
      const paper = paperByUri.get(note.paper_uri);
      const cleanedQuote = note.content.replace(/^[\W\d]+|[\W\d]+$/g, '').trim();
      
      loadPdfFromUrl(note.paper_uri, paper?.title);
      setActivePdf(note.paper_uri);
      setSearchHighlight(cleanedQuote);
      setColumnVisibility(prev => ({ ...prev, right: true }));
  }, [paperByUri, loadPdfFromUrl, setActivePdf, setSearchHighlight, setColumnVisibility]);

  const handleTogglePaperExpand = useCallback((uri: string) => {
    setExpandedPapers(prev => {
      const next = new Set(prev);
      if (next.has(uri)) next.delete(uri); else next.add(uri);
      return next;
    });
  }, []);

  const handleSelectAllNotes = useCallback(() => {
    if (selectedNoteIds.length === paginatedNotes.length && selectedNoteIds.length > 0) {
      setSelectedNoteIds([]);
    } else {
      setSelectedNoteIds(paginatedNotes.map(note => note.id));
    }
  }, [selectedNoteIds, paginatedNotes]); // FIXED: Include full selectedNoteIds array, not just length

  const handleSelectAllPapers = useCallback(() => {
    if (uiSelectedPaperUris.length === paginatedPapers.length && uiSelectedPaperUris.length > 0) {
      setUiSelectedPaperUris([]);
    } else {
      setUiSelectedPaperUris(paginatedPapers.map(paper => paper.uri));
    }
  }, [uiSelectedPaperUris, paginatedPapers]); // FIXED: Include full uiSelectedPaperUris array, not just length

  const handleUiPaperSelect = useCallback(async (paperUri: string) => {
    // Update UI selection state
    setUiSelectedPaperUris(prev => 
      prev.includes(paperUri) 
        ? prev.filter(uri => uri !== paperUri)
        : [...prev, paperUri]
    );
    
   
    const paper = paperByUri.get(paperUri); 
    if (paper) {
      const wasInContext = isPdfInContext(paperUri);
      togglePdfContext(paperUri, paper.title);
      if (!wasInContext) {
        await loadPdfFromUrl(paperUri, paper.title);
      }
    }
  }, [paperByUri, isPdfInContext, togglePdfContext, loadPdfFromUrl]);

  const handleNoteSelect = useCallback((id: number) => {
    setSelectedNoteIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }, []);

  const handlePaperSelect = async (paper: any) => {
    const wasInContext = isPdfInContext(paper.uri);
    setSelectedPaperUris(prev => prev.includes(paper.uri) ? prev.filter(u => u !== paper.uri) : [...prev, paper.uri]);
    togglePdfContext(paper.uri, paper.title);
    if (!wasInContext) {
        await loadPdfFromUrl(paper.uri, paper.title);
    }
  };

  const handleBulkCopy = useCallback((mode: 'raw' | 'full') => {
    const selected = savedNotes.filter(n => selectedNoteIds.includes(n.id));
    let text = '';
    if (mode === 'raw') {
      text = selected.map(n => `"${n.content}"`).join('\n\n');
    } else {
      text = selected.map(n => {
        const paper = paperByUri.get(n.paper_uri);
        return formatFullNote(n, paper);
      }).join('\n\n========================\n\n');
    }
    navigator.clipboard.writeText(text);
    setSelectedNoteIds([]);
    setShowBulkCopyMenu(false);
  }, [savedNotes, selectedNoteIds, paperByUri]);

  const paperCounts = useMemo(() => ({
      all: savedPapers.length,
      noted: Array.from(new Set(savedNotes.map(n => n.paper_uri))).length 
  }), [savedPapers, savedNotes]);

  const uniqueQueries = useMemo(() => {

    const uniqueSet = new Set<string>();
    savedNotes.forEach(note => {
      if (note.related_question && note.related_question.trim().length > 0) {
        uniqueSet.add(note.related_question);
      }
    });
    return Array.from(uniqueSet).sort();
  }, [savedNotes]);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-cream dark:bg-dark-bg font-sans notes-manager-container" style={{ containerType: 'inline-size' }}>
      <style>{`
        @container (max-width: 450px) {
          .tab-label { display: none; }
          .view-toggle-container { display: none !important; }
          .filters-grid { grid-template-columns: 1fr !important; }
          .pagination-controls { flex-direction: column; gap: 1rem; }
          .notes-grid { grid-template-columns: 1fr !important; }
          .tab-button { padding-left: 1.25rem !important; padding-right: 1.25rem !important; }
          .action-bar-text { display: none !important; }
          .action-bar-button { padding-left: 0.5rem !important; padding-right: 0.5rem !important; }
          .filter-label { font-size: 11px !important; }
          .filter-input { font-size: 14px !important; padding: 0.625rem !important; }
          .paper-pill { font-size: 11px !important; padding: 0.375rem 0.75rem !important; }
        }
        @container (max-width: 650px) {
          .notes-grid { grid-template-columns: 1fr !important; }
          .filters-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 640px) {
          .filter-container { padding: 1rem !important; }
          .filter-grid { gap: 1rem !important; }
        }
      `}</style>
      
      {/* STICKY HEADER - OUTSIDE SCROLL CONTAINER */}
      <div className="sticky top-0 z-20 bg-cream/95 dark:bg-dark-bg/95 backdrop-blur-sm border-b border-gray-100 dark:border-gray-700 shadow-sm">
        <div className="max-w-6xl mx-auto px-4">
          
          {/* PRIMARY HEADER ROW */}
          <div className="flex justify-between items-center py-4 border-b border-gray-200 dark:border-gray-800">
            
            {/* LEFT: TABS WITH SELECT ALL */}
            <div className="flex items-center -mb-px gap-2">
              
              {/* SELECT ALL BUTTON */}
              {(activeTab === 'notes' ? paginatedNotes.length > 0 : paginatedPapers.length > 0) && (
                <button
                  onClick={activeTab === 'notes' ? handleSelectAllNotes : handleSelectAllPapers}
                  className="p-2.5 text-gray-500 dark:text-gray-400 hover:text-scholar-600 dark:hover:text-scholar-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-all"
                  title={`Select all ${activeTab} on page`}
                >
                  <div className={`w-5 h-5 rounded border-2 transition-colors flex items-center justify-center ${
                    (activeTab === 'notes' && selectedNoteIds.length === paginatedNotes.length && selectedNoteIds.length > 0) ||
                    (activeTab === 'papers' && uiSelectedPaperUris.length === paginatedPapers.length && uiSelectedPaperUris.length > 0)
                      ? 'bg-scholar-600 border-scholar-600' 
                      : 'border-gray-400 dark:border-gray-500'
                  }`}>
                    {((activeTab === 'notes' && selectedNoteIds.length === paginatedNotes.length && selectedNoteIds.length > 0) ||
                      (activeTab === 'papers' && uiSelectedPaperUris.length === paginatedPapers.length && uiSelectedPaperUris.length > 0)) && (
                      <Check size={14} className="text-white" />
                    )}
                  </div>
                </button>
              )}

              {/* EXISTING TAB BUTTONS */}
              <button 
                onClick={() => { setActiveTab('notes'); setCurrentPage(1); setUiSelectedPaperUris([]); }}
                className={`tab-button px-6 py-4 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${activeTab === 'notes' ? 'border-scholar-600 text-scholar-600 dark:text-scholar-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}
              >
                <LayoutList size={18} className="flex-shrink-0" />
                <span className="tab-label">
                  {activeView === 'all' || activeView == 'papers' ? 'All Notes' : activeView.charAt(0).toUpperCase() + activeView.slice(1)}
                </span>
              </button>
              
              <button 
                onClick={() => { setActiveTab('papers'); setCurrentPage(1); setSelectedNoteIds([]); }}
                className={`tab-button px-6 py-4 text-sm font-medium border-b-2 transition-all flex items-center gap-2 ${activeTab === 'papers' ? 'border-scholar-600 text-scholar-600 dark:text-scholar-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}
              >
                <FileText size={18} className="flex-shrink-0" />
                <span className="tab-label">Papers</span>
              </button>
            </div>

            {/* RIGHT: VIEW TOGGLES AND FILTERS */}
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex bg-white/40 dark:bg-gray-800/40 p-1 rounded-xl border border-gray-100 dark:border-gray-800 view-toggle-container mr-2">
                <button 
                  onClick={() => setViewMode('table')} 
                  className={`p-2 rounded-lg transition-all ${viewMode === 'table' ? 'bg-white dark:bg-gray-700 shadow-sm text-scholar-600 dark:text-scholar-400' : 'text-gray-400 hover:text-scholar-600 dark:hover:text-scholar-400'}`}
                  title="Table View"
                >
                  <TableIcon size={18} />
                </button>
                <button 
                  onClick={() => setViewMode('list')} 
                  className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-white dark:bg-gray-700 shadow-sm text-scholar-600 dark:text-scholar-400' : 'text-gray-400 hover:text-scholar-600 dark:hover:text-scholar-400'}`}
                  title="List View"
                >
                  <LayoutList size={18} />
                </button>
              </div>

              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm font-bold rounded-xl border transition-all ${showFilters ? 'bg-scholar-50 dark:bg-scholar-900/30 border-scholar-200 dark:border-scholar-800 text-scholar-600 dark:text-scholar-400' : 'bg-white/60 dark:bg-gray-800/60 border-gray-100 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-scholar-200 dark:hover:border-scholar-800 hover:text-scholar-600 dark:hover:text-scholar-400'}`}
              >
                <Filter size={18} className="flex-shrink-0" />
                <span className="tab-label">Filters</span>
              </button>
            </div>
          </div>

          {/* ACTION BAR ROW - ONLY WHEN ITEMS SELECTED */}
          {((activeTab === 'notes' && selectedNoteIds.length > 0) || (activeTab === 'papers' && uiSelectedPaperUris.length > 0)) && (
            <div className="flex items-center justify-between py-3 gap-4 border-t border-gray-100 dark:border-gray-700/50 bg-cream/30 dark:bg-dark-card/30 rounded-b-xl -mx-4 px-4">
              
              {/* LEFT: SELECTION INFO */}
              <div className="flex items-center gap-3">
                <button 
                  onClick={activeTab === 'notes' ? handleSelectAllNotes : handleSelectAllPapers}
                  className="p-2.5 text-gray-500 dark:text-gray-400 hover:text-scholar-600 dark:hover:text-scholar-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-all"
                  title={(activeTab === 'notes' && selectedNoteIds.length === paginatedNotes.length) || (activeTab === 'papers' && uiSelectedPaperUris.length === paginatedPapers.length) ? 'Clear selection' : 'Select all on page'}
                >
                  <div className={`w-6 h-6 rounded border-2 transition-colors flex items-center justify-center ${
                    (activeTab === 'notes' && selectedNoteIds.length === paginatedNotes.length) || 
                    (activeTab === 'papers' && uiSelectedPaperUris.length === paginatedPapers.length)
                      ? 'bg-scholar-600 border-scholar-600' 
                      : 'border-gray-400 dark:border-gray-500'
                  }`}>
                    {((activeTab === 'notes' && selectedNoteIds.length === paginatedNotes.length) || 
                      (activeTab === 'papers' && uiSelectedPaperUris.length === paginatedPapers.length)) && (
                      <Check size={16} className="text-white" />
                    )}
                  </div>
                </button>
                <div>
                  <span className="text-lg font-bold text-gray-700 dark:text-gray-300">
                    {activeTab === 'notes' ? selectedNoteIds.length : uiSelectedPaperUris.length}
                  </span>
                  <span className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 opacity-80 ml-1">
                    Selected
                  </span>
                </div>
              </div>

              {/* RIGHT: ACTIONS */}
              <div className="flex items-center gap-2">
                
                {/* COPY ACTIONS - NOTES ONLY */}
                {activeTab === 'notes' && (
                  <div className="relative" ref={bulkCopyRef}>
                    <button 
                      onClick={() => setShowBulkCopyMenu(!showBulkCopyMenu)}
                      className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-gray-600 dark:text-gray-300 hover:text-scholar-600 dark:hover:text-scholar-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-all"
                    >
                      <Copy size={16} />
                      <span className="action-bar-text">Copy</span>
                      <ChevronDown size={14} className={`text-gray-400 transition-transform ${showBulkCopyMenu ? 'rotate-180' : ''}`} />
                    </button>
                    
                    {showBulkCopyMenu && (
                      <div className="absolute bottom-full mb-2 right-0 w-52 bg-white dark:bg-dark-card rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 py-1.5 z-50">
                        <button onClick={() => handleBulkCopy('raw')} className="w-full text-left px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-white hover:bg-scholar-50 dark:hover:bg-scholar-900/30 flex items-center gap-3 transition-colors">
                          <FileText size={16} className="text-gray-400" />
                          Copy Quotes Only
                        </button>
                        <button onClick={() => handleBulkCopy('full')} className="w-full text-left px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-white hover:bg-scholar-50 dark:hover:bg-scholar-900/30 flex items-center gap-3 transition-colors">
                          <FileJson size={16} className="text-scholar-600 dark:text-scholar-400" />
                          Copy Full Quotes
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* DELETE ACTION */}
                <button 
                  onClick={() => {
                    if (activeTab === 'notes') {
                      openDeleteNoteModal(selectedNoteIds);
                    } else {
                      // Use UI selection for papers
                      const totalNotes = savedNotes.filter(n => uiSelectedPaperUris.includes(n.paper_uri)).length;
                      setDeleteModal({
                        isOpen: true,
                        ids: [],
                        paperUri: 'bulk',
                        paperTitle: `${uiSelectedPaperUris.length} selected papers`,
                        notesCount: totalNotes,
                        isProcessing: false
                      });
                    }
                  }}
                  className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors action-bar-button"
                >
                  <Trash2 size={16} />
                  <span className="action-bar-text">Delete</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* SCROLL CONTAINER - BELOW STICKY HEADER */}
      <div className="flex-1 overflow-auto custom-scrollbar">
        <div className="max-w-6xl mx-auto px-4 py-6 sm:py-8">

          {/* Paper Sub-Filters (Pills) */}
          {activeTab === 'papers' && (
              <div className="flex items-center gap-2 mb-6 px-1 animate-fade-in overflow-x-auto no-scrollbar">
                  <button 
                    onClick={() => setPaperSubFilter('all')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all border paper-pill ${paperSubFilter === 'all' ? 'bg-scholar-600 text-white border-scholar-600 shadow-sm' : 'bg-white dark:bg-dark-card text-gray-500 dark:text-scholar-400 border-gray-200 dark:border-gray-700 hover:border-scholar-300'}`}
                  >
                      All <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${paperSubFilter === 'all' ? 'bg-white/20' : 'bg-gray-100 dark:bg-gray-800'}`}>{paperCounts.all}</span>
                  </button>
                  <button 
                    onClick={() => setPaperSubFilter('noted')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all border paper-pill ${paperSubFilter === 'noted' ? 'bg-scholar-600 text-white border-scholar-600 shadow-sm' : 'bg-white dark:bg-dark-card text-gray-500 dark:text-scholar-400 border-gray-200 dark:border-gray-700 hover:border-scholar-300'}`}
                  >
                      <Bookmark size={14} /> With Notes <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${paperSubFilter === 'noted' ? 'bg-white/20' : 'bg-gray-100 dark:bg-gray-800'}`}>{paperCounts.noted}</span>
                  </button>
              </div>
          )}

          {showFilters && (
            <div className="bg-white/60 dark:bg-dark-card/60 backdrop-blur-md border border-white dark:border-gray-700 rounded-2xl p-4 sm:p-6 mb-8 shadow-scholar animate-fade-in filter-container">
              <div className="flex flex-col gap-4 sm:grid sm:grid-cols-2 lg:grid-cols-5 sm:gap-6 filters-grid filter-grid">
                <div className="sm:col-span-2 space-y-1.5">
                  <label className="text-[10px] sm:text-[11px] font-black text-gray-400 dark:text-scholar-400 uppercase tracking-widest pl-1 filter-label">Keywords</label>
                  <div className="relative group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-scholar-600 dark:group-focus-within:text-scholar-400 transition-colors" />
                    <input 
                      className="w-full bg-white/80 dark:bg-gray-900/80 border border-gray-100 dark:border-gray-800 rounded-xl pl-11 pr-10 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-scholar-400 outline-none focus:ring-2 focus:ring-scholar-500/10 shadow-sm transition-all filter-input"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={`Search...`}
                    />
                    {searchQuery && (
                      <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700">
                        <X size={14} className="text-gray-400 dark:text-scholar-400" />
                      </button>
                    )}
                  </div>
                </div>

                {activeTab === 'notes' && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] sm:text-[11px] font-black text-gray-400 dark:text-scholar-400 uppercase tracking-widest pl-1 filter-label">Source Paper</label>
                    <select 
                      className="w-full bg-white/80 dark:bg-gray-900/80 border border-gray-100 dark:border-gray-800 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-scholar-500/10 shadow-sm appearance-none filter-input"
                      value={localFilters.source}
                      onChange={(e) => setLocalFilters({...localFilters, source: e.target.value})}
                    >
                      <option value="all">All Sources</option>
                      {savedPapers.map(p => <option key={p.uri} value={p.uri}>{p.title}</option>)}
                    </select>
                  </div>
                )}

                {activeTab === 'notes' && uniqueQueries.length > 0 && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] sm:text-[11px] font-black text-gray-400 dark:text-scholar-400 uppercase tracking-widest pl-1 filter-label">Research Query</label>
                    <select 
                      className="w-full bg-white/80 dark:bg-gray-900/80 border border-gray-100 dark:border-gray-800 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-scholar-500/10 shadow-sm appearance-none filter-input"
                      value={localFilters.query}
                      onChange={(e) => setLocalFilters({...localFilters, query: e.target.value})}
                    >
                      <option value="all">All Queries</option>
                      {uniqueQueries.map(query => <option key={query} value={query}>{query}</option>)}
                    </select>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-[10px] sm:text-[11px] font-black text-gray-400 dark:text-scholar-400 uppercase tracking-widest pl-1 filter-label">Sort</label>
                  <select 
                    className="w-full bg-white/80 dark:bg-gray-900/80 border border-gray-100 dark:border-gray-800 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-scholar-500/10 shadow-sm appearance-none filter-input"
                    value={`${sortColumn}-${sortDirection}`}
                    onChange={(e) => {
                      const [column, direction] = e.target.value.split('-');
                      setSortColumn(column);
                      setSortDirection(direction as 'asc' | 'desc');
                    }}
                  >
                    <option value="createdAt-desc">Newest Added</option>
                    <option value="createdAt-asc">Oldest Added</option>
                    <option value="publishedYear-desc">Newest Published</option>
                    <option value="publishedYear-asc">Oldest Published</option>
                    {activeTab === 'notes' && (
                      <>
                        <option value="content-asc">Content A-Z</option>
                        <option value="content-desc">Content Z-A</option>
                      </>
                    )}
                  </select>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'notes' ? (
            <>
              {viewMode === 'table' ? (
                 <NotesTable 
                    notes={paginatedNotes}
                    papers={savedPapers}
                    selectedIds={selectedNoteIds}
                    expandedIds={expandedNotes}
                    expandedId={null} // Manager controls set
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onSort={(col) => { 
                       if (sortColumn === col) setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
                       else { setSortColumn(col); setSortDirection('asc'); }
                    }}
                    onSelect={handleNoteSelect}
                    onExpand={handleToggleExpand}
                    onDelete={(id) => openDeleteNoteModal([id])}
                    onToggleStar={(id, s) => toggleStar(id, s)}
                    onToggleFlag={(id, f) => toggleFlag(id, f)}
                    onEdit={setEditingNoteId}
                    onSaveEdit={async (id, content) => { await updateNote(id, content); setEditingNoteId(null); }}
                    onCancelEdit={() => setEditingNoteId(null)}
                    editingId={editingNoteId}
                    onViewPdf={handleLocateNote}
                 />
              ) : (
                <div className="space-y-1 sm:space-y-2">
                  {paginatedNotes.length > 0 ? paginatedNotes.map((note) => (
                    <NoteCard
                      key={note.id}
                      note={note}
                      viewMode={'list'} // Always list if not table
                      isSelected={selectedNoteIds.includes(note.id)}
                      isExpanded={expandedNotes.has(note.id)}
                      isEditing={editingNoteId === note.id}
                      onSelect={() => handleNoteSelect(note.id)}
                      onCardClick={() => handleToggleExpand(note.id)}
                      onToggleStar={() => toggleStar(note.id, !note.is_starred)}
                      onToggleFlag={() => toggleFlag(note.id, !note.is_flagged)}
                      onEdit={() => setEditingNoteId(note.id)}
                      onSaveEdit={async (id, content) => { await updateNote(id, content); setEditingNoteId(null); }}
                      onCancelEdit={() => setEditingNoteId(null)}
                      onDelete={() => openDeleteNoteModal([note.id])}
                      paper={paperByUri.get(note.paper_uri)}
                    />
                  )) : (
                    <div className="col-span-full py-24 sm:py-48 flex flex-col items-center justify-center text-center opacity-40">
                       <Library size={64} className="sm:w-[96px] sm:h-[96px] mb-6 text-gray-300 dark:text-gray-600" />
                       <h3 className="text-xl sm:text-2xl font-bold text-gray-800 dark:text-white">No notes found</h3>
                       <p className="text-xs sm:text-sm max-w-xs leading-relaxed text-gray-500 dark:text-gray-400">Save meaningful insights from your research to populate this section.</p>
                    </div>
                  )}
                </div>
              )}
            </> 
          ) : (
            <>
              {viewMode === 'table' ? (
                <PapersTable 
                   papers={paginatedPapers}
                   selectedUris={uiSelectedPaperUris}
                   expandedUris={expandedPapers}
                   sortColumn={sortColumn}
                   sortDirection={sortDirection}
                   onSort={(col) => {
                      if (sortColumn === col) setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
                      else { setSortColumn(col); setSortDirection('asc'); }
                   }}
                   onSelect={(paper) => {
                     // FIXED: Use handleUiPaperSelect to add to AgentResearcher context
                     handleUiPaperSelect(paper.uri);
                   }}
                   onExpand={handleTogglePaperExpand}
                   onDelete={openDeletePaperModal}
                   onView={(p) => {
                      loadPdfFromUrl(p.uri, p.title);
                      setActivePdf(p.uri);
                      setColumnVisibility(prev => ({ ...prev, right: true }));
                   }}
                   getNotesCount={(uri) => savedNotes.filter(n => n.paper_uri === uri).length}
                   isDownloading={(uri) => downloadingUris.has(uri)}
                   isFailed={(uri) => failedUris.has(uri)}
                />
              ) : (
                <div className="space-y-4">
                  {paginatedPapers.length > 0 ? paginatedPapers.map((paper) => (
                    <LibraryPaperCard 
                      key={paper.uri}
                      paper={paper}
                      isSelected={uiSelectedPaperUris.includes(paper.uri)}
                      isExpanded={expandedPapers.has(paper.uri)}
                      onSelect={() => handleUiPaperSelect(paper.uri)}
                      onToggleExpand={() => handleTogglePaperExpand(paper.uri)}
                      notes={savedNotes.filter(n => n.paper_uri === paper.uri)}
                      onDelete={() => openDeletePaperModal(paper)}
                    />
                  )) : (
                      <div className="col-span-full py-24 sm:py-48 flex flex-col items-center justify-center text-center opacity-40">
                        <FileText size={64} className="sm:w-[96px] sm:h-[96px] mb-6 text-gray-300 dark:text-gray-600" />
                        <h3 className="text-xl sm:text-2xl font-bold text-gray-800 dark:text-white">No papers match this filter</h3>
                        <p className="text-xs sm:text-sm max-w-xs leading-relaxed text-gray-500 dark:text-gray-400">Try changing your sub-filter or search query.</p>
                      </div>
                  )}
                </div>
              )}
            </>
          )}

          {(activeTab === 'notes' ? filteredNotes.length : filteredPapers.length) > PAGE_SIZE && (
            <div className="flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-8 mt-12 sm:mt-16 mb-12 pagination-controls">
               <div className="flex items-center gap-4">
                 <button 
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))} 
                  disabled={currentPage === 1} 
                  className="px-6 py-2 rounded-xl font-bold text-gray-500 dark:text-gray-400 bg-white/40 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-700 hover:border-scholar-200 dark:hover:border-scholar-800 hover:text-scholar-600 dark:hover:text-scholar-400 disabled:opacity-30 transition-all text-sm shadow-sm"
                 >
                   Previous
                 </button>
                 
                 <div className="flex items-center gap-2">
                   <span className="text-xs font-black text-scholar-600 dark:text-scholar-400 uppercase tracking-tighter">Page</span>
                   <span className="text-lg font-bold text-gray-900 dark:text-white">{currentPage}</span>
                   <span className="text-xs font-black text-gray-300 dark:text-scholar-400 uppercase tracking-tighter">of</span>
                   <span className="text-lg font-bold text-gray-400 dark:text-scholar-400">{Math.ceil((activeTab === 'notes' ? filteredNotes.length : filteredPapers.length) / PAGE_SIZE)}</span>
                 </div>

                 <button 
                  onClick={() => setCurrentPage(p => Math.min(Math.ceil((activeTab === 'notes' ? filteredNotes.length : filteredPapers.length) / PAGE_SIZE), p + 1))} 
                  disabled={currentPage === Math.ceil((activeTab === 'notes' ? filteredNotes.length : filteredPapers.length) / PAGE_SIZE)} 
                  className="px-6 py-2 rounded-xl font-bold text-gray-500 dark:text-gray-400 bg-white/40 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-700 hover:border-scholar-200 dark:hover:border-scholar-800 hover:text-scholar-600 dark:hover:text-scholar-400 disabled:opacity-30 transition-all text-sm shadow-sm"
                 >
                   Next
                 </button>
               </div>
            </div>
          )}
        </div>
      </div>

      {deleteModal.isOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-transparent" onClick={() => !deleteModal.isProcessing && setDeleteModal(prev => ({ ...prev, isOpen: false }))} />
          
          <div className="relative w-full max-w-sm bg-white dark:bg-gray-900 rounded-xl shadow-2xl ring-1 ring-gray-900/5 dark:ring-white/10 p-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="text-center mb-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                {deleteModal.paperUri 
                  ? (deleteModal.notesCount ? 'Delete Paper & Insights?' : 'Delete Paper?') 
                  : 'Remove Insight?'}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                {deleteModal.paperUri 
                   ? (deleteModal.notesCount 
                      ? `This will remove "${deleteModal.paperTitle}" and ${deleteModal.notesCount} notes.` 
                      : `Are you sure you want to remove this paper from your library?`)
                   : `This action cannot be undone.`}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={() => setDeleteModal(prev => ({ ...prev, isOpen: false }))}
                disabled={deleteModal.isProcessing}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleConfirmDelete}
                disabled={deleteModal.isProcessing}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm transition-colors flex items-center justify-center gap-2"
              >
                {deleteModal.isProcessing ? <Loader2 size={16} className="animate-spin" /> : null}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function LibraryPaperCard({ paper, isSelected, isExpanded, onSelect, onToggleExpand, notes, onDelete }) {
  const { loadPdfFromUrl, setActivePdf, setSearchHighlight, downloadingUris, failedUris } = useLibrary();
  const { setColumnVisibility, setLibraryExpanded, setLibraryOpen } = useUI();
  const { deleteNote, toggleStar, toggleFlag, updateNote } = useDatabase();

  const isDownloading = downloadingUris.has(paper.uri);
  const isFailed = failedUris.has(paper.uri);

  const handleOpenPdf = (e: React.MouseEvent) => {
    e.stopPropagation();
    loadPdfFromUrl(paper.uri, paper.title);
    setActivePdf(paper.uri);
    setColumnVisibility(prev => ({ ...prev, right: true }));
    setLibraryExpanded(false);
    setLibraryOpen(false);
  };

  const handleLocateNote = (note: any) => {
    const cleanedQuote = note.content.replace(/^[\W\d]+|[\W\d]+$/g, '').trim();
    loadPdfFromUrl(paper.uri, paper.title);
    setActivePdf(paper.uri);
    setSearchHighlight(cleanedQuote);
    setColumnVisibility(prev => ({ ...prev, right: true }));
    setLibraryExpanded(false);
    setLibraryOpen(false);
  };

  const authors = Array.isArray(paper.authors) ? paper.authors.join(', ') : (paper.authors || 'Unknown Authors');
  const year = paper.created_at ? new Date(paper.created_at).getFullYear() : '';
  const domain = new URL(paper.uri).hostname;

  return (
    <div className="group/paper animate-fade-in mb-6 relative transition-colors bg-white dark:bg-dark-card border border-gray-100 dark:border-gray-800 rounded-xl overflow-hidden shadow-sm hover:shadow-md">
      <div className={isExpanded ? 'p-1' : ''}>
        <div className="flex items-start p-4 sm:p-5">
          <div className="pt-1 mr-2 sm:mr-4">
            <button 
                onClick={(e) => { e.stopPropagation(); onSelect(); }} 
                className={`hover:text-scholar-600 dark:hover:text-scholar-400 transition-colors opacity-100 sm:group-hover/paper:opacity-100 ${isSelected ? 'text-scholar-600 dark:text-scholar-400' : 'text-gray-300 dark:text-gray-500 sm:opacity-0'}`}
            > 
             {isDownloading ? <Loader2 size={24} className="animate-spin text-scholar-600 dark:text-scholar-400" />
              : isSelected ? <Check size={24} className="text-scholar-600 dark:text-scholar-400" /> : <Square size={24} />
              }
            </button>
          </div>

          <div className="flex-grow min-w-0">
            <div className="flex items-center justify-between mb-1">
               <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-scholar-400">
                  <span className="font-bold text-scholar-600 dark:text-scholar-400 uppercase tracking-wider">{year || 'DOCUMENT'}</span>
                  <span>•</span>
                  <span className="truncate max-w-[200px] opacity-70 font-medium">{authors}</span>
                  <span className="hidden sm:inline opacity-40">•</span>
                  <span className="hidden sm:inline truncate opacity-40 text-[10px]">{domain}</span>

                  <div className="flex items-center gap-2 ml-4 opacity-100 sm:opacity-0 sm:group-hover/paper:opacity-100 transition-opacity">
                    <button onClick={handleOpenPdf} className="flex items-center gap-1 text-xs font-bold text-scholar-600 dark:text-scholar-400 bg-scholar-50 dark:bg-scholar-900/30 px-2 py-1 rounded-md transition-colors border border-scholar-100 dark:border-scholar-800">
                      <BookText size={12} /> View
                    </button>
                    <button 
                        onClick={(e) => { e.stopPropagation(); onDelete(); }} 
                        className="p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-all"
                        title="Delete paper"
                    >
                        <Trash2 size={16} />
                    </button>
                  </div>
               </div>
            </div>

            <h3 className="text-base sm:text-xl font-bold text-gray-900 dark:text-white leading-snug mb-2 cursor-pointer hover:text-scholar-600 dark:hover:text-scholar-400 transition-colors" onClick={handleOpenPdf}>
              {paper.title}
            </h3>

            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed line-clamp-2 mb-3 italic opacity-80">
              {paper.abstract || "No academic abstract available."}
            </p>

            <div className="flex items-center justify-between mt-2">
                <div className="flex items-center gap-3">
                   {notes.length > 0 ? (
                      <button onClick={(e) => { e.stopPropagation(); onToggleExpand(); }} className="flex items-center gap-1.5 text-sm font-bold text-scholar-600 dark:text-scholar-400 hover:text-scholar-700 transition-colors">
                        {notes.length} Note{notes.length !== 1 ? 's' : ''} {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </button>
                   ) : (
                      <span className="text-xs text-gray-400 dark:text-gray-500 italic">No notes captured</span>
                   )}
                </div>
            </div>

            {isExpanded && notes.length > 0 && (
              <div className="mt-4 pl-0 sm:pl-4 border-l-0 sm:border-l-2 border-scholar-50 dark:border-scholar-900 space-y-3 pb-2">
                 {notes.map((note, idx) => (
                    <NoteCard 
                      key={note.id}
                      note={note}
                      viewMode="grid"
                      isSelected={false}
                      isExpanded={false}
                      isEditing={false}
                      onSelect={() => {}}
                      onCardClick={() => handleLocateNote(note)}
                      onToggleStar={() => toggleStar(note.id, !note.is_starred)}
                      onToggleFlag={() => toggleFlag(note.id, !note.is_flagged)}
                      onEdit={() => {}}
                      onSaveEdit={async (id, content) => await updateNote(id, content)}
                      onCancelEdit={() => {}}
                      onDelete={() => deleteNote(note.id)}
                      paper={paper}
                    />
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function NoteCard({
  note,
  viewMode,
  isSelected,
  isExpanded,
  isEditing,
  onSelect,
  onCardClick,
  onToggleStar,
  onToggleFlag,
  onEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  paper
}) {
  const [editContent, setEditContent] = useState(note.content);
  const [isSavingLocal, setIsSavingLocal] = useState(false);
  const [justCopied, setJustCopied] = useState(false);
  const [showCopyMenu, setShowCopyMenu] = useState(false);
  const copyMenuRef = useRef<HTMLDivElement>(null);
  
  const { setSearchHighlight, loadPdfFromUrl, setActivePdf } = useLibrary();
  const { setColumnVisibility, setLibraryExpanded, setLibraryOpen } = useUI();

  useEffect(() => {
    if (isEditing) {
      setEditContent(note.content);
      setIsSavingLocal(false);
    }
  }, [isEditing, note.content]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (copyMenuRef.current && !copyMenuRef.current.contains(e.target as Node)) {
        setShowCopyMenu(false);
      }
    };
    if (showCopyMenu) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showCopyMenu]);

  const handleActionClick = (e: React.MouseEvent) => e.stopPropagation();
  
  const handleOpenPdf = (e: React.MouseEvent) => {
    e.stopPropagation();
    loadPdfFromUrl(note.paper_uri, paper?.title);
    setActivePdf(note.paper_uri);
    setColumnVisibility(prev => ({ ...prev, right: true }));
    setLibraryExpanded(false);
    setLibraryOpen(false);
  };

  const handleViewPdfWithHighlight = (e: React.MouseEvent) => {
    handleActionClick(e);
    const cleanedQuote = note.content.replace(/^[\W\d]+|[\W\d]+$/g, '').trim();
    loadPdfFromUrl(note.paper_uri, paper?.title);
    setActivePdf(note.paper_uri);
    setSearchHighlight(cleanedQuote);
    setColumnVisibility(prev => ({ ...prev, right: true }));
    setLibraryExpanded(false);
    setLibraryOpen(false);
  };

  const handleCopyRaw = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(note.content);
    setJustCopied(true);
    setShowCopyMenu(false);
    setTimeout(() => setJustCopied(false), 2000);
  };

  const handleCopyFull = (e: React.MouseEvent) => {
    e.stopPropagation();
    const text = formatFullNote(note, paper);
    navigator.clipboard.writeText(text);
    setJustCopied(true);
    setShowCopyMenu(false);
    setTimeout(() => setJustCopied(false), 2000);
  };

  const handleSave = async (e: React.MouseEvent) => {
    handleActionClick(e);
    if (!editContent.trim()) return;
    setIsSavingLocal(true);
    try { await onSaveEdit(note.id, editContent); } catch (err) { setIsSavingLocal(false); }
  };

  const sourceTitle = paper?.title || 'Unknown Source';
  const TRUNCATE_LENGTH = viewMode === 'grid' ? 140 : 250;
  const isLong = note.content.length > TRUNCATE_LENGTH;
  const truncatedContent = isLong && !isExpanded ? `${note.content.substring(0, TRUNCATE_LENGTH)}...` : note.content;

  return (
    <div 
      className={`relative group transition-all duration-500 ease-out border rounded-xl sm:rounded-[1.5rem] overflow-hidden animate-fade-in
        ${isExpanded || isSelected ? "bg-white dark:bg-dark-card border-gray-100 dark:border-gray-700 shadow-scholar-lg z-10" : "bg-transparent border-transparent hover:bg-white hover:border-gray-100 dark:hover:bg-dark-card dark:hover:border-gray-700 hover:shadow-md"} 
        ${isSelected 
          ? 'ring-2 ring-scholar-600/10 border-scholar-600 dark:border-scholar-500' 
          : ''
        } 
        ${isExpanded ? 'ring-1 ring-scholar-100 dark:ring-scholar-900' : 'hover:-translate-y-0.5'}
        ${viewMode === 'grid' ? 'flex flex-col h-full' : ''}
      `}
    >
      <div className={`p-4 sm:p-5 ${isExpanded ? 'bg-opacity-50' : ''}`}>
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="pt-0.5 sm:pt-1 flex-shrink-0">
             <button 
                onClick={(e) => { handleActionClick(e); onSelect(); }} 
                className={`transition-all transform hover:scale-110 opacity-100 sm:group-hover:opacity-100 ${isSelected ? 'text-scholar-600 dark:text-scholar-400' : 'text-gray-300 dark:text-gray-500 sm:opacity-0 hover:text-scholar-600 dark:hover:text-scholar-400'}`}
             >
                {isSelected ? <Check size={18} className="stroke-[3px] sm:w-[22px] sm:h-[22px]" /> : <Square size={18} className="sm:w-[22px] sm:h-[22px]" />}
             </button>
          </div>
          
          <div className="flex-grow cursor-pointer min-w-0" onClick={onCardClick}>
             {sourceTitle && viewMode === 'list' && (
               <div className="mb-2 sm:mb-3 pb-1.5 sm:pb-2 border-b border-gray-50 dark:border-gray-700 group/title flex items-center gap-2" onClick={handleOpenPdf}>
                 <FileText size={10} className="sm:w-[12px] sm:h-[12px] text-gray-400 dark:text-scholar-400" />
                 <span className="text-[9px] sm:text-[10px] font-black text-gray-400 dark:text-scholar-400 uppercase tracking-widest truncate group-hover/title:text-scholar-600 dark:group-hover/title:text-scholar-400 transition-colors">
                    {sourceTitle}
                 </span>
               </div>
             )}
             
             {isEditing ? (
               <div className="space-y-3 sm:space-y-4 py-1 sm:py-2" onClick={handleActionClick}>
                 <textarea
                   className="w-full p-4 sm:p-5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl sm:rounded-2xl outline-none text-xs sm:text-sm font-sans italic text-gray-900 dark:text-gray-100 focus:ring-4 focus:ring-scholar-500/5 transition-all"
                   value={editContent}
                   onChange={(e) => setEditContent(e.target.value)}
                   rows={4}
                   autoFocus
                   disabled={isSavingLocal}
                 />
                 <div className="flex gap-2 sm:gap-3 justify-end">
                   <button className="px-4 sm:px-5 py-2 text-[10px] sm:text-xs font-black uppercase tracking-widest text-gray-400 hover:text-gray-600 disabled:opacity-50" onClick={onCancelEdit} disabled={isSavingLocal}>Cancel</button>
                   <button className="px-5 sm:px-6 py-2 sm:py-2.5 text-[10px] sm:text-xs font-black uppercase tracking-widest bg-scholar-600 text-white rounded-lg sm:rounded-xl shadow-lg hover:bg-scholar-700 disabled:opacity-50 flex items-center gap-2 transition-all" onClick={handleSave} disabled={isSavingLocal || !editContent.trim()}>
                     {isSavingLocal ? <Loader2 size={12} className="animate-spin" /> : 'Save'}
                   </button>
                 </div>
               </div>
             ) : (
               <div className="relative">
                 <p className={`text-sm sm:text-lg text-gray-800 dark:text-white leading-relaxed font-serif italic ${!isExpanded ? 'line-clamp-4' : ''}`}>
                   "{isExpanded ? note.content : truncatedContent}"
                 </p>
    
               </div>
             )}

             <div className="flex items-center mt-4 sm:mt-5 gap-2 sm:gap-3 flex-wrap">
                <span className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-scholar-400 text-[8px] sm:text-[10px] font-black uppercase tracking-tighter px-2 sm:px-3 py-0.5 sm:py-1 rounded-full border border-gray-100 dark:border-gray-700">PAGE {note.page_number}</span>
                {note.is_starred && <span className=" text-[8px] text-amber-600 sm:text-[9px] font-black px-2 sm:px-3 py-0.5 sm:py-1 rounded-full tracking-widest uppercase"><Star size={10} className="sm:w-[18px] sm:h-[18px]" fill={note.is_starred ? "currentColor" : "none"} /></span>}
                {note.is_flagged && <span className="  text-[8px] text-red-600 sm:text-[9px] font-black px-2 sm:px-3 py-0.5 sm:py-1 rounded-full tracking-widest uppercase"><Flag size={10} className="sm:w-[18px] sm:h-[18px]" fill={note.is_flagged ? "currentColor" : "none"} /></span>}
                
                {!isExpanded && !isEditing && (
                   <span className="text-xs text-scholar-600 dark:text-scholar-400 font-medium hover:underline opacity-0 group-hover:opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 ml-auto">Show details</span>
                )}
             </div>
          </div>
        </div>

        {!isEditing && (
          <div 
            className={`absolute top-1 right-1 flex items-center gap-0.5 sm:gap-1 p-1 sm:p-1.5 rounded-xl transition-all duration-500 ease-out bg-white/90 dark:bg-dark-card/90  border-l border-b border-gray-100 dark:border-gray-700 shadow-scholar
            ${isExpanded || isSelected ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 group-hover:opacity-100 group-hover:translate-y-0'}`} 
            onClick={handleActionClick}
          >
            <button 
              onClick={onToggleStar} 
              className={`w-7 h-7 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl flex items-center justify-center transition-all ${note.is_starred ? ' text-amber-600 ' : 'text-gray-400 dark:text-scholar-400 hover:bg-gray-50 hover:text-amber-500'}`}
              title="Favorite"
            >
              <Star size={14} className="sm:w-[18px] sm:h-[18px]" fill={note.is_starred ? "currentColor" : "none"} />
            </button>
            <button 
              onClick={onToggleFlag} 
              className={`w-7 h-7 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl flex items-center justify-center transition-all ${note.is_flagged ? ' text-red-600 ' : 'text-gray-400 dark:text-scholar-400 hover:bg-gray-50 hover:text-red-500'}`}
              title="Flag"
            >
              <Flag size={14} className="sm:w-[18px] sm:h-[18px]" fill={note.is_flagged ? "currentColor" : "none"} />
            </button>
            <button onClick={onEdit} className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl flex items-center justify-center text-gray-400 dark:text-scholar-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-scholar-600 dark:hover:text-scholar-400 transition-all" title="Edit"><Edit3 size={14} className="sm:w-[18px] sm:h-[18px]" /></button>

             <button onClick={handleViewPdfWithHighlight} className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl flex items-center justify-center text-gray-400 dark:text-scholar-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-scholar-600 dark:hover:text-scholar-400 transition-all"><TextSearch size={14}  className="sm:w-[18px] sm:h-[18px]" /></button>
            
            <div className="relative" ref={copyMenuRef}>
              <button 
                onClick={(e) => { e.stopPropagation(); setShowCopyMenu(!showCopyMenu); }} 
                className={`px-1.5 sm:px-2 h-7 sm:h-9 rounded-lg sm:rounded-xl flex items-center justify-center transition-all gap-1 ${showCopyMenu ? 'bg-scholar-600 text-white' : 'text-gray-400 dark:text-scholar-400 hover:bg-gray-50 hover:text-gray-900'}`}
              >
                {justCopied ? <Check size={14} className="sm:w-[18px] sm:h-[18px]" /> : <Copy size={14} className="sm:w-[18px] sm:h-[18px]" />}
                <ChevronDown size={10} className={`transition-transform duration-300 ${showCopyMenu ? 'rotate-180' : ''}`} />
              </button>
              {showCopyMenu && (
                <div className="absolute top-full right-0 mt-1 w-40 sm:w-48 bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-700 py-1 sm:py-1.5 z-50 text-gray-900 dark:text-white animate-fade-in origin-top-right">
                   <button onClick={handleCopyRaw} className="w-full text-left px-3 sm:px-4 py-2 text-[9px] sm:text-xs font-bold uppercase tracking-widest hover:bg-scholar-50 dark:hover:bg-scholar-900/30 flex items-center gap-2 sm:gap-3 transition-colors">
                     <FileText size={12} className="sm:w-[14px] sm:h-[14px] text-gray-400" /> Copy Text
                   </button>
                   <button onClick={handleCopyFull} className="w-full text-left px-3 sm:px-4 py-2 text-[9px] sm:text-xs font-bold uppercase tracking-widest hover:bg-scholar-50 dark:hover:bg-scholar-900/30 flex items-center gap-2 sm:gap-3 transition-colors">
                     <FileJson size={12} className="sm:w-[14px] sm:h-[14px] text-scholar-600 dark:text-scholar-400" /> Citation
                   </button>
                </div>
              )}
            </div>

            <button onClick={onDelete} className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl flex items-center justify-center text-gray-400 dark:text-scholar-400 hover:bg-red-50 hover:text-red-600 transition-all" title="Delete"><Trash2 size={14} className="sm:w-[18px] sm:h-[18px]" /></button>
          </div>
        )}

        {isExpanded && !isEditing && (
           <div className="mt-6 sm:mt-8 space-y-4 sm:space-y-6 pt-4 sm:pt-6 border-t border-gray-100 dark:border-gray-800 animate-fade-in">
               {note.justification && (
                  <div className="bg-scholar-50/50 dark:bg-scholar-900/20 rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-scholar-100/50 dark:border-scholar-800/30">
                     <h4 className="text-scholar-800 dark:text-scholar-400 text-[8px] sm:text-[10px] font-black uppercase tracking-widest mb-2 sm:mb-3 flex items-center gap-2">
                        <Lightbulb size={12} className="sm:w-[14px] sm:h-[14px] text-scholar-500" /> Contextual Insight
                     </h4>
                     <p className="text-gray-700 dark:text-white text-xs sm:text-sm leading-relaxed font-medium">
                        {note.justification}
                     </p>
                  </div>
               )}

               {note.citations && note.citations.length > 0 && (
                  <div className="px-1">
                     <h4 className="text-gray-400 dark:text-scholar-400 text-[8px] sm:text-[10px] font-black uppercase tracking-widest mb-3 sm:mb-4 flex items-center gap-2">
                        <BookOpenText size={12} className="sm:w-[14px] sm:h-[14px]" /> Academic References
                     </h4>
                     <ul className="space-y-3 sm:space-y-4">
                        {note.citations.map((cit: any, idx: number) => (
                           <li key={idx} className="text-sm text-gray-600 dark:text-white leading-relaxed pl-3 sm:pl-4 border-l-2 border-scholar-200 dark:border-scholar-800 group/cit">
                              <span className="font-black text-scholar-700 dark:text-scholar-400 text-[8px] sm:text-[10px] mr-1 sm:mr-2 bg-scholar-50 dark:bg-scholar-900/60 px-1.5 py-0.5 rounded-md">
                                 {cit.inline}
                              </span>
                              <span className="font-medium">{cit.full}</span>
                           </li>
                        ))}
                     </ul>
                  </div>
               )}
               
               <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-4 border-t border-gray-50 dark:border-gray-800">
                  <div className="flex items-center gap-2">
                    <span className="text-[8px] sm:text-[10px] font-black text-gray-300 dark:text-scholar-400 uppercase tracking-widest">Saved date {note.created_at ? new Date(note.created_at).toLocaleDateString() : 'recent'}</span>
                  </div>
                  {note.related_question && (
                    <div className="flex items-center gap-2 text-left sm:text-right max-w-full">
                        <span className="text-[8px] font-black text-gray-300 dark:text-scholar-400 uppercase tracking-widest whitespace-nowrap">Query:</span>
                        <span className="text-[9px] sm:text-[10px] font-bold text-gray-400 dark:text-white italic truncate">"{note.related_question}"</span>
                    </div>
                  )}
               </div>
           </div>
        )}
      </div>
    </div>
  );
}