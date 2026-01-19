
import * as pdfjsLib from 'pdfjs-dist';

// Set the worker source to the same version as the library
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs';

interface ExtractedData {
  metadata: {
    title?: string;
    author?: string;
    subject?: string;
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
    // Use same fetch pattern as fetchPdfBuffer but with smaller timeout
    let response;
    try {
      response = await fetch(uri, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error('Direct fetch failed');
    } catch (directError) {
      // Use same proxy fallback as existing code
      const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(uri)}`;
      response = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error('Proxy fetch failed');
    }

    // Get buffer to test PDF validity
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
    doc.destroy();
    return true;

  } catch (error: any) {
    console.log(`[PDF Validation] URL ${uri} is not a valid PDF:`, error.message);
    return false;
  }
};

export const fetchPdfBuffer = async (uri: string): Promise<ArrayBuffer> => {
  try {
    // 1. Try Direct Fetch
    const response = await fetch(uri);
    if (response.ok) {
      return await response.blob().then(b => b.arrayBuffer());
    }
    throw new Error('Direct fetch failed');
  } catch (directError) {
    // 2. Fallback to Proxy
    console.log(`[PDF Service] Direct fetch failed for ${uri}, trying proxy...`);
    try {
      const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(uri)}`;
      const response = await fetch(proxyUrl);
      if (!response.ok) {
        // Throw specific error for proxy failures (likely protected site)
        throw new Error(`ProxyError:Status=${response.status}`);
      }
      return await response.blob().then(b => b.arrayBuffer());
    } catch (proxyError: any) {
      console.error(`[PDF Service] All fetch attempts failed for ${uri}`);

      // Preserve "ProxyError" if it was thrown above, otherwise generic
      if (proxyError.message && proxyError.message.includes('ProxyError')) {
        throw proxyError;
      }
      throw new Error('NetworkOrCORSError');
    }
  }
};

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


export const extractPdfData = async (arrayBuffer: ArrayBuffer): Promise<ExtractedData> => {
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

    return {
      metadata,
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
