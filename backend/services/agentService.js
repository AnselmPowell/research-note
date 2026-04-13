console.log('[AgentService] 🔍 Starting module load...');

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { initializeEnvironment } = require('../config/env');
const logger = require('../utils/logger');
const { buildSystemInstruction, extractCitations } = require('./systemInstructionBuilder');

const config = initializeEnvironment();

let genAI = null;
if (config.geminiApiKey) {
  genAI = new GoogleGenerativeAI(config.geminiApiKey);
} else {
  logger.warn('[Agent] No GEMINI_API_KEY set');
}

const uploadedFiles = new Map();

async function uploadFile(file, uniqueId) {
  if (!genAI) {
    throw new Error('Gemini AI not initialized');
  }

  // Check if file is already cached - return ONLY the URI
  if (uploadedFiles.has(uniqueId)) {
    const cachedFile = uploadedFiles.get(uniqueId);
    return cachedFile.uri;
  }

  try {
    // Store the file data in memory for later use
    const fileUri = `file://${uniqueId}`;
    uploadedFiles.set(uniqueId, {
      uri: fileUri,
      file: file,
      mimeType: file.mimetype,
      originalName: file.originalname
    });

    logger.info(`[Agent] File uploaded and cached: ${uniqueId}`);
    return fileUri;
  } catch (error) {
    logger.error('[Agent] uploadFile error:', error.message);
    throw error;
  }
}

async function sendMessage(message, fileUris, contextNotes = [], documentMetadata = []) {
  if (!genAI) throw new Error('Gemini AI not initialized');

  try {
    console.log('[sendMessage] DEBUG: fileUris received:', fileUris);
    console.log('[sendMessage] DEBUG: fileUris.length:', fileUris ? fileUris.length : 0);
    console.log('[sendMessage] DEBUG: documentMetadata:', documentMetadata);
    console.log('[sendMessage] DEBUG: contextNotes.length:', contextNotes.length);

    const systemInstruction = buildSystemInstruction(documentMetadata, contextNotes);
    console.log('[sendMessage] DEBUG: systemInstruction length:', systemInstruction.length);

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash-lite',
      systemInstruction
    });




    const parts = [];


    // ATTACH FILES FIRST (multimodal best practice)
    if (fileUris && fileUris.length > 0) {
      console.log(`[sendMessage] DEBUG: Processing ${fileUris.length} file URIs`);
      for (const uri of fileUris) {
        console.log(`[sendMessage] DEBUG: Processing URI: ${uri}`);

        // Extract uniqueId from file:// URI
        const uniqueId = uri.replace('file://', '');
        console.log(`[sendMessage] DEBUG: Extracted uniqueId: ${uniqueId}`);

        // Get file data from our cache
        const fileData = uploadedFiles.get(uniqueId);
        console.log(`[sendMessage] DEBUG: File in cache? ${!!fileData}`);

        if (fileData) {
          const base64Data = fileData.file.buffer.toString('base64');
          console.log(`[sendMessage] DEBUG: Converted to base64, length: ${base64Data.length}`);

          parts.push({
            inlineData: {
              mimeType: fileData.mimeType || 'application/pdf',
              data: base64Data
            }
          });
          console.log(`[sendMessage] DEBUG: Added file to parts`);
        } else {
          console.warn(`[sendMessage] DEBUG: File NOT in cache! URI: ${uri}, uniqueId: ${uniqueId}`);
          console.log('[sendMessage] DEBUG: Available cache keys:', Array.from(uploadedFiles.keys()));
        }
      }
    } else {
      console.log('[sendMessage] DEBUG: No file URIs provided');
    }

    // ADD TEXT MESSAGE WITH CONTEXT NOTES SUMMARY
    let enhancedMessage = message;
    if (contextNotes && contextNotes.length > 0) {
      const notesSummary = contextNotes
        .map(n => `- "${(n.quote || '').substring(0, 80)}..." (Page ${n.pageNumber})`)
        .join('\n');
      enhancedMessage = message + `\n\n[CONTEXT NOTES THE USER SELECTED]\n${notesSummary}`;
    }

    parts.push({ text: enhancedMessage });
    console.log(`[sendMessage] DEBUG: Total parts: ${parts.length}`);

    // CALL GEMINI
    const result = await model.generateContent({
      contents: [{ role: 'user', parts }]
    });

    const responseText = result.response.text();

    // EXTRACT CITATIONS FROM RESPONSE
    const { text, citations } = extractCitations(responseText);

    logger.info(`[Agent] Response generated with ${citations.length} citations`);

    return { text, citations };

  } catch (error) {
    logger.error('[Agent] sendMessage error:', error.message);
    throw error;
  }
}

module.exports = {
  uploadFile,
  sendMessage
};

console.log('[AgentService] ✅ Module exports completed');
console.log('[AgentService] 📋 Exported functions:', Object.keys(module.exports));
console.log('[AgentService] ✅ AgentService module fully loaded and ready!');
