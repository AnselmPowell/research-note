# Progress & Current Status

## Overall: 90% Complete

**Status:** ✅ **PRODUCTION DEPLOYED**
**Live URL:** https://research-note-production.up.railway.app/
**Backend:** Node.js/Express on port 3001 (Railway)
**Database:** Neon PostgreSQL

## Feature Completion

### ✅ Multi-Source Academic Search (NEW - Feb 19, 2026)
- **5 parallel search APIs**: ArXiv, OpenAlex, Google CSE, PDFVector, Google Grounding
- **Unified aggregator**: `searchAggregator.ts` orchestrates all sources with `Promise.allSettled`
- **Academic keyword engine**: LLM generates primary + secondary keywords with AND combinations
- **ArXiv precision**: `abs:` field AND queries instead of scattered loose queries
- **Deduplication**: By `pdfUri` across all sources, priority ordering
- **Graceful degradation**: Any API can fail without blocking others

### ✅ Multi-Modal Search (100%)
- Web search (Google Custom Search API)
- Deep research (ArXiv discovery)
- Direct PDF upload
- Tri-modal interface with mode switching

### ✅ AI Research Pipeline (98%)
- 5-stage process: Intent → Gathering → Filtering → Reconstruction → Extraction
- Multi-provider system (Gemini + OpenAI fallback)
- ⚠️ **Updated Feb 19:** New keyword generation engine (primary + secondary + AND combos)
- ⚠️ **Updated Feb 19:** Stage 2 now uses 5 search APIs via `searchAllSources()`
- ⚠️ **Updated Feb 6:** `gemini-embedding-001` (text-embedding-004 shutdown)
- Real-time streaming results
- asyncPool concurrency control

### ✅ PDF Processing (95%)
- Geometric sorting for 2-column layouts
- Reading order reconstruction
- ⚠️ **Backend ArXiv proxy** (CORS workaround)
- Unified download state tracking

### ✅ Layout & Navigation (100%)
- Smart 3-column responsive layout
- Column locking system
- Sources panel (max 30% width)
- Smooth animations

### ✅ Source Management (98%)
- Unified "Add to Sources" toggle
- Real-time loading indicators
- Hierarchical folder organization
- Export functionality
- Safety checks (prevent data loss)
- 🆕 **Feb 27:** Unified Selection State
  - Single `selectedPaperUris` Set tracks all selections across 4 components
  - SourcesPanel, WebSearchView, DeepSearch, PaperResults see same checkbox state
  - URI-based deduplication prevents duplicate papers in Agent context
  - Cross-component visibility via `isPaperSelectedByUri()` helper
  - 100 lines added across 5 files, zero breaking changes
- 🆕 **Mar 17:** Sort UI Decentralization
  - Moved generic sorting state out of parent `ResearchView`
  - Encapsulated sort algorithms and dropdown logic into `DeepSearch` and `PaperSearch` natively
  - Eliminated unnecessary prop-drilling
- 🆕 **Mar 17:** UI Behavior Refinement
  - Removed auto-opening of Sources Panel (left column) when adding papers to library/sources
  - Improved user focus by maintaining current column state during document collection
  - Enforced Persistent Splitscreen: Middle column (Research/Results) now stays open when viewing PDFs from all search views.
  - Context-Aware Sidebar: Sources panel stays open when viewing from it, but automatically closes when viewing from research results to maximize focus.

### ✅ Authentication (95%)
- Neon Auth + OAuth (Google, Microsoft)
- Anonymous → Authenticated migration
- 🚨 **TODO:** Rotate hardcoded credentials in `database/db.ts`

### ✅ AI Assistant (100%) - NOW COMPLETE WITH FILE SUPPORT
- Context-aware conversation
- Tool calling for note access
- Citation generation
- PDF source linking
- Conversation history
- 🆕 **Feb 23:** File upload pipeline working end-to-end
  - Files uploaded when added to context
  - Passed as base64 inlineData to Gemini
  - Gemini analyzes file content in responses
  - Citations properly extracted from responses

### ✅ Agent Researcher & Harness (100%)
- **Dynamic ReAct Loop**: 15-iteration limit with memory buffering (`recentObservations: 3`)
- **Citation & Structure Extraction**: Automatical fallback to `get_paper_structure` AI-subagent
- **Execution Logging**: Complete trace including `Thought` strings and 500-char observation snippets
- **Guideline Workflows**: Integrated workflows for Methodology, Findings, and Comparisons
- 🆕 **Mar 23:** Research Agent Harness & Tool Upgrades
  - Renamed `read_pages` to `read_multiple_pages`
  - Added `search_multiple_keyword` (multi-term scanning)
  - Added `get_paper_structure` (Fast AI TOC mapping)
  - Fixed "Agent Amnesia" via permanent thought preservation in context layers
- 🆕 **Feb 23:** File upload → Gemini pipeline fixed
  - Automatic sync when files added to context
  - Proper caching with URI-based lookups
  - Base64 encoding for API transmission
  - Complete debug tracing for troubleshooting

### ✅ User Productivity (NEW - Apr 16, 2026)
- **Global Highlight-to-Note**: Instantly turn any text in the app into a research note.
- **Context-Aware Trigger**: Floating button automatically appears centered above selection on mouse release.
- **Metadata Preservation**: Automatically captures paper URI and title via dataset attributes.
- **Surgical Pre-filling**: `CreateNoteModal` pre-fills content and source without user input.
- **Capture-Phase Logic**: Guaranteed interaction reliability by intercepting pointers before component propagation.

## Recent Critical Fixes

### ✅ SORT UI DECENTRALIZATION (Mar 17, 2026) - UI ENCAPSULATION
**Major Accomplishment:** Eliminated prop-drilling by migrating sort state into native components

**Problem:** `ResearchView` managed the `sortBy` state and dropdown UI for its child components (`DeepSearch` and `PaperSearch`), coupling the views together and causing unnecessary prop drilling.
**Solution:**
- Encapsulated `sortBy` and `isSortOpen` state into `DeepSearch` and `PaperSearch`.
- Recreated the Sort Dropdown UI immediately to the right of the existing 'Filters' button in both tabs.
- Cleaned up parent component.

---

### ✅ RESEARCH AGENT HARNESS & NAVIGATION (Mar 23, 2026)
**Major Accomplishment:** Upgraded the agent's iterative reasoning and paper traversal capabilities.

**Problem:** Agent struggled to find sections in papers with non-standard structures and would "forget" previous results during long tasks.
**Solution:**
- **Navigation Tools:** Implemented `search_multiple_keyword` and `get_paper_structure`.
- **Harness Logic:** Updated loop to preserve the last 3 observations and explicitly record `Thought` history.
- **Auto-Memory:** Enabled tools to independently save findings into long-term `Session Memory`.
- **Scalability:** Increased max iterations to 15.

---

### ✅ UNIFIED SELECTION STATE (Feb 27, 2026) - DEDUPLICATION COMPLETE
**Major Accomplishment:** Cross-component paper selection with automatic deduplication

**Problem:** Same paper selectable in 4 places with isolated states → duplicates in Agent context
**Solution:** 
- Added `selectedPaperUris: Set<string>` to ResearchContext
- 4 helper functions: `isPaperSelectedByUri()`, `addToSelectionByUri()`, `removeFromSelectionByUri()`, `getSelectedPaperUris()`
- All components check same URI (SavedPaper.uri = WebSearch.uri = ArxivPaper.pdfUri)

```typescript
// ResearchContext - NEW
const [selectedPaperUris, setSelectedPaperUris] = useState<Set<string>>(new Set());
const isPaperSelectedByUri = (uri?: string) => uri ? selectedPaperUris.has(uri) : false;
const addToSelectionByUri = (uri: string) => setSelectedPaperUris(prev => new Set(prev).add(uri));
const removeFromSelectionByUri = (uri: string) => setSelectedPaperUris(prev => { const n = new Set(prev); n.delete(uri); return n; });

// Components - UPDATED
const isSelected = isPaperSelectedByUri(paper.uri); // SourcesPanel uses paper.uri
const isSelected = isPaperSelectedByUri(source.uri); // WebSearchView uses source.uri
const isSelected = isPaperSelectedByUri(paper.pdfUri); // DeepSearch/PaperResults use pdfUri
```

**Result:** All 4 components show same checkbox state, zero duplicates in Agent context ✅

---

### ✅ AGENT RESEARCHER CRITICAL BUG FIXES (Feb 23, 2026) - PHASE 1 COMPLETE
**Major Accomplishment:** File upload → Gemini pipeline now fully functional

**Bug 1: Infinite Loop on Startup**
- **Problem:** useEffect auto-sync timer re-ran every 1.5s, causing repeated uploads
- **Root Cause:** Dependency array `[contextPdfs]` triggered on every state change
- **Solution:** Disabled timer, moved syncFiles outside useEffect, added explicit trigger on `contextPdfs.length` change
```typescript
// BEFORE: Timer runs repeatedly, syncFiles defined inside useEffect
// AFTER: Function defined at component level
const syncFiles = async () => { /* upload logic */ };
useEffect(() => {
  if (contextPdfs.length > 0) syncFiles();
}, [contextPdfs.length]); // Explicit trigger on PDF count change
```

**Bug 2: fileUri=[object Object] Error**
- **Problem:** Backend returned entire cached object instead of URI string
- **Root Cause:** uploadFile returned `uploadedFiles.get(uniqueId)` (whole object) when file was cached
- **Solution:** Return only the `.uri` property
```javascript
// BEFORE: return uploadedFiles.get(uniqueId); // Returns {uri, file, mimeType}
// AFTER: 
const cachedFile = uploadedFiles.get(uniqueId);
return cachedFile.uri; // Returns only "file://..."
```

**Bug 3: Files Never Uploaded (ROOT CAUSE)**
- **Problem:** uploadedFiles stayed empty when sending message
- **Root Cause:** `syncFiles()` was defined but NEVER CALLED
- **Solution:** Added useEffect that automatically calls syncFiles when files are added to context
```typescript
// NEW useEffect watches contextPdfs length and triggers sync
useEffect(() => {
  if (contextPdfs.length > 0) {
    syncFiles().catch(err => console.error('[AgentResearcher] Error syncing files:', err));
  }
}, [contextPdfs.length]);
```

**Bug 4: File Lookup Type Error**
- **Problem:** `.keys()` called on plain object instead of Map
- **Fix:** Changed `Array.from(uploadedFiles.keys())` → `Object.keys(uploadedFiles)`

**Result:** Complete file upload → processing → sending pipeline now working end-to-end

### ✅ Multi-Source Search & ArXiv Precision (Feb 19, 2026)
**Problem:** ArXiv search returned 200+ low-relevance papers using scattered keywords.
**Solution:** Complete overhaul of Stage 1 (keyword generation) and Stage 2 (paper discovery).

```typescript
// NEW type: ArxivSearchStructured
{ primary_keyword: "world war 1", secondary_keywords: ["food", "global"], 
  query_combinations: ["world war 1 AND food AND global", "world war 1 AND food"] }

// NEW: buildArxivQueries generates abs: AND queries
// "world war 1 AND food AND global" → abs:(world AND war AND 1) AND abs:food AND abs:global

// NEW: searchAllSources runs 5 APIs in parallel
const [arxiv, openAlex, cse, pdfVector, grounding] = await Promise.allSettled([...]);
```

### ⚠️ Zero Results Bug (commit a90481f)
**Problem:** Filtering sometimes returned 0 papers despite valid candidates.
**Solution:** Clear embedding cache and retry when filter returns empty.

```typescript
if (filteredPapers.length === 0 && papers.length > 0) {
  console.log("⚠️ Zero results - clearing cache and retrying");
  embeddingCache.clear();
  filteredPapers = await filterRelevantPapers(papers, questions);
}
```

### ⚠️ Embedding Model Migration
**Change:** `text-embedding-004` → `gemini-embedding-001`
**Reason:** text-embedding-004 shutdown on Feb 6, 2026
**Impact:** All embedding calls updated in batch processing

### ⚠️ ArXiv CORS Issue
**Problem:** Direct ArXiv API calls blocked by CORS.
**Solution:** Backend Express proxy on port 3001.

```javascript
// backend/routes/arxiv.js
app.get('/api/arxiv-proxy', async (req, res) => {
  const arxivUrl = `https://export.arxiv.org/api/query?${req.query.params}`;
  const response = await fetch(arxivUrl);
  res.send(await response.text());
});
```

### ⚠️ Relevance Threshold Adjustment
**Change:** 0.48 
**Reason:** Higher threshold was too restrictive, missing relevant papers.

### ⚠️ Structured Logging System
Added comprehensive logging with emojis and formatted boxes.

```typescript
console.log("┌─────────────────────────────────────");
console.log("│ 🔍 Deep Research Pipeline Started");
console.log("│ Topics:", topics);
console.log("│ Questions:", questions);
console.log("└─────────────────────────────────────");

console.log("📊 Filter Results:");
console.log(`  ✅ Relevant: ${filteredPapers.length}`);
console.log(`  ❌ Filtered out: ${papers.length - filteredPapers.length}`);
```

**Commit Trail:**
- `61cf838` - Add comprehensive, formatted logging for PDF URI tracking
- `f94f374` - Add comprehensive logging for paper filtering process
- `0066128` - CRITICAL FIX: Update to gemini-embedding-001
- `52546cc` - Debug: Add comprehensive logging to filter-papers endpoint

## Architecture Evolution

### ✅ Proven Decisions
- **Domain-Driven Contexts:** Scales well for independent features
- **Set Data Structures:** `downloadingUris`, `contextUris` for O(1) lookups
- **Scholar Design System:** Professional academic branding
- **Backend Proxy:** Solves CORS issues for ArXiv and other APIs

### 🔄 Evolving Considerations
- **PDF Memory Management:** Consider LRU cache for high-volume scenarios
- **Workspace Model:** Potential `research_projects` table for grouping
- **Citation Formats:** APA, MLA templates
- **Collaboration:** Team features (Phase 2)

## Development Priorities

### Security
- [ ] Rotate database credentials in `database/db.ts`
- [ ] Environment variable audit
- [ ] API key rotation strategy

### Features
- [ ] Citation style templates (APA, MLA, Chicago)
- [ ] Literature map visualization (Phase 3)
- [ ] Advanced search filters (date range, author)
- [ ] Batch PDF export

### Performance
- [ ] LRU cache for PDF memory management
- [ ] Embedding cache persistence (Redis/localStorage)
- [ ] Lazy loading for large note lists

### UX
- [ ] Keyboard shortcuts
- [ ] Dark mode refinements
- [ ] Mobile responsive improvements

## Known Issues

### Minor
- Column resize drag sometimes lags on slow devices
- PDF viewer scrolling not always smooth on large documents
- Folder tree doesn't support drag-and-drop reordering

### Blocked
- None currently

## Metrics

### Performance
- **PDF Download**: ~2-4 seconds per PDF (network dependent)
- **Embedding Cache Hit Rate**: ~60%
- **Note Extraction**: ~8 pages/second (batch processing)
- **Time to First Result**: ~5-10 seconds (full deep research)

### Quality
- **PDF Processing Success Rate**: ~95%
- **Relevance Score Accuracy**: ~85% (user feedback)
- **Zero Results Rate**: <5% (after cache retry fix)

## Next Release (v2.1)

### Planned Features
1. Citation export formats
2. Advanced filtering UI
3. Performance dashboard
4. Team workspace (beta)

### Target Date
End of Q1 2026
