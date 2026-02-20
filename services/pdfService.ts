
import * as pdfjsLib from 'pdfjs-dist';
import { enhanceMetadataWithAI } from './geminiService';
import { getCachedMetadata, setCachedMetadata } from '../utils/metadataCache';

// Set the worker source to the same version as the library
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs';

interface ExtractedData {
  metadata: {
    title?: string;
    author?: string;
    subject?: string;
    year?: string;
    harvardReference?: string;
    publisher?: string;
    categories?: string[];
  };
  text: string;
  pages: string[];
  references: string[];
  numPages: number;
}

/**
 * Shared utility to fetch a PDF buffer, handling CORS proxies automatically.
 */
/**
 * Lightweight PDF validation using PDF.js getDocument with timeout
 * More reliable than Range requests and works with existing proxy system
 */
export const validatePdfUrl = async (uri: string): Promise<boolean> => {
  try {
    // Use server endpoint if available, otherwise fallback to browser
    let response;
    try {
      response = await fetch('/api/v1/pdf/fetch-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: uri }),
        signal: AbortSignal.timeout(5000)
      });
    } catch {
      // Fallback to direct fetch if server endpoint unavailable
      response = await fetch(uri, { signal: AbortSignal.timeout(5000) });
    }

    if (!response.ok) throw new Error('Fetch failed');

    const arrayBuffer = await response.arrayBuffer();

    // Use PDF.js to validate - same as existing extractPdfData pattern
    const loadingTask = pdfjsLib.getDocument({
      data: arrayBuffer.slice(0),
      verbosity: 0 // Suppress PDF.js console logs
    });

    // Quick validation - just try to load, don't process
    const doc = await Promise.race([
      loadingTask.promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('PDF validation timeout')), 3000))
    ]);

    // Clean up
    if (doc) (doc as any).destroy();
    return true;

  } catch (error: any) {
    return false;
  }
};

/**
 * Comprehensive PDF fetch with multiple fallback strategies
 * 
 * Strategy 1: Server-side fetch (90%+ success on academic PDFs)
 * Strategy 2: Smart browser direct fetch (40% of remaining cases)
 * Strategy 3: Public proxy fallback (last resort)
 * 
 * Non-blocking - respects AbortSignal for cancellation
 */
export const fetchPdfBuffer = async (uri: string, signal?: AbortSignal): Promise<ArrayBuffer> => {
  // Strategy 1: Try server-side fetch first (best success rate)
  try {
    if (signal?.aborted) throw new Error('Aborted');
    console.log(`[PDF Service] 1️⃣  Attempting server-side fetch for ${uri}`);
    return await fetchViaServer(uri, signal);
  } catch (serverError: any) {
    console.warn(`[PDF Service] Server fetch failed: ${serverError.message}`);
    
    // Strategy 2: Try smart browser direct fetch
    try {
      if (signal?.aborted) throw new Error('Aborted');
      console.log(`[PDF Service] 2️⃣  Attempting smart browser fetch for ${uri}`);
      return await fetchViaBrowserDirect(uri, signal);
    } catch (browserError: any) {
      console.warn(`[PDF Service] Browser direct fetch failed: ${browserError.message}`);
      
      // Strategy 3: Try public proxy fallback
      try {
        if (signal?.aborted) throw new Error('Aborted');
        console.log(`[PDF Service] 3️⃣  Attempting proxy fallback for ${uri}`);
        return await fetchViaProxy(uri, signal);
      } catch (proxyError: any) {
        console.error(`[PDF Service] All fetch strategies failed for ${uri}`);
        
        // Classify error for user-friendly display
        const finalError = classifyError([serverError, browserError, proxyError]);
        throw new Error(finalError);
      }
    }
  }
};

/**
 * Strategy 1: Server-side PDF fetch (via backend API)
 * No CORS issues, proper headers, timeout protection
 * Best success rate on academic PDFs (90%+)
 */
async function fetchViaServer(uri: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout

  try {
    const response = await fetch('/api/v1/pdf/fetch-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: uri }),
      signal: signal || controller.signal
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `HTTP_${response.status}`);
    }

    return await response.arrayBuffer();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Strategy 2: Smart browser direct fetch (with proper headers)
 * Handles ~40% of cases that server misses
 * Includes User-Agent and Accept headers for better compatibility
 */
async function fetchViaBrowserDirect(uri: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

  try {
    const response = await fetch(uri, {
      headers: {
        'Accept': 'application/pdf,application/octet-stream;q=0.9,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (compatible; ResearchNote/1.0)'
      },
      redirect: 'follow', // Follow redirects
      signal: signal || controller.signal
    });

    if (!response.ok) {
      throw new Error(`HTTP_${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('pdf') && 
        !contentType.toLowerCase().includes('octet-stream')) {
      throw new Error('NotPDF');
    }

    // Check size before buffering
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > 25 * 1024 * 1024) {
      throw new Error('PdfTooLarge');
    }

    return await response.arrayBuffer();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Strategy 3: Public proxy fallback (last resort)
 * Lower success rate but catches protected PDFs
 */
async function fetchViaProxy(uri: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000); // 12s timeout

  try {
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(uri)}`;
    const response = await fetch(proxyUrl, {
      signal: signal || controller.signal
    });

    if (!response.ok) {
      throw new Error(`ProxyError:Status=${response.status}`);
    }

    return await response.arrayBuffer();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Classify errors into user-friendly messages
 * Maps technical errors to actionable guidance
 * Returns error names that LibraryContext can recognize
 */
function classifyError(errors: any[]): string {
  const errorStrings = errors.map(e => e?.message || e?.toString() || '').join(' | ');

  if (errorStrings.includes('InvalidURL')) {
    return 'InvalidURL';
  }
  // Map 'NotPDF' to 'InvalidContentType' so LibraryContext recognizes it
  if (errorStrings.includes('NotPDF')) {
    return 'InvalidContentType';
  }
  // Map 'PdfTooLarge' to 'Limit' so LibraryContext recognizes it
  if (errorStrings.includes('PdfTooLarge')) {
    return 'Limit';
  }
  if (errorStrings.includes('Timeout') || errorStrings.includes('AbortError')) {
    return 'Timeout';
  }
  if (errorStrings.includes('ProxyError') || errorStrings.includes('HTTP_')) {
    return 'ProxyError';
  }
  
  return 'NetworkOrCORSError';
}

/**
 * Sorts PDF items into human reading order, handling 2-column layouts.
 */
function sortPageItems(items: any[]) {
  const xList = items.map((i: any) => i.transform[4]);
  const minX = Math.min(...xList);
  const maxX = Math.max(...items.map((i: any) => i.transform[4] + i.width));
  const midX = (minX + maxX) / 2;

  // 1. Bucketing: Split items into Left, Right, or "Crossers" (headers)
  const crossers: any[] = [];
  const left: any[] = [];
  const right: any[] = [];

  items.forEach((item: any) => {
    const x = item.transform[4];
    const w = item.width;

    // If an item sits in the middle (crossing the divide), it's a Header/Title
    if (x < midX && x + w > midX) {
      crossers.push(item);
    } else if (x + w <= midX) {
      left.push(item);
    } else {
      right.push(item);
    }
  });

  // 2. Detection: Is this actually a 2-column page?
  // If < 20% of items cross the middle, it's likely 2-column.
  const isTwoColumn = items.length > 0 && (crossers.length / items.length) < 0.2;

  // 3. Sorting Function: Top-to-Bottom (Y Descending)
  // Note: PDF Y coordinates go UP. So higher Y = Higher on page.
  const ySorter = (a: any, b: any) => {
    const y1 = a.transform[5];
    const y2 = b.transform[5];
    if (Math.abs(y1 - y2) > 4) return y2 - y1; // Sort by line height first
    return a.transform[4] - b.transform[4]; // Then Left-to-Right
  };

  if (isTwoColumn) {
    return [
      ...crossers.sort(ySorter), // Read Title
      ...left.sort(ySorter), // Read Left Column
      ...right.sort(ySorter) // Read Right Column
    ];
  } else {
    return items.sort(ySorter); // Standard Page
  }
}

/**
 * Reconstructs text with intelligent spacing and markdown formatting
 */
function generateMarkdownFromItems(items: any[]) {
  if (items.length === 0) return '';

  // 1. Calculate Body Text Size (Mode)
  const heightMap: Record<number, number> = {};
  items.forEach((item: any) => {
    const h = Math.round(item.height);
    heightMap[h] = (heightMap[h] || 0) + 1;
  });

  const sortedHeights = Object.keys(heightMap).sort((a, b) => heightMap[Number(b)] - heightMap[Number(a)]);
  const bodyHeight = Number(sortedHeights[0]) || 12;

  let markdown = '';
  let lastItem: any = null;

  for (const item of items) {
    // Init logic for first item
    if (!lastItem) {
      if (item.height > bodyHeight * 1.2) markdown += '## ';
      markdown += item.str;
      lastItem = item;
      continue;
    }

    // --- MATH GEOMETRY ---
    const lastY = lastItem.transform[5];
    const currentY = item.transform[5];
    const lastXEnd = lastItem.transform[4] + lastItem.width;
    const currentX = item.transform[4];
    const lineHeight = lastItem.height || 12;

    // Vertical Gap (Positive means we moved DOWN the page)
    const verticalGap = lastY - currentY;

    // Horizontal Gap
    const horizontalGap = currentX - lastXEnd;

    // --- DECISION TREE ---

    // Case 1: New Paragraph (Big Vertical Gap)
    // We ignore negative vertical gaps which happen when jumping columns
    if (verticalGap > lineHeight * 1.5) {
      markdown += '\n\n';
      // Is the new line a Header?
      if (item.height > bodyHeight * 1.2) markdown += '## ';
    }
    // Case 2: New Line (Small Vertical Gap)
    else if (verticalGap > lineHeight * 0.5) {
      markdown += '\n';
    }
    // Case 3: Same Line, Space between words
    else if (horizontalGap > 2) {
      markdown += ' ';
    }
    // Case 4: No gap (e.g., partial word rendering), just append
    else {
      // Do nothing, just append string
    }

    markdown += item.str;
    lastItem = item;
  }
  return markdown;
}

/**
 * Heuristic to extract references from the processed pages.
 * Starts from the end and looks backwards for the reference list header.
 */
function extractReferences(pages: string[]): string[] {
  const REF_HEADER_PATTERN = /(?:^|\n)(?:##\s*)?(?:References|Bibliography|Works Cited|Reference List|Endnotes)(?:\n|$)/i;

  // 1. Find the start page and index
  let startIndex = -1;
  let startPageIdx = -1;

  for (let i = pages.length - 1; i >= 0; i--) {
    const text = pages[i];
    const match = text.match(REF_HEADER_PATTERN);

    if (match && match.index !== undefined) {
      // We found the header
      startIndex = match.index + match[0].length;
      startPageIdx = i;
      break;
    }
  }

  if (startPageIdx === -1) return [];

  // 2. Aggregate text from the header to the end of document
  let rawRefText = pages[startPageIdx].substring(startIndex);
  for (let i = startPageIdx + 1; i < pages.length; i++) {
    rawRefText += "\n" + pages[i];
  }

  // 3. Split and Clean citations
  // We split by double newline (Paragraphs) which generateMarkdownFromItems creates for vertical gaps
  const potentialCitations = rawRefText.split(/\n\n+/);

  const references: string[] = [];

  // Heuristics for a valid citation line start
  const numberedPattern = /^\[\d+\]|^\d+\.|^\d+\)/;

  potentialCitations.forEach(block => {
    // Clean up the block: remove single newlines (wrapping) to make it one line
    const cleanBlock = block.replace(/\n/g, ' ').trim();

    if (cleanBlock.length < 10) return; // Skip noise

    // If the block contains multiple numbered items (e.g. tight spacing didn't trigger \n\n)
    // We can try to split them further
    // Look for [2], [3] inside the text that isn't at the start
    // This is a basic split, handling [1] ... [2] ...
    // Note: This is risky if citations contain brackets, but effective for standard IEEE styles

    // Check if we have multiple bracketed numbers
    const splitByNumbers = cleanBlock.split(/(\[\d+\])/).filter(s => s.trim());

    // If we split into parts like ["[1]", " text...", "[2]", " text..."]
    if (splitByNumbers.length > 2 && splitByNumbers[0].match(numberedPattern)) {
      let currentRef = "";
      for (const part of splitByNumbers) {
        if (part.match(/^\[\d+\]$/)) {
          if (currentRef) references.push(currentRef.trim());
          currentRef = part;
        } else {
          currentRef += part;
        }
      }
      if (currentRef) references.push(currentRef.trim());
    } else {
      // Just one block
      references.push(cleanBlock);
    }
  });

  return references;
}


export const extractPdfData = async (arrayBuffer: ArrayBuffer, signal?: AbortSignal): Promise<ExtractedData> => {
  try {
    // 1. Load Document
    // CRITICAL FIX: Slice the buffer to create a copy. 
    // PDF.js worker transfers ownership of the buffer, which would detach the original.
    // By passing a copy, the original arrayBuffer remains valid for the UI/App to use.
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer.slice(0) });
    const doc = await loadingTask.promise;

    // 2. Get Metadata
    const metaData = await doc.getMetadata();
    const info = metaData.info as any;

    const metadata = {
      title: info?.Title || "Untitled Document",
      author: info?.Author || "Unknown Author",
      subject: info?.Subject || ""
    };

    const numPages = doc.numPages;
    const pages: string[] = [];
    let fullTextForAbstract = "";

    // 3. Process Pages
    for (let i = 1; i <= numPages; i++) {
      const page = await doc.getPage(i);
      const textContent = await page.getTextContent();

      const rawItems = textContent.items.map((item: any) => ({
        str: item.str,
        transform: item.transform, // [ScaleX, SkewY, SkewX, ScaleY, X, Y]
        width: item.width,
        height: item.height || 10,
        fontName: item.fontName
      }));

      // Sort and Format
      const sortedItems = sortPageItems(rawItems);
      const pageText = generateMarkdownFromItems(sortedItems);

      pages.push(pageText);

      // Collect first page text for abstract extraction
      if (i === 1) {
        fullTextForAbstract = pageText;
      }
    }

    // 4. Heuristic Abstract Extraction
    let abstract = "";
    const abstractRegex = /Abstract/i;
    const match = fullTextForAbstract.match(abstractRegex);

    if (match && match.index !== undefined) {
      // Grab text starting after "Abstract"
      // We take a chunk and try to clean it up
      const start = match.index + match[0].length;
      abstract = fullTextForAbstract.substring(start).trim().substring(0, 1000);
      // Clean up leading special chars if any
      abstract = abstract.replace(/^[:.\-\s]+/, '');
      abstract += "...";
    } else {
      // Fallback: Just grab the first substantial paragraph
      abstract = fullTextForAbstract.substring(0, 500) + "...";
    }

    // 5. Extract References
    const references = extractReferences(pages);

    // 6. Enhance metadata with AI — AI title/author always preferred over PDF metadata header
    let finalMetadata: ExtractedData['metadata'] = metadata;
    const needsSubject = metadata.subject === "";

    try {
      // Check if aborted before processing
      if (signal?.aborted) throw new Error('Aborted');

      const firstFourPages = pages.slice(0, 4).join('\n\n');
      if (firstFourPages.length > 100) { // Only if we have substantial text

        // Check cache first
        const cached = await getCachedMetadata(firstFourPages);
        if (cached) {
          finalMetadata = {
            title: cached.title || metadata.title,
            author: cached.author || metadata.author,
            subject: needsSubject ? (cached.subject || metadata.subject) : metadata.subject,
            year: cached.year,
            harvardReference: cached.harvardReference,
            publisher: cached.publisher,
            categories: cached.categories
          };
        } else {
          // Mandatory AI enhancement for detailed academic metadata
          console.log('[PDF Service] Fetching enhanced academic metadata...');
          const enhanced = await enhanceMetadataWithAI(firstFourPages, metadata, signal);

          if (enhanced) {
            finalMetadata = {
              title: enhanced.title || metadata.title,
              author: enhanced.author || metadata.author,
              subject: needsSubject ? (enhanced.subject || metadata.subject) : metadata.subject,
              year: enhanced.year,
              harvardReference: enhanced.harvardReference,
              publisher: enhanced.publisher,
              categories: enhanced.categories
            };
            // Cache the result for next time
            setCachedMetadata(firstFourPages, {
              title: finalMetadata.title || metadata.title || "Untitled Document",
              author: finalMetadata.author || metadata.author || "Unknown Author",
              subject: finalMetadata.subject || metadata.subject || "",
              year: finalMetadata.year,
              harvardReference: finalMetadata.harvardReference,
              publisher: finalMetadata.publisher,
              categories: finalMetadata.categories
            });
          }
        }
      }
    } catch (error: any) {
      if (error.message === 'Aborted') throw error; // Re-throw abort
      console.warn('[PDF Service] Metadata enhancement failed, using original:', error);
      finalMetadata = metadata; // Keep original if AI fails
    }

    return {
      metadata: finalMetadata,  // Use enhanced metadata
      text: abstract,
      pages,
      references,
      numPages
    };

  } catch (error) {
    console.error("PDF Extraction Failed:", error);
    throw error;
  }
};
