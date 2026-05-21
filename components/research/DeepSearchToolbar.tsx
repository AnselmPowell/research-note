import React, { useRef, useEffect } from 'react';
import { SortOption } from './deepSearchUtils';
import {
  Check,
  Minus,
  ChevronDown,
  X,
  Copy,
  Layers,
  LayoutList,
  ChevronsUp,
  ChevronsDown,
  Filter,
  Star,
  Calendar,
  Sparkles,
  Loader2,
  FileText,
} from 'lucide-react';

export interface DeepSearchToolbarProps {
  // View state
  sortBy: SortOption;
  setSortBy: (s: SortOption) => void;
  isSortOpen: boolean;
  setIsSortOpen: (v: boolean) => void;
  showFilters: boolean;
  setShowFilters: (v: boolean) => void;
  allNotesExpanded: boolean;
  setAllNotesExpanded: (v: boolean) => void;
  // Selection state
  selectedArxivIds: Set<string>;
  selectedNoteIds: string[];
  isSelectMenuOpen: boolean;
  setIsSelectMenuOpen: (v: boolean) => void;
  isNoteSelectMenuOpen: boolean;
  setIsNoteSelectMenuOpen: (v: boolean) => void;
  showBulkCopyMenu: boolean;
  setShowBulkCopyMenu: (v: boolean) => void;
  justCopiedNotes: boolean;
  // Counts
  selectablePapersCount: number;
  selectableTotalCount: number;
  selectableNotesPageCount: number;
  selectableNotesTotalCount: number;
  contentLength: number;
  // Booleans derived from parent data
  hasAnyNotes: boolean;
  isFilterActive: boolean;
  // Research state
  researchPhase: string;
  hasRankedOnce: boolean;
  topNoteIds: string[];
  // Handlers
  onSelectPage: () => void;
  onSelectAllTotal: () => void;
  onSelectNotesPage: () => void;
  onSelectAllNotes: () => void;
  onClearSelection: () => void;
  onClearSelectedNotes: () => void;
  onBulkCopyNotes: (mode: 'raw' | 'full') => void;
  onShowClearModal: () => void;
  onSetCurrentPage: (page: number) => void;
  rankTopNotes: () => void;
}

export const DeepSearchToolbar: React.FC<DeepSearchToolbarProps> = ({
  sortBy, setSortBy, isSortOpen, setIsSortOpen,
  showFilters, setShowFilters, allNotesExpanded, setAllNotesExpanded,
  selectedArxivIds, selectedNoteIds,
  isSelectMenuOpen, setIsSelectMenuOpen,
  isNoteSelectMenuOpen, setIsNoteSelectMenuOpen,
  showBulkCopyMenu, setShowBulkCopyMenu, justCopiedNotes,
  selectablePapersCount, selectableTotalCount,
  selectableNotesPageCount, selectableNotesTotalCount, contentLength,
  hasAnyNotes, isFilterActive,
  researchPhase, hasRankedOnce, topNoteIds,
  onSelectPage, onSelectAllTotal, onSelectNotesPage, onSelectAllNotes,
  onClearSelection, onClearSelectedNotes, onBulkCopyNotes, onShowClearModal,
  onSetCurrentPage, rankTopNotes,
}) => {
  const sortDropdownRef = useRef<HTMLDivElement>(null);
  const bulkCopyRef = useRef<HTMLDivElement>(null);

  // Close sort dropdown on outside click
  useEffect(() => {
    if (!isSortOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(e.target as Node)) {
        setIsSortOpen(false);
      }
    };
    document.addEventListener('mouseup', handleClickOutside);
    return () => document.removeEventListener('mouseup', handleClickOutside);
  }, [isSortOpen, setIsSortOpen]);

  return (
    <div className="relative z-20 flex items-center justify-between mb-4 px-1 animate-fade-in">

      {/* LEFT: Selection + Bulk actions */}
      <div className="flex items-center gap-2">

        {/* Paper Selection Dropdown */}
        {sortBy !== 'most-relevant-notes' && contentLength > 0 && (
          <div className="relative z-30" style={{ overflow: 'visible' }}>
            <button
              onClick={() => setIsSelectMenuOpen(!isSelectMenuOpen)}
              className="flex items-center gap-1 p-2 opacity-100 text-gray-500 dark:text-gray-400 hover:text-scholar-600 dark:hover:text-scholar-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-all "
              title="Selection options"
            >
              <div className={`w-6 h-6 rounded border-2 transition-colors flex items-center justify-center ${selectedArxivIds.size === contentLength ? 'bg-scholar-600 border-scholar-600' :
                selectedArxivIds.size > 0 ? 'bg-scholar-100 dark:bg-scholar-900/30 border-scholar-600' : 'border-gray-400 dark:border-gray-500'
                }`}>
                {selectedArxivIds.size === contentLength ? <Check size={16} color="white" strokeWidth={3} /> :
                  selectedArxivIds.size > 0 ? <Minus size={16} className="text-scholar-600 dark:text-scholar-400" strokeWidth={3} /> : null}
              </div>
              <ChevronDown size={14} className="opacity-60" />
            </button>

            {isSelectMenuOpen && (
              <>
                <div className="fixed inset-0 z-40 pointer-events-auto" onClick={() => setIsSelectMenuOpen(false)} />
                <div className="absolute left-0 top-full mt-2 w-64 bg-white dark:bg-dark-card rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 py-1.5 animate-fade-in pointer-events-auto" style={{ overflow: 'visible' }}>
                  <button
                    onClick={onSelectPage}
                    className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    <LayoutList size={16} className="text-gray-400" />
                    <span className="text-sm font-medium text-gray-700 dark:text-white">Select Current Page ({selectablePapersCount})</span>
                  </button>
                  <button
                    onClick={onSelectAllTotal}
                    className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    <Layers size={16} className="text-gray-400" />
                    <span className="text-sm font-medium text-gray-700 dark:text-white">Select All Total ({selectableTotalCount})</span>
                  </button>

                  <div className="h-px bg-gray-100 dark:bg-gray-700 mx-3 my-1" />

                  <button
                    onClick={onClearSelection}
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
              onClick={() => setIsNoteSelectMenuOpen(!isNoteSelectMenuOpen)}
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
                <div className="fixed inset-0 z-40 pointer-events-auto" onClick={() => setIsNoteSelectMenuOpen(false)} />
                <div className="absolute left-0 top-full mt-2 w-72 bg-white dark:bg-dark-card rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 py-1.5 animate-fade-in pointer-events-auto" style={{ overflow: 'visible' }}>
                  <button
                    onClick={onSelectNotesPage}
                    className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    <LayoutList size={16} className="text-gray-400" />
                    <span className="text-sm font-medium text-gray-700 dark:text-white">Select Page ({selectableNotesPageCount})</span>
                  </button>
                  <button
                    onClick={onSelectAllNotes}
                    className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    <Layers size={16} className="text-gray-400" />
                    <span className="text-sm font-medium text-gray-700 dark:text-white">Select All Total ({selectableNotesTotalCount})</span>
                  </button>
                  <div className="h-px bg-gray-100 dark:bg-gray-700 mx-3 my-1" />
                  <button
                    onClick={onClearSelectedNotes}
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
                    onClick={() => onBulkCopyNotes('raw')}
                    className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    <FileText size={16} className="text-gray-400" />
                    <span className="text-sm font-medium text-gray-700 dark:text-white">Copy Quotes Only</span>
                  </button>
                  <button
                    onClick={() => onBulkCopyNotes('full')}
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

        {/* Clear All Results Button */}
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
        {/* Top 5 Insights Button */}
        {selectableNotesTotalCount > 10 && researchPhase === 'completed' && !hasRankedOnce && (
          <button
            onClick={(e) => {
              e.stopPropagation();
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
              if (sortBy === 'most-relevant-notes') {
                setIsSortOpen(!isSortOpen);
              } else {
                setSortBy('most-relevant-notes');
                onSetCurrentPage(1);
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
                <button onClick={() => { setSortBy('most-relevant-notes'); onSetCurrentPage(1); setIsSortOpen(false); }} className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  <Star size={16} className={sortBy === 'most-relevant-notes' ? "text-scholar-600 dark:text-scholar-400" : "text-gray-400"} />
                  <span className="text-sm font-medium dark:text-white">Most Relevant Notes</span>
                </button>
                <div className="h-px bg-gray-100 dark:bg-gray-700 mx-3 my-1" />
                <button onClick={() => { setSortBy('relevant-papers'); setAllNotesExpanded(false); onSetCurrentPage(1); setIsSortOpen(false); }} className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  <Layers size={16} className={sortBy === 'relevant-papers' ? "text-scholar-600 dark:text-scholar-400" : "text-gray-400"} />
                  <span className="text-sm font-medium dark:text-white">Relevant Papers</span>
                </button>
                <button onClick={() => { setSortBy('newest-papers'); setAllNotesExpanded(false); onSetCurrentPage(1); setIsSortOpen(false); }} className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  <Calendar size={16} className={sortBy === 'newest-papers' ? "text-scholar-600 dark:text-scholar-400" : "text-gray-400"} />
                  <span className="text-sm font-medium dark:text-white">Newest Papers</span>
                </button>
              </div>
            </>
          )}
        </div>

        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-2 px-3 py-2.5 text-xs font-bold rounded-lg transition-all ${showFilters || isFilterActive
            ? 'text-scholar-600 dark:text-scholar-400 bg-scholar-50 dark:bg-scholar-900/30'
            : 'text-gray-600 dark:text-gray-300 hover:text-scholar-600 dark:hover:text-scholar-400 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          title="Filter options"
        >
          <Filter size={20} />
          <span>Filters</span>
        </button>

        {sortBy !== 'most-relevant-notes' && hasAnyNotes && (
          <button
            onClick={() => setAllNotesExpanded(!allNotesExpanded)}
            className="flex items-center gap-2 px-3 py-2.5 text-xs font-bold text-gray-600 dark:text-gray-300 hover:text-scholar-600 dark:hover:text-scholar-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-all"
            title={allNotesExpanded ? 'Collapse all notes' : 'Expand all notes'}
          >
            {allNotesExpanded ? <ChevronsUp size={20} /> : <ChevronsDown size={20} />}
            <span>{allNotesExpanded ? 'Collapse' : 'Expand'} Notes</span>
          </button>
        )}
      </div>
    </div>
  );
};
