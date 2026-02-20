const { GoogleGenerativeAI } = require('@google/generative-ai');
const { initializeEnvironment } = require('../config/env');
const logger = require('../utils/logger');

const config = initializeEnvironment();

let genAI = null;
if (config.geminiApiKey) {
  genAI = new GoogleGenerativeAI(config.geminiApiKey);
}

const uploadedFiles = new Map();

async function uploadFile(file, uniqueId) {
  if (!genAI) throw new Error('Gemini AI not initialized');

  if (uploadedFiles.has(uniqueId)) {
    return uploadedFiles.get(uniqueId);
  }

  const fileManager = genAI.fileManager;
  const uploadResult = await fileManager.uploadFile(file.path || file.buffer, {
    mimeType: file.mimetype,
    displayName: file.originalname
  });

  for (let i = 0; i < 30; i++) {
    const fileStatus = await fileManager.getFile(uploadResult.file.name);
    if (fileStatus.state === 'ACTIVE') {
      uploadedFiles.set(uniqueId, uploadResult.file.uri);
      return uploadResult.file.uri;
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  throw new Error('File upload timeout');
}

async function sendMessage(message, fileUris, contextNotes) {
  if (!genAI) throw new Error('Gemini AI not initialized');

  const model = genAI.getGenerativeModel({
    model: 'gemini-3-flash-preview',
    systemInstruction: 'You are an advanced Research Assistant...'
  });

  const parts = [{ text: message }];
  
  if (fileUris && fileUris.length > 0) {
    fileUris.forEach(uri => {
      parts.push({ fileData: { fileUri: uri, mimeType: 'application/pdf' } });
    });
  }

  const result = await model.generateContent({ contents: [{ role: 'user', parts }] });
  const response = await result.response;

  return {
    text: response.text(),
    citations: []
  };
}

module.exports = {
  uploadFile,
  sendMessage
};
