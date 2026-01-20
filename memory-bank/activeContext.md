# Active Context - Research Note

## Current Work Focus (January 20, 2026)

### Primary Active Focus: UI/UX Refinement & Interaction Polish

**Immediate Priorities:**
1. **Interactive Feedback Loop** - Ensure all asynchronous actions (loading, saving, downloading) have clear visual indicators.
2. **Brand Consistency** - Apply the "Scholar" design system (Purple/Indigo palette) across all action buttons and status indicators.
3. **Layout Stability** - Maintain column width constraints and responsive behavior across all view modes.
4. **Knowledge Organization** - Improve the "Add to Sources" workflow for better research synthesis.

### Current Session Goals

**Active Task: UI interaction Polish & Memory Bank Update**
- ✅ **COMPLETED: Responsive "Add to Sources" Toggle** - Unified button with toggle states (Add/Added), brand colors, and loading spinners in `WebSearchView` and `DeepResearchView`.
- ✅ **COMPLETED: Layout Control Optimization** - Updated `LayoutControls.tsx` icons (`Globe` -> `FolderOpen`) and labels to accurately reflect column purposes.
- ✅ **COMPLETED: Layout Constraint Enforcement** - Fixed `ThreeColumnLayout.tsx` to prevent the Sources column from exceeding 30% width even when it's the only visible column.
- ✅ **COMPLETED: Source Panel Interaction** - Refined `SourcesPanel.tsx` with loading indicators and unified checkmark behavior.
- 🔄 **Currently updating Memory Bank** with today's feature polish and UI improvements.

## Recent Changes & Accomplishments

### 🎨 UI/UX Interaction Polish (January 20, 2026)
**Unified Source Management and Visual Feedback**

- **Interactive "Add to Sources" Button**: 
    - Replaced the confusing "Save paper" and "Add to Sources" dual-button setup with a single, state-aware toggle.
    - Integrated `downloadingUris` from `LibraryContext` to show real-time `Loader2` spinners on the button themselves.
    - Added safety checks in `DeepResearchView` to prevent removing papers that have associated saved notes.
- **Brand System Integration**:
    - Standardized action buttons using `bg-scholar-100` and `text-scholar-700` for active/saved states.
    - Ensured "Added" state provides clear visual confirmation with `Check` icons.
- **Improved Layout Controls**:
    - Changed the "Web Search" (Globe) icon to "Sources" (FolderOpen) to better match the left column's primary function.
    - Updated mobile dropdown labels and icons for consistency between desktop and mobile.
- **Robust Column Resizing**:
    - Implemented strict clamping in `getColumnWidth` for the left column (sources) to stay between 20-30% width, preventing UI breakage when solitary.

### 🔒 Authentication & Security Wins (January 7-15, 2026)
**Production-Grade Security System Implemented**

- **Multi-tier Auth**: Validated Neon, Google, and Microsoft OAuth providers.
- **Microsoft OAuth with PKCE**: Custom implementation with state verification and deterministic password recovery.
- **Environment Variable Security**: Isolated client-safe vs server-side variables using `inject-env.sh` and multi-stage Docker builds.
- **Data Migration**: Supported seamless transfer of anonymous user data from `localStorage` to PostgreSQL upon sign-in.

## Code Quality Standards

**React Context Architecture:**
- Always use `useCallback` for functions passed to child components.
- Implement `useMemo` for expensive computations (tree building, filtering).
- Use `Set` data structures for O(1) membership testing and ensuring unique entries.

**UI Component Patterns:**
- **Loading States**: Every async action must show a loading spinner (e.g., `Loader2`) and disable the triggering element.
- **State Toggles**: Use semantic labeling (e.g., "Add" vs "Added") and icon changes to reflect toggle states.
- **Propagation Control**: Use `e.stopPropagation()` in nested click handlers to avoid accidental parent triggers.

## Project Insights & Learnings

### UI/UX Discoveries
- **Unified Action Buttons**: Combining "Save" and "Add to Context" logic into a single "Source Management" flow reduces cognitive overhead for researchers.
- **Visual Continuity**: When a paper is "Added", opening the Sources panel immediately (via `openColumn('left')`) provides instant confirmation of where the resource went.
- **Layout Constraints**: Enforcing minimum/maximum widths for sidebars is critical for maintaining readability of the central "Research" column.

### Technical Insights
- **Context Synchronization**: Exposing `downloadingUris` across all view components allows for ubiquitous loading state feedback without redundant state management.
- **CORS Management**: The proxy fallback system in `pdfService.ts` handles ~95% of academic repository download issues.

## Current Challenges & Solutions

### Performance Challenges
- **Large PDF Collections**: Memory growth in `LibraryContext` when 50+ PDFs are loaded.
- **Solution:** Implementing LRU cache with buffer cleanup.

### Design Challenges
- **Feature Discovery**: Ensuring users understand the difference between selecting for AI context and adding to the permanent library.
- **Solution:** Clearer labeling ("Add to Sources") and unified icons.