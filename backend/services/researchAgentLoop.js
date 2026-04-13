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

const MAX_ITERATIONS = 40;

// Scaleable set of all known tool names - derived from TOOL_SCHEMA so it never goes stale
// when new tools are added to researchAgentTools.js
const KNOWN_TOOLS = new Set(TOOL_SCHEMA.map(t => t.name));

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
    const paperIds = [...new Set(sessionMemory.filter(m => m.paper_index !== undefined).map(m => m.paper_index))].sort((a, b) => a - b);
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
IMPORTANT: You can output an array of 1 or 2 actions at a time (MAX 2).
RULE: If you are chaining actions, 'save_to_session_memory' MUST be the first action in the array.

Return an object with an "actions" array:
{
  "actions": [
    {
      "thinking": "Brief reasoning",
      "action": "tool_call",
      "tool": "name",
      "params": { ... }
    }
  ]
}

CRITICAL PARAM RULES:
- For save_to_session_memory, params key MUST be lowercase: { "memory_ids": ["Page_P0_Pg1", "Page_P0_Pg2"] }
- The IDs come from [MEMORY_ID: X] tags in tool output. Copy them exactly as written.
- For get_and_read_multiple_pages: { "paper_index": 0, "start_page": 1, "end_page": 4 }

For completing the task, the action is "task_complete". The "response" param must be a LONG-FORM STRING (not an object) containing your complete academic findings. You can use markdown for formatting.`;

  return [layer0, layer1, layer2, layer2b, layer3, layer4, layer5, layer6].join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON EXTRACTION
// More robust than simple regex anchors — handles LLM preamble text,
// code fences, and very long task_complete responses.
// ─────────────────────────────────────────────────────────────────────────────



/**
 * Extracts and parses the JSON decision object from the LLM response text.
 * Tries multiple strategies to handle LLM formatting quirks. The next step of the llm is to move forward with the upgrade
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
    try {
      const decision = JSON.parse(cleaned.substring(firstBrace, lastBrace + 1));
      return { decision, error: null };
    } catch (e) { }
  }

  // Strategy 3: Try finding an array [...] in case the LLM forgets the object wrapper
  const firstBracket = cleaned.indexOf('[');
  const lastBracket = cleaned.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    try {
      const decisionArr = JSON.parse(cleaned.substring(firstBracket, lastBracket + 1));
      if (Array.isArray(decisionArr)) {
        return { decision: { actions: decisionArr }, error: null };
      }
    } catch (e) { }
  }

  // Attempt raw parse fallback
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
 * Fallback LLM call using GPT-4o-mini via the OpenAI API.
 * Mirrors the callOpenAI pattern from geminiService.js.
 * Called when Gemini fails on a given iteration.
 *
 * @param {string} contextText - The full context string built by buildContext()
 * @returns {Promise<string>} - The raw JSON text from the model
 */
async function callOpenAIAgent(contextText) {
  if (!config.openaiApiKey) {
    throw new Error('OpenAI API key not configured — cannot use fallback');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.openaiApiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a research agent. You MUST respond with ONLY valid JSON. No prose, no markdown, no explanation.'
        },
        { role: 'user', content: contextText }
      ],
      response_format: { type: 'json_object' }
    })
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`OpenAI Error ${response.status}: ${errBody}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || '';
}

/**
 * Main Research Agent Loop — orchestrates the ReAct cycle.
 *
 * @param {string}           task       - The student's request
 * @param {object}           workspace  - { papers: PaperData[], notes: NoteData[] }
 * @param {string|undefined} workflowId - Optional preset workflow ID (e.g. "get_findings")
 * @returns {Promise<AgentResult>}
 */
async function runAgentTask(task, workspace, workflowId) {
  if (!genAI && !config.openaiApiKey) {
    throw new Error('No AI provider available — check GEMINI_API_KEY or OPENAI_API_KEY');
  }
  if (!genAI) {
    logger.warn('[ResearchAgent] Gemini not available — will use GPT-4o-mini fallback only');
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
  const sessionContextPool = {}; // High-capacity temporary storage for raw tool outputs (mapped to IDs)
  let recentObservations = [];   // Short-term: up to last 3 tool outputs
  let iteration = 0;

  // Consecutive error tracking — abort early if agent is stuck in a loop
  let consecutiveErrors = 0;
  const MAX_CONSECUTIVE_ERRORS = 4;
  // Once Gemini fails, we skip it permanently for the rest of this task session
  let geminiFailed = false;

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash-lite',
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

    // ── STEP A: Build context — Tier 1: Gemini, Tier 2: GPT-4o-mini ──────
    // Context is built ONCE before both providers to avoid duplicate work.
    let responseText;
    const context = buildContext(
      task,
      workspace,
      executionLog,
      sessionMemory,
      recentObservations,
      workflow
    );

    try {
      // TIER 1: Gemini — skip entirely if it already failed earlier this session
      if (!genAI || geminiFailed) throw new Error('Gemini not available — skipping to fallback');
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: context }] }]
      });
      responseText = result.response.text();
      logger.info(`[ResearchAgent] ✅ Tier 1 (Gemini) on iteration ${iteration}`);

    } catch (geminiError) {
      // Mark Gemini as failed for ALL remaining iterations in this session
      if (!geminiFailed) {
        geminiFailed = true;
        logger.warn(`[ResearchAgent] ⚠️ Gemini failed on iteration ${iteration}: ${geminiError.message}. Switching permanently to GPT-4o-mini for this session.`);
      } else {
        logger.info(`[ResearchAgent] ℹ️ Tier 1 (Gemini) skipped (already marked failed) — using GPT-4o-mini directly.`);
      }

      // TIER 2: GPT-4o-mini fallback
      try {
        responseText = await callOpenAIAgent(context);
        logger.info(`[ResearchAgent] ✅ Tier 2 (GPT-4o-mini) on iteration ${iteration}`);

      } catch (openaiError) {
        logger.error(`[ResearchAgent] ❌ Tier 2 (GPT-4o-mini) also failed on iteration ${iteration}: ${openaiError.message}`);
        consecutiveErrors++;
        logger.warn(`[ResearchAgent] ⚠️ Consecutive errors: ${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}`);
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          logger.error(`[ResearchAgent] 🛑 Aborting: both AI providers failed ${consecutiveErrors} times in a row`);
          logger.warn(`[ResearchAgent] → Sending to frontend: { success: false } (AI provider failure)`);
          return { success: false, iterations: iteration, memoryUsed: sessionMemory, history: executionLog };
        }
        recentObservations.unshift('ERROR: AI provider unavailable on this iteration. Retrying...');
        if (recentObservations.length > 3) recentObservations.pop();
        continue;
      }
    }

    // Log truncated response so we can see what the model is doing
    const preview = responseText.length > 200
      ? responseText.substring(0, 200) + '...'
      : responseText;
    logger.info(`[ResearchAgent] Raw Response (truncated): ${preview.replace(/\n/g, ' ')}`);
    logger.info(`[ResearchAgent] Total length: ${responseText.length} chars`);

    // ── STEP B: Parse the JSON response ─────────────────────────────────
    const { decision, error: parseError } = extractDecision(responseText);

    if (parseError || !decision) {
      logger.warn(`[ResearchAgent] JSON parse failed on iteration ${iteration}: ${parseError}`);
      recentObservations.unshift('ERROR: Your response was not valid JSON. You MUST respond with ONLY the JSON object — no markdown, no explanation. Example: { "actions": [{ "thinking": "...", "action": "tool_call", "tool": "get_and_read_multiple_pages", "params": { "paper_index": 0, "start_page": 1, "end_page": 4 } }] }');
      if (recentObservations.length > 3) recentObservations.pop();
      consecutiveErrors++;
      logger.warn(`[ResearchAgent] ⚠️ Consecutive errors: ${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}`);
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        logger.error(`[ResearchAgent] 🛑 Aborting: stuck in JSON parse error loop after ${consecutiveErrors} attempts`);
        return { success: false, iterations: iteration, memoryUsed: sessionMemory, history: executionLog };
      }
      continue;
    }

    // Normalize to an actions array (limit max 2)
    let actionsToRun = [];
    if (decision.actions && Array.isArray(decision.actions)) {
      actionsToRun = decision.actions.slice(0, 2);
    } else if (decision.action) {
      actionsToRun = [decision]; // Fallback for single action formatting
    }

    if (actionsToRun.length === 0) {
      recentObservations.unshift('ERROR: No valid actions found in your response.');
      if (recentObservations.length > 3) recentObservations.pop();
      continue;
    }

    // ── STEP C & D: Process Actions Sequentially ────────────────────────
    for (let i = 0; i < actionsToRun.length; i++) {
      let act = actionsToRun[i];

      // NORMALIZATION: If the agent mistakenly calls 'task_complete' as a 'tool_call',
      // convert it to the primary 'task_complete' action type.
      if (act.action === 'tool_call' && act.tool === 'task_complete') {
        logger.info(`[ResearchAgent] 🔄 Normalizing 'tool_call: task_complete' to primary 'task_complete' action.`);
        act = {
          action: 'task_complete',
          params: act.params,
          thinking: act.thinking
        };
      }

      // NORMALIZATION: GPT-4o-mini sometimes uses a known tool name directly as the
      // action value instead of wrapping it in { action: 'tool_call', tool: name }.
      // This derives the valid set from TOOL_SCHEMA so it is always up to date.
      if (act.action !== 'tool_call' && act.action !== 'task_complete' && KNOWN_TOOLS.has(act.action)) {
        logger.info(`[ResearchAgent] 🔄 Normalizing direct tool action '${act.action}' to tool_call format.`);
        act = {
          action: 'tool_call',
          tool: act.action,
          params: act.params,
          thinking: act.thinking
        };
      }

      if (act.thinking) {
        const thinkingPreview = act.thinking.length > 150
          ? act.thinking.substring(0, 150) + '...'
          : act.thinking;
        logger.info(`[ResearchAgent] Agent Thought (Action ${i + 1}): "${thinkingPreview.replace(/\n/g, ' ')}"`);
      }

      logger.info(`[ResearchAgent] Decision (Action ${i + 1}): action=${act.action}, tool=${act.tool || 'N/A'}`);

      // SAFEGUARD 1: Immediately return if task_complete
      if (act.action === 'task_complete') {
        // Defensive extraction: handles empty string (falsy) and LLM placing response at root level
        let finalResponse =
          (typeof act.params?.response === 'string' && act.params.response.trim())
          || (typeof act.response === 'string' && act.response.trim())
          || null;

        // CATCH-ALL: Ensure finalResponse is a string to prevent React rendering crashes
        if (!finalResponse && typeof act.params?.response === 'object' && act.params.response !== null) {
          logger.warn(`[ResearchAgent] ⚠️  Agent returned an object for task_complete. Converting to string.`);
          finalResponse = Object.entries(act.params.response)
            .map(([key, value]) => `### ${key}\n${String(value)}`)
            .join('\n\n');
        }

        // Final safety net
        if (!finalResponse) finalResponse = 'Task completed.';

        logger.info(`[ResearchAgent] ✅ Task complete after ${iteration} iteration(s)`);
        logger.info(`[ResearchAgent] Memory entries used: ${sessionMemory.length}`);
        logger.info(`[ResearchAgent] → Sending to frontend: "${String(finalResponse).substring(0, 120).replace(/\n/g, ' ')}..."`);

        return {
          success: true,
          response: String(finalResponse),
          iterations: iteration,
          memoryUsed: sessionMemory,
          history: executionLog
        };
      }

      // SAFEGUARD 2: Prevent save_to_session_memory as a second chained action
      if (act.action === 'tool_call' && act.tool === 'save_to_session_memory' && i > 0) {
        const errorObs = `ERROR: 'save_to_session_memory' CANNOT be the second action in a chain. Action disabled. Always save memory as your first action.`;
        recentObservations.unshift(errorObs);
        if (recentObservations.length > 3) recentObservations.pop();
        logger.warn(`[ResearchAgent] 📛 Blocked save_to_session_memory as second action.`);
        continue; // Skip executing this specific action
      }

      if (act.action === 'tool_call' && act.tool) {
        // Pass sessionContextPool to allow tools to "register" content IDs
        // AND pass sessionMemory for deduplication checks
        // Pass null for genAI if Gemini has failed — prevents tools from attempting Gemini calls
        const toolResult = await executeTool(act.tool, act.params || {}, workspace, geminiFailed ? null : genAI, sessionContextPool, sessionMemory);

        // Guard against malformed tool result
        const observation = (toolResult && typeof toolResult.observation === 'string')
          ? toolResult.observation
          : `ERROR: Tool "${act.tool}" returned no output.`;

        // Define deduplicating push gate
        const safePush = (entry) => {
          if (!entry || !entry.id) {
            // If entry has no ID (unlikely now), we push it but can't deduplicate
            sessionMemory.push(entry);
            return;
          }
          const isDuplicate = sessionMemory.some(m => m.id === entry.id);
          if (!isDuplicate) {
            sessionMemory.push(entry);
          }
        };

        // Handle save_to_memory or auto-saves — push to long-term session memory
        if (toolResult?.memoryEntries) {
          toolResult.memoryEntries.forEach(safePush);
          logger.info(`[ResearchAgent] 💾 Multi-Memory saved: ${toolResult.memoryEntries.length} items (after deduplication check)`);
        } else if (toolResult?.memoryEntry) {
          safePush(toolResult.memoryEntry);
          logger.info(`[ResearchAgent] 💾 Memory saved: [${toolResult.memoryEntry.type}] (after deduplication check)`);
        }

        // Build compact param summary for the execution log
        const paramsSummary = Object.entries(act.params || {})
          .map(([k, v]) => {
            const val = typeof v === 'string' && v.length > 40
              ? v.substring(0, 40) + '...'
              : String(v);
            return `${k}=${val}`;
          })
          .join(', ');

        const resultSummary = observation.length > 400
          ? observation.substring(0, 400) + '... (truncated, use save_to_memory if needed)'
          : observation;

        // Push to execution log (persists entire session — compact only)
        executionLog.push({
          iteration,
          tool: act.tool,
          paramsSummary,
          resultSummary,
          thinking: (act.thinking || '').substring(0, 400)
        });

        // Set short-term observation array
        recentObservations.unshift(observation);
        if (recentObservations.length > 3) {
          recentObservations.pop(); // Keep only the 3 most recent
        }

        // Track consecutive errors based on tool observations
        if (observation.startsWith('ERROR:')) {
          consecutiveErrors++;
          logger.warn(`[ResearchAgent] ⚠️ Consecutive errors: ${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS} — ${observation.substring(0, 80)}`);
          if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
            logger.error(`[ResearchAgent] 🛑 Aborting: agent stuck in tool error loop after ${consecutiveErrors} consecutive failures`);
            return { success: false, iterations: iteration, memoryUsed: sessionMemory, history: executionLog };
          }
        } else {
          // Successful tool result — reset the counter
          consecutiveErrors = 0;
        }

        logger.info(`[ResearchAgent] Tool: ${act.tool}`);
        logger.info(`[ResearchAgent] Result: ${resultSummary.substring(0, 100)}`);

      } else if (act.action !== 'task_complete') {
        const errorObs = `ERROR: Invalid action "${act.action}". You must use "tool_call" or "task_complete".`;
        recentObservations.unshift(errorObs);
        if (recentObservations.length > 3) recentObservations.pop();
        logger.warn(`[ResearchAgent] Invalid action: "${act.action}"`);
      }
    }
  }

  // ── MAX ITERATIONS EXCEEDED ───────────────────────────────────────────────
  logger.warn(`[ResearchAgent] ⚠️  Max iterations (${MAX_ITERATIONS}) reached without task_complete`);
  if (sessionMemory.length > 0) {
    const partialSummary = sessionMemory.map(m => `- [${m.type?.toUpperCase()}]: ${(m.content || '').substring(0, 100)}...`).join('\n');
    logger.info(`[ResearchAgent] Partial findings (internal only):\n${partialSummary}`);
  }

  return {
    success: false,
    iterations: MAX_ITERATIONS,
    memoryUsed: sessionMemory,
    history: executionLog
  };
}

module.exports = { runAgentTask };
