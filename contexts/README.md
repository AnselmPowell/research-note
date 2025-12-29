# Application State Management

This application uses a **Domain-Driven Context Architecture**. Instead of a single global state or complex Redux store, state is divided into three distinct domains (Contexts) based on their responsibility. This decoupling ensures that unrelated parts of the app (like the PDF viewer and the Search bar) do not trigger unnecessary re-renders in each other.

## 1. Context Domains

### 🎨 UIContext (`useUI`)
**Responsibility:** Visual state, layout, themes, and animations.
*   **State:** `darkMode`, `columnVisibility` (left/middle/right), `isHomeExiting`.
*   **Actions:** `toggleDarkMode()`, `toggleColumn()`, `setColumnVisibility()`.
*   **Use Case:** A component needs to know if the "Right Column" is open, or needs to switch the theme.

### 📚 LibraryContext (`useLibrary`)
**Responsibility:** Asset management. Handles the raw PDF data, file loading, and workspace selection.
*   **State:** `selectedPdfs` (Array of loaded PDF objects), `activePdfUri` (Currently viewing), `downloadingUris`.
*   **Actions:** `loadPdfFromUrl()`, `addPdfFile()`, `removePdf()`, `setActivePdf()`.
*   **Use Case:** The Workspace needs to render the active PDF, or the Source Card needs to check if a PDF is already loaded.

### 🔬 ResearchContext (`useResearch`)
**Responsibility:** Business logic, API communication, and data processing.
*   **State:** `searchState` (Google results), `activeSearchMode` ('web'/'deep'), `arxivCandidates`, `deepResearchResults`.
*   **Actions:** `performWebSearch()`, `performDeepResearch()`, `analyzeLoadedPdfs()`.
*   **Use Case:** The SearchBar needs to trigger a query, or the results view needs to display found papers.

---

## 2. Usage Guide

### Setup (Providers)
The application is wrapped in `index.tsx` to provide these contexts globally. Order matters slightly for dependency (e.g., if Research needed Library), but generally they are siblings.

```tsx
<UIProvider>
  <ResearchProvider>
    <LibraryProvider>
      <App />
    </LibraryProvider>
  </ResearchProvider>
</UIProvider>
```

### Consuming Context

Use the custom hooks exported from each context file. **Do not** use `useContext(Context)` directly.

#### Example: Toggling a Column (UI)
```tsx
import { useUI } from '../contexts/UIContext';

const MyComponent = () => {
  const { columnVisibility, toggleColumn } = useUI();

  return (
    <button onClick={() => toggleColumn('right')}>
      {columnVisibility.right ? 'Close' : 'Open'} Panel
    </button>
  );
};
```

#### Example: Triggering a Search (Research)
```tsx
import { useResearch } from '../contexts/ResearchContext';

const SearchButton = () => {
  const { performWebSearch, searchState } = useResearch();

  return (
    <button 
      onClick={() => performWebSearch("AI Agents")}
      disabled={searchState.isLoading}
    >
      {searchState.isLoading ? "Searching..." : "Go"}
    </button>
  );
};
```

#### Example: Loading a PDF (Library)
```tsx
import { useLibrary } from '../contexts/LibraryContext';

const PdfLink = ({ uri }) => {
  const { loadPdfFromUrl, isPdfSelected } = useLibrary();

  if (isPdfSelected(uri)) return <span>Already Loaded</span>;

  return (
    <button onClick={() => loadPdfFromUrl(uri)}>
      Open PDF
    </button>
  );
};
```

## 3. Best Practices

1.  **Keep it Local:** If state is only used in *one* component (e.g., whether a dropdown is open), use `useState` inside that component. Do not put it in Context.
2.  **Separation:** If you are adding a feature that involves *fetching data*, put the logic in `ResearchContext`. If it involves *changing the view*, put it in `UIContext`.
3.  **Performance:** Context updates trigger re-renders in all consumers. We have split the contexts specifically to minimize this. Changing `darkMode` (UIContext) will not re-render components that only care about `arxivCandidates` (ResearchContext).
