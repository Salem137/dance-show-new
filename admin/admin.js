const socket = io({ pingInterval: 10000, pingTimeout: 5000 });
let showState = null;
let adminTimerInterval = null;
let shortcutsVisible = false;
let currentLang = localStorage.getItem('admin-lang') || 'en';
let translations = {};

// ===== LANGUAGE SUPPORT =====
async function loadTranslations() {
  try {
    const res = await fetch(`/admin/lang/${currentLang}.json`);
    translations = await res.json();
    document.getElementById('lang-toggle').textContent = currentLang.toUpperCase();
    document.documentElement.lang = currentLang;
    document.documentElement.dir = currentLang === 'ar' ? 'rtl' : 'ltr';
    applyTranslations();
    if (showState) updateUI();
  } catch (err) {
    console.error('Failed to load translations:', err);
  }
}

function toggleLanguage() {
  currentLang = currentLang === 'en' ? 'ar' : 'en';
  localStorage.setItem('admin-lang', currentLang);
  loadTranslations();
}

function t(key) {
  const keys = key.split('.');
  let value = translations;
  for (const k of keys) {
    value = value?.[k];
  }
  return value || key;
}

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const translation = t(key);
    if (translation) el.textContent = translation;
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    const translation = t(key);
    if (translation) el.placeholder = translation;
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    const translation = t(key);
    if (translation) el.title = translation;
  });
}

// ===== DISCONNECT ON TAB CLOSE =====
window.addEventListener('beforeunload', () => {
  socket.disconnect();
});

// ===== SOCKET EVENTS =====
socket.on('connect', () => {
  socket.emit('register', 'admin');
  console.log('Admin connected');
  updateConnectionStatus(true);
  loadState();
  loadTranslations();
});

socket.on('disconnect', () => {
  updateConnectionStatus(false);
  showToast(t('toast.connectionLost'), 'error');
});

socket.on('reconnect_attempt', (attempt) => {
  const connText = document.querySelector('.conn-text');
  if (connText) {
    connText.textContent = t('status.reconnecting') + ` (${attempt})`;
    connText.style.color = '#F59E0B';
  }
});

socket.on('reconnect', () => {
  showToast(t('toast.connected'), 'success');
  updateConnectionStatus(true);
  loadState();
});

socket.on('reconnect_error', () => {
  const connText = document.querySelector('.conn-text');
  if (connText) {
    connText.textContent = t('status.reconnectFailed');
    connText.style.color = '#EF4444';
  }
});

socket.on('show_state', (state) => {
  showState = state;
  updateUI();
});

socket.on('show_reset', () => {
  loadState();
  showToast(t('toast.showReset'), 'info');
});

socket.on('vote_update', (data) => {
  if (showState) {
    showState.voteCounts = data.votes;
    showState.totalVotes = data.totalVotes;
    updateUI();
  }
});

socket.on('accumulative_vote_update', (data) => {
  if (showState) {
    if (!showState.battleVotes) showState.battleVotes = {};
    showState.battleVotes[data.battleId] = data.votes;
    updateBattleStatus();
  }
});

socket.on('battle_started', (data) => {
  if (showState) {
    showState.accumulativeVotingOpen = true;
    showState.currentBattleIndex = data.currentBattleIndex;
    showState.battleVotes = data.battleVotes;
    updateUI();
    updateBattleStatus();
  }
});

socket.on('battle_resolved', (data) => {
  if (showState) {
    showState.currentBattleIndex = data.currentBattleIndex;
    showState.players = data.players || showState.players;
    updatePlayerList();
    updateBattleStatus();
  }
});

socket.on('battles_finished', () => {
  if (showState) {
    showState.accumulativeVotingOpen = false;
    updateBattleStatus();
  }
});

socket.on('player_status_changed', (data) => {
  if (showState) {
    showState.players = data.players;
    showState.prize = data.prize;
    updatePlayerList();
    updatePlayerStats();
  }
});

socket.on('players_killed', (data) => {
  if (showState) {
    showState.prize = data.prize;
    updatePlayerList();
    updatePlayerStats();
  }
});

socket.on('shadow_game_started', (data) => {
  updateShadowStatus('active');
});

socket.on('shadow_game_phase', (data) => {
  updateShadowStatus(data.phase);
});

socket.on('connection_counts', (connections) => {
  updateConnectionCounts(connections);
});

socket.on('winner_announced', (data) => {
  showToast(`${t('toast.winner')} ${data.winner?.label || t('toast.unknown')}`, 'success');
});

// ===== TOAST NOTIFICATIONS =====
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  const icons = { success: '✓', error: '✗', info: 'ℹ', warning: '⚠' };
  toast.innerHTML = `<span>${icons[type] || 'ℹ'}</span> ${message}`;
  
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'toastSlideOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ===== CONNECTION STATUS =====
function updateConnectionStatus(connected) {
  const indicator = document.getElementById('connection-indicator');
  if (connected) {
    indicator.classList.remove('disconnected');
    indicator.querySelector('.conn-text').textContent = t('status.connected');
  } else {
    indicator.classList.add('disconnected');
    indicator.querySelector('.conn-text').textContent = t('status.disconnected');
  }
}

// ===== CONNECTION COUNTS =====
function updateConnectionCounts(connections) {
  const voterEl = document.getElementById('voter-count');
  const adminEl = document.getElementById('admin-count');
  const stageEl = document.getElementById('stage-count');
  const adminWarning = document.getElementById('admin-warning');

  if (voterEl) voterEl.textContent = connections.voters || 0;
  if (adminEl) adminEl.textContent = connections.admins || 0;
  if (stageEl) stageEl.textContent = connections.stages || 0;

  if (adminWarning) {
    if (connections.admins > 1) {
      adminWarning.classList.remove('hidden');
    } else {
      adminWarning.classList.add('hidden');
    }
  }
}

// ===== CLOCK =====
function updateClock() {
  const now = new Date();
  const time = now.toLocaleTimeString('en-US', { hour12: false });
  document.getElementById('clock').textContent = time;
}
setInterval(updateClock, 1000);
updateClock();

// ===== ADMIN VOTING TIMER =====
function startAdminTimer(duration) {
  stopAdminTimer();
  
  const timerBar = document.getElementById('voting-timer-bar');
  const timerText = document.getElementById('admin-timer-text');
  const timerRing = document.getElementById('admin-timer-ring');
  const timerVotes = document.getElementById('timer-votes');
  
  timerBar.classList.remove('hidden');
  
  let remaining = duration;
  const circumference = 276.46;
  timerText.textContent = remaining;
  timerRing.style.strokeDashoffset = '0';
  
  adminTimerInterval = setInterval(() => {
    remaining--;
    timerText.textContent = Math.max(0, remaining);
    
    const progress = 1 - (remaining / duration);
    timerRing.style.strokeDashoffset = (circumference * progress).toString();
    
    if (remaining <= 5) timerRing.style.stroke = '#EF4444';
    else if (remaining <= 10) timerRing.style.stroke = '#F59E0B';
    else timerRing.style.stroke = '#4ADE80';
    
    if (showState) {
      const voteWord = showState.totalVotes !== 1 ? t('votes.votes') : t('votes.vote');
      timerVotes.textContent = showState.totalVotes + ' ' + voteWord;
    }
    
    if (remaining <= 0) {
      stopAdminTimer();
    }
  }, 1000);
}

function stopAdminTimer() {
  if (adminTimerInterval) {
    clearInterval(adminTimerInterval);
    adminTimerInterval = null;
  }
  document.getElementById('voting-timer-bar').classList.add('hidden');
}

// ===== KEYBOARD SHORTCUTS =====
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  
  switch(e.key.toLowerCase()) {
    case ' ':
      e.preventDefault();
      if (!showState?.showStarted) startShow();
      else nextScene();
      break;
    case 'z':
      previousScene();
      break;
    case 'p':
      pauseVideo();
      break;
    case 'r':
      resumeVideo();
      break;
    case 's':
      skipVideo();
      break;
    case 'q':
      openQR();
      break;
    case 'f':
      toggleFullscreen();
      break;
    case 'm':
      togglePreview();
      break;
    case '?':
      toggleShortcuts();
      break;
    case 'escape':
      if (shortcutsVisible) toggleShortcuts();
      break;
  }
});

// ===== FULLSCREEN =====
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(err => {
      showToast(t('toast.fullscreen'), 'error');
    });
  } else {
    document.exitFullscreen();
  }
}

// ===== SHORTCUTS PANEL =====
function toggleShortcuts() {
  const panel = document.getElementById('shortcuts-panel');
  shortcutsVisible = !shortcutsVisible;
  panel.classList.toggle('hidden', !shortcutsVisible);
}

// ===== CONFIRMATION DIALOG =====
function confirmAction(message) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width: 400px">
        <div class="modal-header">
          <h2>${t('confirm.title')}</h2>
        </div>
        <div class="modal-body">
          <p>${message}</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="confirm-cancel">${t('confirm.cancel')}</button>
          <button class="btn btn-danger" id="confirm-ok">${t('confirm.confirm')}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    
    overlay.querySelector('#confirm-cancel').onclick = () => {
      overlay.remove();
      resolve(false);
    };
    overlay.querySelector('#confirm-ok').onclick = () => {
      overlay.remove();
      resolve(true);
    };
  });
}

// ===== LOAD STATE =====
async function loadState() {
  try {
    const res = await fetch('/admin/api/state');
    showState = await res.json();
    updateUI();
  } catch (err) {
    console.error('Failed to load state:', err);
  }
}

// ===== UPDATE UI =====
function updateUI() {
  if (!showState) return;

  const stageUrl = document.getElementById('stage-url');
  if (stageUrl) {
    stageUrl.textContent = window.location.origin + '/stage';
  }

  document.getElementById('show-name').textContent = showState.config?.showName || 'SQUID GAME SHOW';
  if (showState.connections) {
    updateConnectionCounts(showState.connections);
  }

  // Show phase indicator
  const phaseEl = document.getElementById('show-phase');
  const phase = showState.showPhase || 'idle';
  phaseEl.textContent = t('status.' + phase) || phase.toUpperCase();
  phaseEl.className = 'show-phase ' + phase;

  // Progress
  const progress = showState.progress;
  if (progress) {
    document.getElementById('progress-fill').style.width = progress.percent + '%';
    document.getElementById('progress-text').textContent =
      showState.showStarted ?
        t('scene.sceneOf', { current: progress.currentScene, total: progress.totalScenes }) :
        t('controls.notStarted');
  }

  // Button states
  document.getElementById('btn-start').disabled = showState.showStarted;
  document.getElementById('btn-prev').disabled = !showState.showStarted ||
    progress.currentScene <= 1;
  document.getElementById('btn-next').disabled = !showState.showStarted ||
    progress.currentScene >= progress.totalScenes;
  document.getElementById('btn-pause').disabled = !showState.showStarted ||
    showState.showPhase === 'ended' || showState.showPhase === 'idle' || showState.videoPaused;
  document.getElementById('btn-resume').disabled = !showState.showStarted ||
    showState.showPhase === 'ended' || showState.showPhase === 'idle' || !showState.videoPaused;
  document.getElementById('btn-skip').disabled = !showState.showStarted ||
    showState.showPhase === 'ended' || showState.showPhase === 'idle';

  updateSceneInfo();
  updateNextScene();
  updateVoteBars();
  updateOverrideButtons();
  updateHistory();
  updatePlayerList();
  updatePlayerStats();
  updateBattleStatus();
}

// ===== UPDATE SCENE INFO =====
function updateSceneInfo() {
  const container = document.getElementById('scene-info');
  const scene = showState.currentScene;

  if (!scene) {
    container.innerHTML = `<p class="no-scene">${t('scene.noActive')}</p>`;
    return;
  }

  let choicesHTML = '';
  if (scene.choices) {
    choicesHTML = scene.choices.map(c =>
      `<span class="choice-tag" style="border-color: ${c.color}; color: ${c.color}">${c.label}</span>`
    ).join('');
  }

  container.innerHTML = `
    <div class="scene-title">${scene.title}</div>
    <div class="scene-desc">${scene.description || scene.type}</div>
    <div class="scene-choices">${choicesHTML}</div>
  `;
}

// ===== UPDATE NEXT SCENE =====
function updateNextScene() {
  const container = document.getElementById('next-scene-info');
  const next = showState.nextScene;

  if (!next) {
    container.innerHTML = `<p class="no-scene">${t('scene.noNext')}</p>`;
    return;
  }

  let typeBadge = '';
  if (next.type === 'branching') typeBadge = '🗳️ ' + t('scene.branching');
  else if (next.type === 'intro') typeBadge = '🎬 ' + t('scene.intro');
  else if (next.type === 'linear') typeBadge = '▶️ ' + t('scene.linear');
  else if (next.type === 'outro') typeBadge = '🏁 ' + t('scene.outro');

  container.innerHTML = `
    <div class="next-title">${next.title}</div>
    <div class="next-type">${typeBadge}</div>
  `;
}

// ===== UPDATE VOTE BARS =====
function updateVoteBars() {
  const container = document.getElementById('vote-bars');
  const votes = showState.voteCounts;
  const total = showState.totalVotes;

  document.getElementById('total-votes').textContent = total;

  if (!votes || Object.keys(votes).length === 0) {
    container.innerHTML = `<p class="no-scene">${t('votes.noVotes')}</p>`;
    return;
  }

  let html = '';
  Object.keys(votes).forEach(choiceId => {
    const voteData = votes[choiceId];
    const percent = total > 0 ? (voteData.count / total) * 100 : 0;
    html += `
      <div class="vote-bar-item">
        <span class="vote-bar-label" style="color: ${voteData.color}">${voteData.label}</span>
        <div class="vote-bar-track">
          <div class="vote-bar-fill" style="width: ${percent}%; background: ${voteData.color}"></div>
        </div>
        <span class="vote-bar-count">${voteData.count}</span>
      </div>
    `;
  });

  container.innerHTML = html;
}

// ===== UPDATE OVERRIDE BUTTONS =====
function updateOverrideButtons() {
  const container = document.getElementById('override-buttons');
  const scene = showState.currentScene;

  if (!scene || !scene.choices) {
    container.innerHTML = `<p class="no-scene">${t('override.enable')}</p>`;
    return;
  }

  let html = '';
  scene.choices.forEach(choice => {
    html += `
      <button class="override-btn" style="border-color: ${choice.color}; color: ${choice.color}"
              onclick="manualOverride('${choice.id}')">
        ${choice.label}
      </button>
    `;
  });

  container.innerHTML = html;
}

// ===== UPDATE HISTORY =====
function updateHistory() {
  const container = document.getElementById('history-list');
  const history = showState.sceneHistory;

  if (!history || history.length === 0) {
    container.innerHTML = `<p class="no-scene">${t('history.empty')}</p>`;
    return;
  }

  let html = '';
  history.forEach(item => {
    const winner = item.winner ? item.winner.label : t('history.na');
    html += `
      <div class="history-item">
        <span class="scene-label">${item.title}</span> &rarr;
        <span class="winner-label">${winner}</span>
        ${item.votes === 'manual_override' ? t('history.manual') : ''}
      </div>
    `;
  });

  container.innerHTML = html;
}

// ===== API CALLS =====
async function startShow() {
  try {
    const res = await fetch('/admin/api/start-show', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showState = data.state;
      updateUI();
      showToast(t('toast.showStarted'), 'success');
    }
  } catch (err) {
    console.error('Failed to start show:', err);
    showToast(t('toast.failedStart'), 'error');
  }
}

async function previousScene() {
  try {
    const res = await fetch('/admin/api/previous-scene', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showState = data.state;
      updateUI();
      showToast(t('toast.sceneBack'), 'info');
    } else {
      showToast(t('toast.firstScene'), 'warning');
    }
  } catch (err) {
    console.error('Failed to go back:', err);
    showToast(t('toast.failedBack'), 'error');
  }
}

async function nextScene() {
  try {
    const res = await fetch('/admin/api/next-scene', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showState = data.state;
      updateUI();
      showToast(t('toast.sceneAdvanced'), 'info');
    } else {
      showToast(t('toast.showEnded'), 'warning');
    }
  } catch (err) {
    console.error('Failed to advance scene:', err);
    showToast(t('toast.failedAdvance'), 'error');
  }
}

async function pauseVideo() {
  try {
    const res = await fetch('/admin/api/pause-video', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showState = data.state;
      showToast(t('toast.videoPaused'), 'info');
      updateUI();
    }
  } catch (err) {
    console.error('Failed to pause:', err);
    showToast(t('toast.failedPause'), 'error');
  }
}

async function resumeVideo() {
  try {
    const res = await fetch('/admin/api/resume-video', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showState = data.state;
      showToast(t('toast.videoResumed'), 'info');
      updateUI();
    }
  } catch (err) {
    console.error('Failed to resume:', err);
    showToast(t('toast.failedResume'), 'error');
  }
}

async function skipVideo() {
  try {
    const res = await fetch('/admin/api/skip-video', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showState = data.state;
      updateUI();
      showToast(t('toast.videoSkipped'), 'info');
    }
  } catch (err) {
    console.error('Failed to skip:', err);
    showToast(t('toast.failedSkip'), 'error');
  }
}

async function manualOverride(choiceId) {
  try {
    const res = await fetch(`/admin/api/manual-override/${choiceId}`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showState = data.state;
      updateUI();
      showToast(`${t('override.success')} ${data.choice?.label}`, 'warning');
    }
  } catch (err) {
    console.error('Failed to override:', err);
    showToast(t('toast.failedOverride'), 'error');
  }
}

async function resetShow() {
  const confirmed = await confirmAction(t('reset.confirm'));
  if (!confirmed) return;

  try {
    const res = await fetch('/admin/api/reset-show', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showState = data.state;
      updateUI();
    }
  } catch (err) {
    console.error('Failed to reset show:', err);
    showToast(t('toast.failedReset'), 'error');
  }
}

function openQR() {
  window.open('/qr', '_blank', 'width=500,height=600');
}

async function generateQR() {
  const display = document.getElementById('qr-display');
  try {
    display.innerHTML = `<p style="color: #888; font-size: 0.85em;">${t('qr.generating')}</p>`;
    const res = await fetch('/qr');
    if (!res.ok) throw new Error('Failed to fetch QR page');
    const html = await res.text();
    const match = html.match(/src="([^"]*\/qr[^"]*\.svg[^"]*)"/i) ||
                  html.match(/src="([^"]*\/qr[^"]*\.png[^"]*)"/i) ||
                  html.match(/src="([^"]+)"/);
    if (match && match[1]) {
      const imgSrc = match[1].startsWith('http') ? match[1] : match[1];
      display.innerHTML = `<img src="${imgSrc}" alt="QR Code" onerror="this.parentElement.innerHTML='<p style=\\'color: #f87171\\'>${t('qr.loadError')}</p>'">`;
      showToast(t('toast.qrGenerated'), 'success');
    } else {
      display.innerHTML = `<p style="color: #f87171; font-size: 0.85em;">${t('qr.notFound')}</p>`;
      showToast(t('toast.qrNotFound'), 'error');
    }
  } catch (err) {
    console.error('Failed to generate QR:', err);
    display.innerHTML = `<p style="color: #f87171; font-size: 0.85em;">${t('qr.error')} ${err.message}</p>`;
    showToast(t('toast.qrFailed'), 'error');
  }
}

// ===== DIAGNOSTICS =====
async function runDiagnostics() {
  const container = document.getElementById('diagnostics-results');
  container.innerHTML = `<p style="color: #888; font-size: 0.85em;">${t('diagnostics.running')}</p>`;
  
  try {
    const res = await fetch('/admin/api/diagnostics');
    const data = await res.json();
    
    let html = '';
    
    html += `<div class="diag-item ok">
      <span class="diag-icon">✓</span>
      <span class="diag-label">${t('diagnostics.server')}</span>
      <span class="diag-status">${t('diagnostics.running')}</span>
    </div>`;
    
    const conn = data.socketio?.connections || {};
    const totalConn = (conn.voters || 0) + (conn.admins || 0) + (conn.stages || 0);
    html += `<div class="diag-item ok">
      <span class="diag-icon">✓</span>
      <span class="diag-label">Socket.IO</span>
      <span class="diag-file">${totalConn} connected (${t('connection.voters')}: ${conn.voters || 0}, ${t('connection.admin')}: ${conn.admins || 0}, ${t('connection.stage')}: ${conn.stages || 0})</span>
      <span class="diag-status">${t('diagnostics.ok')}</span>
    </div>`;
    
    if (data.videos) {
      data.videos.forEach(v => {
        const status = v.status === 'ok' ? 'ok' : 'missing';
        const icon = v.status === 'ok' ? '✓' : '✗';
        html += `<div class="diag-item ${status}">
          <span class="diag-icon">${icon}</span>
          <span class="diag-label">${v.scene} (${v.label})</span>
          <span class="diag-file">${v.filename}</span>
          <span class="diag-status">${v.status === 'ok' ? t('diagnostics.found') : t('diagnostics.missing')}</span>
        </div>`;
      });
    }
    
    container.innerHTML = html;
    showToast(t('toast.diagComplete'), 'success');
  } catch (err) {
    container.innerHTML = `<p style="color: #EF4444; font-size: 0.85em;">${t('diagnostics.failed')}</p>`;
    showToast(t('toast.diagFailed'), 'error');
  }
}

// ===== STAGE PREVIEW =====
function togglePreview() {
  const preview = document.getElementById('stage-preview');
  if (preview.classList.contains('minimized')) {
    preview.classList.remove('minimized');
  } else {
    preview.classList.add('minimized');
  }
}

function togglePreviewSize() {
  const preview = document.getElementById('stage-preview');
  const body = document.getElementById('preview-body');
  
  if (body.style.height === '360px') {
    body.style.height = '180px';
    preview.style.width = '320px';
  } else {
    body.style.height = '360px';
    preview.style.width = '500px';
  }
}

function closePreview() {
  const preview = document.getElementById('stage-preview');
  const toggleBtn = document.getElementById('preview-toggle-btn');
  preview.classList.add('hidden');
  toggleBtn.classList.remove('hidden');
}

function showPreview() {
  const preview = document.getElementById('stage-preview');
  const toggleBtn = document.getElementById('preview-toggle-btn');
  preview.classList.remove('hidden', 'minimized');
  toggleBtn.classList.add('hidden');
}

// ===== PLAYER MANAGEMENT =====
let currentFilter = 'all';

function updatePlayerList() {
  if (!showState || !showState.players) return;
  const container = document.getElementById('player-list');
  const players = showState.players;

  let filtered = players;
  if (currentFilter !== 'all') {
    filtered = players.filter(p => p.status === currentFilter);
  }

  container.innerHTML = filtered.map(p =>
    `<div class="player-card ${p.status}" onclick="showPlayerPopup('${p.id}')" title="${p.name} - ${p.status}">
      #${p.id}
    </div>`
  ).join('');

  updatePlayerStats();
}

function updatePlayerStats() {
  if (!showState) return;
  const players = showState.players || [];
  const activeCount = players.filter(p => p.status === 'active').length;
  const safeCount = players.filter(p => p.status === 'safe').length;
  const detainedCount = players.filter(p => p.status === 'detained').length;
  const killedCount = players.filter(p => p.status === 'killed').length;

  document.getElementById('player-active-count').textContent = activeCount;
  document.getElementById('player-safe-count').textContent = safeCount;
  document.getElementById('player-detained-count').textContent = detainedCount;
  document.getElementById('player-killed-count').textContent = killedCount;
  document.getElementById('player-prize').textContent = '$' + (showState.prize || 0).toLocaleString();
}

function filterPlayers(status) {
  currentFilter = status;
  document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
  event.target.classList.add('active');
  updatePlayerList();
}

async function showPlayerPopup(playerId) {
  const player = showState.players.find(p => p.id === playerId);
  if (!player) return;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="player-popup">
      <h3>Player #${player.id} - ${player.name}</h3>
      <p style="color:#888;margin-bottom:16px;">Current status: <strong style="color:${player.status === 'safe' ? 'var(--sg-teal)' : player.status === 'detained' ? '#F59E0B' : player.status === 'killed' ? 'var(--sg-pink)' : '#4ADE80'}">${player.status.toUpperCase()}</strong></p>
      <div class="status-buttons">
        <button class="status-btn set-active" onclick="emergencyOverride('${playerId}', 'active')">Active</button>
        <button class="status-btn set-safe" onclick="emergencyOverride('${playerId}', 'safe')">Safe</button>
        <button class="status-btn set-detained" onclick="emergencyOverride('${playerId}', 'detained')">Detained</button>
        <button class="status-btn set-killed" onclick="emergencyOverride('${playerId}', 'killed')">Killed</button>
      </div>
      <button class="btn btn-small" style="margin-top:16px;width:100%;" onclick="this.closest('.modal-overlay').remove()">Close</button>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

async function emergencyOverride(playerId, status) {
  try {
    const res = await fetch(`/admin/api/emergency-override/${playerId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    const data = await res.json();
    if (data.success) {
      showState = data.state;
      updateUI();
      showToast(`Player #${playerId} → ${status}`, 'success');
      document.querySelector('.modal-overlay')?.remove();
    }
  } catch (err) {
    showToast('Failed to update player', 'error');
  }
}

async function killAllDetained() {
  const confirmed = await confirmAction('Kill ALL detained players? This cannot be undone.');
  if (!confirmed) return;

  try {
    const res = await fetch('/admin/api/kill-all-detained', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showState = data.state;
      updateUI();
      showToast(`Killed ${data.killed} players`, 'warning');
    }
  } catch (err) {
    showToast('Failed to kill detained', 'error');
  }
}

// ===== BATTLE CONTROLS =====
async function startBattles() {
  try {
    const res = await fetch('/admin/api/start-battles', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showState = data.state;
      updateUI();
      updateBattleStatus();
      showToast('Battles started', 'success');
    }
  } catch (err) {
    showToast('Failed to start battles', 'error');
  }
}

async function nextBattle() {
  try {
    const res = await fetch('/admin/api/next-battle', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showState = data.state;
      updateUI();
      updateBattleStatus();
    }
  } catch (err) {
    showToast('Failed to advance battle', 'error');
  }
}

function updateBattleStatus() {
  if (!showState) return;
  const container = document.getElementById('battle-status');
  const btnStart = document.getElementById('btn-start-battles');
  const btnNext = document.getElementById('btn-next-battle');
  const scene = showState.currentScene;

  if (scene && scene.type === 'accumulative' && scene.battles) {
    const idx = showState.currentBattleIndex || 0;
    const total = scene.battles.length;
    const current = scene.battles[idx];
    if (current) {
      container.innerHTML = `<div style="font-size:0.85em;"><strong>Battle ${idx + 1}/${total}</strong> — ${current.type.toUpperCase()}<br><span style="color:#888;">${current.label}</span></div>`;
    }
    btnStart.disabled = showState.accumulativeVotingOpen;
    btnNext.disabled = !showState.accumulativeVotingOpen || idx >= total;
  } else {
    container.innerHTML = '<p class="no-scene">No active battle</p>';
    btnStart.disabled = true;
    btnNext.disabled = true;
  }

  // Shadow game buttons
  const btnHide = document.getElementById('btn-shadow-hide');
  const btnSearch = document.getElementById('btn-shadow-search');
  const btnEnd = document.getElementById('btn-shadow-end');
  const isShadow = scene && scene.type === 'timer';
  if (btnHide) btnHide.disabled = !isShadow;
  if (btnSearch) btnSearch.disabled = !isShadow;
  if (btnEnd) btnEnd.disabled = !isShadow;
}

async function setShadowPhase(phase) {
  try {
    const res = await fetch('/admin/api/shadow-game-phase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phase })
    });
    const data = await res.json();
    if (data.success) {
      showState = data.state;
      updateShadowStatus(phase);
      showToast(`Shadow game: ${phase}`, 'info');
    }
  } catch (err) {
    showToast('Failed to set shadow phase', 'error');
  }
}

function updateShadowStatus(phase) {
  const container = document.getElementById('shadow-status');
  if (!container) return;
  const labels = { idle: 'Not active', hiding: 'HIDING - Players hiding', searching: 'SEARCHING - Guards searching', ended: 'ENDED' };
  const colors = { idle: '#666', hiding: '#F59E0B', searching: 'var(--sg-pink)', ended: 'var(--sg-teal)' };
  container.innerHTML = `<div style="font-size:0.85em;font-weight:700;color:${colors[phase] || '#888'};">${labels[phase] || phase}</div>`;
}
