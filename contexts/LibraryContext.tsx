
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
  searchHighlight: { text: string; fallbackPage?: number } | null;
  contextUris: Set<string>;

  setSearchHighlight: (highlight: { text: string; fallbackPage?: number } | null) => void;
  loadPdfFromUrl: (uri: string, title?: string, author?: string) => Promise<{ success: boolean, pdf?: LoadedPdf, error?: { reason: string, actionableMsg: string } }>;
  addRemotePdf: (url: string) => Promise<{ success: boolean, pdf?: LoadedPdf, error?: { reason: string, actionableMsg: string } }>;
  addLocalPdf: (file: File) => Promise<{ success: boolean, pdf?: LoadedPdf, error?: string }>;
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
  const { savedPapers, isPaperSaved, savePaper } = useDatabase();

  const [loadedPdfs, setLoadedPdfs] = useState<LoadedPdf[]>([]);
  const [activePdfUri, setActivePdfUri] = useState<string | null>(null);
  const [downloadingUris, setDownloadingUris] = useState<Set<string>>(new Set());
  const [failedUris, setFailedUris] = useState<Set<string>>(new Set());
  const [contextUris, setContextUris] = useState<Set<string>>(new Set());
  const [searchHighlight, setSearchHighlight] = useState<{ text: string; fallbackPage?: number } | null>(null);

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

      // Prefer metadata title as filename when available (sanitize to safe filesystem chars)
      const sanitize = (s: string) => s.replace(/[\\\/\?%\*:|"<>]/g, '').trim().slice(0, 200);
      let filename = uri.split('/').pop()?.split('?')[0] || 'document.pdf';
      if (finalMetadata && finalMetadata.title) {
        const safe = sanitize(finalMetadata.title);
        if (safe) filename = safe.endsWith('.pdf') ? safe : `${safe}.pdf`;
      }
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

  /**
   * Unified function to download a PDF from URL, save to database, and add to AI context.
   */
  const addRemotePdf = async (url: string): Promise<{ success: boolean, pdf?: LoadedPdf, error?: { reason: string, actionableMsg: string } }> => {
    const result = await loadPdfFromUrl(url.trim());

    if (result.success && result.pdf) {
      const loadedPdf = result.pdf;

      // Create paper data for persistence
      const paperData = {
        uri: loadedPdf.uri,
        pdfUri: loadedPdf.uri,
        title: loadedPdf.metadata?.title || 'Untitled Document',
        authors: loadedPdf.metadata?.author ? [loadedPdf.metadata.author] : [],
        abstract: loadedPdf.metadata?.subject || '',
        summary: loadedPdf.metadata?.subject || '',
        publishedDate: loadedPdf.metadata?.publishedDate || null,
        harvardReference: loadedPdf.metadata?.harvardReference || null,
        publisher: loadedPdf.metadata?.publisher || null,
        categories: [],
        numPages: loadedPdf.numPages
      };

      try {
        // Save to database/localStorage
        await savePaper(paperData);

        // ✅ Add to AI context automatically WITH duplicate check
        const isAlreadyInContext = contextUris.has(loadedPdf.uri);
        const titleToSync = loadedPdf.metadata?.title || 'Untitled Document';

        if (!isAlreadyInContext) {
          // Safely toggle/add to context (deduplicates by title internally)
          togglePdfContext(loadedPdf.uri, titleToSync);
        }

        return result;
      } catch (err) {
        console.error("[LibraryContext] Failed to save remote paper:", err);
        return { success: false, error: { reason: "Save Failed", actionableMsg: "PDF downloaded but could not be saved to your library." } };
      }
    }

    return result;
  };

  /**
   * Unified function to add a local file to the library, save to DB, and add to AI context.
   */
  const addLocalPdf = async (file: File): Promise<{ success: boolean, pdf?: LoadedPdf, error?: string }> => {
    try {
      const loadedPdf = await addPdfFileAndReturn(file);

      // Create paper data for persistence
      const paperData = {
        uri: loadedPdf.uri,
        pdfUri: loadedPdf.uri,
        title: loadedPdf.metadata?.title || file.name.replace('.pdf', ''),
        authors: loadedPdf.metadata?.author ? [loadedPdf.metadata.author] : [],
        abstract: loadedPdf.metadata?.subject || '',
        summary: loadedPdf.metadata?.subject || '',
        publishedDate: loadedPdf.metadata?.publishedDate || null,
        harvardReference: loadedPdf.metadata?.harvardReference || null,
        publisher: loadedPdf.metadata?.publisher || null,
        categories: [],
        numPages: loadedPdf.numPages
      };

      // Save to database/localStorage
      await savePaper(paperData);

      // ✅ Add to AI context automatically WITH duplicate check
      const isAlreadyInContext = contextUris.has(loadedPdf.uri);
      const titleToSync = paperData.title;

      if (!isAlreadyInContext) {
        // Safely toggle/add to context (deduplicates by title internally)
        togglePdfContext(loadedPdf.uri, titleToSync);
      }

      return { success: true, pdf: loadedPdf };
    } catch (err) {
      console.error("[LibraryContext] Failed to save local paper:", err);
      return { success: false, error: "Failed to process local PDF" };
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
      // ✅ Duplicate detection logic (URI + Title)
      // 1. Determine title of incoming paper
      let incomingTitle = title;
      if (!incomingTitle) {
        const loaded = loadedPdfs.find(p => p.uri === uri);
        incomingTitle = loaded?.metadata?.title;
        if (!incomingTitle) {
          const saved = savedPapers.find(p => p.uri === uri);
          incomingTitle = saved?.title;
        }
      }

      // 2. Check if a paper with this title is already in context
      if (incomingTitle) {
        const normalizedIncoming = incomingTitle.toLowerCase().trim();
        const genericTitles = ['untitled document', 'document', 'pdf document', 'untitled', 'unknown'];

        if (normalizedIncoming && !genericTitles.includes(normalizedIncoming)) {
          // Look for existing papers in context with same title
          const existingTitleMatch = Array.from(contextUris).find(cUri => {
            let existingTitle = '';
            const loaded = loadedPdfs.find(p => p.uri === cUri);
            if (loaded?.metadata?.title) existingTitle = loaded.metadata.title;
            else {
              const saved = savedPapers.find(p => p.uri === cUri);
              if (saved?.title) existingTitle = saved.title;
            }

            return existingTitle && existingTitle.toLowerCase().trim() === normalizedIncoming;
          });

          if (existingTitleMatch) {
            console.warn(`[LibraryContext] Duplicate paper detected by title: "${incomingTitle}". Already in context via URI: ${existingTitleMatch}`);
            return; // Skip adding duplicate title
          }
        }
      }

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
      addRemotePdf,
      addLocalPdf,
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
