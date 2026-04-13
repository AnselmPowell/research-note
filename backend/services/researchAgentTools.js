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
    description: `Read a range of consecutive pages. 
      Each page will be tagged with its own [MEMORY_ID: X].
      This is SHORT-TERM. Use 'save_to_session_memory' with the specific IDs you want to keep.`,
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
    name: 'get_paper_metadata',
    description: `Get title, authors, abstract, and bibliography status.
      This tool automatically saves its findings to your LONG-TERM memory under the paper's section.`,
    parameters: {
      type: 'OBJECT',
      properties: {
        paper_index: { type: 'NUMBER', description: 'Index of the paper (0-based).' }
      },
      required: ['paper_index']
    }
  },
  {
    name: 'get_paper_structure_map',
    description: `Generates a Table of Contents mapping sections (Intro, Results, etc.) to page numbers.
      Automatically saves to your LONG-TERM session memory. Use this to navigate large papers.`,
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
    name: 'get_notes_for_paper',
    description: `Get saved student notes for a paper. Individual notes will be tagged with MEMORY_IDs for pinning.`,
    parameters: {
      type: 'OBJECT',
      properties: {
        paper_uri: { type: 'STRING', description: 'The paper URI identifier.' }
      },
      required: ['paper_uri']
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
      const { paper_index, page_number } = params;
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
      const content = `[Page ${page_number}]:\n${paper.pages[pageIdx]}`;

      sessionContextPool[memId] = {
        type: 'page',
        paper_index: paper_index,
        page_number: page_number,
        content: content
      };

      return {
        observation: `[MEMORY_ID: ${memId}]\n${content}\n\nSYSTEM HINT: If this is important, use 'save_to_session_memory' with this [MEMORY_ID].`,
        memoryType: 'short_term'
      };
    }

    case 'get_and_read_multiple_pages': {
      const { paper_index, start_page, end_page } = params;
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
        const textChunk = `[Page ${pageNum}]:\n${selectedPages[i]}`;

        sessionContextPool[memId] = {
          type: 'page',
          paper_index: paper_index,
          page_number: pageNum,
          content: textChunk
        };

        resultBlocks.push(`[MEMORY_ID: ${memId}]\n${textChunk}`);
      }

      return {
        observation: `READ ${selectedPages.length} PAGES.\n\n${resultBlocks.join('\n\n')}\n\nSYSTEM HINT: Use 'save_to_session_memory' with these IDs to keep them in long-term context.`,
        memoryType: 'short_term'
      };
    }

    case 'get_paper_metadata': {
      const { paper_index } = params;
      if (typeof paper_index !== 'number' || paper_index < 0 || paper_index >= papers.length) {
        return {
          observation: `ERROR: "paper_index" is required and must be a number from 0 to ${papers.length - 1}. Provided: ${paper_index}`,
          memoryType: 'short_term'
        };
      }
      const paper = papers[paper_index];

      // Support both singular/plural naming and database naming
      const authorsRaw = paper.author || paper.authors;
      const authorDisplay = Array.isArray(authorsRaw) ? authorsRaw.join(', ') : (authorsRaw || 'Unknown');
      const pageCount = paper.totalPages || paper.num_pages || paper.numPages || 'Unknown';

      const metadataContent = [
        `Title: ${paper.title || 'Unknown'}`,
        `Identifier (URI): ${paper.uri || 'Unknown'}`,
        `Author: ${authorDisplay}`,
        `Total Pages: ${pageCount}`,
        `Abstract: ${paper.abstract || 'Not extracted'}`,
        `Harvard Reference: ${paper.harvardReference || 'Not available'}`
      ].join('\n');

      return {
        observation: `PAPER METADATA FOUND. (This has been AUTO-SAVED to your structured long-term memory under Paper ${paper_index}).\n\n${metadataContent}`,
        memoryType: 'long_term',
        memoryEntry: {
          id: `Meta_P${paper_index}`, // Explicit deterministic ID
          type: 'metadata',
          paper_index: paper_index,
          content: metadataContent
        }
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
        observation: `SEARCH: "${keyword}" found ${total} time(s) in "${paper.title}":\n${pageList}`,
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
        observation: `MULTI-SEARCH RESULTS for "${paper.title}":\n${allResults.join('\n')}`,
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

    case 'get_paper_structure_map': {
      const { paper_index } = params;
      if (typeof paper_index !== 'number' || paper_index < 0 || paper_index >= papers.length) {
        return {
          observation: `ERROR: "paper_index" is required and must be a number.`,
          memoryType: 'short_term'
        };
      }

      const paper = papers[paper_index];
      if (!paper.pages || !Array.isArray(paper.pages)) {
        return {
          observation: `ERROR: No text content available for mapping.`,
          memoryType: 'short_term'
        };
      }

      const pagesToAnalyze = paper.pages.slice(0, 50);
      const textToAnalyze = pagesToAnalyze.map((text, i) => `--- PAGE ${i + 1} ---\n${text}`).join('\n\n');

      const prompt = `Analyze the following academic text (up to 50 pages) and construct a simple Table of Contents mapping logical sections to page numbers. Respond ONLY with a bulleted list.\n\nTEXT:\n${textToAnalyze}`;

      const buildStructureResult = (structure) => ({
        observation: `GENERATED STRUCTURE MAP:\n${structure}\n(This has been AUTO-SAVED to your long-term memory).`,
        memoryType: 'long_term',
        memoryEntry: {
          id: `Struct_P${paper_index}`,
          type: 'structure',
          paper_index: paper_index,
          content: `Document Structure:\n${structure}`
        }
      });

      // TIER 1: Gemini (only if available)
      if (genAI) {
        try {
          const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
          const result = await model.generateContent(prompt);
          return buildStructureResult(result.response.text());
        } catch (geminiErr) {
          // Gemini failed — fall through to OpenAI below
          console.warn('[get_paper_structure_map] Gemini failed, trying OpenAI fallback:', geminiErr.message);
        }
      }

      // TIER 2: OpenAI fallback (used when Gemini is unavailable or failed)
      if (!config.openaiApiKey) {
        return { observation: `ERROR: AI service not available — no fallback configured.`, memoryType: 'short_term' };
      }
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
        if (!response.ok) {
          const errBody = await response.text();
          return { observation: `ERROR: OpenAI fallback failed (${response.status}): ${errBody}`, memoryType: 'short_term' };
        }
        const data = await response.json();
        const structure = data.choices[0]?.message?.content || '';
        return buildStructureResult(structure);
      } catch (openaiErr) {
        return { observation: `ERROR: ${openaiErr.message}`, memoryType: 'short_term' };
      }
    }


    case 'list_workspace': {
      const paperSummaries = papers.length > 0
        ? papers.map((p, i) => `  [${i}] "${p.title}" by ${p.author || 'Unknown'} (${p.totalPages} pages) — ID: ${p.uri || 'unknown'}`).join('\n')
        : '  No papers loaded.';

      const noteSummaries = notes.length > 0
        ? notes.slice(0, 20)
          .map((n, i) => `  [${i}] "${(n.quote || '').substring(0, 60)}..." (Page ${n.pageNumber})`)
          .join('\n')
        : '  No saved notes.';

      return {
        observation: [
          `WORKSPACE:`,
          `Papers (${papers.length} total):`,
          paperSummaries,
          ``,
          `Notes (${notes.length} total):`,
          noteSummaries
        ].join('\n'),
        memoryType: 'short_term'
      };
    }

    case 'get_notes_for_paper': {
      const { paper_uri } = params;
      const paperNotes = notes.filter(n => n.pdfUri === paper_uri || n.paper_uri === paper_uri);

      if (paperNotes.length === 0) {
        return {
          observation: `No saved notes found for paper "${paper_uri}".`,
          memoryType: 'short_term'
        };
      }

      // Resolve the actual workspace index so notes group correctly in Layer 3
      const realPaperIndex = papers.findIndex(p => p.uri === paper_uri);
      const targetIndex = realPaperIndex !== -1 ? realPaperIndex : 99;

      const results = [];
      paperNotes.forEach((n, i) => {
        const memId = generateId('Note', targetIndex, i);
        const text = `Quote: "${n.quote}" (Pg ${n.pageNumber})`;

        sessionContextPool[memId] = {
          type: 'note',
          paper_index: targetIndex,
          page_number: n.pageNumber,
          content: text
        };

        results.push(`[MEMORY_ID: ${memId}]\n${text}`);
      });

      return {
        observation: `FOUND ${paperNotes.length} NOTES:\n\n${results.join('\n\n')}\n\nSYSTEM HINT: Use 'save_to_session_memory' with IDs to pin your favorite notes.`,
        memoryType: 'short_term'
      };
    }

    case 'save_to_session_memory': {
      // Accept all casing variants GPT-4o-mini may emit: memory_ids, MEMORY_IDs, memory_id
      const memory_ids = params.memory_ids || params.MEMORY_IDs || params.memory_id;
      if (!Array.isArray(memory_ids) || memory_ids.length === 0) {
        return {
          observation: 'ERROR: "memory_ids" must be a non-empty array of MEMORY_ID strings. Correct format: { "memory_ids": ["Page_P0_Pg1", "Page_P0_Pg2"] }. The IDs are shown in [MEMORY_ID: X] tags in tool output.',
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
