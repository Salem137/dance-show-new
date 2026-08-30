# TouchDesigner OSC Integration Guide

This guide explains how to set up TouchDesigner to receive OSC commands from the voting server and trigger video playback.

## Overview

The Node.js server sends OSC messages to TouchDesigner over UDP. TouchDesigner receives these messages and triggers the appropriate video.

## Network Configuration

- **Protocol**: OSC (Open Sound Control) over UDP
- **Default Port**: 3333
- **Host**: 127.0.0.1 (localhost) — both server and TouchDesigner run on the same machine

## Step 1: Set Up OSC In DAT

1. Open TouchDesigner
2. Create a new **OSC In DAT** operator
3. Set the **Address** to `127.0.0.1`
4. Set the **Port** to `3333`
5. The DAT will now receive all incoming OSC messages

## Step 2: Parse OSC Messages

Create a **DAT Execute** or **Text DAT** to parse incoming messages:

```
# OSC Message Formats:
/play/video/1    → Play video choice 1
/play/video/2    → Play video choice 2
/play/video/3    → Play video choice 3
/scene/start     → Scene transition signal
/voting/start    → Voting window opened
/voting/end      → Voting window closed
```

## Step 3: Video Switching with Switch TOP

### Method A: Using Switch TOP

1. Load all your video files as **Movie File In TOP** operators
2. Create a **Switch TOP** and connect all video inputs
3. Map OSC messages to switch index:
   - `/play/video/1` → index 0
   - `/play/video/2` → index 1
   - `/play/video/3` → index 2
4. Connect Switch TOP output to your **projector output**

### Method B: Using Select TOP with Index

1. Store videos in a **Multi-Select** or container
2. Use a **Select TOP** with an index parameter driven by OSC
3. Route to output

## Step 4: Create a Simple Switch Network

```
Movie File In 1 (joy.mp4)     ──┐
Movie File In 2 (sorrow.mp4)  ──┼── Switch TOP ── Output
Movie File In 3 (urban.mp4)   ──┘
```

## Step 5: Python Script for OSC Processing

Add this to a **Text DAT** set to "Callback" mode:

```python
def onReceiveOSC(address, *args):
    """
    Called when an OSC message is received.
    """
    print(f"OSC Received: {address} {args}")

    if address.startswith("/play/video/"):
        video_index = int(address.split("/")[-1]) - 1
        # Set Switch TOP index
        op('switch1').par.index = video_index
        print(f"Switching to video index: {video_index}")

    elif address == "/scene/start":
        print("Scene transition triggered")

    elif address == "/voting/start":
        print("Voting opened - show QR overlay")

    elif address == "/voting/end":
        print("Voting closed - hide QR overlay")
```

## Step 6: Test OSC Connection

Run the voting server and use the admin panel's OSC Controls to send test messages:

1. Start the server: `npm start`
2. Open admin panel: `http://localhost:3000/admin/`
3. Use the OSC Controls panel to send test messages
4. Verify TouchDesigner receives them

## TouchDesigner Network Layout

```
┌─────────────────────────────────────────────┐
│                TouchDesigner                 │
│                                             │
│  OSC In DAT (port 3333)                     │
│       │                                     │
│       ▼                                     │
│  DAT Execute (parse messages)               │
│       │                                     │
│       ▼                                     │
│  Switch TOP ←── Movie File In (videos)      │
│       │                                     │
│       ▼                                     │
│  Output (Projector/Display)                 │
│                                             │
└─────────────────────────────────────────────┘
```

## Video File Organization

Place your video files in the `assets/videos/` folder:

```
assets/
  videos/
    scene1_joy.mp4
    scene1_sorrow.mp4
    scene2_urban.mp4
    scene2_forest.mp4
    scene2_sea.mp4
    scene3_standing.mp4
    scene3_letgo.mp4
    scene4_slow.mp4
    scene4_fast.mp4
    scene4_wild.mp4
    scene5_triumph.mp4
    scene5_reflection.mp4
    scene5_mystery.mp4
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| No OSC messages received | Check port number matches (3333) |
| Videos don't switch | Verify Switch TOP index mapping |
| Lag/delay | Ensure both run on same machine (localhost) |
| Connection refused | Check firewall allows UDP on port 3333 |

## Advanced: Multi-Machine Setup

If the server and TouchDesigner are on different machines:

1. Update `show.json`:
   ```json
   "osc": {
     "host": "192.168.1.100",
     "port": 3333
   }
   ```
2. Ensure both machines are on the same network
3. Open UDP port 3333 in firewall
