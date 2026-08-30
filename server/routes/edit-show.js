const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { getVideoDuration } = require('../video-utils');

const videosDir = path.join(__dirname, '..', '..', 'assets', 'videos');
if (!fs.existsSync(videosDir)) {
  fs.mkdirSync(videosDir, { recursive: true });
  console.log('[EDIT] Created assets/videos directory');
}

const imagesDir = path.join(__dirname, '..', '..', 'assets', 'images');
if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir, { recursive: true });
  console.log('[EDIT] Created assets/images directory');
}

const videoStorage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, videosDir); },
  filename: function (req, file, cb) { cb(null, file.originalname); }
});

const imageStorage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, imagesDir); },
  filename: function (req, file, cb) { cb(null, file.originalname); }
});

const uploadVideo = multer({
  storage: videoStorage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith('video/')) { cb(null, true); }
    else { cb(new Error('Only video files allowed')); }
  }
});

const uploadImage = multer({
  storage: imageStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith('image/')) { cb(null, true); }
    else { cb(new Error('Only image files allowed')); }
  }
});

module.exports = function (showState) {

  router.get('/config', (req, res) => {
    res.json(showState.config);
  });

  router.post('/save', (req, res) => {
    try {
      showState.config.scenes = req.body.scenes || showState.config.scenes;
      if (req.body.showName !== undefined) showState.config.showName = req.body.showName;
      if (req.body.showSubtitle !== undefined) showState.config.showSubtitle = req.body.showSubtitle;
      if (req.body.venue !== undefined) showState.config.venue = req.body.venue;
      if (req.body.showDate !== undefined) showState.config.showDate = req.body.showDate;
      if (req.body.showTime !== undefined) showState.config.showTime = req.body.showTime;
      showState.saveConfig();
      showState.reloadConfig();
      res.json({ success: true, config: showState.config });
    } catch (err) {
      console.error('[SAVE] Error saving config:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/upload-video', uploadVideo.single('video'), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }
    const duration = getVideoDuration(req.file.path);
    console.log(`[UPLOAD] Video: ${req.file.filename} - Size: ${req.file.size} bytes, Duration: ${duration}s`);
    res.json({ success: true, filename: req.file.filename, size: req.file.size, duration: duration });
  });

  router.post('/upload-image', uploadImage.single('image'), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }
    console.log(`[UPLOAD] Image: ${req.file.filename} - Size: ${req.file.size} bytes`);
    res.json({ success: true, filename: req.file.filename, size: req.file.size });
  });

  // Multer error handler
  router.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ success: false, error: err.message });
    }
    next(err);
  });

  router.delete('/delete-video/:filename', (req, res) => {
    const filename = req.params.filename;
    const videoPath = path.join(videosDir, filename);
    if (fs.existsSync(videoPath)) {
      fs.unlinkSync(videoPath);
      res.json({ success: true, filename });
    } else {
      res.status(404).json({ success: false, error: 'File not found' });
    }
  });

  router.delete('/delete-image/:filename', (req, res) => {
    const filename = req.params.filename;
    const imagePath = path.join(imagesDir, filename);
    if (fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
      res.json({ success: true, filename });
    } else {
      res.status(404).json({ success: false, error: 'File not found' });
    }
  });

  router.get('/videos', (req, res) => {
    try {
      const files = fs.readdirSync(videosDir)
        .filter(f => /\.(mp4|webm|avi|mov|mkv)$/i.test(f))
        .map(f => ({ name: f, size: fs.statSync(path.join(videosDir, f)).size }));
      res.json(files);
    } catch (err) { res.json([]); }
  });

  router.get('/images', (req, res) => {
    try {
      const files = fs.readdirSync(imagesDir)
        .filter(f => /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(f))
        .map(f => ({ name: f, size: fs.statSync(path.join(imagesDir, f)).size }));
      res.json(files);
    } catch (err) { res.json([]); }
  });

  router.post('/move-scene', (req, res) => {
    const { sceneIndex, direction } = req.body;
    const scenes = showState.config.scenes;
    const newIndex = sceneIndex + direction;
    if (newIndex < 0 || newIndex >= scenes.length) {
      return res.status(400).json({ success: false, error: 'Invalid move' });
    }
    const temp = scenes[sceneIndex];
    scenes[sceneIndex] = scenes[newIndex];
    scenes[newIndex] = temp;
    showState.saveConfig();
    showState.reloadConfig();
    res.json({ success: true, scenes: showState.config.scenes });
  });

  router.post('/save-content', (req, res) => {
    try {
      const langFile = req.query.lang || 'content-en.json';
      const contentPath = path.join(__dirname, '..', '..', 'public', langFile);
      fs.writeFileSync(contentPath, JSON.stringify(req.body, null, 2));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
};
