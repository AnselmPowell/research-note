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
    const result = await geminiService.filterRelevantPapers(papers, userQuestions, keywords);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/extract-notes', async (req, res, next) => {
  try {
    const { relevantPages, userQuestions, paperTitle, paperAbstract, referenceList } = req.body.data;
    const result = await geminiService.extractNotesFromPages(relevantPages, userQuestions, paperTitle, paperAbstract, referenceList);
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
