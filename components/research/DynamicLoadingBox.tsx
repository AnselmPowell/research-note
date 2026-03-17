import React, { useState, useEffect, useMemo } from 'react';
import { BookOpenText, Sparkles, X, ArrowRight, Loader2, Check, Loader } from 'lucide-react';
import { ResearchPhase } from '../../types';

interface DynamicLoadingBoxProps {
  researchPhase: ResearchPhase;
  paperData: Array<{
    title: string;
    relevanceScore: number;
  }>;
  gatheringStatus: string;
  // NEW: Insight Questions props
  insightQuestions?: string[];
  selectedQuestions?: string[];
  onToggleQuestion?: (q: string) => void;
  onProceed?: () => void;
  hasSubmittedInsights?: boolean;
}

// ─── Values and Fixed Constants ────────────────────────────────────────
const FADE_OUT_DURATION = 1000;
const FADE_IN_DURATION = 1000;
const DISPLAY_DURATION = 6000;
const MESSAGE_CYCLE_DURATION = FADE_OUT_DURATION + FADE_IN_DURATION + DISPLAY_DURATION;
const GRACE_PERIOD_SECONDS = 24;

const phaseMessages: Record<ResearchPhase, string[]> = {
  initializing: [
    'Connecting to multiple academic libraries...',
    'Understanding your topic...',
    'Preparing the search...'
  ],
  searching: [
    'Searching multiple academic libraries...',
    'Searching the web for relevant research papers...',
    'Looking for papers in academic repositories...',
    'Retrieving academic sources...'
  ],
  filtering: [
    'Analyzing papers...',
    'Reading papers to check for relevancy...',
    'Processing top research papers...',
    'Filtering to match your query...',
    'Narrowing down to best matches...'
  ],
  reviewing_insights: [
    'Last chance: refine your research goals...',
    'Waiting for your final input...'
  ],
  extracting: [
    'Extracting key insights from selected sources...',
    'Synthesizing theoretical frameworks...',
    'Analyzing methodology and results...',
    'Compiling research notes...'
  ],
  completed: [],
  idle: [],
  failed: []
};

// ─── Component ─────────────────────────────────────────────────────────
export const DynamicLoadingBox: React.FC<DynamicLoadingBoxProps> = ({
  researchPhase,
  paperData,
  gatheringStatus,
  insightQuestions = [],
  selectedQuestions = [],
  onToggleQuestion,
  onProceed,
  hasSubmittedInsights = false
}) => {
  // ─── State ────────────────────────────────────────────────────────────
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [isTextVisible, setIsTextVisible] = useState(true);
  const [timeLeft, setTimeLeft] = useState(GRACE_PERIOD_SECONDS);

  const messagePool = useMemo(() => {
    const baseMessages = phaseMessages[researchPhase] || [];
    if (researchPhase === 'filtering' && paperData.length > 0) {
      const pool: string[] = [];
      const baseMessageRotation = [
        'Reading papers to check for relevancy...',
        'Analyzing papers...',
        'Processing top research papers...',
        'Filtering to match your query...',
        'Narrowing down to best matches...'
      ];
      for (let i = 0; i < paperData.length; i++) {
        pool.push(baseMessageRotation[i % baseMessageRotation.length]);
        const scorePercent = Math.round((paperData[i].relevanceScore || 0) * 100);
        const titleShort = paperData[i].title.length > 85 ? paperData[i].title.substring(0, 85) : paperData[i].title;
        pool.push(`Paper found: ${titleShort}\n\n ${scorePercent}% match`);
      }
      return pool.length > 0 ? pool : baseMessages;
    }
    if (researchPhase === 'searching' && paperData.length > 0) {
      const pool: string[] = [];
      pool.push('Searching multiple academic libraries...', 'Searching the web for relevant research papers...');
      paperData.slice(0, 10).forEach(paper => {
        pool.push(`Found: ${paper.title.length > 60 ? paper.title.substring(0, 60) + '...' : paper.title} (${paperData.length} total)`);
      });
      return pool.length > 0 ? pool : baseMessages;
    }
    return baseMessages;
  }, [researchPhase, paperData]);

  const currentMessage = messagePool.length > 0 ? messagePool[currentMessageIndex % messagePool.length] : '';

  useEffect(() => {
    if (messagePool.length === 0) return;
    let timeoutId: NodeJS.Timeout;
    let fadeOutTimeoutId: NodeJS.Timeout;
    const cycleMessage = () => {
      setIsTextVisible(false);
      fadeOutTimeoutId = setTimeout(() => {
        setCurrentMessageIndex(prev => (prev + 1) % messagePool.length);
        setIsTextVisible(true);
      }, FADE_OUT_DURATION);
      timeoutId = setTimeout(cycleMessage, MESSAGE_CYCLE_DURATION);
    };
    setIsTextVisible(true);
    const initialTimeout = setTimeout(cycleMessage, DISPLAY_DURATION);
    return () => {
      clearTimeout(initialTimeout);
      clearTimeout(timeoutId);
      clearTimeout(fadeOutTimeoutId);
    };
  }, [messagePool]);

  // Grace Period Timer Logic
  useEffect(() => {
    if (researchPhase !== 'reviewing_insights') {
      setTimeLeft(GRACE_PERIOD_SECONDS);
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          onProceed?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [researchPhase, onProceed]);

  const isReviewing = researchPhase === 'reviewing_insights';
  const isFiltering = researchPhase === 'filtering';
  const showInsights = insightQuestions.length > 0 && !hasSubmittedInsights && researchPhase !== 'extracting';
  const containerSizeClass = showInsights ? 'max-w-3xl' : 'max-w-md';

  return (
    <div className="absolute inset-0 flex items-center justify-center z-50 p-4 pointer-events-none">
      <div className={`
        ${(isReviewing || isFiltering || showInsights) ? 'bg-white dark:bg-dark-card rounded-[2.5rem] shadow-2xl border border-gray-100 dark:border-gray-800' : ''} 
        w-full transition-all duration-500 pointer-events-auto flex flex-col max-h-[70vh] overflow-hidden scale-100
        ${containerSizeClass}
      `}>

        {/* Header: Centered Status */}
        <div className={`p-2 sm:p-2 flex flex-col relative`}>

          {/* Top Row: Centered Hub with Loader */}
          <div className="flex flex-col items-center justify-center transition-all duration-500">
            <div className="relative">
              <Loader2 size={30} className=" w-16 h-16 text-scholar-600 animate-spin font-thin" />
              <div className="absolute inset-0 flex items-center justify-center border-l-stone-300">
                <BookOpenText size={24} className="text-scholar-600" />
              </div>
            </div>

            <div className="text-center">
              <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-scholar-600/60 transition-all mb-1">
                {researchPhase.replace('_', ' ')}
              </h3>
              <p className="text-[11px] text-gray-400 font-bold uppercase tracking-wider">{gatheringStatus}</p>
            </div>
          </div>

          {/* Absolute Overlays for Controls */}
          {showInsights && (
            <div className="absolute top-6 right-6">
              <button
                onClick={onProceed}
                className="group flex items-center gap-2 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-scholar-600 dark:hover:text-scholar-400 transition-all rounded-xl hover:bg-scholar-50 dark:hover:bg-scholar-900/20 border border-transparent hover:border-scholar-200"
              >
                Skip suggestions <X size={14} className="group-hover:rotate-90 transition-transform" />
              </button>
            </div>
          )}

          {/* Progress Message (Only in Simple View) */}
          {!showInsights && (
            <div className="text-center h-20 flex items-center justify-center animate-in fade-in zoom-in-95">
              <p
                className="text-lg font-bold text-gray-800 dark:text-gray-200 transition-opacity duration-1000 leading-snug px-4"
                style={{ opacity: isTextVisible ? 1 : 0 }}
              >
                {currentMessage}
              </p>
            </div>
          )}
        </div>

        {/* Insight Selection Area (Displays based on visibility logic) */}
        {showInsights && (
          <div className="flex-1 flex flex-col min-h-0 bg-scholar-50/20 dark:bg-black/20 animate-in slide-in-from-bottom-6 duration-700 delay-300">
            <div className="p-4 sm:p-6 pt-0 flex-1 overflow-auto">

              <div className="flex items-end justify-between mb-4">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight max-w-lg leading-tight">
                  {isReviewing
                    ? "Last chance: Deepen your research?"
                    : "While searching, does any of these question you want to add?"}
                </h2>

                {isReviewing && (
                  <div className="flex items-center gap-2 px-3 py-1 bg-scholar-600 text-white rounded-lg font-black text-[10px] uppercase tracking-tighter animate-pulse mb-1">

                    <span>papers found extracting notes in {timeLeft}s</span>
                  </div>
                )}
              </div>

              <div className="grid gap-3">
                {insightQuestions.map((q) => {
                  const isSelected = selectedQuestions.includes(q);
                  return (
                    <button
                      key={q}
                      onClick={() => onToggleQuestion?.(q)}
                      className={`
                        group relative w-full text-left p-2 rounded-xl border transition-all duration-300 flex items-center justify-between gap-4
                        ${isSelected
                          ? 'bg-white dark:bg-scholar-900/40 border-scholar-600 shadow-lg ring-1 ring-scholar-600'
                          : 'bg-white/50 dark:bg-gray-900/20 border-gray-100 dark:border-gray-800 hover:border-scholar-300 dark:hover:border-scholar-700 hover:bg-white dark:hover:bg-gray-800 hover:shadow-md'
                        }
                      `}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {isSelected && <Check size={16} className="text-scholar-600 animate-in zoom-in" />}
                          <h4 className={`text-md font-bold tracking-tight transition-colors ${isSelected ? 'text-scholar-700 dark:text-scholar-400' : 'text-gray-900 dark:text-gray-100'}`}>
                            {q}
                          </h4>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Footer Action: Fixed height to prevent squishing */}
            {selectedQuestions.length > 0 && (
              <div className="p-4 sm:px-10 border-t border-gray-100 dark:border-gray-800 bg-white/50 dark:bg-dark-card/50 flex justify-end items-center h-24">
                <button
                  onClick={onProceed}
                  className={`
                  group relative flex items-center gap-3 px-10 py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] transition-all
                  bg-scholar-600 text-white shadow-xl shadow-scholar-600/20 hover:shadow-scholar-600/40 hover:scale-[1.02] active:scale-[0.98]
                  flex-shrink-0
                `}
                >
                  <span>Apply {selectedQuestions.length} questions</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};