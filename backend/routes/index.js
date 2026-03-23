const express = require('express');
const router = express.Router();

const geminiRoutes = require('./gemini');
const databaseRoutes = require('./database');
const agentRoutes = require('./agent');
const arxivRoutes = require('./arxiv');
const searchRoutes = require('./search');
const pdfRoutes = require('./pdf');
const researchAgentRoutes = require('./researchAgent');

router.use('/gemini', geminiRoutes);
router.use('/database', databaseRoutes);
router.use('/agent', agentRoutes);
router.use('/arxiv', arxivRoutes);
router.use('/search', searchRoutes);
router.use('/pdf', pdfRoutes);
router.use('/research-agent', researchAgentRoutes);

module.exports = router;
