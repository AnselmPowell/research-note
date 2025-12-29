
import React, { createContext, useContext, useState, useEffect } from 'react';
import { LoadedPdf, SearchSource } from '../types';
import { extractPdfData, fetchPdfBuffer } from '../services/pdfService';
import { useDatabase } from '../database/DatabaseContext';

interface LibraryContextType {
  loadedPdfs: LoadedPdf[]; 
  activePdfUri: string | null;
  downloadingUris: Set<string>;
  failedUris: Set<string>;
  searchHighlight: string | null;
  contextUris: Set<string>; 
  
  setSearchHighlight: (text: string | null) => void;
  loadPdfFromUrl: (uri: string, title?: string, author?: string) => Promise<boolean>;
  addPdfFile: (file: File) => Promise<void>;
  removePdf: (uri: string) => void;
  setActivePdf: (uri: string | null) => void;
  
  // Context Management
  togglePdfContext: (uri: string, title?: string) => void;
  isPdfInContext: (uri: string) => boolean;
  isPdfLoaded: (uri: string) => boolean;
}

const LibraryContext = createContext<LibraryContextType | undefined>(undefined);

export const LibraryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { savedPapers, isPaperSaved } = useDatabase();
  
  const [loadedPdfs, setLoadedPdfs] = useState<LoadedPdf[]>([]);
  const [activePdfUri, setActivePdfUri] = useState<string | null>(null);
  const [downloadingUris, setDownloadingUris] = useState<Set<string>>(new Set());
  const [failedUris, setFailedUris] = useState<Set<string>>(new Set());
  const [contextUris, setContextUris] = useState<Set<string>>(new Set());
  const [searchHighlight, setSearchHighlight] = useState<string | null>(null);

  /**
   * Downloads and parses a PDF into memory.
   */
  const loadPdfFromUrl = async (uri: string, title?: string, author?: string): Promise<boolean> => {
    // Clear failed state if retrying
    if (failedUris.has(uri)) {
        setFailedUris(prev => {
            const next = new Set(prev);
            next.delete(uri);
            return next;
        });
    }

    // Already loaded
    if (loadedPdfs.some(p => p.uri === uri)) {
        setActivePdfUri(uri);
        return true;
    }
    
    // Already downloading
    if (downloadingUris.has(uri)) return false;
    setDownloadingUris(prev => new Set(prev).add(uri));

    try {
      const arrayBuffer = await fetchPdfBuffer(uri);
      const extractedData = await extractPdfData(arrayBuffer);
      
      const finalMetadata = {
          ...extractedData.metadata,
          title: title || extractedData.metadata.title,
          author: author || extractedData.metadata.author
      };

      const filename = uri.split('/').pop()?.split('?')[0] || 'document.pdf';
      const file = new File([new Blob([arrayBuffer])], filename, { type: 'application/pdf' });

      const newPdf: LoadedPdf = {
        uri,
        file,
        data: arrayBuffer,
        ...extractedData,
        metadata: finalMetadata
      };

      setLoadedPdfs(prev => [...prev, newPdf]);
      setActivePdfUri(uri); 
      return true;
    } catch (error) {
      console.error("Error downloading PDF:", error);
      
      // Mark as failed
      setFailedUris(prev => new Set(prev).add(uri));
      
      // CRITICAL: If loading failed, ensure it's removed from the context (unselected)
      setContextUris(prev => {
          if (!prev.has(uri)) return prev;
          const next = new Set(prev);
          next.delete(uri);
          return next;
      });

      return false;
    } finally {
      setDownloadingUris(prev => {
        const next = new Set(prev);
        next.delete(uri);
        return next;
      });
    }
  };

  const addPdfFile = async (file: File) => {
      const uri = `local://${file.name}-${Date.now()}`;
      const arrayBuffer = await file.arrayBuffer();
      const extractedData = await extractPdfData(arrayBuffer);
      
      const newPdf: LoadedPdf = {
          uri,
          file,
          data: arrayBuffer,
          ...extractedData
      };
      
      setLoadedPdfs(prev => [...prev, newPdf]);
      setActivePdfUri(uri);
  };

  const removePdf = (uri: string) => {
    setLoadedPdfs(prev => prev.filter(p => p.uri !== uri));
    if (contextUris.has(uri)) {
        setContextUris(prev => {
            const next = new Set(prev);
            next.delete(uri);
            return next;
        });
    }
    if (activePdfUri === uri) setActivePdfUri(null);
    if (failedUris.has(uri)) {
        setFailedUris(prev => {
            const next = new Set(prev);
            next.delete(uri);
            return next;
        });
    }
  };

  const togglePdfContext = (uri: string, title?: string) => {
      if (contextUris.has(uri)) {
          setContextUris(prev => {
              const next = new Set(prev);
              next.delete(uri);
              return next;
          });
      } else {
          setContextUris(prev => new Set(prev).add(uri));
      }
  };

  const isPdfInContext = (uri: string) => contextUris.has(uri);
  const isPdfLoaded = (uri: string) => loadedPdfs.some(p => p.uri === uri);

  return (
    <LibraryContext.Provider value={{
      loadedPdfs,
      activePdfUri,
      downloadingUris,
      failedUris,
      searchHighlight,
      contextUris,
      setSearchHighlight,
      loadPdfFromUrl,
      addPdfFile,
      removePdf,
      setActivePdf: setActivePdfUri,
      togglePdfContext,
      isPdfInContext,
      isPdfLoaded
    }}>
      {children}
    </LibraryContext.Provider>
  );
};

export const useLibrary = () => {
  const context = useContext(LibraryContext);
  if (!context) throw new Error("useLibrary must be used within a LibraryProvider");
  return context;
};
