import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { DeepResearchNote } from '../types';

// State for assigning notes to folders
interface AssignmentModalState {
  isOpen: boolean;
  note: DeepResearchNote | null;
  sourceMetadata: any;
}

export type LibraryView = 'all' | 'recent' | 'flagged' | 'starred' | 'papers';
export type ColumnKey = 'left' | 'middle' | 'library' | 'right';

interface UIContextType {
  darkMode: boolean;
  toggleDarkMode: () => void;
  columnVisibility: { left: boolean; middle: boolean; library: boolean; right: boolean };
  columnLocks: { left: boolean; middle: boolean; library: boolean; right: boolean };
  setColumnVisibility: React.Dispatch<React.SetStateAction<{ left: boolean; middle: boolean; library: boolean; right: boolean }>>;
  toggleColumn: (col: ColumnKey) => void;
  openColumn: (col: ColumnKey) => void;
  toggleLock: (col: ColumnKey) => void;
  isHomeExiting: boolean;
  setIsHomeExiting: (exiting: boolean) => void;
  // Library Sidebar State
  isLibraryOpen: boolean;
  isLibraryExpanded: boolean;
  toggleLibrary: () => void;
  setLibraryOpen: (open: boolean) => void;
  setLibraryExpanded: (expanded: boolean) => void;
  libraryActiveView: LibraryView;
  setLibraryActiveView: (view: LibraryView) => void;
  // Assignment Modal
  assignmentModal: AssignmentModalState;
  openAssignmentModal: (note: DeepResearchNote, sourceMetadata: any) => void;
  closeAssignmentModal: () => void;
  // Reset UI state
  resetUI: () => void;
  // Header Visibility (Focus Mode)
  isHeaderVisible: boolean;
  setHeaderVisible: (visible: boolean) => void;
  handleAutoHeaderHide: () => void;
  handleScroll: (e: React.UIEvent<HTMLElement>) => void;
}

const UIContext = createContext<UIContextType | undefined>(undefined);

export const UIProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [darkMode, setDarkMode] = useState(false);

  const [columnVisibility, setColumnVisibility] = useState({
    left: false,
    middle: false,
    library: false,
    right: false
  });

  // NEW: Initialize locks. Right column (Workspace) is locked by default.
  const [columnLocks, setColumnLocks] = useState({
    left: false,
    middle: false,
    library: false,
    right: true
  });

  const [isHomeExiting, setIsHomeExiting] = useState(false);

  // Library State
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isLibraryExpanded, setIsLibraryExpanded] = useState(false);
  const [libraryActiveView, setLibraryActiveView] = useState<LibraryView>('all');

  // Assignment Modal State
  const [assignmentModal, setAssignmentModal] = useState<AssignmentModalState>({
    isOpen: false,
    note: null,
    sourceMetadata: null
  });

  const [isHeaderVisible, setHeaderVisible] = useState(true);
  const lastScrollTime = useRef(0);

  const handleAutoHeaderHide = useCallback(() => {
    if (isHeaderVisible) setHeaderVisible(false);
  }, [isHeaderVisible]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLElement>) => {
    const scrollTop = e.currentTarget.scrollTop;
    // Threshold: Hide header after scrolling down. 
    // We removed the scroll-up re-show logic to respect Focus Mode.
    if (scrollTop > 60 && isHeaderVisible) {
      setHeaderVisible(false);
    }
  }, [isHeaderVisible]);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Ensure header is visible when all columns are closed (on landing page)
  useEffect(() => {
    const allClosed = !columnVisibility.left && !columnVisibility.middle && !columnVisibility.library && !columnVisibility.right;
    if (allClosed) {
      setHeaderVisible(true);
    }
  }, [columnVisibility]);

  const toggleDarkMode = useCallback(() => setDarkMode(prev => !prev), []);

  const toggleLock = useCallback((col: ColumnKey) => {
    setColumnLocks(prev => ({ ...prev, [col]: !prev[col] }));
  }, []);



  /**
   * UPDATED: Opening a column now checks for locks.
   * Any column that is NOT locked and is NOT the one being opened will be closed.
   */
  const openColumn = useCallback((col: ColumnKey) => {
    setHeaderVisible(false);
    setColumnVisibility(prev => {
      const newState = { ...prev };

      // If opening the library, enforce exclusivity: close sources and research
      // but do NOT automatically open the paper view (right). The paper view
      // should be controlled separately by the user.
      if (col === 'library') {
        newState.library = true;
        newState.left = false;
        newState.middle = false;
        return newState;
      }

      // Default behavior for other columns
      newState[col] = true;

      // RULE: Opening 'left' (Sources) also opens 'middle' (Research)
      // UNLESS 'right' (Paper View) is already open
      if (col === 'left' && !prev.right) {
        newState.middle = true;
      }

      // If library is currently open, close it when opening left/middle/right
      if (prev.library && (col === 'left' || col === 'middle' || col === 'right')) {
        newState.library = false;
      }

      // Logic: Close any other column that is NOT locked
      (Object.keys(newState) as ColumnKey[]).forEach(key => {
        if (key !== col && !columnLocks[key]) {
          // Don't close 'middle' if 'left' is being opened or is already open (and right is not open)
          if (key === 'middle' && (col === 'left' || newState.left) && !newState.right) {
            return; // Skip closing middle
          }
          newState[key] = false;
        }
      });

      return newState;
    });

    // Ensure the middle column is locked when it becomes visible.
    // This covers both: direct opening of middle, and opening left which auto-opens middle.
    setColumnLocks(prev => {
      const next = { ...prev };
      if (col === 'middle' || (col === 'left' && !columnVisibility.right)) {
        next.middle = true;
      }
      return next;
    });
  }, [columnLocks, columnVisibility.right]);

  const toggleColumn = useCallback((col: ColumnKey) => {
    // If toggling to open sources or research while library is open, close library first
    if (!columnVisibility[col] && columnVisibility.library && (col === 'left' || col === 'middle')) {
      // Close library to allow opening left/middle
      setColumnVisibility(prev => ({ ...prev, library: false }));
    }

    if (columnVisibility[col]) {
      setColumnVisibility(prev => ({ ...prev, [col]: false }));
    } else {
      openColumn(col);
    }
  }, [columnVisibility, openColumn]);

  const toggleLibrary = useCallback(() => setIsLibraryOpen(prev => !prev), []);

  const openAssignmentModal = useCallback((note: DeepResearchNote, sourceMetadata: any) => {
    setAssignmentModal({ isOpen: true, note, sourceMetadata });
  }, []);

  const closeAssignmentModal = useCallback(() => {
    setAssignmentModal(prev => ({ ...prev, isOpen: false }));
  }, []);

  // Reset UI state to initial values (for sign out)
  const resetUI = useCallback(() => {
    setColumnVisibility({
      left: false,
      middle: false,
      library: false,
      right: false
    });
    setIsHomeExiting(false);
    setIsLibraryOpen(false);
    setIsLibraryExpanded(false);
    setLibraryActiveView('all');
    setHeaderVisible(true);
    closeAssignmentModal();
  }, [closeAssignmentModal]);

  // Controlled setter for the library drawer state. This toggles the sidebar
  // drawer only; it does NOT automatically open the library column. The
  // library column should be opened explicitly via `openColumn('library')`
  // (e.g. when the user selects an item inside the sidebar).
  const setLibraryOpen = useCallback((open: boolean) => {
    setIsLibraryOpen(open);
  }, []);

  const contextValue = useMemo(() => ({
    darkMode,
    toggleDarkMode,
    columnVisibility,
    columnLocks,
    setColumnVisibility,
    toggleColumn,
    openColumn,
    toggleLock,
    isHomeExiting,
    setIsHomeExiting,
    isLibraryOpen,
    isLibraryExpanded,
    toggleLibrary,
    setLibraryOpen,
    setLibraryExpanded: setIsLibraryExpanded,
    libraryActiveView,
    setLibraryActiveView,
    assignmentModal,
    openAssignmentModal,
    closeAssignmentModal,
    resetUI,
    isHeaderVisible,
    setHeaderVisible,
    handleAutoHeaderHide,
    handleScroll
  }), [
    darkMode,
    toggleDarkMode,
    columnVisibility,
    columnLocks,
    toggleColumn,
    openColumn,
    toggleLock,
    isHomeExiting,
    isLibraryOpen,
    isLibraryExpanded,
    toggleLibrary,
    setLibraryOpen,
    libraryActiveView,
    assignmentModal,
    openAssignmentModal,
    closeAssignmentModal,
    resetUI,
    isHeaderVisible,
    handleAutoHeaderHide
  ]);

  return (
    <UIContext.Provider value={contextValue}>
      {children}
    </UIContext.Provider>
  );
};

export const useUI = () => {
  const context = useContext(UIContext);
  if (!context) throw new Error("useUI must be used within a UIProvider");
  return context;
};