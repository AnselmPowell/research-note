// utils/localStorageService.ts - Anonymous user data management
import { DeepResearchNote, FolderNode, FolderType } from '../types';

interface LocalStorageData {
  papers: any[];
  notes: any[];
  folders: any[];
}

export const localStorageService = {
  // Paper management
  savePaper: (paper: any): void => {
    try {
      const papers = localStorageService.getLocalPapers();
      const uri = paper.uri || paper.pdfUri; // Handle both uri and pdfUri
      const existingIndex = papers.findIndex(p => p.uri === uri);
      
      const paperData = {
        ...paper,
        uri: uri, // Ensure consistent URI field
        created_at: paper.created_at || new Date().toISOString()
      };
      
      if (existingIndex >= 0) {
        papers[existingIndex] = { ...papers[existingIndex], ...paperData };
      } else {
        papers.unshift(paperData);
      }
      
      localStorage.setItem('anonymous_papers', JSON.stringify(papers));
      console.log('[LocalStorage] Paper saved:', uri);
    } catch (error) {
      console.error('[LocalStorage] Failed to save paper:', error);
    }
  },

  getLocalPapers: (): any[] => {
    try {
      const papers = localStorage.getItem('anonymous_papers');
      return papers ? JSON.parse(papers) : [];
    } catch (error) {
      console.error('[LocalStorage] Failed to load papers:', error);
      return [];
    }
  },

  deletePaper: (uri: string): void => {
    try {
      const papers = localStorageService.getLocalPapers();
      const filteredPapers = papers.filter(p => p.uri !== uri);
      localStorage.setItem('anonymous_papers', JSON.stringify(filteredPapers));
      
      // Also delete all notes associated with this paper (cascade delete)
      const notes = localStorageService.getLocalNotes();
      const filteredNotes = notes.filter(n => n.paper_uri !== uri);
      localStorage.setItem('anonymous_notes', JSON.stringify(filteredNotes));
      
      console.log('[LocalStorage] Paper deleted:', uri);
    } catch (error) {
      console.error('[LocalStorage] Failed to delete paper:', error);
    }
  },

  // Note management
  saveNote: (note: DeepResearchNote, paperMetadata?: any): any => {
    try {
      const notes = localStorageService.getLocalNotes();
      const newNote = {
        id: Date.now(), // Simple ID for localStorage
        paper_uri: note.pdfUri,
        content: note.quote,
        justification: note.justification,
        citations: note.citations || [],
        related_question: note.relatedQuestion,
        page_number: note.pageNumber,
        relevance_score: note.relevanceScore || 0,
        is_starred: false,
        is_flagged: false,
        created_at: new Date().toISOString()
      };
      
      // Check if note already exists
      const existingIndex = notes.findIndex(n => 
        n.paper_uri === note.pdfUri && n.content === note.quote
      );
      
      if (existingIndex >= 0) {
        return notes[existingIndex];
      }
      
      notes.unshift(newNote);
      localStorage.setItem('anonymous_notes', JSON.stringify(notes));
      
      // Also save paper metadata if provided
      if (paperMetadata) {
        localStorageService.savePaperMetadata(paperMetadata);
      }
      
      return newNote;
    } catch (error) {
      console.error('[LocalStorage] Failed to save note:', error);
      return null;
    }
  },

  savePaperMetadata: (paper: any): void => {
    try {
      const papers = localStorageService.getLocalPapers();
      const uri = paper.uri || paper.pdfUri; // Handle both uri and pdfUri
      const existingIndex = papers.findIndex(p => p.uri === uri);
      
      const paperData = {
        ...paper,
        uri: uri, // Ensure consistent URI field
        created_at: paper.created_at || new Date().toISOString()
      };
      
      if (existingIndex >= 0) {
        papers[existingIndex] = { ...papers[existingIndex], ...paperData };
      } else {
        papers.push(paperData);
      }
      
      localStorage.setItem('anonymous_papers', JSON.stringify(papers));
      console.log('[LocalStorage] Paper metadata saved:', uri);
    } catch (error) {
      console.error('[LocalStorage] Failed to save paper metadata:', error);
    }
  },

  getLocalNotes: (): any[] => {
    try {
      const notes = localStorage.getItem('anonymous_notes');
      return notes ? JSON.parse(notes) : [];
    } catch (error) {
      console.error('[LocalStorage] Failed to load notes:', error);
      return [];
    }
  },

  updateNote: (id: number, content: string): void => {
    try {
      const notes = localStorageService.getLocalNotes();
      const noteIndex = notes.findIndex(n => n.id === id);
      
      if (noteIndex >= 0) {
        notes[noteIndex].content = content;
        localStorage.setItem('anonymous_notes', JSON.stringify(notes));
      }
    } catch (error) {
      console.error('[LocalStorage] Failed to update note:', error);
    }
  },

  deleteNote: (noteId: number): void => {
    try {
      const notes = localStorageService.getLocalNotes();
      const filtered = notes.filter(n => n.id !== noteId);
      localStorage.setItem('anonymous_notes', JSON.stringify(filtered));
    } catch (error) {
      console.error('[LocalStorage] Failed to delete note:', error);
    }
  },

  toggleStar: (noteId: number, state: boolean): void => {
    try {
      const notes = localStorageService.getLocalNotes();
      const noteIndex = notes.findIndex(n => n.id === noteId);
      
      if (noteIndex >= 0) {
        notes[noteIndex].is_starred = state;
        localStorage.setItem('anonymous_notes', JSON.stringify(notes));
      }
    } catch (error) {
      console.error('[LocalStorage] Failed to toggle star:', error);
    }
  },

  toggleFlag: (noteId: number, state: boolean): void => {
    try {
      const notes = localStorageService.getLocalNotes();
      const noteIndex = notes.findIndex(n => n.id === noteId);
      
      if (noteIndex >= 0) {
        notes[noteIndex].is_flagged = state;
        localStorage.setItem('anonymous_notes', JSON.stringify(notes));
      }
    } catch (error) {
      console.error('[LocalStorage] Failed to toggle flag:', error);
    }
  },

  // Folder management
  getLocalFolders: (): any[] => {
    try {
      const folders = localStorage.getItem('anonymous_folders');
      return folders ? JSON.parse(folders) : [];
    } catch (error) {
      console.error('[LocalStorage] Failed to load folders:', error);
      return [];
    }
  },

  createFolder: (name: string, type: FolderType, parentId?: number | null, description?: string): void => {
    try {
      const folders = localStorageService.getLocalFolders();
      const newFolder = {
        id: Date.now(),
        name,
        type,
        parent_id: parentId || null,
        description: description || '',
        created_at: new Date().toISOString()
      };
      
      folders.push(newFolder);
      localStorage.setItem('anonymous_folders', JSON.stringify(folders));
    } catch (error) {
      console.error('[LocalStorage] Failed to create folder:', error);
    }
  },

  assignNote: (noteId: number, folderId: number): void => {
    try {
      const assignments = localStorage.getItem('anonymous_note_assignments');
      const current = assignments ? JSON.parse(assignments) : [];
      
      // Remove existing assignment for this note
      const filtered = current.filter((a: any) => a.note_id !== noteId);
      
      // Add new assignment
      filtered.push({
        id: Date.now(),
        note_id: noteId,
        folder_id: folderId,
        created_at: new Date().toISOString()
      });
      
      localStorage.setItem('anonymous_note_assignments', JSON.stringify(filtered));
    } catch (error) {
      console.error('[LocalStorage] Failed to assign note:', error);
    }
  },

  // Utility methods
  getAllLibraryData: (): LocalStorageData => {
    return {
      papers: localStorageService.getLocalPapers(),
      notes: localStorageService.getLocalNotes(),
      folders: localStorageService.getLocalFolders()
    };
  },

  clearAllData: (): void => {
    try {
      localStorage.removeItem('anonymous_papers');
      localStorage.removeItem('anonymous_notes');
      localStorage.removeItem('anonymous_folders');
      localStorage.removeItem('anonymous_note_assignments');
      
      // Also clear Microsoft auth passwords on sign out
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('microsoft_user_')) {
          localStorage.removeItem(key);
        }
      });
    } catch (error) {
      console.error('[LocalStorage] Failed to clear data:', error);
    }
  },

  // Web Search Results Persistence
  saveWebSearchResults: (query: string, results: any): void => {
    try {
      const data = {
        query,
        results,
        timestamp: new Date().toISOString()
      };
      localStorage.setItem('web_search_results', JSON.stringify(data));
      console.log('[LocalStorage] Web search results saved');
    } catch (error) {
      console.error('[LocalStorage] Failed to save web search results:', error);
    }
  },

  getWebSearchResults: (): { query: string; results: any; timestamp: string } | null => {
    try {
      const data = localStorage.getItem('web_search_results');
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('[LocalStorage] Failed to load web search results:', error);
      return null;
    }
  },

  clearWebSearchResults: (): void => {
    try {
      localStorage.removeItem('web_search_results');
      console.log('[LocalStorage] Web search results cleared');
    } catch (error) {
      console.error('[LocalStorage] Failed to clear web search results:', error);
    }
  },

  // Deep Research Results Persistence
  saveDeepResearchResults: (data: {
    arxivKeywords: string[];
    arxivCandidates: any[];
    filteredCandidates: any[];
    deepResearchResults: any[];
    searchBarState: any;
  }): void => {
    try {
      const saveData = {
        ...data,
        timestamp: new Date().toISOString()
      };
      localStorage.setItem('deep_research_results', JSON.stringify(saveData));
      console.log('[LocalStorage] Deep research results saved');
    } catch (error) {
      console.error('[LocalStorage] Failed to save deep research results:', error);
    }
  },

  getDeepResearchResults: (): any | null => {
    try {
      const data = localStorage.getItem('deep_research_results');
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('[LocalStorage] Failed to load deep research results:', error);
      return null;
    }
  },

  clearDeepResearchResults: (): void => {
    try {
      localStorage.removeItem('deep_research_results');
      console.log('[LocalStorage] Deep research results cleared');
    } catch (error) {
      console.error('[LocalStorage] Failed to clear deep research results:', error);
    }
  },

  // Migration helper for when user signs up
  exportDataForMigration: (): LocalStorageData => {
    return localStorageService.getAllLibraryData();
  }
};
