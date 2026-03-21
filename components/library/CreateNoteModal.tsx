import React, { useState, useEffect } from 'react';
import { X, Plus, Book, FileText, Loader2, User, Calendar, ChevronDown } from 'lucide-react';
import { ArxivPaper, DeepResearchNote } from '../../types';

interface CreateNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  savedPapers: ArxivPaper[];
  onSave: (note: DeepResearchNote, paperMetadata?: any) => Promise<void>;
}

export const CreateNoteModal: React.FC<CreateNoteModalProps> = ({
  isOpen,
  onClose,
  savedPapers,
  onSave
}) => {
  const [content, setContent] = useState('');
  const [selectedPaperUri, setSelectedPaperUri] = useState('');
  const [pageNumber, setPageNumber] = useState<number>(0);
  const [isSaving, setIsSaving] = useState(false);

  // Reset form when opening
  useEffect(() => {
    if (isOpen) {
      setContent('');
      setSelectedPaperUri('');
      setPageNumber(0);
      setIsSaving(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const selectedPaper = savedPapers.find(p => p.pdfUri === selectedPaperUri || p.uri === selectedPaperUri);

  const handleSave = async () => {
    if (!content.trim()) return;
    
    setIsSaving(true);
    try {
      const note: DeepResearchNote = {
        quote: content.trim(),
        pdfUri: selectedPaperUri || 'local://manual-note',
        pageNumber: pageNumber || 0,
        justification: 'Manually created note',
        relatedQuestion: 'Manual Entry',
        relevanceScore: 1,
        tags: [],
        citations: selectedPaper ? [{
          inline: `(${Array.isArray(selectedPaper.authors) ? selectedPaper.authors[0] : selectedPaper.authors}, ${selectedPaper.year || new Date().getFullYear()})`,
          full: selectedPaper.harvardReference || selectedPaper.title
        }] : []
      };

      await onSave(note, selectedPaper);
      onClose();
    } catch (error) {
      console.error('Failed to save manual note:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 animate-in fade-in duration-200">
      <div 
        className="bg-white dark:bg-dark-card w-full max-w-md rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - Tightened */}
        <div className="px-6 py-4 border-b border-gray-50 dark:border-gray-800 flex items-center justify-between bg-gradient-to-r from-scholar-50/50 to-transparent dark:from-scholar-900/10">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-scholar-100 dark:bg-scholar-900/30 rounded-lg text-scholar-600 dark:text-scholar-400 font-bold">
              <Plus size={20} />
            </div>
            <div>
              <h2 className="text-lg font-black text-gray-900 dark:text-white tracking-tight leading-none">New Research Note</h2>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors text-gray-400 hover:text-gray-600"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content - Tightened whitespace */}
        <div className="p-6 space-y-5 max-h-[60vh] overflow-y-auto custom-scrollbar">
          {/* Note Area */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-scholar-600 ml-1">Insight Content</label>
            <textarea
              autoFocus
              className="w-full h-32 p-3 bg-gray-50 dark:bg-gray-900 border-2 border-transparent focus:border-scholar-500/20 focus:ring-2 focus:ring-scholar-500/5 rounded-xl outline-none text-gray-800 dark:text-gray-200 font-sans italic resize-none transition-all placeholder:text-gray-400 dark:placeholder:text-gray-600 text-sm shadow-inner"
              placeholder="What have you discovered?"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>

          <div className="space-y-4">
            {/* Source Paper Selection */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Reference Piece (Optional)</label>
              <div className="relative group">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-scholar-500 transition-colors pointer-events-none">
                  <Book size={14} />
                </div>
                <select
                  className="w-full pl-9 pr-8 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl outline-none text-xs text-gray-700 dark:text-gray-300 appearance-none focus:ring-2 focus:ring-scholar-500/10 transition-all cursor-pointer font-bold"
                  value={selectedPaperUri}
                  onChange={(e) => setSelectedPaperUri(e.target.value)}
                >
                  <option value="">Personal Note / No Reference</option>
                  {savedPapers.map(paper => (
                    <option key={paper.uri} value={paper.uri}>
                      {paper.title.length > 50 ? paper.title.substring(0, 47) + '...' : paper.title}
                    </option>
                  ))}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                  <ChevronDown size={12} />
                </div>
              </div>
            </div>

            {/* Conditionally show mini metadata cards if paper selected */}
            {selectedPaper && (
              <div className="flex gap-2 animate-in slide-in-from-top-1 duration-200">
                <div className="flex-1 px-3 py-2 bg-scholar-50/50 dark:bg-scholar-900/5 rounded-lg border border-scholar-100/30 dark:border-scholar-900/10 flex items-center gap-2">
                  <User size={10} className="text-scholar-500" />
                  <span className="text-[10px] font-bold text-gray-600 dark:text-gray-400 truncate max-w-[120px]">
                    {Array.isArray(selectedPaper.authors) ? selectedPaper.authors[0] : (selectedPaper.authors || 'Unknown')}
                  </span>
                </div>
                <div className="px-3 py-2 bg-scholar-50/50 dark:bg-scholar-900/5 rounded-lg border border-scholar-100/30 dark:border-scholar-900/10 flex items-center gap-2">
                  <Calendar size={10} className="text-scholar-500" />
                  <span className="text-[10px] font-bold text-gray-600 dark:text-gray-400">
                    {selectedPaper.year || (selectedPaper.publishedDate ? new Date(selectedPaper.publishedDate).getFullYear() : '—')}
                  </span>
                </div>
              </div>
            )}

            {/* Page Number (Always available) - Compact */}
            <div className="space-y-1.5 pt-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Page Reference (Optional)</label>
              <div className="relative group max-w-[120px]">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-scholar-500 transition-colors pointer-events-none">
                   <FileText size={14} />
                </div>
                <input
                  type="number"
                  min="0"
                  className="w-full pl-9 pr-3 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl outline-none text-xs text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-scholar-500/10 transition-all font-bold"
                  placeholder="e.g. 5"
                  value={pageNumber || ''}
                  onChange={(e) => setPageNumber(parseInt(e.target.value) || 0)}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer - Tightened */}
        <div className="px-6 py-4 bg-gray-50/50 dark:bg-gray-900/30 border-t border-gray-100 dark:border-gray-800 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-all translate-y-px"
          >
            Cancel
          </button>
          <button
            disabled={!content.trim() || isSaving}
            onClick={handleSave}
            className="px-6 py-2.5 bg-scholar-600 hover:bg-scholar-700 disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed text-white text-[10px] font-black uppercase tracking-widest rounded-xl shadow-lg shadow-scholar-600/20 transition-all flex items-center gap-2 group active:scale-95"
          >
            {isSaving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Plus size={14} />
            )}
            Save Findings
          </button>
        </div>
      </div>
    </div>
  );
};
