// backend/services/researchAgentWorkflows.js
//
// Guideline Workflows for the Research Agent.
//
// These workflows act as suggested guidelines (hints) injected into the
// agent's context. They provide the agent with a recommended map of tools 
// and logic to accomplish specific tasks, while allowing it the autonomy 
// to adapt if a paper has an unusual structure (e.g., no table of contents).
//
// ─────────────────────────────────────────────────────────────────────────
// TO ADD A NEW WORKFLOW:
//   Add a new key to the WORKFLOWS object below. The value is the text the
//   agent will read. No code changes anywhere else are needed.
//
// TO IMPROVE A WORKFLOW:
//   Edit the text directly. No code changes needed.
//
// WORKFLOW IDs are passed from the frontend (e.g. workflowId="get_findings")
// ─────────────────────────────────────────────────────────────────────────

const WORKFLOWS = {

  // ───────────────────────────────────────────────────────────────────────
  // SUMMARISE PAPER
  // ───────────────────────────────────────────────────────────────────────
  summarise_paper: `
You have been asked to write a clear, academic summary of a targeted research paper.
Here is a suggested approach you can adapt depending on the paper's structure:

SUGGESTED STEP 1 — Get paper metadata
  Action: Call get_paper_metadata for the target paper you are summarising.
  Purpose: Learn the title, author, total page count, and abstract.
  Note: This tool auto-saves results to your long-term memory.

SUGGESTED STEP 2 — Read the introduction
  Action: Use get_and_read_multiple_pages to read the first few pages (e.g. start_page=1, end_page=3).
  Purpose: Uncover the research problem and the paper's aim.
  Tip: Use save_to_session_memory with the [MEMORY_ID] of the intro pages to keep them.

SUGGESTED STEP 3 — Locate and read findings/conclusions
  Action: Use search_multiple_keyword for keywords=["conclusion", "discussion", "findings"]. 
  If you are struggling to find sections, use the get_paper_structure_map tool.
  Once located, use get_and_read_multiple_pages for those specific pages.
  Tip: Save relevant IDs using save_to_session_memory.

SUGGESTED STEP 4 — Compile and Complete
  Call task_complete with a structured response that includes research aim, key contributions, and main findings.`,


  // ───────────────────────────────────────────────────────────────────────
  // GET METHODOLOGY
  // ───────────────────────────────────────────────────────────────────────
  get_methodology: `
You have been asked to extract the research methodology from a targeted academic paper.

SUGGESTED STEP 1 — Get paper metadata
  Action: Use get_paper_metadata. This auto-saves the abstract/metadata for you.

SUGGESTED STEP 2 — Locate Methodology
  Action: Use get_paper_structure_map to see exactly which pages contain the 'Methods' section.
  If not available, use search_multiple_keyword for terms like ["methodology", "research design", "data collection"].

SUGGESTED STEP 3 — Read and Pin
  Action: Use get_and_read_multiple_pages on the identified pages.
  Tip: IMMEDIATELY call save_to_session_memory with the [MEMORY_ID] for the pages describing: participants, design, and analysis.

SUGGESTED STEP 4 — Compile and Complete
  Call task_complete with details on Design, Sample, and Analysis methods found.`,


  // ───────────────────────────────────────────────────────────────────────
  // GET FINDINGS / RESULTS
  // ───────────────────────────────────────────────────────────────────────
  get_findings: `
You have been asked to extract key findings and results from a targeted academic paper.

SUGGESTED STEP 1 — Get paper metadata
  Action: Call get_paper_metadata.

SUGGESTED STEP 2 — Locate the results section
  Action: Use get_paper_structure_map to find where "Results" or "Findings" starts.
  If needed, use search_multiple_keyword for keywords=["results", "findings", "outcomes"].

SUGGESTED STEP 3 — Read and Pin findings
  Action: Use get_and_read_multiple_pages on the results pages. 
  Tip: Use save_to_session_memory with the provided [MEMORY_IDs] to move these findings to your long-term dossier.

SUGGESTED STEP 4 — Compile and Complete
  Call task_complete with key findings, supporting evidence, and interpretations.`,


  // ───────────────────────────────────────────────────────────────────────
  // FORMAT HARVARD REFERENCE
  // ───────────────────────────────────────────────────────────────────────
  format_reference: `
You have been asked to format a correct Harvard reference for a targeted paper.

SUGGESTED STEP 1 — Get paper metadata
  Action: Call get_paper_metadata. This auto-saves the reference if available.

SUGGESTED STEP 2 — Read cover pages
  If details are missing, use get_and_read_multiple_pages (start=1, end=2).
  Tip: Pin the cover page IDs using save_to_session_memory.

SUGGESTED STEP 3 — Compile and Complete
  Call task_complete with the correctly formatted Harvard reference.`,


  // ───────────────────────────────────────────────────────────────────────
  // COMPARE PAPERS
  // ───────────────────────────────────────────────────────────────────────
  compare_papers: `
You have been asked to write a structured comparison of multiple papers in the workspace.

SUGGESTED STEP 1 — List available papers
  Action: Call list_workspace() to see paper indices.

SUGGESTED STEP 2 — Build your dossier
  Action: For every paper, call get_paper_metadata and get_paper_structure_map (these auto-save).
  Then read the conclusions using get_and_read_multiple_pages and call save_to_session_memory for the conclusion IDs.

SUGGESTED STEP 3 — Analyze Themes
  Look at your LONG-TERM STRUCTURED MEMORY (which is now organized by paper). Identify themes and differences.

SUGGESTED STEP 4 — Compile and Complete
  Call task_complete with a comparison of Focus, Methodology, and Findings.`,


  // ───────────────────────────────────────────────────────────────────────
  // LITERATURE REVIEW
  // ───────────────────────────────────────────────────────────────────────
  literature_review: `
You have been asked to write a thematic academic literature review synthesising the research in the workspace.
Whether there is one paper or multiple, your goal is to identify core themes, debates, and contributions.

SUGGESTED STEP 1 — Understand the scope
  Action: Call list_workspace(). Note the paper indices and student notes available.

SUGGESTED STEP 2 — Populate your structured memory
  Action: For every paper available, call get_paper_metadata and get_paper_structure_map (these auto-save).
  If student notes exist for a paper, call get_notes_for_paper(paper_uri) and pin useful Note IDs using save_to_session_memory.
  Read abstracts and conclusions/discussions for all content and pin relevant segments to long-term memory.

SUGGESTED STEP 3 — Identify key themes
  Scrutinise your LONG-TERM STRUCTURED MEMORY. If multiple papers, group by shared themes. If one paper, identify the distinct thematic contributions.

SUGGESTED STEP 4 — Synthesise and Complete
  Write in formal academic third-person. Call task_complete with sections covering Introduction, Thematic Analysis/Debates, Gaps/Limitations, and Conclusion.`,

};

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the workflow instruction text for the given workflowId.
 * Returns null if workflowId is missing or not found — agent runs free-form.
 *
 * @param {string|null|undefined} workflowId
 * @returns {string|null}
 */
function getWorkflow(workflowId) {
  if (!workflowId || typeof workflowId !== 'string') return null;

  const workflow = WORKFLOWS[workflowId.trim()];
  if (!workflow) {
    console.warn(`[ResearchAgentWorkflows] Unknown workflowId: "${workflowId}"`);
    return null;
  }

  return workflow.trim();
}

/**
 * Returns all available workflow IDs with their title line.
 * Useful for debugging or listing available workflows.
 *
 * @returns {Array<{ id: string, title: string }>}
 */
function listWorkflows() {
  return Object.entries(WORKFLOWS).map(([id, text]) => {
    const lines = text.split('\n').filter(Boolean);
    const title = lines.length > 0 ? lines[0] : id;
    return { id, title };
  });
}

module.exports = { getWorkflow, listWorkflows };
