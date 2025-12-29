
import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, X, Plus, Play, Loader2 } from 'lucide-react';

interface DeepResearchFABProps {
  onStartResearch: (questions: string) => void;
  isLoading: boolean;
  selectedPdfCount: number;
}

export const DeepResearchFAB: React.FC<DeepResearchFABProps> = ({ onStartResearch, isLoading, selectedPdfCount }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentInput, setCurrentInput] = useState('');
  const [questions, setQuestions] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleAddQuestion = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (currentInput.trim()) {
      setQuestions([...questions, currentInput.trim()]);
      setCurrentInput('');
    }
  };

  const handleRemoveQuestion = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index));
  };

  const handleStart = () => {
    if (questions.length > 0) {
      // Join questions with newlines for the AI context
      onStartResearch(questions.join('\n'));
      setIsOpen(false);
      setQuestions([]); // Optional: clear after submit
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddQuestion();
    }
  };

  return (
    <>
      {/* Invisible overlay to handle closing when clicking outside */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setIsOpen(false)} 
        />
      )}

      <div className="fixed bottom-8 right-8 z-50 flex flex-col items-end gap-4 font-sans">
        
        {/* Research Panel */}
        {isOpen && (
          <div className="w-[400px] bg-white dark:bg-dark-card rounded-xl shadow-scholar-lg border border-gray-100 dark:border-gray-700 overflow-hidden animate-fade-in-up mb-2 transform origin-bottom-right">
            
            {/* Header / Context */}
            <div className="px-5 py-4 bg-gradient-to-r from-scholar-700 to-scholar-600 text-white">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <Sparkles size={18} /> Deep Research
                  </h3>
                  <p className="text-scholar-100 text-xs mt-1">
                    Analyzing <span className="font-bold text-white">{selectedPdfCount}</span> selected document{selectedPdfCount !== 1 ? 's' : ''}
                  </p>
                </div>
                <button 
                  onClick={() => setIsOpen(false)}
                  className="text-white/70 hover:text-white transition-colors p-1 hover:bg-white/10 rounded"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="p-5">
              {/* Question List (Tags) */}
              {questions.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4 max-h-40 overflow-y-auto custom-scrollbar">
                  {questions.map((q, idx) => (
                    <div key={idx} className="flex items-center gap-1.5 bg-scholar-50 dark:bg-scholar-900/30 text-scholar-800 dark:text-scholar-200 px-3 py-1.5 rounded-lg text-sm border border-scholar-100 dark:border-scholar-800 animate-fade-in">
                      <span className="truncate max-w-[280px]">{q}</span>
                      <button 
                        onClick={() => handleRemoveQuestion(idx)}
                        className="text-scholar-400 hover:text-scholar-600 focus:outline-none"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Input Area */}
              <div className="relative flex items-center mb-4">
                <input
                  ref={inputRef}
                  type="text"
                  value={currentInput}
                  onChange={(e) => setCurrentInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="w-full pl-4 pr-10 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-scholar-500/20 focus:border-scholar-500 focus:bg-white dark:focus:bg-gray-800 transition-all text-sm text-gray-900 dark:text-gray-100"
                  placeholder="Type a specific question and press Enter..."
                  autoComplete="off"
                />
                <button 
                  onClick={() => handleAddQuestion()}
                  disabled={!currentInput.trim()}
                  className="absolute right-2 p-1.5 text-gray-400 hover:text-scholar-600 disabled:opacity-30 disabled:hover:text-gray-400 transition-colors"
                >
                  <Plus size={20} />
                </button>
              </div>

              {/* Action Footer */}
              <div className="flex justify-end">
                <button
                  onClick={handleStart}
                  disabled={questions.length === 0 || isLoading}
                  className="w-full py-2.5 bg-gray-900 dark:bg-white hover:bg-black dark:hover:bg-gray-100 text-white dark:text-gray-900 rounded-lg font-bold text-sm transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Play size={16} fill="currentColor" />
                      Run Analysis ({questions.length})
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Floating Toggle Button */}
        {!isOpen && (
          <button
            onClick={() => setIsOpen(true)}
            className="bg-scholar-600 text-white p-4 rounded-full shadow-scholar-lg hover:bg-scholar-700 hover:scale-105 transition-all duration-300 group flex items-center gap-3 pr-6"
            aria-label="Open Deep Research"
          >
            <div className="relative">
              <Sparkles size={24} />
              {questions.length > 0 && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border border-scholar-600"></span>
              )}
            </div>
            <span className="font-semibold whitespace-nowrap">
              Deep Research
            </span>
          </button>
        )}
      </div>
    </>
  );
};
