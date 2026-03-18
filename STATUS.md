# 🎬 mov-web - Implementation Status

**Date**: March 18, 2026  
**Status**: ✅ Phase 1 & 2 Complete - Ready for Testing

---

## Project Overview

**mov-web** is a browser-based streaming frontend for movies and TV shows, built with Node.js backend and vanilla JavaScript frontend. Architecture mirrors **ani-web** but targets **FlixHQ** as the content source instead of anime.

**Stack**: Node.js + Vanilla HTML/CSS/JS + Pico CSS + HLS.js  
**Port**: 9002 (configurable)  
**LOC**: ~3,400 lines

---

## ✅ Completed (Phase 1 & 2)

### Backend Implementation (server.js - 460 lines)
- [x] HTTP server setup with HTTPS request handling
- [x] Redirect support (max 5 redirects)
- [x] Timeout handling (8000ms default, configurable)
- [x] User-Agent spoofing for FlixHQ access
- [x] Environment configuration via dotenv

### API Endpoints (6 implemented)
- [x] `/api/search?query=<query>` - Search FlixHQ
  - Returns: `[{id, title, image, year, type}]`
  - Status: Ready for testing
  
- [x] `/api/media/:id?type=movie|tv` - Get media details
  - Returns: `{title, description, year, type, servers[], seasons[]}`
  - Status: Ready for testing
  
- [x] `/api/episodes/:seasonId?mediaId=<id>` - Get TV episodes
  - Returns: `[{id, number, title}]`
  - Status: Ready for testing
  
- [x] `/api/servers/:episodeId?mediaId=<id>` - Get available servers
  - Returns: `[{id, name}]`
  - Status: Ready for testing
  
- [x] `/api/embed/:serverId?mediaId=<id>&episodeId=<id>` - Get video embed
  - Returns: `{url, quality[], subtitles[]}`
  - Includes decryption logic with primary + fallback APIs
  - Status: Ready for testing (needs network access)
  
- [x] `/api/proxy?url=<m3u8>&quality=<q>&subs_language=<lang>` - Quality/subtitle proxy
  - Returns: `{m3u8_url, subtitles: [{label, url}]}`
  - Status: Ready for testing

### HTML Parsing Functions
- [x] `parseSearchHTML()` - Extract from search results
- [x] `parseMediaHTML()` - Extract media details
- [x] `parseServersHTML()` - Extract server list
- [x] `parseEmbedJSON()` - Extract embed link from JSON
- [x] Pure regex parsing (no external HTML libraries)

### Frontend Implementation (HTML - 450 lines)
- [x] Header with search input and branding
- [x] Responsive grid layout (3-4 columns, mobile-friendly)
- [x] Result card component with lazy-loading images
- [x] Modal for media details
- [x] TV show controls (season/episode selection)
- [x] Server selector dropdown
- [x] Quality selector (1080, 720, 480, 360p)
- [x] Subtitle selector with language filtering
- [x] Video player container
- [x] FAB menu with theme toggle, history, favorites, settings
- [x] Dark/light theme support
- [x] Pico CSS for responsive design
- [x] Font Awesome icons

### Frontend Logic (anilist.js - 530 lines)
- [x] State management (search, media, servers, quality, subtitles, etc.)
- [x] LocalStorage persistence for history/favorites/preferences
- [x] API integration functions (search, getMedia, getEpisodes, etc.)
- [x] Event listeners for all interactions
- [x] Debounced search (300ms)
- [x] Error handling and user feedback
- [x] Theme toggle logic
- [x] Watch history tracking
- [x] Favorites management
- [x] Placeholder/loading states

### Configuration & Deployment
- [x] package.json with npm scripts
- [x] dotenv support with .env.template
- [x] .gitignore with proper exclusions
- [x] Comprehensive README.md
- [x] IMPLEMENTATION_PLAN.md with architecture details
- [x] Git initialization with initial commit

---

## ⚠️ Known Limitations & TODO

### Known Issues
1. **FlixHQ API Access** - Currently timing out
   - May require VPN or proxy
   - FlixHQ actively blocks automated access
   - Recommend testing with mock data first

2. **TV Shows Not Fully Implemented**
   - [ ] Season fetching endpoint needs testing
   - [ ] Episode list parsing needs refinement
   - [ ] Episode selection flow needs integration

3. **Subtitle Handling** - Partial Implementation
   - [ ] Subtitle download and rendering
   - [ ] Multiple subtitle track support
   - [ ] Subtitle timing synchronization

4. **Quality Switching** - Basic Implementation
   - [ ] Mid-playback quality switching (HLS.js integration needed)
   - [ ] Bitrate detection and ABR
   - [ ] Quality persistence

### Next Steps (Phase 3-5)

#### Phase 3: Frontend Refinement
- [ ] Connect season selector to API
- [ ] Implement episode list rendering
- [ ] Add episode selection UX
- [ ] Improve error messages and loading states
- [ ] Add retry logic for failed requests

#### Phase 4: Video Player Enhancement
- [ ] Integrate HLS.js for m3u8 playback
- [ ] Implement subtitle track loading
- [ ] Add mid-playback quality switching
- [ ] Keyboard shortcuts (space, arrow keys)
- [ ] Save playback position

#### Phase 5: Features & Polish
- [ ] Watch history UI/modal
- [ ] Favorites management UI
- [ ] Settings modal (quality defaults, subtitle language)
- [ ] About/Help modal
- [ ] Performance optimization
- [ ] End-to-end testing

#### Phase 6: Deployment
- [ ] Docker containerization
- [ ] GitHub Actions CI/CD
- [ ] Deployment documentation
- [ ] Rate limiting implementation

---

## Testing Checklist

### Backend Tests
- [ ] Test `/api/search` with real FlixHQ (or mock)
- [ ] Test `/api/media/:id` for movies
- [ ] Test `/api/media/:id` for TV shows
- [ ] Test `/api/episodes/:seasonId`
- [ ] Test `/api/servers/:episodeId`
- [ ] Test `/api/embed/:serverId` with decryption
- [ ] Verify timeout handling
- [ ] Verify error responses

### Frontend Tests
- [ ] Search input debounces correctly
- [ ] Results display in grid
- [ ] Click card opens modal
- [ ] Modal shows correct data
- [ ] Movie path: server selector → play
- [ ] TV path: season → episode → server → play
- [ ] Quality selector updates
- [ ] Subtitle selector populates
- [ ] Video player loads m3u8
- [ ] Dark mode toggle works
- [ ] LocalStorage saves/loads preferences

### Integration Tests
- [ ] Full search → click → play flow (movies)
- [ ] Full search → season → episode → play flow (TV)
- [ ] Quality switching
- [ ] Subtitle loading
- [ ] Back button navigation
- [ ] Page refresh preserves watch history

### Cross-Browser
- [ ] Chrome/Chromium
- [ ] Firefox
- [ ] Safari
- [ ] Edge

### Mobile
- [ ] Responsive layout on 375px width
- [ ] Touch-friendly buttons
- [ ] Video player fullscreen
- [ ] Search works on mobile

---

## How to Run

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.template .env

# Start server (development)
npm run dev

# Or start (production)
npm start
```

Visit: **http://localhost:9002**

---

## File Manifest

```
mov-web/
├── server.js              # 460 lines - Node.js backend
├── index.html             # 450 lines - HTML structure & styling
├── anilist.js             # 530 lines - Frontend logic & state
├── package.json           # Dependencies + scripts
├── .env.template          # Configuration template
├── .gitignore             # Git exclusions
├── README.md              # User documentation
├── IMPLEMENTATION_PLAN.md # Technical architecture
├── STATUS.md              # This file
└── MOV-CLI_TECHNICAL_RESEARCH.md  # Original research

Total: ~3,400 lines
```

---

## Architecture Diagram

```
Frontend (Browser)
├── index.html (structure + styling)
├── anilist.js (state management + event handling)
├── HLS.js (CDN - video playback)
├── Pico CSS (CDN - styling)
└── Font Awesome (CDN - icons)

          ↓ HTTP Requests ↓

Backend (Node.js)
├── server.js (HTTP server)
├── API Handlers (6 endpoints)
├── HTML/JSON Parsers (regex-based)
└── Decryption Integration (2 API fallbacks)

          ↓ HTTPS Requests ↓

External Services
├── https://api.flixhq.to (content aggregator)
├── https://dec.eatmynerds.live (decryption)
└── https://decrypt.broggl.farm (decryption fallback)
```

---

## Current Bottlenecks

1. **FlixHQ API Access** - Requires network testing
2. **Decryption API Latency** - 1-3 seconds per request
3. **Error Handling** - Need better fallback strategies
4. **TV Show Parsing** - More testing needed on different content

---

## Notes for Maintainers

- No external HTML parsing libraries (BeautifulSoup, cheerio) - using pure regex
- No external state management (Redux, Vuex) - using plain JavaScript objects
- No bundler/build step (Webpack, Vite) - pure vanilla JS
- Minimal dependencies (only dotenv for Node.js)
- CDN-based libraries for frontend (Pico CSS, HLS.js, Font Awesome)

---

## Recommendations

1. **Test with mock data first** before testing with real FlixHQ API
2. **Implement rate limiting** to avoid being blocked
3. **Add caching layer** for frequently accessed content
4. **Monitor API reliability** - FlixHQ APIs change frequently
5. **Consider proxy/VPN** if direct access is blocked

---

**Last Updated**: March 18, 2026  
**Next Review**: After Phase 3 implementation

