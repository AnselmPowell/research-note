// ─── DeepSearch Shared Utilities ────────────────────────────────────────────────
// Pure helper functions and shared types extracted from DeepSearch.tsx
// Used by: DeepSearch, PaperCard, DeepSearchToolbar, DeepSearchFilterPanel

export type SortOption = 'most-relevant-notes' | 'relevant-papers' | 'newest-papers';

export const ITEMS_PER_PAGE = 15;

export const getNoteId = (paperId: string, page: number, index: number) =>
  `${paperId}-p${page}-i${index}`;

export const getSafeTimestamp = (dateStr: string): number => {
  if (!dateStr || dateStr.trim() === '') return 0;
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d.getTime();
  const yearMatch = dateStr.match(/\b(19|20)\d{2}\b/);
  if (yearMatch) return new Date(parseInt(yearMatch[0], 10), 0, 1).getTime();
  return 0;
};

// Normalise text for case-insensitive, accent-insensitive search
// NFD decomposes accented chars (é → e + ́), then the regex strips the diacritics
export const normalizeText = (str: string): string =>
  (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// Truncate a string to a maximum number of words, appending ellipsis if longer
export const truncateWords = (str: string, max = 11): string => {
  const words = (str || '').trim().split(/\s+/);
  return words.length <= max ? str : words.slice(0, max).join(' ') + '…';
};

export const formatDuration = (ms: number): string => {
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) return `${totalSeconds.toFixed(1)}s`;
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
  return `${mins}m ${secs}s`;
};
