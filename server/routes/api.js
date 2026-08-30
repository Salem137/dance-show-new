const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const charactersPath = path.join(__dirname, '..', '..', 'server', 'config', 'characters.json');
const characterImagesDir = path.join(__dirname, '..', '..', 'assets', 'character-images');

if (!fs.existsSync(characterImagesDir)) {
  fs.mkdirSync(characterImagesDir, { recursive: true });
}

const charImageStorage = multer.memoryStorage();

const charImageUpload = multer({
  storage: charImageStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files allowed'));
    }
  }
});

module.exports = function(showState, io) {
  router.get('/state', (req, res) => {
    res.json(showState.getState());
  });

  router.get('/scene', (req, res) => {
    const scene = showState.getCurrentScene();
    if (!scene) {
      return res.json({ error: 'No active scene', showStarted: showState.showStarted });
    }
    res.json({
      scene,
      votes: showState.getVoteCounts(),
      totalVotes: showState.getTotalVotes(),
      votingOpen: showState.votingOpen
    });
  });

  router.get('/config', (req, res) => {
    res.json({
      showName: showState.config.showName,
      showSubtitle: showState.config.showSubtitle,
      venue: showState.config.venue,
      showDate: showState.config.showDate,
      showTime: showState.config.showTime,
      totalScenes: showState.config.scenes.length
    });
  });

  router.post('/vote/:choiceId', (req, res) => {
    const choiceId = req.params.choiceId;
    const success = showState.castVote(choiceId);

    if (success) {
      res.json({ success: true, votes: showState.getVoteCounts() });
    } else {
      res.status(400).json({ success: false, error: 'Voting is closed or invalid choice' });
    }
  });

  // ===== CHARACTERS =====
  router.get('/characters', (req, res) => {
    try {
      const data = JSON.parse(fs.readFileSync(charactersPath, 'utf8'));
      res.json(data);
    } catch (err) {
      res.json({ characters: [] });
    }
  });

  router.post('/characters', (req, res) => {
    try {
      fs.writeFileSync(charactersPath, JSON.stringify(req.body, null, 2));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/upload-character-image', charImageUpload.single('image'), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }
    if (!req.body.number) {
      return res.status(400).json({ success: false, error: 'Missing character number' });
    }
    const ext = path.extname(req.file.originalname);
    const filename = 'char-' + req.body.number + ext;
    const filePath = path.join(characterImagesDir, filename);
    fs.writeFileSync(filePath, req.file.buffer);
    console.log(`[UPLOAD] Character image: ${filename} (${req.file.size} bytes)`);
    res.json({
      success: true,
      filename: filename,
      number: req.body.number
    });
  });

  router.get('/character-images', (req, res) => {
    try {
      const files = fs.readdirSync(characterImagesDir)
        .filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f))
        .map(f => ({
          name: f,
          url: '/assets/character-images/' + f
        }));
      res.json(files);
    } catch (err) {
      res.json([]);
    }
  });

  return router;
};
