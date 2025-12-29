
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { dbService } from './db';
import { DeepResearchNote, FolderNode, FolderType } from '../types';

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
    const data = await dbService.getAllLibraryData();
    const folderData = await dbService.getFolders();
    setSavedPapers(data.papers);
    setSavedNotes(data.notes);
    setFolders(folderData);
  };

  useEffect(() => {
    const init = async () => {
      try {
        await dbService.initSchema();
        await refreshData();
      } catch (error) {
        console.error("[DB Context] Init failed", error);
      } finally {
        setIsDbLoading(false);
      }
    };
    init();
  }, []);

  const savePaper = async (paper: any) => {
    // Explicitly saving the paper from UI
    await dbService.savePaper(paper, true);
    await refreshData();
  };

  const deletePaper = async (uri: string) => {
    await dbService.deletePaper(uri);
    await refreshData();
  };

  const saveNote = async (note: DeepResearchNote, paperMetadata?: any) => {
    // Implicit save of paper metadata for reference, isExplicit = false
    if (paperMetadata) await dbService.savePaper(paperMetadata, false);
    const result = await dbService.saveNote(note);
    await refreshData();
    return result;
  };

  const updateNote = async (id: number, content: string) => {
    await dbService.updateNote(id, content);
    await refreshData();
  };

  const toggleStar = async (noteId: number, state: boolean) => {
    await dbService.toggleStarNote(noteId, state);
    await refreshData();
  };

  const toggleFlag = async (noteId: number, state: boolean) => {
    await dbService.toggleFlagNote(noteId, state);
    await refreshData();
  };

  const deleteNote = async (noteId: number) => {
    await dbService.deleteNotePermanently(noteId);
    await refreshData();
  };

  const createFolder = async (name: string, type: FolderType, parentId?: number | null, description?: string) => {
    await dbService.createFolder(name, type, parentId, description);
    await refreshData();
  };

  const assignNote = async (noteId: number, folderId: number) => {
    await dbService.assignNoteToFolder(noteId, folderId);
    await refreshData();
  };

  const isPaperSaved = useCallback((uri: string) => 
    savedPapers.some(p => p.uri === uri && p.is_explicitly_saved), [savedPapers]);

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
