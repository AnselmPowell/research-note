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
You have been asked to write a clear, academic summary or extract the official abstract of a research paper.
Follow this priority-based logic carefully:

PRIORITY 1 — Find and Copy the Existing Abstract
  Action: Use get_and_read_multiple_pages (start_page=1, end_page=5).
  Logic: Look for the section explicitly titled "Abstract" or "Summary". 
  If found, COPY IT WORD FOR WORD. Do not summarize or change the tone.

PRIORITY 2 — Keyword Search
  Action: If not found in the first 5 pages, use search_multiple_keyword with keywords=["Abstract", "Summary", "Executive Summary", "Synopsis"].
  Action: Read the identified pages using get_and_read_page_content and copy the content word for word.

PRIORITY 3 — Structural Synthesis (Last Resort)
  Action: If no explicit abstract exists, use get_paper_structure_map to locate "Introduction", "Results", and "Conclusion" / "Discussion".
  Action: Read these sections and synthesize a high-quality academic abstract (max 300 words) that describes the Aim, Method, Results, and Conclusions.

Call task_complete with the extracted or synthesized abstract text.`,


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
You have been asked to identify the research questions, extract key findings, and highlight any gaps in a targeted academic paper.

SUGGESTED STEP 1 — Get paper metadata
  Action: Call get_paper_metadata.

SUGGESTED STEP 2 — Locate key sections
  Action: Use get_paper_structure_map to find the "Introduction", "Results"/"Findings", and "Discussion"/"Conclusion".
  If needed, use search_multiple_keyword for keywords=["results", "findings", "research questions", "future research", "limitations"].

SUGGESTED STEP 3 — Read and Pin
  Action: Use get_and_read_multiple_pages on the relevant pages to identify the core questions asked, the main results, and the research gaps.
  Tip: Use save_to_session_memory with the provided [MEMORY_IDs] to move these points to your long-term dossier.

SUGGESTED STEP 4 — Compile and Complete
  Call task_complete with a structured analysis detailing: 
  1. The questions/topics the paper focuses on.
  2. The key findings and results.
  3. The research gaps or unanswered questions.`,


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


  // ───────────────────────────────────────────────────────────────────────
  // PAPER BREAKDOWN (STUDENT-FRIENDLY SUMMARY)
  // ───────────────────────────────────────────────────────────────────────
  paper_breakdown: `
You have been asked to create a plain-language Paper Breakdown for a student who 
wants to fully understand this academic paper without prior expertise.

STEP 1 — Read the opening pages
  Action: Use get_and_read_multiple_pages (start_page=1, end_page=4).
  Goal: Get the title, authors, abstract, introduction, and stated aims.

STEP 2 — Identify what else to read
  Action: Use get_paper_structure_map to get a full list of sections and pages.
  Decide: Which sections will tell you the paper's TYPE, METHODS (if any), and 
  main CONCLUSIONS? Read those pages using get_and_read_multiple_pages.
  Save key page IDs using save_to_session_memory.

STEP 3 — Read the conclusions/discussion
  Action: Locate the "Conclusion" or "Discussion" section from the structure map.
  Read it using get_and_read_multiple_pages.

STEP 4 — Compile and call task_complete
  Write in SIMPLE, plain English anyone can understand. Avoid jargon.
  Always include page number references so the student can find the source.

  Structure your response exactly like this:

  ## What Is This Paper About?
  (2-3 sentences in plain language. What is the core topic? Page ref.)

  ## Goal & Purpose
  (What question or problem is this paper trying to solve? Page ref.)

  ## Type of Paper
  (e.g. Experimental study, Literature review, Case study, Theoretical paper.
  One sentence explaining what that means. Page ref.)

  ## Key Points 
  - Point 1 (p.X)
  - Point 2 (p.X)
  - Point 3 (p.X)
  (All must be written in simple language and Simple Terms)
  (At least 5 key points from the paper)

  ## Questions & Answers
  Write at least 10 questions a student would want to ask to understand this paper.
  Answer each one in 1-3 plain sentences. Include a page reference for each answer.

  **Q: What is the main argument of this paper?**
  A: [answer] (p.X)

  **Q: Who is this research for?**
  A: [answer] (p.X)

  (Continue until you have 10+ questions covering the full paper)`,

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
