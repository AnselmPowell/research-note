import React, { useState } from 'react';
import { Search, ChevronDown, X } from 'lucide-react';
import { truncateWords } from './deepSearchUtils';

interface FilterState {
  paper: string;
  query: string;
  hasNotes: boolean;
}

interface UniquePaper {
  id: string;
  title: string;
  noteCount: number;
}

interface UniqueQuery {
  query: string;
  noteCount: number;
}

export interface DeepSearchFilterPanelProps {
  sortBy: string;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  localFilters: FilterState;
  setLocalFilters: (f: FilterState) => void;
  uniquePapers: UniquePaper[];
  uniqueQueries: UniqueQuery[];
  onClose: () => void;
  onReset: () => void;
}

export const DeepSearchFilterPanel: React.FC<DeepSearchFilterPanelProps> = ({
  sortBy, searchQuery, setSearchQuery,
  localFilters, setLocalFilters,
  uniquePapers, uniqueQueries,
  onClose, onReset,
}) => {
  const [isPaperDropdownOpen, setIsPaperDropdownOpen] = useState(false);
  const [isQueryDropdownOpen, setIsQueryDropdownOpen] = useState(false);

  return (
    <div className="relative z-30 bg-white/80 dark:bg-gray-950/90 backdrop-blur-xl border border-gray-100 dark:border-gray-800 rounded-2xl p-5 pt-2 sm:p-7 pb-1 sm:pb-2 mb-6 shadow-xl animate-fade-in ring-1 ring-black/5 dark:ring-white/5">
      <button
        onClick={onClose}
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
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search title, notes, insights..."
            autoFocus
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* ROW 2: Papers + Queries + Refine */}
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
                    onClick={() => { setLocalFilters({ ...localFilters, paper: 'all' }); setIsPaperDropdownOpen(false); }}
                    className={`w-full text-left px-4 py-2.5 text-sm font-medium flex items-center justify-between gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${localFilters.paper === 'all' ? 'text-scholar-600 dark:text-scholar-400' : 'text-gray-700 dark:text-gray-200'}`}
                  >
                    All Papers ({uniquePapers.length})
                  </button>
                  {uniquePapers.map(p => (
                    <button
                      key={p.id}
                      onClick={() => { setLocalFilters({ ...localFilters, paper: p.id }); setIsPaperDropdownOpen(false); }}
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
                    onClick={() => { setLocalFilters({ ...localFilters, query: 'all' }); setIsQueryDropdownOpen(false); }}
                    className={`w-full text-left px-4 py-2.5 text-sm font-medium flex items-center justify-between gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${localFilters.query === 'all' ? 'text-scholar-600 dark:text-scholar-400' : 'text-gray-700 dark:text-gray-200'}`}
                  >
                    All Queries ({uniqueQueries.length})
                  </button>
                  {uniqueQueries.map(({ query, noteCount }) => (
                    <button
                      key={query}
                      onClick={() => { setLocalFilters({ ...localFilters, query }); setIsQueryDropdownOpen(false); }}
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
                onClick={() => setLocalFilters({ ...localFilters, hasNotes: !localFilters.hasNotes })}
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
          onClick={onReset}
          className="text-[12px] font-black text-scholar-600 dark:text-scholar-400 hover:text-scholar-800 dark:hover:text-scholar-300 uppercase tracking-widest transition-all hover:underline"
        >
          Reset Filters
        </button>
      </div>
    </div>
  );
};
