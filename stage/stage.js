const isInIframe = window !== window.parent;
const socket = io({ reconnection: true });

if (!isInIframe) {
  socket.on('connect', () => { socket.emit('register', 'stage'); });
}

const screens = {};
['idle-screen','video-screen','choices-screen','battle-screen','shadow-screen','category-screen','ended-screen'].forEach(id => {
  screens[id.replace('-screen','')] = document.getElementById(id);
});
const video = document.getElementById('stage-video');
const videoOverlay = document.getElementById('video-overlay');
const timerRing = document.getElementById('stage-timer-ring');
const timerText = document.getElementById('stage-timer-text');
const voteCountTotal = document.getElementById('vote-count-total');
const statusPrize = document.getElementById('status-prize');
const statusSafe = document.getElementById('status-safe');
const statusDetained = document.getElementById('status-detained');
const statusKilled = document.getElementById('status-killed');

function getActiveHeader() {
  const activeScreen = document.querySelector('.screen.active');
  if (activeScreen) return activeScreen.querySelector('.choices-header');
  return document.querySelector('.choices-header');
}

const CIRCUMFERENCE = 2 * Math.PI * 44;
let currentScreen = 'idle';
let timerInterval = null;
let videoPlaying = false;
let audioUnlocked = false;

window.addEventListener('click', () => {
  if (!audioUnlocked) audioUnlocked = true;
  if (video.src && video.paused && currentScreen === 'video') video.play().catch(()=>{});
});

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = screens[name] || document.getElementById(name + '-screen');
  if (el) el.classList.add('active');
  currentScreen = name;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function playVideo(path) {
  return new Promise((resolve) => {
    showScreen('video');
    video.pause(); video.removeAttribute('src'); video.load();
    videoOverlay.classList.remove('fade-in','fade-out'); videoOverlay.classList.add('fade-in');
    video.src = path; video.currentTime = 0;
    let resolved = false;
    const finish = () => { if (!resolved) { resolved = true; videoPlaying = false; if (!isInIframe) socket.emit('stage_video_ended'); resolve(); } };
    video.onended = finish;
    video.onerror = () => { if (!resolved) setTimeout(finish, 2000); };
    const attemptPlay = () => { video.play().then(()=>{ videoPlaying=true; videoOverlay.classList.remove('fade-in'); videoOverlay.classList.add('fade-out'); }).catch(()=>{ videoPlaying=false; }); };
    if (video.readyState >= 3) attemptPlay();
    else video.addEventListener('canplay', () => { attemptPlay(); }, { once: true });
  });
}

async function fadeToBlack() { videoOverlay.classList.remove('fade-out'); videoOverlay.classList.add('fade-in'); await sleep(600); }

function startTimer(duration) {
  return new Promise(resolve => {
    let remaining = duration;
    timerText.textContent = remaining; timerRing.style.strokeDashoffset = '0'; timerRing.style.stroke = '#FFD700';
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      remaining--; timerText.textContent = Math.max(0, remaining);
      timerRing.style.strokeDashoffset = (CIRCUMFERENCE * (1 - remaining / duration)).toString();
      if (remaining <= 10) timerRing.style.stroke = '#FF9800';
      if (remaining <= 5) timerRing.style.stroke = '#f44336';
      if (remaining <= 0) { clearInterval(timerInterval); timerInterval = null; resolve(); }
    }, 1000);
  });
}

function updateStatus(state) {
  if (statusPrize) statusPrize.textContent = '$' + (state.prize || 0).toLocaleString();
  if (statusSafe) statusSafe.textContent = state.safeCount || 0;
  if (statusDetained) statusDetained.textContent = state.detainedCount || 0;
  if (statusKilled) statusKilled.textContent = state.killedCount || 0;
}

// Dynamic choices - any number
async function showChoices(choices, duration) {
  showScreen('choices');
  const container = document.getElementById('choices-dynamic');
  container.innerHTML = '';
  choices.forEach((c, i) => {
    const box = document.createElement('div');
    box.className = 'choice-box';
    box.id = 'choice-' + c.id;
    box.style.borderColor = c.color;
    box.style.boxShadow = `0 0 30px ${c.color}33`;
    box.innerHTML = `<div class="choice-inner"><div class="choice-label">${c.label}</div><div class="choice-votes" id="votes-${c.id}">0</div><div class="choice-bar"><div class="choice-bar-fill" id="bar-${c.id}" style="background:${c.color}"></div></div></div>`;
    container.appendChild(box);
  });
  if (choices.length > 2) container.classList.add('multi-choice');
  else container.classList.remove('multi-choice');
  voteCountTotal.textContent = '0 voters';
  getActiveHeader().classList.add('visible');
  return startTimer(duration);
}

function updateVotesDynamic(votes, totalVotes) {
  const total = totalVotes || 1;
  Object.keys(votes).forEach(id => {
    const v = typeof votes[id] === 'number' ? votes[id] : (votes[id]?.count || 0);
    const votesEl = document.getElementById('votes-' + id);
    const barEl = document.getElementById('bar-' + id);
    if (votesEl) votesEl.textContent = v;
    if (barEl) barEl.style.width = Math.round((v / total) * 100) + '%';
  });
  voteCountTotal.textContent = totalVotes + ' voters';
}

// Battle view
async function showBattle(battles, index) {
  showScreen('battle');
  const battle = battles[index];
  const info = document.getElementById('battle-info');
  if (info) info.textContent = `Battle ${index+1}/${battles.length} - ${battle.type.toUpperCase()} - ${battle.label}`;
  const votesA = document.getElementById('battle-votes-yes');
  const votesB = document.getElementById('battle-votes-no');
  if (votesA) votesA.textContent = '0';
  if (votesB) votesB.textContent = '0';
  getActiveHeader().classList.add('visible');
}

function updateBattleVotes(votes) {
  const vYes = document.getElementById('battle-votes-yes');
  const vNo = document.getElementById('battle-votes-no');
  if (vYes) vYes.textContent = votes.yes || 0;
  if (vNo) vNo.textContent = votes.no || 0;
  const total = (votes.yes||0) + (votes.no||0);
  voteCountTotal.textContent = total + ' voters';
}

// Shadow game view
function showShadowGame(data) {
  showScreen('shadow');
  const totalEl = document.getElementById('shadow-total-timer');
  const phaseEl = document.getElementById('shadow-phase');
  const shadowRing = document.getElementById('shadow-timer-ring');
  if (phaseEl) phaseEl.textContent = 'HIDING PHASE - 30 seconds to hide!';
  if (totalEl) {
    if (timerInterval) clearInterval(timerInterval);
    let remaining = data.totalDuration;
    totalEl.textContent = formatTime(remaining);
    if (shadowRing) { shadowRing.style.strokeDashoffset = '0'; shadowRing.style.stroke = '#8B5CF6'; }
    timerInterval = setInterval(() => {
      remaining--;
      totalEl.textContent = formatTime(remaining);
      if (shadowRing) {
        shadowRing.style.strokeDashoffset = (CIRCUMFERENCE * (1 - remaining / data.totalDuration)).toString();
        if (remaining <= data.searchTime && phaseEl) phaseEl.textContent = 'SEARCHING - Guards are looking!';
        if (remaining <= 60) shadowRing.style.stroke = '#FF9800';
        if (remaining <= 30) shadowRing.style.stroke = '#f44336';
      }
      if (remaining <= 0) { clearInterval(timerInterval); timerInterval = null; }
    }, 1000);
  }
}

function formatTime(s) { const m = Math.floor(s/60); const sec = s%60; return `${m}:${String(sec).padStart(2,'0')}`; }

// Category voting view
async function showCategoryVote(categories, duration) {
  showScreen('category');
  const container = document.getElementById('category-options');
  const catVoteCount = document.getElementById('cat-vote-count-total');
  container.innerHTML = '';
  categories.forEach(c => {
    const box = document.createElement('div');
    box.className = 'choice-box';
    box.id = 'cat-' + c.id;
    box.style.borderColor = c.color;
    box.style.boxShadow = `0 0 30px ${c.color}33`;
    box.innerHTML = `<div class="choice-inner"><div class="choice-label">${c.label}</div><div class="choice-sublabel">${c.rescueCount} players rescued</div><div class="choice-votes" id="cat-votes-${c.id}">0</div><div class="choice-bar"><div class="choice-bar-fill" id="cat-bar-${c.id}" style="background:${c.color}"></div></div></div>`;
    container.appendChild(box);
  });

  const catRing = document.getElementById('cat-timer-ring');
  const catText = document.getElementById('cat-timer-text');
  if (catText) catText.textContent = duration;
  if (catRing) { catRing.style.strokeDashoffset = '0'; catRing.style.stroke = '#FFD700'; }
  if (catVoteCount) catVoteCount.textContent = '0 voters';

  getActiveHeader().classList.add('visible');

  return new Promise(resolve => {
    let remaining = duration;
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      remaining--;
      if (catText) catText.textContent = Math.max(0, remaining);
      if (catRing) {
        catRing.style.strokeDashoffset = (CIRCUMFERENCE * (1 - remaining / duration)).toString();
        if (remaining <= 5) catRing.style.stroke = '#f44336';
        else if (remaining <= 10) catRing.style.stroke = '#FF9800';
      }
      if (remaining <= 0) { clearInterval(timerInterval); timerInterval = null; resolve(); }
    }, 1000);
  });
}

function updateCategoryVotes(votes, totalVotes) {
  const total = totalVotes || 1;
  Object.keys(votes).forEach(id => {
    const v = typeof votes[id] === 'number' ? votes[id] : (votes[id]?.count || 0);
    const votesEl = document.getElementById('cat-votes-' + id);
    const barEl = document.getElementById('cat-bar-' + id);
    if (votesEl) votesEl.textContent = v;
    if (barEl) barEl.style.width = Math.round((v / total) * 100) + '%';
  });
  const catVoteCount = document.getElementById('cat-vote-count-total');
  if (catVoteCount) catVoteCount.textContent = totalVotes + ' voters';
}

// ===== Socket Events =====
socket.on('connect', () => console.log('[Stage] Connected'));
socket.on('connection_counts', (c) => {
  const el1 = document.getElementById('stage-audience-count');
  const el2 = document.getElementById('stage-audience-count-choices');
  if (el1) el1.textContent = c.voters || 0;
  if (el2) el2.textContent = c.voters || 0;
});

socket.on('show_state', (state) => { updateStatus(state); });

socket.on('play_video', (data) => {
  if (!data.video) return;
  playVideo('/assets/videos/' + data.video);
});

socket.on('play_image', (data) => {
  if (!data.image) return;
  showScreen('video');
  video.src = '/assets/images/' + data.image;
  video.style.display = 'block';
  videoOverlay.classList.remove('fade-in','fade-out');
  videoOverlay.classList.add('fade-out');
  videoPlaying = false;
});

socket.on('freeze', () => { if (videoPlaying) { video.pause(); videoPlaying = false; } });
socket.on('resume', () => { if (!videoPlaying && video.src) video.play().catch(()=>{}); });

socket.on('show_choices', async (data) => {
  if (videoPlaying) { video.pause(); videoPlaying = false; }
  await fadeToBlack();
  await showChoices(data.choices, data.duration);
});

socket.on('vote_update', (data) => { updateVotesDynamic(data.votes, data.totalVotes); });

socket.on('winner_selected', async () => {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  getActiveHeader().classList.remove('visible');
  await sleep(1500);
});

socket.on('battle_started', async (data) => {
  if (videoPlaying) { video.pause(); videoPlaying = false; }
  await fadeToBlack();
  await showBattle(data.battles, data.currentBattleIndex);
});

socket.on('battle_next', (data) => { showBattle([], data.currentBattleIndex); });
socket.on('battle_resolved', async () => { await sleep(2000); });
socket.on('accumulative_vote_update', (data) => { updateBattleVotes(data.votes); });
socket.on('battles_finished', () => { getActiveHeader().classList.remove('visible'); });

socket.on('shadow_game_started', (data) => { showShadowGame(data); });

socket.on('category_vote_started', async (data) => {
  if (videoPlaying) { video.pause(); videoPlaying = false; }
  await fadeToBlack();
  await showCategoryVote(data.categories, data.duration);
});

socket.on('category_vote_update', (data) => { updateCategoryVotes(data.votes, data.totalVotes); });

socket.on('show_ended', () => { showScreen('ended'); });

socket.on('show_reset', () => {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  video.pause(); video.src = ''; videoPlaying = false;
  videoOverlay.classList.remove('fade-in','fade-out');
  getActiveHeader().classList.remove('visible');
  showScreen('idle');
});
