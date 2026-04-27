import React from 'react';
import { DeepResearchNote } from '../../types';
import { Sparkles } from 'lucide-react';

interface Top5SquareCardsProps {
  topNotes: any[];  // DeepResearchNote with extended props
  topNoteIds: string[];
  onSelectNote: (id: string) => void;
  onScrollToNote?: (noteId: string) => void;  // Callback to scroll to note in main list
}

export const Top5SquareCards: React.FC<Top5SquareCardsProps> = ({
  topNotes,
  topNoteIds,
  onSelectNote,
  onScrollToNote
}) => {
  if (!topNotes || topNotes.length === 0) return null;

  const handleCardClick = (noteId: string) => {
    // ✅ SIMPLE: Just trigger scroll + expand in main list
    if (onScrollToNote) {
      onScrollToNote(noteId);
    }
  };

  return (
    <div className="mb-8 animate-fade-in">
      {/* Top 5 Header */}
      <div className="flex items-center gap-2 mb-4">
        <Sparkles size={20} className="text-scholar-600 dark:text-scholar-400 fill-scholar-500" />
        <h3 className="text-sm font-black uppercase tracking-wider text-scholar-700 dark:text-scholar-400">
          Top 5 Insights
        </h3>
      </div>

      {/* Horizontal Square Cards - Responsive */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 mb-6">
        {topNotes.slice(0, 5).map((note, idx) => {
          const rank = idx + 1;
          const paperTitle = note.sourcePaper?.title || 'Untitled Paper';

          return (
            <button
              key={note.uniqueId}
              onClick={() => handleCardClick(note.uniqueId)}
              aria-label={`View top insight ${rank} of 5 in main list`}
              className={`
                relative aspect-square rounded-xl border p-3 
                transition-all duration-300 cursor-pointer
                flex flex-col items-start justify-between
                border-gray-200 dark:border-gray-700 
                bg-white dark:bg-gray-700 
                hover:border-scholar-300 dark:hover:border-scholar-600 
                hover:shadow-lg hover:scale-102
              `}
            >
              {/* Rank Badge */}
              <div className="absolute -top-2 -left-2 w-8 h-8 flex items-center justify-center bg-scholar-600 dark:bg-scholar-500 text-white text-sm font-black rounded-full shadow-md z-10">
                {rank}
              </div>

              {/* Paper Title - Inside card at top */}
              <h4 className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 line-clamp-1 leading-tight w-full pt-2 mb-2">
                {paperTitle}
              </h4>

              {/* Quote Preview - Larger text for readability */}
              <p className="text-sm text-gray-900 dark:text-gray-100 line-clamp-6 leading-snug font-serif flex-1">
                "{note.quote}"
              </p>

              {/* Bottom Row - Page Number Left, Details Right - Lower positioning */}
              <div className="w-full flex justify-between items-end mt-1 -mb-2">
                <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 pl-1">
                  p.{note.pageNumber}
                </span>
                <span className="text-[10px]  text-scholar-600 dark:text-scholar-400 hover:underline pr-1">
                  Details
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* ✅ REMOVED: Expansion now only happens in main list, not below squares */}
    </div>
  );
};
