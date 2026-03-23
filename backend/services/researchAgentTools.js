// backend/services/researchAgentTools.js
//
// Tool Schema + Executor for the Research Agent.
// Tools operate purely on workspace data passed in — no DB calls, no file I/O.
// Each tool returns { observation, memoryType } where:
//   memoryType: 'short_term' = only in next iteration, then dropped
//   memoryType: 'long_term'  = agent explicitly saves to sessionMemory via save_to_memory

const TOOL_SCHEMA = [
  {
    name: 'read_page',
    description: `Read the full text of a single page from a paper. Returns the text content.
      This is SHORT-TERM: the text is only available for ONE iteration.
      If you find important information, use save_to_memory to store key findings before moving on.`,
    parameters: {
      type: 'OBJECT',
      properties: {
        paper_index: {
          type: 'NUMBER',
          description: 'Index of the paper in the papers array (0-based).'
        },
        page_number: {
          type: 'NUMBER',
          description: 'Page number to read (1-based, as displayed to user).'
        }
      },
      required: ['paper_index', 'page_number']
    }
  },

  {
    name: 'read_multiple_pages',
    description: `Read a range of consecutive pages from a paper. Returns combined text with page markers.
      This is SHORT-TERM: the text is only available for ONE iteration.
      Use save_to_memory to keep important findings after reading.`,
    parameters: {
      type: 'OBJECT',
      properties: {
        paper_index: {
          type: 'NUMBER',
          description: 'Index of the paper (0-based).'
        },
        start_page: {
          type: 'NUMBER',
          description: 'Starting page number (1-based, inclusive).'
        },
        end_page: {
          type: 'NUMBER',
          description: 'Ending page number (1-based, inclusive).'
        }
      },
      required: ['paper_index', 'start_page', 'end_page']
    }
  },

  {
    name: 'get_paper_info',
    description: `Get metadata about a paper: title, author, total pages, abstract,
      harvard reference, and whether it has a reference list.
      Use this FIRST to understand a paper's structure before reading pages.`,
    parameters: {
      type: 'OBJECT',
      properties: {
        paper_index: {
          type: 'NUMBER',
          description: 'Index of the paper (0-based).'
        }
      },
      required: ['paper_index']
    }
  },
  {
    name: 'get_paper_structure',
    description: `Generates a table of contents mapping the logical structure of a paper (Introduction, Methods, Results, Discussion, Conclusion) to page numbers.
      Use this if you are struggling to find the right pages to read or if keyword searches fail to locate useful sections. This tool will return the Title, Abstract and Table of Contents.
      IMPORTANT: This tool automatically saves its findings to your LONG-TERM session memory.`,
    parameters: {
      type: 'OBJECT',
      properties: {
        paper_index: {
          type: 'NUMBER',
          description: 'Index of the paper (0-based).'
        }
      },
      required: ['paper_index']
    }
  },

  {
    name: 'search_keyword',
    description: `Search for a keyword across all pages of a paper.
      Returns which pages contain the keyword and how many times it appears.
      Use this to locate sections like "methodology", "results", "conclusion", "discussion".`,
    parameters: {
      type: 'OBJECT',
      properties: {
        paper_index: {
          type: 'NUMBER',
          description: 'Index of the paper (0-based).'
        },
        keyword: {
          type: 'STRING',
          description: 'Keyword or phrase to search for (case-insensitive).'
        }
      },
      required: ['paper_index', 'keyword']
    }
  },

  {
    name: 'search_multiple_keyword',
    description: `Search for multiple keywords across all pages of a paper in a single action.
      Returns which pages contain each keyword and how many times they appear.
      Use this instead of calling search_keyword multiple times to save iterations.`,
    parameters: {
      type: 'OBJECT',
      properties: {
        paper_index: {
          type: 'NUMBER',
          description: 'Index of the paper (0-based).'
        },
        keywords: {
          type: 'ARRAY',
          items: { type: 'STRING' },
          description: 'A list of keywords or phrases to search for (e.g. ["methodology", "methods", "data"]).'
        }
      },
      required: ['paper_index', 'keywords']
    }
  },

  {
    name: 'get_references',
    description: `Get the extracted reference list from a paper.
      Returns the array of reference strings found at the end of the paper.
      Use this when the student asks about citations or bibliographies.`,
    parameters: {
      type: 'OBJECT',
      properties: {
        paper_index: {
          type: 'NUMBER',
          description: 'Index of the paper (0-based).'
        }
      },
      required: ['paper_index']
    }
  },

  {
    name: 'list_workspace',
    description: `List everything in the student's workspace.
      Returns all loaded papers (with titles, authors, page counts) and all saved notes.
      Use this to understand what resources are available before starting any task.`,
    parameters: {
      type: 'OBJECT',
      properties: {},
      required: []
    }
  },

  {
    name: 'get_notes_for_paper',
    description: `Get all saved notes associated with a specific paper.
      Returns notes with their quotes, justifications, tags, and page numbers.
      Use this to see what the student has already extracted from a paper.`,
    parameters: {
      type: 'OBJECT',
      properties: {
        paper_uri: {
          type: 'STRING',
          description: 'The URI identifier of the paper to get notes for.'
        }
      },
      required: ['paper_uri']
    }
  },

  {
    name: 'save_to_memory',
    description: `Save an important finding to your LONG-TERM session memory.
      This information will persist for the entire task — all future iterations.
      Use this after reading pages to store key findings, quotes, or summaries.
      WITHOUT this, page text disappears after one iteration.
      Always include the source (paper title, page numbers) in what you save.`,
    parameters: {
      type: 'OBJECT',
      properties: {
        content: {
          type: 'STRING',
          description: 'The key finding or information to remember. Include source (paper title, page numbers).'
        },
        label: {
          type: 'STRING',
          description: 'A short label to identify this memory (e.g. "methodology_summary", "key_finding_1").'
        }
      },
      required: ['content', 'label']
    }
  },

  {
    name: 'task_complete',
    description: `Call ONLY when the student's task is fully completed.
      Provide your complete, well-formatted response as the "response" parameter.
      This ends the agent loop and returns the answer to the student.`,
    parameters: {
      type: 'OBJECT',
      properties: {
        response: {
          type: 'STRING',
          description: 'Your complete, well-formatted response to the student.'
        }
      },
      required: ['response']
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
 * @returns {Promise<{ observation: string, memoryType: 'short_term'|'long_term', memoryEntry?: {label, content} }>}
 */
async function executeTool(toolName, params, workspace, genAI) {
  const { papers, notes } = workspace;

  switch (toolName) {

    case 'read_page': {
      const { paper_index, page_number } = params;
      if (paper_index < 0 || paper_index >= papers.length) {
        return {
          observation: `ERROR: Paper index ${paper_index} is out of range. Available: 0 to ${papers.length - 1}.`,
          memoryType: 'short_term'
        };
      }
      const paper = papers[paper_index];
      const pageIdx = page_number - 1; // convert 1-based to 0-based
      if (pageIdx < 0 || pageIdx >= paper.pages.length) {
        return {
          observation: `ERROR: Page ${page_number} does not exist. "${paper.title}" has ${paper.pages.length} pages.`,
          memoryType: 'short_term'
        };
      }
      return {
        observation: `PAGE ${page_number} of "${paper.title}":\n${paper.pages[pageIdx]}`,
        memoryType: 'short_term'
      };
    }

    case 'read_multiple_pages': {
      const { paper_index, start_page, end_page } = params;
      if (paper_index < 0 || paper_index >= papers.length) {
        return {
          observation: `ERROR: Paper index ${paper_index} is out of range. Available: 0 to ${papers.length - 1}.`,
          memoryType: 'short_term'
        };
      }
      const paper = papers[paper_index];
      const startIdx = Math.max(0, start_page - 1);
      const endIdx = Math.min(paper.pages.length, end_page);

      if (startIdx >= paper.pages.length) {
        return {
          observation: `ERROR: Start page ${start_page} exceeds total pages (${paper.pages.length}).`,
          memoryType: 'short_term'
        };
      }

      const selectedPages = paper.pages.slice(startIdx, endIdx);
      const result = selectedPages
        .map((text, i) => `--- PAGE ${startIdx + i + 1} ---\n${text}`)
        .join('\n\n');

      return {
        observation: `PAGES ${start_page}-${Math.min(end_page, paper.pages.length)} of "${paper.title}":\n\n${result}`,
        memoryType: 'short_term'
      };
    }

    case 'get_paper_info': {
      const { paper_index } = params;
      if (paper_index < 0 || paper_index >= papers.length) {
        return {
          observation: `ERROR: Paper index ${paper_index} out of range.`,
          memoryType: 'short_term'
        };
      }
      const paper = papers[paper_index];
      return {
        observation: [
          `PAPER INFO [${paper_index}]:`,
          `Title: ${paper.title || 'Unknown'}`,
          `Author: ${paper.author || 'Unknown'}`,
          `Total Pages: ${paper.totalPages}`,
          `URI: ${paper.uri}`,
          `Abstract: ${paper.abstract || 'Not extracted'}`,
          `Harvard Reference: ${paper.harvardReference || 'Not available'}`,
          `Has Reference List: ${paper.references && paper.references.length > 0 ? `Yes (${paper.references.length} references)` : 'No'}`
        ].join('\n'),
        memoryType: 'short_term'
      };
    }

    case 'search_keyword': {
      const { paper_index, keyword } = params;
      if (paper_index < 0 || paper_index >= papers.length) {
        return {
          observation: `ERROR: Paper index ${paper_index} out of range.`,
          memoryType: 'short_term'
        };
      }
      if (!keyword || !keyword.trim()) {
        return {
          observation: 'ERROR: Keyword cannot be empty.',
          memoryType: 'short_term'
        };
      }
      const paper = papers[paper_index];
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
      if (paper_index < 0 || paper_index >= papers.length) {
        return {
          observation: `ERROR: Paper index ${paper_index} out of range.`,
          memoryType: 'short_term'
        };
      }
      if (!Array.isArray(keywords) || keywords.length === 0) {
        return {
          observation: 'ERROR: "keywords" must be a non-empty array of strings.',
          memoryType: 'short_term'
        };
      }
      const paper = papers[paper_index];
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
        observation: `MULTI-SEARCH RESULTS for "${paper.title}":\n${allResults.join('\\n')}`,
        memoryType: 'short_term'
      };
    }

    case 'get_references': {
      const { paper_index } = params;
      if (paper_index < 0 || paper_index >= papers.length) {
        return {
          observation: `ERROR: Paper index ${paper_index} out of range.`,
          memoryType: 'short_term'
        };
      }
      const paper = papers[paper_index];
      if (!paper.references || paper.references.length === 0) {
        return {
          observation: `No reference list was extracted for "${paper.title}".`,
          memoryType: 'short_term'
        };
      }
      const refList = paper.references
        .map((ref, i) => `[${i + 1}] ${ref}`)
        .join('\\n');
      return {
        observation: `REFERENCES for "${paper.title}" (${paper.references.length} total):\\n${refList}`,
        memoryType: 'short_term'
      };
    }

    case 'get_paper_structure': {
      const { paper_index } = params;
      if (paper_index < 0 || paper_index >= papers.length) {
        return { observation: `ERROR: Paper index out of range.`, memoryType: 'short_term' };
      }
      if (!genAI) {
        return { observation: `ERROR: AI service not available for structure generation.`, memoryType: 'short_term' };
      }

      const paper = papers[paper_index];
      const pagesToAnalyze = paper.pages.slice(0, 50);
      const textToAnalyze = pagesToAnalyze.map((text, i) => `--- PAGE ${i + 1} ---\\n${text}`).join('\\n\\n');

      const prompt = `Analyze the following academic text (up to 50 pages) and construct a simple Table of Contents mapping the logical structure of the paper to page numbers. 
Identify key sections such as Introduction, Methodology, Results, Discussion, Conclusion. 
If explicit headings don't exist, infer where these sections begin. 
Respond ONLY with a clear, concise bulleted list mapping sections to page numbers.

TEXT TO ANALYZE:
${textToAnalyze}`;

      try {
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const result = await model.generateContent(prompt);
        const structure = result.response.text();

        return {
          observation: `GENERATED STRUCTURE FOR "${paper.title}":\\n${structure}\\n(This has been auto-saved to your session memory).`,
          memoryType: 'long_term',
          memoryEntry: {
            label: `structure_paper_${paper_index}`,
            content: `Structure of "${paper.title}":\\n${structure}`
          }
        };
      } catch (err) {
        return { observation: `ERROR analyzing paper structure: ${err.message}`, memoryType: 'short_term' };
      }
    }


    case 'list_workspace': {
      const paperSummaries = papers.length > 0
        ? papers.map((p, i) => `  [${i}] "${p.title}" by ${p.author || 'Unknown'} (${p.totalPages} pages)`).join('\n')
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

      const noteList = paperNotes
        .map((n, i) => [
          `[NOTE ${i + 1}] Page ${n.pageNumber}:`,
          `  Quote: "${(n.quote || '').substring(0, 150)}..."`,
          `  Tags: ${(n.tags || []).join(', ') || 'none'}`
        ].join('\n'))
        .join('\n\n');

      return {
        observation: `NOTES for paper (${paperNotes.length} total):\n\n${noteList}`,
        memoryType: 'short_term'
      };
    }

    case 'save_to_memory': {
      const { content, label } = params;
      if (!content || !label) {
        return {
          observation: 'ERROR: save_to_memory requires both "content" and "label".',
          memoryType: 'short_term'
        };
      }
      return {
        observation: `SAVED TO MEMORY [${label}]: "${content.substring(0, 100)}${content.length > 100 ? '...' : ''}"`,
        memoryType: 'long_term',
        memoryEntry: { label, content }
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
