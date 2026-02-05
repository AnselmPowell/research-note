const express = require('express');
const router = express.Router();
const multer = require('multer');
const agentService = require('../services/agentService');

const upload = multer({ storage: multer.memoryStorage() });

router.post('/upload-file', upload.single('file'), async (req, res, next) => {
  try {
    const { uniqueId } = req.body;
    const fileUri = await agentService.uploadFile(req.file, uniqueId);
    res.json({ success: true, data: { fileUri } });
  } catch (err) {
    next(err);
  }
});

router.post('/send-message', async (req, res, next) => {
  try {
    const { message, fileUris, contextNotes } = req.body.data;
    const result = await agentService.sendMessage(message, fileUris, contextNotes);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
