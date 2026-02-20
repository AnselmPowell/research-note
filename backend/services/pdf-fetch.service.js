const logger = require('../utils/logger');

const MAX_PDF_SIZE = 25 * 1024 * 1024; // 25MB
const TIMEOUT_MS = 15_000; // 15 seconds

/**
 * Server-side PDF fetch with robust error handling
 * No CORS issues (server-to-server)
 * Handles redirects, validates content-type, enforces timeouts
 * 
 * @param {string} uri - PDF URL to fetch
 * @returns {Promise<ArrayBuffer>} - Binary PDF data
 * @throws {Error} - Classified error: NotPDF | Timeout | HTTP_403 | PdfTooLarge | InvalidURL | NetworkOrCORSError
 */
async function fetchPdfBufferServer(uri) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    // Validate URL format
    let parsedUrl;
    try {
      parsedUrl = new URL(uri);
    } catch {
      throw new Error('InvalidURL');
    }

    // Fetch with proper headers (server-to-server, no CORS)
    const response = await fetch(parsedUrl.toString(), {
      headers: {
        'Accept': 'application/pdf,application/octet-stream;q=0.9,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (compatible; ResearchAssistant/1.0; +https://research-note.app)',
        'Connection': 'keep-alive'
      },
      redirect: 'follow', // Follow redirects (MDPI, repositories, CDNs)
      signal: controller.signal,
      timeout: TIMEOUT_MS
    });

    // Check HTTP status
    if (!response.ok) {
      throw new Error(`HTTP_${response.status}`);
    }

    // Validate content-type (CRITICAL - prevent downloading HTML as "PDF")
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('pdf') && 
        !contentType.toLowerCase().includes('application/octet-stream')) {
      throw new Error('NotPDF');
    }

    // Check size limit BEFORE buffering (prevent memory exhaustion)
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > MAX_PDF_SIZE && contentLength > 0) {
      throw new Error('PdfTooLarge');
    }

    // Stream the PDF as buffer
    const buffer = await response.arrayBuffer();
    
    // Safety check: validate buffer isn't too large (double check)
    if (buffer.byteLength > MAX_PDF_SIZE) {
      throw new Error('PdfTooLarge');
    }

    logger.info(`[PDF Fetch Server] ✅ Successfully fetched PDF from ${uri} (${(buffer.byteLength / 1024).toFixed(2)}KB)`);
    return buffer;

  } catch (error) {
    // Classify error for logging
    const errorName = error.name === 'AbortError' ? 'Timeout' : error.message;
    logger.warn(`[PDF Fetch Server] ❌ Failed to fetch PDF from ${uri}: ${errorName}`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { fetchPdfBufferServer };
