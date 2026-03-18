[![Platform](https://img.shields.io/badge/platform-web%2Fbrowser-brightgreen)](https://github.com/William9923/mov-web)
[![License](https://img.shields.io/badge/license-GPL--3.0-blue)](LICENSE)
[![Live Demo](https://img.shields.io/badge/demo-live-brightgreen)](https://mov-web-viewer.vercel.app/)

# mov-web

> **[🌐 Live Demo → mov-web-viewer.vercel.app](https://mov-web-viewer.vercel.app/)**

A browser-based movie & TV streaming frontend for [FlixHQ](https://flixhq.to/).

> This project explores building a web-based streaming interface as a learning exercise in agent-based coding workflows.

## ⚠️ Disclaimer

This is an **exploratory/learning project** for educational purposes only.

- Built as an experiment in agent-assisted development — not intended for production use
- Content is sourced from the FlixHQ platform
- Use at your own risk
- Not affiliated with or endorsed by FlixHQ

## Table of Contents

- [Features](#-features)
- [Quick Start](#-quick-start)
- [Player Controls](#-player-controls)
- [Tech Stack](#-tech-stack)
- [How Streaming Works](#-how-streaming-works-hls)
- [API Reference](#-api-reference)
- [Similar Projects](#-similar-projects)

## ✨ Features

- Search movies and TV shows by title
- Season & episode browser with watched progress tracking
- HLS video streaming with quality selection (Auto / 1080p / 720p / 480p / 360p)
- Multi-language subtitle support
- Watch history saved locally (localStorage)
- Watched indicator on search results (movies: ✓ Watched · TV: ✓ N ep)
- Forced dark theme — always

## 🚀 Quick Start

**Requires Node.js 18+. No `npm install` needed.**

```bash
git clone https://github.com/William9923/mov-web.git
cd mov-web
node server.js
```

Open [http://localhost:3000](http://localhost:3000)

```bash
# Custom port
PORT=8080 node server.js
```

### Deploy to Vercel

1. Push to GitHub
2. Go to [vercel.com/new](https://vercel.com/new) → import your repo
3. Framework preset: **Other** — leave all build settings blank
4. Click **Deploy**

`vercel.json` handles all routing. Vercel auto-detects `api/*.js` as serverless functions.

## 🛠️ Available Commands

| Command | Description |
|---------|-------------|
| `node server.js` | Start local dev server at http://localhost:3000 |
| `PORT=XXXX node server.js` | Start on a custom port |

## 🎮 Player Controls

| Key | Action |
|-----|--------|
| `Space` | Play / Pause |
| `→` | Skip forward 10s |
| `←` | Rewind 10s |
| `M` | Mute toggle |
| `F` | Fullscreen |

## 📚 Tech Stack

[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&logoColor=black)](https://www.javascript.com/)
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Pico CSS](https://img.shields.io/badge/Pico%20CSS-2.0-blue)](https://picocss.com/)
[![Hls.js](https://img.shields.io/badge/Hls.js-latest-red)](https://github.com/video-dev/hls.js/)

- **JavaScript** — Vanilla JS, zero frameworks
- **Node.js** — Local development server, zero npm dependencies
- **Pico CSS** — Minimal classless CSS framework
- **Hls.js** — HLS adaptive bitrate streaming

## 🗂️ Project Structure

```
mov-web/
├── server.js        # Local dev server — all logic, zero dependencies
├── index.html       # Search page
├── watch.html       # Player page
├── app.js           # Watch page JS (HLS, quality, subtitles, shortcuts)
├── api/
│   ├── _lib.js      # Shared logic for Vercel serverless functions
│   ├── search.js    # GET /api/search?q=
│   ├── seasons.js   # GET /api/seasons?mediaId=
│   ├── episodes.js  # GET /api/episodes?seasonId=
│   ├── resolve.js   # GET /api/resolve?mediaId=&dataId=&type=
│   └── proxy.js     # GET /api/proxy?url=  (M3U8 rewrite + binary pipe)
├── vercel.json      # Vercel deployment config
└── package.json
```

## 🔧 API Reference

| Endpoint | Params | Description |
|----------|--------|-------------|
| `GET /api/search` | `q` | Search movies & TV shows |
| `GET /api/seasons` | `mediaId` | List seasons for a TV show |
| `GET /api/episodes` | `seasonId` | List episodes for a season |
| `GET /api/resolve` | `mediaId`, `dataId`, `type` | Resolve embed → m3u8 URL |
| `GET /api/proxy` | `url` | CORS proxy + M3U8 URL rewriting |

## 📡 How Streaming Works (HLS)

### What is HLS?

**HTTP Live Streaming (HLS)** is a protocol developed by Apple for delivering video over the web. Instead of one large file, HLS:

1. Splits video into small segments (`.ts` files, typically 2–10s each)
2. Generates a **manifest** (`.m3u8`) listing all segments in order
3. The player fetches the manifest, then downloads segments progressively

This enables adaptive bitrate — the player switches quality on the fly based on network conditions.

```
.m3u8 manifest
  ├── 360p playlist  →  seg001.ts, seg002.ts, ...
  ├── 720p playlist  →  seg001.ts, seg002.ts, ...
  └── 1080p playlist →  seg001.ts, seg002.ts, ...
```

### How mov-web uses HLS

```
FlixHQ
    │
    │  HTML scrape → movie/episode server list
    ▼
/api/resolve  (server-side)
    │  fetches embed link → POSTs to decrypt API → returns .m3u8 URL
    ▼
watch.html  (browser)
    │
    └─ Hls.js loads master.m3u8 via /api/proxy
         │  proxy rewrites all segment URLs → /api/proxy?url=…
         │  .ts segments piped directly (no buffering, binary-safe)
         ▼
       <video> element with quality buttons + subtitle selector
```

**Why the proxy?** CDN servers hosting `.ts` segments block direct browser requests (CORS). `/api/proxy` forwards requests server-side, bypassing the restriction. It also rewrites all URLs inside `.m3u8` manifests so every segment request also routes through the proxy.

## 🤝 Similar Projects

- [ani-web](https://github.com/William9923/ani-web) — The sister project that inspired this one. Browser-based anime streaming frontend.
- [ani-cli](https://github.com/pystardust/ani-cli) — CLI tool to browse and play anime.

## ❤️ Support

If this project helped you learn something or sparked curiosity about agent-based coding — that's the goal! Feel free to ⭐ the repo if you found it useful.
