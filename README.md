# Interactive Dance Show - Voting System

An audience-driven, branching narrative dance performance system. The audience votes in real-time via their phones to decide which video path plays on stage through TouchDesigner.

## Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher)
- [TouchDesigner](https://derivative.ca/) (for video playback)
- A WiFi network for audience phones

### Installation

```bash
cd dance-show/server
npm install
```

### Run the System

```bash
npm start
```

This starts the server and displays all URLs:

```
╔══════════════════════════════════════════════════╗
║       DANCE SHOW VOTING SYSTEM STARTED          ║
╠══════════════════════════════════════════════════╣
║  Show Website:  http://192.168.1.5:3000/public/ ║
║  Voting Client: http://192.168.1.5:3000/client/ ║
║  Admin Panel:   http://192.168.1.5:3000/admin/  ║
║  QR Code Page:  http://192.168.1.5:3000/qr      ║
╠══════════════════════════════════════════════════╣
║  OSC Target:    127.0.0.1:3333                  ║
╚══════════════════════════════════════════════════╝
```

## System URLs

| URL | Purpose |
|-----|---------|
| `http://YOUR_IP:3000/public/` | Promotional website for the show |
| `http://YOUR_IP:3000/client/` | Audience voting page (mobile) |
| `http://YOUR_IP:3000/admin/` | Admin control panel |
| `http://YOUR_IP:3000/qr` | QR code display for audience |

## Project Structure

```
dance-show/
├── server/                 # Node.js backend
│   ├── server.js           # Main server (Express + Socket.IO)
│   ├── show-state.js       # Show state manager
│   ├── osc-client.js       # OSC message sender
│   ├── routes/
│   │   ├── api.js          # Public API routes
│   │   └── admin.js        # Admin control routes
│   └── config/
│       └── show.json       # Show configuration
├── client/                 # Audience voting interface
│   ├── index.html          # Voting page
│   ├── style.css           # Mobile-optimized styles
│   └── vote.js             # Voting logic
├── admin/                  # Admin control panel
│   ├── index.html          # Dashboard
│   ├── style.css           # Dashboard styles
│   └── admin.js            # Dashboard logic
├── public/                 # Promotional website
│   ├── index.html          # Landing page
│   └── style.css           # Website styles
├── assets/
│   ├── videos/             # Video files for each path
│   ├── audio/              # Music/sound files
│   └── images/             # Visual assets
└── TOUCHDESIGNER_GUIDE.md  # TouchDesigner setup guide
```

## How It Works

1. **Audience scans QR code** → opens voting page on phone
2. **Admin opens voting** → audience sees choices on their phones
3. **Audience votes** → real-time vote counts update
4. **Voting ends** → winner is determined
5. **Server sends OSC** → TouchDesigner receives command
6. **Video plays** → corresponding video plays on stage

## Show Configuration

Edit `server/config/show.json` to configure your show:

```json
{
  "showName": "My Dance Show",
  "scenes": [
    {
      "id": "scene_1",
      "title": "The Opening",
      "choices": [
        { "id": 1, "label": "Joy", "color": "#FFD700", "video": "scene1_joy.mp4" },
        { "id": 2, "label": "Sorrow", "color": "#4169E1", "video": "scene1_sorrow.mp4" }
      ],
      "votingDuration": 15
    }
  ],
  "osc": {
    "host": "127.0.0.1",
    "port": 3333
  }
}
```

## TouchDesigner Setup

See [TOUCHDESIGNER_GUIDE.md](./TOUCHDESIGNER_GUIDE.md) for detailed setup instructions.

**Quick Setup:**
1. Add an **OSC In DAT** listening on port 3333
2. Route messages to a **Switch TOP** connected to your videos
3. Map `/play/video/1` → index 0, `/play/video/2` → index 1, etc.

## Show Day Checklist

- [ ] Start the voting server (`npm start`)
- [ ] Open TouchDesigner and load your project
- [ ] Open admin panel on your control computer
- [ ] Display QR codes for audience to scan
- [ ] Test OSC connection with admin panel
- [ ] Start the show!

## Zero Budget

Everything runs locally on your laptop:
- Server: Local Node.js
- Voting: Audience uses their own phones + data
- Hosting: No cloud hosting needed
- QR codes: Generated automatically

## License

MIT
