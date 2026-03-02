// utils/dataMigrationService.ts - Migrate localStorage data to database when user signs up
import { localStorageService } from './localStorageService';
import { dbService } from '../database/db';

interface MigrationResult {
  success: boolean;
  error?: string;
  migratedPapers?: number;
  migratedNotes?: number;
  migratedFolders?: number;
  migratedAccumulatedPapers?: number;
  migratedAccumulatedNotes?: number;
}

export const dataMigrationService = {
  /**
   * Migrate all localStorage data including "My Results" accumulation
   * Called after user successfully signs up/in
   */
  migrateAnonymousDataToUser: async (userId: string): Promise<MigrationResult> => {
    try {
      console.log('\n╔════════════════════════════════════════════════════════════════╗');
      console.log('║        [Migration] 🚀 STARTING COMPLETE DATA MIGRATION          ║');
      console.log('╚════════════════════════════════════════════════════════════════╝');
      console.log('[Migration] User ID:', userId);
      
      // Get all localStorage data (library + search results)
      const localData = localStorageService.getAllLibraryData();
      
      // ✅ NEW: Get "My Results" accumulation data
      const accumulationData = localStorageService.getPaperResultsAccumulation();
      
      let migratedPapers = 0;
      let migratedNotes = 0;
      let migratedFolders = 0;
      let migratedAccumulatedPapers = 0;
      let migratedAccumulatedNotes = 0;

      // [EXISTING] Migrate regular library papers
      console.log('\n📚 Migrating LIBRARY PAPERS...');
      for (const paper of localData.papers) {
        try {
          await dbService.savePaper(paper, userId);
          migratedPapers++;
          console.log(`  ✅ Migrated paper: ${paper.title?.substring(0, 60) || paper.uri}`);
        } catch (error) {
          console.warn('[Migration] ⚠️ Failed to migrate library paper:', paper.uri, error);
        }
      }
      console.log(`[Migration] 📚 Library papers: ${migratedPapers}/${localData.papers.length}`);

      // [EXISTING] Migrate folders
      console.log('\n📁 Migrating FOLDERS...');
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
            console.log(`  ✅ Migrated folder: ${folder.name}`);
          }
        } catch (error) {
          console.warn('[Migration] ⚠️ Failed to migrate folder:', folder.name, error);
        }
      }
      console.log(`[Migration] 📁 Folders: ${migratedFolders}/${localData.folders.length}`);

      // [EXISTING] Migrate regular library notes
      console.log('\n📝 Migrating LIBRARY NOTES...');
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
          console.log(`  ✅ Migrated note from: ${note.paper_uri?.substring(0, 40)}`);
        } catch (error) {
          console.warn('[Migration] ⚠️ Failed to migrate library note:', note.id, error);
        }
      }
      console.log(`[Migration] 📝 Library notes: ${migratedNotes}/${localData.notes.length}`);

      // ✅ NEW: Migrate "My Results" papers
      if (accumulationData?.accumulatedPapers?.length > 0) {
        console.log('\n📊 Migrating "MY RESULTS" PAPERS...');
        for (const paper of accumulationData.accumulatedPapers) {
          try {
            // Save accumulated paper to database (marks origin as "My Results")
            const paperData = {
              ...paper,
              uri: paper.pdfUri || paper.id,
              pdfUri: paper.pdfUri || paper.id,
              sourceOrigin: 'my_results_accumulation',
              addedToAccumulationAt: paper.addedToAccumulationAt || Date.now()
            };
            
            await dbService.savePaper(paperData, userId);
            migratedAccumulatedPapers++;
            console.log(`  ✅ Migrated accumulated paper: ${paper.title?.substring(0, 60)}`);
          } catch (error) {
            console.warn('[Migration] ⚠️ Failed to migrate accumulated paper:', paper.id, error);
          }
        }
        console.log(`[Migration] 📊 My Results papers: ${migratedAccumulatedPapers}/${accumulationData.accumulatedPapers.length}`);
      } else {
        console.log('[Migration] 📊 No "My Results" papers to migrate');
      }

      // ✅ NEW: Migrate "My Results" notes
      if (accumulationData?.accumulatedNotes?.length > 0) {
        console.log('\n📋 Migrating "MY RESULTS" NOTES...');
        for (const note of accumulationData.accumulatedNotes) {
          try {
            const noteData = {
              id: note.id,
              quote: note.quote,
              justification: note.justification,
              citations: note.citations,
              relatedQuestion: note.relatedQuestion,
              pageNumber: note.pageNumber,
              relevanceScore: note.relevanceScore,
              pdfUri: note.pdfUri
            };
            
            await dbService.saveNote(noteData, userId);
            migratedAccumulatedNotes++;
            console.log(`  ✅ Migrated accumulated note from: ${note.pdfUri?.substring(0, 40)}`);
          } catch (error) {
            console.warn('[Migration] ⚠️ Failed to migrate accumulated note:', note.pdfUri, error);
          }
        }
        console.log(`[Migration] 📋 My Results notes: ${migratedAccumulatedNotes}/${accumulationData.accumulatedNotes.length}`);
      } else {
        console.log('[Migration] 📋 No "My Results" notes to migrate');
      }

      // ✅ CRITICAL: Selective clear - only clear library data, NOT "My Results"
      // This prevents race condition where debounce writes back cleared data
      console.log('\n🧹 Clearing LIBRARY DATA from localStorage (preserving My Results)...');
      localStorageService.clearLibraryDataOnly();

      const totalMigratedPapers = migratedPapers + migratedAccumulatedPapers;
      const totalMigratedNotes = migratedNotes + migratedAccumulatedNotes;
      
      console.log('\n╔════════════════════════════════════════════════════════════════╗');
      console.log('║           [Migration] ✅ MIGRATION COMPLETE                     ║');
      console.log('╚════════════════════════════════════════════════════════════════╝');
      console.log(`📚 Library: ${migratedPapers} papers, ${migratedNotes} notes, ${migratedFolders} folders`);
      console.log(`📊 My Results: ${migratedAccumulatedPapers} papers, ${migratedAccumulatedNotes} notes`);
      console.log(`📈 TOTAL: ${totalMigratedPapers} papers, ${totalMigratedNotes} notes`);
      console.log('');
      
      return { 
        success: true,
        migratedPapers: totalMigratedPapers,
        migratedNotes: totalMigratedNotes,
        migratedFolders,
        migratedAccumulatedPapers,
        migratedAccumulatedNotes
      };
      
    } catch (error) {
      console.error('[Migration] ❌ Migration failed:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown migration error'
      };
    }
  },

  /**
   * Check if user has EITHER library OR accumulation data to migrate
   */
  hasLocalDataToMigrate: (): boolean => {
    try {
      const localData = localStorageService.getAllLibraryData();
      const accumulationData = localStorageService.getPaperResultsAccumulation();
      
      const hasLibraryData = localData.papers.length > 0 || localData.notes.length > 0 || localData.folders.length > 0;
      const hasAccumulationData = (accumulationData?.accumulatedPapers?.length || 0) > 0 || 
                                   (accumulationData?.accumulatedNotes?.length || 0) > 0;
      
      return hasLibraryData || hasAccumulationData;
    } catch (error) {
      console.error('[Migration] Failed to check local data:', error);
      return false;
    }
  },

  /**
   * Get migration preview including "My Results" data
   */
  getMigrationPreview: (): { 
    libraryPapers: number; 
    libraryNotes: number; 
    libraryFolders: number;
    accumulatedPapers: number;
    accumulatedNotes: number;
  } => {
    try {
      const localData = localStorageService.getAllLibraryData();
      const accumulationData = localStorageService.getPaperResultsAccumulation();
      
      return {
        libraryPapers: localData.papers.length,
        libraryNotes: localData.notes.length,
        libraryFolders: localData.folders.length,
        accumulatedPapers: accumulationData?.accumulatedPapers?.length || 0,
        accumulatedNotes: accumulationData?.accumulatedNotes?.length || 0
      };
    } catch (error) {
      console.error('[Migration] Failed to get migration preview:', error);
      return { libraryPapers: 0, libraryNotes: 0, libraryFolders: 0, accumulatedPapers: 0, accumulatedNotes: 0 };
    }
  }
};
