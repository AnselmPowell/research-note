
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { dbService } from './db';
import { DeepResearchNote, FolderNode, FolderType } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { localStorageService } from '../utils/localStorageService';

interface DatabaseContextType {
  savedPapers: any[];
  savedNotes: any[];
  isDbLoading: boolean;
  projectStructure: FolderNode[];
  
  savePaper: (paper: any) => Promise<void>;
  deletePaper: (uri: string) => Promise<void>;
  saveNote: (note: DeepResearchNote, paperMetadata?: any) => Promise<any>;
  updateNote: (id: number, content: string) => Promise<void>;
  deleteNote: (noteId: number) => Promise<void>;
  toggleStar: (noteId: number, state: boolean) => Promise<void>;
  toggleFlag: (noteId: number, state: boolean) => Promise<void>;
  
  createFolder: (name: string, type: FolderType, parentId?: number | null, description?: string) => Promise<void>;
  assignNote: (noteId: number, folderId: number) => Promise<void>;
  
  isPaperSaved: (uri: string) => boolean;
  isNoteSaved: (paperUri: string, content: string) => boolean;
}

const DatabaseContext = createContext<DatabaseContextType | undefined>(undefined);

export const DatabaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAuthenticated } = useAuth(); // Add auth dependency
  const [savedPapers, setSavedPapers] = useState<any[]>([]);
  const [savedNotes, setSavedNotes] = useState<any[]>([]);
  const [folders, setFolders] = useState<any[]>([]);
  const [isDbLoading, setIsDbLoading] = useState(true);

  const projectStructure = useMemo(() => {
    const buildTree = (parentId: number | null = null): FolderNode[] => {
      return folders
        .filter(f => f.parent_id === parentId)
        .map(f => ({
          id: f.id,
          name: f.name,
          type: f.type as FolderType,
          parent_id: f.parent_id,
          children: buildTree(f.id)
        }));
    };
    return buildTree(null);
  }, [folders]);

  const refreshData = async () => {
    if (user && isAuthenticated) {
      // Load from database for authenticated users
      try {
        const data = await dbService.getAllLibraryData(user.id);
        const folderData = await dbService.getFolders(user.id);
        setSavedPapers(data.papers);
        setSavedNotes(data.notes);
        setFolders(folderData);
      } catch (error) {
        console.error("[DB Context] Failed to refresh data:", error);
      }
    } else {
      // Load from localStorage for anonymous users
      try {
        const localData = localStorageService.getAllLibraryData();
        setSavedPapers(localData.papers);
        setSavedNotes(localData.notes);
        setFolders(localData.folders);
      } catch (error) {
        console.error("[DB Context] Failed to refresh local data:", error);
      }
    }
  };

  useEffect(() => {
    const init = async () => {
      try {
        await dbService.initSchema();
        await refreshData(); // This will now filter by user OR load from localStorage
      } catch (error) {
        console.error("[DB Context] Init failed", error);
      } finally {
        setIsDbLoading(false);
      }
    };
    init();
  }, [user, isAuthenticated]); // Re-run when auth state changes

  const savePaper = async (paper: any) => {
    console.log('[DB Context] Saving paper:', paper.pdfUri || paper.uri);
    if (user && isAuthenticated) {
      // Save to database for authenticated users
      await dbService.savePaper(paper, user.id);
    } else {
      // Save to localStorage for anonymous users
      localStorageService.savePaper(paper);
    }
    await refreshData();
    console.log('[DB Context] Paper saved successfully');
  };

  const deletePaper = async (uri: string) => {
    console.log('[DB Context] Deleting paper:', uri);
    if (user && isAuthenticated) {
      await dbService.deletePaper(uri);
    } else {
      localStorageService.deletePaper(uri);
    }
    await refreshData();
    console.log('[DB Context] Paper deleted successfully');
  };

  const saveNote = async (note: DeepResearchNote, paperMetadata?: any) => {
    console.log('[DB Context] Saving note for paper:', note.pdfUri);
    let result;
    
    if (user && isAuthenticated) {
      // Auto-save paper when saving note (ensure paper exists)
      if (paperMetadata) {
        console.log('[DB Context] Auto-saving paper metadata:', paperMetadata);
        await dbService.savePaper(paperMetadata, user.id);
      }
      result = await dbService.saveNote(note, user.id);
    } else {
      // Save to localStorage for anonymous users
      result = localStorageService.saveNote(note, paperMetadata);
      // For localStorage, also auto-save the paper
      if (paperMetadata) {
        console.log('[DB Context] Auto-saving paper metadata to localStorage:', paperMetadata);
        localStorageService.savePaper(paperMetadata);
      }
    }
    
    await refreshData();
    console.log('[DB Context] Note saved successfully');
    return result;
  };

  const updateNote = async (id: number, content: string) => {
    if (user && isAuthenticated) {
      await dbService.updateNote(id, content);
    } else {
      localStorageService.updateNote(id, content);
    }
    await refreshData();
  };

  const toggleStar = async (noteId: number, state: boolean) => {
    if (user && isAuthenticated) {
      await dbService.toggleStarNote(noteId, state);
    } else {
      localStorageService.toggleStar(noteId, state);
    }
    await refreshData();
  };

  const toggleFlag = async (noteId: number, state: boolean) => {
    if (user && isAuthenticated) {
      await dbService.toggleFlagNote(noteId, state);
    } else {
      localStorageService.toggleFlag(noteId, state);
    }
    await refreshData();
  };

  const deleteNote = async (noteId: number) => {
    if (user && isAuthenticated) {
      await dbService.deleteNotePermanently(noteId);
    } else {
      localStorageService.deleteNote(noteId);
    }
    await refreshData();
  };

  const createFolder = async (name: string, type: FolderType, parentId?: number | null, description?: string) => {
    if (user && isAuthenticated) {
      await dbService.createFolder(name, type, parentId, description, user.id);
    } else {
      localStorageService.createFolder(name, type, parentId, description);
    }
    await refreshData();
  };

  const assignNote = async (noteId: number, folderId: number) => {
    if (user && isAuthenticated) {
      await dbService.assignNoteToFolder(noteId, folderId);
    } else {
      localStorageService.assignNote(noteId, folderId);
    }
    await refreshData();
  };

  const isPaperSaved = useCallback((uri: string) => 
    savedPapers.some(p => p.uri === uri), [savedPapers]);

  const isNoteSaved = useCallback((paperUri: string, content: string) => 
    savedNotes.some(n => n.paper_uri === paperUri && n.content === content), [savedNotes]);

  return (
    <DatabaseContext.Provider value={{
      savedPapers, savedNotes, isDbLoading, projectStructure,
      savePaper, deletePaper, saveNote, updateNote, deleteNote, toggleStar, toggleFlag,
      createFolder, assignNote,
      isPaperSaved, isNoteSaved
    }}>
      {children}
    </DatabaseContext.Provider>
  );
};

export const useDatabase = () => {
  const context = useContext(DatabaseContext);
  if (!context) throw new Error("useDatabase must be used within a DatabaseProvider");
  return context;
};
