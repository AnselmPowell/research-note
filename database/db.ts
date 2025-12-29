
import { neon } from "@neondatabase/serverless";
import { ArxivPaper, DeepResearchNote } from "../types";
import { config } from "../config/env";

const DATABASE_URL = config.databaseUrl || 'postgresql://neondb_owner:npg_B3Je2sUxaMAl@ep-wild-smoke-abw72mbs-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
const sql = neon(DATABASE_URL);

export const dbService = {
  async initSchema() {
    try {
      // 1. Papers Table
      await sql`
        CREATE TABLE IF NOT EXISTS papers (
          uri TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          abstract TEXT,
          authors JSONB,
          num_pages INTEGER,
          is_explicitly_saved BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `;

      // --- MIGRATION BLOCK: Ensure columns exist ---
      try {
        await sql`ALTER TABLE papers ADD COLUMN IF NOT EXISTS is_explicitly_saved BOOLEAN DEFAULT FALSE;`;
      } catch (e) { console.warn("[DB] Migration notice:", e); }

      // 2. Notes Table
      await sql`
        CREATE TABLE IF NOT EXISTS notes (
          id SERIAL PRIMARY KEY,
          paper_uri TEXT REFERENCES papers(uri) ON DELETE CASCADE,
          content TEXT NOT NULL,
          justification TEXT,
          citations JSONB,
          related_question TEXT,
          page_number INTEGER,
          relevance_score FLOAT,
          is_starred BOOLEAN DEFAULT FALSE,
          is_flagged BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `;

      // Ensure notes columns exist
      try {
        await sql`ALTER TABLE notes ADD COLUMN IF NOT EXISTS is_starred BOOLEAN DEFAULT FALSE;`;
        await sql`ALTER TABLE notes ADD COLUMN IF NOT EXISTS is_flagged BOOLEAN DEFAULT FALSE;`;
        await sql`ALTER TABLE notes ADD COLUMN IF NOT EXISTS related_question TEXT;`;
        await sql`ALTER TABLE notes ADD COLUMN IF NOT EXISTS relevance_score FLOAT;`;
      } catch (e) { console.warn("[DB] Migration notice:", e); }

      // 3. Folders Table
      await sql`
        CREATE TABLE IF NOT EXISTS folders (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          type TEXT NOT NULL,
          parent_id INTEGER REFERENCES folders(id) ON DELETE CASCADE,
          description TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `;

      // 4. Note Assignments Table
      await sql`
        CREATE TABLE IF NOT EXISTS note_assignments (
          id SERIAL PRIMARY KEY,
          note_id INTEGER REFERENCES notes(id) ON DELETE CASCADE,
          folder_id INTEGER REFERENCES folders(id) ON DELETE CASCADE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(note_id, folder_id)
        );
      `;

      console.log("[DB] Academic Library Schema Initialized & Migrated.");
    } catch (error) {
      console.error("[DB] Schema initialization failed:", error);
    }
  },

  async savePaper(paper: any, isExplicit: boolean = true) {
    const uri = paper.pdfUri || paper.uri;
    const title = paper.title || "Untitled";
    const abstract = paper.summary || paper.abstract || "";
    const authors = paper.authors || [];
    const numPages = paper.num_pages || paper.numPages || null;
    
    // Use EXCLUDED.is_explicitly_saved OR papers.is_explicitly_saved
    // If it was already true, it stays true. If it's becoming true now, we update it.
    return await sql`
      INSERT INTO papers (uri, title, abstract, authors, num_pages, is_explicitly_saved)
      VALUES (${uri}, ${title}, ${abstract}, ${JSON.stringify(authors)}, ${numPages}, ${isExplicit})
      ON CONFLICT (uri) DO UPDATE SET
        title = EXCLUDED.title,
        abstract = EXCLUDED.abstract,
        num_pages = COALESCE(EXCLUDED.num_pages, papers.num_pages),
        is_explicitly_saved = papers.is_explicitly_saved OR EXCLUDED.is_explicitly_saved
      RETURNING *;
    `;
  },

  async saveNote(note: DeepResearchNote) {
    const existing = await sql`
      SELECT * FROM notes 
      WHERE paper_uri = ${note.pdfUri} AND content = ${note.quote}
      LIMIT 1;
    `;
    
    if (existing.length > 0) return existing[0];

    const results = await sql`
      INSERT INTO notes (
        paper_uri, 
        content, 
        justification, 
        citations, 
        related_question, 
        page_number, 
        relevance_score
      )
      VALUES (
        ${note.pdfUri}, 
        ${note.quote}, 
        ${note.justification}, 
        ${JSON.stringify(note.citations || [])}, 
        ${note.relatedQuestion}, 
        ${note.pageNumber}, 
        ${note.relevanceScore || 0}
      )
      RETURNING *;
    `;
    return results[0];
  },

  async updateNote(id: number, content: string) {
    return await sql`UPDATE notes SET content = ${content} WHERE id = ${id} RETURNING *;`;
  },

  async toggleStarNote(noteId: number, state: boolean) {
    return await sql`UPDATE notes SET is_starred = ${state} WHERE id = ${noteId} RETURNING *;`;
  },

  async toggleFlagNote(noteId: number, state: boolean) {
    return await sql`UPDATE notes SET is_flagged = ${state} WHERE id = ${noteId} RETURNING *;`;
  },

  async getAllLibraryData() {
    const papers = await sql`SELECT * FROM papers ORDER BY created_at DESC;`;
    const notes = await sql`SELECT * FROM notes ORDER BY created_at DESC;`;
    return { papers, notes };
  },

  async deletePaper(uri: string) {
    return await sql`DELETE FROM papers WHERE uri = ${uri};`;
  },

  async deleteNotePermanently(id: number) {
    return await sql`DELETE FROM notes WHERE id = ${id};`;
  },

  async createFolder(name: string, type: string, parentId: number | null = null, description: string = '') {
    return await sql`
      INSERT INTO folders (name, type, parent_id, description)
      VALUES (${name}, ${type}, ${parentId}, ${description})
      RETURNING *;
    `;
  },

  async assignNoteToFolder(noteId: number, folderId: number) {
    return await sql`
      INSERT INTO note_assignments (note_id, folder_id)
      VALUES (${noteId}, ${folderId})
      ON CONFLICT DO NOTHING
      RETURNING *;
    `;
  },

  async getFolders() {
    return await sql`SELECT * FROM folders ORDER BY id ASC;`;
  }
};
