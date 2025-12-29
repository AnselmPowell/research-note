
import React, { useState, useRef, useEffect } from 'react';
import { Globe, BookOpenText, Layout, Maximize2, X, Lock, Unlock, Library, FileText } from 'lucide-react';
import { useUI, ColumnKey } from '../../contexts/UIContext';
import { useResearch } from '../../contexts/ResearchContext';

interface ThreeColumnLayoutProps {
  leftContent?: React.ReactNode;
  middleContent?: React.ReactNode;
  libraryContent?: React.ReactNode;
  rightContent?: React.ReactNode;
}

export const ThreeColumnLayout: React.FC<ThreeColumnLayoutProps> = ({
  leftContent,
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

  const [leftWidth, setLeftWidth] = useState(25);
  const [middleWidth, setMiddleWidth] = useState(25);
  const [libraryWidth, setLibraryWidth] = useState(25);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const isResizing = useRef<ColumnKey | null>(null);

  const activeColumnCount = (showLeft ? 1 : 0) + (showMiddle ? 1 : 0) + (showLibrary ? 1 : 0) + (showRight ? 1 : 0);

  // Mouse move handler for resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current || !isResizing.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const containerWidth = containerRect.width;
      const mouseX = e.clientX - containerRect.left;
      const mousePercent = (mouseX / containerWidth) * 100;

      if (isResizing.current === 'left' && showLeft) {
        setLeftWidth(Math.min(Math.max(mousePercent, 10), 80));
      } else if (isResizing.current === 'middle') {
        const leftOffset = showLeft ? leftWidth : 0;
        setMiddleWidth(Math.min(Math.max(mousePercent - leftOffset, 10), 80));
      } else if (isResizing.current === 'library') {
        const leftOffset = showLeft ? leftWidth : 0;
        const middleOffset = showMiddle ? middleWidth : 0;
        setLibraryWidth(Math.min(Math.max(mousePercent - leftOffset - middleOffset, 10), 80));
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
  }, [showLeft, showMiddle, showLibrary, showRight, leftWidth, middleWidth, libraryWidth]);

  const startResize = (col: ColumnKey) => {
    isResizing.current = col;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const handleExpand = (col: ColumnKey) => {
    setColumnVisibility({
      left: col === 'left',
      middle: col === 'middle',
      library: col === 'library',
      right: col === 'right'
    });
  };

  const handleTitleClick = (colKey: ColumnKey) => {
    if (colKey === 'left') setActiveSearchMode('web');
    if (colKey === 'middle') setActiveSearchMode('deep');
    if (colKey === 'right') setActiveSearchMode('upload');
  };

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

  const ResizeHandle = ({ onMouseDown }: { onMouseDown: () => void }) => (
    <div 
      className="w-2 h-full cursor-col-resize flex-none flex items-center justify-center group hover:bg-black/5 dark:hover:bg-white/5 transition-colors z-20 rounded-lg" 
      onMouseDown={onMouseDown}
    >
     <div className="w-1 h-8 bg-gray-200 dark:bg-gray-700 group-hover:bg-scholar-400 rounded-full transition-colors"></div>
    </div>
  );

  return (
    <div className="flex-1 bg-cream dark:bg-dark-bg p-1 h-full overflow-hidden transition-colors duration-300">
      <div 
        ref={containerRef} 
        className="flex h-full w-full"
      >
        {/* Web Search */}
        {showLeft && (
          <div 
            style={{ width: (showMiddle || showLibrary || showRight) ? `${leftWidth}%` : '100%' }} 
            className={`flex flex-col h-full bg-cream dark:bg-dark-card rounded-xl border dark:border-gray-700 overflow-hidden transition-[width] duration-75 ease-out shadow-sm min-w-[320px]`}
          >
            <RenderHeader title="Web Search" icon={Globe} colKey="left" onClose={() => toggleColumn('left')} isLocked={columnLocks.left} />
            <div className="flex-1 overflow-y-auto custom-scrollbar p-3">{leftContent}</div>
          </div>
        )}

        {showLeft && (showMiddle || showLibrary || showRight) && <ResizeHandle onMouseDown={() => startResize('left')} />}

        {/* Deep Research */}
        {showMiddle && (
          <div 
            style={{ 
              width: (!showLeft && !showLibrary && !showRight) ? '100%' : 
                     (showLibrary || showRight) ? `${middleWidth}%` : 
                     `calc(100% - ${showLeft ? leftWidth : 0}%)` 
            }} 
            className={`flex flex-col h-full bg-cream dark:bg-dark-card rounded-xl border dark:border-gray-700 overflow-hidden transition-[width] duration-75 ease-out shadow-sm min-w-[320px]`}
          >
            <RenderHeader title="Deep Research" icon={BookOpenText} colKey="middle" onClose={() => toggleColumn('middle')} isLocked={columnLocks.middle} />
            <div className="flex-1 overflow-y-auto custom-scrollbar relative">{middleContent}</div>
          </div>
        )}

        {showMiddle && (showLibrary || showRight) && <ResizeHandle onMouseDown={() => startResize('middle')} />}

        {/* Library / Notes Manager */}
        {showLibrary && (
          <div 
            style={{ 
              width: (!showLeft && !showMiddle && !showRight) ? '100%' : 
                     showRight ? `${libraryWidth}%` : 
                     `calc(100% - ${(showLeft ? leftWidth : 0) + (showMiddle ? middleWidth : 0)}%)` 
            }} 
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
             className={`flex-1 flex flex-col h-full bg-cream dark:bg-dark-card border rounded-xl dark:border-gray-700 overflow-hidden shadow-sm min-w-[320px]`}
           >
            <RenderHeader title="Paper View" icon={FileText} colKey="right" onClose={() => toggleColumn('right')} isLocked={columnLocks.right} />
            <div className="flex-1 overflow-y-auto custom-scrollbar relative">{rightContent}</div>
          </div>
        )}
      </div>
    </div>
  );
};
