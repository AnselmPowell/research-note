# Product Context

## Mission
Automate the mechanical 60% of academic research (searching, downloading, extracting) so researchers focus on synthesis and discovery.

## User Problems

### 1. Source Fragmentation
**Problem:** Research scattered across 50+ browser tabs, desktop folders, email attachments.
**Solution:** Unified sources panel with hierarchical organization and persistent storage.

### 2. Extraction Latency
**Problem:** Finding specific findings in 50-page PDFs takes hours of manual CTRL+F.
**Solution:** AI extracts relevant quotes with justifications, page numbers, and citations automatically.

### 3. Citation Overhead
**Problem:** Tracking which quote came from which page of which paper is error-prone.
**Solution:** Bidirectional linking between notes and PDF sources with one-click navigation.

## User Personas

### The Systematic Reviewer
**Goal:** Find every relevant paper on a medical/technical topic.
**Pain:** Manually searching PubMed/ArXiv, filtering hundreds of results.
**Solution:** Deep research generates ArXiv queries, filters by semantic relevance (threshold: 0.30), downloads top 20 papers.

### The Literature Synthesizer
**Goal:** Find specific evidence to support/refute hypothesis.
**Pain:** Reading entire papers to find 2-3 relevant paragraphs.
**Solution:** AI extracts only relevant sections matching research questions, with confidence scores.

### The Student Researcher
**Goal:** Quickly discover most relevant papers in new field.
**Pain:** No domain knowledge to craft effective search queries.
**Solution:** AI generates specialized search terms from general questions, filters by relevance.

## Design Philosophy

### 1. Flow Preservation
Minimize context switching. Single workspace for search → download → read → extract → organize.

**Implementation:**
- 3-column layout (Sources | Results | PDF Viewer)
- Mode switching without losing state
- Column locking for persistent workspace

### 2. Transparent AI
Users trust AI that shows its work.

**Implementation:**
- Direct quotes with source attribution
- AI justifications for each extracted note
- Relevance scores (0.0-1.0)
- One-click "View Source" navigation to PDF page

### 3. Professional Authority
Clean, scholarly aesthetic distinguishes tool as professional research platform.

**Implementation:**
- Scholar color palette (#590016 burgundy)
- Minimal UI with progressive disclosure
- Real-time status indicators
- Structured, formatted logging

## User Experience Goals

### Speed
- **Target:** 80% reduction in literature review time
- **Current:** ~5-10 seconds for full deep research pipeline
- **Benchmark:** Manual review of 20 papers = ~4 hours → Tool: ~30 minutes

### Accuracy
- **Target:** 95% successful PDF processing
- **Current:** ~95% success rate
- **Quality:** Relevance score >0.70 for extracted notes

### Trust
- **Source Attribution:** Every note links to exact PDF page
- **Transparency:** AI shows reasoning for extractions
- **Verification:** Users can always view original source

## Workspace Design

### Left Column: Sources (20-30% width)
- User-curated PDF library
- Real-time download indicators
- Hierarchical folder organization
- Quick actions: Open, Delete, Export

### Middle Column: Research Results (40-60% width)
- Search modes: Web, Deep, Upload
- Real-time extraction streaming
- Phase indicators (Searching → Filtering → Extracting)
- Note cards with relevance scores

### Right Column: PDF Viewer (30-40% width)
- High-fidelity rendering
- Text search with highlighting
- Page navigation
- Scroll sync with notes

## Interaction Patterns

### Unified "Add to Sources"
Single toggle for adding papers to library.

```
Initial: [+ Add to Sources]
Loading: [⏳ Downloading...]
Success: [✓ Added]
Already Added: [✓ Added] (click to remove)
```

### Real-Time Feedback
Users always know what's happening.

```
Research Phase: "Searching ArXiv..." → "Filtering by relevance..." → "Extracting notes..."
Download Status: Spinner on paper cards while downloading
Streaming Results: Notes appear incrementally during extraction
```

### Safety Checks
Prevent data loss from accidental actions.

```
Delete Paper: "Remove 12 linked notes first"
Clear Results: "This will clear 45 extracted notes. Continue?"
Sign Out: "Migrate anonymous data first?"
```

## Feature Priorities

### Core (MVP)
- ✅ Multi-modal search
- ✅ Deep research pipeline
- ✅ PDF processing
- ✅ Note extraction
- ✅ Source management

### Quality of Life (v2)
- ✅ Authentication
- ✅ Hierarchical folders
- ✅ AI assistant
- ✅ Export functionality
- 🔄 Citation formats

### Advanced (v3)
- 🔄 Literature map visualization
- 🔄 Team collaboration
- 🔄 Advanced filters
- 🔄 Batch operations

## Success Metrics

### Adoption
- **DAU/MAU ratio:** >40%
- **Session duration:** >20 minutes
- **Return rate:** >60%

### Engagement
- **Papers analyzed per session:** >10
- **Notes extracted per session:** >30
- **Sources saved per user:** >50

### Quality
- **PDF processing success:** >95%
- **User-reported relevance:** >80%
- **Feature satisfaction (NPS):** >50

## Competitive Differentiation

| Feature | Research Note | Zotero | Mendeley | NotebookLM |
|---------|---------------|--------|----------|------------|
| AI Extraction | ✅ Automatic | ❌ Manual | ❌ Manual | ✅ Chat-based |
| Deep Research | ✅ ArXiv pipeline | ❌ Manual | ❌ Manual | ❌ Upload only |
| Source Attribution | ✅ Page-level | ✅ Basic | ✅ Basic | ❌ None |
| Real-time Streaming | ✅ Yes | ❌ No | ❌ No | ❌ No |
| Semantic Filtering | ✅ Vector similarity | ❌ Keywords | ❌ Keywords | ❌ N/A |

## Out of Scope

### Explicitly Not Building
- Native mobile apps (web-responsive only)
- Document editing/writing (synthesis focus)
- Social networking features
- Paper recommendation engine
- Peer review workflows
- Journal submission tools

### Future Considerations
- Mobile apps (Phase 4)
- API for integrations (Phase 3)
- Browser extension (Phase 3)
- Institutional licensing (Phase 2)
