import React, { useState, useEffect, useMemo } from 'react';
import { BookOpenText } from 'lucide-react';
import { ResearchPhase } from '../../types';

interface DynamicLoadingBoxProps {
  researchPhase: ResearchPhase;
  paperData: Array<{
    title: string;
    relevanceScore: number;
  }>;
  gatheringStatus: string;
}

// ─── Values and Fixed Constants ────────────────────────────────────────
// 7-second message cycle: 1s fade out → change message → 1s fade in → 4s display
const FADE_OUT_DURATION = 1000;   // 1s fade out
const FADE_IN_DURATION = 1000;    // 1s fade in
const DISPLAY_DURATION = 6000;    // 6s hold
const MESSAGE_CYCLE_DURATION = FADE_OUT_DURATION + FADE_IN_DURATION + DISPLAY_DURATION; // 8s total

// Message templates for each research phase (student-friendly language)
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
  extracting: [],
  completed: [],
  idle: [],
  failed: []
};

// ─── Component ─────────────────────────────────────────────────────────
export const DynamicLoadingBox: React.FC<DynamicLoadingBoxProps> = ({
  researchPhase,
  paperData,
  gatheringStatus
}) => {
  // ─── State ────────────────────────────────────────────────────────────
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [isTextVisible, setIsTextVisible] = useState(true);

  // ─── Controls: Generate message pool with real processing data ────────
  const messagePool = useMemo(() => {
    const baseMessages = phaseMessages[researchPhase] || [];
    
    // FILTERING PHASE: Strictly alternate message + real paper data
    if (researchPhase === 'filtering' && paperData.length > 0) {
      const pool: string[] = [];
      
      // Base messages for filtering phase
      const baseMessageRotation = [
        'Reading papers to check for relevancy...',
        'Analyzing papers...',
        'Processing top research papers...',
        'Filtering to match your query...',
        'Narrowing down to best matches...'
      ];
      
      // ✅ Strictly alternate: message → paper for each paper available
      for (let i = 0; i < paperData.length; i++) {
        // Add base message (cycle through rotation)
        pool.push(baseMessageRotation[i % baseMessageRotation.length]);
        
        // Add paper with REAL relevance score from backend
        const paper = paperData[i];
        const scorePercent = Math.round((paper.relevanceScore || 0) * 100);  // ✅ NaN protection
        
        // Truncate title to 45 chars for display
        const titleMax = 85;
        const titleShort = paper.title.length > titleMax
          ? paper.title.substring(0, titleMax)
          : paper.title;
        
        // Format: "📄 Title (91% match)" - more user-friendly
        pool.push(`Paper found: ${titleShort}\n\n ${scorePercent}% match`);
      }
      
      // If we have fewer papers than base messages, add remaining messages
      if (paperData.length < baseMessageRotation.length) {
        for (let i = paperData.length; i < baseMessageRotation.length; i++) {
          pool.push(baseMessageRotation[i % baseMessageRotation.length]);
        }
      }
      
      return pool.length > 0 ? pool : baseMessages;
    }
    
    // SEARCHING PHASE: Real data - show paper titles as they arrive + running count
    if (researchPhase === 'searching' && paperData.length > 0) {
      const pool: string[] = [];
      
      // Base messages
      pool.push('Searching multiple academic libraries...');
      pool.push('Searching the web for relevant research papers...');
      pool.push('Looking for papers in academic repositories...');
      
      // Show up to 10 papers found (in order discovered)
      const papersToShow = paperData.slice(0, 10);
      papersToShow.forEach(paper => {
        // Truncate title: 60 chars max
        const titleMax = 60;
        const titleShort = paper.title.length > titleMax
          ? paper.title.substring(0, titleMax) + '...'
          : paper.title;
        
        // Real data format: "Found: Title (120 total)" - showing progress
        const totalCount = paperData.length;
        pool.push(`Found: ${titleShort} (${totalCount} total)`);
      });
      
      pool.push('Retrieving academic sources...');
      pool.push(`Retrieved ${Math.min(paperData.length, 120)}+ papers so far...`);
      
      return pool.length > 0 ? pool : baseMessages;
    }
    
    // INITIALIZING PHASE: Generic preparation messages (no real data yet)
    if (researchPhase === 'initializing') {
      return baseMessages.length > 0 ? baseMessages : [];
    }
    
    // DEFAULT: Just base messages
    return baseMessages.length > 0 ? baseMessages : [];
  }, [researchPhase, paperData]);  // ← FIXED: Full array, not .length

  // Get current message to display
  const currentMessage = messagePool.length > 0 
    ? messagePool[currentMessageIndex % messagePool.length]
    : '';

  // ─── Implementation: Message cycling with proper cleanup ──────────────
  useEffect(() => {
    if (messagePool.length === 0) return; // No messages to cycle
    
    let timeoutId: NodeJS.Timeout;
    let fadeOutTimeoutId: NodeJS.Timeout;
    let fadeInTimeoutId: NodeJS.Timeout;
    let initialTimeout: NodeJS.Timeout;
    
    const cycleMessage = () => {
      // Step 1: Fade out (takes FADE_OUT_DURATION = 1000ms)
      setIsTextVisible(false);
      
      // Step 2: After fade out completes, change message (at 1000ms)
      fadeOutTimeoutId = setTimeout(() => {
        // Update message while invisible
        setCurrentMessageIndex(prev => (prev + 1) % messagePool.length);
        // Immediately fade in
        setIsTextVisible(true);
      }, FADE_OUT_DURATION);
      
      // Step 3: After full cycle completes, fade out again
      timeoutId = setTimeout(() => {
        cycleMessage();
      }, MESSAGE_CYCLE_DURATION);
    };
    
    // Start first message immediately visible (don't fade in)
    setIsTextVisible(true);
    
    // Start cycling after initial display period (4s hold)
    initialTimeout = setTimeout(cycleMessage, DISPLAY_DURATION);
    
    // Cleanup: Clear all timeouts on unmount or message pool change
    return () => {
      clearTimeout(initialTimeout);
      clearTimeout(timeoutId);
      clearTimeout(fadeOutTimeoutId);
      clearTimeout(fadeInTimeoutId);
    };
  }, [messagePool]);

  // ─── Render ────────────────────────────────────────────────────────────
  return (
    <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none">
      {/* PERFECT SQUARE CONTAINER: h-80 w-80 for consistent square sizing */}
      <div className="bg-white dark:bg-dark-card rounded-2xl shadow-2xl p-8 border border-gray-100 dark:border-gray-700 h-80 w-80 pointer-events-auto animate-in fade-in zoom-in-95 flex flex-col items-center justify-center">
        <div className="flex flex-col items-center space-y-2 h-full justify-center">
          
          {/* Spinner with icon */}
          <div className="relative flex-shrink-0">
            <div className="w-24 h-24 border-4 border-scholar-100 dark:border-scholar-900 border-t-scholar-600 dark:border-t-scholar-500 rounded-full animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <BookOpenText size={24} className="text-scholar-600 dark:text-scholar-500 animate-pulse" />
            </div>
          </div>

          {/* FIXED HEIGHT TEXT AREA: h-28 ensures consistent sizing in square */}
          <div className="text-center h-28 w-full flex items-center justify-center flex-shrink-0">
            <p 
              className={`text-lg font-bold text-scholar-600 dark:text-scholar-400 transition-opacity duration-1000 leading-snug line-clamp-4 px-3`}
              style={{
                opacity: isTextVisible ? 1 : 0
              }}
            >
              {currentMessage}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};