
import React, { useState, useRef, useEffect } from 'react';
import { PanelLeft, Columns, PanelRight, Sun, Moon, Menu, FolderOpen, BookOpenText, FileText, Check } from 'lucide-react';
import { useUI, ColumnKey } from '../../contexts/UIContext';
import { useResearch } from '../../contexts/ResearchContext';

const Tooltip = ({ text, icon: Icon }: { text: string, icon: any }) => (
  <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 px-2.5 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none flex items-center gap-1.5 z-50 shadow-xl">
    <Icon size={12} className="text-scholar-200" />
    {text}
    {/* Little arrow */}
    <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 rotate-45"></div>
  </div>
);

const DesktopButton = ({ col, icon: Icon, label, tooltipIcon, isActive, onToggle }: {
  col: ColumnKey,
  icon: any,
  label: string,
  tooltipIcon: any,
  isActive: boolean,
  onToggle: (col: ColumnKey) => void
}) => {
  return (
    <button
      onClick={() => onToggle(col)}
      className={`group relative p-2 md:p-2.5 rounded-lg transition-all duration-200 ${isActive
        ? 'bg-white dark:bg-gray-700 shadow-sm text-scholar-600 dark:text-scholar-400'
        : 'text-gray-400 hover:text-gray-600 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
        }`}
    >
      <Icon size={24} />
      <Tooltip text={label} icon={tooltipIcon} />
    </button>
  );
};

interface LayoutControlsProps {
  inSidebar?: boolean;
}

export const LayoutControls: React.FC<LayoutControlsProps> = ({ inSidebar = false }) => {
  const {
    columnVisibility,
    toggleColumn,
    toggleDarkMode,
    darkMode,
    isLibraryOpen,
    setLibraryOpen,
    setHeaderVisible
  } = useUI();
  const { setActiveSearchMode } = useResearch();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close mobile menu on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMobileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggle = (col: ColumnKey) => {
    if (isLibraryOpen) {
      setLibraryOpen(false);
    }

    // Replicates the logic from App.tsx: Switch mode if opening a closed column
    if (!columnVisibility[col]) {
      if (col === 'left') setActiveSearchMode('web');
      if (col === 'middle') setActiveSearchMode('deep');
      if (col === 'right') setActiveSearchMode('upload');
    }
    toggleColumn(col);
    setIsMobileMenuOpen(false); // Close menu if open
  };

  return (
    <div className="relative z-50" ref={menuRef}>
      {/* Desktop View: Row of buttons */}
      <div className="hidden md:flex items-center gap-2">
        <DesktopButton col="left" icon={FolderOpen} label="Sources" tooltipIcon={FolderOpen} isActive={columnVisibility.left} onToggle={handleToggle} />
        <DesktopButton col="middle" icon={BookOpenText} label="Deep Research" tooltipIcon={BookOpenText} isActive={columnVisibility.middle} onToggle={handleToggle} />
        <DesktopButton col="right" icon={FileText} label="Paper View" tooltipIcon={FileText} isActive={columnVisibility.right} onToggle={handleToggle} />
      </div>

      {/* Mobile View: Burger Menu */}
      <div className="md:hidden">
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className={`p-2.5 rounded-xl transition-all ${isMobileMenuOpen
            ? 'bg-white dark:bg-gray-800 border border-scholar-200 dark:border-scholar-900 text-scholar-600 shadow-sm'
            : inSidebar
              ? 'bg-gray-50/80 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 shadow-sm'
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100/50 dark:hover:bg-gray-800/50'
            }`}
        >
          <Menu size={24} />
        </button>

        {isMobileMenuOpen && (
          <div className={`absolute ${inSidebar ? 'left-0' : 'right-0'} top-full mt-2 w-52 bg-white dark:bg-dark-card rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 py-1 overflow-hidden animate-fade-in ${inSidebar ? 'origin-top-left' : 'origin-top-right'} ring-1 ring-black/5`}>
            <div className="px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 dark:border-gray-800">
              Layout Options
            </div>

            <button onClick={() => handleToggle('left')} className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <FolderOpen size={18} className={columnVisibility.left ? "text-scholar-600 dark:text-scholar-400" : "text-gray-400"} />
              <span className={`text-sm ${columnVisibility.left ? "font-semibold text-scholar-600 dark:text-scholar-400" : "text-gray-600 dark:text-white"}`}>Sources</span>
              {columnVisibility.left && <Check size={16} className="ml-auto text-scholar-600 dark:text-scholar-400" />}
            </button>

            <button onClick={() => handleToggle('middle')} className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <BookOpenText size={18} className={columnVisibility.middle ? "text-scholar-600 dark:text-scholar-400" : "text-gray-400"} />
              <span className={`text-sm ${columnVisibility.middle ? "font-semibold text-scholar-600 dark:text-scholar-400" : "text-gray-600 dark:text-white"}`}>Deep Research</span>
              {columnVisibility.middle && <Check size={16} className="ml-auto text-scholar-600 dark:text-scholar-400" />}
            </button>

            <button onClick={() => handleToggle('right')} className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <FileText size={18} className={columnVisibility.right ? "text-scholar-600 dark:text-scholar-400" : "text-gray-400"} />
              <span className={`text-sm ${columnVisibility.right ? "font-semibold text-scholar-600 dark:text-scholar-400" : "text-gray-600 dark:text-white"}`}>Paper View</span>
              {columnVisibility.right && <Check size={16} className="ml-auto text-scholar-600 dark:text-scholar-400" />}
            </button>

            <div className="h-px bg-gray-100 dark:bg-gray-700 mx-4 my-1"></div>

            <button onClick={() => { toggleDarkMode(); setIsMobileMenuOpen(false); }} className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              {darkMode ? <Sun size={18} className="text-gray-500 dark:text-gray-400" /> : <Moon size={18} className="text-gray-500" />}
              <span className="text-sm font-medium text-gray-600 dark:text-white">{darkMode ? 'Switch to Light' : 'Switch to Dark'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
