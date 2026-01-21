import React, { useState, useEffect, useRef } from 'react';
import { Search, ChevronDown, Check, Globe, Sparkles, BookOpenText, Link, ChevronUp, Plus, ArrowRight, Upload, ArrowUpRight, X, AlertTriangle, Loader2, Square, Clock, Trash2 } from 'lucide-react';
import { EditableTag } from '../ui/EditableTag';
import { DeepResearchQuery, TagData, SearchMode } from '../../types';
import { useResearch } from '../../contexts/ResearchContext';
import { useUI } from '../../contexts/UIContext';
import { useLibrary } from '../../contexts/LibraryContext';
import { validatePdfUrl } from '../../services/pdfService';

// We optionally keep props for flexibility, but default to context actions
interface SearchBarProps {
  initialQuery?: string;
  initialMode?: SearchMode;
  onSearch?: (query: string | DeepResearchQuery, mode: SearchMode) => void;
  centered?: boolean;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  initialQuery = '',
  initialMode,
  onSearch,
  centered = false
}) => {
  const {
    activeSearchMode,
    setActiveSearchMode,
    performWebSearch,
    performDeepResearch,
    stopDeepResearch, // Import stop action
    searchBarState,
    updateSearchBar,
    clearSearchBar,
    researchPhase,
    searchHistory, // New
    removeFromHistory, // New
    clearHistory, // New
    processedPdfs, // New: for navigation
    setShowUploadedTab, // New: for tab switching
    shouldOpenPdfViewer, // New: navigation intent
    navigationHandled, // New: track if navigation done
    setNavigationHandled, // New: mark navigation as handled
    setProcessedPdfs // New: clear processed PDFs after handling
  } = useResearch();

  const { setColumnVisibility, openColumn } = useUI();
  const { addPdfFile, loadPdfFromUrl, isPdfLoaded, addLoadedPdf, failedUrlErrors } = useLibrary();

  const [mode, setMode] = useState<SearchMode>(initialMode || activeSearchMode);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(mode === 'deep');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // History Dropdown State
  const [showHistory, setShowHistory] = useState(false);

  // Sync internal mode with context if it changes elsewhere
  useEffect(() => {
    setMode(activeSearchMode);
    if (activeSearchMode !== 'deep') {
      setIsExpanded(false);
    } else {
      setIsExpanded(true);
    }
  }, [activeSearchMode]);

  // If initialQuery passed (e.g. from props fallback), sync it to context if context is empty
  useEffect(() => {
    if (initialQuery && !searchBarState.mainInput) {
      updateSearchBar({ mainInput: initialQuery });
    }
  }, [initialQuery]);

  const [showUrlInput, setShowUrlInput] = useState(false);
  const [editingTag, setEditingTag] = useState<{ type: 'topic' | 'url' | 'query' | null, index: number | null, value: string }>({ type: null, index: null, value: '' });

  const menuRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const questionInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // NEW REFS FOR STRICT CLICK LOGIC
  const mainInputRef = useRef<HTMLInputElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);

  // Determine if deep research is currently active/loading
  const isDeepLoading = ['initializing', 'searching', 'filtering', 'extracting'].includes(researchPhase);

  // Close search bar when deep research begins
  useEffect(() => {
    if (isDeepLoading && mode === 'deep' && isExpanded) {
      setIsExpanded(false);
    }
  }, [isDeepLoading, mode, isExpanded]);

  // Handle PDF loading and navigation when PDFs are processed
  useEffect(() => {
    const handleProcessedPdfs = async () => {
      if (processedPdfs.length > 0) {
        // Add already-processed PDFs to LibraryContext (avoid re-downloading)
        for (const pdf of processedPdfs) {
          // Check if PDF is already loaded to avoid duplicates
          if (!isPdfLoaded(pdf.uri)) {
            addLoadedPdf(pdf); // Use direct add instead of loadPdfFromUrl
          }
        }

        // Signal to switch to uploaded tab in deep research view
        setShowUploadedTab(true);

        // Only handle navigation once per deep search
        if (!navigationHandled) {
          if (shouldOpenPdfViewer) {
            // Single PDF URL = open PDF viewer + middle column  
            setColumnVisibility(prev => ({ ...prev, right: true, middle: true }));
          } else {
            // Multiple PDFs or mixed search = only middle column
            setColumnVisibility(prev => ({ ...prev, middle: true }));
          }
          // Mark navigation as handled to prevent future column opening
          setNavigationHandled(true);
        }

        // Clear processed PDFs to prevent re-adding deleted PDFs
        setProcessedPdfs([]);
      }
    };

    handleProcessedPdfs();
  }, [processedPdfs, isPdfLoaded, addLoadedPdf, setColumnVisibility, setShowUploadedTab, shouldOpenPdfViewer, navigationHandled, setNavigationHandled, setProcessedPdfs]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      // Existing Menu Logic
      if (menuRef.current && !menuRef.current.contains(target)) {
        setIsMenuOpen(false);
      } else if (menuRef.current && menuRef.current.contains(target)) {
        // If clicking inside mode menu, also close history dropdown
        setShowHistory(false);
      }

      if (mode === 'deep' && containerRef.current && !containerRef.current.contains(target)) setIsExpanded(false);

      // HISTORY STRICT CLOSE LOGIC
      if (showHistory) {
        // If click is NOT in the main input AND NOT in the history dropdown -> Close it.
        // This ensures clicking the search button (which is outside input) closes the history.
        const clickedInput = mainInputRef.current && mainInputRef.current.contains(target);
        const clickedHistory = historyRef.current && historyRef.current.contains(target);

        if (!clickedInput && !clickedHistory) {
          setShowHistory(false);
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [mode, showHistory]);

  // Handle mode button click - close expanded deep search when mode selector is clicked
  const handleModeButtonClick = () => {
    setIsMenuOpen(!isMenuOpen);
    if (isExpanded) {
      setIsExpanded(false);
    }
  };

  const handleModeChange = (newMode: SearchMode) => {
    setMode(newMode);
    setActiveSearchMode(newMode);
    setIsMenuOpen(false);
    setShowHistory(false); // Hide history dropdown when mode changes
    setIsExpanded(false); // Close expanded deep search when mode changes

    if (newMode === 'deep') {
      setIsExpanded(true);
      // If switching back to Deep, and the text input matches an existing tag (e.g. from Web auto-fill),
      // clear the text input so we don't see the duplicate (Tag + Text).
      if (searchBarState.additionalTopics.length > 0) {
        const currentText = searchBarState.mainInput.trim().toLowerCase();
        const hasMatchingTag = searchBarState.additionalTopics.some(t => t.toLowerCase() === currentText);

        if (hasMatchingTag) {
          updateSearchBar({ mainInput: '' });
        }
      }
    } else if (newMode === 'upload') {
      setIsExpanded(false);
      // When switching to upload mode, clear text unless it's a URL format
      const currentInput = searchBarState.mainInput.trim();
      if (currentInput) {
        const isUrl = URL.canParse(currentInput);
        if (!isUrl) {
          updateSearchBar({ mainInput: '' });
        }
      }
    } else {
      setIsExpanded(false);
      // Auto-populate main input with the first topic tag when switching to Web Search mode
      if (newMode === 'web' && !searchBarState.mainInput.trim() && searchBarState.additionalTopics.length > 0) {
        updateSearchBar({ mainInput: searchBarState.additionalTopics[0] });
      }
    }
  };

  const flashError = (msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(null), 3000);
  };

  const handleTriggerSearch = (query: string | DeepResearchQuery, searchMode: SearchMode) => {
    setShowHistory(false); // Close history on search trigger

    // If props provided (legacy/override), use them
    if (onSearch) {
      onSearch(query, searchMode);
      return;
    }

    // Otherwise use Context
    if (searchMode === 'web' && typeof query === 'string') {
      performWebSearch(query);
      setColumnVisibility(prev => ({ ...prev, left: true }));
    } else if (searchMode === 'deep' && typeof query !== 'string') {
      performDeepResearch(query);
      setColumnVisibility(prev => ({ ...prev, middle: true }));
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      await addPdfFile(file);
      // FIXED: Don't switch setActiveSearchMode to 'deep' here. Stay in 'upload' mode.
      setColumnVisibility(prev => ({ ...prev, left: true, right: true, middle: false }));
      // Reset input so same file can be selected again if needed
      e.target.value = '';
    }
  };

  const handleUrlUpload = async () => {
    const url = searchBarState.mainInput.trim();
    if (url) {
      const result = await loadPdfFromUrl(url);
      if (result.success) {
        updateSearchBar({ mainInput: '' });
        setColumnVisibility(prev => ({ ...prev, left: true, right: true, middle: false }));
      } else {
        if (result.error) {
          flashError(`${result.error.reason}: ${result.error.actionableMsg.split('.')[0]}`);
        } else {
          flashError("Failed to load URL");
        }
      }
    }
  };

  // Handle input change with history dropdown logic
  const handleInputChange = (value: string) => {
    updateSearchBar({ mainInput: value });

    // Show history when user starts typing and there are matching results
    if (value.trim() && searchHistory.length > 0) {
      const hasMatches = searchHistory.some(item =>
        item.toLowerCase().includes(value.toLowerCase())
      );
      setShowHistory(hasMatches);
    } else {
      setShowHistory(false);
    }
  };

  // Handle input click with toggle behavior
  const handleInputClick = () => {
    // Only show/toggle history if there's text and search history exists
    if (searchBarState.mainInput.trim() && searchHistory.length > 0) {
      const hasMatches = searchHistory.some(item =>
        item.toLowerCase().includes(searchBarState.mainInput.toLowerCase())
      );
      if (hasMatches) {
        setShowHistory(prev => !prev); // Toggle behavior
      }
    }
  };

  const handleMainInputKeyDown = async (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      setShowHistory(false); // Close history on enter
      if (mode === 'web') {
        if (searchBarState.mainInput.trim()) handleTriggerSearch(searchBarState.mainInput.trim(), 'web');
      } else if (mode === 'upload') {
        handleUrlUpload();
      } else if (mode === 'deep') {
        if (searchBarState.mainInput.trim()) {
          const val = searchBarState.mainInput.trim();

          // Check if the input looks like a URL
          const isLikelyUrl = URL.canParse(val);

          if (isLikelyUrl) {
            // Add as URL tag and validate
            await addUrlFromValue(val);
            updateSearchBar({ mainInput: '' });
          } else {
            // Add as topic tag (existing behavior)
            // Check duplicate
            if (searchBarState.additionalTopics.includes(val)) {
              flashError("Topic already exists!");
              updateSearchBar({ mainInput: '' });
              return;
            }

            updateSearchBar({
              additionalTopics: [...searchBarState.additionalTopics, val],
              mainInput: ''
            });
          }
          setIsExpanded(true);
        } else {
          setIsExpanded(true);
          setTimeout(() => questionInputRef.current?.focus(), 0);
        }
      }
    }
  };

  const addUrl = async () => {
    const val = searchBarState.urlInput.trim();
    if (!val) return;

    await addUrlFromValue(val);
    updateSearchBar({ urlInput: '' });
  };

  const addUrlFromValue = async (val: string) => {
    // Check duplicate URL
    const isDuplicate = searchBarState.urls.some(u => {
      const uVal = typeof u === 'string' ? u : u.value;
      return uVal === val;
    });

    if (isDuplicate) {
      flashError("URL already added!");
      return;
    }

    const newTag: TagData = { value: val, status: 'loading' };

    // Optimistic update
    const newUrls = [...searchBarState.urls, newTag];
    updateSearchBar({ urls: newUrls });

    try {
      // First check if it's a valid URL
      const isValidUrl = URL.canParse(val);
      if (!isValidUrl) {
        updateSearchBar({
          urls: newUrls.map(u =>
            (typeof u === 'object' && u.value === val)
              ? { ...u, status: 'invalid' }
              : u
          )
        });
        return;
      }

      // Then validate if it's a PDF
      const isPdf = await validatePdfUrl(val);
      updateSearchBar({
        urls: newUrls.map(u =>
          (typeof u === 'object' && u.value === val)
            ? { ...u, status: isPdf ? 'valid' : 'invalid' }
            : u
        )
      });
    } catch (error) {
      updateSearchBar({
        urls: newUrls.map(u =>
          (typeof u === 'object' && u.value === val)
            ? { ...u, status: 'invalid' }
            : u
        )
      });
    }
  };

  const addQuestion = () => {
    const val = searchBarState.questionInput.trim();
    if (val) {
      if (searchBarState.questions.includes(val)) {
        flashError("Question already exists!");
        updateSearchBar({ questionInput: '' });
        return;
      }
      updateSearchBar({
        questions: [...searchBarState.questions, val],
        questionInput: ''
      });
    }
  };

  const startDeepResearch = async () => {
    // If loading, do nothing (user should use Stop button which is rendered instead)
    if (isDeepLoading) return;

    // Handle URL in main input - move it to URLs array
    let mainInputValue = searchBarState.mainInput.trim();
    let updatedUrls = [...searchBarState.urls];

    if (mainInputValue && URL.canParse(mainInputValue)) {
      // Main input contains a URL - add it to URLs and clear main input
      await addUrlFromValue(mainInputValue);
      updateSearchBar({ mainInput: '' });
      mainInputValue = ''; // Clear for topic calculation
    }

    const allTopics = mainInputValue ? [mainInputValue, ...searchBarState.additionalTopics] : [...searchBarState.additionalTopics];
    const finalQuestions = [...searchBarState.questions];
    if (searchBarState.questionInput.trim()) finalQuestions.push(searchBarState.questionInput.trim());

    if ((allTopics.length === 0 && searchBarState.urls.length === 0) || finalQuestions.length === 0) return;

    const validUrls = searchBarState.urls.map(u => typeof u === 'string' ? u : u.value);
    const deepQuery: DeepResearchQuery = { topics: allTopics, urls: validUrls, questions: finalQuestions };

    handleTriggerSearch(deepQuery, 'deep');
  };

  // Wrapper to handle stop action
  const handleStopResearch = () => {
    stopDeepResearch();
  };

  const startEditingTag = (type: 'topic' | 'url' | 'query', index: number, value: string) => setEditingTag({ type, index, value });
  const handleEditTagChange = (value: string) => setEditingTag(prev => ({ ...prev, value }));
  const finishEditingTag = () => {
    const { type, index, value } = editingTag;
    if (type && index !== null && value.trim()) {
      const newVal = value.trim();

      // Duplicate check (excluding self)
      let exists = false;
      if (type === 'topic') {
        exists = searchBarState.additionalTopics.some((t, i) => i !== index && t === newVal);
      } else if (type === 'query') {
        exists = searchBarState.questions.some((q, i) => i !== index && q === newVal);
      } else if (type === 'url') {
        exists = searchBarState.urls.some((u, i) => {
          const uVal = typeof u === 'string' ? u : u.value;
          return i !== index && uVal === newVal;
        });
      }

      if (exists) {
        flashError("Tag already exists!");
        return; // Stay in edit mode so user can fix it
      }

      if (type === 'topic') {
        const newArr = [...searchBarState.additionalTopics]; newArr[index] = newVal;
        updateSearchBar({ additionalTopics: newArr });
      } else if (type === 'query') {
        const newArr = [...searchBarState.questions]; newArr[index] = newVal;
        updateSearchBar({ questions: newArr });
      } else if (type === 'url') {
        const newArr = [...searchBarState.urls];
        const isValid = URL.canParse(newVal);
        newArr[index] = { value: newVal, status: isValid ? 'valid' : 'invalid' };
        updateSearchBar({ urls: newArr });
      }
    }
    setEditingTag({ type: null, index: null, value: '' });
  };

  // Filter history based on input
  const filteredHistory = searchBarState.mainInput
    ? searchHistory.filter(item => item.toLowerCase().includes(searchBarState.mainInput.toLowerCase()))
    : searchHistory;

  const handleHistorySelect = (item: string) => {
    updateSearchBar({ mainInput: item });
    setShowHistory(false);
    // Optional: Auto-search if in Web Mode?
    // For now, we just populate so user can edit. 
    // User can press Enter to search.
  };

  const hasValidUrls = searchBarState.urls.length === 0 || searchBarState.urls.every(u => {
    return typeof u === 'string' || u.status === 'valid';
  });

  const canStartDeep = (
    (searchBarState.mainInput.trim() || searchBarState.additionalTopics.length > 0 || searchBarState.urls.length > 0) &&
    (searchBarState.questions.length > 0 || searchBarState.questionInput.trim()) &&
    hasValidUrls
  );

  const getPlaceholder = () => {
    switch (mode) {
      case 'upload': return "Enter PDF URL (e.g. arxiv.org/...)";
      case 'deep': return "Enter Academic Subject/Topic";
      default: return "Search for academic papers...";
    }
  };

  return (
    <div ref={containerRef} className={`w-full transition-all duration-500 ease-in-out relative z-30 ${centered ? 'max-w-3xl' : 'max-w-full'}`}>

      {/* Error Message Toast - positioned absolutely above the bar */}
      {errorMsg && (
        <div className="absolute -top-10 left-0 right-0 flex justify-center z-50 animate-fade-in">
          <div className="bg-red-500 text-white px-4 py-1.5 rounded-full shadow-md text-xs font-semibold flex items-center gap-2">
            <AlertTriangle size={14} />
            {errorMsg}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 w-full">
        {/* External Upload Button (Visible only in Upload Mode) */}
        {mode === 'upload' && (
          <div className="flex-shrink-0 animate-fade-in">
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept="application/pdf"
              onChange={handleFileUpload}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-14 h-14 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 shadow-sm hover:shadow-md hover:border-scholar-500 dark:hover:border-scholar-500 flex items-center justify-center text-scholar-600 dark:text-scholar-400 transition-all"
              title="Upload PDF from Computer"
            >
              <Plus size={24} />
            </button>
          </div>
        )}

        {/* Main Search Bar Pill */}
        <div className={`flex-1 relative flex items-center bg-white dark:bg-gray-800 rounded-full border border-gray-200 dark:border-gray-600 shadow-sm hover:shadow-md transition-all h-14 pl-2 pr-2 z-40 ${mode === 'deep' ? 'ring-2 ring-scholar-600 dark:ring-scholar-900 border-scholar-600 dark:border-scholar-800' : ''}`}>

          <div className="relative h-full flex items-center" ref={menuRef}>
            <button type="button" onClick={handleModeButtonClick} className="flex items-center gap-2 px-3 h-10 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors focus:outline-none select-none">
              <span className={`text-sm font-semibold flex items-center gap-2 ${mode === 'web' ? 'text-gray-700 dark:text-gray-200' : 'text-scholar-600 dark:text-gray-200'}`}>
                {mode === 'web' && <Globe size={18} />}
                {mode === 'deep' && <BookOpenText size={18} />}
                {mode === 'upload' && <Upload size={18} />}
                <span className="hidden sm:inline whitespace-nowrap">
                  {mode === 'web' && 'Web Search'}
                  {mode === 'deep' && 'Deep Research'}
                  {mode === 'upload' && 'Upload PDF'}
                </span>
              </span>
              <ChevronDown size={14} className={`text-gray-400 transition-transform ${isMenuOpen ? 'rotate-180' : ''}`} />
            </button>
            {isMenuOpen && (
              <div className="absolute top-[120%] left-0 w-80 bg-white dark:bg-dark-card rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 py-1 overflow-hidden animate-fade-in z-50">
                <button onClick={() => handleModeChange('web')} className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors relative">
                  <Globe size={18} className="text-gray-500 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="text-sm font-bold text-gray-900 dark:text-gray-100">Web Search</div>
                    <div className="text-xs text-gray-400 font-medium mt-0.5">Quick search for PDFs ~10-20 sec</div>
                  </div>
                  {mode === 'web' && <Check size={16} className="absolute right-4 top-4 text-scholar-600" />}
                </button>
                <div className="h-px bg-gray-100 dark:bg-gray-700 mx-3"></div>
                <button onClick={() => handleModeChange('deep')} className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors relative">
                  <BookOpenText size={18} className="text-gray-500 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="text-sm font-bold text-gray-900 dark:text-gray-100">Deep Research</div>
                    <div className="text-xs text-gray-400 font-medium mt-0.5">PDF search & note extraction ~2-5 min</div>
                  </div>
                  {mode === 'deep' && <Check size={16} className="absolute right-4 top-4 text-scholar-600" />}
                </button>
                <div className="h-px bg-gray-100 dark:bg-gray-700 mx-3"></div>
                <button onClick={() => handleModeChange('upload')} className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors relative">
                  <Upload size={18} className="text-gray-500 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="text-sm font-bold text-gray-900 dark:text-gray-100">Upload PDF</div>
                    <div className="text-xs text-gray-400 font-medium mt-0.5">Analyze your own documents</div>
                  </div>
                  {mode === 'upload' && <Check size={16} className="absolute right-4 top-4 text-scholar-600" />}
                </button>
              </div>
            )}
          </div>

          <div className="h-6 w-px bg-gray-200 dark:bg-gray-700 mx-2 flex-shrink-0"></div>

          <div className="flex-1 flex items-center relative min-w-0 overflow-hidden">
            {/* Show First Tag only in Deep Research mode when collapsed */}
            {searchBarState.additionalTopics.length > 0 && mode === 'deep' && !isExpanded && (
              <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-2 py-0.5 rounded-md text-sm font-medium mr-2 whitespace-nowrap animate-fade-in max-w-[160px] flex-shrink-0">
                <span className="truncate">{searchBarState.additionalTopics[0]}</span>
                {searchBarState.additionalTopics.length > 1 && (
                  <span className="text-xs bg-gray-200 dark:bg-gray-600 px-1.5 py-0.5 rounded-full min-w-[20px] text-center flex-shrink-0">
                    +{searchBarState.additionalTopics.length - 1}
                  </span>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    // Remove the first topic
                    const newTopics = [...searchBarState.additionalTopics];
                    newTopics.shift();
                    updateSearchBar({ additionalTopics: newTopics });
                  }}
                  className="hover:text-red-500 ml-1 p-0.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex-shrink-0"
                  title="Remove topic"
                >
                  <X size={12} />
                </button>
              </div>
            )}
            <input
              ref={mainInputRef}
              type="text"
              value={searchBarState.mainInput}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleMainInputKeyDown}
              onFocus={() => {
                if (mode === 'deep') setIsExpanded(true);
              }}
              onClick={handleInputClick}
              className="flex-1 min-w-0 h-full bg-transparent text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none text-base truncate"
              placeholder={searchBarState.additionalTopics.length > 0 && mode === 'deep' && !isExpanded ? "Add more..." : getPlaceholder()}
            />
          </div>

          {mode === 'web' ? (
            <button onClick={() => searchBarState.mainInput.trim() && handleTriggerSearch(searchBarState.mainInput.trim(), 'web')} className="ml-2 p-2.5 rounded-full bg-scholar-600 hover:bg-scholar-700 text-white shadow-sm transition-colors flex-shrink-0">
              <Search size={20} />
            </button>
          ) : mode === 'upload' ? (
            <button onClick={handleUrlUpload} disabled={!searchBarState.mainInput.trim()} className="ml-2 p-2.5 rounded-full bg-scholar-600 hover:bg-scholar-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white shadow-sm transition-colors flex-shrink-0">
              <ArrowUpRight size={20} />
            </button>
          ) : mode === 'deep' && isDeepLoading ? (
            <button
              onClick={handleStopResearch}
              className="ml-2 p-2 rounded-full bg-red-600 hover:bg-red-700 text-white shadow-sm transition-all flex-shrink-0 animate-pulse"
              title="Stop Research"
            >
              <Square size={16} fill="currentColor" />
            </button>
          ) : (
            <div className="flex items-center gap-3 pr-2 text-xs text-gray-400 font-medium select-none flex-shrink-0">
              <span className="hidden sm:inline">Press Enter ↵</span>
            </div>
          )}
        </div>
      </div>

      {/* SEARCH HISTORY DROPDOWN */}
      {showHistory && filteredHistory.length > 0 && (
        <div
          ref={historyRef}
          className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-dark-card rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 overflow-hidden z-50 animate-fade-in"
        >
          <div className="py-1 max-h-[135px] overflow-y-auto custom-scrollbar">
            {filteredHistory.map((item, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer group"
                onMouseDown={(e) => {
                  // Prevent blur from input before click is registered
                  e.preventDefault();
                  handleHistorySelect(item);
                }}
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <Clock size={14} className="text-gray-400 flex-shrink-0" />
                  <span className="text-sm text-gray-700 dark:text-gray-200 truncate">{item}</span>
                </div>
                <button
                  onMouseDown={(e) => {
                    e.stopPropagation(); // Stop selection of item
                    removeFromHistory(item);
                  }}
                  className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all p-1"
                  title="Remove from history"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
          <div className="border-t border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 px-4 py-2 flex justify-between items-center">
            <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Recent Searches</span>
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                clearHistory();
              }}
              className="text-xs text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 font-medium transition-colors flex items-center gap-1"
            >
              <Trash2 size={12} /> Clear History
            </button>
          </div>
        </div>
      )}

      {mode === 'deep' && isExpanded && (
        <div className="absolute top-full left-0 right-0 mt-3 bg-white dark:bg-dark-card rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-5 animate-slide-up z-40 origin-top">
          {(searchBarState.additionalTopics.length > 0 || searchBarState.urls.length > 0) && (
            <div className="flex flex-wrap gap-2 mb-4 w-full animate-fade-in border-b border-gray-50 dark:border-gray-800 pb-4">
              {searchBarState.additionalTopics.map((t, i) => (
                <EditableTag key={`topic-${i}`} type="topic" index={i} tag={t} isEditing={editingTag.type === 'topic' && editingTag.index === i} editingValue={editingTag.value} onRemove={(idx) => updateSearchBar({ additionalTopics: searchBarState.additionalTopics.filter((_, k) => k !== idx) })} onEditChange={handleEditTagChange} onEditFinish={finishEditingTag} onStartEdit={startEditingTag} />
              ))}
              {searchBarState.urls.map((u, i) => (
                <EditableTag key={`url-${i}`} type="url" index={i} tag={u} isEditing={editingTag.type === 'url' && editingTag.index === i} editingValue={editingTag.value} onRemove={(idx) => updateSearchBar({ urls: searchBarState.urls.filter((_, k) => k !== idx) })} onEditChange={handleEditTagChange} onEditFinish={finishEditingTag} onStartEdit={startEditingTag} />
              ))}
            </div>
          )}

          <div className="mb-4">
            <button onClick={() => setShowUrlInput(!showUrlInput)} className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300 hover:text-scholar-600 dark:hover:text-scholar-400 transition-colors mb-2 font-medium">
              <Link size={14} /><span>{showUrlInput ? 'Hide URL input' : 'Add paper URL'}</span>{showUrlInput ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {showUrlInput && (
              <div className="flex items-center gap-2 animate-fade-in w-full">
                <div className="flex-1 flex items-center px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 focus-within:border-scholar-500 focus-within:ring-1 focus-within:ring-scholar-500 transition-colors">
                  <input type="text" value={searchBarState.urlInput} onChange={(e) => updateSearchBar({ urlInput: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && addUrl()} placeholder="e.g. arxiv.org/pdf/..." className="w-full bg-transparent text-sm focus:outline-none text-gray-900 dark:text-gray-100" />
                </div>
                <button onClick={addUrl} disabled={!searchBarState.urlInput.trim()} className="p-2.5 text-scholar-600 hover:bg-scholar-50 dark:hover:bg-scholar-900/30 rounded-lg disabled:opacity-50 transition-colors flex-shrink-0"><Plus size={18} /></button>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Search Queries</h3>
            <div className="flex items-center px-4 py-3 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 focus-within:border-scholar-500 focus-within:bg-white dark:focus-within:bg-gray-900 transition-all shadow-sm">
              <Search size={18} className="text-gray-400 mr-3 flex-shrink-0" />
              <input ref={questionInputRef} type="text" value={searchBarState.questionInput} onChange={(e) => updateSearchBar({ questionInput: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && addQuestion()} placeholder="What information are you looking for?" className="flex-1 bg-transparent text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 focus:outline-none min-w-0" />
              <button onClick={addQuestion} disabled={!searchBarState.questionInput.trim()} className="ml-2 p-1.5 rounded-md text-gray-400 hover:text-scholar-600 hover:bg-scholar-50 dark:hover:bg-scholar-900/30 transition-colors disabled:opacity-50 flex-shrink-0"><ArrowRight size={16} /></button>
            </div>
            {searchBarState.questions.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {searchBarState.questions.map((q, i) => (
                  <EditableTag key={`q-${i}`} type="query" index={i} tag={q} isEditing={editingTag.type === 'query' && editingTag.index === i} editingValue={editingTag.value} onRemove={(idx) => updateSearchBar({ questions: searchBarState.questions.filter((_, k) => k !== idx) })} onEditChange={handleEditTagChange} onEditFinish={finishEditingTag} onStartEdit={startEditingTag} />
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-between items-center mt-6 pt-4 border-t border-gray-100 dark:border-gray-700">
            <button onClick={() => { clearSearchBar(); }} className="text-xs font-semibold text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">Clear all</button>
            <button
              onClick={isDeepLoading ? handleStopResearch : startDeepResearch}
              disabled={!canStartDeep && !isDeepLoading}
              className={`
                    flex items-center gap-2 px-6 py-2.5 rounded-lg font-semibold text-sm shadow-md transition-all group
                    ${isDeepLoading
                  ? 'bg-white text-gray-800 border border-gray-300 hover:text-red-600 hover:border-red-300'
                  : 'bg-scholar-600 hover:bg-scholar-700 text-white hover:shadow-lg hover:-translate-y-0.5 disabled:bg-gray-200 dark:disabled:bg-gray-700 disabled:text-gray-400 disabled:cursor-not-allowed'
                }
                `}
            >
              {isDeepLoading ? (
                <>
                  <div className="relative w-4 h-4 flex items-center justify-center">

                    <Square size={14} fill="currentColor" className="absolute opacity-100 group-hover:opacity-100 transition-opacity duration-200" />
                  </div>
                  <span className="group-hover:text-red-600">Stop Research</span>
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  Start Research
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};