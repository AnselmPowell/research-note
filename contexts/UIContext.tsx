import React, { createContext, useContext, useState, useEffect } from 'react';
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

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const toggleDarkMode = () => setDarkMode(prev => !prev);

  const toggleLock = (col: ColumnKey) => {
    setColumnLocks(prev => ({ ...prev, [col]: !prev[col] }));
  };

  /**
   * UPDATED: Opening a column now checks for locks.
   * Any column that is NOT locked and is NOT the one being opened will be closed.
   */
  const openColumn = (col: ColumnKey) => {
    setColumnVisibility(prev => {
      const newState = { ...prev };
      newState[col] = true;

      // Logic: Close any other column that is NOT locked
      (Object.keys(newState) as ColumnKey[]).forEach(key => {
        if (key !== col && !columnLocks[key]) {
          newState[key] = false;
        }
      });

      return newState;
    });
  };

  const toggleColumn = (col: ColumnKey) => {
    if (columnVisibility[col]) {
      setColumnVisibility(prev => ({ ...prev, [col]: false }));
    } else {
      openColumn(col);
    }
  };

  const toggleLibrary = () => setIsLibraryOpen(prev => !prev);

  const openAssignmentModal = (note: DeepResearchNote, sourceMetadata: any) => {
    setAssignmentModal({ isOpen: true, note, sourceMetadata });
  };

  const closeAssignmentModal = () => {
    setAssignmentModal(prev => ({ ...prev, isOpen: false }));
  };

  // Reset UI state to initial values (for sign out)
  const resetUI = () => {
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
    closeAssignmentModal();
  };

  return (
    <UIContext.Provider value={{
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
      setLibraryOpen: setIsLibraryOpen,
      setLibraryExpanded: setIsLibraryExpanded,
      libraryActiveView,
      setLibraryActiveView,
      assignmentModal,
      openAssignmentModal,
      closeAssignmentModal,
      resetUI
    }}>
      {children}
    </UIContext.Provider>
  );
};

export const useUI = () => {
  const context = useContext(UIContext);
  if (!context) throw new Error("useUI must be used within a UIProvider");
  return context;
};