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

const MAX_ITERATIONS = 15;

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
      : '2. Start with get_paper_info or list_workspace to understand what is available.'}
3. MEMORY IS SHORT-TERM by default: Page text from read_page/read_multiple_pages is only available
   for ONE iteration — it will be gone next step. Always call save_to_memory immediately
   after reading important content, before your next tool call.
4. Call task_complete only when the response is fully written and complete.
5. Always cite page numbers and paper titles when referencing content in your response.`;

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

  // ── LAYER 3: Session Memory (LONG-TERM — persists all iterations) ────────
  let layer3 = '\nSESSION MEMORY (your saved findings — available for all future iterations):';
  if (sessionMemory.length > 0) {
    const memList = sessionMemory
      .map(m => `  [${m.label}]: ${m.content}`)
      .join('\n');
    layer3 += '\n' + memList;
  } else {
    layer3 += '\n  Empty — use save_to_memory after reading pages to store key findings.';
  }

  // ── LAYER 4: Execution Log (compact summaries only — no full page text) ──
  let layer4 = '\nACTIONS TAKEN SO FAR:';
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
        recentObservations,
        workflow
      );

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: context }] }]
      });

      responseText = result.response.text();
      logger.info(`[ResearchAgent] Response: ${responseText.length} chars`);

    } catch (apiError) {
      logger.error(`[ResearchAgent] Gemini API error on iteration ${iteration}:`, apiError.message);
      // Set as short-term error — agent will see it next iteration and try a different approach
      recentObservations.unshift(`ERROR: API call failed (${apiError.message}). Try a simpler or different tool call.`);
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
      const toolResult = await executeTool(decision.tool, decision.params || {}, workspace, genAI);

      // Guard against malformed tool result
      const observation = (toolResult && typeof toolResult.observation === 'string')
        ? toolResult.observation
        : `ERROR: Tool "${decision.tool}" returned no output.`;

      // Handle save_to_memory or auto-saves — push to long-term session memory
      if (toolResult?.memoryEntry) {
        sessionMemory.push(toolResult.memoryEntry);
        logger.info(`[ResearchAgent] 💾 Memory saved: [${toolResult.memoryEntry.label}]`);
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
    sessionMemory.map(m => `- [${m.label}]: ${m.content}`).join('\n')
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
