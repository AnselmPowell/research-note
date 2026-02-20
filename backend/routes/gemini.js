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
  try {
    const { papers, userQuestions, keywords } = req.body.data;
    console.log('[FILTER-PAPERS] Received:', {
      papersCount: papers?.length,
      userQuestionsCount: userQuestions?.length,
      keywordsCount: keywords?.length,
      firstPaperTitle: papers?.[0]?.title
    });
    
    // Add timeout of 120 seconds for filtering (embedding generation can be slow)
    const filterPromise = geminiService.filterRelevantPapers(papers, userQuestions, keywords);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Filter papers operation timed out after 120s')), 120000)
    );
    
    const result = await Promise.race([filterPromise, timeoutPromise]);
    
    console.log('[FILTER-PAPERS] Returning:', {
      resultCount: result?.length,
      firstResultTitle: result?.[0]?.title,
      firstResultScore: result?.[0]?.relevanceScore
    });
    res.json({ success: true, data: result });
  } catch (err) { 
    console.error('[FILTER-PAPERS] Error:', {
      message: err.message,
      type: err.constructor.name,
      papersCount: req.body?.data?.papers?.length
    });
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

    // Add timeout of 150 seconds for note extraction (can be slow with many pages)
    const extractPromise = geminiService.extractNotesFromPages(relevantPages, userQuestions, paperTitle, paperAbstract, referenceList);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Extract notes operation timed out after 150s')), 150000)
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
