// utils/dataMigrationService.ts - Migrate localStorage data to database when user signs up
import { localStorageService } from './localStorageService';
import { dbService } from '../database/db';

export const dataMigrationService = {
  /**
   * Migrate all localStorage data to database when anonymous user signs up
   */
  migrateAnonymousDataToUser: async (userId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      console.log('[Migration] Starting data migration for user:', userId);
      
      // Get all localStorage data
      const localData = localStorageService.getAllLibraryData();
      
      let migratedPapers = 0;
      let migratedNotes = 0;
      let migratedFolders = 0;

      // Migrate papers
      for (const paper of localData.papers) {
        try {
          await dbService.savePaper(paper, userId);
          migratedPapers++;
        } catch (error) {
          console.warn('[Migration] Failed to migrate paper:', paper.uri, error);
        }
      }

      // Migrate folders first (needed for note assignments)
      const folderIdMapping: { [localId: number]: number } = {};
      for (const folder of localData.folders) {
        try {
          const result = await dbService.createFolder(
            folder.name,
            folder.type,
            folder.parent_id,
            folder.description,
            userId
          );
          if (result && result[0]) {
            folderIdMapping[folder.id] = result[0].id;
            migratedFolders++;
          }
        } catch (error) {
          console.warn('[Migration] Failed to migrate folder:', folder.name, error);
        }
      }

      // Migrate notes
      for (const note of localData.notes) {
        try {
          const noteData = {
            id: note.id,
            quote: note.content,
            justification: note.justification,
            citations: note.citations,
            relatedQuestion: note.related_question,
            pageNumber: note.page_number,
            relevanceScore: note.relevance_score,
            pdfUri: note.paper_uri
          };
          
          await dbService.saveNote(noteData, userId);
          migratedNotes++;
        } catch (error) {
          console.warn('[Migration] Failed to migrate note:', note.id, error);
        }
      }

      // Clear localStorage after successful migration
      localStorageService.clearAllData();
      
      console.log(`[Migration] Migration complete: ${migratedPapers} papers, ${migratedNotes} notes, ${migratedFolders} folders`);
      
      return { 
        success: true,
        // Can add migration stats if needed
      };
      
    } catch (error) {
      console.error('[Migration] Migration failed:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown migration error'
      };
    }
  },

  /**
   * Check if user has localStorage data that can be migrated
   */
  hasLocalDataToMigrate: (): boolean => {
    try {
      const localData = localStorageService.getAllLibraryData();
      return localData.papers.length > 0 || localData.notes.length > 0 || localData.folders.length > 0;
    } catch (error) {
      console.error('[Migration] Failed to check local data:', error);
      return false;
    }
  },

  /**
   * Get migration preview statistics
   */
  getMigrationPreview: (): { papers: number; notes: number; folders: number } => {
    try {
      const localData = localStorageService.getAllLibraryData();
      return {
        papers: localData.papers.length,
        notes: localData.notes.length,
        folders: localData.folders.length
      };
    } catch (error) {
      console.error('[Migration] Failed to get migration preview:', error);
      return { papers: 0, notes: 0, folders: 0 };
    }
  }
};
