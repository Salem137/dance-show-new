const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto');
const QRCode = require('qrcode');

const ShowState = require('./show-state');
const apiRoutes = require('./routes/api');
const adminRoutes = require('./routes/admin');

const showState = new ShowState();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  pingInterval: 10000,
  pingTimeout: 5000
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===== AUTH MIDDLEWARE =====
const sessions = new Map();

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function authMiddleware(req, res, next) {
  const token = req.cookies?.admin_token;
  if (token && sessions.has(token)) {
    return next();
  }
  // Allow login endpoint and login page
  if (req.path === '/api/login' || req.path === '/login.html' || req.path === '/login') {
    return next();
  }
  // Allow static files (CSS, JS, images)
  if (req.path.match(/\.(css|js|png|jpg|gif|ico|svg|woff|woff2)$/)) {
    return next();
  }
  // Redirect to login
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.redirect('/admin/login.html');
}

// Cookie parser middleware
app.use((req, res, next) => {
  req.cookies = {};
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    cookieHeader.split(';').forEach(cookie => {
      const [name, ...rest] = cookie.split('=');
      req.cookies[name.trim()] = rest.join('=').trim();
    });
  }
  next();
});

// Admin login endpoint
app.post('/admin/api/login', (req, res) => {
  const { password } = req.body;
  const adminPassword = showState.config.adminPassword || 'admin';

  if (password === adminPassword) {
    const token = generateToken();
    sessions.set(token, { created: Date.now(), ip: req.ip });
    res.setHeader('Set-Cookie', `admin_token=${token}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=86400`);
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, error: 'Invalid password' });
  }
});

// Admin logout
app.get('/admin/api/logout', (req, res) => {
  const token = req.cookies?.admin_token;
  if (token) sessions.delete(token);
  res.setHeader('Set-Cookie', 'admin_token=; Path=/admin; HttpOnly; Max-Age=0');
  res.redirect('/admin/login.html');
});

app.use('/client', express.static(path.join(__dirname, '..', 'client')));
app.use('/public', express.static(path.join(__dirname, '..', 'public')));
app.use('/stage', express.static(path.join(__dirname, '..', 'stage')));
app.use('/edit-show', express.static(path.join(__dirname, '..', 'edit-show')));
app.use('/assets', express.static(path.join(__dirname, '..', 'assets'), {
  maxAge: '7d',
  etag: true,
  lastModified: true,
  setHeaders: (res, path) => {
    if (path.endsWith('.jpg') || path.endsWith('.jpeg') || path.endsWith('.png') || path.endsWith('.webp') || path.endsWith('.gif')) {
      res.setHeader('Cache-Control', 'public, max-age=604800');
    }
  }
}));

// Admin static files - protected
app.use('/admin', authMiddleware, express.static(path.join(__dirname, '..', 'admin')));

app.use('/api', apiRoutes(showState, io));
app.use('/admin/api', authMiddleware, adminRoutes(showState, io));
app.use('/edit-show/api', require('./routes/edit-show')(showState));

app.get('/', (req, res) => {
  res.redirect('/public/');
});

app.get('/qr', async (req, res) => {
  try {
    const ip = getLocalIP();
    const url = `http://${ip}:${showState.config.server?.port || 3000}/client/`;
    const qr = await QRCode.toDataURL(url, { width: 400, margin: 2 });
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Scan to Vote</title>
        <style>
          body { display: flex; flex-direction: column; align-items: center; justify-content: center;
                 min-height: 100vh; margin: 0; background: #111; color: white; font-family: Arial; }
          img { width: 300px; margin: 20px; }
          h1 { font-size: 2em; }
          p { font-size: 1.2em; color: #aaa; }
        </style>
      </head>
      <body>
        <h1>Scan to Vote</h1>
        <img src="${qr}" alt="QR Code" />
        <p>Open your phone camera and scan this code</p>
        <p style="color: #666; font-size: 0.9em;">${url}</p>
      </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send('Error generating QR code');
  }
});

app.get('/qr-control', async (req, res) => {
  try {
    const ip = getLocalIP();
    const url = `http://${ip}:${showState.config.server?.port || 3000}/public/control-panel.html`;
    const qr = await QRCode.toDataURL(url, { width: 400, margin: 2 });
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>QR Control Panel</title>
        <style>
          body { display: flex; flex-direction: column; align-items: center; justify-content: center;
                 min-height: 100vh; margin: 0; background: #0A0A0F; color: white; font-family: Arial; }
          img { width: 300px; margin: 20px; border-radius: 16px; }
          h1 { font-size: 2em; color: #FFD700; }
          p { font-size: 1.2em; color: #aaa; }
          .url { color: #26A69A; font-size: 0.9em; margin-top: 10px; }
        </style>
      </head>
      <body>
        <h1>QR Control Panel</h1>
        <img src="${qr}" alt="QR Code" />
        <p>Scan to open Control Panel on your phone</p>
        <p class="url">${url}</p>
      </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send('Error generating QR code');
  }
});

io.on('connection', (socket) => {
  socket.clientType = 'unknown';

  console.log(`[WS] Client connected: ${socket.id}`);
  socket.emit('show_state', showState.getState());

  socket.on('register', (type) => {
    const validTypes = ['voter', 'admin', 'stage', 'editor'];
    if (!validTypes.includes(type)) return;

    socket.clientType = type;
    showState.connections[type + 's']++;

    if (type === 'stage') {
      socket.join('stage');
    }

    console.log(`[WS] ${socket.id} registered as ${type} (Voters: ${showState.connections.voters}, Admins: ${showState.connections.admins}, Stages: ${showState.connections.stages})`);
    io.emit('connection_counts', showState.connections);
  });

  socket.on('stage_video_ended', () => {
    console.log('[WS] Stage reported video ended');
    showState.clearAutoTimers();
    if (typeof showState.onVideoEnded === 'function') {
      showState.onVideoEnded();
    }
  });

  socket.on('vote', (choiceId) => {
    if (showState.votingOpen) {
      const success = showState.castVote(choiceId);
      if (success) {
        const scene = showState.getCurrentScene();
        const voteCounts = showState.getVoteCounts();
        const totalVotes = showState.getTotalVotes();
        io.emit('vote_update', { sceneId: scene.id, votes: voteCounts, totalVotes });
        socket.emit('vote_confirmed', { choiceId, sceneId: scene.id });
        console.log(`[VOTE] ${choiceId} in ${scene.id} (Total: ${totalVotes})`);
      }
    }
  });

  socket.on('category_vote', (categoryId) => {
    if (showState.votingOpen) {
      const success = showState.castCategoryVote(categoryId);
      if (success) {
        const voteCounts = showState.getCategoryVoteCounts();
        const totalVotes = showState.getTotalCategoryVotes();
        io.emit('category_vote_update', { votes: voteCounts, totalVotes });
        socket.emit('category_vote_confirmed', { categoryId });
        console.log(`[CATEGORY_VOTE] ${categoryId} (Total: ${totalVotes})`);
      }
    }
  });

  socket.on('accumulative_vote', (data) => {
    if (showState.accumulativeVotingOpen) {
      const { battleId, voteType } = data;
      const success = showState.castAccumulativeVote(battleId, voteType);
      if (success) {
        io.emit('accumulative_vote_update', { battleId, votes: showState.battleVotes[battleId] });
        socket.emit('accumulative_vote_confirmed', { battleId, voteType });
        const v = showState.battleVotes[battleId];
        console.log(`[ACC_VOTE] ${battleId}: yes=${v.yes} no=${v.no}`);
      }
    }
  });

  socket.on('play_now', (data) => {
    if (!['admin', 'editor'].includes(socket.clientType)) return;
    const { sceneId, sceneIndex } = data;
    console.log(`[PLAY_NOW] Admin ${socket.id} playing scene: ${sceneId} (index: ${sceneIndex})`);
    io.emit('stage_scene_changed', { sceneId, sceneIndex });
  });

  socket.on('blackout', (data) => {
    if (!['admin', 'editor'].includes(socket.clientType)) return;
    const { active } = data;
    console.log(`[BLACKOUT] Admin ${socket.id} set blackout: ${active}`);
    io.emit('blackout_state', { active });
  });

  socket.on('sfx_trigger', (data) => {
    if (!['admin', 'editor'].includes(socket.clientType)) return;
    const { type } = data;
    console.log(`[SFX] Admin ${socket.id} triggered: ${type}`);
    io.to('stage').emit('play_sfx', { type });
    io.emit('sfx_playing', { type, triggeredBy: socket.id });
  });

  socket.on('disconnect', () => {
    const type = socket.clientType;
    if (type !== 'unknown') {
      showState.connections[type + 's'] = Math.max(0, showState.connections[type + 's'] - 1);
    }
    console.log(`[WS] ${socket.id} disconnected (${type}) (Voters: ${showState.connections.voters}, Admins: ${showState.connections.admins}, Stages: ${showState.connections.stages})`);
    io.emit('connection_counts', showState.connections);
  });
});

function getLocalIP() {
  const os = require('os');
  const interfaces = os.networkInterfaces();
  
  // Skip virtual/VMware adapters
  const skipPatterns = ['VMware', 'Virtual', 'Loopback', 'Teredo', 'isatap', 'Bluetooth'];
  
  function isRealAdapter(name) {
    return !skipPatterns.some(p => name.includes(p));
  }
  
  // First: look for common home network IPs (192.168.1.x or 192.168.0.x) on real adapters
  for (const name of Object.keys(interfaces)) {
    if (!isRealAdapter(name)) continue;
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        if (iface.address.startsWith('192.168.1.') || iface.address.startsWith('192.168.0.')) {
          return iface.address;
        }
      }
    }
  }
  
  // Second: prefer Ethernet over Wi-Fi on real adapters
  const preferred = ['Ethernet', 'eth0'];
  for (const pref of preferred) {
    if (interfaces[pref]) {
      for (const iface of interfaces[pref]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }
  }
  
  // Third: any 192.168.x.x address on real adapters
  for (const name of Object.keys(interfaces)) {
    if (!isRealAdapter(name)) continue;
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        if (iface.address.startsWith('192.168.')) {
          return iface.address;
        }
      }
    }
  }

  // Fallback: any non-internal IPv4
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }

  return 'localhost';
}

app.post('/admin/api/shutdown', (req, res) => {
  res.json({ success: true, message: 'Server shutting down...' });
  setTimeout(() => process.exit(0), 500);
});

const PORT = showState.config.server.port || 3000;
server.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIP();
  console.log('');
  console.log('═══════════════════════════════════════════════');
  console.log('         DANCE SHOW - WEB SYSTEM               ');
  console.log('═══════════════════════════════════════════════');
  console.log(`  Stage View:    http://${ip}:${PORT}/stage`);
  console.log(`  Admin Panel:   http://${ip}:${PORT}/admin/`);
  console.log(`  Edit Show:     http://${ip}:${PORT}/edit-show/`);
  console.log(`  Voting Client: http://${ip}:${PORT}/client/`);
  console.log(`  QR Code:       http://${ip}:${PORT}/qr`);
  console.log('═══════════════════════════════════════════════');
  console.log('');
});
