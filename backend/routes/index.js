const express = require('express');
const router = express.Router();

const geminiRoutes = require('./gemini');
const databaseRoutes = require('./database');
const agentRoutes = require('./agent');
const arxivRoutes = require('./arxiv');

router.use('/gemini', geminiRoutes);
router.use('/database', databaseRoutes);
router.use('/agent', agentRoutes);
router.use('/arxiv', arxivRoutes);

module.exports = router;
