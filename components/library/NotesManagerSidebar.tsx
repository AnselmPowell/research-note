
import React, { useState, useRef, useEffect } from 'react';
import { 
  Clock, 
  Flag, 
  Star, 
  Search, 
  PanelLeftClose,
  PanelLeftOpen,
  LibraryBig,
  LayoutList,
  ChevronRight,
  X,
  FileText
} from 'lucide-react';
import { useDatabase } from '../../database/DatabaseContext';
import { useUI, LibraryView } from '../../contexts/UIContext';
import { NotesManager } from './NotesManager';

// --- SUBCOMPONENTS ---

const NavItem: React.FC<{ 
  icon: any, 
  label: string, 
  count: number, 
  isActive: boolean, 
  onClick: () => void,
  iconColor?: string
}> = ({ icon: Icon, label, count, isActive, onClick, iconColor = "text-gray-500" }) => (
  <div
    className={`
      flex items-center py-3 px-4 cursor-pointer transition-all duration-200 text-base rounded-xl mx-2 group
      ${isActive ? 'bg-gray-100/60 dark:bg-gray-800' : 'hover:bg-gray-50 dark:hover:bg-gray-800/40'}
    `}
    onClick={onClick}
  >
    <span className={`mr-4 flex-shrink-0 ${isActive ? 'text-scholar-600' : iconColor}`}>
      <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
    </span>
    <span className={`flex-1 font-medium truncate ${isActive ? 'text-gray-900 font-bold dark:text-white' : 'text-gray-600 dark:text-gray-400'}`}>
      {label}
    </span>
    <span className={`
      text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center transition-colors
      ${isActive ? 'bg-scholar-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500'}
    `}>
      {count}
    </span>
  </div>
);

// --- REUSABLE SIDEBAR NAV COMPONENT ---

export const SidebarNav: React.FC<{
  onClose?: () => void;
}> = ({ onClose }) => {
  const { savedNotes, savedPapers } = useDatabase();
  const { libraryActiveView, setLibraryActiveView, openColumn } = useUI();
  const [searchQuery, setSearchQuery] = useState('');

  const handleSelect = (view: LibraryView) => {
    setLibraryActiveView(view);
    openColumn('library');
    if (onClose) onClose();
  };

  return (
    <div className="w-full flex flex-col bg-white dark:bg-dark-card h-full">
      <div className="px-4 pt-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl px-4 py-2.5 shadow-sm">
            <Search size={18} className="text-gray-400 mr-2" />
            <input 
              className="w-full bg-transparent text-sm outline-none text-gray-900 dark:text-white"
              placeholder="Filter library..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          {onClose && (
            <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-400 hover:text-gray-600 transition-colors">
              <PanelLeftClose size={20} />
            </button>
          )}
        </div>
        
      </div>
      
      <div className="flex-1 overflow-y-auto custom-scrollbar px-1">
        <div className="mb-1">
          <NavItem icon={LayoutList} label="All Notes" count={savedNotes.length} isActive={libraryActiveView === 'all'} onClick={() => handleSelect('all')} iconColor="text-gray-700" />
          <NavItem icon={FileText} label="Papers" count={savedPapers.length} isActive={libraryActiveView === 'papers'} onClick={() => handleSelect('papers')} iconColor="text-scholar-500" />
          
          <div className="h-px bg-gray-100 dark:bg-gray-800 mx-6 my-2 opacity-50"></div>
          
          <NavItem icon={Clock} label="Recently Added" count={savedNotes.filter(n => (new Date().getTime() - new Date(n.created_at || 0).getTime()) < 86400000).length} isActive={libraryActiveView === 'recent'} onClick={() => handleSelect('recent')} iconColor="text-gray-600" />
          <NavItem icon={Flag} label="Flagged" count={savedNotes.filter(n => n.is_flagged).length} isActive={libraryActiveView === 'flagged'} onClick={() => handleSelect('flagged')} iconColor="text-red-700" />
          <NavItem icon={Star} label="Favorites" count={savedNotes.filter(n => n.is_starred).length} isActive={libraryActiveView === 'starred'} onClick={() => handleSelect('starred')} iconColor="text-orange-500" />
        </div>

        <div className="mt-4 px-4">
           <button 
             onClick={() => { openColumn('library'); if (onClose) onClose(); }}
             className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors shadow-sm"
           >
              <div className="flex items-center gap-3">
                 <div className="w-8 h-8 rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 flex items-center justify-center">
                    <LayoutList size={18} />
                 </div>
                 <div className="text-left">
                    <div className="font-bold text-sm">Dashboard Mode</div>
                    <div className="text-[10px] opacity-70">Focus on Knowledge Base</div>
                 </div>
              </div>
              <ChevronRight size={16} />
           </button>
        </div>
      </div>
    </div>
  );
};

// --- LIBRARY DASHBOARD (REMOVED - INTEGRATED INTO THREECOLUMN) ---

// --- NOTES MANAGER SIDEBAR (STANDALONE DRAWER) ---

export const NotesManagerSidebar: React.FC = () => {
  const { isLibraryOpen, setLibraryOpen } = useUI();
  const sidebarRef = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<number | null>(null);

  // Constants for refined animations
  const TRANSITION_DURATION = "duration-900";
  const TRANSITION_EASING = "ease-[cubic-bezier(0.16,1,0.3,1)]";

  // Click-outside logic: closes the sidebar when user clicks anywhere else
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isLibraryOpen && sidebarRef.current && !sidebarRef.current.contains(event.target as Node)) {
        // If the click is on the trigger button, don't double toggle
        const isButton = (event.target as HTMLElement).closest('button[aria-label="Open Research Library"]');
        if (!isButton) {
          setLibraryOpen(false);
        }
      }
    };

    if (isLibraryOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isLibraryOpen, setLibraryOpen]);

  // Hover timer logic for intuitive opening
  const handleMouseEnter = () => {
    if (!isLibraryOpen) {
      hoverTimer.current = window.setTimeout(() => {
        setLibraryOpen(true);
      }, 700);
    }
  };

  const handleMouseLeave = () => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  };

  return (
    <>
      {/* 1. Hover Detection Strip (Left Edge) */}
      {!isLibraryOpen && (
        <div 
          className="fixed left-0 top-0 h-full w-6 z-[60] cursor-pointer"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        />
      )}

      {/* 2. Persistent Side Toggle Button */}
      {!isLibraryOpen && (
        <button
          onClick={() => setLibraryOpen(true)}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          className={`fixed  -left-14 top-[45%] z-[62] flex items-center pl-14 pr-4 py-6 bg-white dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-700 rounded-3xl text-gray-400 hover:text-scholar-600 hover:-left-12 shadow-xl transition-all ${TRANSITION_DURATION} ${TRANSITION_EASING} group`}
          aria-label="Open Research Library"
        >
          <PanelLeftOpen size={26} className="group-hover:scale-110 transition-transform duration-500" />
        </button>
      )}

      {/* 
        NO OVERLAY BACKDROP 
        We removed the blocking overlay so the user can interact with the app while the sidebar glides open.
      */}
      
      {/* 3. Sidebar Drawer - gliding animation */}
      <div 
        ref={sidebarRef}
        className={`fixed left-0 top-0 bottom-0 w-85 z-[70] bg-white dark:bg-dark-card border-r-2 border-gray-200 dark:border-gray-800 flex flex-col shadow-2xl transition-transform ${TRANSITION_DURATION} ${TRANSITION_EASING} font-sans overflow-hidden transform ${
          isLibraryOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <SidebarNav onClose={() => setLibraryOpen(false)} />
      </div>
    </>
  );
};
