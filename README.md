# 🎬 mov-web

Browser-based movie & TV show streaming frontend for FlixHQ. Lightweight, fast, no sign-up required.

Built with Node.js, vanilla JavaScript, and Pico CSS. Similar architecture to [ani-web](https://github.com/your-org/ani-web).

## Features

- 🔍 **Fast Search** - Real-time search across thousands of movies and TV shows
- 🎥 **Streaming** - Watch movies and TV shows directly in your browser
- 📺 **TV Support** - Season/episode selection for series
- 🎛️ **Quality Control** - Switch between 1080p, 720p, 480p, 360p
- 📝 **Subtitles** - Multi-language subtitle support
- 🌙 **Dark Mode** - Light and dark themes
- 📱 **Responsive** - Works on desktop, tablet, and mobile
- 💾 **History** - Automatic watch history tracking
- ⭐ **Favorites** - Save your favorite shows

## Quick Start

### Prerequisites
- Node.js 18.0.0 or higher

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/mov-web.git
cd mov-web

# Install dependencies
npm install

# Copy environment template
cp .env.template .env

# Start the server
npm start
```

Visit **http://localhost:9002** in your browser.

## Configuration

Edit `.env` to customize settings:

```env
# Server port (default: 9002)
PORT=9002

# Content source (default: flixhq.to)
FLIXHQ_BASE=flixhq.to
FLIXHQ_API_BASE=https://api.flixhq.to

# Decryption APIs (for video streams)
DECRYPTION_API_PRIMARY=https://dec.eatmynerds.live
DECRYPTION_API_FALLBACK=https://decrypt.broggl.farm

# Request timeouts (milliseconds)
HTTP_TIMEOUT=8000
DECRYPTION_TIMEOUT=5000

# Enable logging
LOG_REQUESTS=false
```

## Project Structure

```
mov-web/
├── server.js              # Node.js backend server
├── index.html             # Frontend HTML
├── anilist.js             # Frontend JavaScript (state + logic)
├── package.json           # Dependencies
├── .env.template          # Environment configuration template
├── README.md              # This file
├── IMPLEMENTATION_PLAN.md # Technical implementation details
└── docs/                  # Additional documentation
    ├── API_REFERENCE.md
    ├── ARCHITECTURE.md
    └── DEPLOYMENT.md
```

## Architecture

### Backend (Node.js)
- HTTP server with 6 main API endpoints
- Communicates with FlixHQ API for content
- Decrypts video streams via external APIs
- Pure regex-based HTML/JSON parsing (no external parsing libraries)

### Frontend (Vanilla JavaScript)
- State management for search results, media selection, playback
- LocalStorage persistence for watch history and preferences
- HLS.js for m3u8 stream playback
- Pico CSS for lightweight styling

### Data Flow

```
Search Input
    ↓
/api/search → FlixHQ API (search endpoint)
    ↓
Display Results
    ↓
[Click Result]
    ↓
/api/media/:id → FlixHQ API (media details)
    ↓
Show Modal (Server/Quality/Subtitle selection)
    ↓
[Click Play]
    ↓
/api/embed/:serverId → FlixHQ API (get embed link)
    ↓
Decryption API (decrypt embed URL)
    ↓
/api/proxy (apply quality/subtitle settings)
    ↓
HLS.js Player (play m3u8 stream)
```

## API Endpoints

### Search
```
GET /api/search?query=inception
Response: [{id, title, image, year, type}]
```

### Media Details
```
GET /api/media/:id?type=movie|tv
Response: {title, description, year, type, servers[], seasons[]}
```

### TV Episodes
```
GET /api/episodes/:seasonId?mediaId=<id>
Response: [{id, number, title}]
```

### Servers/Providers
```
GET /api/servers/:episodeId?mediaId=<id>
Response: [{id, name}]
```

### Video Embed
```
GET /api/embed/:serverId?mediaId=<id>&episodeId=<id>
Response: {url, quality[], subtitles: [{label, url}]}
```

### Proxy/Transform
```
GET /api/proxy?url=<m3u8>&quality=720&subs_language=english
Response: {m3u8_url, subtitles: [{label, url}]}
```

## Providers

Currently supports:
- **Vidcloud** (default)
- **UpCloud** (fallback)

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Esc` | Close modal/player |
| `F` | Fullscreen |
| `Space` | Play/Pause |
| `→` | Skip 5 seconds |
| `←` | Rewind 5 seconds |

## Performance

- **Search Response**: ~500-1000ms
- **Media Details**: ~800-1500ms
- **Video Decryption**: ~1-3 seconds (network dependent)
- **Total time to playable**: ~3-5 seconds

## Browser Support

- Chrome/Chromium 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Known Issues

1. **FlixHQ API Blocking** - Some IP addresses may be rate-limited. Use a VPN if needed.
2. **Video Buffering** - Quality varies by provider and CDN
3. **Subtitles** - Not all shows have subtitle support
4. **Ad Blockers** - Some adblockers may interfere with playback

## Troubleshooting

### Server won't start
```bash
# Check if port 9002 is in use
lsof -i :9002
# Use a different port
PORT=9003 npm start
```

### Search returns no results
- Try a different query
- Check internet connection
- The FlixHQ API may be rate-limited
- Try using a VPN

### Video won't play
- Try a different server (Vidcloud vs UpCloud)
- Try a lower quality (720p instead of 1080p)
- Check browser console for errors (F12)
- Disable adblockers

### Subtitles not appearing
- Not all videos have subtitle support
- Try selecting a different subtitle from dropdown
- Check browser console for subtitle loading errors

## Development

### Running in development mode
```bash
LOG_REQUESTS=true NODE_ENV=development npm run dev
```

### Testing endpoints with curl
```bash
# Test search
curl 'http://localhost:9002/api/search?query=inception'

# Test media details
curl 'http://localhost:9002/api/media/movie-123?type=movie'
```

### Debugging
- Open DevTools (F12)
- Check Console for errors
- Check Network tab for API requests
- Use the browser console:
  ```javascript
  State  // View current state
  localStorage.getItem('mov-web-state')  // View saved data
  ```

## Legal Disclaimer

This project is for **educational purposes only**. Users are responsible for complying with local laws regarding content streaming. The maintainers are not responsible for misuse or legal issues arising from this tool.

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see LICENSE file for details

## Acknowledgments

- [ani-web](https://github.com/your-org/ani-web) - Architecture inspiration
- [FlixHQ.to](https://flixhq.to) - Content aggregation
- [Pico CSS](https://picocss.com) - Minimal CSS framework
- [HLS.js](https://github.com/video-dev/hls.js) - HLS streaming

## Support

- **Issues**: Report bugs on [GitHub Issues](https://github.com/your-org/mov-web/issues)
- **Discussions**: Chat on [GitHub Discussions](https://github.com/your-org/mov-web/discussions)
- **Docs**: Read full documentation in `/docs`

---

**⚠️ Notice**: This project interacts with third-party services and aggregators. Use responsibly and in compliance with local laws.
