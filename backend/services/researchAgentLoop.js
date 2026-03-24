// backend/services/researchAgentLoop.js
//
// The Research Agent Loop — implements the ReAct (Reason + Act + Observe) pattern.
//
// CRITICAL: Uses model.generateContent() NOT chat.sendMessage()
// Context is REBUILT from scratch every iteration — giving full control over
// what the agent sees and preventing token bloat from accumulated history.
//
// Memory Architecture:
//   - Session Memory (long-term): Agent explicitly saves key findings via save_to_memory.
//     Persists for the entire task session across all iterations.
//   - Last Observation (short-term): Only the previous iteration's tool output.
//     Included in context for exactly ONE iteration, then dropped.
//   - Execution Log: Compact summaries of past actions (tool name + brief result only).
//     Never contains full page text — just a compact trail of what was done.
//
// Context Layer Order (rebuilt every iteration):
//   Layer 0:  System identity + operating rules (adapts if workflow is present)
//   Layer 1:  Available tools catalog
//   Layer 2:  Workspace state (papers + notes count)
//   Layer 2b: Workflow steps (only injected if a workflowId was provided)
//   Layer 3:  Session memory (long-term findings the agent saved)
//   Layer 4:  Execution log (compact summaries of past actions)
//   Layer 5:  Last observation (short-term — this iteration only)
//   Layer 6:  Output contract (JSON format the agent must respond with)

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { initializeEnvironment } = require('../config/env');
const { TOOL_SCHEMA, executeTool } = require('./researchAgentTools');
const { getWorkflow } = require('./researchAgentWorkflows');
const logger = require('../utils/logger');

const config = initializeEnvironment();

let genAI = null;
if (config.geminiApiKey) {
  genAI = new GoogleGenerativeAI(config.geminiApiKey);
} else {
  logger.warn('[ResearchAgent] No GEMINI_API_KEY set — agent will not function');
}

const MAX_ITERATIONS = 20;

// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT BUILDER
// Rebuilds the full context from scratch every iteration.
// Never accumulates stale data — fresh eyes each time.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds a fresh context string for the LLM each iteration.
 *
 * @param {string}      task            - The student's request
 * @param {object}      workspace       - { papers: [], notes: [] }
 * @param {Array}       executionLog    - Compact action summaries (tool + brief result only)
 * @param {Array}       sessionMemory      - Long-term findings saved with save_to_memory
 * @param {Array}       recentObservations - Short-term: array of the last up to 3 tool outputs
 * @param {string|null} workflow           - Optional workflow step instructions
 * @returns {string} Complete context prompt
 */
function buildContext(task, workspace, executionLog, sessionMemory, recentObservations, workflow) {

  // ── LAYER 0: System Identity & Operating Rules ────────────────────────────
  // When a workflow is provided, the operating rules point to it directly.
  // When free-form, we give general guidance.
  const layer0 = `You are a Research Assistant Agent helping university students with academic work.
You have tools to read PDF pages, search keywords, get paper metadata, and access saved notes.

TASK: "${task}"

OPERATING RULES:
1. Use tools to find and read relevant content. Do NOT guess or hallucinate content.
${workflow
      ? '2. A GUIDELINE WORKFLOW is provided below to suggest which tools may help and in what order for this specific task. You may adapt depending on the paper.'
      : '2. Start with get_paper_metadata or list_workspace to understand what is available.'}
3. MEMORY MANAGEMENT: All text fetched from tools will be tagged with a [MEMORY_ID: X]. Fetching data puts it in SHORT-TERM memory (deleted after 2 steps). To prevent forgetting, you MUST use the save_to_session_memory tool and provide the MEMORY_IDs of the chunks you wish to move to LONG-TERM structured memory. DO NOT generate text strings; only provide the array of IDs.
4. Call task_complete ONLY when the response is fully written and complete.
5. Always cite page numbers and paper titles when referencing content in your response.

NEGATIVE CONSTRAINTS:
1. THINKING LENGTH: Your "thinking" field MUST be under 3 sentences. Focus only on the immediate next action.
2. NO REPETITION: Check the "RECENT TOOL OUTPUTS" or "WORKSPACE STATE" before acting. Do NOT call the same tool for the same paper if you already have the result.
3. PARAMETER SAFETY: Any 'tool_call' for 'get_and_read_page_content', 'get_paper_metadata', or 'search_keyword' MUST include the "paper_index" from the workspace list.
4. PAGE COORDINATES: To use 'get_and_read_page_content' or 'get_and_read_multiple_pages', you MUST specify which pages to read. NEVER call these tools without numeric page arguments.`;

  // ── LAYER 1: Tools Catalog ────────────────────────────────────────────────
  const toolLines = TOOL_SCHEMA
    .map(t => `- ${t.name}: ${t.description.split('\n')[0].trim()}`)
    .join('\n');
  const layer1 = `\nAVAILABLE TOOLS:\n${toolLines}`;

  // ── LAYER 2: Workspace Environment ───────────────────────────────────────
  const paperList = workspace.papers.length > 0
    ? workspace.papers
      .map((p, i) => `  [${i}] "${p.title}" by ${p.author || 'Unknown'} — ${p.totalPages} pages`)
      .join('\n')
    : '  No papers loaded.';

  const layer2 = `\nWORKSPACE STATE:
Papers available: ${workspace.papers.length}
${paperList}
Notes available: ${workspace.notes.length}`;

  // ── LAYER 2b: Workflow Steps (optional — only present if workflowId was given) ──
  const layer2b = workflow
    ? `\nSUGGESTED WORKFLOW GUIDELINES:\n${workflow}`
    : '';

  // ── LAYER 3: LONG-TERM STRUCTURED MEMORY (Pinned Findings) ────────────────
  let layer3 = '\nYOUR LONG-TERM STRUCTURED MEMORY (Saved Items):';
  if (sessionMemory.length > 0) {
    // 1. Group by Paper Index
    const paperIds = [...new Set(sessionMemory.filter(m => m.paper_index !== undefined).map(m => m.paper_index))].sort((a,b) => a - b);
    let structuredText = '';

    // Process each paper group
    for (const pIdx of paperIds) {
      structuredText += `\n\n[--- PAPER ${pIdx} ---]`;
      const pItems = sessionMemory.filter(m => m.paper_index === pIdx);
      
      const meta = pItems.filter(m => m.type === 'metadata');
      const struct = pItems.filter(m => m.type === 'structure');
      const pages = pItems.filter(m => m.type === 'page').sort((a, b) => (a.page_number || 0) - (b.page_number || 0));
      const pNotes = pItems.filter(m => m.type === 'note').sort((a, b) => (a.page_number || 0) - (b.page_number || 0));

      if (meta.length) structuredText += `\nMetadata:\n` + meta.map(m => m.content).join('\n');
      if (struct.length) structuredText += `\nStructure Map:\n` + struct.map(m => m.content).join('\n');
      if (pages.length) structuredText += `\nSaved Content:\n` + pages.map(m => m.content).join('\n\n');
      if (pNotes.length) structuredText += `\nSaved Notes:\n` + pNotes.map(m => m.content).join('\n\n');
    }
    
    // 2. Process General Context (no paper index)
    const general = sessionMemory.filter(m => m.paper_index === undefined);
    if (general.length > 0) {
       structuredText += '\n\n[GENERAL CONTEXT]\n' + general.map(m => m.content).join('\n\n');
    }

    layer3 += structuredText;
  } else {
    layer3 += '\n  (Memory is currently empty. Use save_to_session_memory with MEMORY_IDs to store content here.)';
  }

  // ── LAYER 4: Task Reminder & Execution Log (compact Summaries) ──────────
  let layer4 = `\n\n🎯 ORIGINAL USER TASK: "${task}"\n\nACTIONS TAKEN SO FAR:`;
  if (executionLog.length > 0) {
    const logLines = executionLog
      .map((e, i) => `  Step ${i + 1}: ${e.tool}(${e.paramsSummary}) → ${e.resultSummary}\n    Thought: ${e.thinking}`)
      .join('\n');
    layer4 += '\n' + logLines;
  } else {
    layer4 += '\n  No actions taken yet — this is your first step.';
  }

  // ── LAYER 5: Last Observation (SHORT-TERM — this iteration only) ─────────
  let layer5 = '';
  if (recentObservations && recentObservations.length > 0) {
    const obsText = recentObservations.map((obs, i) => `[Output from ${i + 1} step(s) ago]:\n${obs}`).join('\n\n');
    layer5 = `\nRECENT TOOL OUTPUTS (SHORT-TERM — available for a few iterations only):\n${obsText}`;
  }

  // ── LAYER 6: Output Contract ──────────────────────────────────────────────
  const layer6 = `\n\nYOUR RESPONSE MUST BE ONLY VALID JSON — no markdown, no explanation, no other text.
IMPORTANT: Your ONLY allowed actions are "tool_call" and "task_complete".
"save_to_memory" is a TOOL, not an action — it must go inside "tool" and "params".

For a tool call:
{
  "thinking": "Your step-by-step reasoning about what to do next",
  "action": "tool_call",
  "tool": "name_of_tool",
  "params": { "param_name": "value" }
}

For completing the task:
{
  "thinking": "Why the task is now fully complete",
  "action": "task_complete",
  "params": { "response": "Your complete well-formatted response to the student" }
}`;

  return [layer0, layer1, layer2, layer2b, layer3, layer4, layer5, layer6].join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON EXTRACTION
// More robust than simple regex anchors — handles LLM preamble text,
// code fences, and very long task_complete responses.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extracts and parses the JSON decision object from the LLM response text.
 * Tries multiple strategies to handle LLM formatting quirks.
 *
 * @param {string} responseText - Raw text from Gemini
 * @returns {{ decision: object, error: string|null }}
 */
function extractDecision(responseText) {
  let cleaned = responseText.trim();

  // Strategy 1: Extract content from a code fence if present (anywhere in the text)
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  // Strategy 2: Find first { to last } — handles any preamble/postamble text from LLM
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }

  // Attempt parse
  try {
    const decision = JSON.parse(cleaned);
    return { decision, error: null };
  } catch (parseError) {
    return { decision: null, error: parseError.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AGENT LOOP
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Main Research Agent Loop — orchestrates the ReAct cycle.
 *
 * @param {string}           task       - The student's request
 * @param {object}           workspace  - { papers: PaperData[], notes: NoteData[] }
 * @param {string|undefined} workflowId - Optional preset workflow ID (e.g. "get_findings")
 * @returns {Promise<AgentResult>}
 */
async function runAgentTask(task, workspace, workflowId) {
  if (!genAI) {
    throw new Error('Gemini AI not initialized — check GEMINI_API_KEY');
  }

  // Resolve workflowId to the instruction text (null = free-form task)
  const workflow = getWorkflow(workflowId || null);
  if (workflow) {
    logger.info(`[ResearchAgent] Workflow loaded: "${workflowId}"`);
  } else {
    logger.info(`[ResearchAgent] No workflow — free-form reasoning`);
  }

  // Session state — fresh for each task
  const executionLog = [];       // Compact summaries of all past actions
  const sessionMemory = [];      // Long-term: agent-curated key findings via save_to_memory
  const sessionContextPool = {}; // NEW: High-capacity temporary storage for raw tool outputs (mapped to IDs)
  let recentObservations = [];   // Short-term: up to last 3 tool outputs
  let iteration = 0;

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      temperature: 0.2  // Low temperature = more reliable structured JSON output
    }
  });

  logger.info(`[ResearchAgent] ══════════════════════════════════════`);
  logger.info(`[ResearchAgent] Starting task: "${task}"`);
  logger.info(`[ResearchAgent] Papers: ${workspace.papers.length}, Notes: ${workspace.notes.length}`);
  logger.info(`[ResearchAgent] ══════════════════════════════════════`);

  while (iteration < MAX_ITERATIONS) {
    iteration++;
    logger.info(`[ResearchAgent] === Iteration ${iteration}/${MAX_ITERATIONS} ===`);

    // ── STEP A: Build fresh context and call Gemini ──────────────────────
    let responseText;
    try {
      const context = buildContext(
        task,
        workspace,
        executionLog,
        sessionMemory,
        recentObservations, // FIXED: Pass the full array as expected by buildContext
        workflow
      );

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: context }] }]
      });

      responseText = result.response.text();
      
      // Log truncated response so we can see what the model is doing
      const preview = responseText.length > 200 
        ? responseText.substring(0, 200) + '...' 
        : responseText;
      logger.info(`[ResearchAgent] Raw Response (truncated): ${preview.replace(/\n/g, ' ')}`);
      logger.info(`[ResearchAgent] Total length: ${responseText.length} chars`);

    } catch (apiError) {
      logger.error(`[ResearchAgent] ❌ Error in iteration ${iteration}:`, apiError);
      recentObservations.unshift(`ERROR: Tool output/API failed: ${apiError.message || 'Unknown error'}`);
      if (recentObservations.length > 3) recentObservations.pop();
      continue;
    }

    // ── STEP B: Parse the JSON response ─────────────────────────────────
    const { decision, error: parseError } = extractDecision(responseText);

    if (parseError || !decision) {
      logger.warn(`[ResearchAgent] JSON parse failed on iteration ${iteration}: ${parseError}`);
      recentObservations.unshift('ERROR: Your response was not valid JSON. You MUST respond with ONLY the JSON format — no other text, no markdown.');
      if (recentObservations.length > 3) recentObservations.pop();
      continue;
    }

    if (decision.thinking) {
      const thinkingPreview = decision.thinking.length > 150
        ? decision.thinking.substring(0, 150) + '...'
        : decision.thinking;
      logger.info(`[ResearchAgent] Agent Thought: "${thinkingPreview.replace(/\n/g, ' ')}"`);
    }

    logger.info(`[ResearchAgent] Decision: action=${decision.action}, tool=${decision.tool || 'N/A'}`);

    // ── STEP C: Handle task_complete ─────────────────────────────────────
    if (decision.action === 'task_complete') {
      const finalResponse = decision.params?.response || 'Task completed.';
      logger.info(`[ResearchAgent] ✅ Task complete after ${iteration} iteration(s)`);
      logger.info(`[ResearchAgent] Memory entries used: ${sessionMemory.length}`);

      return {
        success: true,
        response: finalResponse,
        iterations: iteration,
        memoryUsed: sessionMemory,
        history: executionLog
      };
    }

    // ── STEP D: Handle tool_call ──────────────────────────────────────────
    if (decision.action === 'tool_call' && decision.tool) {
      // Pass sessionContextPool to allow tools to "register" content IDs
      const toolResult = await executeTool(decision.tool, decision.params || {}, workspace, genAI, sessionContextPool);

      // Guard against malformed tool result
      const observation = (toolResult && typeof toolResult.observation === 'string')
        ? toolResult.observation
        : `ERROR: Tool "${decision.tool}" returned no output.`;

      // Handle save_to_memory or auto-saves — push to long-term session memory
      if (toolResult?.memoryEntries) {
        // Handle array of entries (from new multi-save tool)
        sessionMemory.push(...toolResult.memoryEntries);
        logger.info(`[ResearchAgent] 💾 Multi-Memory saved: ${toolResult.memoryEntries.length} items`);
      } else if (toolResult?.memoryEntry) {
        sessionMemory.push(toolResult.memoryEntry);
        logger.info(`[ResearchAgent] 💾 Memory saved: [${toolResult.memoryEntry.type}]`);
      }

      // Build compact param summary for the execution log
      const paramsSummary = Object.entries(decision.params || {})
        .map(([k, v]) => {
          const val = typeof v === 'string' && v.length > 40
            ? v.substring(0, 40) + '...'
            : String(v);
          return `${k}=${val}`;
        })
        .join(', ');

      // Compact result summary for log — never stores full page text
      const resultSummary = observation.length > 400
        ? observation.substring(0, 400) + '... (truncated, use save_to_memory if needed)'
        : observation;

      // Push to execution log (persists entire session — compact only)
      executionLog.push({
        iteration,
        tool: decision.tool,
        paramsSummary,
        resultSummary,
        thinking: (decision.thinking || '').substring(0, 400)
      });

      // Set short-term observation array — full raw output, available ONLY for next few iterations
      recentObservations.unshift(observation);
      if (recentObservations.length > 3) {
        recentObservations.pop(); // Keep only the 3 most recent
      }

      logger.info(`[ResearchAgent] Tool: ${decision.tool}`);
      logger.info(`[ResearchAgent] Result: ${resultSummary.substring(0, 100)}`);

    } else if (decision.action !== 'task_complete') {
      // Invalid or missing action
      const errorObs = `ERROR: Invalid action "${decision.action}". You must use "tool_call" or "task_complete".`;
      recentObservations.unshift(errorObs);
      if (recentObservations.length > 3) recentObservations.pop();
      logger.warn(`[ResearchAgent] Invalid action: "${decision.action}"`);
    }
  }

  // ── MAX ITERATIONS EXCEEDED ───────────────────────────────────────────────
  logger.warn(`[ResearchAgent] ⚠️  Max iterations (${MAX_ITERATIONS}) reached without task_complete`);

  // Return any partial findings from session memory
  const partialFindings = sessionMemory.length > 0
    ? '\n\nPartial findings gathered during research:\n' +
    sessionMemory.map(m => `- [${m.type.toUpperCase()}]: ${m.content.substring(0, 100)}...`).join('\n')
    : '';

  return {
    success: false,
    response: `The research agent was unable to complete the task within ${MAX_ITERATIONS} steps.${partialFindings}\n\nPlease try a more specific request.`,
    iterations: MAX_ITERATIONS,
    memoryUsed: sessionMemory,
    history: executionLog
  };
}

module.exports = { runAgentTask };
