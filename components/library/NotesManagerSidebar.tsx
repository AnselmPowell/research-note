
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
  FileText,
  User,
  LogOut,
  Settings,
  Sun,
  Moon
} from 'lucide-react';
import { useDatabase } from '../../database/DatabaseContext';
import { useUI, LibraryView } from '../../contexts/UIContext';
import { useAuth } from '../../contexts/AuthContext';
import { dataMigrationService } from '../../utils/dataMigrationService';
import { NotesManager } from './NotesManager';
import { LayoutControls } from '../layout/LayoutControls';

// --- SUBCOMPONENTS ---

const ResearchNoteLogo: React.FC<{ className?: string }> = ({ className = "" }) => (
  <div className={`font-bold tracking-tight ${className}`}>
    <span className="text-gray-900 dark:text-gray-100">Research</span>
    <span className="text-scholar-600 dark:text-scholar-400">Notes</span>
  </div>
);

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

// --- SIDEBAR USER PROFILE COMPONENT ---

const SidebarUserProfile: React.FC<{
  onShowAuthModal?: () => void;
  resetCallbacks?: (() => void)[];
}> = ({ onShowAuthModal, resetCallbacks = [] }) => {
  const { isAuthenticated, user, signOut } = useAuth();
  const { toggleDarkMode, darkMode, isLibraryOpen } = useUI();
  const [isOpen, setIsOpen] = useState(false);

  // Auto-close popup when sidebar opens/closes
  useEffect(() => {
    setIsOpen(false);
  }, [isLibraryOpen]);

  // Generate user initials from name
  const getUserInitials = (name: string): string => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();
  };

  const handleLogout = () => {
    // Call signOut with all reset functions to clear app state
    signOut(resetCallbacks);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-3 px-3 md:px-4 py-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      >
        <div className="w-10 h-10 rounded-full bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-800 flex items-center justify-center font-semibold text-sm">
          {isAuthenticated ? (
            getUserInitials(user?.name || 'U')
          ) : (
            <User size={18} />
          )}
        </div>
        <div className="flex-1 text-left">
          {isAuthenticated ? (
            <>
              <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                {user?.name}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Pro plan</div>
            </>
          ) : (
            <>
              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">Anonymous</div>
              <div className="text-xs text-scholar-600 dark:text-scholar-400">Tap to sign in</div>
            </>
          )}
        </div>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute left-0 right-0 bottom-full mb-2 mx-2 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 py-2 z-50">
            {/* User info section */}
            {isAuthenticated ? (
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{user?.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{user?.email}</p>
              </div>
            ) : (
              <button
                onClick={() => {
                  if (onShowAuthModal) onShowAuthModal();
                  setIsOpen(false);
                }}
                className="w-full text-left px-4 py-3 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <p className="text-sm font-medium text-scholar-600 hover:text-scholar-700 dark:text-scholar-400">Sign In</p>
                {dataMigrationService.hasLocalDataToMigrate() && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">Save your research data</p>
                )}
              </button>
            )}

            {/* Settings */}
            <button className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <Settings size={16} className="text-gray-500 dark:text-gray-400" />
              <span className="text-sm text-gray-600 dark:text-white">Settings</span>
              <span className="text-xs text-gray-400 ml-auto">Ctrl+,</span>
            </button>

            {/* Dark Mode Toggle */}
            <button
              onClick={() => { toggleDarkMode(); }}
              className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              {darkMode ? <Sun size={16} className="text-gray-500 dark:text-gray-400" /> : <Moon size={16} className="text-gray-500" />}
              <span className="text-sm text-gray-600 dark:text-white">
                {darkMode ? 'Light mode' : 'Dark mode'}
              </span>
            </button>

            <div className="h-px bg-gray-100 dark:bg-gray-700 my-2"></div>

            {/* Upgrade plan */}
            <button className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500 dark:text-gray-400">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span className="text-sm text-gray-600 dark:text-white">Upgrade plan</span>
            </button>

            {/* Learn more */}
            <button className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500 dark:text-gray-400">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span className="text-sm text-gray-600 dark:text-white">Learn more</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400 ml-auto">
                <polyline points="9,18 15,12 9,6" />
              </svg>
            </button>

            <div className="h-px bg-gray-100 dark:bg-gray-700 my-2"></div>

            {/* Sign out for authenticated users */}
            {isAuthenticated && (
              <button
                onClick={handleLogout}
                className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-red-600"
              >
                <LogOut size={16} />
                <span className="text-sm">Log out</span>
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
};

// --- REUSABLE SIDEBAR NAV COMPONENT ---

export const SidebarNav: React.FC<{
  onClose?: () => void;
  onShowAuthModal?: () => void;
  resetCallbacks?: (() => void)[];
}> = ({ onClose, onShowAuthModal, resetCallbacks }) => {
  const { savedNotes, savedPapers } = useDatabase();
  const { libraryActiveView, setLibraryActiveView, openColumn, columnVisibility, setHeaderVisible } = useUI();

  const handleSelect = (view: LibraryView) => {
    setLibraryActiveView(view);
    openColumn('library');
    setHeaderVisible(false);
    if (onClose) onClose();
  };

  return (
    <div className="w-full flex flex-col bg-white dark:bg-dark-card h-full">
      {/* Header: Logo and Close Button */}
      <div className="px-3 md:px-4 pt-6 pb-4">
        <div className="flex items-center justify-between">
          <ResearchNoteLogo className="text-2xl" />
          {onClose && (
            <button onClick={onClose} className="p-2 pt-3 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-400 hover:text-gray-600 transition-colors">
              <PanelLeftClose size={26} />
            </button>
          )}
        </div>
      </div>

      {/* Controls Section */}
      <div className="px-3 md:px-4 pt-0 ml-0.5">
        <div className="flex items-center justify-between mb-6">
          <div className="flex-1">
            <LayoutControls inSidebar={true} />
          </div>
        </div>

      </div>

      <div className="flex-1 -mt-4 overflow-y-auto custom-scrollbar px-0.5 md:px-1">
        <div className="mb-1">
          <NavItem icon={LayoutList} label="All Notes" count={savedNotes.length} isActive={columnVisibility.library && libraryActiveView === 'all'} onClick={() => handleSelect('all')} iconColor="text-gray-700" />
          <NavItem icon={FileText} label="Papers" count={savedPapers.length} isActive={columnVisibility.library && libraryActiveView === 'papers'} onClick={() => handleSelect('papers')} iconColor="text-scholar-500" />

          <div className="h-px bg-gray-100 dark:bg-gray-800 mx-6 my-2 opacity-50"></div>

          <NavItem icon={Clock} label="Recently Added" count={savedNotes.filter(n => (new Date().getTime() - new Date(n.created_at || 0).getTime()) < 86400000).length} isActive={columnVisibility.library && libraryActiveView === 'recent'} onClick={() => handleSelect('recent')} iconColor="text-gray-600" />
          <NavItem icon={Flag} label="Flagged" count={savedNotes.filter(n => n.is_flagged).length} isActive={columnVisibility.library && libraryActiveView === 'flagged'} onClick={() => handleSelect('flagged')} iconColor="text-red-700" />
          <NavItem icon={Star} label="Favorites" count={savedNotes.filter(n => n.is_starred).length} isActive={columnVisibility.library && libraryActiveView === 'starred'} onClick={() => handleSelect('starred')} iconColor="text-orange-500" />
        </div>

        <div className="mt-4 px-3 md:px-4">
          <button
            onClick={() => { openColumn('library'); setHeaderVisible(false); if (onClose) onClose(); }}
            className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-700 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors shadow-sm"
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

      {/* Profile section at bottom - outside scrollable area */}
      <div className="border-t border-gray-100 dark:border-gray-800">
        <SidebarUserProfile onShowAuthModal={onShowAuthModal} resetCallbacks={resetCallbacks} />
      </div>
    </div>
  );
};

// --- LIBRARY DASHBOARD (REMOVED - INTEGRATED INTO THREECOLUMN) ---

// --- NOTES MANAGER SIDEBAR (STANDALONE DRAWER) ---

export const NotesManagerSidebar: React.FC<{
  onShowAuthModal?: () => void;
  resetCallbacks?: (() => void)[];
}> = ({ onShowAuthModal, resetCallbacks }) => {
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
        className={`fixed left-0 top-0 bottom-0 w-85 sm:w-85 z-[70] bg-white dark:bg-dark-card border-r-2 border-gray-200 dark:border-gray-800 flex flex-col shadow-2xl transition-transform ${TRANSITION_DURATION} ${TRANSITION_EASING} font-sans overflow-hidden transform ${isLibraryOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
      >
        <SidebarNav onClose={() => setLibraryOpen(false)} onShowAuthModal={onShowAuthModal} resetCallbacks={resetCallbacks} />
      </div>
    </>
  );
};
