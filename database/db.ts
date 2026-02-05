import { api } from '../services/apiClient';

// All database operations now call backend API

export async function initSchema() {
  await api.database.initSchema();
}

export async function savePaper(paper: any, userId?: string) {
  await api.database.savePaper(paper, userId);
}

export async function saveNote(note: any, userId?: string) {
  return await api.database.saveNote(note, userId);
}

export async function getAllLibraryData(userId?: string) {
  return await api.database.getLibraryData(userId);
}

export async function getFolders(userId?: string) {
  return await api.database.getFolders(userId);
}

export async function deletePaper(uri: string) {
  await api.database.deletePaper(uri);
}

export async function updateNote(id: number, content: string) {
  await api.database.updateNote(id, content);
}

export async function deleteNotePermanently(noteId: number) {
  await api.database.deleteNote(noteId);
}

export async function toggleStar(noteId: number, state: boolean) {
  await api.database.toggleStar(noteId, state);
}

export async function toggleFlag(noteId: number, state: boolean) {
  await api.database.toggleFlag(noteId, state);
}

export async function createFolder(
  name: string,
  type: string,
  parentId?: number | null,
  description?: string,
  userId?: string
) {
  await api.database.createFolder(name, type, parentId || null, description || '', userId);
}

export async function assignNoteToFolder(noteId: number, folderId: number) {
  await api.database.assignNote(noteId, folderId);
}

export const dbService = {
  initSchema,
  savePaper,
  saveNote,
  getAllLibraryData,
  getFolders,
  deletePaper,
  updateNote,
  deleteNotePermanently,
  toggleStar,
  toggleFlag,
  createFolder,
  assignNoteToFolder
};
