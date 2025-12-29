
export interface SearchSource {
  title: string;
  uri: string;
  snippet: string;
}

export interface GroundingChunk {
  web?: {
    uri?: string;
    title?: string;
  };
}

export interface SearchResultData {
  summary: string;
  sources: SearchSource[];
  allQueries: string[];
}

export interface PdfMetadata {
  title?: string;
  author?: string;
  subject?: string;
}

export interface LoadedPdf {
  uri: string;
  file: File;
  data: ArrayBuffer;
  metadata: PdfMetadata;
  text: string; 
  pages: string[]; 
  references?: string[]; 
  numPages: number;
}

export interface Citation {
  inline: string; 
  full: string;   
}

export interface DeepResearchNote {
  id?: number;            
  quote: string;          
  justification: string;  
  relatedQuestion: string;
  pageNumber: number;
  pdfUri: string;
  relevanceScore?: number;
  tags?: string[];
  citations?: Citation[]; 
  created_at?: string;
}

export interface SearchState {
  query: string;
  isLoading: boolean;
  data: SearchResultData | null;
  hasSearched: boolean;
  error: string | null;
}

export interface DeepResearchQuery {
  topics: string[];
  urls: string[];
  questions: string[];
}

// Added FolderType and FolderNode for project organization
export type FolderType = 'PROJECT' | 'SECTION' | 'GROUP';

export interface FolderNode {
  id: number;
  name: string;
  type: FolderType;
  parent_id: number | null;
  children: FolderNode[];
}

export interface ArxivPaper {
  id: string; 
  title: string;
  summary: string;
  authors: string[];
  pdfUri: string;
  publishedDate: string;
  sourceQuery?: string;
  relevanceScore?: number;
  analysisStatus?: 'pending' | 'downloading' | 'processing' | 'completed' | 'failed' | 'stopped';
  notes?: DeepResearchNote[];
  references?: string[]; 
}

export interface ArxivSearchStructured {
  exact_phrases: string[];
  title_terms: string[];
  abstract_terms: string[];
  general_terms: string[];
}

export type SearchMode = 'web' | 'deep' | 'upload';
export type ResearchPhase = 'idle' | 'initializing' | 'searching' | 'filtering' | 'extracting' | 'completed' | 'failed';

export interface TagData {
  value: string;
  status?: 'valid' | 'invalid' | 'loading';
}

export interface SearchBarState {
  mainInput: string;
  additionalTopics: string[];
  urls: (string | TagData)[];
  questions: string[];
  urlInput: string;
  questionInput: string;
}