# Database Schema & Context Providers

## Database Schema (Neon PostgreSQL)

### Tables

#### papers
```sql
CREATE TABLE papers (
  uri TEXT PRIMARY KEY,                    -- PDF URL (unique identifier)
  title TEXT NOT NULL,
  abstract TEXT,
  authors JSONB,                           -- ["Author 1", "Author 2"]
  num_pages INTEGER,
  is_explicitly_saved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

#### notes
```sql
CREATE TABLE notes (
  id SERIAL PRIMARY KEY,
  paper_uri TEXT REFERENCES papers(uri) ON DELETE CASCADE,
  content TEXT NOT NULL,                   -- Extracted quote
  justification TEXT,                      -- AI's reasoning
  citations JSONB,                         -- [{"inline": "[1]", "full": "..."}]
  related_question TEXT,
  page_number INTEGER,
  relevance_score FLOAT,                   -- 0.0-1.0 confidence
  is_starred BOOLEAN DEFAULT FALSE,
  is_flagged BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

#### folders
```sql
CREATE TABLE folders (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,                      -- 'PROJECT' | 'SECTION' | 'GROUP'
  parent_id INTEGER REFERENCES folders(id) ON DELETE CASCADE,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

#### note_assignments
```sql
CREATE TABLE note_assignments (
  id SERIAL PRIMARY KEY,
  note_id INTEGER REFERENCES notes(id) ON DELETE CASCADE,
  folder_id INTEGER REFERENCES folders(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(note_id, folder_id)
);
```

## Database Service Patterns

### User-Scoped Queries
```typescript
// All queries scoped to current user (future multi-tenant)
const savePaper = async (paperData: any, userId: string) => {
  const { data, error } = await supabase
    .from('papers')
    .upsert({
      uri: paperData.uri,
      title: paperData.title,
      authors: paperData.authors,
      is_explicitly_saved: true,
      user_id: userId // Future: add user_id column
    }, { onConflict: 'uri' });

  return { data, error };
};
```

### Batch Loading
```typescript
const getAllLibraryData = async () => {
  const { data: papers } = await supabase
    .from('papers')
    .select('*')
    .eq('is_explicitly_saved', true)
    .order('created_at', { ascending: false });

  const { data: notes } = await supabase
    .from('notes')
    .select('*')
    .order('created_at', { ascending: false });

  return { papers, notes };
};
```

### Hierarchical Folder Queries
```typescript
const buildFolderTree = (folders: Folder[]): FolderNode[] => {
  const buildTree = (parentId: number | null = null): FolderNode[] => {
    return folders
      .filter(f => f.parent_id === parentId)
      .map(f => ({ ...f, children: buildTree(f.id) }));
  };
  return buildTree(null);
};
```

## Context Providers

### ResearchContext
Manages the deep research pipeline and AI extraction state.

```typescript
interface ResearchContextState {
  // Search modes
  activeSearchMode: 'web' | 'deep' | 'upload';

  // Deep research pipeline
  researchPhase: 'idle' | 'initializing' | 'searching' | 'filtering' | 'extracting' | 'completed' | 'failed';
  arxivKeywords: string[];
  arxivCandidates: ArxivPaper[];
  filteredCandidates: ArxivPaper[];
  selectedArxivIds: Set<string>;

  // Extraction results
  deepResearchResults: DeepResearchNote[];
  contextNotes: DeepResearchNote[]; // Notes selected for agent

  // Multi-input search bar
  searchBarState: {
    mainInput: string;
    additionalTopics: string[];
    urls: (string | TagData)[];
    questions: string[];
  };
}

// Key methods
const performDeepResearch = async (query: DeepResearchQuery) => {
  setResearchPhase('initializing');

  // Phase 1: Intent modeling
  const searchTerms = await generateArxivSearchTerms(topics, questions);
  setResearchPhase('searching');

  // Phase 2: Gather candidates
  const papers = await searchArxiv(searchTerms);
  setArxivCandidates(papers);
  setResearchPhase('filtering');

  // Phase 3: Semantic filtering
  const filtered = await filterRelevantPapers(papers, questions);
  setFilteredCandidates(filtered);
  setResearchPhase('extracting');

  // Phase 4+5: PDF processing and RAG extraction
  await analyzeArxivPapers(filtered, questions, keywords, (streamedNotes) => {
    setDeepResearchResults(prev => [...prev, ...streamedNotes]);
  });

  setResearchPhase('completed');
};
```

### LibraryContext
Manages PDF loading, download tracking, and file lifecycle.

```typescript
interface LibraryContextState {
  loadedPdfs: LoadedPdf[];              // In-memory PDFs
  activePdfUri: string | null;          // Currently displayed PDF
  contextUris: Set<string>;             // PDFs selected for AI analysis
  downloadingUris: Set<string>;         // Loading state tracking
  failedUris: Set<string>;              // Failed downloads
  searchHighlight: string | null;       // Text to highlight in viewer
}

// Key methods
const loadPdfFromUrl = async (url: string, title: string) => {
  setDownloadingUris(prev => new Set(prev).add(url));

  try {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();

    const pdfDoc = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    const pages = await extractTextFromPdf(pdfDoc);

    setLoadedPdfs(prev => [...prev, {
      uri: url,
      title,
      arrayBuffer,
      pages,
      numPages: pdfDoc.numPages
    }]);

    setDownloadingUris(prev => {
      const next = new Set(prev);
      next.delete(url);
      return next;
    });

    return { success: true };
  } catch (error) {
    setFailedUris(prev => new Set(prev).add(url));
    setDownloadingUris(prev => {
      const next = new Set(prev);
      next.delete(url);
      return next;
    });
    return { success: false, error };
  }
};
```

### AuthContext
Multi-tier authentication with anonymous data migration.

```typescript
interface AuthContextState {
  user: User | null;
  session: Session | null;
  isAuthenticated: boolean;
  isAnonymous: boolean;
  authLevel: 'none' | 'anonymous' | 'authenticated';
}

// Key methods
const signInWithProvider = async (provider: 'google' | 'azure') => {
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${window.location.origin}/auth/callback`
    }
  });
  if (error) throw error;
};

const migrateAnonymousData = async (newUserId: string) => {
  // Migrate localStorage data to database
  const localNotes = JSON.parse(localStorage.getItem('research-notes') || '[]');

  for (const note of localNotes) {
    await supabase.from('notes').insert({
      ...note,
      user_id: newUserId
    });
  }

  localStorage.removeItem('research-notes');
};
```

### DatabaseContext
Caches database state and provides CRUD operations.

```typescript
interface DatabaseContextState {
  savedPapers: any[];
  savedNotes: any[];
  folders: Folder[];
  projectStructure: FolderNode[];  // Built from flat folders
  isDbLoading: boolean;
}

// Key methods
const savePaper = async (paperData: any) => {
  const { data, error } = await supabase
    .from('papers')
    .upsert({
      uri: paperData.uri,
      title: paperData.title,
      authors: paperData.authors,
      num_pages: paperData.numPages,
      is_explicitly_saved: true
    }, { onConflict: 'uri' });

  if (!error) {
    setSavedPapers(prev => [...prev, data]);
  }
  return { data, error };
};

const saveNote = async (noteData: DeepResearchNote) => {
  const { data, error } = await supabase
    .from('notes')
    .insert({
      paper_uri: noteData.pdfUri,
      content: noteData.quote,
      justification: noteData.justification,
      page_number: noteData.pageNumber,
      relevance_score: noteData.relevanceScore
    });

  if (!error) {
    setSavedNotes(prev => [...prev, data]);
  }
  return { data, error };
};

const assignNoteToFolder = async (noteId: number, folderId: number) => {
  return supabase.from('note_assignments').insert({ note_id: noteId, folder_id: folderId });
};
```

### UIContext
Layout, theme, and modal management.

```typescript
interface UIContextState {
  // Column management
  columnVisibility: { left: boolean; middle: boolean; library: boolean; right: boolean };
  columnLocks: { left: boolean; middle: boolean; library: boolean; right: boolean };

  // Theme
  darkMode: boolean;

  // Library drawer
  isLibraryOpen: boolean;
  isLibraryExpanded: boolean;
  libraryActiveView: 'all' | 'recent' | 'flagged' | 'starred' | 'papers';

  // Modals
  assignmentModal: {
    isOpen: boolean;
    note: DeepResearchNote | null;
    sourceMetadata: any;
  };
}

// Key methods
const openColumn = (column: 'left' | 'middle' | 'library' | 'right') => {
  setColumnVisibility(prev => ({ ...prev, [column]: true }));
};

const toggleColumnLock = (column: string) => {
  setColumnLocks(prev => ({ ...prev, [column]: !prev[column] }));
};
```

## localStorage Management

### Auto-save Pattern
```typescript
// Auto-save on state changes
useEffect(() => {
  localStorage.setItem('research-state', JSON.stringify({
    searchHistory,
    lastQuery: searchBarState.mainInput,
    contextNotes,
    lastActiveMode: activeSearchMode
  }));
}, [searchHistory, searchBarState, contextNotes, activeSearchMode]);

// Restore on mount
useEffect(() => {
  const saved = localStorage.getItem('research-state');
  if (saved) {
    const state = JSON.parse(saved);
    setSearchHistory(state.searchHistory || []);
    setContextNotes(state.contextNotes || []);
  }
}, []);
```

### Cache Clearing
```typescript
// Clear embedding cache when zero results detected
if (filteredPapers.length === 0) {
  console.log("⚠️ Clearing embedding cache and retrying");
  localStorage.removeItem('embedding-cache');
  embeddingCache.clear();
  filteredPapers = await filterRelevantPapers(papers, questions);
}
```

### Migration Pattern
```typescript
// Version-based migration
const STORAGE_VERSION = 2;

const migrateStorage = () => {
  const currentVersion = localStorage.getItem('storage-version');

  if (currentVersion !== STORAGE_VERSION.toString()) {
    // Migrate old data structures
    const oldNotes = localStorage.getItem('notes');
    if (oldNotes) {
      const migrated = JSON.parse(oldNotes).map((note: any) => ({
        ...note,
        citations: note.citations || [],
        relevanceScore: note.relevanceScore || 0.5
      }));
      localStorage.setItem('research-notes', JSON.stringify(migrated));
      localStorage.removeItem('notes');
    }

    localStorage.setItem('storage-version', STORAGE_VERSION.toString());
  }
};
```

## Data Flow End-to-End

```
User Input → ResearchContext.performDeepResearch()
  ↓
AI Services (generateArxivSearchTerms, searchArxiv, filterRelevantPapers)
  ↓
LibraryContext.loadPdfFromUrl() [batch download]
  ↓
AI Services (extractNotesFromPages) [streaming]
  ↓
ResearchContext.deepResearchResults [streaming updates]
  ↓
User Saves Note → DatabaseContext.saveNote()
  ↓
Neon PostgreSQL [persistence]
  ↓
UI Update (Library drawer shows saved note)
```
