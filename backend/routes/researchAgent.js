// backend/routes/researchAgent.js
//
// API route for the Research Agent.
// POST /api/v1/research-agent/run-task
//
// Receives: { task, papers, notes }
// Returns:  { success, data: { success, response, iterations, memoryUsed, history } }

const express = require('express');
const router = express.Router();

let researchAgentLoop;
try {
  researchAgentLoop = require('../services/researchAgentLoop');
  console.log('[ResearchAgent Route] ✅ researchAgentLoop loaded');
} catch (err) {
  console.error('[ResearchAgent Route] ❌ Failed to load researchAgentLoop:', err.message);
}

router.post('/run-task', async (req, res, next) => {
  try {
    // Support both wrapped { data: {...} } and direct { task, papers, notes }
    const { task, papers, notes, workflowId } = req.body.data || req.body;

    if (!task || typeof task !== 'string' || !task.trim()) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_TASK', message: 'Task is required and must be a non-empty string.' }
      });
    }

    if (!researchAgentLoop) {
      throw new Error('researchAgentLoop module failed to load — check server logs');
    }

    console.log(`\n[ResearchAgent] ════════════════════════════════════`);
    console.log(`[ResearchAgent] 📋 Task: "${task}"`);
    console.log(`[ResearchAgent] 📄 Papers: ${papers?.length || 0}`);
    console.log(`[ResearchAgent] 📝 Notes: ${notes?.length || 0}`);
    console.log(`[ResearchAgent] 📌 Workflow: ${workflowId || 'none (free-form)'}`);
    console.log(`[ResearchAgent] ════════════════════════════════════\n`);

    const workspace = {
      papers: Array.isArray(papers) ? papers : [],
      notes: Array.isArray(notes) ? notes : []
    };

    // 300 second timeout — matches the frontend apiClient AbortController limit
    const TIMEOUT_MS = 300000;

    const agentPromise = researchAgentLoop.runAgentTask(task, workspace, workflowId);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`Research agent timed out after ${TIMEOUT_MS / 1000}s`)),
        TIMEOUT_MS
      )
    );

    const result = await Promise.race([agentPromise, timeoutPromise]);

    console.log(`[ResearchAgent] ✅ Completed in ${result.iterations} iteration(s)`);
    console.log(`[ResearchAgent] Success: ${result.success}`);
    console.log(`[ResearchAgent] Memory entries: ${result.memoryUsed?.length || 0}\n`);

    res.json({ success: true, data: result });

  } catch (err) {
    console.error('[ResearchAgent Route] ❌ Error:', err.message);
    next(err);
  }
});

module.exports = router;
