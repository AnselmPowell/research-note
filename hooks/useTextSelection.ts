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
      // Don't show while actively dragging
      if (isDragging) return;

      const activeSelection = window.getSelection();

      // Ensure valid selection
      if (!activeSelection || activeSelection.isCollapsed) {
        setSelection(null);
        return;
      }

      const text = activeSelection.toString().trim();
      if (text.length < 5) {
        setSelection(null); // Ignore tiny accidental selections
        return;
      }

      // Find nearest DOM node with our paper metadata
      const anchorNode = activeSelection.anchorNode;
      if (!anchorNode) return;

      const elementNode = anchorNode.nodeType === 3 ? anchorNode.parentElement : anchorNode as HTMLElement;
      if (!elementNode) return;

      const containerWithData = elementNode.closest('[data-paper-uri]');

      if (containerWithData) {
        const paperUri = containerWithData.getAttribute('data-paper-uri') || '';
        const paperTitle = containerWithData.getAttribute('data-paper-title') || '';

        // Safely extract coordinates ensuring we target the top-most line if multiple lines are selected
        const range = activeSelection.getRangeAt(0);
        const rects = range.getClientRects();
        if (!rects || rects.length === 0) {
          setSelection(null);
          return;
        }

        // Use the first line's rect for precise positioning so it doesn't float oddly on multi-line highlights
        const firstLineRect = rects[0];

        setSelection({
          text,
          paperTitle,
          paperUri,
          position: {
            // Place exactly in the horizontal center of the first selected line
            x: firstLineRect.x + (firstLineRect.width / 2),
            // Place exactly at the top edge of the first selected line
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
        // Only trigger dragging if not clicking the actual trigger button
        const target = e.target as HTMLElement;
        if (!target.closest('.selection-copy-button')) {
            isDragging = true;
            // Clear current selection on down click immediately
            setSelection(null);
        }
    };

    const handlePointerUp = (e: PointerEvent) => {
        if (isDragging) {
            isDragging = false;
            // Delay slightly to let the native selection finish registering
            setTimeout(handleSelectionChange, 50);
        }
    };

    // Use capture phase (true) to ensure AG-Grid or other components don't stop propagation and hide these events
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
