const express = require('express');
const router = express.Router();
const databaseService = require('../services/databaseService');

router.post('/init-schema', async (req, res, next) => {
  try {
    await databaseService.initSchema();
    res.json({ success: true, data: { message: 'Schema initialized' } });
  } catch (err) { next(err); }
});

router.post('/save-paper', async (req, res, next) => {
  try {
    const { userId, data } = req.body;
    await databaseService.savePaper(data, userId);
    res.json({ success: true, data: { message: 'Paper saved' } });
  } catch (err) { next(err); }
});

router.post('/save-note', async (req, res, next) => {
  try {
    const { userId, data } = req.body;
    const result = await databaseService.saveNote(data, userId);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.get('/library-data', async (req, res, next) => {
  try {
    const userId = req.headers['x-user-id'];
    const data = await databaseService.getAllLibraryData(userId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/folders', async (req, res, next) => {
  try {
    const userId = req.headers['x-user-id'];
    const folders = await databaseService.getFolders(userId);
    res.json({ success: true, data: folders });
  } catch (err) { next(err); }
});

router.delete('/paper/:uri', async (req, res, next) => {
  try {
    const { uri } = req.params;
    await databaseService.deletePaper(decodeURIComponent(uri));
    res.json({ success: true, data: { message: 'Paper deleted' } });
  } catch (err) { next(err); }
});

router.post('/update-note', async (req, res, next) => {
  try {
    const { id, content } = req.body.data;
    await databaseService.updateNote(id, content);
    res.json({ success: true, data: { message: 'Note updated' } });
  } catch (err) { next(err); }
});

router.delete('/note/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    await databaseService.deleteNote(parseInt(id));
    res.json({ success: true, data: { message: 'Note deleted' } });
  } catch (err) { next(err); }
});

router.post('/toggle-star', async (req, res, next) => {
  try {
    const { noteId, state } = req.body.data;
    await databaseService.toggleStar(noteId, state);
    res.json({ success: true, data: { message: 'Star toggled' } });
  } catch (err) { next(err); }
});

router.post('/toggle-flag', async (req, res, next) => {
  try {
    const { noteId, state } = req.body.data;
    await databaseService.toggleFlag(noteId, state);
    res.json({ success: true, data: { message: 'Flag toggled' } });
  } catch (err) { next(err); }
});

router.post('/create-folder', async (req, res, next) => {
  try {
    const { userId, data } = req.body;
    const { name, type, parentId, description } = data;
    await databaseService.createFolder(name, type, parentId, description, userId);
    res.json({ success: true, data: { message: 'Folder created' } });
  } catch (err) { next(err); }
});

router.post('/assign-note', async (req, res, next) => {
  try {
    const { noteId, folderId } = req.body.data;
    await databaseService.assignNote(noteId, folderId);
    res.json({ success: true, data: { message: 'Note assigned' } });
  } catch (err) { next(err); }
});

module.exports = router;
