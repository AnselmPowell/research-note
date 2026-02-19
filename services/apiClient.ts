// In development, point to backend on port 3001
// In production, use relative path (nginx proxies to backend)
import { SearchResultData, DeepResearchNote } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV
  ? 'http://localhost:3001/api/v1'
  : '/api/v1');

export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error?: { code: string; message: string; };
}

async function apiCall<T>(endpoint: string, method: string = 'GET', body?: any, userId?: string): Promise<T> {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (userId) headers['X-User-Id'] = userId;
  const options: RequestInit = { method, headers };
  if (body && method !== 'GET') options.body = JSON.stringify({ userId, data: body });

  try {
    const response = await fetch(API_BASE_URL + endpoint, options);
    if (!response.ok) throw new Error('API Error: ' + response.status);
    const result: ApiResponse<T> = await response.json();
    if (!result.success) throw new Error(result.error?.message || 'API call failed');
    return result.data as T;
  } catch (error: any) {
    console.error('[API Client] ' + endpoint + ' failed:', error.message);
    throw error;
  }
}

export const api = {
  gemini: {
    enhanceMetadata: (data: any) => apiCall<{ title: string; author: string; year?: string; subject: string; harvardReference?: string; publisher?: string; categories?: string[] }>('/gemini/enhance-metadata', 'POST', data),
    searchVariations: (query: string) => apiCall<string[]>('/gemini/search-variations', 'POST', { query }),
    arxivSearchTerms: (topics: string[], questions: string[]) =>
      apiCall<any>('/gemini/arxiv-search-terms', 'POST', { topics, questions }),
    getEmbedding: (text: string, taskType = 'RETRIEVAL_DOCUMENT') =>
      apiCall<number[]>('/gemini/embedding', 'POST', { text, taskType }),
    getBatchEmbeddings: (texts: string[], taskType = 'RETRIEVAL_DOCUMENT') =>
      apiCall<number[][]>('/gemini/batch-embeddings', 'POST', { texts, taskType }),
    filterPapers: (papers: any[], userQuestions: string[], keywords: string[]) =>
      apiCall<any[]>('/gemini/filter-papers', 'POST', { papers, userQuestions, keywords }),
    extractNotes: (data: any) => apiCall<DeepResearchNote[]>('/gemini/extract-notes', 'POST', data),
    search: (query: string) => apiCall<SearchResultData>('/gemini/search', 'POST', { query }),
    insightQueries: (userQuestions: string, contextQuery: string) =>
      apiCall<string[]>('/gemini/insight-queries', 'POST', { userQuestions, contextQuery }),
  },

  database: {
    initSchema: () => apiCall('/database/init-schema', 'POST'),
    savePaper: (paper: any, userId?: string) =>
      apiCall('/database/save-paper', 'POST', paper, userId),
    saveNote: (note: any, userId?: string) =>
      apiCall('/database/save-note', 'POST', note, userId),
    getLibraryData: (userId?: string) =>
      apiCall('/database/library-data', 'GET', undefined, userId),
    getFolders: (userId?: string) =>
      apiCall('/database/folders', 'GET', undefined, userId),
    deletePaper: (uri: string) => {
      const encodedUri = uri.split('/').map(part => encodeURIComponent(part)).join('/');
      return apiCall('/database/paper/' + encodedUri, 'DELETE');
    },
    updateNote: (id: number, content: string) =>
      apiCall('/database/update-note', 'POST', { id, content }),
    deleteNote: (noteId: number) =>
      apiCall('/database/note/' + noteId, 'DELETE'),
    toggleStar: (noteId: number, state: boolean) =>
      apiCall('/database/toggle-star', 'POST', { noteId, state }),
    toggleFlag: (noteId: number, state: boolean) =>
      apiCall('/database/toggle-flag', 'POST', { noteId, state }),
    createFolder: (name: string, type: string, parentId: number | null, description: string, userId?: string) =>
      apiCall('/database/create-folder', 'POST', { name, type, parentId, description }, userId),
    assignNote: (noteId: number, folderId: number) =>
      apiCall('/database/assign-note', 'POST', { noteId, folderId }),
  },

  agent: {
    uploadFile: async (file: File, uniqueId: string) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('uniqueId', uniqueId);
      const response = await fetch(API_BASE_URL + '/agent/upload-file', { method: 'POST', body: formData });
      const result: ApiResponse<any> = await response.json();
      if (!result.success) throw new Error(result.error?.message);
      return result.data;
    },
    sendMessage: (message: string, fileUris: string[], contextNotes: any[]) =>
      apiCall('/agent/send-message', 'POST', { message, fileUris, contextNotes }),
  },
};
