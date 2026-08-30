let config = null;
let allVideos = [];
let allImages = [];
let tempChoices = [];
let hasUnsavedChanges = false;
let autoSaveTimer = null;
let socket = null;
let isBlackout = false;
let currentActiveScene = null;

window.addEventListener('beforeunload', (e) => {
  if (hasUnsavedChanges) {
    e.preventDefault();
    e.returnValue = '';
  }
});

async function loadConfig() {
  const res = await fetch('/edit-show/api/config');
  config = await res.json();
  document.getElementById('showName').value = config.showName || '';
  document.getElementById('showSubtitle').value = config.showSubtitle || '';
  document.getElementById('venue').value = config.venue || '';
  document.getElementById('showDate').value = config.showDate || '';
  document.getElementById('showTime').value = config.showTime || '';
  document.getElementById('scene-count').innerHTML = config.scenes.length + ' <span data-i18n="scenes.count">' + t('scenes.count') + '</span>';
  renderScenes();
  initSocket();
  loadImages();
}

// ===== SOCKET.IO =====
function initSocket() {
  socket = io();

  socket.on('connect', () => {
    updateWsStatus(true);
    socket.emit('register', 'editor');
  });

  socket.on('disconnect', () => {
    updateWsStatus(false);
  });

  socket.on('stage_scene_changed', (data) => {
    currentActiveScene = data.sceneId;
    renderScenes();
  });

  socket.on('stage_progress', (data) => {
    updateStageProgress(data);
  });
}

function updateWsStatus(connected) {
  const dot = document.getElementById('ws-dot');
  const label = document.getElementById('ws-label');
  if (connected) {
    dot.className = 'ws-dot connected';
    label.textContent = t('live.publicScreenConnected');
  } else {
    dot.className = 'ws-dot disconnected';
    label.textContent = t('live.publicScreenDisconnected');
  }
}

function updateStageProgress(data) {
  const progressBars = document.querySelectorAll('.live-progress-fill');
  progressBars.forEach(bar => {
    if (data.progress !== undefined) {
      bar.style.width = (data.progress * 100) + '%';
    }
  });
}

// ===== LIVE CONTROL =====
function playNow(index) {
  const scene = config.scenes[index];
  if (!scene) return;
  socket.emit('play_now', { sceneId: scene.id, sceneIndex: index });
  currentActiveScene = scene.id;
  renderScenes();
  showToast(t('live.playingNow') + ': ' + scene.title);
}

function toggleBlackout() {
  isBlackout = !isBlackout;
  const btn = document.getElementById('blackout-btn');
  if (isBlackout) {
    btn.classList.add('active-blackout');
    btn.innerHTML = '<span class="btn-icon">▶</span> <span>' + t('live.resume') + '</span>';
    socket.emit('blackout', { active: true });
    showToast(t('live.blackoutOn'));
  } else {
    btn.classList.remove('active-blackout');
    btn.innerHTML = '<span class="btn-icon">⬛</span> <span>' + t('live.blackout') + '</span>';
    socket.emit('blackout', { active: false });
    showToast(t('live.blackoutOff'));
  }
}

// ===== SFX DRAWER =====
const sfxFiles = {
  gunshot: '/assets/sfx/gunshot.mp3',
  buzzer: '/assets/sfx/buzzer.mp3',
  victory: '/assets/sfx/victory.mp3',
  alarm: '/assets/sfx/alarm.mp3'
};

let sfxDrawerOpen = false;

function toggleSfxDrawer() {
  sfxDrawerOpen = !sfxDrawerOpen;
  const drawer = document.getElementById('sfx-drawer');
  const toggle = document.getElementById('sfx-toggle');
  if (sfxDrawerOpen) {
    drawer.classList.add('open');
    toggle.classList.add('active');
  } else {
    drawer.classList.remove('open');
    toggle.classList.remove('active');
  }
}

function triggerSfx(type) {
  const audio = new Audio(sfxFiles[type]);
  audio.volume = 1.0;
  audio.play().catch(e => {
    console.error('SFX play failed:', e);
    showToast(t('sfx.playFailed'), true);
  });

  if (socket && socket.connected) {
    socket.emit('sfx_trigger', { type });
  }

  const btn = document.querySelector(`.sfx-btn.${type}`);
  if (btn) {
    btn.classList.add('playing');
    setTimeout(() => btn.classList.remove('playing'), 500);
  }

  showToast(t('sfx.playing') + ': ' + type);
}

async function loadVideos() {
  const res = await fetch('/edit-show/api/videos');
  allVideos = await res.json();
}

async function loadImages() {
  const res = await fetch('/edit-show/api/images');
  allImages = await res.json();
}

function renderScenes() {
  const list = document.getElementById('scenes-list');
  list.innerHTML = '';

  config.scenes.forEach((scene, index) => {
    const card = document.createElement('div');
    card.className = 'scene-card';
    card.draggable = true;
    card.dataset.index = index;

    const videoPath = scene.video ? `/assets/videos/${scene.video}` : '';
    const videoExists = scene.video && allVideos.some(v => v.name === scene.video);
    const imagePath = scene.image ? `/assets/images/${scene.image}` : '';
    const imageExists = scene.image && allImages.some(i => i.name === scene.image);

    let thumbHtml = '<div class="placeholder">🎬</div>';
    if (videoExists && videoPath) {
      thumbHtml = `
        <video src="${videoPath}" muted preload="metadata" onloadeddata="this.currentTime=1"></video>
        <div class="play-overlay" onclick="previewVideo('${scene.video}')"><span>▶</span></div>
      `;
    } else if (imageExists && imagePath) {
      thumbHtml = `
        <img src="${imagePath}" class="scene-thumb-img">
        <div class="play-overlay" onclick="previewImage('${scene.image}')"><span>🖼️</span></div>
      `;
    }

    let typeBadge = '';
    const typeLabels = { branching: t('sceneTypes.branching'), intro: t('sceneTypes.intro'), linear: t('sceneTypes.linear'), outro: t('sceneTypes.outro') };
    if (scene.type === 'branching') typeBadge = `<span class="type-badge branching">🗳 ${typeLabels.branching}</span>`;
    else if (scene.type === 'intro') typeBadge = `<span class="type-badge intro">🎬 ${typeLabels.intro}</span>`;
    else if (scene.type === 'linear') typeBadge = `<span class="type-badge linear">▶ ${typeLabels.linear}</span>`;
    else if (scene.type === 'outro') typeBadge = `<span class="type-badge outro">🏁 ${typeLabels.outro}</span>`;

    let choicesHtml = '';
    if (scene.choices) {
      choicesHtml = '<div class="choice-list">';
      scene.choices.forEach(c => {
        const choiceVideoExists = c.video && allVideos.some(v => v.name === c.video);
        let choiceThumbHtml = '';
        if (choiceVideoExists) {
          choiceThumbHtml = `<video src="/assets/videos/${c.video}" muted preload="metadata" onloadeddata="this.currentTime=1" class="choice-thumb"></video>`;
        }
        choicesHtml += `
          <div class="choice-subcard">
            <div class="choice-subcard-dot" style="background:${c.color}; box-shadow: 0 0 8px ${c.color}"></div>
            <div class="choice-subcard-info">
              <span class="choice-subcard-label">${c.label}</span>
              <span class="choice-subcard-video ${choiceVideoExists ? 'found' : 'missing'}">${c.video || t('editModal.noVideo')}</span>
            </div>
            ${choiceThumbHtml ? `<div class="choice-subcard-thumb">${choiceThumbHtml}</div>` : ''}
          </div>
        `;
      });
      choicesHtml += '</div>';
    }

    card.innerHTML = `
      <div class="drag-handle" title="اسحب لإعادة الترتيب">⠿</div>
      ${currentActiveScene === scene.id ? '<div class="live-badge">● LIVE ON STAGE</div>' : ''}
      <div class="scene-number">#${index + 1}</div>
      <div class="scene-thumb" onclick="${scene.image ? "previewImage('" + scene.image + "')" : "previewVideo('" + scene.video + "')"}">
        ${thumbHtml}
      </div>
      <div class="scene-info">
        <div class="scene-title">${scene.title}</div>
        <div class="scene-type">${typeBadge} ${scene.limitTime ? '<span class="type-badge limit-time">⏱ LIMIT TIME</span>' : ''}</div>
        ${scene.video ? `<div class="scene-video ${videoExists ? 'found' : 'missing'}">${videoExists ? '✓ ' : '✗ '}${scene.video}</div>` : ''}
        ${scene.image ? `<div class="scene-video ${imageExists ? 'found' : 'missing'}">${imageExists ? '🖼️ ' : '✗ '}${scene.image}</div>` : ''}
        ${choicesHtml}
        ${currentActiveScene === scene.id ? `
          <div class="live-progress">
            <div class="live-progress-bar">
              <div class="live-progress-fill" style="width:0%"></div>
            </div>
            <span class="live-progress-time">00:00 / ${scene.videoDuration || 30}s</span>
          </div>
        ` : ''}
      </div>
      <div class="scene-actions">
        <button class="btn btn-primary btn-small" onclick="openEditSceneModal(${index})">✏ ${t('scenes.editScene')}</button>
        <button class="btn btn-secondary btn-small" onclick="duplicateScene(${index})">⧉</button>
        <button class="btn btn-success btn-small play-now-btn" onclick="playNow(${index})">▶ ${t('live.playNow')}</button>
        ${scene.type !== 'branching' ? `<button class="btn btn-danger btn-small" onclick="removeScene(${index})">✕</button>` : ''}
      </div>
    `;

    // Drag and drop
    card.addEventListener('dragstart', (e) => {
      card.classList.add('dragging');
      e.dataTransfer.setData('text/plain', index);
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
    });

    card.addEventListener('dragover', (e) => {
      e.preventDefault();
    });

    card.addEventListener('drop', (e) => {
      e.preventDefault();
      const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
      const toIndex = index;
      if (fromIndex !== toIndex) {
        moveSceneTo(fromIndex, toIndex);
      }
    });

    list.appendChild(card);
  });

  document.getElementById('scene-count').innerHTML = config.scenes.length + ' <span data-i18n="scenes.count">' + t('scenes.count') + '</span>';
}

function moveSceneTo(fromIndex, toIndex) {
  const scene = config.scenes.splice(fromIndex, 1)[0];
  config.scenes.splice(toIndex, 0, scene);
  renderScenes();
}

// ===== EDIT SCENE MODAL =====
function openEditSceneModal(index) {
  const scene = config.scenes[index];
  document.getElementById('edit-scene-index').value = index;
  document.getElementById('edit-scene-title').value = scene.title;
  document.getElementById('edit-scene-type').value = scene.type;
  document.getElementById('edit-scene-video').value = scene.video || '';
  document.getElementById('edit-scene-image').value = scene.image || '';
  document.getElementById('edit-scene-duration').value = scene.videoDuration || 10;
  document.getElementById('edit-scene-limit-time').checked = scene.limitTime || false;

  // Handle media state for Limit Time toggle
  if (scene.image) {
    // Image present - force Limit Time ON and lock
    enableLimitTimeForMedia();
  } else {
    // No image - use saved state
    const toggle = document.getElementById('edit-scene-limit-time');
    toggle.disabled = false;
    const durationGroup = document.getElementById('duration-group');
    durationGroup.style.display = scene.limitTime ? 'block' : 'none';
  }

  // Show/hide branching options
  const branchingOpts = document.getElementById('branching-options');
  if (scene.type === 'branching') {
    branchingOpts.style.display = 'block';
    renderChoicesEditor(scene.choices || []);
  } else {
    branchingOpts.style.display = 'none';
  }

  // Show video list
  renderVideoList('scene-video-list', (video) => {
    document.getElementById('edit-scene-video').value = video;
  });

  document.getElementById('edit-scene-modal').classList.add('active');
}

function closeEditSceneModal() {
  document.getElementById('edit-scene-modal').classList.remove('active');
}

function renderChoicesEditor(choices) {
  const container = document.getElementById('choices-editor');
  container.innerHTML = '';

  choices.forEach((choice, i) => {
    const choiceVideoExists = choice.video && allVideos.some(v => v.name === choice.video);
    const item = document.createElement('div');
    item.className = 'choice-editor-item';
    item.innerHTML = `
      <input type="color" value="${choice.color}" onchange="updateChoiceColor(${i}, this.value)">
      <input type="text" value="${choice.label}" onchange="updateChoiceLabel(${i}, this.value)" placeholder="Label">
      <div class="choice-video-selector">
        <input type="text" id="choice-video-${i}" value="${choice.video || ''}" onchange="updateChoiceVideo(${i}, this.value)" placeholder="Video file" readonly>
        <button class="btn btn-secondary btn-small" onclick="toggleChoiceVideoList(${i})" data-i18n="editModal.browse">Browse</button>
        <button class="btn btn-secondary btn-small" onclick="clearChoiceVideo(${i})">✕</button>
        <div class="choice-video-list" id="choice-video-list-${i}" style="display:none"></div>
      </div>
      <button class="btn btn-danger btn-small" onclick="removeChoice(${i})">✕</button>
    `;
    container.appendChild(item);

    renderChoiceVideoList(i, choice.video);
  });
}

function renderChoiceVideoList(index, currentVideo) {
  const list = document.getElementById('choice-video-list-' + index);
  if (!list) return;
  list.innerHTML = '';

  allVideos.forEach(video => {
    const item = document.createElement('div');
    item.className = 'video-list-item' + (video.name === currentVideo ? ' selected' : '');
    item.textContent = video.name;
    item.onclick = () => {
      document.getElementById('choice-video-' + index).value = video.name;
      updateChoiceVideo(index, video.name);
      list.style.display = 'none';
      renderChoicesEditor(config.scenes[document.getElementById('edit-scene-index').value].choices);
    };
    list.appendChild(item);
  });
}

function toggleChoiceVideoList(index) {
  const list = document.getElementById('choice-video-list-' + index);
  if (!list) return;
  list.style.display = list.style.display === 'none' ? 'block' : 'none';
}

function clearChoiceVideo(index) {
  document.getElementById('choice-video-' + index).value = '';
  updateChoiceVideo(index, '');
  renderChoicesEditor(config.scenes[document.getElementById('edit-scene-index').value].choices);
}

function updateChoiceColor(index, color) {
  const scene = config.scenes[document.getElementById('edit-scene-index').value];
  if (scene.choices && scene.choices[index]) {
    scene.choices[index].color = color;
  }
}

function updateChoiceLabel(index, label) {
  const scene = config.scenes[document.getElementById('edit-scene-index').value];
  if (scene.choices && scene.choices[index]) {
    scene.choices[index].label = label;
    scene.choices[index].id = label.toLowerCase().replace(/\s/g, '_');
  }
}

function updateChoiceVideo(index, video) {
  const scene = config.scenes[document.getElementById('edit-scene-index').value];
  if (scene.choices && scene.choices[index]) {
    scene.choices[index].video = video;
  }
}

function removeChoice(index) {
  const scene = config.scenes[document.getElementById('edit-scene-index').value];
  if (scene.choices) {
    scene.choices.splice(index, 1);
    renderChoicesEditor(scene.choices);
  }
}

function addChoice() {
  const scene = config.scenes[document.getElementById('edit-scene-index').value];
  if (!scene.choices) scene.choices = [];
  const color = scene.choices.length === 0 ? '#E91E63' : '#26A69A';
  scene.choices.push({
    id: 'choice_' + Date.now(),
    label: t('editModal.choiceLabel') + ' ' + (scene.choices.length + 1),
    color: color,
    video: '',
    videoDuration: 30,
    thumbnail: ''
  });
  renderChoicesEditor(scene.choices);
}

function saveSceneEdit() {
  const index = parseInt(document.getElementById('edit-scene-index').value);
  config.scenes[index].title = document.getElementById('edit-scene-title').value;
  config.scenes[index].type = document.getElementById('edit-scene-type').value;
  config.scenes[index].video = document.getElementById('edit-scene-video').value;
  config.scenes[index].image = document.getElementById('edit-scene-image').value;
  config.scenes[index].videoDuration = parseInt(document.getElementById('edit-scene-duration').value) || 30;
  config.scenes[index].limitTime = document.getElementById('edit-scene-limit-time').checked;

  closeEditSceneModal();
  renderScenes();
  markUnsaved();
}

// ===== ADD SCENE MODAL =====
function openAddSceneModal(defaultType) {
  document.getElementById('new-scene-title').value = '';
  document.getElementById('new-choice1-label').value = '';
  document.getElementById('new-choice2-label').value = '';

  const type = defaultType || 'linear';
  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.dataset.type === type) btn.classList.add('active');
  });

  document.getElementById('branching-setup').style.display = type === 'branching' ? 'block' : 'none';
  document.getElementById('add-scene-modal').classList.add('active');
}

function closeAddSceneModal() {
  document.getElementById('add-scene-modal').classList.remove('active');
}

function selectSceneType(btn) {
  document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  const type = btn.dataset.type;
  document.getElementById('branching-setup').style.display = type === 'branching' ? 'block' : 'none';
}

function addNewScene() {
  const title = document.getElementById('new-scene-title').value.trim();
  if (!title) {
    showToast(t('toast.enterTitle'), true);
    return;
  }

  const activeType = document.querySelector('.type-btn.active');
  const type = activeType ? activeType.dataset.type : 'linear';

  const newScene = {
    id: 'scene_' + Date.now(),
    title: title,
    type: type,
    video: '',
    videoDuration: 30,
    thumbnail: ''
  };

  if (type === 'branching') {
    const label1 = document.getElementById('new-choice1-label').value.trim() || t('addModal.defaultChoice1');
    const color1 = document.getElementById('new-choice1-color').value;
    const label2 = document.getElementById('new-choice2-label').value.trim() || t('addModal.defaultChoice2');
    const color2 = document.getElementById('new-choice2-color').value;

    newScene.choices = [
      { id: label1.toLowerCase().replace(/\s/g, '_'), label: label1, color: color1, video: '', videoDuration: 30, thumbnail: '' },
      { id: label2.toLowerCase().replace(/\s/g, '_'), label: label2, color: color2, video: '', videoDuration: 30, thumbnail: '' }
    ];
    newScene.votingDuration = 30;
    newScene.fallbackChoice = newScene.choices[0].id;
    newScene.description = t('addModal.chooseBetween') + ' ' + label1 + ' ' + t('addModal.and') + ' ' + label2;
  }

  config.scenes.push(newScene);
  closeAddSceneModal();
  renderScenes();
  markUnsaved();
  showToast(t('toast.sceneAdded') + ': ' + title);
}

// ===== VIDEO BROWSING =====
function renderVideoList(containerId, onSelect) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  if (allVideos.length === 0) {
    container.innerHTML = '<div class="video-list-item" style="color:#666">' + t('editModal.videoFile') + '</div>';
    return;
  }

  allVideos.forEach(video => {
    const item = document.createElement('div');
    item.className = 'video-list-item';
    item.textContent = video.name;
    item.onclick = () => onSelect(video.name);
    container.appendChild(item);
  });
}

function browseVideoForScene() {
  const list = document.getElementById('scene-video-list');
  list.style.display = list.style.display === 'none' ? 'block' : 'none';
}

function clearSceneVideo() {
  document.getElementById('edit-scene-video').value = '';
}

function browseImageForScene() {
  document.getElementById('edit-scene-image-input').click();
}

function handleImageSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  // Upload the image first
  const formData = new FormData();
  formData.append('image', file);
  
  fetch('/edit-show/api/upload-image', {
    method: 'POST',
    body: formData
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      document.getElementById('edit-scene-image').value = data.filename;
      // Auto-enable Limit Time for images and lock it
      enableLimitTimeForMedia();
      showToast('Image uploaded: ' + data.filename);
      loadImages();
    } else {
      showToast('Upload failed: ' + data.error, true);
    }
  })
  .catch(err => {
    showToast('Upload failed', true);
  });
  
  // Reset input
  event.target.value = '';
}

function clearSceneImage() {
  document.getElementById('edit-scene-image').value = '';
  // Check if there's still a video - if so, unlock the toggle
  const video = document.getElementById('edit-scene-video').value;
  if (!video) {
    disableLimitTime();
  } else {
    unlockLimitTime();
  }
}

function toggleLimitTime() {
  const checked = document.getElementById('edit-scene-limit-time').checked;
  const durationGroup = document.getElementById('duration-group');
  if (durationGroup) {
    durationGroup.style.display = checked ? 'block' : 'none';
  }
}

function enableLimitTimeForMedia() {
  const toggle = document.getElementById('edit-scene-limit-time');
  const durationGroup = document.getElementById('duration-group');
  toggle.checked = true;
  toggle.disabled = true;
  durationGroup.style.display = 'block';
}

function disableLimitTime() {
  const toggle = document.getElementById('edit-scene-limit-time');
  const durationGroup = document.getElementById('duration-group');
  toggle.checked = false;
  toggle.disabled = false;
  durationGroup.style.display = 'none';
}

function unlockLimitTime() {
  const toggle = document.getElementById('edit-scene-limit-time');
  toggle.disabled = false;
}

function checkMediaState() {
  const video = document.getElementById('edit-scene-video').value;
  const image = document.getElementById('edit-scene-image').value;
  
  if (image) {
    // Image present - force Limit Time ON and lock
    enableLimitTimeForMedia();
  } else if (video) {
    // Video only - unlock toggle
    unlockLimitTime();
  } else {
    // No media - disable Limit Time
    disableLimitTime();
  }
}

// ===== SCENE MANAGEMENT =====
function moveScene(index, direction) {
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= config.scenes.length) return;
  const temp = config.scenes[index];
  config.scenes[index] = config.scenes[newIndex];
  config.scenes[newIndex] = temp;
  renderScenes();
  markUnsaved();
}

function removeScene(index) {
  if (!confirm(t('toast.confirmDelete') + ' "' + config.scenes[index].title + '"?')) return;
  config.scenes.splice(index, 1);
  renderScenes();
  markUnsaved();
  showToast(t('toast.sceneDeleted'));
}

function duplicateScene(index) {
  const original = config.scenes[index];
  const clone = JSON.parse(JSON.stringify(original));
  clone.id = 'scene_' + Date.now();
  clone.title = original.title + ' (copy)';
  config.scenes.splice(index + 1, 0, clone);
  renderScenes();
  markUnsaved();
  showToast(t('toast.sceneDuplicated') + ': ' + original.title);
}

// ===== PREVIEW =====
let previewAutoEnded = false;

function previewVideo(filename) {
  if (!filename) return;
  previewAutoEnded = false;
  const modal = document.getElementById('preview-modal');
  const video = document.getElementById('preview-video');
  const label = document.getElementById('preview-filename');
  const title = document.getElementById('preview-title');
  video.src = '/assets/videos/' + filename;
  video.style.display = 'block';
  label.textContent = filename;
  title.textContent = t('preview.title') + ': ' + filename;
  modal.classList.add('active');

  video.onended = () => {
    previewAutoEnded = true;
  };
}

function previewImage(filename) {
  if (!filename) return;
  const modal = document.getElementById('preview-modal');
  const video = document.getElementById('preview-video');
  const label = document.getElementById('preview-filename');
  const title = document.getElementById('preview-title');
  video.src = '/assets/images/' + filename;
  video.style.display = 'block';
  label.textContent = filename;
  title.textContent = t('preview.title') + ': ' + filename;
  modal.classList.add('active');
}

function closePreview() {
  const modal = document.getElementById('preview-modal');
  const video = document.getElementById('preview-video');
  video.pause();
  video.src = '';
  modal.classList.remove('active');
}

// ===== SAVE =====
function markUnsaved() {
  hasUnsavedChanges = true;
  document.getElementById('save-status').textContent = t('toast.unsaved');
  document.getElementById('save-status').style.color = 'var(--sg-gold)';
  document.getElementById('save-status').style.background = 'rgba(255, 215, 0, 0.1)';
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(async () => {
    if (!hasUnsavedChanges) return;
    try { await saveConfig(); } catch (e) { console.error('Auto-save failed:', e); }
  }, 15000);
}

async function saveConfig() {
  config.showName = document.getElementById('showName').value;
  config.showSubtitle = document.getElementById('showSubtitle').value;
  config.venue = document.getElementById('venue').value;
  config.showDate = document.getElementById('showDate').value;
  config.showTime = document.getElementById('showTime').value;

  const res = await fetch('/edit-show/api/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config)
  });
  const data = await res.json();
  if (data.success) {
    hasUnsavedChanges = false;
    showToast(t('toast.saved'));
    config = data.config;
    renderScenes();
    document.getElementById('save-status').textContent = t('saved');
    document.getElementById('save-status').style.color = 'var(--sg-teal)';
    document.getElementById('save-status').style.background = 'rgba(38, 166, 154, 0.1)';
  } else {
    showToast(t('toast.saveError') + ': ' + data.error, true);
  }
}

// ===== TOAST =====
function showToast(msg, isError) {
  const toast = document.createElement('div');
  toast.className = 'toast' + (isError ? ' error' : '');
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ===== UPLOAD =====
const uploadArea = document.getElementById('upload-area');
const videoInput = document.getElementById('video-input');

uploadArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadArea.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', () => {
  uploadArea.classList.remove('dragover');
});

uploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadArea.classList.remove('dragover');
  if (e.dataTransfer.files.length) uploadFile(e.dataTransfer.files[0]);
});

videoInput.addEventListener('change', () => {
  if (videoInput.files.length) uploadFile(videoInput.files[0]);
});

async function uploadFile(file) {
  const progress = document.getElementById('upload-progress');
  const progressFill = document.getElementById('progress-fill');
  const progressText = document.getElementById('progress-text');

  progress.style.display = 'block';
  progressText.textContent = t('upload.uploading') + ' ' + file.name + '...';
  progressFill.style.width = '0%';

  const formData = new FormData();
  formData.append('video', file);

  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/edit-show/api/upload-video');

  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) {
      const percent = Math.round((e.loaded / e.total) * 100);
      progressFill.style.width = percent + '%';
      progressText.textContent = t('upload.uploading') + ' ' + file.name + ' (' + percent + '%)';
    }
  };

  xhr.onload = async () => {
    const data = JSON.parse(xhr.responseText);
    if (data.success) {
      showToast(t('upload.complete') + ': ' + data.filename);
      await loadVideos();
      renderScenes();
    } else {
      showToast(t('upload.failed') + ': ' + data.error, true);
    }
    progress.style.display = 'none';
  };

  xhr.onerror = () => {
    showToast(t('upload.failed'), true);
    progress.style.display = 'none';
  };

  xhr.send(formData);
}

// ===== IMAGE UPLOAD =====
const uploadAreaImage = document.getElementById('upload-area-image');
const imageInput = document.getElementById('image-input');

if (uploadAreaImage) {
  uploadAreaImage.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadAreaImage.classList.add('dragover');
  });

  uploadAreaImage.addEventListener('dragleave', () => {
    uploadAreaImage.classList.remove('dragover');
  });

  uploadAreaImage.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadAreaImage.classList.remove('dragover');
    if (e.dataTransfer.files.length) uploadImageFile(e.dataTransfer.files[0]);
  });
}

if (imageInput) {
  imageInput.addEventListener('change', () => {
    if (imageInput.files.length) uploadImageFile(imageInput.files[0]);
  });
}

async function uploadImageFile(file) {
  const progress = document.getElementById('image-upload-progress');
  const progressFill = document.getElementById('image-progress-fill');
  const progressText = document.getElementById('image-progress-text');

  progress.style.display = 'block';
  progressText.textContent = 'Uploading ' + file.name + '...';
  progressFill.style.width = '0%';

  const formData = new FormData();
  formData.append('image', file);

  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/edit-show/api/upload-image');

  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) {
      const percent = Math.round((e.loaded / e.total) * 100);
      progressFill.style.width = percent + '%';
      progressText.textContent = 'Uploading ' + file.name + ' (' + percent + '%)';
    }
  };

  xhr.onload = async () => {
    const data = JSON.parse(xhr.responseText);
    if (data.success) {
      showToast('Image uploaded: ' + data.filename);
      await loadImages();
    } else {
      showToast('Upload failed: ' + data.error, true);
    }
    progress.style.display = 'none';
  };

  xhr.onerror = () => {
    showToast('Upload failed', true);
    progress.style.display = 'none';
  };

  xhr.send(formData);
}

// ===== CHECK VIDEOS =====
async function checkVideos() {
  const results = [];
  const allVideoRefs = [];

  config.scenes.forEach((scene, i) => {
    if (scene.video) {
      allVideoRefs.push({ scene: scene.title, type: 'scene', video: scene.video, index: i });
    }
    if (scene.choices) {
      scene.choices.forEach(c => {
        if (c.video) {
          allVideoRefs.push({ scene: scene.title, type: 'choice', label: c.label, video: c.video, index: i });
        }
      });
    }
  });

  showToast(t('toast.checking') + ' ' + allVideoRefs.length + ' videos...');

  for (const ref of allVideoRefs) {
    const exists = allVideos.some(v => v.name.toLowerCase() === ref.video.toLowerCase());
    let playable = false;

    if (exists) {
      playable = await new Promise(resolve => {
        const v = document.createElement('video');
        v.preload = 'metadata';
        v.onloadedmetadata = () => {
          resolve(v.duration > 0);
          v.src = '';
        };
        v.onerror = () => {
          resolve(false);
          v.src = '';
        };
        v.src = '/assets/videos/' + ref.video;
        setTimeout(() => { resolve(false); v.src = ''; }, 3000);
      });
    }

    results.push({
      ...ref,
      exists,
      playable,
      status: !exists ? 'missing' : (playable ? 'ok' : 'broken')
    });
  }

  showCheckResults(results);
}

function showCheckResults(results) {
  const ok = results.filter(r => r.status === 'ok').length;
  const missing = results.filter(r => r.status === 'missing').length;
  const broken = results.filter(r => r.status === 'broken').length;

  let html = '<div class="check-summary">';
  html += '<span class="check-ok">✓ ' + ok + ' ' + t('check.ok') + '</span>';
  html += '<span class="check-missing">✗ ' + missing + ' ' + t('check.missing') + '</span>';
  html += '<span class="check-broken">⚠ ' + broken + ' ' + t('check.broken') + '</span>';
  html += '</div>';
  html += '<div class="check-list">';

  results.forEach(r => {
    const icon = r.status === 'ok' ? '✓' : (r.status === 'missing' ? '✗' : '⚠');
    const cls = 'check-' + r.status;
    const type = r.type === 'choice' ? ' (' + r.label + ')' : '';
    html += '<div class="check-item ' + cls + '">';
    html += '<span class="check-icon">' + icon + '</span>';
    html += '<span class="check-scene">' + r.scene + type + '</span>';
    html += '<span class="check-file">' + r.video + '</span>';
    html += '</div>';
  });

  html += '</div>';

  document.getElementById('check-results-body').innerHTML = html;
  document.getElementById('check-modal').classList.add('active');
}

function closeCheckModal() {
  document.getElementById('check-modal').classList.remove('active');
}

// ===== TYPE CHANGE HANDLER =====
document.getElementById('edit-scene-type').addEventListener('change', function() {
  const branchingOpts = document.getElementById('branching-options');
  if (this.value === 'branching') {
    branchingOpts.style.display = 'block';
    const index = parseInt(document.getElementById('edit-scene-index').value);
    const scene = config.scenes[index];
    if (!scene.choices || scene.choices.length === 0) {
      scene.choices = [
        { id: 'choice_a', label: t('addModal.defaultChoice1'), color: '#E91E63', video: '', videoDuration: 30 },
        { id: 'choice_b', label: t('addModal.defaultChoice2'), color: '#26A69A', video: '', videoDuration: 30 }
      ];
    }
    renderChoicesEditor(scene.choices);
  } else {
    branchingOpts.style.display = 'none';
  }
});

// ===== EXPORT CONFIG =====
function exportConfig() {
  const dataStr = JSON.stringify(config, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'show-config-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast(t('toast.exported'));
}

// ===== IMPORT CONFIG =====
function importConfig() {
  document.getElementById('import-input').click();
}

function handleImport(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const imported = JSON.parse(e.target.result);
      if (!imported.scenes || !Array.isArray(imported.scenes)) {
        showToast(t('toast.importError'), true);
        return;
      }
      if (!confirm(t('toast.imported'))) return;
      config = imported;
      document.getElementById('showName').value = config.showName || '';
      document.getElementById('showSubtitle').value = config.showSubtitle || '';
      document.getElementById('venue').value = config.venue || '';
      document.getElementById('showDate').value = config.showDate || '';
      document.getElementById('showTime').value = config.showTime || '';
      renderScenes();
      markUnsaved();
      showToast(t('toast.imported') + ': ' + config.scenes.length + ' ' + t('scenes.count'));
    } catch (err) {
      showToast(t('toast.importError') + ': ' + err.message, true);
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

// ===== BULK UPLOAD =====
const uploadAreaBulk = document.getElementById('upload-area-bulk');
const videoInputBulk = document.getElementById('video-input-bulk');
let uploadQueue = [];
let isUploading = false;

uploadAreaBulk.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadAreaBulk.classList.add('dragover');
});

uploadAreaBulk.addEventListener('dragleave', () => {
  uploadAreaBulk.classList.remove('dragover');
});

uploadAreaBulk.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadAreaBulk.classList.remove('dragover');
  const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('video/'));
  if (files.length) addFilesToQueue(files);
});

videoInputBulk.addEventListener('change', () => {
  const files = Array.from(videoInputBulk.files);
  if (files.length) addFilesToQueue(files);
  videoInputBulk.value = '';
});

function addFilesToQueue(files) {
  files.forEach(file => {
    uploadQueue.push({ file, status: 'pending', name: file.name });
  });
  renderUploadQueue();
  if (!isUploading) processQueue();
}

function renderUploadQueue() {
  const queue = document.getElementById('upload-queue');
  if (uploadQueue.length === 0) {
    queue.innerHTML = '';
    return;
  }

  queue.innerHTML = uploadQueue.map((item, i) => `
    <div class="upload-queue-item">
      <span class="file-name">${item.name}</span>
      <span class="file-status ${item.status}">${item.status}</span>
    </div>
  `).join('');
}

async function processQueue() {
  if (isUploading || uploadQueue.length === 0) return;
  isUploading = true;

  const progress = document.getElementById('upload-progress');
  const progressFill = document.getElementById('progress-fill');
  const progressText = document.getElementById('progress-text');
  progress.style.display = 'block';

  for (let i = 0; i < uploadQueue.length; i++) {
    const item = uploadQueue[i];
    if (item.status !== 'pending') continue;

    item.status = 'uploading';
    renderUploadQueue();

    const total = uploadQueue.length;
    const done = uploadQueue.filter(q => q.status === 'done').length;
    progressFill.style.width = Math.round((done / total) * 100) + '%';
    progressText.textContent = `${t('upload.uploading')} ${done + 1}/${total}: ${item.name}`;

    try {
      const formData = new FormData();
      formData.append('video', item.file);
      const res = await fetch('/edit-show/api/upload-video', { method: 'POST', body: formData });
      const data = await res.json();
      item.status = data.success ? 'done' : 'error';
    } catch (err) {
      item.status = 'error';
    }

    renderUploadQueue();
  }

  progressFill.style.width = '100%';
  progressText.textContent = t('upload.complete');
  setTimeout(() => { progress.style.display = 'none'; }, 2000);

  const doneCount = uploadQueue.filter(q => q.status === 'done').length;
  const errorCount = uploadQueue.filter(q => q.status === 'error').length;
  showToast(t('upload.complete') + ' ' + doneCount + ' ' + t('upload.files') + (errorCount > 0 ? ', ' + errorCount + ' ' + t('upload.failed') : ''));

  uploadQueue = [];
  renderUploadQueue();
  await loadVideos();
  renderScenes();
  isUploading = false;
}

// ===== LOAD =====
loadConfig().then(() => loadVideos());
