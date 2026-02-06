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
    const { topics, questions } = req.body.data;
    const result = await geminiService.generateArxivSearchTerms(topics, questions);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
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
    const result = await geminiService.filterRelevantPapers(papers, userQuestions, keywords);
    console.log('[FILTER-PAPERS] Returning:', {
      resultCount: result?.length,
      firstResultTitle: result?.[0]?.title,
      firstResultScore: result?.[0]?.relevanceScore
    });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
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

    const result = await geminiService.extractNotesFromPages(relevantPages, userQuestions, paperTitle, paperAbstract, referenceList);

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

module.exports = router;
