const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, 'config', 'show.json');

class ShowState {
  constructor() {
    this.config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    this.currentSceneIndex = -1;
    this.votingOpen = false;
    this.votes = {};
    this.connections = { voters: 0, admins: 0, stages: 0 };
    this.showStarted = false;
    this.sceneHistory = [];
    this.showPhase = 'idle';
    this.autoTimers = [];
    this.videoPaused = false;

    // Player tracking
    this.players = this.initPlayers();
    this.safeCount = 0;
    this.detainedCount = 0;
    this.killedCount = 0;
    this.prize = 0;
    this.prizePerKill = this.config.prizePerKill || 1000;

    // Chosen path from scene 1
    this.chosenPath = null;

    // Accumulative voting state
    this.currentBattleIndex = 0;
    this.battleVotes = {};
    this.accumulativeVotingOpen = false;

    // Tie-breaker state
    this.tieBreakerActive = false;
    this.tieBreakerRound = 0;

    // Category voting state
    this.categoryVotes = {};

    // Shadow game state
    this.shadowGamePhase = 'idle';
    this.shadowGameTimer = 0;

    this.resetVotes();
  }

  // ===== PLAYER MANAGEMENT =====

  initPlayers() {
    const total = this.config.totalPlayers || 30;
    const players = [];
    for (let i = 1; i <= total; i++) {
      players.push({
        id: String(i).padStart(3, '0'),
        name: `Player ${String(i).padStart(3, '0')}`,
        status: 'active',
        score: 0
      });
    }
    return players;
  }

  getPlayer(id) {
    return this.players.find(p => p.id === id);
  }

  getPlayersByStatus(status) {
    return this.players.filter(p => p.status === status);
  }

  setPlayerStatus(id, status) {
    const player = this.getPlayer(id);
    if (!player) return false;
    const oldStatus = player.status;
    player.status = status;

    if (oldStatus !== status) {
      if (oldStatus === 'active') {
        if (status === 'safe') this.safeCount++;
        else if (status === 'detained') this.detainedCount++;
        else if (status === 'killed') { this.killedCount++; this.prize += this.prizePerKill; }
      } else if (oldStatus === 'safe') {
        this.safeCount--;
        if (status === 'detained') this.detainedCount++;
        else if (status === 'killed') { this.killedCount++; this.prize += this.prizePerKill; }
      } else if (oldStatus === 'detained') {
        this.detainedCount--;
        if (status === 'safe') this.safeCount++;
        else if (status === 'killed') { this.killedCount++; this.prize += this.prizePerKill; }
      }
    }
    return true;
  }

  killAllDetained() {
    const detained = this.getPlayersByStatus('detained');
    detained.forEach(p => {
      p.status = 'killed';
      this.detainedCount--;
      this.killedCount++;
      this.prize += this.prizePerKill;
    });
    return detained.length;
  }

  rescueByCategory(categoryId) {
    const scene = this.getCurrentScene();
    if (!scene || !scene.categories) return [];

    const category = scene.categories.find(c => c.id === categoryId);
    if (!category) return [];

    const activePlayers = this.getPlayersByStatus('active');
    const sorted = activePlayers.sort((a, b) => b.score - a.score);
    const toRescue = sorted.slice(0, category.rescueCount);

    toRescue.forEach(p => {
      p.status = 'safe';
      this.safeCount++;
    });

    return toRescue;
  }

  // ===== VOTE INITIALIZATION =====

  resetVotes() {
    this.votes = {};
    this.config.scenes.forEach(scene => {
      if (scene.choices) {
        this.votes[scene.id] = {};
        scene.choices.forEach(choice => {
          this.votes[scene.id][choice.id] = 0;
        });
      }
      if (scene.categories) {
        this.votes[scene.id] = {};
        scene.categories.forEach(cat => {
          this.votes[scene.id][cat.id] = 0;
        });
      }
    });
  }

  resetCurrentSceneVotes() {
    const scene = this.getCurrentScene();
    if (!scene) return;
    if (scene.choices) {
      this.votes[scene.id] = {};
      scene.choices.forEach(choice => { this.votes[scene.id][choice.id] = 0; });
    }
    if (scene.categories) {
      this.votes[scene.id] = {};
      scene.categories.forEach(cat => { this.votes[scene.id][cat.id] = 0; });
    }
  }

  clearAutoTimers() {
    this.autoTimers.forEach(t => clearTimeout(t));
    this.autoTimers = [];
  }

  // ===== SCENE MANAGEMENT =====

  getCurrentScene() {
    if (this.currentSceneIndex < 0 || this.currentSceneIndex >= this.config.scenes.length) return null;
    return this.config.scenes[this.currentSceneIndex];
  }

  getNextScene() {
    const nextIdx = this.currentSceneIndex + 1;
    if (nextIdx < this.config.scenes.length) return this.config.scenes[nextIdx];
    return null;
  }

  advanceScene() {
    if (this.currentSceneIndex < this.config.scenes.length - 1) {
      this.currentSceneIndex++;
      this.votingOpen = false;
      this.accumulativeVotingOpen = false;
      this.tieBreakerActive = false;
      this.tieBreakerRound = 0;
      return this.getCurrentScene();
    }
    return null;
  }

  previousScene() {
    if (this.currentSceneIndex > 0) {
      this.currentSceneIndex--;
      this.votingOpen = false;
      return this.getCurrentScene();
    }
    return null;
  }

  // ===== ACCUMULATIVE VOTING (Dance Battle) =====

  initBattleVotes() {
    const scene = this.getCurrentScene();
    if (!scene || !scene.battles) return;
    this.battleVotes = {};
    scene.battles.forEach(battle => {
      this.battleVotes[battle.id] = { yes: 0, no: 0 };
    });
    this.currentBattleIndex = 0;
  }

  castAccumulativeVote(battleId, voteType) {
    if (!this.accumulativeVotingOpen) return false;
    if (!this.battleVotes[battleId]) return false;
    if (voteType !== 'yes' && voteType !== 'no') return false;
    this.battleVotes[battleId][voteType]++;
    return true;
  }

  getBattleWinner(battleId) {
    const votes = this.battleVotes[battleId];
    if (!votes) return null;
    const total = votes.yes + votes.no;
    if (total === 0) return { winner: 'yes', isTie: false, wasRandom: true };
    if (votes.yes > votes.no) return { winner: 'yes', isTie: false, wasRandom: false };
    if (votes.no > votes.yes) return { winner: 'no', isTie: false, wasRandom: false };
    const random = Math.random() < 0.5 ? 'yes' : 'no';
    return { winner: random, isTie: true, wasRandom: true };
  }

  resolveBattle(battleId, playerAId, playerBId) {
    const result = this.getBattleWinner(battleId);
    if (!result) return null;
    let winnerId, loserId;
    if (result.winner === 'yes') { winnerId = playerAId; loserId = playerBId; }
    else { winnerId = playerBId; loserId = playerAId; }
    this.setPlayerStatus(winnerId, 'safe');
    this.setPlayerStatus(loserId, 'detained');
    return { battleId, winnerId, loserId, votes: { ...this.battleVotes[battleId] }, isTie: result.isTie, wasRandom: result.wasRandom };
  }

  // ===== TIE-BREAKER =====

  startTieBreaker() {
    this.tieBreakerActive = true;
    this.tieBreakerRound++;
    this.resetCurrentSceneVotes();
    this.votingOpen = true;
  }

  resolveTieBreaker() {
    const scene = this.getCurrentScene();
    if (!scene || !scene.choices) return null;
    const sceneVotes = this.votes[scene.id];
    let maxVotes = 0;
    let winner = null;
    let isTie = false;

    Object.keys(sceneVotes).forEach(choiceId => {
      if (sceneVotes[choiceId] > maxVotes) {
        maxVotes = sceneVotes[choiceId];
        winner = scene.choices.find(c => c.id === choiceId);
        isTie = false;
      } else if (sceneVotes[choiceId] === maxVotes && maxVotes > 0) {
        isTie = true;
      }
    });

    if (isTie || !winner || maxVotes === 0) {
      if (this.tieBreakerRound >= 2) {
        const randomIndex = Math.floor(Math.random() * scene.choices.length);
        winner = scene.choices[randomIndex];
        this.tieBreakerActive = false;
        return { winner, isTie: true, wasRandom: true, tieBreakerRound: this.tieBreakerRound };
      }
      return { winner: null, isTie: true, wasRandom: false, tieBreakerRound: this.tieBreakerRound };
    }

    this.tieBreakerActive = false;
    return { winner, isTie: false, wasRandom: false, tieBreakerRound: this.tieBreakerRound };
  }

  // ===== CATEGORY VOTING (Second Chance) =====

  castCategoryVote(categoryId) {
    if (!this.votingOpen) return false;
    const scene = this.getCurrentScene();
    if (!scene || !scene.categories) return false;
    const cat = scene.categories.find(c => c.id === categoryId);
    if (!cat) return false;
    if (!this.categoryVotes) this.categoryVotes = {};
    if (!this.categoryVotes[scene.id]) this.categoryVotes[scene.id] = {};
    this.categoryVotes[scene.id][categoryId] = (this.categoryVotes[scene.id][categoryId] || 0) + 1;
    return true;
  }

  getCategoryVoteCounts() {
    const scene = this.getCurrentScene();
    if (!scene || !scene.categories) return {};
    if (!this.categoryVotes || !this.categoryVotes[scene.id]) return {};
    const result = {};
    scene.categories.forEach(cat => {
      result[cat.id] = {
        label: cat.label,
        labelEn: cat.labelEn,
        color: cat.color,
        count: this.categoryVotes[scene.id][cat.id] || 0
      };
    });
    return result;
  }

  getTotalCategoryVotes() {
    const scene = this.getCurrentScene();
    if (!scene || !scene.categories) return 0;
    if (!this.categoryVotes || !this.categoryVotes[scene.id]) return 0;
    return Object.values(this.categoryVotes[scene.id]).reduce((sum, c) => sum + c, 0);
  }

  getCategoryWinner() {
    const scene = this.getCurrentScene();
    if (!scene || !scene.categories) return null;
    const votes = this.categoryVotes[scene.id] || {};
    let maxVotes = 0;
    let winnerCat = null;
    let isTie = false;

    Object.keys(votes).forEach(catId => {
      if (votes[catId] > maxVotes) {
        maxVotes = votes[catId];
        winnerCat = scene.categories.find(c => c.id === catId);
        isTie = false;
      } else if (votes[catId] === maxVotes && maxVotes > 0) {
        isTie = true;
      }
    });

    if (!winnerCat || isTie || maxVotes === 0) {
      winnerCat = scene.categories.find(c => c.id === scene.fallbackCategory) || scene.categories[0];
      return { category: winnerCat, isTie, wasFallback: true };
    }
    return { category: winnerCat, isTie: false, wasFallback: false };
  }

  // ===== SHADOW GAME =====

  startShadowGame(phase) {
    this.shadowGamePhase = phase;
  }

  endShadowGame() {
    this.shadowGamePhase = 'ended';
  }

  // ===== STANDARD VOTING =====

  castVote(choiceId) {
    if (!this.votingOpen) return false;
    const scene = this.getCurrentScene();
    if (!scene || !scene.choices) return false;
    const choice = scene.choices.find(c => c.id === choiceId);
    if (!choice) return false;
    this.votes[scene.id][choiceId]++;
    return true;
  }

  getWinner() {
    const scene = this.getCurrentScene();
    if (!scene || !scene.choices) return null;
    const sceneVotes = this.votes[scene.id];
    let maxVotes = 0;
    let winner = null;
    let isTie = false;

    Object.keys(sceneVotes).forEach(choiceId => {
      if (sceneVotes[choiceId] > maxVotes) {
        maxVotes = sceneVotes[choiceId];
        winner = scene.choices.find(c => c.id === choiceId);
        isTie = false;
      } else if (sceneVotes[choiceId] === maxVotes && maxVotes > 0) {
        isTie = true;
      }
    });

    const totalVotes = this.getTotalVotes();
    if (!winner || isTie || totalVotes === 0) {
      const randomIndex = Math.floor(Math.random() * scene.choices.length);
      winner = scene.choices[randomIndex];
    }

    this.sceneHistory.push({
      scene: scene.id,
      title: scene.title,
      winner: winner,
      votes: { ...sceneVotes },
      totalVotes: totalVotes,
      wasTie: isTie,
      wasFallback: totalVotes === 0 || isTie,
      timestamp: new Date().toISOString()
    });

    if (scene.id === 'scene_1') {
      this.chosenPath = winner.id;
    }

    return winner;
  }

  // ===== VOTE COUNTS =====

  getVoteCounts() {
    const scene = this.getCurrentScene();
    if (!scene) return {};
    if (scene.categories) return this.getCategoryVoteCounts();
    if (!scene.choices) return {};
    const result = {};
    scene.choices.forEach(choice => {
      result[choice.id] = {
        label: choice.label,
        color: choice.color,
        count: this.votes[scene.id][choice.id]
      };
    });
    return result;
  }

  getTotalVotes() {
    const scene = this.getCurrentScene();
    if (!scene) return 0;
    if (scene.categories) return this.getTotalCategoryVotes();
    if (!scene.choices) return 0;
    return Object.values(this.votes[scene.id]).reduce((sum, count) => sum + count, 0);
  }

  // ===== PERSISTENCE =====

  saveConfig() {
    fs.writeFileSync(configPath, JSON.stringify(this.config, null, 2));
  }

  reloadConfig() {
    this.config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    this.resetVotes();
  }

  // ===== PROGRESS & STATE =====

  getProgress() {
    return {
      currentScene: this.currentSceneIndex + 1,
      totalScenes: this.config.scenes.length,
      percent: Math.round(((this.currentSceneIndex + 1) / this.config.scenes.length) * 100)
    };
  }

  getState() {
    return {
      showStarted: this.showStarted,
      votingOpen: this.votingOpen,
      showPhase: this.showPhase,
      currentScene: this.getCurrentScene(),
      nextScene: this.getNextScene(),
      voteCounts: this.getVoteCounts(),
      totalVotes: this.getTotalVotes(),
      progress: this.getProgress(),
      connections: this.connections,
      sceneHistory: this.sceneHistory,
      players: this.players,
      safeCount: this.safeCount,
      detainedCount: this.detainedCount,
      killedCount: this.killedCount,
      prize: this.prize,
      totalPlayers: this.players.length,
      chosenPath: this.chosenPath,
      currentBattleIndex: this.currentBattleIndex,
      battleVotes: this.battleVotes,
      accumulativeVotingOpen: this.accumulativeVotingOpen,
      tieBreakerActive: this.tieBreakerActive,
      tieBreakerRound: this.tieBreakerRound,
      shadowGamePhase: this.shadowGamePhase,
      shadowGameTimer: this.shadowGameTimer,
      config: {
        showName: this.config.showName,
        showSubtitle: this.config.showSubtitle,
        venue: this.config.venue,
        showDate: this.config.showDate,
        prizePerKill: this.config.prizePerKill,
        totalPlayers: this.config.totalPlayers
      }
    };
  }
}

module.exports = ShowState;
