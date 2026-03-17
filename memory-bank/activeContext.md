# Active Context - Research Note

## Current Work Focus (March 17, 2026)

### COMPLETED: Sort UI Decentralization ✅

**Session (Mar 17, 2026) - Sort UI and State Moved to Child Components**

**Problem Solved:**
- `ResearchView.tsx` handled generic sorting states and UI dropdowns, causing unnecessary prop-drilling to `DeepSearch.tsx` and `PaperSearch.tsx`.

**Solution:**
- Encapsulated sort state (`sortBy`, `isSortOpen`) and dropdown UI logic directly into `DeepSearch.tsx` and `PaperSearch.tsx`.
- Placed sort dropdowns directly next to the local Filter buttons in the respective components.
- Eliminated all sort-related prop-drilling from `ResearchView.tsx`.

### COMPLETED: Unified Selection State with Deduplication ✅

**Session (Feb 27, 2026) - Paper Selection Across All Components**

**Problem Solved:**
- Papers exist in 4 places (SourcesPanel, WebSearchView, DeepSearch, PaperResults) with isolated selection states
- Same paper could be selected multiple times, appearing as duplicates in Agent context
- Checkboxes didn't reflect selection across components

**Solution: Unified Selection via URI**
- Added `selectedPaperUris: Set<string>` to ResearchContext
- All papers matched by URI (SavedPaper.uri = WebSearch.uri = ArxivPaper.pdfUri)
- 4 helper functions: `isPaperSelectedByUri()`, `addToSelectionByUri()`, `removeFromSelectionByUri()`, `getSelectedPaperUris()`

**Implementation Summary:**

1. **ResearchContext.tsx** (+40 lines)
   - Added state: `const [selectedPaperUris, setSelectedPaperUris] = useState<Set<string>>(new Set());`
   - 4 new functions exported in context value

2. **Component Updates** (+60 lines across 4 files)
   - SourcesPanel: Checkbox uses `isPaperSelectedByUri(paper.uri)`
   - WebSearchView: Checkbox uses `isPaperSelectedByUri(source.uri)`
   - DeepSearch: Checkbox uses `isPaperSelectedByUri(paper.pdfUri)`
   - PaperResults: Checkbox uses `isPaperSelectedByUri(paper.pdfUri)`

3. **Toggle Updates** (+40 lines in 2 files)
   - SourcesPanel: `addToSelectionByUri(uri)` when checked, `removeFromSelectionByUri(uri)` when unchecked
   - WebSearchView: `addToSelectionByUri(source.uri)` when saved to sources

**Result:**
- ✅ Select paper in SourcesPanel → ALL 4 components show checkbox checked
- ✅ Same paper never added twice to Agent context
- ✅ Complete cross-component visibility
- ✅ Zero breaking changes, backward compatible

**Data Structure Mapping:**
```
SavedPaper.uri (SourcesPanel) = "https://arxiv.org/pdf/2412.12345.pdf"
SearchSource.uri (WebSearchView) = "https://arxiv.org/pdf/2412.12345.pdf"
ArxivPaper.pdfUri (DeepSearch/PaperResults) = "https://arxiv.org/pdf/2412.12345.pdf"
↓
All stored in selectedPaperUris Set by same URI = Perfect deduplication
```

---

## Previous: Sort Separation Feature (February 24-26, 2026)

### COMPLETED: Sort Separation for "My Results" Tab ✅

**Problem Solved:**
- One sort state affected BOTH tabs (Deep Research + My Results)
- Toggling sort in My Results would change Deep Research sorting

**Solution:**
- Separate sort states: `sortByDeep` and `sortByResults`
- Tab-specific UI dropdowns (deep research shows different options than results)
- New sort algorithms with 65% complexity reduction
- Added `addedToAccumulationAt` timestamp for "Recent Research" sort

**Files Modified:** 3
- DeepResearchView.tsx: Separate sort states + tab-specific UI
- PaperResults.tsx: New sort algorithms (45 lines vs 130 lines)
- ResearchContext.tsx: Added timestamp when papers added to accumulation

**Result:** Each tab maintains independent sort preference ✅


- ✅ **PDFVector**: Academic search with client-side relevance scoring
- ✅ **Google Grounding**: Gemini `googleSearch` tool for PDF discovery
- ⚠️ **OpenAI**: Fallback only (not primary)

## Key Files Modified (Feb 19)
- `types.ts` — `ArxivSearchStructured` interface replaced, `sourceApi` added to `ArxivPaper`
- `services/arxivService.ts` — `buildArxivQueries()` rewritten for `abs:` AND queries
- `services/searchAggregator.ts` — **NEW** multi-source orchestrator
- `services/geminiService.ts` — `year?` added to metadata return type
- `contexts/ResearchContext.tsx` — `searchAllSources()` replaces `searchArxiv()`, `displayKeywords` updated
- `backend/services/geminiService.js` — `generateArxivSearchTerms()` rewritten + `searchWithGrounding()` added
- `backend/routes/search.js` — **NEW** proxy routes for 3 search APIs
- `backend/routes/gemini.js` — `grounding-search` route added
- `backend/routes/index.js` — search routes mounted
