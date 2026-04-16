# Global Highlight-to-Note Feature: Technical Specification

## Overview
The "Highlight-to-Note" feature enables an ultra-efficient research workflow where users can transform any text into a structured discovery note with a single click. It bridges the gap between AI-driven research analysis (abstracts, findings, breakdowns) and personal knowledge management.

## System Architecture

The feature follows a **Context-Injection Pattern**, where data metadata is decoupled from the UI trigger, allowing for a highly generic and scalable implementation.

### 1. The Multi-Layer Selection Hook (`hooks/useTextSelection.ts`)
This is the "engine" of the feature. It manages selection tracking, DOM metadata discovery, and geometric positioning for the UI button.

**Key Technical Decisions:**
- **Pointer Pointer Events (Capture Phase):** The hook uses `pointerdown` and `pointerup` with `{ capture: true }`. This is critical because interactive components like AG-Grid (used in `PapersTable`) often stop event propagation. Capture phase ensures our global hook spots the interaction before it is consumed by child components.
- **IsDragging State:** We explicitly track a drag operation to prevent the UI from "jittering" or appearing while the user is still actively selecting text. The button only triggers on `pointerup`.
- **Per-Line Geometry:** When text spans multiple lines, `getBoundingClientRect()` returns a massive block. We instead use `range.getClientRects()[0]` to target the exact boundary of the *first* highlighted line, ensuring the button is always centered perfectly above the top line of the selection.

```typescript
// hooks/useTextSelection.ts (Full Implementation)
import { useState, useEffect } from 'react';

interface SelectionState {
  text: string;
  paperTitle: string;
  paperUri: string;
  position: { x: number; y: number; width: number; height: number; } | null;
}

export const useTextSelection = () => {
  const [selection, setSelection] = useState<SelectionState | null>(null);

  useEffect(() => {
    let isDragging = false;

    const handleSelectionChange = () => {
      if (isDragging) return;

      const activeSelection = window.getSelection();
      if (!activeSelection || activeSelection.isCollapsed) {
        setSelection(null);
        return;
      }

      const text = activeSelection.toString().trim();
      if (text.length < 5) {
        setSelection(null); 
        return;
      }

      const anchorNode = activeSelection.anchorNode;
      if (!anchorNode) return;

      const elementNode = anchorNode.nodeType === 3 ? anchorNode.parentElement : anchorNode as HTMLElement;
      if (!elementNode) return;

      // DOM Context Discovery via Closest Ancestor with data attributes
      const containerWithData = elementNode.closest('[data-paper-uri]');

      if (containerWithData) {
        const paperUri = containerWithData.getAttribute('data-paper-uri') || '';
        const paperTitle = containerWithData.getAttribute('data-paper-title') || '';

        const range = activeSelection.getRangeAt(0);
        const rects = range.getClientRects();
        if (!rects || rects.length === 0) {
          setSelection(null);
          return;
        }

        const firstLineRect = rects[0];

        setSelection({
          text,
          paperTitle,
          paperUri,
          position: {
            x: firstLineRect.x + (firstLineRect.width / 2),
            y: Math.max(0, firstLineRect.y),
            width: firstLineRect.width,
            height: firstLineRect.height,
          }
        });
      } else {
        setSelection(null);
      }
    };

    const handlePointerDown = (e: PointerEvent) => {
        const target = e.target as HTMLElement;
        if (!target.closest('.selection-copy-button')) {
            isDragging = true;
            setSelection(null);
        }
    };

    const handlePointerUp = (e: PointerEvent) => {
        if (isDragging) {
            isDragging = false;
            setTimeout(handleSelectionChange, 50);
        }
    };

    document.addEventListener('selectionchange', handleSelectionChange, true);
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('pointerup', handlePointerUp, true);

    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange, true);
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('pointerup', handlePointerUp, true);
    };
  }, []);

  return selection;
};
```

### 2. The Global UI Trigger (`components/ui/SelectionNotesTrigger.tsx`)
This component is mounted once in `App.tsx` and stays alive globally.

**Key Technical Decisions:**
- **CSS-Independent Positioning:** It uses `fixed` positioning with coordinates provided by the hook.
- **Event Interception:** It uses `onMouseDown={e => e.preventDefault()}` on the button itself. This is vital because a click on a button usually causes the browser to lose focus on the text selection. Preventing the default behavior on `mousedown` keeps the selection highlight blue/active while the user clicks "Create Note".

```tsx
// components/ui/SelectionNotesTrigger.tsx (Full Implementation)
import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { useTextSelection } from '../../hooks/useTextSelection';
import { CreateNoteModal } from '../library/CreateNoteModal';
import { useDatabase } from '../../database/DatabaseContext';

export const SelectionNotesTrigger = () => {
  const selection = useTextSelection();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalData, setModalData] = useState({ text: '', uri: '', title: '' });
  const { savedPapers, saveNote } = useDatabase();

  const handleCreateNote = (e: React.MouseEvent) => {
    e.preventDefault(); 
    e.stopPropagation();

    if (selection) {
      setModalData({ 
        text: selection.text, 
        uri: selection.paperUri,
        title: selection.paperTitle 
      });
      setIsModalOpen(true);
      window.getSelection()?.removeAllRanges();
    }
  };

  return (
    <>
      {selection && !isModalOpen && selection.position && (
        <button
          className="selection-copy-button dark:bg-scholar-400"
          style={{ 
            top: `${selection.position.y}px`, 
            left: `${selection.position.x}px`,
          }}
          onClick={handleCreateNote}
          onMouseDown={(e) => e.preventDefault()}
        >
          <Plus size={14} />
          Create Note
        </button>
      )}

      <CreateNoteModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        savedPapers={savedPapers}
        onSave={async (note, paperMetadata) => {
          await saveNote(note, paperMetadata);
          setIsModalOpen(false);
        }}
        initialContent={modalData.text}
        initialPaperUri={modalData.uri}
      />
    </>
  );
};
```

### 3. Modal Integration (`components/library/CreateNoteModal.tsx`)
The modal was refactored to prioritize external data injection.

**Implementation Details:**
- **Prop Priorities:** Added `initialContent` and `initialPaperUri`.
- **Form Synchronizing:** Used a `useEffect` watching the `isOpen` state to force-reset the internal `content` and `selectedPaperUri` state variables when the modal is triggered.

```tsx
// props extension
interface CreateNoteModalProps {
  // ... existing props
  initialContent?: string;
  initialPaperUri?: string;
}

// initialization logic
useEffect(() => {
  if (isOpen) {
    setContent(initialContent);
    setSelectedPaperUri(initialPaperUri);
    setPageNumber(0);
    setIsSaving(false);
  }
}, [isOpen, initialContent, initialPaperUri]);
```

### 4. Component Injection Points
To make any content "Note-Aware", we simply wrap it in a container with standard data attributes.

**PapersTable.tsx (`ExpandedRowContent`):**
```tsx
<div className="..." data-paper-uri={paper.uri} data-paper-title={paper.title}>
    {/* Inside here, any agent-generated breakdown allows highlight-to-note */}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <AgentContentCard title="Abstract" content={paper.abstract} ... />
        {/* ... */}
    </div>
</div>
```

**PaperDetails.tsx:**
Similar injection was added to the detail view wrapper to ensure consistency when viewing a single paper.

### 5. Styling and Animation (`index.html`)
The button uses a standardized CSS class from the PDF viewer system to ensure visual harmony.

```css
.selection-copy-button {
  position: fixed;
  transform: translate(-50%, -125%); /* Centers button and offset above selection */
  display: flex;
  align-items: center;
  gap: 6px;
  background-color: #1a202c; /* gray-900 */
  color: white;
  font-size: 14px;
  font-weight: 500;
  padding: 6px 12px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 100;
  cursor: pointer;
  animation: subtleFadeIn 0.2s ease-out forwards;
}

@keyframes subtleFadeIn {
  from { opacity: 0; transform: translate(-50%, -100%); }
  to { opacity: 1; transform: translate(-50%, -125%); }
}
```

## Maintenance and Scaling
This architecture is designed for long-term growth:
1. **New Components:** To enable this feature in a new part of the app (e.g., chat history or manual imports), just wrap the text in a `div` with `data-paper-uri`.
2. **Mobile Support:** The use of `pointer events` instead of `mouse events` makes it touch-compatible for future mobile refinements.
3. **Performance:** The global hook is extremely lightweight; it uses native browser selection APIs which are highly optimized, and it only calculates coordinates when a change is detected.
