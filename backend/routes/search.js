const express = require('express');
const router = express.Router();
const { initializeEnvironment } = require('../config/env');

const config = initializeEnvironment();

// ─────────────────────────────────────────────────────────────────────────────
// SEARCH API PROXY ROUTES
// Each route proxies a third-party search API server-side to:
//   1. Keep API keys out of the browser
//   2. Avoid CORS issues
//   3. Allow centralised rate-limit / timeout control
//
// All routes follow the same contract:
//   POST /api/v1/search/<provider>
//   Body: { data: { query: string } }
//   Returns: { success: true, data: <raw results array> }
//   On failure: { success: true, data: [] }  ← never throws, never blocks others
// ─────────────────────────────────────────────────────────────────────────────


// ── OpenAlex ─────────────────────────────────────────────────────────────────
// Free, no API key required. Uses "polite pool" mailto param for better limits.
router.post('/openalex', async (req, res, next) => {
    try {
        const { query } = req.body.data;
        if (!query) return res.json({ success: true, data: [] });

        const params = new URLSearchParams({
            search: query,
            filter: 'has_fulltext:true',
            per_page: '50',
            mailto: 'research-note-app@example.com'
        });

        const response = await fetch(`https://api.openalex.org/works?${params}`, {
            signal: AbortSignal.timeout(15000)
        });

        if (!response.ok) {
            console.warn(`[Search/OpenAlex] API returned ${response.status}`);
            return res.json({ success: true, data: [] });
        }

        const data = await response.json();
        res.json({ success: true, data: data.results || [] });
    } catch (err) {
        console.warn('[Search/OpenAlex] Failed:', err.message);
        res.json({ success: true, data: [] }); // graceful — never block other APIs
    }
});


// ── Google Custom Search Engine ───────────────────────────────────────────────
// Mirrors original searchScholar logic exactly:
//   - 5 pages × 10 = up to 50 results (pages [1, 11, 21, 31, 41])
//   - fileType: 'pdf' always — our pipeline only downloads PDFs
//   - Per-page fetch: one failed page never discards the rest
//   - 429 quota errors logged per-page
// Keys: GOOGLE_SEARCH_KEY + GOOGLE_SEARCH_CX (already in .env)
router.post('/google-cse', async (req, res, next) => {
    try {
        const { query } = req.body.data;
        if (!query) return res.json({ success: true, data: [] });

        const key = config.googleSearchKey;
        const cx  = config.googleSearchCx;

        if (!key || !cx) {
            console.warn('[Search/GoogleCSE] Keys not configured — skipping');
            return res.json({ success: true, data: [] });
        }

        // Original: 5 pages × 10 = 50 results max
        const pages = [1, 11, 21, 31, 41];

        const fetchPage = async (start) => {
            const params = new URLSearchParams({
                key,
                cx,
                q: query,
                num: '10',
                start: String(start),
                fileType: 'pdf'  // Always PDF — matches original pdfOnly:true for our pipeline
            });

            const response = await fetch(
                `https://www.googleapis.com/customsearch/v1?${params.toString()}`,
                { signal: AbortSignal.timeout(10000) }
            );

            if (!response.ok) {
                if (response.status === 429) {
                    console.warn('[Search/GoogleCSE] Quota exceeded on page', start);
                }
                return { items: [] }; // Per-page failure — don't discard other pages
            }

            return response.json().catch(() => ({ items: [] }));
        };

        const results = await Promise.all(pages.map(start => fetchPage(start)));
        const items = results.flatMap(data => data.items || []);

        res.json({ success: true, data: items });
    } catch (err) {
        console.warn('[Search/GoogleCSE] Failed:', err.message);
        res.json({ success: true, data: [] });
    }
});


// ── PDFVector ─────────────────────────────────────────────────────────────────
// Mirrors original searchPublications logic exactly:
//   - Strategy Step 1: over-fetch 40 results (re-ranking happens in the aggregator)
//   - Full fields array from original — all fields needed for normalisation + scoring
//   - offset: 0 explicit (as per original)
//   - 65s timeout (original uses 60s AbortController — we add 5s backend buffer)
//   - 504 gateway timeout handled separately for clear logging
//   - No CORS proxy needed — backend calls PDFVector directly
router.post('/pdfvector', async (req, res, next) => {
    try {
        const { query } = req.body.data;
        
        // NEW: Log incoming request
        console.log('[Search/PDFVector] 📥 Incoming request:', {
            query,
            queryLength: query?.length,
            queryType: typeof query
        });
        
        if (!query) {
            console.log('[Search/PDFVector] ⚠️  No query provided, returning empty results');
            return res.json({ success: true, data: [] });
        }

        const API_KEY = process.env.PDFVECTOR_API_KEY || 'pdfvector_ANF9ZhDTqv2UjqrE75uZzBjWTm2PdNHk';

        // Full payload matching original — all fields used for scoring + normalisation
        const payload = {
            query,
            limit: 40,      // Strategy Step 1: over-fetch, re-rank client-side
            offset: 0,
            fields: [
                'doi',
                'title',
                'url',
                'providerURL',
                'authors',
                'date',
                'year',
                'totalCitations',
                'totalReferences',
                'abstract',
                'pdfURL',
                'provider',
                'providerData'
            ]
        };

        // NEW: Log the payload being sent to PDFVector
        console.log('[Search/PDFVector] 📤 Sending to PDFVector API:', {
            query: payload.query,
            limit: payload.limit,
            fieldsCount: payload.fields.length
        });

        const response = await fetch('https://www.pdfvector.com/v1/api/academic-search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(65000)   // Original: 60s — we add 5s buffer
        });

        // NEW: Log response status
        console.log('[Search/PDFVector] 📨 PDFVector response status:', response.status);

        if (!response.ok) {
            if (response.status === 504) {
                // Original handles 504 separately — server-side timeout from PDFVector
                console.warn('[Search/PDFVector] ❌ 504 Gateway Timeout — PDFVector server timed out');
            } else {
                console.warn(`[Search/PDFVector] ❌ API returned ${response.status}`);
            }
            return res.json({ success: true, data: [] });
        }

        const data = await response.json().catch(() => {
            console.warn('[Search/PDFVector] ⚠️  Failed to parse JSON response');
            return { results: [] };
        });
        
        // NEW: Log what we received from PDFVector
        console.log('[Search/PDFVector] 📦 Response data:', {
            hasResults: !!data.results,
            resultsCount: data.results?.length || 0,
            dataKeys: data.results ? Object.keys(data.results[0] || {}) : [],
            firstResult: data.results?.[0],
            fullData: data
        });
        
        const returnData = data.results || [];
        console.log('[Search/PDFVector] ✅ Returning', returnData.length, 'results');
        
        res.json({ success: true, data: returnData });
    } catch (err) {
        console.warn('[Search/PDFVector] ❌ Failed:', {
            message: err.message,
            stack: err.stack,
            name: err.name
        });
        res.json({ success: true, data: [] });
    }
});


module.exports = router;
