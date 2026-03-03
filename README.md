# AnimeStudio — 2D Animation Workflow Platform

A web-based platform for creating 2D character animations. Upload Photoshop (`.psd`) files, build custom characters from extracted layers, then compose animated scenes using a **node-based workflow editor** with keyframe animation and MP4 export.

## Features

### Character Asset Pipeline
- **PSD Parsing** — Automatically extracts nested groups and layers from `.psd` files using `psd-tools`.
- **Smart Deduplication** — Hashes extracted layer images (MD5/SHA-256) to prevent duplicate assets.
- **Library Organizer** — Create custom categories (Face, Body, Hair…), assign Z-indexes, and organize layers into subfolders via drag & drop.
- **Dressing Room** — Mix & match character parts with visual preview and one-click PNG export.

### Workflow Video Pipeline
- **Node Graph Editor** — React Flow-based editor with Character, Background, and Scene Output nodes.
- **Keyframe Animation** — CapCut-style position keyframes: scrub timeline → drag character → auto-create keyframe with smooth interpolation.
- **Multi-Track Timeline** — Time ruler, per-character tracks, diamond keyframe markers ◇, and playhead scrubbing.
- **Preview Canvas** — Real-time 800×450 preview with layer stacking and playback controls.
- **Export MP4** — Server-side FFmpeg render from workflow data.

### AI Agent Team (Experimental)
- **Director Agent** — Interprets text prompts and creates scene plans.
- **Builder Agent** — Translates scene plans into workflow nodes.
- **Reviewer Agent** — Vision AI analyzes scene previews and suggests corrections.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, Vite, TypeScript, Zustand, TailwindCSS 4 |
| **Node Editor** | React Flow (`@xyflow/react`) |
| **Canvas** | PixiJS 8 |
| **Backend** | Python 3, FastAPI, Uvicorn, psd-tools, Pillow |
| **Database** | SQLAlchemy + SQLite (aiosqlite) |
| **Video Export** | FFmpeg (server-side) |

## Setup & Installation

**1. Clone the repository:**
```bash
git clone https://github.com/khoatuan2006-eng/214Studio.git
cd 214Studio
```

**2. Install Backend:**
```bash
pip install -r requirements.txt
```

**3. Install Frontend:**
```bash
cd frontend-react
npm install
```

**4. Run:**
```bash
# Terminal 1 — Backend
cd backend
python main.py
# → http://localhost:8001

# Terminal 2 — Frontend
cd frontend-react
npm run dev
# → http://localhost:5173
```

## Usage

1. **Base Characters** — Upload `.psd` files, organize extracted layers into categories.
2. **Dressing Room** — Mix & match character parts to build avatars.
3. **Workflow** — Create node graphs: connect Character + Background → Scene Output. Add keyframe animations, preview in real-time, and export to MP4.

## Project Structure

```
AnimeStudio/
├── backend/                 # FastAPI server
│   ├── main.py              # API endpoints
│   ├── core/                # Business logic
│   │   ├── agents/          # AI agents (Director, Builder, Reviewer)
│   │   ├── psd_processor.py # PSD parsing
│   │   ├── models.py        # SQLAlchemy models
│   │   └── ...
│   └── data/                # JSON databases
├── frontend-react/          # React + Vite app
│   └── src/
│       ├── components/      # UI components
│       │   ├── workflow/    # Node editor + preview
│       │   ├── timeline/    # Multi-track timeline
│       │   └── ui/          # Shared UI components
│       ├── store/           # Zustand stores
│       ├── core/            # Engine (executor, renderer)
│       └── hooks/           # Custom React hooks
├── scripts/                 # Utility scripts
└── requirements.txt         # Python dependencies
```

---

*Maintainer: [@khoatuan2006-eng](https://github.com/khoatuan2006-eng)*
