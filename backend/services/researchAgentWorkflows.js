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

SUGGESTED STEP 1 — Get paper overview
  Action: Call get_paper_info for the target paper you are summarising.
  Purpose: Learn the title, author, total page count, and whether an abstract is available.
  Tip: If there is an abstract, save it to session memory using save_to_memory.

SUGGESTED STEP 2 — Read the introduction
  Action: Use read_multiple_pages to read the first few pages (e.g. start_page=1, end_page=3).
  Purpose: Uncover the research problem, context, and the paper's aim.
  Tip: Use save_to_memory to store key introductory points.

SUGGESTED STEP 3 — Locate and read the conclusion/discussion
  Action: Use search_multiple_keyword to find where the conclusion is located, e.g., keywords=["conclusion", "discussion", "summary", "findings"]. 
  If you are struggling to find the right information or sections with keyword searches, use the get_paper_structure tool. This lets an AI quickly map out the document's logical structure and page numbers for you.
  Once located, use read_multiple_pages for those specific pages.
  Tip: Save the key conclusions to memory using save_to_memory.

SUGGESTED STEP 4 — Compile and Complete
  Compile the gathered information from your memory.
  Call task_complete with a structured response that includes:
    1. Paper title and author 
    2. Research aim / what the paper is about
    3. Key arguments or contributions
    4. Main findings or conclusions
    5. A brief note on its overall relevance`,


  // ───────────────────────────────────────────────────────────────────────
  // GET METHODOLOGY
  // ───────────────────────────────────────────────────────────────────────
  get_methodology: `
You have been asked to extract the research methodology from a targeted academic paper.
Here is a recommended guide on how to use your tools to find this efficiently:

SUGGESTED STEP 1 — Get paper overview
  Action: Use get_paper_info on the target paper.
  Purpose: Note the total page count and check if the abstract gives any methodology hints.

SUGGESTED STEP 2 — Scan for a table of contents
  Action: Use read_multiple_pages to check the first 2-3 pages.
  If a table of contents lists "Methods", "Methodology", or "Research Design", note that page number and jump straight to it.

SUGGESTED STEP 3 — Keyword search or AI Structure Map
  If you don't find a table of contents, try multiple searches at once to save time.
  Action: Use search_multiple_keyword for an array of terms like keywords=["methodology", "methods", "research design", "participants", "data collection", "procedure"].
  Tip: If keyword searches fail or return 0 matches and you are struggling to traverse the paper, use the get_paper_structure tool to map out the paper's pages automatically.

SUGGESTED STEP 4 — Read and Extract
  Action: Once you locate the section, use read_multiple_pages to read those specific pages.
  Tip: Immediately use save_to_memory to store details about: research design, participants/sample, data collection, and data analysis.

SUGGESTED STEP 5 — Compile and Complete
  Call task_complete with a structured response that includes:
    1. Research Design (qualitative / quantitative / mixed methods / etc.)
    2. Participants / Sample Size
    3. Data Collection Method
    4. Data Analysis Approach
    5. The page numbers where you found this information`,


  // ───────────────────────────────────────────────────────────────────────
  // GET FINDINGS / RESULTS
  // ───────────────────────────────────────────────────────────────────────
  get_findings: `
You have been asked to extract key findings and results from a targeted academic paper.
Here is a suggested approach to locate these sections:

SUGGESTED STEP 1 — Get paper overview
  Action: Call get_paper_info on the target paper.
  Purpose: Check if the abstract summarises the main findings. If so, save them to memory.

SUGGESTED STEP 2 — Locate the results section
  Action: Try using read_multiple_pages on the first few pages to find a table of contents.
  If not found, use search_multiple_keyword for terms like keywords=["results", "findings", "outcomes", "key findings", "data analysis"].
  If you are still struggling to locate the sections, use the get_paper_structure tool. This uses an AI model to map out the document's structure and page numbers for you instantly.

SUGGESTED STEP 3 — Read the findings pages
  Action: Use read_multiple_pages on the pages you identified. 
  Tip: As you read, immediately use save_to_memory to record specific results, numbers/statistics, themes, and outcomes.

SUGGESTED STEP 4 — Check the discussion (Optional but helpful)
  Action: You may want to search for the "discussion" section using search_multiple_keyword to see how the authors interpret their raw findings. 

SUGGESTED STEP 5 — Compile and Complete
  Call task_complete with a response that includes:
    1. Key Findings (bulleted, specific, with statistics if reported)
    2. Supporting Evidence (quotes or data points with page numbers)
    3. Discussion / Interpretation (how authors contextualise the findings)
    4. Paper title and author`,


  // ───────────────────────────────────────────────────────────────────────
  // FORMAT HARVARD REFERENCE
  // ───────────────────────────────────────────────────────────────────────
  format_reference: `
You have been asked to format a correct Harvard reference for a targeted paper.

SUGGESTED STEP 1 — Get paper metadata
  Action: Call get_paper_info for the target paper.
  If a pre-formatted Harvard reference is already available in the metadata, you can use it directly.

SUGGESTED STEP 2 — Read cover pages for missing details
  If the reference isn't available or is incomplete, use read_multiple_pages to read the first 1-2 pages.
  Look for: full author name(s), publication year, journal name, volume, issue, page numbers, DOI, publisher.
  Tip: Use save_to_memory to keep track of these details.

SUGGESTED STEP 3 — Compile and Complete
  Call task_complete with:
    1. The correctly formatted Harvard reference:
       Author(s) Surname, Initial(s). (Year) 'Title of article', Journal Name, Volume(Issue), pp. Pages. doi:XXX
    2. A note identifying if any details had to be estimated or were missing`,


  // ───────────────────────────────────────────────────────────────────────
  // COMPARE PAPERS
  // ───────────────────────────────────────────────────────────────────────
  compare_papers: `
You have been asked to write a structured comparison of multiple papers in the workspace.
Here is a suggested way to approach this synthesis task:

SUGGESTED STEP 1 — List available papers
  Action: Call list_workspace() to see exactly how many papers there are and their index numbers.

SUGGESTED STEP 2 — Gather core information for EVERY paper
  Action: For every paper listed, use get_paper_info and read its conclusion (using search_multiple_keyword with keywords=["conclusion"] to find the conclusion first).
  Tip: Use get_paper_structure if you encounter a paper where locating the methodology or conclusion is difficult.
  Tip: Use save_to_memory to record a brief summary (Focus, Methodology, Key findings) for each paper before moving to the next.

SUGGESTED STEP 3 — Identify comparison themes
  Based on what you've saved to memory, try to identify 3-4 comparing themes (e.g., research focus, methodologies used, differing conclusions).
  Save these themes to memory as well.

SUGGESTED STEP 4 — Compile and Complete
  Once all papers are reviewed, call task_complete with a structured comparison:
    1. Introduction (brief overview)
    2. Overview List (title, author, focus for each paper)
    3. Methodology Comparison 
    4. Key Findings Comparison
    5. Agreements (where the papers align)
    6. Disagreements / Contradictions (where they differ)
    7. Overall Conclusion`,


  // ───────────────────────────────────────────────────────────────────────
  // LITERATURE REVIEW
  // ───────────────────────────────────────────────────────────────────────
  literature_review: `
You have been asked to write a thematic academic literature review synthesising the papers in the workspace.
Remember: A literature review SYNTHESISES and groups by themes — it should not just summarise paper-by-paper.

SUGGESTED STEP 1 — List available resources
  Action: Call list_workspace(). Note the available papers and notes.
  If student notes exist, consider using get_notes_for_paper to retrieve quotes you can weave into your review.

SUGGESTED STEP 2 — Extract core contributions from EVERY paper
  Action: Loop through every paper using get_paper_info. Use read_multiple_pages to read their abstracts and search_multiple_keyword to find their conclusions.
  Tip: If you struggle to traverse any paper, use get_paper_structure to map it instantly.
  Tip: For every paper, use save_to_memory to store its main methodology, key contribution, and limitations.

SUGGESTED STEP 3 — Identify 3-4 cross-cutting themes
  Look at your session memory and group the literature by themes, debates, or methodological approaches rather than by author.
  Save your identified themes to memory.

SUGGESTED STEP 4 — Synthesise and Complete
  Write in formal academic third-person. Call task_complete with your final response structured as:
    1. Introduction (State topic scope, number of papers, and outline themes)
    2. Thematic Sections (2-4 sections discussing what multiple authors say, comparing them, with in-text citations)
    3. Gaps and Limitations (What remains unanswered across the literature?)
    4. Conclusion (Summarise knowledge state and implications)
    5. References list (Harvard format)`,

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
