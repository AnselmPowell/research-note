import React, { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { useLibrary } from '../../contexts/LibraryContext';
import PdfUploader from '../pdf/PdfUploader';

interface AddPaperModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AddPaperModal: React.FC<AddPaperModalProps> = ({ isOpen, onClose }) => {
  const { addLocalPdf, addRemotePdf } = useLibrary();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileChange = async (file: File) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await addLocalPdf(file);
      if (result.success) {
        onClose();
      } else {
        setError(result.error || "Failed to process local PDF");
      }
    } catch (err) {
      setError("An unexpected error occurred during upload");
    } finally {
      setIsLoading(false);
    }
  };

  const handleUrlSubmit = async (url: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await addRemotePdf(url);
      if (result.success) {
        onClose();
      } else if (result.error) {
        setError(`${result.error.reason}: ${result.error.actionableMsg}`);
      } else {
        setError("Failed to load PDF from URL");
      }
    } catch (err) {
      setError("An unexpected error occurred during import");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 animate-in fade-in duration-200">
      <div 
        className="bg-white dark:bg-dark-card w-full max-w-md rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - Compact */}
        <div className="px-6 py-4 border-b border-gray-50 dark:border-gray-800 flex items-center justify-between bg-gradient-to-r from-scholar-50/50 to-transparent dark:from-scholar-900/10">
          <div>
            <h2 className="text-lg font-black text-gray-900 dark:text-white tracking-tight leading-none">Add Research Paper</h2>
          </div>
          <button 
            disabled={isLoading}
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors text-gray-400 hover:text-gray-600 disabled:opacity-30"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {isLoading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-6 animate-in fade-in transition-all">
              <div className="relative">
                <div className="absolute inset-0 bg-scholar-500/10 dark:bg-scholar-500/20 rounded-full blur-2xl animate-pulse" />
                <Loader2 className="w-12 h-12 text-scholar-600 animate-spin relative z-10" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-widest leading-none">Adding to Library</p>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest opacity-60">Reading document metadata...</p>
              </div>
            </div>
          ) : (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              <PdfUploader 
                onFileChange={handleFileChange} 
                onUrlSubmit={handleUrlSubmit} 
                error={error} 
              />
            </div>
          )}
        </div>

        {/* Info Footer */}
        {!isLoading && (
          <div className="px-6 py-4 bg-gray-50/30 dark:bg-gray-900/20 border-t border-gray-50 dark:border-gray-800/50">
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest text-center opacity-70">
              Documents are processed locally for privacy
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
