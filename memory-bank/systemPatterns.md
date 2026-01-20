# System Patterns - Research Note Architecture

## Domain-Driven Context Architecture

Research Note uses a **Domain-Driven Context Architecture** that separates concerns into specialized state management domains.

### Context Responsibility Matrix

| Context | Primary Responsibility | Key State |
|---------|----------------------|-----------|
| **UIContext** | Layout, animations, theme | Column visibility, locks |
| **ResearchContext** | AI processing, search | Pipeline results, phases |
| **LibraryContext** | PDF management, acquisition | Loaded files, download tracking |
| **DatabaseContext** | Persistence, organization | Saved notes, hierarchical folders |

## Key Implementation Patterns

### 1. Unified Acquisition & Feedback Pattern
Used to ensure consistent behavior across search results (`WebSearchView`) and paper discovery (`DeepResearchView`).

**The "Add to Sources" Toggle:**
```typescript
const handleAddToSources = async () => {
    if (isSaved) {
        if (!canDeletePaper(id)) return alert("Remove notes first");
        deletePaper(id);
        return;
    }
    
    // Acquire PDF if not loaded
    if (!isLoaded(id)) {
        const result = await loadPdfFromUrl(url, title);
        if (!result.success) return;
    }
    
    // Persist and navigate
    savePaper(data);
    openColumn('left'); // Show user where the source went
};
```
- **Visual Pattern**: Show `Loader2` while `downloadingUris.has(id)` is true.
- **Labels**: Transition from "Add to Sources" to "Added" (with brand colors).

### 2. Async Pool & Streaming Results
Ensures the system remains responsive while processing high-volume academic data.
- **Concurrency**: `asyncPool` limits PDF processing to 3-4 concurrent workers.
- **Feedback**: Partial results are streamed to the UI immediately via callbacks.

### 3. Smart Column Management
The `ThreeColumnLayout` uses a constraint-based sizing logic:
- **Left Column (Sources)**: Hard-clamped between 20% and 30% width.
- **Center/Right Columns**: Dynamically calculated space-filling logic.
- **Locks**: Allows users to "pin" a workspace (like Paper View) while switching between search modes.

### 4. Database UPSERT with Implicit Management
- Papers are added to the DB's `papers` table even if only viewed as a reference.
- `is_explicitly_saved` flag distinguishes between background metadata and user-curated sources.
- `ON CONFLICT` ensures metadata (authors, page counts) is updated without duplicating records.

## UI/UX Design System (Scholar)

- **Authority Colors**: Primary brand color (#590016) used for core actions and active research states.
- **Interaction Feedback**: All buttons transition to a "confirmed" state (e.g., "Added", "Saved") with secondary brand colors (`bg-scholar-100`).
- **Responsive Hierarchy**: Column priorities shift based on viewport (Sources close on mobile to favor PDF viewing).

## Performance Optimization Patterns

- **Embedding Batching**: API calls grouped into batches of 50 to maximize throughput.
- **In-Memory Cache**: `Map` structure for embeddings to prevent redundant calculation for repeated research queries.
- **Geometric Reconstruction**: Custom sorting algorithm for PDF text items ensures correct reading order for 2-column academic papers.