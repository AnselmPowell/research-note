const express = require('express');
const router = express.Router();
const geminiService = require('../services/geminiService');

router.post('/enhance-metadata', async (req, res, next) => {
  try {
    const { firstFourPagesText, currentMetadata } = req.body.data;
    const result = await geminiService.enhanceMetadata(firstFourPagesText, currentMetadata);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/search-variations', async (req, res, next) => {
  try {
    const { query } = req.body.data;
    const result = await geminiService.generateSearchVariations(query);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/arxiv-search-terms', async (req, res, next) => {
  try {
    // DEFENSIVE: Handle missing data wrapper
    const data = req.body.data || req.body || {};
    const { topics, questions } = data;
    
    console.log('[arxiv-search-terms] Received request:', {
      hasData: !!req.body.data,
      dataType: typeof data,
      topicsType: typeof topics,
      questionsType: typeof questions
    });
    
    const result = await geminiService.generateArxivSearchTerms(topics, questions);
    res.json({ success: true, data: result });
  } catch (err) { 
    console.error('[arxiv-search-terms] Error:', {
      message: err.message,
      stack: err.stack,
      type: err.constructor.name
    });
    next(err); 
  }
});

router.post('/embedding', async (req, res, next) => {
  try {
    const { text, taskType } = req.body.data;
    const result = await geminiService.getEmbedding(text, taskType);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/batch-embeddings', async (req, res, next) => {
  try {
    const { texts, taskType } = req.body.data;
    const result = await geminiService.getBatchEmbeddings(texts, taskType);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/filter-papers', async (req, res, next) => {
  const requestId = Math.random().toString(36).substring(7);
  const startTime = Date.now();
  const requestStartTime = new Date().toISOString();
  
  try {
    // === INVESTIGATION: Log request start ===
    console.log(`\n[FILTER-${requestId}] ⏱️  REQUEST START: ${requestStartTime}`);
    console.log(`[FILTER-${requestId}] 🔗 Client: ${req.ip}`);
    console.log(`[FILTER-${requestId}] 📊 Socket timeout: ${req.socket?.timeout}ms`);
    
    const { papers, userQuestions, keywords } = req.body.data;
    console.log(`[FILTER-${requestId}] 📥 Input: ${papers?.length} papers, ${userQuestions?.length} questions`);
    
    // === INVESTIGATION: Track connection lifecycle ===
    req.on('close', () => {
      const elapsed = Date.now() - startTime;
      console.warn(`[FILTER-${requestId}] ⚠️  CLIENT CLOSED: connection ended after ${elapsed}ms`);
    });
    
    req.on('aborted', () => {
      const elapsed = Date.now() - startTime;
      console.warn(`[FILTER-${requestId}] ❌ REQUEST ABORTED: by client after ${elapsed}ms`);
    });
    
    // Timeout varies by environment AND operation:
    // Filtering with LLM selection is VERY SLOW because:
    // - Stage 1: Generate embeddings for 77 papers = ~30-40 seconds
    // - Stage 2: LLM call on top 100 papers = ~65 seconds (observed in logs)
    // - Stage 3: LLM call on 80 leftover papers = ~60+ seconds (was timing out)
    // - Plus overhead and network latency
    // ACTUAL NEEDED: 150-200 seconds minimum, safety margin = 300s
    // - Localhost (dev): 300 seconds (5 minutes)
    // - Production: 300 seconds (5 minutes - same, network delay minimal at this scale)
    const isDev = process.env.NODE_ENV === 'development';
    const timeoutMs = 300000; // 300s both dev and prod (5 minutes - LLM operations are inherently slow)
    
    console.log(`[FILTER-${requestId}] ⏳ Timeout set: ${timeoutMs / 1000}s`);
    console.log(`[FILTER-${requestId}] 🔄 Starting filtering operation...`);
    
    const filterPromise = geminiService.filterRelevantPapers(papers, userQuestions, keywords);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Filter papers operation timed out after ${timeoutMs/1000}s`)), timeoutMs)
    );
    
    const result = await Promise.race([filterPromise, timeoutPromise]);
    
    const elapsed = Date.now() - startTime;
    
    // === INVESTIGATION: Log successful response ===
    console.log(`[FILTER-${requestId}] ✅ COMPLETED: ${elapsed}ms`);
    console.log(`[FILTER-${requestId}] 📤 Returning: ${result?.length} papers`);
    console.log(`[FILTER-${requestId}] ⏱️  Total elapsed: ${(elapsed / 1000).toFixed(2)}s\n`);
    
    res.json({ success: true, data: result });
  } catch (err) { 
    const elapsed = Date.now() - startTime;
    
    // === INVESTIGATION: Log error with timing ===
    console.error(`[FILTER-${requestId}] ❌ ERROR after ${elapsed}ms (${(elapsed / 1000).toFixed(2)}s):`);
    console.error(`[FILTER-${requestId}]    Message: ${err.message}`);
    console.error(`[FILTER-${requestId}]    Type: ${err.constructor.name}`);
    console.error(`[FILTER-${requestId}]    Socket connected: ${!req.socket?.destroyed}\n`);
    next(err); 
  }
});

router.post('/extract-notes', async (req, res, next) => {
  try {
    const { relevantPages, userQuestions, paperTitle, paperAbstract, referenceList } = req.body.data;

    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║ [ROUTE] /extract-notes - REQUEST START                        ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log('📄 Paper:', paperTitle);
    console.log('📊 Pages received:', relevantPages?.length);
    console.log('❓ Questions:', userQuestions);
    console.log('\n🔍 First page inspection:');
    console.log('   - Has pdfUri:', !!relevantPages?.[0]?.pdfUri);
    console.log('   - pdfUri value:', relevantPages?.[0]?.pdfUri);
    console.log('   - pageIndex:', relevantPages?.[0]?.pageIndex);
    console.log('   - Available keys:', relevantPages?.[0] ? Object.keys(relevantPages[0]) : []);

    // Timeout for note extraction:
    // Multiple Gemini API calls for each of 20+ papers and their pages
    // Each paper can have multiple pages, each requiring LLM processing
    // Similar to filtering, LLM operations are inherently slow
    // - Localhost: 300 seconds (5 minutes)
    // - Production: 300 seconds (5 minutes - same timeout)
    const isDev = process.env.NODE_ENV === 'development';
    const timeoutMs = 300000; // 300s both dev and prod (5 minutes - LLM operations are slow)
    
    console.log('[EXTRACT-NOTES] Starting with timeout:', {
      timeoutSeconds: timeoutMs / 1000,
      environment: isDev ? 'development' : 'production'
    });
    
    const extractPromise = geminiService.extractNotesFromPages(relevantPages, userQuestions, paperTitle, paperAbstract, referenceList);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Extract notes operation timed out after ${timeoutMs/1000}s`)), timeoutMs)
    );
    
    const result = await Promise.race([extractPromise, timeoutPromise]);

    console.log('\n✅ Notes extraction complete:');
    console.log('   - Notes count:', result?.length);
    console.log('   - First note has pdfUri:', !!result?.[0]?.pdfUri);
    console.log('   - First note pdfUri:', result?.[0]?.pdfUri);
    console.log('   - First note pageNumber:', result?.[0]?.pageNumber);
    console.log('   - First note quote preview:', result?.[0]?.quote?.substring(0, 60) + '...');
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║ [ROUTE] /extract-notes - REQUEST END                          ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/search', async (req, res, next) => {
  try {
    const { query } = req.body.data;
    const result = await geminiService.performSearch(query);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/insight-queries', async (req, res, next) => {
  try {
    const { userQuestions, contextQuery } = req.body.data;
    const result = await geminiService.generateInsightQueries(userQuestions, contextQuery);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// Gemini Grounding Search — uses Google Search tool via Gemini SDK
// Query is pre-built by aggregator with filetype:pdf / site operators.
// Returns raw results array; normaliseGrounding() in aggregator maps to ArxivPaper[].
router.post('/grounding-search', async (req, res, next) => {
  try {
    const { query } = req.body.data;
    const result = await geminiService.searchWithGrounding(query);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

module.exports = router;
