# Mov-Web Implementation Plan

## Project Overview
**mov-web** is a browser-based movie/TV show streaming frontend, following the same architecture as **ani-web** but for movies/series using Lobster's research data and FlixHQ as the content source.

**Stack**: Node.js + Vanilla HTML/CSS/JS + Pico CSS
**Port**: 9002 (or configurable)
**Base Source**: https://flixhq.to
**Decryption APIs**: dec.eatmynerds.live, decrypt.broggl.farm

---

## Architecture

### Backend (Node.js - server.js)
```
server.js (400-500 lines)
├── Constants
│   ├── PORT (9002)
│   ├── FLIXHQ_BASE (https://flixhq.to)
│   ├── FLIXHQ_API_BASE (https://api.flixhq.to)
│   ├── DECRYPTION_API_PRIMARY (https://dec.eatmynerds.live)
│   ├── DECRYPTION_API_FALLBACK (https://decrypt.broggl.farm)
│   └── USER_AGENT
│
├── HTTP Request Handler (httpsGet / httpGet)
│   ├── Redirect support (max 5)
│   ├── Timeout handling (8000ms)
│   └── Error handling
│
├── API Endpoints (5-6 routes)
│   ├── GET /api/search (query)
│   │   → Calls FlixHQ search endpoint
│   │   → Returns: [{id, title, image, year, type}]
│   │
│   ├── GET /api/media/:id (params: type)
│   │   → Calls FlixHQ media endpoint
│   │   → Returns: {title, description, seasons[], episodes[], servers[]}
│   │
│   ├── GET /api/episodes/:seasonId (params: mediaId)
│   │   → Calls FlixHQ episodes endpoint
│   │   → Returns: [{id, number, title}]
│   │
│   ├── GET /api/servers/:episodeId (params: mediaId)
│   │   → Calls FlixHQ servers endpoint
│   │   → Returns: [{id, name}] (Vidcloud, UpCloud)
│   │
│   ├── GET /api/embed/:serverId (params: mediaId)
│   │   → Calls FlixHQ embed endpoint
│   │   → Decrypts embed link via dec.eatmynerds.live
│   │   → Returns: {url, quality[], subtitles[]}
│   │
│   └── GET /api/proxy (params: url, quality, subs_language)
│       → Decrypts/proxies embed URL
│       → Applies quality/subtitle selection
│       → Returns: {m3u8_url, subtitles: [{label, url}]}
│
├── HTML/JSON Parsing
│   ├── Pure regex extraction (sed-style patterns)
│   ├── NO HTML libraries
│   ├── Functions: parseSearchHTML(), parseMediaHTML(), etc.
│   │
│   └── Regex Patterns:
│       ├── Search results: img[data-src], href="/movie/", title
│       ├── Media details: seasonId, episodeId, serverId from data attributes
│       └── Embed: extract encrypted URL from JSON
│
└── Error Handling
    ├── 404 Not Found
    ├── Timeout errors (fallback to secondary API)
    └── Rate limiting (optional queue)
```

### Frontend (index.html + anilist.js)
```
index.html (600-700 lines)
├── Head
│   ├── Pico CSS classless stylesheet
│   ├── Font Awesome 4.7 (icons)
│   ├── Dynamic favicon (kaomoji)
│   └── Theme: light/dark
│
├── Body > Main
│   ├── Header
│   │   ├── Title: "mov-web" with emoji
│   │   ├── Subtitle: "Stream movies & TV"
│   │   └── Search bar (debounced input)
│   │
│   ├── Search Results Section
│   │   ├── Grid layout (3-4 columns, responsive)
│   │   ├── Poster cards with:
│   │   │   ├── Image (lazy-loaded)
│   │   │   ├── Title + Year
│   │   │   ├── Type badge (Movie/Series)
│   │   │   └── Click → Details modal
│   │   └── Infinite scroll / Pagination
│   │
│   ├── Details Modal
│   │   ├── Poster + Title + Year + Rating
│   │   ├── Description (truncated)
│   │   ├── TV Show branching:
│   │   │   ├── Season selector (dropdown)
│   │   │   ├── Episode list (scrollable)
│   │   │   └── Episode selection → Server selection
│   │   ├── Server selector (Vidcloud / UpCloud)
│   │   ├── Quality selector (1080, 720, 480, 360)
│   │   ├── Subtitle selector (language-based)
│   │   ├── Play button → Opens player
│   │   └── Close button
│   │
│   ├── Video Player Section
│   │   ├── HTML5 video player OR iframe embed
│   │   ├── m3u8 support (via hls.js)
│   │   ├── Subtitle rendering
│   │   ├── Quality switcher
│   │   ├── Back button → Modal
│   │   └── Fullscreen support
│   │
│   └── FAB Menu (Fixed Action Button)
│       ├── Toggle button (☰)
│       ├── Submenu items:
│       │   ├── 🌙 Dark mode toggle
│       │   ├── ⚙️ Settings (quality, subtitles)
│       │   ├── 📋 Watch history
│       │   ├── ⭐ Favorites
│       │   └── ℹ️ About/Docs
│       └── Tooltips on hover
│
└── Styling
    ├── Pico CSS base (classless)
    ├── Custom CSS variables:
    │   ├── --mov-accent: #ff0000 (red)
    │   ├── --mov-accent-hover: #cc0000
    │   ├── --mov-accent-light: #fff0f0
    │   └── Dark mode overrides
    ├── Responsive grid (mobile-first)
    └── Card + modal animations

anilist.js (400-500 lines)
├── State Management
│   ├── currentSearch: string
│   ├── currentResults: []
│   ├── selectedMedia: object
│   ├── currentSeason: number
│   ├── currentEpisode: number
│   ├── selectedServer: string
│   ├── selectedQuality: string
│   ├── selectedSubtitles: string
│   └── watchHistory: []
│   └── favorites: []
│
├── UI Functions
│   ├── renderSearchResults(results)
│   ├── renderModal(media)
│   ├── renderPlayer(url, subtitles)
│   ├── updateSeasons(media)
│   ├── updateEpisodes(seasonId)
│   ├── updateServers(episodeId)
│   ├── updateQualities(servers)
│   ├── updateSubtitles(subtitles)
│   └── toggleTheme()
│
├── Event Listeners
│   ├── #search-input (input → debounced fetch)
│   ├── .result-card (click → showModal)
│   ├── .play-button (click → fetchStream → renderPlayer)
│   ├── #season-select (change → updateEpisodes)
│   ├── #episode-select (change → updateServers)
│   ├── #server-select (change → updateQualities)
│   ├── #quality-select (change event)
│   ├── #subtitles-select (change event)
│   ├── #theme-toggle (click → toggleTheme)
│   ├── #fab-toggle (click → openFABMenu)
│   ├── modal-close (click → closeModal)
│   └── back-button (click → showModal from player)
│
├── API Integration
│   ├── async search(query)
│   ├── async getMedia(id, type)
│   ├── async getEpisodes(seasonId, mediaId)
│   ├── async getServers(episodeId, mediaId)
│   ├── async getEmbed(serverId, mediaId)
│   ├── async fetchStream(embedData, quality, subs)
│   └── Error handling + fallbacks
│
├── LocalStorage Persistence
│   ├── Save watch history (10 most recent)
│   ├── Save favorites (starred items)
│   ├── Save user preferences (quality, subs language)
│   └── Save theme preference
│
└── HLS.js Integration
    ├── Load m3u8 URLs
    ├── Quality variant switching
    ├── Subtitle track binding
    └── ABR (Adaptive Bitrate) control
```

---

## Implementation Phases

### Phase 1: Setup & Backend Skeleton (2-3 hours)
- [ ] Initialize package.json (Node 18+, http/https, dotenv)
- [ ] Create server.js with constants and basic HTTP handlers
- [ ] Implement `/api/search` endpoint (test with curl)
- [ ] Test against https://flixhq.to directly
- [ ] Set up error handling + fallbacks

### Phase 2: Complete Backend APIs (3-4 hours)
- [ ] Implement `/api/media/:id` (movies + TV shows)
- [ ] Implement `/api/episodes/:seasonId`
- [ ] Implement `/api/servers/:episodeId`
- [ ] Implement `/api/embed/:serverId` + decryption
- [ ] Implement `/api/proxy` for quality/subtitle selection
- [ ] Test all endpoints with real FlixHQ data
- [ ] Add timeout/retry logic

### Phase 3: Frontend Structure (2-3 hours)
- [ ] Create index.html skeleton with Pico CSS
- [ ] Build search input + result grid
- [ ] Create modal for media details
- [ ] Add video player container
- [ ] Implement FAB menu with settings
- [ ] Add theme toggle (light/dark)

### Phase 4: Frontend Logic (4-5 hours)
- [ ] Implement anilist.js state management
- [ ] Connect search input to `/api/search`
- [ ] Build modal rendering for movies vs TV
- [ ] Implement season/episode/server selection flow
- [ ] Add quality selector with URL rewriting
- [ ] Add subtitle language selector
- [ ] Integrate HLS.js player

### Phase 5: Testing & Polish (2-3 hours)
- [ ] End-to-end testing (search → play)
- [ ] Test on mobile (responsive)
- [ ] Test TV shows vs Movies
- [ ] Add watch history persistence
- [ ] Add favorites feature
- [ ] Error handling for edge cases
- [ ] Performance optimization

### Phase 6: Deployment & Documentation (1-2 hours)
- [ ] README with setup instructions
- [ ] Configuration guide (.env template)
- [ ] Docker support (optional)
- [ ] GitHub Actions CI/CD (optional)

---

## Key Implementation Details

### Search Endpoint Implementation
```
GET /api/search?query=inception
↓
1. Build search URL: https://api.flixhq.to/v1/search?query=inception
2. Make HTTPS request with User-Agent header
3. Parse HTML response using regex:
   - Extract: img[data-src], href="/movie/...", title attr
   - Format: {id, title, image, year, type}
4. Return JSON array

Response Example:
[
  {id: "movie-123", title: "Inception", image: "url...", year: 2010, type: "movie"},
  {id: "movie-456", title: "Inception: Legacy", image: "url...", year: 2015, type: "movie"}
]
```

### TV vs Movie Branching
```
Movie Path:
GET /api/media/movie-123
→ {title, description, servers: [{id, name}]}
→ User picks server (Vidcloud)
→ GET /api/embed/server-456?mediaId=movie-123
→ Returns m3u8 URL + subtitles
→ Play

TV Show Path:
GET /api/media/show-789
→ {title, description, seasons: [{id, number}]}
→ User picks season (1)
→ GET /api/episodes/season-111?mediaId=show-789
→ {episodes: [{id, number, title}]}
→ User picks episode (1)
→ GET /api/servers/episode-222?mediaId=show-789
→ {servers: [{id, name}]}
→ User picks server
→ GET /api/embed/server-456?mediaId=show-789
→ Returns m3u8 URL + subtitles
→ Play
```

### Quality URL Rewriting
```
Input: https://example.com/stream/playlist.m3u8
Quality: 720

Output: https://example.com/stream/720/index.m3u8

Implementation:
url.replace(/\/playlist\.m3u8$/, `/${quality}/index.m3u8`)
```

### Subtitle Selection
```
API Response:
{
  "subtitles": [
    {"file": "url1", "label": "English"},
    {"file": "url2", "label": "Spanish"},
    {"file": "url3", "label": "French"}
  ]
}

User selects: "English" (case-insensitive)

HLS.js binding:
hls.on('hlsManifestParsed', () => {
  const englishSub = subtitles.find(s => s.label.toLowerCase() === 'english');
  if (englishSub) {
    video.textTracks[0].src = englishSub.file;
    video.textTracks[0].mode = 'showing';
  }
});
```

---

## Configuration

### .env Template
```env
PORT=9002
NODE_ENV=development

# FlixHQ Configuration
FLIXHQ_BASE=flixhq.to
FLIXHQ_API_BASE=https://api.flixhq.to

# Decryption APIs
DECRYPTION_API_PRIMARY=https://dec.eatmynerds.live
DECRYPTION_API_FALLBACK=https://decrypt.broggl.farm

# Request Timeouts
HTTP_TIMEOUT=8000
DECRYPTION_TIMEOUT=5000

# Caching (optional)
ENABLE_CACHE=false
CACHE_TTL=3600

# Rate Limiting (optional)
RATE_LIMIT_WINDOW=60000
RATE_LIMIT_MAX_REQUESTS=100
```

---

## File Structure
```
mov-web/
├── server.js                 # Backend (400-500 lines)
├── index.html                # Frontend (600-700 lines)
├── anilist.js                # Client-side logic (400-500 lines)
├── package.json
├── .env.template
├── .gitignore
├── README.md
├── IMPLEMENTATION_GUIDE.md
└── docs/
    ├── API_REFERENCE.md
    ├── ARCHITECTURE.md
    └── DEPLOYMENT.md
```

---

## Testing Checklist

### Backend Tests
- [ ] Search returns results
- [ ] Media endpoint returns seasons/servers for TV and servers for movies
- [ ] Episodes endpoint returns episode list
- [ ] Servers endpoint returns provider list
- [ ] Embed endpoint decrypts and returns m3u8
- [ ] Fallback decryption API works
- [ ] Timeout handling doesn't crash
- [ ] Error messages are clear

### Frontend Tests
- [ ] Search input debounces
- [ ] Results grid renders correctly
- [ ] Modal opens/closes
- [ ] Season/episode selectors work for TV
- [ ] Server selector updates quality options
- [ ] Quality selector rewrites m3u8 URLs
- [ ] Subtitles load and display
- [ ] Player plays m3u8 streams
- [ ] Theme toggle works
- [ ] Watch history saves
- [ ] Mobile responsive layout

### Integration Tests
- [ ] Search → Select Movie → Play
- [ ] Search → Select TV Show → Select Season → Select Episode → Play
- [ ] Quality switching mid-playback
- [ ] Subtitle selection
- [ ] Back button navigation
- [ ] Refresh page preserves watch history

---

## Dependencies

### Node.js
- `node`: 18.0.0+

### NPM Packages
```json
{
  "name": "mov-web",
  "version": "0.1.0",
  "description": "Browser-based movie/TV streaming frontend for FlixHQ",
  "scripts": {
    "start": "node server.js",
    "dev": "NODE_ENV=development node server.js"
  },
  "engines": {
    "node": ">=18"
  },
  "dependencies": {
    "dotenv": "^16.0.0"
  }
}
```

### Browser APIs (no npm packages needed)
- Fetch API (search requests)
- localStorage (watch history, preferences)
- MediaStream API (video playback)
- HLS.js (via CDN for m3u8 playback)
- Pico CSS (via CDN)
- Font Awesome (via CDN)

---

## Next Steps for First Implementation
1. Create server.js with constants and `/api/search` endpoint
2. Test against real FlixHQ data
3. Create index.html skeleton
4. Connect frontend search to backend
5. Iteratively add features (modal, TV selection, player, etc.)

