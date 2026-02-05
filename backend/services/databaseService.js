const { neon } = require('@neondatabase/serverless');
const { initializeEnvironment } = require('../config/env');
const logger = require('../utils/logger');

const config = initializeEnvironment();

let sql = null;
function getDb() {
  if (!sql) {
    if (!config.databaseUrl) {
      throw new Error('DATABASE_URL not configured');
    }
    sql = neon(config.databaseUrl);
    logger.info('✅ Database connection initialized');
  }
  return sql;
}

async function initSchema() {
  await getDb()`CREATE TABLE IF NOT EXISTS papers (
    uri TEXT PRIMARY KEY, title TEXT NOT NULL, abstract TEXT, authors JSONB,
    num_pages INTEGER, is_explicitly_saved BOOLEAN DEFAULT FALSE, user_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP)`;
  await sql`CREATE TABLE IF NOT EXISTS notes (
    id SERIAL PRIMARY KEY, paper_uri TEXT REFERENCES papers(uri) ON DELETE CASCADE,
    content TEXT NOT NULL, justification TEXT, citations JSONB, related_question TEXT,
    page_number INTEGER, relevance_score FLOAT, is_starred BOOLEAN DEFAULT FALSE,
    is_flagged BOOLEAN DEFAULT FALSE, user_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP)`;
  await sql`CREATE TABLE IF NOT EXISTS folders (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL,
    parent_id INTEGER REFERENCES folders(id) ON DELETE CASCADE, description TEXT,
    user_id TEXT, created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP)`;
  await sql`CREATE TABLE IF NOT EXISTS note_assignments (
    id SERIAL PRIMARY KEY, note_id INTEGER REFERENCES notes(id) ON DELETE CASCADE,
    folder_id INTEGER REFERENCES folders(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, UNIQUE(note_id, folder_id))`;
  logger.info('✅ Database schema initialized');
}

async function savePaper(paper, userId) {
  const uri = paper.uri || paper.pdfUri;
  const abstract = paper.abstract || paper.summary || '';
  const authors = JSON.stringify(paper.authors || []);
  const numPages = paper.num_pages || paper.numPages || 0;
  const isSaved = paper.is_explicitly_saved !== undefined ? paper.is_explicitly_saved : true;
  await getDb()`INSERT INTO papers (uri, title, abstract, authors, num_pages, is_explicitly_saved, user_id)
    VALUES (${uri}, ${paper.title}, ${abstract}, ${authors}, ${numPages}, ${isSaved}, ${userId})
    ON CONFLICT (uri) DO UPDATE SET title = EXCLUDED.title, abstract = EXCLUDED.abstract,
    authors = EXCLUDED.authors, num_pages = EXCLUDED.num_pages, is_explicitly_saved = EXCLUDED.is_explicitly_saved`;
}

async function saveNote(note, userId) {
  const content = note.quote || note.content;
  const justification = note.justification || '';
  const citations = JSON.stringify(note.citations || []);
  const relatedQuestion = note.relatedQuestion || '';
  const pageNumber = note.pageNumber || 0;
  const relevanceScore = note.relevanceScore || 0.0;
  const result = await getDb()`INSERT INTO notes (paper_uri, content, justification, citations, 
    related_question, page_number, relevance_score, user_id)
    VALUES (${note.pdfUri}, ${content}, ${justification}, ${citations}, ${relatedQuestion}, 
    ${pageNumber}, ${relevanceScore}, ${userId}) RETURNING id`;
  return result[0];
}

async function getAllLibraryData(userId) {
  const papers = userId ? await getDb()`SELECT * FROM papers WHERE user_id = ${userId}` : await getDb()`SELECT * FROM papers`;
  const notes = userId ? await getDb()`SELECT * FROM notes WHERE user_id = ${userId}` : await getDb()`SELECT * FROM notes`;
  return { papers, notes };
}

async function getFolders(userId) {
  return userId ? await getDb()`SELECT * FROM folders WHERE user_id = ${userId}` : await getDb()`SELECT * FROM folders`;
}

async function deletePaper(uri) {
  await getDb()`DELETE FROM papers WHERE uri = ${uri}`;
}

async function updateNote(id, content) {
  await getDb()`UPDATE notes SET content = ${content} WHERE id = ${id}`;
}

async function deleteNote(noteId) {
  await getDb()`DELETE FROM notes WHERE id = ${noteId}`;
}

async function toggleStar(noteId, state) {
  await getDb()`UPDATE notes SET is_starred = ${state} WHERE id = ${noteId}`;
}

async function toggleFlag(noteId, state) {
  await getDb()`UPDATE notes SET is_flagged = ${state} WHERE id = ${noteId}`;
}

async function createFolder(name, type, parentId, description, userId) {
  await sql`INSERT INTO folders (name, type, parent_id, description, user_id)
    VALUES (${name}, ${type}, ${parentId}, ${description}, ${userId})`;
}

async function assignNote(noteId, folderId) {
  await sql`INSERT INTO note_assignments (note_id, folder_id) VALUES (${noteId}, ${folderId})
    ON CONFLICT (note_id, folder_id) DO NOTHING`;
}

module.exports = {
  initSchema, savePaper, saveNote, getAllLibraryData, getFolders,
  deletePaper, updateNote, deleteNote, toggleStar, toggleFlag, createFolder, assignNote
};
