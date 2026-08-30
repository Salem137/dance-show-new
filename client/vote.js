const socket = io();

socket.on('connect', () => {
  socket.emit('register', 'voter');
  updateConnectionStatus(true);
  console.log('Connected to server');
  if (socket.recovered === false) { showingResult = false; showingVoting = false; }
});

let currentScene = null;
let selectedChoice = null;
let votingOpen = false;
let timerInterval = null;
let timeLeft = 0;
let countdownInterval = null;
let showingResult = false;
let showingVoting = false;
let currentVotingType = 'branching';
let accumVotingOpen = false;
let categoryVotingOpen = false;

const screens = {
  waiting: document.getElementById('waiting-screen'),
  voting: document.getElementById('voting-screen'),
  accumulative: document.getElementById('accumulative-screen'),
  category: document.getElementById('category-screen'),
  confirmed: document.getElementById('confirmed-screen'),
  result: document.getElementById('result-screen'),
  ended: document.getElementById('ended-screen')
};

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  if (screens[name]) screens[name].classList.add('active');
}

function t(key) {
  const keys = key.split('.');
  let value = clientTranslations;
  for (const k of keys) { value = value?.[k]; }
  return value || key;
}

function translateChoiceLabel(label) {
  if (!label) return label;
  const labelLower = label.toLowerCase().trim();
  const enToAr = {
    'joy': 'فرح', 'sorrow': 'حزن', 'happiness': 'سعادة', 'sadness': 'حزن',
    'love': 'حب', 'hate': 'كره', 'anger': 'غضب', 'fear': 'خوف',
    'surprise': 'مفاجأة', 'disgust': 'اشمئزاز', 'trust': 'ثقة', 'anticipation': 'ترقب',
    'yes': 'نعم', 'no': 'لا', 'left': 'يسار', 'right': 'يمين',
    'up': 'أعلى', 'down': 'أسفل', 'forward': 'أمام', 'backward': 'خلف',
    'light': 'نور', 'dark': 'ظلام', 'fire': 'نار', 'water': 'ماء',
    'earth': 'أرض', 'air': 'هواء', 'red': 'أحمر', 'blue': 'أزرق',
    'green': 'أخضر', 'yellow': 'أصفر', 'purple': 'بنفسجي', 'pink': 'وردي',
    'gold': 'ذهبي', 'silver': 'فضي',
    'choice a': 'الخيار أ', 'choice b': 'الخيار ب',
    'option a': 'الخيار أ', 'option b': 'الخيار ب',
    'team a': 'الفريق أ', 'team b': 'الفريق ب',
    'group a': 'المجموعة أ', 'group b': 'المجموعة ب'
  };
  const arToEn = {};
  for (const [en, ar] of Object.entries(enToAr)) { arToEn[ar] = en.charAt(0).toUpperCase() + en.slice(1); }
  if (currentLang === 'ar') return enToAr[labelLower] || label;
  return arToEn[labelLower] || label;
}

// ===== HAPTIC FEEDBACK =====
function haptic(type) {
  if (!navigator.vibrate) return;
  switch (type) {
    case 'tap': navigator.vibrate(10); break;
    case 'confirm': navigator.vibrate([20, 30, 20]); break;
    case 'vote': navigator.vibrate([15, 20, 15]); break;
    case 'error': navigator.vibrate([50, 50, 50]); break;
  }
}

// ===== STATUS BAR =====
function updateStatusBar(state) {
  const prize = document.getElementById('sb-prize');
  const safe = document.getElementById('sb-safe');
  const detained = document.getElementById('sb-detained');
  const killed = document.getElementById('sb-killed');
  if (prize) prize.textContent = '$' + (state.prize || 0).toLocaleString();
  if (safe) safe.textContent = state.safeCount || 0;
  if (detained) detained.textContent = state.detainedCount || 0;
  if (killed) killed.textContent = state.killedCount || 0;
  // Show status bar if we have game state
  const sb = document.getElementById('status-bar');
  if (sb && state.showStarted && state.showPhase !== 'idle') {
    sb.classList.add('visible');
  }
}

// ===== CONNECTION STATUS =====
function updateConnectionStatus(connected) {
  const el = document.getElementById('connection-status');
  if (connected) {
    el.classList.remove('disconnected');
    el.innerHTML = `<span class="dot"></span> ${t('connected')}`;
  } else {
    el.classList.add('disconnected');
    el.innerHTML = `<span class="dot"></span> ${t('reconnecting')}`;
  }
}

socket.on('disconnect', () => { updateConnectionStatus(false); });

socket.on('show_state', (state) => {
  console.log('Show state:', state);
  updateStatusBar(state);

  if (showingResult || showingVoting) return;

  if (!state.showStarted) {
    showScreen('waiting');
    document.getElementById('show-title').textContent = t('showName');
    document.getElementById('waiting-status').textContent = t('waiting');
    return;
  }

  if (state.currentScene && state.votingOpen && state.currentScene.type === 'branching' && state.currentScene.choices) {
    showVotingScreen(state.currentScene, state.voteCounts);
  } else if (state.currentScene && state.accumulativeVotingOpen && state.currentScene.type === 'accumulative') {
    showAccumulativeScreen(state.currentScene, state.currentBattleIndex);
  } else if (state.currentScene && state.votingOpen && state.currentScene.type === 'category_vote' && state.currentScene.categories) {
    showCategoryScreen(state.currentScene, state.voteCounts);
  } else {
    showScreen('waiting');
    if (state.currentScene) {
      document.getElementById('waiting-status').textContent = `${t('nowPlaying')} ${state.currentScene.title}`;
    } else {
      document.getElementById('waiting-status').textContent = t('waitingNext');
    }
  }
});

// ===== BRANCHING VOTING =====
socket.on('voting_open', (data) => {
  console.log('Voting opened:', data);
  selectedChoice = null;
  showingResult = false;
  showingVoting = true;
  votingOpen = true;
  currentVotingType = data.votingType || 'branching';

  if (currentVotingType === 'category') {
    showCategoryScreen(data.scene, {});
  } else {
    showVotingScreen(data.scene, {});
  }
  startTimer(data.duration);
});

socket.on('voting_closed', (data) => {
  console.log('Voting closed:', data);
  votingOpen = false;
  accumVotingOpen = false;
  categoryVotingOpen = false;
  showingVoting = false;
  if (timerInterval) clearInterval(timerInterval);
});

socket.on('vote_update', (data) => {
  console.log('Vote update:', data);
  updateVoteDisplay(data.votes, data.totalVotes);
});

socket.on('winner_announced', (data) => {
  console.log('Winner announced:', data);
  showingVoting = false;
  showingResult = true;
  haptic('confirm');
  showResultScreen(data);
});

socket.on('scene_changed', (data) => {
  console.log('Scene changed:', data);
  showingResult = false;
  showingVoting = false;
  if (data.scene) {
    showScreen('waiting');
    document.getElementById('waiting-status').textContent = `${t('nextScene')} ${data.scene.title}`;
  }
});

socket.on('show_ended', () => {
  showingResult = false;
  showingVoting = false;
  showScreen('ended');
});

socket.on('show_reset', () => {
  showingResult = false;
  showingVoting = false;
  showScreen('waiting');
  document.getElementById('waiting-status').textContent = t('waiting');
  document.getElementById('status-bar').classList.remove('visible');
});

socket.on('category_vote_started', (data) => {
  console.log('Category vote started:', data);
  selectedChoice = null;
  showingResult = false;
  showingVoting = true;
  categoryVotingOpen = true;
  votingOpen = true;
  currentVotingType = 'category';
  showCategoryScreen({ categories: data.categories, title: 'Second Chance', votingDuration: data.duration }, {});
  startTimer(data.duration, 'cat');
});

socket.on('category_vote_update', (data) => {
  updateCategoryVoteDisplay(data.votes, data.totalVotes);
});

socket.on('category_winner_announced', (data) => {
  showingVoting = false;
  categoryVotingOpen = false;
  haptic('confirm');
  showScreen('waiting');
  document.getElementById('waiting-status').textContent = data.category ? `Rescued: ${data.category.label}` : 'Category selected';
});

socket.on('accumulative_vote_update', (data) => {
  updateAccumVoteDisplay(data.votes);
});

socket.on('battle_started', (data) => {
  console.log('Battle started:', data);
  selectedChoice = null;
  showingResult = false;
  showingVoting = true;
  accumVotingOpen = true;
  currentVotingType = 'accumulative';
  showAccumulativeScreen({ battles: data.battles }, data.currentBattleIndex);
});

socket.on('battle_next', (data) => {
  selectedChoice = null;
  showAccumulativeScreen({ battles: currentScene?.battles || [] }, data.currentBattleIndex);
});

socket.on('battle_resolved', (data) => {
  haptic('confirm');
});

socket.on('battles_finished', () => {
  accumVotingOpen = false;
  showingVoting = false;
  showScreen('waiting');
  document.getElementById('waiting-status').textContent = 'Battles complete';
});

socket.on('players_killed', (data) => {
  haptic('error');
});

// ===== SHOW VOTING SCREEN =====
function showVotingScreen(scene, voteCounts) {
  currentScene = scene;
  votingOpen = true;

  document.getElementById('scene-title').textContent = scene.title;
  document.getElementById('scene-description').textContent = scene.description;

  const container = document.getElementById('choices-container');
  container.innerHTML = '';

  scene.choices.forEach(choice => {
    const btn = document.createElement('button');
    btn.className = 'choice-btn';
    btn.dataset.choiceId = choice.id;
    btn.style.setProperty('--choice-color', choice.color);
    const translatedLabel = translateChoiceLabel(choice.label);
    btn.innerHTML = `
      <div class="bar" style="background: ${choice.color}"></div>
      <span class="label">${translatedLabel}</span>
      <span class="vote-count-badge" id="vote-count-${choice.id}">0</span>
    `;
    btn.addEventListener('click', () => { haptic('tap'); castVote(choice.id, btn); });
    container.appendChild(btn);
  });

  showScreen('voting');
  startTimer(scene.votingDuration || 15);
}

function castVote(choiceId, btnElement) {
  if (!votingOpen || selectedChoice) return;
  selectedChoice = choiceId;
  btnElement.classList.add('selected');
  socket.emit('vote', choiceId);
  haptic('vote');

  document.querySelectorAll('.choice-btn').forEach(btn => { btn.style.pointerEvents = 'none'; });

  setTimeout(() => {
    showScreen('confirmed');
    const scene = currentScene;
    if (scene) {
      const choice = scene.choices.find(c => c.id === choiceId);
      if (choice) {
        const translatedLabel = translateChoiceLabel(choice.label);
        document.getElementById('confirmed-choice').innerHTML = `${t('youChose')} <strong style="color: ${choice.color}">${translatedLabel}</strong>`;
      }
    }
  }, 500);
}

function updateVoteDisplay(votes, totalVotes) {
  if (!currentScene) return;
  document.getElementById('total-votes').textContent = totalVotes;
  currentScene.choices.forEach(choice => {
    const btn = document.querySelector(`.choice-btn[data-choice-id="${choice.id}"]`);
    if (btn) {
      const voteData = votes[choice.id];
      const count = voteData ? voteData.count : 0;
      const bar = btn.querySelector('.bar');
      const countBadge = btn.querySelector('.vote-count-badge');
      if (bar && totalVotes > 0) bar.style.width = ((count / totalVotes) * 100) + '%';
      if (countBadge) countBadge.textContent = count;
    }
  });
}

// ===== ACCUMULATIVE VOTING =====
function showAccumulativeScreen(scene, battleIndex) {
  currentScene = scene;
  accumVotingOpen = true;
  selectedChoice = null;

  const battles = scene.battles || [];
  const idx = battleIndex || 0;
  const battle = battles[idx];

  if (battle) {
    document.getElementById('accum-title').textContent = 'Dance Battle';
    document.getElementById('accum-description').textContent = `Battle ${idx + 1}/${battles.length} — ${battle.type.toUpperCase()}`;
  }

  const yesBtn = document.getElementById('accum-yes-btn');
  const noBtn = document.getElementById('accum-no-btn');
  yesBtn.classList.remove('selected', 'disabled');
  noBtn.classList.remove('selected', 'disabled');
  yesBtn.style.pointerEvents = 'auto';
  noBtn.style.pointerEvents = 'auto';

  showScreen('accumulative');
  startTimer(scene.votingDuration || 15, 'accum');
}

function castAccumVote(voteType) {
  if (!accumVotingOpen || selectedChoice) return;
  selectedChoice = voteType;
  haptic('vote');
  socket.emit('accumulative_vote', { battleId: currentScene?.battles?.[0]?.id, voteType });

  const btn = voteType === 'yes' ? document.getElementById('accum-yes-btn') : document.getElementById('accum-no-btn');
  btn.classList.add('selected');
  document.getElementById('accum-yes-btn').style.pointerEvents = 'none';
  document.getElementById('accum-no-btn').style.pointerEvents = 'none';

  setTimeout(() => {
    showScreen('confirmed');
    document.getElementById('confirmed-choice').innerHTML = `You voted: <strong style="color:${voteType === 'yes' ? '#26A69A' : '#E91E63'}">${voteType.toUpperCase()}</strong>`;
  }, 500);
}

function updateAccumVoteDisplay(votes) {
  if (!votes) return;
  const yesCount = document.getElementById('accum-yes-count');
  const noCount = document.getElementById('accum-no-count');
  const totalVotes = document.getElementById('accum-total-votes');
  if (yesCount) yesCount.textContent = votes.yes || 0;
  if (noCount) noCount.textContent = votes.no || 0;
  if (totalVotes) totalVotes.textContent = (votes.yes || 0) + (votes.no || 0);
}

// ===== CATEGORY VOTING =====
function showCategoryScreen(scene, voteCounts) {
  currentScene = scene;
  categoryVotingOpen = true;
  selectedChoice = null;

  document.getElementById('cat-title').textContent = scene.title || 'Second Chance';
  document.getElementById('cat-description').textContent = scene.description || 'Choose a category';

  const container = document.getElementById('cat-choices-container');
  container.innerHTML = '';

  (scene.categories || []).forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'choice-btn';
    btn.dataset.choiceId = cat.id;
    btn.style.setProperty('--choice-color', cat.color);
    btn.innerHTML = `
      <div class="bar" style="background: ${cat.color}"></div>
      <span class="label">${cat.label}</span>
      <span class="vote-count-badge" id="cat-vote-count-${cat.id}">0</span>
    `;
    btn.addEventListener('click', () => { haptic('tap'); castCategoryVote(cat.id, btn); });
    container.appendChild(btn);
  });

  showScreen('category');
  startTimer(scene.votingDuration || 20, 'cat');
}

function castCategoryVote(categoryId, btnElement) {
  if (!categoryVotingOpen || selectedChoice) return;
  selectedChoice = categoryId;
  btnElement.classList.add('selected');
  socket.emit('category_vote', categoryId);
  haptic('vote');

  document.querySelectorAll('#cat-choices-container .choice-btn').forEach(btn => { btn.style.pointerEvents = 'none'; });

  setTimeout(() => {
    showScreen('confirmed');
    if (currentScene) {
      const cat = currentScene.categories.find(c => c.id === categoryId);
      if (cat) {
        document.getElementById('confirmed-choice').innerHTML = `You chose: <strong style="color: ${cat.color}">${cat.label}</strong>`;
      }
    }
  }, 500);
}

function updateCategoryVoteDisplay(votes, totalVotes) {
  if (!votes) return;
  document.getElementById('cat-total-votes').textContent = totalVotes;
  Object.keys(votes).forEach(catId => {
    const v = typeof votes[catId] === 'number' ? votes[catId] : (votes[catId]?.count || 0);
    const badge = document.getElementById(`cat-vote-count-${catId}`);
    if (badge) badge.textContent = v;
  });
}

// ===== TIMER =====
function startTimer(duration, prefix) {
  const pre = prefix ? prefix + '-' : '';
  timeLeft = duration;
  const timerTextEl = document.getElementById(pre + 'timer-text') || document.getElementById('timer-text');
  const timerCircleEl = document.getElementById(pre + 'timer-circle') || document.getElementById('timer-circle');
  updateTimerDisplay(timerTextEl, timerCircleEl, duration);

  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    timeLeft--;
    updateTimerDisplay(timerTextEl, timerCircleEl, duration);
    if (timeLeft <= 0) clearInterval(timerInterval);
  }, 1000);
}

function updateTimerDisplay(timerTextEl, timerCircleEl, duration) {
  if (timerTextEl) timerTextEl.textContent = timeLeft;
  if (timerCircleEl) {
    const circumference = 283;
    const progress = (timeLeft / duration) * circumference;
    timerCircleEl.style.strokeDashoffset = circumference - progress;
    if (timeLeft <= 5) { timerCircleEl.style.stroke = '#f44336'; }
    else if (timeLeft <= 10) { timerCircleEl.style.stroke = '#FF9800'; }
    else { timerCircleEl.style.stroke = 'var(--sg-gold)'; }
  }
}

// ===== RESULT SCREEN =====
function showResultScreen(data) {
  const { winner, voteCounts, totalVotes, manual } = data;
  if (!winner) return;
  const translatedWinnerLabel = translateChoiceLabel(winner.label);
  document.getElementById('result-label').textContent = translatedWinnerLabel;
  document.getElementById('result-color').style.background = winner.color;

  const votesContainer = document.getElementById('result-votes');
  votesContainer.innerHTML = '';
  if (voteCounts && Object.keys(voteCounts).length > 0) {
    const sortedChoices = Object.keys(voteCounts).map(id => ({ id, ...voteCounts[id] })).sort((a, b) => b.count - a.count);
    sortedChoices.forEach(choice => {
      const isWinner = choice.id === winner.id;
      const voteWord = choice.count !== 1 ? t('votes') : t('vote');
      const translatedLabel = translateChoiceLabel(choice.label);
      const item = document.createElement('div');
      item.className = 'result-vote-item' + (isWinner ? ' winner' : '');
      item.innerHTML = `
        <div class="choice-info">
          <div class="choice-dot" style="background: ${choice.color}"></div>
          <span class="choice-name">${translatedLabel}</span>
        </div>
        <span class="choice-count">${choice.count} ${voteWord}${isWinner ? ' 👑' : ''}</span>
      `;
      votesContainer.appendChild(item);
    });
  }

  const userResult = document.getElementById('user-choice-result');
  if (selectedChoice && voteCounts && Object.keys(voteCounts).length > 0) {
    const userChoice = currentScene ? currentScene.choices.find(c => c.id === selectedChoice) : null;
    const userWon = selectedChoice === winner.id;
    if (userWon) {
      userResult.className = 'user-choice-result won';
      const translatedLabel = userChoice ? translateChoiceLabel(userChoice.label) : '';
      userResult.innerHTML = `${t('youChose')} <strong>${translatedLabel}</strong> — ${t('youWon')}`;
    } else {
      userResult.className = 'user-choice-result lost';
      const translatedLabel = userChoice ? translateChoiceLabel(userChoice.label) : '';
      userResult.innerHTML = `${t('youChose')} <strong>${translatedLabel}</strong>`;
    }
  } else {
    userResult.className = 'user-choice-result lost';
    userResult.innerHTML = manual ? t('manualOverride') : '';
  }

  showScreen('result');
  let countdown = 5;
  const countdownEl = document.getElementById('countdown-text');
  countdownEl.textContent = countdown;
  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = setInterval(() => {
    countdown--;
    countdownEl.textContent = countdown;
    if (countdown <= 0) {
      clearInterval(countdownInterval);
      showingResult = false;
      showScreen('waiting');
      document.getElementById('waiting-status').textContent = t('waitingDecision');
    }
  }, 1000);
}

socket.on('connect_error', () => { updateConnectionStatus(false); });

function refreshAllText() {
  const statusEl = document.getElementById('connection-status');
  if (statusEl) {
    const isConnected = !statusEl.classList.contains('disconnected');
    updateConnectionStatus(isConnected);
  }
  const showTitle = document.getElementById('show-title');
  if (showTitle) showTitle.textContent = t('showName');
  const waitingStatus = document.getElementById('waiting-status');
  if (waitingStatus) waitingStatus.textContent = t('waiting');
  const timerLabel = document.querySelector('.timer-label');
  if (timerLabel) timerLabel.textContent = t('secondsLeft');
  if (currentScene && document.getElementById('voting-screen').classList.contains('active')) {
    showVotingScreen(currentScene, {});
  }
}
