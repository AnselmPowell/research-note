const express = require('express');
const router = express.Router();
const { fetchPdfBufferServer } = require('../services/pdf-fetch.service');
const logger = require('../utils/logger');

/**
 * POST /api/v1/pdf/fetch-pdf
 * 
 * Server-side PDF fetch endpoint
 * Eliminates CORS issues by fetching server-to-server
 * 
 * Request body:
 * {
 *   "url": "https://arxiv.org/pdf/2024.01234.pdf"
 * }
 * 
 * Response (success):
 * 200 OK
 * Content-Type: application/pdf
 * [Binary PDF data]
 * 
 * Response (failure):
 * {
 *   "error": "NotPDF | Timeout | HTTP_403 | PdfTooLarge | InvalidURL | NetworkOrCORSError"
 * }
 */
router.post('/fetch-pdf', async (req, res) => {
  const { url } = req.body;

  // Validate input
  if (!url || typeof url !== 'string') {
    logger.warn('[PDF Fetch API] Invalid request: missing or invalid URL');
    return res.status(400).json({ error: 'InvalidURL' });
  }

  try {
    logger.info(`[PDF Fetch API] Fetching PDF from: ${url}`);
    
    // Fetch PDF buffer server-side (no CORS issues)
    const buffer = await fetchPdfBufferServer(url);

    // Send as binary response
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Length', buffer.byteLength);
    res.set('Content-Disposition', 'inline; filename=document.pdf');
    res.send(Buffer.from(buffer));

  } catch (error) {
    const errorMsg = error.message || 'NetworkOrCORSError';
    const statusCode = mapErrorToStatusCode(errorMsg);
    
    logger.error(`[PDF Fetch API] Error fetching PDF from ${url}: ${errorMsg}`);
    return res.status(statusCode).json({ error: errorMsg });
  }
});

/**
 * Map error types to appropriate HTTP status codes
 * @param {string} errorMsg - Error message from fetchPdfBufferServer
 * @returns {number} - HTTP status code
 */
function mapErrorToStatusCode(errorMsg) {
  if (errorMsg === 'InvalidURL') return 400;                    // Bad Request
  if (errorMsg === 'NotPDF') return 415;                       // Unsupported Media Type
  if (errorMsg === 'PdfTooLarge') return 413;                  // Payload Too Large
  if (errorMsg === 'Timeout') return 504;                      // Gateway Timeout
  if (errorMsg.includes('HTTP_403')) return 403;               // Forbidden
  if (errorMsg.includes('HTTP_404')) return 404;               // Not Found
  if (errorMsg.includes('HTTP_')) return 502;                  // Bad Gateway (upstream error)
  return 502;                                                   // Default: Bad Gateway
}

module.exports = router;
