const API_BASE = '/api/v1';

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
    const response = await fetch(API_BASE + endpoint, options);
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
    enhanceMetadata: (data: any) => apiCall('/gemini/enhance-metadata', 'POST', data),
    searchVariations: (query: string) => apiCall('/gemini/search-variations', 'POST', { query }),
    arxivSearchTerms: (topics: string[], questions: string[]) => 
      apiCall('/gemini/arxiv-search-terms', 'POST', { topics, questions }),
    getEmbedding: (text: string, taskType = 'RETRIEVAL_DOCUMENT') => 
      apiCall('/gemini/embedding', 'POST', { text, taskType }),
    getBatchEmbeddings: (texts: string[], taskType = 'RETRIEVAL_DOCUMENT') => 
      apiCall('/gemini/batch-embeddings', 'POST', { texts, taskType }),
    filterPapers: (papers: any[], userQuestions: string[], keywords: string[]) => 
      apiCall('/gemini/filter-papers', 'POST', { papers, userQuestions, keywords }),
    extractNotes: (data: any) => apiCall('/gemini/extract-notes', 'POST', data),
    search: (query: string) => apiCall('/gemini/search', 'POST', { query }),
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
      const response = await fetch(API_BASE + '/agent/upload-file', { method: 'POST', body: formData });
      const result: ApiResponse<any> = await response.json();
      if (!result.success) throw new Error(result.error?.message);
      return result.data;
    },
    sendMessage: (message: string, fileUris: string[], contextNotes: any[]) =>
      apiCall('/agent/send-message', 'POST', { message, fileUris, contextNotes }),
  },
};
