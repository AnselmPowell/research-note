const express = require('express');
const router = express.Router();

/**
 * ArXiv API Proxy
 * Proxies requests to arXiv API to avoid CORS issues in production
 */
router.get('/proxy', async (req, res, next) => {
  try {
    const { url } = req.query;
    
    if (!url || !url.startsWith('https://export.arxiv.org/')) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_URL', message: 'Only arXiv URLs are allowed' }
      });
    }

    // Fetch from arXiv directly (server-side, no CORS issues)
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`ArXiv API returned ${response.status}`);
    }

    const xmlText = await response.text();
    
    res.json({
      success: true,
      data: xmlText
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
