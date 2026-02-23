const logger = require('../utils/logger');

/**
 * Builds a complete system instruction for Gemini
 * Ensures AI knows:
 * - What documents it has access to
 * - How to cite them
 * - How to interpret context notes
 * - Expected response format
 * 
 * @param {Array} documentManifest - Array of { id, title, author }
 * @param {Array} contextNotes - Array of { quote, pageNumber, ... }
 * @returns {string} Complete system instruction
 */
function buildSystemInstruction(documentManifest = [], contextNotes = []) {
  // Build document list
  const docList = documentManifest.length > 0
    ? documentManifest
        .map((d, i) => `[${i + 1}] "${d.title}" by ${d.author || 'Unknown Author'} (ID: ${d.id})`)
        .join('\n')
    : 'No documents currently loaded.';

  // Build context notes list
  const notesList = contextNotes.length > 0
    ? contextNotes
        .map((n, i) => {
          const quote = (n.quote || '').substring(0, 80);
          return `[NOTE ${i + 1}] "${quote}..." (Page ${n.pageNumber || '?'})`;
        })
        .join('\n')
    : 'No context notes selected.';

  return `You are an advanced Research Assistant AI and Student Mentor.

## AVAILABLE DOCUMENTS
${docList}

## USER SELECTED CONTEXT NOTES
${notesList}

## CITATION INSTRUCTIONS (CRITICAL)
1. When answering based on documents, cite sources inline using [1], [2], [3] for document numbers, or [NOTE 1], [NOTE 2] for notes
2. At the VERY END of your response, append this exact marker and JSON:
---CITATIONS---
[
  { "id": 1, "sourceId": "[PDF_ID_FROM_DOCUMENT_LIST]", "title": "Document Title", "page": 5, "quote": "The exact quote from the document..." }
]

3. IMPORTANT RULES:
   - Only include citations for documents/notes in the AVAILABLE DOCUMENTS list
   - If you did NOT use any documents, do NOT include the ---CITATIONS--- block
   - Always use the exact sourceId from the ID field above
   - Include the actual quote text, not a paraphrase
   - Include the correct page number

## BEHAVIOR GUIDELINES
- Answer questions based primarily on provided documents
- Be academic, clear, and helpful
- Acknowledge any document limitations
- Never hallucinate references to documents you don't have
- Be concise and well-organized
- Use citations to build trust and credibility`;
}

/**
 * Extracts citations from response text
 * Expects format: response text...\n---CITATIONS---\n[...json...]
 * 
 * @param {string} responseText - Full response from Gemini
 * @returns {Object} { text: string, citations: Array }
 */
function extractCitations(responseText) {
  if (!responseText) {
    return { text: '', citations: [] };
  }

  const separator = '---CITATIONS---';
  
  // If no citations marker, return text as-is with empty citations
  if (!responseText.includes(separator)) {
    logger.info('[SystemInstructionBuilder] No citations found in response');
    return { text: responseText.trim(), citations: [] };
  }

  try {
    // Split response and citation block
    const parts = responseText.split(separator);
    const content = parts[0].trim();
    const citationRaw = parts[1].trim();

    // Clean up markdown code blocks if present
    const citationCleaned = citationRaw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    // Parse JSON
    let citations = [];
    try {
      const parsed = JSON.parse(citationCleaned);
      citations = Array.isArray(parsed) ? parsed : [];
      logger.info(`[SystemInstructionBuilder] Extracted ${citations.length} citations`);
    } catch (parseError) {
      // JSON parsing failed - log but don't crash
      logger.warn('[SystemInstructionBuilder] Failed to parse citation JSON:', parseError.message);
      return { text: content, citations: [] };
    }

    return { text: content, citations };

  } catch (error) {
    // If anything unexpected happens, return text with empty citations
    logger.error('[SystemInstructionBuilder] Citation extraction error:', error.message);
    return { text: responseText.trim(), citations: [] };
  }
}

module.exports = {
  buildSystemInstruction,
  extractCitations
};