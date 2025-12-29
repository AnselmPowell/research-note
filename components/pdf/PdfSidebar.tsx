
import React, { useState, useEffect, useRef } from 'react';
import { LoadedPdf } from '../../types';
import { X, FileText, ChevronLeft, ChevronRight } from 'lucide-react';

interface PdfSidebarProps {
  pdf: LoadedPdf;
  onClose: () => void;
}

export const PdfSidebar: React.FC<PdfSidebarProps> = ({ pdf, onClose }) => {
  const [activePage, setActivePage] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);

  // Reset scroll when page changes
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [activePage, pdf]);

  // Scroll active tab into view
  useEffect(() => {
    if (tabsRef.current) {
      const activeTab = tabsRef.current.children[activePage] as HTMLElement;
      if (activeTab) {
        activeTab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [activePage]);

  const handlePrev = () => setActivePage(p => Math.max(0, p - 1));
  const handleNext = () => setActivePage(p => Math.min(pdf.numPages - 1, p + 1));

  return (
    <div className="fixed inset-y-0 left-0 w-full md:w-[600px] bg-white dark:bg-dark-card shadow-2xl z-50 flex flex-col border-r border-gray-200 dark:border-gray-800 transform transition-transform duration-300 ease-in-out font-sans">
      
      {/* Header */}
      <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-dark-card">
        <div className="pr-4">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 leading-tight mb-1">
            {pdf.metadata.title || "Untitled Document"}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {pdf.metadata.author || "Unknown Author"}
          </p>
        </div>
        <button 
          onClick={onClose}
          className="p-2 -mr-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
        >
          <X size={20} />
        </button>
      </div>

      {/* Abstract Section */}
      {pdf.text && (
        <div className="px-6 py-4 bg-scholar-50/50 dark:bg-scholar-900/10 border-b border-scholar-100 dark:border-scholar-900/20">
          <div className="flex items-center gap-2 mb-2">
            <FileText size={14} className="text-scholar-600 dark:text-scholar-400" />
            <h3 className="text-xs font-bold text-scholar-800 dark:text-scholar-200 uppercase tracking-wide">Abstract</h3>
          </div>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed max-h-32 overflow-y-auto pr-2 custom-scrollbar">
            {pdf.text}
          </p>
        </div>
      )}

      {/* Main Content (Reader View) */}
      <div className="flex-grow bg-gray-50 dark:bg-gray-900 relative overflow-hidden flex flex-col transition-colors">
        <div 
          ref={scrollRef}
          className="flex-grow overflow-y-auto p-4 md:p-8 custom-scrollbar"
        >
          <div className="bg-white dark:bg-dark-card shadow-sm border border-gray-200 dark:border-gray-700 min-h-full max-w-3xl mx-auto p-8 md:p-10 rounded-lg">
             <div className="font-serif text-gray-800 dark:text-gray-200 leading-8 whitespace-pre-wrap text-base md:text-lg">
              {pdf.pages[activePage]}
            </div>
          </div>
        </div>
        
        {/* Page Indicator Overlay */}
        <div className="absolute bottom-4 right-6 bg-gray-900/80 dark:bg-white/90 text-white dark:text-gray-900 text-xs px-3 py-1.5 rounded-full backdrop-blur-sm shadow-sm pointer-events-none font-medium">
          Page {activePage + 1} of {pdf.numPages}
        </div>
      </div>

      {/* Footer: Page Navigation */}
      <div className="h-16 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-dark-card flex items-center justify-between px-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-10">
        
        <button 
          onClick={handlePrev}
          disabled={activePage === 0}
          className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
        >
          <ChevronLeft size={20} />
        </button>

        <div 
          ref={tabsRef}
          className="flex overflow-x-auto gap-1.5 px-2 mx-2 no-scrollbar scroll-smooth items-center h-full"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {Array.from({ length: pdf.numPages }).map((_, idx) => (
            <button
              key={idx}
              onClick={() => setActivePage(idx)}
              className={`flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center text-xs font-medium transition-all ${
                activePage === idx 
                  ? 'bg-scholar-600 text-white shadow-md scale-110' 
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              {idx + 1}
            </button>
          ))}
        </div>

        <button 
          onClick={handleNext}
          disabled={activePage === pdf.numPages - 1}
          className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
        >
          <ChevronRight size={20} />
        </button>
      </div>
    </div>
  );
};
