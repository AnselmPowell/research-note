// backend/services/researchAgentTools.js
//
// Tool Schema + Executor for the Research Agent.
// Tools operate purely on workspace data passed in - no DB calls, no file I/O.
// Each tool returns { observation, memoryType } where:
//   memoryType: 'short_term' = only in next iteration, then dropped
//   memoryType: 'long_term'  = agent explicitly saves to sessionMemory via save_to_memory

const { initializeEnvironment } = require('../config/env');
const config = initializeEnvironment();

const TOOL_SCHEMA = [
  {
    name: 'get_and_read_page_content',
    description: `Read the full text of a single page from a paper. 
      This is SHORT-TERM: the text is only available for maximum 2 iterations.
      The output will contain a [MEMORY_ID: X]. To keep this page in your LONG-TERM memory, 
      you MUST call 'save_to_session_memory' with that ID.`,
    parameters: {
      type: 'OBJECT',
      properties: {
        paper_index: { type: 'NUMBER', description: 'Index of the paper (0-based).' },
        page_number: { type: 'NUMBER', description: 'Page number (1-based).' }
      },
      required: ['paper_index', 'page_number']
    }
  },
  {
    name: 'get_and_read_multiple_pages',
    description: `Read a range of consecutive pages (e.g. 2 to 6 gets pages 2, 3, 4, 5, 6). 
      DO NOT read more than 10 pages at a time.
      Each page will be tagged with its own [MEMORY_ID: X] to allow you to pin specific pages.
      This is SHORT-TERM. Use 'save_to_session_memory' with the specific IDs you want to keep long-term.`,
    parameters: {
      type: 'OBJECT',
      properties: {
        paper_index: { type: 'NUMBER', description: 'Index of the paper (0-based).' },
        start_page: { type: 'NUMBER', description: 'Starting page (1-based, inclusive).' },
        end_page: { type: 'NUMBER', description: 'Ending page (1-based, inclusive).' }
      },
      required: ['paper_index', 'start_page', 'end_page']
    }
  },
  {
    name: 'get_paper_details',
    description: `Gets the paper's metadata (title, author, abstract, Harvard reference, total pages) 
      AND its structure map (table of contents mapping section names to page numbers).
      Returns both as a single SHORT-TERM observation tagged with a [MEMORY_ID].
      The agent decides whether to save this to long-term memory using save_to_session_memory.`,
    parameters: {
      type: 'OBJECT',
      properties: {
        paper_index: { type: 'NUMBER', description: 'Index of the paper (0-based).' }
      },
      required: ['paper_index']
    }
  },
  {
    name: 'search_keyword',
    description: `Search for a keyword across all pages of a paper.`,
    parameters: {
      type: 'OBJECT',
      properties: {
        paper_index: { type: 'NUMBER', description: 'Index of the paper (0-based).' },
        keyword: { type: 'STRING', description: 'Keyword to search for.' }
      },
      required: ['paper_index', 'keyword']
    }
  },
  {
    name: 'search_multiple_keyword',
    description: `Search for multiple terms across all pages. Useful for finding sections quickly.`,
    parameters: {
      type: 'OBJECT',
      properties: {
        paper_index: { type: 'NUMBER', description: 'Index of the paper (0-based).' },
        keywords: { type: 'ARRAY', items: { type: 'STRING' }, description: 'e.g. ["methodology", "data"]' }
      },
      required: ['paper_index', 'keywords']
    }
  },
  {
    name: 'get_references',
    description: `Get the bibliography/references list for a paper.`,
    parameters: {
      type: 'OBJECT',
      properties: {
        paper_index: { type: 'NUMBER', description: 'Index of the paper (0-based).' }
      },
      required: ['paper_index']
    }
  },
  {
    name: 'list_workspace',
    description: `List all papers and notes available to you. ALWAYS call this first.`,
    parameters: { type: 'OBJECT', properties: {}, required: [] }
  },
  {
    name: 'get_paper_notes',
    description: `Get all saved student notes for a specific paper by its index.
      Each note is tagged with its own [MEMORY_ID: Note_P{n}_Pg{page}_N{i}] so you can
      selectively save only relevant notes using save_to_session_memory.
      Notes are SHORT-TERM until saved. Saved notes appear under that paper in your long-term memory.`,
    parameters: {
      type: 'OBJECT',
      properties: {
        paper_index: { type: 'NUMBER', description: 'Index of the paper (0-based) from list_workspace.' }
      },
      required: ['paper_index']
    }
  },
  {
    name: 'save_to_session_memory',
    description: `CRITICAL: Move temporary content to LONG-TERM memory using their [MEMORY_ID: X].
      Provide an array of IDs you want to keep (e.g. ["Paper_0_Page_12_A9B1", "Note_3_X1Y2"]).`,
    parameters: {
      type: 'OBJECT',
      properties: {
        memory_ids: {
          type: 'ARRAY',
          items: { type: 'STRING' },
          description: 'A list of MEMORY_ID strings to save.'
        }
      },
      required: ['memory_ids']
    }
  }
];

/**
 * Executes a tool call and returns the result.
 * All tools operate on the workspace data (papers + notes) passed in.
 *
 * @param {string} toolName
 * @param {object} params
 * @param {object} workspace - { papers: [], notes: [] }
 * @param {object} genAI - The GenAI service instance for sub-models
 * @param {object} sessionContextPool - (NEW) temporary pool to store content by ID
 * @returns {Promise<{ observation: string, memoryType: 'short_term'|'long_term', memoryEntry?: object, memoryEntries?: object[] }>}
 */
async function executeTool(toolName, params, workspace, genAI, sessionContextPool = {}, sessionMemory = []) {
  const { papers, notes } = workspace;

  const generateId = (type, pIdx, pageNum) => {
    // Remove Math.random() to make IDs deterministic for the same content
    return `${type}_P${pIdx}${pageNum ? `_Pg${pageNum}` : ''}`;
  };

  switch (toolName) {

    case 'get_and_read_page_content': {
      // Support common LLM naming variations
      const paper_index = params.paper_index ?? params.paperIndex;
      const page_number = params.page_number ?? params.page ?? params.pageNum;

      if (typeof paper_index !== 'number' || paper_index < 0 || paper_index >= papers.length) {
        return {
          observation: `ERROR: "paper_index" is required and must be a number from 0 to ${papers.length - 1}. Provided: ${paper_index}`,
          memoryType: 'short_term'
        };
      }
      if (typeof page_number !== 'number' || isNaN(page_number)) {
        return {
          observation: 'ERROR: "page_number" is required as a number. Provided: ' + JSON.stringify(page_number),
          memoryType: 'short_term'
        };
      }
      const paper = papers[paper_index];
      if (!paper.pages || !Array.isArray(paper.pages)) {
        return {
          observation: `ERROR: Full text content is not available for "${paper.title}". You cannot read pages.`,
          memoryType: 'short_term'
        };
      }
      const pageIdx = page_number - 1; // 1-based to 0-based
      if (pageIdx < 0 || pageIdx >= paper.pages.length) {
        return {
          observation: `ERROR: Page ${page_number} does not exist. "${paper.title}" has ${paper.pages.length} pages.`,
          memoryType: 'short_term'
        };
      }

      const memId = generateId('Page', paper_index, page_number);
      const content = `[PDF Page ${page_number}]:\n${paper.pages[pageIdx]}`;

      sessionContextPool[memId] = {
        type: 'page',
        paper_index: paper_index,
        page_number: page_number,
        content: content
      };

      return {
        observation: `[MEMORY_ID: ${memId}]\n${content}\n\nSYSTEM HINT: Read this page content carefully. Does it answer the task? Is the page content relevant to help complete the task.\nIF YES: save to your long-term memory save_to_session_memory.\nIF NO: Dont save that page, Let it expire from short-term memory`,
        memoryType: 'short_term'
      };
    }

    case 'get_and_read_multiple_pages': {
      // Support common LLM naming variations
      const paper_index = params.paper_index ?? params.paperIndex;
      const start_page = params.start_page ?? params.startPage ?? params.start;
      const end_page = params.end_page ?? params.endPage ?? params.end;

      if (typeof paper_index !== 'number' || paper_index < 0 || paper_index >= papers.length) {
        return {
          observation: `ERROR: "paper_index" is required and must be a number from 0 to ${papers.length - 1}. Provided: ${paper_index}`,
          memoryType: 'short_term'
        };
      }
      if (typeof start_page !== 'number' || typeof end_page !== 'number' || isNaN(start_page) || isNaN(end_page)) {
        return {
          observation: 'ERROR: "start_page" and "end_page" are required as numbers. Correct format: { "paper_index": 0, "start_page": 1, "end_page": 4 }',
          memoryType: 'short_term'
        };
      }
      const paper = papers[paper_index];
      if (!paper.pages || !Array.isArray(paper.pages)) {
        return {
          observation: `ERROR: Full text content is not available for "${paper.title}". You cannot read pages.`,
          memoryType: 'short_term'
        };
      }
      const startIdx = Math.max(0, start_page - 1);
      const endIdx = Math.min(paper.pages.length, end_page);

      if (startIdx >= paper.pages.length) {
        return {
          observation: `ERROR: Start page ${start_page} exceeds total pages (${paper.pages.length}).`,
          memoryType: 'short_term'
        };
      }

      const selectedPages = paper.pages.slice(startIdx, endIdx);
      const resultBlocks = [];

      for (let i = 0; i < selectedPages.length; i++) {
        const pageNum = startIdx + i + 1;
        const memId = generateId('Page', paper_index, pageNum);
        const textChunk = `[PDF Page ${pageNum}]:\n${selectedPages[i]}`;

        sessionContextPool[memId] = {
          type: 'page',
          paper_index: paper_index,
          page_number: pageNum,
          content: textChunk
        };

        resultBlocks.push(`[MEMORY_ID: ${memId}]\n${textChunk}`);
      }

      return {
        observation: `READ ${selectedPages.length} PAGES.\n\n${resultBlocks.join('\n\n')}\n\nSYSTEM HINT: Read these pages carefully. Do they answer the task? Is the content relevant to help complete the task.\nIF YES: save to your long-term memory using save_to_session_memory with the specific IDs.\nIF NO: Dont save the pages, Let them expire from short-term memory`,
        memoryType: 'short_term'
      };
    }

    case 'get_paper_details': {
      const { paper_index } = params;
      if (typeof paper_index !== 'number' || paper_index < 0 || paper_index >= papers.length) {
        return {
          observation: `ERROR: "paper_index" is required and must be a number from 0 to ${papers.length - 1}. Provided: ${paper_index}`,
          memoryType: 'short_term'
        };
      }
      const paper = papers[paper_index];

      // ── PART 1: Metadata ─────────────────────────────────────────────────
      // Support both camelCase (LoadedPdf route) and snake_case (savedPapers/DB route)
      const authorsRaw = paper.author || paper.authors;
      const authorDisplay = Array.isArray(authorsRaw) ? authorsRaw.join(', ') : (authorsRaw || 'Unknown');
      const pageCount = paper.totalPages || paper.num_pages || paper.numPages || 'Unknown';
      const harvardRef = paper.harvardReference || paper.harvard_reference || 'Not available';

      const metadataContent = [
        `Title: ${paper.title || 'Unknown'}`,
        `Author: ${authorDisplay}`,
        `Total Pages: ${pageCount}`,
        `Abstract: ${paper.abstract || 'Not extracted'}`,
        `Harvard Reference: ${harvardRef}`
      ].join('\n');

      // ── PART 2: Structure Map ─────────────────────────────────────────────
      // Check cache first: support both camelCase (LoadedPdf) and snake_case (DB row)
      let structureContent = paper.structureMap || paper.structure_map || null;

      // If not cached, generate via AI
      if (!structureContent) {
        if (!paper.pages || !Array.isArray(paper.pages) || paper.pages.length === 0) {
          structureContent = 'Structure map unavailable — no page text extracted for this paper.';
        } else {
          const pagesToAnalyze = paper.pages.slice(0, 50);
          const textToAnalyze = pagesToAnalyze.map((text, i) => `--- [PDF PAGE ${i + 1}] ---\n${text}`).join('\n\n');
          const prompt = `Analyze the following academic text (this specific PDF has ${paper.pages.length} total pages).
Construct a simple Table of Contents mapping sections to their PDF RELATIVE page numbers (1 to ${paper.pages.length}).

IMPORTANT: Academic papers often have original publication page numbers (e.g. 140, 141) printed in the text. 
IGNORING THESE IS CRITICAL. You MUST strictly use the [PDF PAGE X] markers provided in the text below. 
If a section is on the 5th page of this PDF, identify it as Page 5, even if the text says "Page 144".

Respond ONLY with a bulleted list of section names and their RELATIVE PDF page numbers.

TEXT:
${textToAnalyze}`;

          // Tier 1: Gemini
          if (genAI) {
            try {
              const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
              const result = await model.generateContent(prompt);
              structureContent = result.response.text();
            } catch (geminiErr) {
              console.warn('[get_paper_details] Gemini structure generation failed:', geminiErr.message);
            }
          }

          // Tier 2: OpenAI fallback
          if (!structureContent && config.openaiApiKey) {
            try {
              const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${config.openaiApiKey}`
                },
                body: JSON.stringify({
                  model: 'gpt-4o-mini',
                  messages: [
                    { role: 'system', content: 'You are a research assistant. Respond ONLY with a bulleted list of sections and page numbers. No prose.' },
                    { role: 'user', content: prompt }
                  ]
                })
              });
              if (response.ok) {
                const data = await response.json();
                structureContent = data.choices[0]?.message?.content || null;
              }
            } catch (openaiErr) {
              console.warn('[get_paper_details] OpenAI structure generation failed:', openaiErr.message);
            }
          }

          if (!structureContent) {
            structureContent = 'Structure map could not be generated — no AI provider available.';
          }

          // Fire-and-forget: cache to DB for future sessions (skip local:// files)
          if (paper.uri && !paper.uri.startsWith('local://')) {
            const { updateStructureMap } = require('./databaseService');
            updateStructureMap(paper.uri, structureContent).catch(err =>
              console.warn('[get_paper_details] Failed to cache structure_map to DB:', err.message)
            );
          }
        }
      }

      const fullContent = `METADATA:\n${metadataContent}\n\nSTRUCTURE MAP:\n${structureContent}`;
      const memId = `Details_P${paper_index}`;

      // Register in short-term context pool — agent decides whether to save
      sessionContextPool[memId] = {
        type: 'paper_details',
        paper_index: paper_index,
        content: fullContent
      };

      return {
        observation: `[MEMORY_ID: ${memId}]\n${fullContent}\n\nSYSTEM HINT: This is in SHORT-TERM memory. Use save_to_session_memory with ["${memId}"] to pin it to your long-term memory if this paper's details are needed to complete the task.`,
        memoryType: 'short_term'
      };
    }

    case 'search_keyword': {
      const { paper_index, keyword } = params;
      if (typeof paper_index !== 'number' || paper_index < 0 || paper_index >= papers.length) {
        return {
          observation: `ERROR: "paper_index" is required and must be a number from 0 to ${papers.length - 1}. Provided: ${paper_index}`,
          memoryType: 'short_term'
        };
      }
      if (!keyword || !keyword.trim()) {
        return {
          observation: 'ERROR: "keyword" cannot be empty. Correct format: { "paper_index": 0, "keyword": "methodology" }',
          memoryType: 'short_term'
        };
      }
      const paper = papers[paper_index];
      if (!paper.pages || !Array.isArray(paper.pages)) {
        return {
          observation: `ERROR: Full text content is not available for "${paper.title}". You cannot perform keyword searches.`,
          memoryType: 'short_term'
        };
      }
      const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'gi');
      const results = [];
      let total = 0;

      paper.pages.forEach((pageText, idx) => {
        const matches = pageText.match(regex);
        if (matches && matches.length > 0) {
          total += matches.length;
          results.push({ page: idx + 1, count: matches.length });
        }
      });

      if (total === 0) {
        return {
          observation: `SEARCH: "${keyword}" NOT found in "${paper.title}".`,
          memoryType: 'short_term'
        };
      }

      const pageList = results
        .map(r => `  Page ${r.page}: ${r.count} occurrence(s)`)
        .join('\n');

      return {
        observation: `SEARCH: "${keyword}" found ${total} time(s) in "${paper.title}":\n${pageList}\n\nNEXT STEP: Use get_and_read_page_content(paper_index: ${paper_index}, page_number: [page from list]) to read the content.`,
        memoryType: 'short_term'
      };
    }

    case 'search_multiple_keyword': {
      const { paper_index, keywords } = params;
      if (typeof paper_index !== 'number' || paper_index < 0 || paper_index >= papers.length) {
        return {
          observation: `ERROR: "paper_index" is required and must be a number from 0 to ${papers.length - 1}. Provided: ${paper_index}`,
          memoryType: 'short_term'
        };
      }
      if (!Array.isArray(keywords) || keywords.length === 0) {
        return {
          observation: 'ERROR: "keywords" must be a non-empty array of strings. Correct format: { "paper_index": 0, "keywords": ["methodology", "results"] }',
          memoryType: 'short_term'
        };
      }
      const paper = papers[paper_index];
      if (!paper.pages || !Array.isArray(paper.pages)) {
        return {
          observation: `ERROR: Full text content is not available for "${paper.title}". You cannot perform searches.`,
          memoryType: 'short_term'
        };
      }
      const allResults = [];

      keywords.forEach(keyword => {
        if (!keyword || typeof keyword !== 'string' || !keyword.trim()) return;
        const escaped = keyword.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');
        const regex = new RegExp(escaped, 'gi');
        let total = 0;
        const resultPages = [];

        paper.pages.forEach((pageText, idx) => {
          const matches = pageText.match(regex);
          if (matches && matches.length > 0) {
            total += matches.length;
            resultPages.push(`page ${idx + 1}`);
          }
        });

        if (total === 0) {
          allResults.push(`- "${keyword}": 0 match(es)`);
        } else {
          allResults.push(`- "${keyword}": ${total} match(es) found on ${resultPages.join(', ')}`);
        }
      });

      return {
        observation: `MULTI-SEARCH RESULTS for "${paper.title}":\n${allResults.join('\n')}\n\nNEXT STEP: Use get_and_read_page_content(paper_index: ${paper_index}, page_number: [page from list]) to read the specific results.`,
        memoryType: 'short_term'
      };
    }

    case 'get_references': {
      const { paper_index } = params;
      if (typeof paper_index !== 'number' || paper_index < 0 || paper_index >= papers.length) {
        return {
          observation: `ERROR: "paper_index" is required and must be a number from 0 to ${papers.length - 1}. Provided: ${paper_index}`,
          memoryType: 'short_term'
        };
      }
      const paper = papers[paper_index];
      const refs = paper.paper_references || paper.references;
      if (!refs || refs.length === 0) {
        return {
          observation: `No reference list was extracted for "${paper.title}".`,
          memoryType: 'short_term'
        };
      }
      const refList = refs
        .map((ref, i) => `[${i + 1}] ${ref}`)
        .join('\n');
      return {
        observation: `REFERENCES for "${paper.title}" (${refs.length} total):\n${refList}`,
        memoryType: 'short_term'
      };
    }

    case 'list_workspace': {
      let output = `WORKSPACE — All papers and notes available to you:\n`;
      output += `(Use paper_index numbers below for all tool calls)\n`;

      if (papers.length === 0) {
        output += '\n  No papers loaded.\n';
      } else {
        papers.forEach((p, i) => {
          const paperUri = p.uri || null;
          const linked = paperUri
            ? notes.filter(n => (n.pdfUri || n.paper_uri) === paperUri)
            : [];
          const noteHint = linked.length > 0
            ? ` | ${linked.length} saved note(s) — call get_paper_notes(paper_index: ${i}) to access them`
            : '';
          output += `\n  [${i}] "${p.title}" by ${p.author || 'Unknown'} — ${p.totalPages} pages${noteHint}`;
        });
      }

      // Unlinked notes (safety net)
      const unlinkedCount = notes.filter(n => {
        const uri = n.pdfUri || n.paper_uri;
        return !uri || !papers.some(p => p.uri === uri);
      }).length;
      if (unlinkedCount > 0) {
        output += `\n\n  [Unlinked Notes: ${unlinkedCount} note(s) not linked to a loaded paper]`;
      }

      return { observation: output.trim(), memoryType: 'short_term' };
    }

    case 'get_paper_notes': {
      const paper_index = params.paper_index ?? params.paperIndex;
      if (typeof paper_index !== 'number' || paper_index < 0 || paper_index >= papers.length) {
        return {
          observation: `ERROR: "paper_index" is required and must be 0 to ${papers.length - 1}. Provided: ${paper_index}`,
          memoryType: 'short_term'
        };
      }
      const paper = papers[paper_index];
      const paperUri = paper.uri || null;

      // Guard: if paper has no URI we can't match notes reliably
      if (!paperUri) {
        return {
          observation: `No notes can be retrieved — paper "${paper.title}" has no stored URI.`,
          memoryType: 'short_term'
        };
      }

      const paperNotes = notes.filter(n => (n.pdfUri || n.paper_uri) === paperUri);

      if (paperNotes.length === 0) {
        return {
          observation: `No saved notes found for "${paper.title}".`,
          memoryType: 'short_term'
        };
      }

      const results = [];
      paperNotes.forEach((n, i) => {
        // ID mirrors page style: Note_P{paperIdx}_Pg{pageNum}_N{noteIdx}
        const memId = `Note_P${paper_index}_Pg${n.pageNumber || 0}_N${i}`;
        const lines = [
          `Note from "${paper.title}" — Page ${n.pageNumber || '?'}`,
          `Quote: "${n.quote}"`,
          n.justification ? `Justification: ${n.justification}` : null,
          n.relatedQuestion ? `Related Question: ${n.relatedQuestion}` : null,
          n.tags?.length ? `Tags: ${n.tags.join(', ')}` : null
        ].filter(Boolean).join('\n');

        sessionContextPool[memId] = {
          type: 'note',
          paper_index: paper_index,
          page_number: n.pageNumber || 0,
          content: lines
        };

        results.push(`[MEMORY_ID: ${memId}]\n${lines}`);
      });

      return {
        observation: `NOTES for "${paper.title}"\n (${paperNotes.length} total notes):\n\n${results.join('\n\n')}\n\nSYSTEM HINT: Review each note carefully. Save only the notes relevant to the task using save_to_session_memory. Saved notes will appear under [PAPER ${paper_index}] in your long-term memory.`,
        memoryType: 'short_term'
      };
    }

    case 'save_to_session_memory': {
      // Accept all casing variants GPT-4o-mini may emit: memory_ids, MEMORY_IDs, memory_id
      const memory_ids = params.memory_ids || params.MEMORY_IDs || params.memory_id;
      if (!Array.isArray(memory_ids) || memory_ids.length === 0) {
        return {
          observation: 'ERROR: "memory_ids" must be a non-empty array of MEMORY_ID strings. Correct format: { "memory_ids": ["Page_P0_Pg1", "Note_P0_Pg5_N1"] }. The IDs are shown in [MEMORY_ID: X] tags in tool output.',
          memoryType: 'short_term'
        };
      }

      const savedEntries = [];
      const alreadySaved = [];
      const notFound = [];

      for (const id of memory_ids) {
        if (sessionMemory.some(m => m.id === id)) {
          alreadySaved.push(id);
        } else if (sessionContextPool[id]) {
          savedEntries.push({ id, ...sessionContextPool[id] });
        } else {
          notFound.push(id);
        }
      }

      if (savedEntries.length === 0 && alreadySaved.length === 0) {
        return { observation: `ERROR: No valid or existing IDs found. Provided: ${memory_ids.join(', ')}`, memoryType: 'short_term' };
      }

      let obs = savedEntries.length > 0
        ? `SUCCESS: Saved ${savedEntries.length} new items to long-term memory. `
        : `No new items to save. `;

      if (alreadySaved.length > 0) obs += `\nNote: The following IDs were ALREADY in memory: ${alreadySaved.join(', ')}`;
      if (notFound.length > 0) obs += `\nWarning: IDs not found: ${notFound.join(', ')}`;

      return {
        observation: obs.trim(),
        memoryType: 'long_term',
        memoryEntries: savedEntries
      };
    }

    default:
      return {
        observation: `ERROR: Unknown tool "${toolName}". Available tools: ${TOOL_SCHEMA.map(t => t.name).join(', ')}`,
        memoryType: 'short_term'
      };
  }
}

module.exports = { TOOL_SCHEMA, executeTool };
