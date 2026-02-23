const express = require('express');
const router = express.Router();
const multer = require('multer');

let agentService;
try {
  agentService = require('../services/agentService');
} catch (err) {
  console.error('[Agent Route] Failed to load agentService:', err.message);
}

const upload = multer({ storage: multer.memoryStorage() });

router.post('/upload-file', upload.single('file'), async (req, res, next) => {
  try {
    const { uniqueId } = req.body;
    
    if (!agentService) {
      throw new Error('agentService is undefined - module failed to load');
    }
    
    if (!agentService.uploadFile) {
      throw new Error('agentService.uploadFile is undefined');
    }
    
    const fileUri = await agentService.uploadFile(req.file, uniqueId);
    res.json({ success: true, data: { fileUri } });
  } catch (err) {
    next(err);
  }
});

router.post('/send-message', async (req, res, next) => {
  try {
    const { message, fileUris, contextNotes, documentMetadata } = req.body.data || req.body;
    
    const result = await agentService.sendMessage(
      message,
      fileUris,
      contextNotes,
      documentMetadata
    );
    
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
