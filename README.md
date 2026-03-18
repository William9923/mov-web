# mov-web

Browser-based movie & TV streaming frontend. Lightweight, no sign-up required.

Built with vanilla JavaScript, Pico CSS, HLS.js, and Plyr. Zero npm dependencies — only Node.js built-ins.

## Features

- Real-time search across movies and TV shows
- HLS streaming via Hls.js + Plyr player
- Season/episode selection for TV series
- Quality switching (1080p / 720p / 480p / 360p)
- Multi-language subtitle support
- Dark/light theme
- Watch history via localStorage
- Keyboard shortcuts

## Quick Start

**Requires Node.js 18+. No `npm install` needed.**

```bash
git clone <repo>
cd mov-web
node server.js
```

Visit **http://localhost:3000**

To use a different port:

```bash
PORT=8080 node server.js
```

## Architecture

```
mov-web/
├── server.js        # Local dev server (all logic, no deps)
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

### Data Flow

```
Search query
  → /api/search → FlixHQ HTML scraping → results

Click result (movie)
  → /api/resolve?type=movie&mediaId=...
      → FlixHQ /ajax/movie/episodes/<id>   (get episode ID)
      → FlixHQ /ajax/episode/sources/<id>  (get embed link)
      → POST dec.eatmynerds.live           (decrypt → .m3u8 URL)
  → Hls.js loads master.m3u8 via /api/proxy
      → proxy rewrites all segment URLs to /api/proxy?url=...
      → binary .ts segments piped directly (no buffering)

Click result (TV)
  → /api/seasons?mediaId=...  → season list
  → /api/episodes?seasonId=... → episode list
  → /api/resolve?type=tv&mediaId=...&dataId=... → same decrypt flow
```

### Proxy Design

The `/api/proxy` endpoint is the critical CORS bridge:

- **M3U8 manifests**: buffered as text, all URLs rewritten to `/api/proxy?url=...`, returned as `application/vnd.apple.mpegurl`
- **Binary segments (`.ts`, `.key`)**: streamed via `pipe()` directly to the client — no buffering, no string coercion — preserving binary integrity
- **Redirects**: followed automatically (up to 5 hops)

## API Endpoints

| Endpoint | Params | Description |
|---|---|---|
| `GET /api/search` | `q` | Search movies/TV |
| `GET /api/seasons` | `mediaId` | TV seasons |
| `GET /api/episodes` | `seasonId` | Season episodes |
| `GET /api/resolve` | `mediaId`, `dataId`, `type` | Decrypt → m3u8 URL |
| `GET /api/proxy` | `url` | CORS proxy + M3U8 rewrite |

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `Space` | Play / Pause |
| `→` | Skip forward 5s |
| `←` | Rewind 5s |
| `M` | Mute toggle |
| `F` | Fullscreen |

## Deployment

### Vercel

```bash
vercel deploy
```

The `vercel.json` routes `/api/*` to serverless functions in `api/` and static files (`index.html`, `watch.html`, `app.js`) directly.

### Self-hosted

```bash
node server.js
```

`server.js` is a standalone file with all logic embedded — no shared library needed. It serves both the API and static files.

## Legal Disclaimer

For educational purposes only. Users are responsible for compliance with local laws.
