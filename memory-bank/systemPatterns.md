# System Patterns & Architecture

## Application Structure

```
src/
├── components/
│   ├── layout/
│   │   ├── ThreeColumnLayout.tsx      # Smart column sizing with locks
│   │   └── Header.tsx                 # Mode switcher, auth UI
│   ├── research/
│   │   ├── WebSearchView.tsx          # Google search results
│   │   ├── DeepResearchView.tsx       # ArXiv pipeline UI
│   │   └── UploadView.tsx             # Direct PDF upload
│   ├── library/
│   │   ├── SourcesPanel.tsx           # Left column: PDF list
│   │   └── PdfViewer.tsx              # Right column: PDF display
│   └── agent/
│       └── AgentChat.tsx              # AI assistant interface
├── contexts/
│   ├── ResearchContext.tsx            # Deep research pipeline
│   ├── LibraryContext.tsx             # PDF management
│   ├── DatabaseContext.tsx            # Neon PostgreSQL
│   ├── AuthContext.tsx                # Multi-tier auth
│   └── UIContext.tsx                  # Layout and theme
├── services/
│   ├── aiService.ts                   # Gemini + OpenAI
│   ├── arxivService.ts                # ArXiv search + filtering
│   ├── pdfService.ts                  # PDF parsing + text extraction
│   ├── embeddingService.ts            # Vector embeddings
│   └── dbService.ts                   # Database operations
└── utils/
    ├── asyncPool.ts                   # Concurrency control
    └── vectorMath.ts                  # Cosine similarity
```

⚠️ **Backend (Node.js/Express on port 3001):**
```
backend/
├── server.js                          # Express app
└── routes/
    ├── gemini.js                      # Proxy for Gemini API
    ├── database.js                    # Database CRUD
    └── agent.js                       # Agent file upload
```

## Domain-Driven Context Architecture

| Context | Responsibility | Key State |
|---------|---------------|-----------|
| **UIContext** | Layout, theme, animations | Column visibility/locks |
| **ResearchContext** | AI pipeline, search results | Research phase, extracted notes |
| **LibraryContext** | PDF loading, download tracking | Loaded PDFs, downloading URIs |
| **DatabaseContext** | Persistence, folder organization | Saved papers/notes, folders |
| **AuthContext** | Multi-tier authentication | User session, auth level |

## Core Patterns

### 1. Unified Acquisition Pattern
Consistent PDF loading across all views.

```typescript
const handleAddToSources = async (url: string, title: string) => {
  const isSaved = savedPapers.some(p => p.uri === url && p.is_explicitly_saved);
  const isLoaded = loadedPdfs.some(p => p.uri === url);

  if (isSaved) {
    if (!canDeletePaper(url)) {
      return alert("Remove notes first");
    }
    await deletePaper(url);
    return;
  }

  // Download PDF if not loaded
  if (!isLoaded) {
    setDownloadingUris(prev => new Set(prev).add(url));
    const result = await loadPdfFromUrl(url, title);
    if (!result.success) return;
  }

  // Save to database
  await savePaper({ uri: url, title, is_explicitly_saved: true });
  openColumn('left'); // Show sources panel
};

// Visual feedback during download
{downloadingUris.has(url) && <Loader2 className="animate-spin" />}
{isSaved && <Check className="text-green-600" />}
```

### 2. asyncPool Concurrency Control
Limit parallel operations to prevent API rate limits.

```typescript
async function asyncPool<T, R>(
  concurrency: number,
  items: T[],
  iteratorFn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  const executing: Promise<any>[] = [];

  for (const item of items) {
    const promise = iteratorFn(item).then(result => {
      results.push(result);
    });

    executing.push(promise);

    if (executing.length >= concurrency) {
      await Promise.race(executing);
      executing.splice(executing.findIndex(p => p === promise), 1);
    }
  }

  await Promise.all(executing);
  return results;
}

// Usage: Process 3 PDFs at a time
await asyncPool(3, filteredPapers, async (paper) => {
  const pdf = await loadPdfFromUrl(paper.pdfUrl, paper.title);
  const notes = await extractNotesFromPdf(pdf, questions);
  return notes;
});
```

### 3. Smart Column Management
Constraint-based responsive layout with locks.

```typescript
// ThreeColumnLayout.tsx
const calculateColumnWidths = () => {
  const leftVisible = columnVisibility.left;
  const rightVisible = columnVisibility.right;

  if (!leftVisible && !rightVisible) {
    return { left: '0%', middle: '100%', right: '0%' };
  }

  if (leftVisible && !rightVisible) {
    const leftWidth = Math.min(30, Math.max(20, windowWidth * 0.25)); // Clamp 20-30%
    return {
      left: `${leftWidth}%`,
      middle: `${100 - leftWidth}%`,
      right: '0%'
    };
  }

  if (!leftVisible && rightVisible) {
    const rightWidth = Math.min(40, Math.max(30, windowWidth * 0.35));
    return {
      left: '0%',
      middle: `${100 - rightWidth}%`,
      right: `${rightWidth}%`
    };
  }

  // Both visible
  const leftWidth = 25;
  const rightWidth = 35;
  return {
    left: `${leftWidth}%`,
    middle: `${100 - leftWidth - rightWidth}%`,
    right: `${rightWidth}%`
  };
};

// Lock prevents column from closing when mode changes
const handleModeSwitch = (newMode: SearchMode) => {
  setActiveSearchMode(newMode);
  if (!columnLocks.right) {
    setColumnVisibility(prev => ({ ...prev, right: false }));
  }
};
```

### 4. Database UPSERT Pattern
Implicit paper tracking with explicit save flag.

```typescript
// Papers are auto-created when viewed (for metadata)
// is_explicitly_saved flag marks user-curated sources

const savePaper = async (paperData: any) => {
  return supabase.from('papers').upsert({
    uri: paperData.uri,
    title: paperData.title,
    authors: paperData.authors,
    num_pages: paperData.numPages,
    is_explicitly_saved: true, // User saved this
  }, { onConflict: 'uri' }); // Update if exists
};

// When AI analyzes a paper (but user hasn't saved it)
const trackPaperMetadata = async (paperData: any) => {
  return supabase.from('papers').upsert({
    uri: paperData.uri,
    title: paperData.title,
    is_explicitly_saved: false, // Not user-curated
  }, { onConflict: 'uri' });
};

// Query only user-saved papers
const getUserSources = async () => {
  return supabase
    .from('papers')
    .select('*')
    .eq('is_explicitly_saved', true);
};
```

### 5. Streaming Results Pattern
Real-time UI updates during long operations.

```typescript
// Service layer: Accept callback for streaming
const extractNotesFromPages = async (
  pages: RelevantPage[],
  questions: string,
  onStreamUpdate?: (notes: DeepResearchNote[]) => void
) => {
  const batches = chunk(pages, BATCH_SIZE);

  for (const batch of batches) {
    const batchNotes = await processBatch(batch);
    if (onStreamUpdate) {
      onStreamUpdate(batchNotes); // Stream immediately
    }
  }
};

// Context layer: Update state incrementally
const performDeepResearch = async (query: DeepResearchQuery) => {
  await analyzeArxivPapers(
    filteredPapers,
    questions,
    keywords,
    (streamedNotes) => {
      setDeepResearchResults(prev => [...prev, ...streamedNotes]);
    }
  );
};

// UI layer: Auto-scroll to new results
useEffect(() => {
  if (deepResearchResults.length > 0) {
    resultsContainerRef.current?.scrollTo({
      top: resultsContainerRef.current.scrollHeight,
      behavior: 'smooth'
    });
  }
}, [deepResearchResults]);
```

### 6. Error Recovery with Retry Logic
Clear cache and retry when filtering fails.

```typescript
const filterRelevantPapers = async (papers: ArxivPaper[], questions: string[]) => {
  const filtered = await semanticFilter(papers, questions);

  // Zero results bug fix (commit a90481f)
  if (filtered.length === 0 && papers.length > 0) {
    console.log("┌─────────────────────────────────────");
    console.log("│ ⚠️ Zero results - clearing cache");
    console.log("└─────────────────────────────────────");

    embeddingCache.clear();
    localStorage.removeItem('embedding-cache');

    // Retry with fresh cache
    const retryFiltered = await semanticFilter(papers, questions);
    return retryFiltered;
  }

  return filtered;
};
```

## Data Flow

### End-to-End Research Flow
```
1. User enters query in SearchBar
   ↓
2. ResearchContext.performDeepResearch()
   ↓
3. AI generates ArXiv search terms
   ↓
4. Backend proxy fetches ArXiv XML
   ↓
5. Frontend filters by vector similarity (threshold: 0.48)
   ↓
6. LibraryContext downloads PDFs (asyncPool: 3 concurrent)
   ↓
7. PDF text extraction (geometric sorting)
   ↓
8. AI extracts notes (batch size: 8 pages, concurrency: 3)
   ↓
9. Streaming updates to UI
   ↓
10. User saves note → DatabaseContext → Neon PostgreSQL
```

### Context Communication Flow
```
User Action
  ↓
UIContext (openColumn, toggleLock)
  ↓
ResearchContext (setResearchPhase, setResults)
  ↓
LibraryContext (loadPdfFromUrl, setDownloadingUris)
  ↓
DatabaseContext (savePaper, saveNote)
  ↓
UI Re-render (sources panel, results list, PDF viewer)
```

## Design System (Scholar)

### Brand Colors
```css
:root {
  --scholar-primary: #590016;      /* Deep burgundy */
  --scholar-50: #fef2f4;
  --scholar-100: #fce7eb;
  --scholar-600: #590016;
  --scholar-700: #4a0012;
  --scholar-800: #3c000f;
}
```

### UI Patterns
- **Active states**: `bg-scholar-600 text-white`
- **Hover states**: `hover:bg-scholar-50`
- **Confirmed actions**: `bg-scholar-100 text-scholar-800` with check icon
- **Loading states**: `Loader2` spinner with `animate-spin`
- **Error states**: `text-red-600 bg-red-50`

## Performance Optimizations

### Memoization
```typescript
// Expensive folder tree building
const projectStructure = useMemo(() => {
  const buildTree = (parentId: number | null = null) => {
    return folders
      .filter(f => f.parent_id === parentId)
      .map(f => ({ ...f, children: buildTree(f.id) }));
  };
  return buildTree(null);
}, [folders]);

// Existence checks
const isPaperSaved = useCallback(
  (uri: string) => savedPapers.some(p => p.uri === uri && p.is_explicitly_saved),
  [savedPapers]
);
```

### Batch Processing
- **PDF downloads**: 3-4 concurrent
- **Embeddings**: 50 per batch request
- **Note extraction**: 8 pages per batch, 3 batches concurrent
- **Database queries**: Single query for all library data

### Memory Management
- **PDF lifecycle**: Load → Process → Display → Unmount cleanup
- **Embedding cache**: Map structure with ~60% hit rate
- **Future**: LRU cache for high-volume scenarios
