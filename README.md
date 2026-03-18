# (ﾉ◕ヮ◕)ﾉ mov-web

> Lightweight, no-signup movie & TV streaming — right in your browser.

**Live:** [mov-web-viewer.vercel.app](https://mov-web-viewer.vercel.app)

---

## ✨ Features

- 🔍 Search movies and TV shows
- 📺 HLS streaming via Hls.js
- 🎞️ Season & episode browsing for TV series
- 🎚️ Quality switching (Auto / 1080p / 720p / 480p / 360p)
- 💬 Multi-language subtitle support
- ✅ Watch history & episode progress tracked locally
- ⌨️ Keyboard shortcuts
- 🌑 Forced dark theme — always

---

## 🚀 Quick Start

**Requires Node.js 18+. No `npm install` needed.**

```bash
git clone https://github.com/William9923/mov-web
cd mov-web
node server.js
```

Open **http://localhost:3000**

```bash
# Custom port
PORT=8080 node server.js
```

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play / Pause |
| `→` | Skip forward 10s |
| `←` | Rewind 10s |
| `M` | Mute toggle |
| `F` | Fullscreen |

---

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

---

## 🔌 API Endpoints

| Endpoint | Params | Description |
|----------|--------|-------------|
| `GET /api/search` | `q` | Search movies & TV shows |
| `GET /api/seasons` | `mediaId` | List seasons for a TV show |
| `GET /api/episodes` | `seasonId` | List episodes for a season |
| `GET /api/resolve` | `mediaId`, `dataId`, `type` | Resolve embed → m3u8 URL |
| `GET /api/proxy` | `url` | CORS proxy + M3U8 URL rewriting |

---

## 🔄 Data Flow

```
Search query
  → /api/search  →  FlixHQ HTML scrape  →  results grid

Click movie
  → /api/resolve?type=movie&mediaId=…
      → FlixHQ /ajax/movie/episodes/<id>   (server list)
      → FlixHQ /ajax/episode/sources/<id>  (embed link)
      → POST decrypt API                   (→ .m3u8 URL)
  → Hls.js streams via /api/proxy
      → M3U8 segment URLs rewritten to /api/proxy?url=…
      → .ts segments piped directly (no buffering)

Click TV show
  → /api/seasons  →  season selector
  → /api/episodes →  episode pill strip
  → click episode → same resolve + decrypt flow as movie
```

---

## 🚢 Deployment

### Vercel (recommended)

1. Push to GitHub
2. Go to [vercel.com/new](https://vercel.com/new) → import your repo
3. Framework preset: **Other** — leave build settings blank
4. Click **Deploy**

`vercel.json` handles all routing. Vercel auto-detects `api/*.js` as serverless functions.

### Self-hosted

```bash
node server.js
```

`server.js` is fully self-contained — it serves both the API and all static files.

---

## ⚖️ Disclaimer

For educational purposes only. Content is sourced from third-party sites. Users are responsible for compliance with applicable laws in their jurisdiction.
