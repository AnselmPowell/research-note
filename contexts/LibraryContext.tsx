
import React, { createContext, useContext, useState, useEffect } from 'react';
import { LoadedPdf, SearchSource } from '../types';
import { extractPdfData, fetchPdfBuffer } from '../services/pdfService';
import { useDatabase } from '../database/DatabaseContext';

interface LibraryContextType {
  loadedPdfs: LoadedPdf[];
  activePdfUri: string | null;
  downloadingUris: Set<string>;
  failedUris: Set<string>;
  failedUrlErrors: Record<string, { reason: string, actionableMsg: string }>; // New friendly errors
  searchHighlight: string | null;
  contextUris: Set<string>;

  setSearchHighlight: (text: string | null) => void;
  loadPdfFromUrl: (uri: string, title?: string, author?: string) => Promise<{ success: boolean, pdf?: LoadedPdf, error?: { reason: string, actionableMsg: string } }>;
  addPdfFile: (file: File) => Promise<void>;
  addPdfFileAndReturn: (file: File) => Promise<LoadedPdf>; // New: returns the PDF object directly
  addLoadedPdf: (pdf: LoadedPdf) => void; // New: directly add processed PDF
  removePdf: (uri: string) => void;
  setActivePdf: (uri: string | null) => void;

  // Context Management
  togglePdfContext: (uri: string, title?: string) => void;
  isPdfInContext: (uri: string) => boolean;
  isPdfLoaded: (uri: string) => boolean;
  // Reset library state
  resetLibrary: () => void;
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
  /* 
   * NEW: Friendly Error Store 
   * Maps failed URI -> { reason: string, actionableMsg: string }
   */
  const [failedUrlErrors, setFailedUrlErrors] = useState<Record<string, { reason: string, actionableMsg: string }>>({});

  /**
   * Downloads and parses a PDF into memory.
   */
  const loadPdfFromUrl = async (uri: string, title?: string, author?: string): Promise<{ success: boolean, error?: { reason: string, actionableMsg: string } }> => {
    // Clear failed state if retrying
    if (failedUris.has(uri)) {
      setFailedUris(prev => {
        const next = new Set(prev);
        next.delete(uri);
        return next;
      });
      // Clear specific error message
      setFailedUrlErrors(prev => {
        const next = { ...prev };
        delete next[uri];
        return next;
      });
    }

    // Already loaded
    if (loadedPdfs.some(p => p.uri === uri)) {
      const existingPdf = loadedPdfs.find(p => p.uri === uri);
      setActivePdfUri(uri);
      return { success: true, pdf: existingPdf };
    }

    // Already downloading
    if (downloadingUris.has(uri)) return { success: false };
    setDownloadingUris(prev => new Set(prev).add(uri));

    try {
      const arrayBuffer = await fetchPdfBuffer(uri);
      const extractedData = await extractPdfData(arrayBuffer);

      const finalMetadata = {
        ...extractedData.metadata,
        title: title || extractedData.metadata.title,
        author: author || extractedData.metadata.author,
        subject: extractedData.metadata.subject  // Preserve subject field
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
      return { success: true, pdf: newPdf };
    } catch (error: any) {
      console.error("Error downloading PDF:", error);

      const errString = error.toString();
      let reason = "Load Failed";
      let msg = "We couldn't load this file. Please check the link.";

      if (errString.includes('InvalidContentType')) {
        reason = "Webpage Detected";
        // User requested: "if xml also say this pdf needs to be downloaded"
        msg = "This link points to a webpage (HTML/XML), not a PDF file. Please download the PDF manually and upload it.";
      }
      else if (errString.includes('InvalidPDFException') || errString.includes('not a valid PDF')) {
        reason = "Not a PDF";
        msg = "This link does not point to a valid PDF file.";
      }
      else if (errString.includes('ProxyError') || errString.includes('NetworkOrCORSError') || errString.includes('Failed to fetch')) {
        reason = "Protected Site";
        msg = "This site blocks direct access. Please download the file to your computer, then upload it manually.";
      }
      else if (errString.includes('Limit')) {
        reason = "File Too Large";
        msg = "This file exceeds the size limit.";
      }

      const errorObj = { reason, actionableMsg: msg };

      // Mark as failed
      setFailedUris(prev => new Set(prev).add(uri));
      setFailedUrlErrors(prev => ({ ...prev, [uri]: errorObj }));

      // CRITICAL: If loading failed, ensure it's removed from the context (unselected)
      setContextUris(prev => {
        if (!prev.has(uri)) return prev;
        const next = new Set(prev);
        next.delete(uri);
        return next;
      });

      return { success: false, error: errorObj };
    } finally {
      setDownloadingUris(prev => {
        const next = new Set(prev);
        next.delete(uri);
        return next;
      });
    }
  };

  const addPdfFile = async (file: File) => {
    await addPdfFileAndReturn(file);
  };

  const addPdfFileAndReturn = async (file: File): Promise<LoadedPdf> => {
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
    return newPdf; // Return the PDF object directly
  };

  // Add already processed PDF to library (avoid re-downloading)
  const addLoadedPdf = (pdf: LoadedPdf) => {
    // Check if already loaded to avoid duplicates
    if (loadedPdfs.some(p => p.uri === pdf.uri)) {
      setActivePdfUri(pdf.uri);
      return;
    }

    setLoadedPdfs(prev => [...prev, pdf]);
    setActivePdfUri(pdf.uri);
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
      // Clear specific error
      setFailedUrlErrors(prev => {
        const next = { ...prev };
        delete next[uri];
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

  // Reset library state to initial values (for sign out)
  const resetLibrary = () => {
    setLoadedPdfs([]);
    setActivePdfUri(null);
    setDownloadingUris(new Set());
    setFailedUris(new Set());
    setFailedUrlErrors({});
    setSearchHighlight(null);
    setContextUris(new Set());
  };

  return (
    <LibraryContext.Provider value={{
      loadedPdfs,
      activePdfUri,
      downloadingUris,
      failedUris,
      failedUrlErrors, // Exposed
      searchHighlight,
      contextUris,
      setSearchHighlight,
      loadPdfFromUrl,
      addPdfFile,
      addPdfFileAndReturn,
      addLoadedPdf,
      removePdf,
      setActivePdf: setActivePdfUri,
      togglePdfContext,
      isPdfInContext,
      isPdfLoaded,
      resetLibrary
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
