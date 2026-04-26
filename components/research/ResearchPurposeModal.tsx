import React, { useState, useEffect } from 'react';
import { X, ArrowRight, Lightbulb } from 'lucide-react';

interface ResearchPurposeModalProps {
  initialValue?: string;
  onSubmit: (purpose: string) => void;
  onSkip: () => void;
}

export const ResearchPurposeModal: React.FC<ResearchPurposeModalProps> = ({
  initialValue = '',
  onSubmit,
  onSkip
}) => {
  const [purpose, setPurpose] = useState(initialValue);
  const [savedPurpose, setSavedPurpose] = useState<string>('');

  // Load saved purpose from localStorage for display
  useEffect(() => {
    try {
      const saved = localStorage.getItem('research_purpose');
      if (saved) {
        setSavedPurpose(saved);
      }
    } catch (e) {
      console.error('Failed to load saved research purpose', e);
    }
  }, []);

  const handleSubmit = () => {
    const wordCount = purpose.trim().split(/\s+/).filter(Boolean).length;
    if (wordCount > 150) return; // Prevent submission if over limit
    onSubmit(purpose.trim());
  };

  const wordCount = purpose.trim().split(/\s+/).filter(Boolean).length;
  const isOverLimit = wordCount > 150;

  return (
    <div className="absolute inset-0 flex items-center justify-center z-50 p-2 pointer-events-none">
      <div className="bg-white dark:bg-dark-card rounded-[2rem] shadow-2xl border border-gray-100 dark:border-gray-800 w-full max-w-3xl pointer-events-auto flex flex-col">

        {/* Header Section */}
        <div className="relative p-8 pb-4 pt-10">
          {/* Skip button top-right */}
          <div className="absolute top-6 right-6">
            <button
              onClick={onSkip}
              className="group flex items-center gap-2 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-scholar-600 dark:hover:text-scholar-400 transition-all rounded-xl hover:bg-scholar-50 dark:hover:bg-scholar-900/20 border border-transparent hover:border-scholar-200"
            >
              Skip <X size={14} className="group-hover:rotate-90 transition-transform" />
            </button>
          </div>

          <div className="space-y-1">
            <h2 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight leading-tight">
              What's the purpose of this research?
            </h2>
            <p className="text-sm text-gray-400 max-w-xl leading-relaxed font-medium">
              Knowing your goals and purpose for searching this subject helps us extract and identify the most relevant .
            </p>
          </div>
        </div>

        {/* Input Area */}
        <div className="px-8 pb-4 flex-1">
          <div className="group relative">
            <textarea
              autoFocus
              placeholder={savedPurpose ? `${savedPurpose}\n\n(Enter new purpose or modify above)` : " "}
              className={`w-full h-64 bg-gray-50/50 dark:bg-gray-900/40 border ${isOverLimit ? 'border-red-500' : 'border-gray-200 dark:border-gray-700'} rounded-3xl p-6 text-md font-bold text-gray-800 dark:text-white outline-none resize-none placeholder:text-gray-400 placeholder:font-medium transition-all shadow-inner`}
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
            />
            <div className="absolute bottom-4 right-6 flex items-center gap-2 pointer-events-none opacity-40">
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                {navigator.platform.indexOf('Mac') > -1 ? '⌘ + Enter' : 'Ctrl + Enter'}
              </span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-10 pb-8 flex justify-between items-center">
          <div className="flex-1">
            {isOverLimit && (
              <span className="text-red-500 text-xs font-black uppercase tracking-widest">
                {wordCount} / 150 Words - Please shorten
              </span>
            )}
          </div>

          <button
            onClick={handleSubmit}
            disabled={!purpose.trim() || isOverLimit}
            className={`
              group relative flex items-center gap-3 px-10 py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] transition-all
              ${(purpose.trim() && !isOverLimit)
                ? 'bg-scholar-600 text-white shadow-xl shadow-scholar-600/20 hover:shadow-scholar-600/40 hover:scale-[1.02] active:scale-[0.98]'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed'}
            `}
          >
            <span>Continue Research</span>
            <ArrowRight size={16} className={`${(purpose.trim() && !isOverLimit) ? 'group-hover:translate-x-1' : ''} transition-transform`} />
          </button>
        </div>
      </div>
    </div>
  );
};
