const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const storage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, path.join(__dirname, '..', '..', 'assets', 'videos')); },
  filename: function (req, file, cb) { cb(null, file.originalname); }
});
const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only video files are allowed'), false);
    }
  }
});

module.exports = function (showState, io) {

  function playVideo(videoFilename) {
    showState.showPhase = 'video';
    console.log(`[PLAY] "${videoFilename}"`);
    io.emit('play_video', { video: videoFilename || '' });
    io.emit('video_playing', { video: videoFilename });
    io.emit('show_state', showState.getState());
  }

  function freezeVideo() { showState.videoPaused = true; io.emit('freeze'); io.emit('show_state', showState.getState()); }
  function resumeVideo() { showState.videoPaused = false; io.emit('resume'); io.emit('show_state', showState.getState()); }

  let handlingEnded = false;

  function handleVideoEnded() {
    if (handlingEnded) return;
    handlingEnded = true;
    showState.clearAutoTimers();
    const scene = showState.getCurrentScene();
    if (!scene) { handlingEnded = false; return; }
    console.log(`[ENDED] ${scene.title} (${scene.type})`);

    if (scene.type === 'outro' || !showState.getNextScene()) {
      showState.showPhase = 'ended';
      io.emit('show_ended');
      io.emit('show_state', showState.getState());
      handlingEnded = false;
      return;
    }

    showState.advanceScene();
    io.emit('scene_changed', { scene: showState.getCurrentScene() });
    setTimeout(() => { startScene(showState.getCurrentScene()); handlingEnded = false; }, 800);
  }

  function startScene(scene) {
    if (!scene) return;
    showState.videoPaused = false;
    console.log(`[SCENE] ${scene.title} (${scene.type})`);
    switch (scene.type) {
      case 'video': case 'intro': case 'linear': startVideoScene(scene); break;
      case 'branching': startBranchingScene(scene); break;
      case 'accumulative': startAccumulativeScene(scene); break;
      case 'timer': startTimerScene(scene); break;
      case 'category_vote': startCategoryVoteScene(scene); break;
      default: startVideoScene(scene);
    }
  }

  function startVideoScene(scene) {
    if (scene.image) {
      io.emit('play_image', { image: scene.image });
      io.emit('show_state', showState.getState());
      if (scene.limitTime && scene.videoDuration > 0) {
        const timer = setTimeout(() => { handleVideoEnded(); }, scene.videoDuration * 1000);
        showState.autoTimers.push(timer);
      }
    } else if (scene.video) {
      playVideo(scene.video);
      if (scene.limitTime && scene.videoDuration > 0) {
        const timer = setTimeout(() => { freezeVideo(); setTimeout(() => handleVideoEnded(), 800); }, scene.videoDuration * 1000);
        showState.autoTimers.push(timer);
      }
    }
  }

  function startBranchingScene(scene) {
    showState.resetVotes();
    showState.votingOpen = false;
    const duration = scene.votingDuration || 15;
    
    // Show image first if available
    if (scene.image) {
      io.emit('play_image', { image: scene.image });
      io.emit('show_state', showState.getState());
      setTimeout(() => {
        io.emit('show_choices', { choices: scene.choices, duration });
        io.emit('announcement', { text: scene.announcement });
        setTimeout(() => {
          showState.votingOpen = true;
          showState.showPhase = 'voting';
          io.emit('voting_open', { scene, duration });
          io.emit('show_state', showState.getState());
        }, 100);
      }, 2000);
    } else {
      io.emit('show_choices', { choices: scene.choices, duration });
      io.emit('announcement', { text: scene.announcement });
      setTimeout(() => {
        showState.votingOpen = true;
        showState.showPhase = 'voting';
        io.emit('voting_open', { scene, duration });
        io.emit('show_state', showState.getState());
      }, 100);
    }
    
    const timer = setTimeout(() => {
      showState.votingOpen = false;
      const winner = showState.getWinner();
      const voteCounts = showState.getVoteCounts();
      const totalVotes = showState.getTotalVotes();
      io.emit('voting_closed');
      io.emit('winner_announced', { winner, voteCounts, totalVotes, sceneId: scene.id, wasTie: showState.sceneHistory[showState.sceneHistory.length-1]?.wasTie||false, wasFallback: showState.sceneHistory[showState.sceneHistory.length-1]?.wasFallback||false });
      setTimeout(() => {
        io.emit('winner_selected', { winner });
        showState.showPhase = 'transitioning';
        if (winner && winner.video) {
          setTimeout(() => { playVideo(winner.video); }, 1600);
        } else { setTimeout(() => handleVideoEnded(), 2000); }
      }, 2000);
    }, duration * 1000);
    showState.autoTimers.push(timer);
  }

  function startAccumulativeScene(scene) {
    showState.initBattleVotes();
    showState.showPhase = 'voting';
    showState.accumulativeVotingOpen = true;
    io.emit('announcement', { text: scene.announcement });
    io.emit('battle_started', { battles: scene.battles, currentBattleIndex: 0, battleVotes: showState.battleVotes });
    io.emit('show_state', showState.getState());
  }

  function startTimerScene(scene) {
    showState.startShadowGame('hiding');
    showState.showPhase = 'voting';
    io.emit('announcement', { text: scene.announcement });
    io.emit('shadow_game_started', { totalDuration: scene.totalDuration, hideTime: scene.hideTime, searchTime: scene.searchTime });
    io.emit('show_state', showState.getState());
  }

  function startCategoryVoteScene(scene) {
    showState.resetVotes();
    showState.votingOpen = false;
    showState.categoryVotes = {};
    showState.categoryVotes[scene.id] = {};
    scene.categories.forEach(cat => { showState.categoryVotes[scene.id][cat.id] = 0; });
    const duration = scene.votingDuration || 20;
    io.emit('announcement', { text: scene.announcement });
    io.emit('category_vote_started', { categories: scene.categories, duration });
    setTimeout(() => {
      showState.votingOpen = true;
      showState.showPhase = 'voting';
      io.emit('voting_open', { scene, duration, votingType: 'category' });
      io.emit('show_state', showState.getState());
    }, 100);
    const timer = setTimeout(() => {
      showState.votingOpen = false;
      const result = showState.getCategoryWinner();
      const voteCounts = showState.getCategoryVoteCounts();
      const totalVotes = showState.getTotalCategoryVotes();
      io.emit('voting_closed');
      io.emit('category_winner_announced', { category: result.category, isTie: result.isTie, wasFallback: result.wasFallback, voteCounts, totalVotes, sceneId: scene.id });
      const rescued = showState.rescueByCategory(result.category.id);
      io.emit('players_rescued', { players: rescued, category: result.category });
      setTimeout(() => { const killed = showState.killAllDetained(); io.emit('players_killed', { count: killed, prize: showState.prize }); io.emit('show_state', showState.getState()); setTimeout(() => handleVideoEnded(), 2000); }, 3000);
    }, duration * 1000);
    showState.autoTimers.push(timer);
  }

  showState.onVideoEnded = handleVideoEnded;

  // ===== ROUTES =====
  router.get('/', (req, res) => { res.sendFile('index.html', { root: path.join(__dirname, '..', '..', 'admin') }); });
  router.get('/state', (req, res) => { res.json(showState.getState()); });

  router.post('/reset-show', (req, res) => {
    showState.clearAutoTimers();
    showState.showStarted = false; showState.currentSceneIndex = -1; showState.votingOpen = false;
    showState.showPhase = 'idle'; showState.sceneHistory = []; showState.chosenPath = null;
    showState.players = showState.initPlayers(); showState.safeCount = 0; showState.detainedCount = 0;
    showState.killedCount = 0; showState.prize = 0; showState.resetVotes();
    showState.categoryVotes = {}; showState.battleVotes = {}; showState.accumulativeVotingOpen = false;
    showState.tieBreakerActive = false; showState.tieBreakerRound = 0; showState.shadowGamePhase = 'idle';
    io.emit('show_state', showState.getState()); io.emit('show_reset');
    res.json({ success: true, state: showState.getState() });
  });

  router.post('/start-show', (req, res) => {
    showState.clearAutoTimers();
    showState.showStarted = true; showState.currentSceneIndex = 0; showState.sceneHistory = [];
    showState.votingOpen = false; showState.resetVotes(); showState.showPhase = 'starting';
    const scene = showState.getCurrentScene();
    io.emit('show_state', showState.getState());
    setTimeout(() => startScene(scene), 500);
    res.json({ success: true, scene, state: showState.getState() });
  });

  router.post('/next-scene', (req, res) => {
    showState.clearAutoTimers();
    if (!showState.getNextScene()) { showState.showPhase = 'ended'; io.emit('show_ended'); io.emit('show_state', showState.getState()); return res.json({ success: true, state: showState.getState() }); }
    showState.advanceScene(); startScene(showState.getCurrentScene());
    res.json({ success: true, state: showState.getState() });
  });

  router.post('/previous-scene', (req, res) => {
    showState.clearAutoTimers(); freezeVideo();
    if (!showState.previousScene()) return res.json({ success: false, error: 'Already at first scene', state: showState.getState() });
    setTimeout(() => startScene(showState.getCurrentScene()), 800);
    res.json({ success: true, state: showState.getState() });
  });

  router.post('/skip-video', (req, res) => { showState.clearAutoTimers(); freezeVideo(); setTimeout(() => handleVideoEnded(), 800); res.json({ success: true, state: showState.getState() }); });
  router.post('/pause-video', (req, res) => { freezeVideo(); res.json({ success: true, state: showState.getState() }); });
  router.post('/resume-video', (req, res) => { resumeVideo(); res.json({ success: true, state: showState.getState() }); });

  router.post('/open-voting', (req, res) => {
    showState.clearAutoTimers();
    const scene = showState.getCurrentScene();
    if (!scene) return res.json({ success: false });
    if (scene.type === 'branching') { showState.votingOpen = true; showState.showPhase = 'voting'; showState.resetCurrentSceneVotes(); const d = scene.votingDuration||15; io.emit('show_choices', { choices: scene.choices, duration: d }); io.emit('voting_open', { scene, duration: d }); }
    else if (scene.type === 'category_vote') startCategoryVoteScene(scene);
    io.emit('show_state', showState.getState());
    res.json({ success: true, state: showState.getState() });
  });

  router.post('/close-voting', (req, res) => { showState.clearAutoTimers(); showState.votingOpen = false; showState.accumulativeVotingOpen = false; io.emit('voting_closed'); io.emit('show_state', showState.getState()); res.json({ success: true, state: showState.getState() }); });

  router.post('/trigger-winner', (req, res) => {
    showState.clearAutoTimers(); showState.votingOpen = false;
    const winner = showState.getWinner();
    if (!winner) return res.status(400).json({ success: false, error: 'No winner' });
    io.emit('voting_closed');
    io.emit('winner_announced', { winner, voteCounts: showState.getVoteCounts(), totalVotes: showState.getTotalVotes(), sceneId: showState.getCurrentScene()?.id });
    setTimeout(() => { io.emit('winner_selected', { winner }); showState.showPhase = 'transitioning'; if (winner.video) { setTimeout(() => { playVideo(winner.video); },1600); } else { setTimeout(()=>handleVideoEnded(),2000); } },2000);
    res.json({ success: true, winner, state: showState.getState() });
  });

  router.post('/manual-override/:choiceId', (req, res) => {
    showState.clearAutoTimers(); showState.votingOpen = false;
    const choiceId = req.params.choiceId;
    const scene = showState.getCurrentScene();
    if (!scene) return res.status(400).json({ success: false, error: 'No current scene' });
    const choice = scene.choices ? scene.choices.find(c => c.id === choiceId) : null;
    if (!choice) return res.status(400).json({ success: false, error: 'Invalid choice' });
    showState.sceneHistory.push({ scene: scene.id, title: scene.title, winner: choice, votes: 'manual_override', timestamp: new Date().toISOString() });
    if (scene.id === 'scene_1') showState.chosenPath = choice.id;
    io.emit('voting_closed');
    io.emit('winner_announced', { winner: choice, voteCounts: {}, totalVotes: 0, sceneId: scene.id, manual: true });
    setTimeout(() => { io.emit('winner_selected', { winner: choice }); showState.showPhase = 'transitioning'; if (choice.video) { setTimeout(()=>{playVideo(choice.video);},1600); } else { setTimeout(()=>handleVideoEnded(),2000); } },2000);
    res.json({ success: true, choice, state: showState.getState() });
  });

  // ===== BATTLE ROUTES =====
  router.post('/start-battles', (req, res) => { showState.initBattleVotes(); showState.accumulativeVotingOpen = true; showState.showPhase = 'voting'; const s = showState.getCurrentScene(); io.emit('battle_started', { battles: s.battles, currentBattleIndex: 0, battleVotes: showState.battleVotes }); io.emit('show_state', showState.getState()); res.json({ success: true, state: showState.getState() }); });

  router.post('/resolve-battle', (req, res) => { const { battleId, playerAId, playerBId } = req.body; const result = showState.resolveBattle(battleId, playerAId, playerBId); if (!result) return res.status(400).json({ success: false }); io.emit('battle_resolved', result); io.emit('show_state', showState.getState()); res.json({ success: true, result, state: showState.getState() }); });

  router.post('/next-battle', (req, res) => { showState.currentBattleIndex++; const s = showState.getCurrentScene(); if (s && s.battles && showState.currentBattleIndex < s.battles.length) { io.emit('battle_next', { currentBattleIndex: showState.currentBattleIndex }); } else { io.emit('battles_finished'); } io.emit('show_state', showState.getState()); res.json({ success: true, state: showState.getState() }); });

  // ===== PLAYER MANAGEMENT =====
  router.post('/emergency-override/:playerId', (req, res) => {
    const { playerId } = req.params; const { status } = req.body;
    if (!['safe','detained','killed'].includes(status)) return res.status(400).json({ success: false, error: 'Invalid status' });
    if (!showState.setPlayerStatus(playerId, status)) return res.status(400).json({ success: false, error: 'Player not found' });
    io.emit('player_status_changed', { playerId, status, players: showState.players, prize: showState.prize });
    io.emit('show_state', showState.getState());
    res.json({ success: true, state: showState.getState() });
  });

  router.post('/kill-all-detained', (req, res) => { const killed = showState.killAllDetained(); io.emit('players_killed', { count: killed, prize: showState.prize }); io.emit('show_state', showState.getState()); res.json({ success: true, killed, state: showState.getState() }); });

  // ===== TIE-BREAKER =====
  router.post('/start-tie-breaker', (req, res) => { showState.startTieBreaker(); io.emit('tie_breaker_started', { round: showState.tieBreakerRound }); io.emit('voting_open', { scene: showState.getCurrentScene(), duration: 15 }); io.emit('show_state', showState.getState()); res.json({ success: true, state: showState.getState() }); });
  router.post('/resolve-tie-breaker', (req, res) => { const result = showState.resolveTieBreaker(); if (!result) return res.status(400).json({ success: false }); io.emit('tie_breaker_resolved', result); io.emit('show_state', showState.getState()); res.json({ success: true, result, state: showState.getState() }); });

  // ===== SHADOW GAME =====
  router.post('/shadow-game-phase', (req, res) => { const { phase } = req.body; showState.startShadowGame(phase); io.emit('shadow_game_phase', { phase }); io.emit('show_state', showState.getState()); res.json({ success: true, state: showState.getState() }); });

  // ===== DIAGNOSTICS =====
  router.get('/diagnostics', (req, res) => {
    const results = { server: { status: 'ok' }, videos: [], website: { url: '/public/' }, stage: { url: '/stage' }, socketio: { connections: showState.connections } };
    const videosDir = path.join(__dirname, '..', '..', 'assets', 'videos');
    showState.config.scenes.forEach(scene => {
      if (scene.video) { const e = fs.existsSync(path.join(videosDir, scene.video)); results.videos.push({ scene: scene.title, filename: scene.video, status: e?'ok':'missing' }); }
      if (scene.choices) scene.choices.forEach(c => { if(c.video){const e=fs.existsSync(path.join(videosDir,c.video));results.videos.push({scene:scene.title,label:c.label,filename:c.video,status:e?'ok':'missing'});} });
    });
    res.json(results);
  });

  router.post('/upload-video', upload.single('video'), (req, res) => { if (!req.file) return res.status(400).json({ success: false }); res.json({ success: true, filename: req.file.filename, size: req.file.size }); });
  router.delete('/delete-video/:filename', (req, res) => { const p = path.join(__dirname, '..', '..', 'assets', 'videos', req.params.filename); if (fs.existsSync(p)) { fs.unlinkSync(p); res.json({ success: true }); } else { res.status(404).json({ success: false }); } });

  return router;
};
