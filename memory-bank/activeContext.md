## Current Work Focus (April 16, 2026)

### COMPLETED: Global Highlight-to-Note Feature ✅

**Session (Apr 16, 2026) - Global Context-Aware Note Creation**

**Problem Solved:**
- Users couldn't easily turn agent-generated insights (Abstracts, Findings, Breakdowns) into permanent notes.
- Creating a note required manually copy-pasting text and switching between tabs/modals.

**Solution: The "Selection Context" Pattern**
1. **useTextSelection Hook**: A global hook using Capture Phase pointers to detect text selections upon mouse release without interfering with UI drags.
2. **DOM-Context Discovery**: Uses `data-paper-uri` and `data-paper-title` attributes to automatically discover the source paper of any highlighted text.
3. **SelectionNotesTrigger**: A floating glassmorphic "Create Note" button that inherits existing styling and pre-fills the creation modal.
4. **Modal Pre-filling**: Updated `CreateNoteModal` to accept and prioritize pre-filled content and source papers.

**Result:**
- ✅ Users can highlight any agent output and turn it into a note with one click.
- ✅ Feature is highly scalable (any component can be "note-enabled" by adding 2 HTML attributes).
- ✅ Perfectly centered UI positioning using per-line rect calculations.

**Files Created/Modified:**
- `hooks/useTextSelection.ts` (NEW)
- `components/ui/SelectionNotesTrigger.tsx` (NEW)
- `components/library/CreateNoteModal.tsx`
- `components/library/PapersTable.tsx`
- `components/library/PaperDetails.tsx`
- `App.tsx`

---

### COMPLETED: Research Agent Harness & Tool Robustness ✅

**Session (Mar 23, 2026) - Upgraded Agent ReAct Loop and Advanced Navigation**

**Problem Solved:**
- The research agent suffered from "iteration amnesia," losing context between tool calls.
- Searching dense academic papers was inefficient due to single-keyword limits and lack of logical structure awareness.
- Agent failed silently or abruptly when reaching iteration limits.

**Solution: The ReAct Harness Upgrade**
1. **Memory Buffering**: Implemented a 3-observation buffer (`recentObservations`) to keep immediate context alive across sequential actions.
2. **Persistence Upgrades**:
   - Expanded `executionLog` to include agent `Thought` strings and increased result truncation from 120 to 500 characters.
   - Fixed the auto-save mechanism: Any tool (e.g., `get_paper_structure`) can now automatically inject findings into the long-term Session Memory.
3. **Advanced Navigation Tools**:
   - `search_multiple_keyword`: Scans for an array of terms in one go to save iterations.
   - `get_paper_structure`: A dedicated sub-agent tool (`gemini-2.5-flash-lite`) that maps the logical structure of 50 pages and auto-saves a Table of Contents with page numbers.
4. **Resiliency**: Increased `MAX_ITERATIONS` to 15 and implemented a graceful failure state that returns partial findings gathered so far instead of a blank error.

**Result:**
- ✅ Agent effectively traverses non-standard papers by "mapping" them first.
- ✅ Sustained reasoning across longer tasks (Literature Reviews / Comparisons).
- ✅ Efficient token usage by offloading structural mapping to a fast model.

### PREVIOUS: Research Tab Integration into NotesManager ✅

**Session (Mar 17, 2026) - Full Integration of Research Workflow into Library**

**Problem Solved:**
- Research results were disconnected from the Library/NotesManager interface.
- Switching between agent researcher results and the library required too many column toggles.
- Redundant icons and counters cluttered the sidebar.

**Solution:**
- Integrated `PaperSearch.tsx` as a native "Research" tab within `NotesManager.tsx`.
- Updated the "Research" icon to `BookOpenText` across all interfaces for a unified metaphor.
- Modified `AgentResearcher.tsx` to automatically redirect focus to the Library's Research tab when research begins, while explicitly closing the redundant middle column.
- Simplified `NotesManagerSidebar.tsx` by removing icons for primary views ("All Notes", "Papers", "Research") and removing the unnecessary counter for the Research tab.

**Result:**
- ✅ Seamless transition from AI research to library management.
- ✅ Cleaner, dashboard-style sidebar interface.
- ✅ Unified visual identity with professional academic icons.

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
