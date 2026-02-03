
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Globe, BookOpenText, Layout, Maximize2, X, Lock, Unlock, Library, FileText, FolderOpen } from 'lucide-react';
import { useUI, ColumnKey } from '../../contexts/UIContext';
import { useResearch } from '../../contexts/ResearchContext';

interface ThreeColumnLayoutProps {
  sourcesContent?: React.ReactNode;  // Renamed from leftContent - displays Sources panel
  middleContent?: React.ReactNode;
  libraryContent?: React.ReactNode;
  rightContent?: React.ReactNode;
}

export const ThreeColumnLayout: React.FC<ThreeColumnLayoutProps> = ({
  sourcesContent,
  middleContent,
  libraryContent,
  rightContent
}) => {
  const { columnVisibility, toggleColumn, setColumnVisibility, columnLocks, toggleLock } = useUI();
  const { setActiveSearchMode } = useResearch();

  const showLeft = columnVisibility.left;
  const showMiddle = columnVisibility.middle;
  const showLibrary = columnVisibility.library;
  const showRight = columnVisibility.right;

  const [leftWidth, setLeftWidth] = useState(20);
  const [middleWidth, setMiddleWidth] = useState(30);
  const [libraryWidth, setLibraryWidth] = useState(30);
  const [rightWidth, setRightWidth] = useState(45); // Will be calculated dynamically

  const containerRef = useRef<HTMLDivElement>(null);
  const isResizing = useRef<ColumnKey | null>(null);

  // Memoize active column count calculation
  const activeColumnCount = useMemo(() => 
    (showLeft ? 1 : 0) + (showMiddle ? 1 : 0) + (showLibrary ? 1 : 0) + (showRight ? 1 : 0), 
    [showLeft, showMiddle, showLibrary, showRight]
  );

  // Auto-adjust widths when column configuration changes
  useEffect(() => {
    // Scenario A: Sources + PDF (Left + Right) -> Left 20, Right 80
    if (showLeft && showRight && !showMiddle && !showLibrary) {
      setLeftWidth(20);
    }

    // Scenario B: Research + PDF (Middle + Right) -> Middle 60, Right 45
    if (showMiddle && showRight && !showLeft && !showLibrary) {
      setMiddleWidth(60);
      setRightWidth(45);
    }

    // Scenario C: Sources + Research + PDF -> Left 20, Middle 50, Right 30
    if (showLeft && showMiddle && showRight && !showLibrary) {
      setLeftWidth(20);
      setMiddleWidth(50);
    }
  }, [showLeft, showMiddle, showRight, showLibrary]);

  // Calculate optimal widths based on active columns - memoized for performance
  const getColumnWidth = useCallback((column: 'left' | 'middle' | 'library' | 'right') => {
    // If only one column is visible, enforce max width for left column
    if (activeColumnCount === 1) {
      if (column === 'left') {
        // Clamp to default 20% and max 30%
        const clamped = Math.min(30, Math.max(20, leftWidth));
        return `${clamped}%`;
      }
      return '100%';
    }

    // Left column (Sources): Use stored width with 20% default, 30% max
    if (column === 'left') {
      if (!showLeft) return '0%';
      const clampedWidth = Math.min(30, Math.max(15, leftWidth));
      return `${clampedWidth}%`;
    }

    // Library column
    if (column === 'library') {
      return showLibrary ? `${libraryWidth}%` : '0%';
    }

    // Calculate available space for Middle and Right
    const leftSpace = showLeft ? Math.min(30, Math.max(15, leftWidth)) : 0;
    const librarySpace = showLibrary ? libraryWidth : 0;
    const remainingSpace = 100 - leftSpace - librarySpace;

    // Middle column
    if (column === 'middle') {
      if (!showMiddle) return '0%';

      if (showRight) {
        // If Right is open, Middle uses its stored width
        // Ensure Middle never claims space that would reduce Right below 40%
        const leftSpace = showLeft ? Math.min(30, Math.max(15, leftWidth)) : 0;
        const librarySpace = showLibrary ? libraryWidth : 0;
        const remainingSpace = 100 - leftSpace - librarySpace;
        const maxMiddle = Math.max(10, remainingSpace - 45);
        const clampedMiddle = Math.min(middleWidth, maxMiddle);
        return `${clampedMiddle}%`;
      }

      // If Right is NOT open, Middle takes all remaining space
      return `${remainingSpace}%`;
    }

    // Right column
    if (column === 'right') {
      if (!showRight) return '0%';

      if (showMiddle) {
        // If Middle is open, Right takes whatever is left after Middle
        const middleSpace = middleWidth;
        const desired = remainingSpace - middleSpace;
        // Enforce minimum 45% for Right, and cap at 80%
        const clamped = Math.min(80, Math.max(45, desired));
        return `${clamped}%`;
      }

      // If Middle is NOT open (e.g. Sources + PDF), Right takes all remaining space
      // Ensure Right has at least 45% when it's the only content with left/library
      const clampedFull = Math.max(45, remainingSpace);
      return `${clampedFull}%`;
    }

    return 'auto';
  }, [activeColumnCount, showLeft, showMiddle, showLibrary, showRight, leftWidth, middleWidth, libraryWidth]);

  // Mouse move handler for resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current || !isResizing.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const containerWidth = containerRect.width;
      const mouseX = e.clientX - containerRect.left;
      const mousePercent = (mouseX / containerWidth) * 100;

      if (isResizing.current === 'left' && showLeft) {
        setLeftWidth(Math.min(Math.max(mousePercent, 15), 30));
      } else if (isResizing.current === 'middle') {
        const leftOffset = showLeft ? leftWidth : 0;
          // If Right is visible, ensure Middle doesn't grow so large that Right falls below 40%
          if (showRight) {
            const leftOffsetLocal = showLeft ? leftWidth : 0;
            const libraryOffset = showLibrary ? libraryWidth : 0;
            const remainingSpaceLocal = 100 - leftOffsetLocal - libraryOffset;
            const maxMiddleLocal = Math.max(10, remainingSpaceLocal - 45);
            setMiddleWidth(Math.min(Math.max(mousePercent - leftOffset, 10), maxMiddleLocal));
          } else {
            setMiddleWidth(Math.min(Math.max(mousePercent - leftOffset, 10), 80));
          }
      } else if (isResizing.current === 'library') {
        const leftOffset = showLeft ? leftWidth : 0;
        const middleOffset = showMiddle ? middleWidth : 0;
        setLibraryWidth(Math.min(Math.max(mousePercent - leftOffset - middleOffset, 10), 80));
      } else if (isResizing.current === 'right' && showRight) {
        const leftOffset = showLeft ? leftWidth : 0;
        const middleOffset = showMiddle ? middleWidth : 0;
        const libraryOffset = showLibrary ? libraryWidth : 0;
            // Right must not be smaller than 45% and not larger than 80%
            setRightWidth(Math.min(Math.max(mousePercent - leftOffset - middleOffset - libraryOffset, 45), 80));
      }
    };

    const handleMouseUp = () => {
      isResizing.current = null;
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [showLeft, showMiddle, showLibrary, showRight, leftWidth, middleWidth, libraryWidth, rightWidth]);

  const startResize = useCallback((col: ColumnKey) => {
    isResizing.current = col;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const handleExpand = useCallback((col: ColumnKey) => {
    setColumnVisibility({
      left: col === 'left',
      middle: col === 'middle',
      library: col === 'library',
      right: col === 'right'
    });
  }, [setColumnVisibility]);

  const handleTitleClick = useCallback((colKey: ColumnKey) => {
    if (colKey === 'left') setActiveSearchMode('web');
    if (colKey === 'middle') setActiveSearchMode('deep');
    if (colKey === 'right') setActiveSearchMode('upload');
  }, [setActiveSearchMode]);

  const RenderHeader = ({
    title,
    icon: Icon,
    colKey,
    onClose,
    isLocked
  }: {
    title: string,
    icon: any,
    colKey: ColumnKey,
    onClose: () => void,
    isLocked: boolean
  }) => (
    <div className="flex-none px-4 py-3 bg-cream dark:border-gray-700 dark:bg-gray-800/50 flex justify-between items-center border-b border-gray-100 dark:border-gray-700/50">
      <span
        onClick={() => handleTitleClick(colKey)}
        className="text-sm font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wide flex items-center gap-3 cursor-pointer hover:text-scholar-600 dark:hover:text-scholar-400 transition-colors select-none"
      >
        <Icon size={20} className="flex-shrink-0" /> {title}
      </span>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => toggleLock(colKey)}
          title={isLocked ? "Unlock column (it will close automatically when other columns open)" : "Lock column (it will stay open even if other columns are opened)"}
          className={`transition-all p-1.5 rounded-md ${isLocked ? 'text-scholar-600 dark:text-scholar-400 bg-scholar-50 dark:bg-scholar-900/30' : 'text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400'}`}
        >
          {isLocked ? <Lock size={16} /> : <Unlock size={16} />}
        </button>

        {activeColumnCount > 1 && (
          <button
            onClick={() => handleExpand(colKey)}
            className="text-gray-400 hover:text-scholar-600 dark:hover:text-scholar-400 transition-all p-1.5 rounded-md hover:bg-scholar-50 dark:hover:bg-scholar-900/30"
          >
            <Maximize2 size={18} />
          </button>
        )}

        <button
          onClick={onClose}
          className="text-gray-400 hover:text-scholar-600 dark:hover:text-scholar-400 transition-colors p-1.5 rounded-md hover:bg-scholar-50 dark:hover:bg-scholar-900/30"
        >
          <X size={20} />
        </button>
      </div>
    </div>
  );

  const ResizeHandle = React.memo(({ onMouseDown }: { onMouseDown: () => void }) => (
    <div
      className="w-2 h-full cursor-col-resize flex-none flex items-center justify-center group hover:bg-black/5 dark:hover:bg-white/5 transition-colors z-20 rounded-lg"
      onMouseDown={onMouseDown}
    >
      <div className="w-1 h-8 bg-gray-200 dark:bg-gray-700 group-hover:bg-scholar-400 rounded-full transition-colors"></div>
    </div>
  ));

  return (
    <div className="flex-1 bg-cream dark:bg-dark-bg p-1 h-full overflow-hidden transition-colors duration-300">
      <div
        ref={containerRef}
        className="flex h-full w-full"
      >
        {showLeft && (
          <div
            style={{ width: getColumnWidth('left') }}
            className={`flex flex-col h-full bg-cream dark:bg-dark-card rounded-xl border dark:border-gray-700 transition-[width] duration-75 ease-out shadow-sm min-w-[320px] relative`}
          >
            <RenderHeader title="Sources" icon={FolderOpen} colKey="left" onClose={() => toggleColumn('left')} isLocked={columnLocks.left} />
            <div className="flex-1 overflow-y-auto custom-scrollbar">{sourcesContent}</div>
          </div>
        )}

        {showLeft && (showMiddle || showLibrary || showRight) && <ResizeHandle onMouseDown={() => startResize('left')} />}

        {/* Research */}
        {showMiddle && (
          <div
            style={{ width: getColumnWidth('middle') }}
            className={`flex flex-col h-full bg-cream dark:bg-dark-card rounded-xl border dark:border-gray-700 overflow-hidden transition-[width] duration-75 ease-out shadow-sm min-w-[320px]`}
          >
            <RenderHeader title="Research" icon={BookOpenText} colKey="middle" onClose={() => toggleColumn('middle')} isLocked={columnLocks.middle} />
            <div className="flex-1 overflow-y-auto custom-scrollbar relative">{middleContent}</div>
          </div>
        )}

        {showMiddle && (showLibrary || showRight) && <ResizeHandle onMouseDown={() => startResize('middle')} />}

        {/* Library / Notes Manager */}
        {showLibrary && (
          <div
            style={{ width: getColumnWidth('library') }}
            className={`flex flex-col h-full bg-cream dark:bg-dark-card rounded-xl border dark:border-gray-700 overflow-hidden transition-[width] duration-75 ease-out shadow-sm min-w-[320px]`}
          >
            <RenderHeader title="Research Library" icon={Library} colKey="library" onClose={() => toggleColumn('library')} isLocked={columnLocks.library} />
            <div className="flex-1 overflow-hidden relative">{libraryContent}</div>
          </div>
        )}

        {showLibrary && showRight && <ResizeHandle onMouseDown={() => startResize('library')} />}

        {/* Paper View */}
        {showRight && (
            <div
              style={{ width: getColumnWidth('right'), minWidth: '45%' }}
              className={`flex flex-col h-full bg-cream dark:bg-dark-card border rounded-xl dark:border-gray-700 overflow-hidden shadow-sm transition-[width] duration-75 ease-out`}
            >
            <RenderHeader title="Paper View" icon={FileText} colKey="right" onClose={() => toggleColumn('right')} isLocked={columnLocks.right} />
            <div className="flex-1 overflow-y-auto custom-scrollbar relative">{rightContent}</div>
          </div>
        )}
      </div>
    </div>
  );
};
