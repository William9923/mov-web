# MOV-CLI: Comprehensive Technical Architecture Research

**Repository**: https://github.com/mov-cli/mov-cli  
**Current Version**: v4.4.20 (Unmaintained as of 2025)  
**Language**: Python 3.10+  
**License**: MIT

---

## 1. ARCHITECTURE OVERVIEW

mov-cli is a **plugin-based CLI framework** for searching and streaming media. It follows a modular architecture where:

- **Core Framework** = Search, metadata handling, player management, configuration
- **Scrapers** = Media search and source resolution (provided by external plugins)
- **Players** = Media playback engines (built-in: MPV, VLC, IINA, SyncPlay)

### Key Insight
mov-cli itself provides **NO built-in scrapers**. All scrapers are provided by third-party plugins that must be installed and configured separately.

```
┌─────────────────────────────────────────────────────────────┐
│                    mov-cli Framework                         │
├─────────────────────────────────────────────────────────────┤
│  CLI Interface (typer)                                       │
│  ├─ Configuration Management (TOML)                          │
│  ├─ Plugin System (Dynamic Loading)                          │
│  └─ Player Management                                        │
├─────────────────────────────────────────────────────────────┤
│  Core Components                                             │
│  ├─ Scraper Base Class (Abstract)                            │
│  ├─ Metadata System (Search Results)                         │
│  ├─ Media Objects (Single/Multi-episode)                     │
│  ├─ HTTP Client (httpx wrapper)                              │
│  └─ Cache System                                             │
├─────────────────────────────────────────────────────────────┤
│  Plugin Ecosystem (External)                                 │
│  ├─ Plugin 1: YouTube (mov-cli-youtube)                      │
│  ├─ Plugin 2: Files (mov-cli-files)                          │
│  ├─ Plugin 3: JellyPlex (mov-cli-jellyplex)                  │
│  └─ ... More Community Plugins                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. DATA FLOW: Search Query → Streaming URL

### Complete End-to-End Flow

```
USER INPUT
   ↓
[CLI Interface: __main__.py]
   ├─ Parse: mov-cli "query string" -s youtube
   ├─ Load config (TOML)
   ├─ Select scraper (if not specified)
   ↓
[Scraper Selection: cli/scraper.py]
   ├─ Load plugins from config
   ├─ select_scraper() → interactive plugin/scraper selection
   ├─ use_scraper() → instantiate chosen scraper class
   ↓
[SEARCH PHASE: cli/search.py]
   ├─ scraper.search(query) → yields Metadata objects
   │  └─ (Metadata: id, title, type, image_url, year, etc.)
   ├─ Display results with fzf (or interactive prompt)
   ├─ User selects one result
   ↓
[METADATA ENRICHMENT]
   ├─ Fetch extra metadata (description, cast, genres, etc.)
   ├─ Cache image URLs for preview
   ↓
[EPISODE SELECTION: cli/episode.py]
   ├─ For TV Series (MetadataType.MULTI):
   │  └─ Query scraper.scrape_episodes() → {season: episode_count}
   │     └─ Present season/episode selector
   ├─ For Movies (MetadataType.SINGLE):
   │  └─ Use default episode
   ↓
[SCRAPING PHASE: cli/scraper.py → scraper.scrape()]
   ├─ scraper.scrape(metadata, episode_selector)
   ├─ Scraper queries source website/API
   ├─ Scraper extracts streaming URL
   ├─ Returns Media object containing:
   │  ├─ url (actual m3u8, mp4, or direct stream URL)
   │  ├─ title
   │  ├─ audio_url (optional, separate audio track)
   │  ├─ referrer (HTTP Referer header if required)
   │  └─ subtitles (list of .srt or subtitle URLs)
   ↓
[ERROR HANDLING: main_loop.py]
   ├─ If scraper fails AND auto_try_next_scraper enabled:
   │  └─ use_next_scraper() → try alternative scraper
   ├─ Otherwise fail with error
   ↓
[PLAYBACK/DOWNLOAD]
   ├─ Option A: PLAY via player.play(media)
   │  └─ Instantiate player (MPV, VLC, etc.)
   │  └─ Pass media.url + referrer + subtitles
   │  └─ Watch options (next/previous episode, quality display)
   │
   └─ Option B: DOWNLOAD via Download.download(media)
      └─ Use yt-dlp (preferred) or ffmpeg
      └─ Handle audio_url merging
      └─ Save to configured location
```

### Key Data Objects

#### Metadata (Search Result)
```python
@dataclass
class Metadata:
    id: str                    # Unique identifier from source
    title: str                 # Display name
    type: MetadataType        # SINGLE (movie) or MULTI (series)
    image_url: Optional[str]   # Banner/cover for preview
    year: Optional[str]        # Release year
    extra_func: Callable      # Lazy-load extra metadata
```

#### Media (Streamable Content)
```python
class Media:
    url: str                  # Streaming URL (m3u8, mp4, etc.)
    title: str                # Title for display
    audio_url: Optional[str]  # Separate audio track URL
    referrer: Optional[str]   # Required HTTP Referer
    subtitles: Optional[List[str]]  # Subtitle URLs/paths

# For Series:
class Multi(Media):
    episode: EpisodeSelector  # S01E05 format

# For Movies:
class Single(Media):
    year: Optional[str]       # Release year
```

---

## 3. HOW MOV-CLI SEARCHES FOR MOVIES

### The Scraper Base Class

All scrapers inherit from `Scraper` (in `mov_cli/scraper.py`):

```python
class Scraper(ABC):
    def __init__(
        self, 
        config: Config, 
        http_client: HTTPClient, 
        options: Optional[ScraperOptionsT] = None
    ) -> None:
        self.config = config
        self.http_client = http_client  # Shared HTTP client with rate limiting
        self.options = options or {}    # CLI-passed scraper options

    @abstractmethod
    def search(self, query: str, limit: Optional[int] = None) -> Iterable[Metadata]:
        """Yield/return search results as Metadata objects"""
        ...

    @abstractmethod
    def scrape(self, metadata: Metadata, episode: EpisodeSelector) -> Optional[Multi | Single]:
        """Extract streaming URL and return Media object"""
        ...

    def scrape_episodes(self, metadata: Metadata) -> Dict[int, int]:
        """Return {season_number: episode_count} for TV series"""
        return {None: 1}  # Default: single movie
```

### Search Process Flow

1. **Query Parsing** (`cli/search.py`):
   - User provides search query
   - Optional: `--limit 20` to restrict results
   - Optional: `--choice 1` for auto-select first result

2. **Scraper Search Call**:
   ```python
   search_results = scraper.search(query, limit)  # Generator or list
   # Yields Metadata objects
   ```

3. **Result Presentation**:
   - Uses **fzf** (Fuzzy Finder) if installed and enabled
   - Falls back to inquirer (interactive terminal UI)
   - Can preview images if `preview: true` in config
   - Caches images locally for quick preview

4. **Result Selection**:
   - User picks one Metadata
   - If it's a series, query `scrape_episodes()` to get season/episode counts

### HTTP Client

mov-cli provides a **shared HTTP client** wrapper around httpx:

```python
class HTTPClient:
    def request(
        self, 
        method: Literal["GET", "POST", ...],
        url: str, 
        params: Optional[Dict[str, str]] = None,
        headers: Optional[Dict[str, str]] = None,
        include_default_headers: bool = False,
        redirect: bool = False,
        **kwargs
    ) -> httpx.Response:
        # Adds default headers (User-Agent, etc.)
        # Can hide IP via proxy or VPN (configurable)
        # 15s timeout by default
        # SSL verification
```

**Default Headers** (from config):
```toml
[mov-cli.http]
# User-Agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/117.0"
timeout = 15
```

---

## 4. HOW MOV-CLI RESOLVES VIDEO URLS

### The Scraping Phase

Once a user selects metadata and episode:

1. **Call `scraper.scrape(metadata, episode_selector)`**:
   - Scraper implements custom logic to extract streaming URL
   - Could use:
     - **HTML Scraping** (BeautifulSoup with lxml parser)
     - **API Calls** (JSON responses)
     - **JavaScript Execution** (via Selenium, Playwright, etc. - plugin's choice)

2. **URL Resolution Process** (Plugin-Specific):
   Each plugin handles this differently:
   
   **Example: YouTube Scraper (mov-cli-youtube)**:
   - Uses `yt-dlp` library to extract streaming URL from YouTube
   - Returns m3u8 or direct mp4 URL
   - May include subtitles
   
   **Example: Generic Streaming Site**:
   - Parse HTML to find video player embed
   - Extract m3u8 playlist URL from player JavaScript
   - Resolve dash/hls manifest to get direct video chunks
   - Return primary m3u8 URL + optional audio URL
   
   **Example: JellyPlex (mov-cli-jellyplex)**:
   - Connect to local JellyFin/Plex server via API
   - Query media library
   - Return direct streaming URL from server

3. **Return Media Object**:
   ```python
   return Single(
       url="https://example.com/video.mp4",
       title="Movie Title",
       audio_url=None,  # or separate audio URL if needed
       referrer="https://example.com",  # Required for streaming
       year="2023",
       subtitles=["https://example.com/subs.vtt"]
   )
   ```

### URL Resolution Options

| Type | Example | Use Case |
|------|---------|----------|
| **Direct MP4** | `https://cdn.example.com/movie.mp4` | Direct file download/stream |
| **HLS (m3u8)** | `https://cdn.example.com/playlist.m3u8` | Adaptive bitrate streaming |
| **DASH (mpd)** | `https://cdn.example.com/manifest.mpd` | MPEG-DASH adaptive streaming |
| **Local File** | `/home/user/Movies/movie.mp4` | Local filesystem (mov-cli-files plugin) |

### Referrer Requirement

Many sites block direct streaming unless correct HTTP `Referer` header is set:

```python
# In player (e.g., MPV):
args.append(f"--referrer={media.referrer}")

# In download (ffmpeg):
headers = f"Referer: {media.referrer}"
```

### Separate Audio URL

For HLS streams where video and audio are separate:

```python
# In player (e.g., MPV):
if media.audio_url is not None:
    args.append(f"--audio-file={media.audio_url}")

# In download (ffmpeg):
args.extend(["-i", media.audio_url])  # Multiple input files
```

---

## 5. PLUGIN SYSTEM & SCRAPERS

### How Plugins Work

#### Plugin Structure

Each plugin is a Python package that must expose a `plugin` hook:

```python
# mov-cli-youtube/__init__.py (example)

from mov_cli.scraper import Scraper
from .yt_dlp import YTDlpScraper

plugin = {
    "version": 1,
    "package_name": "mov-cli-youtube",  # PyPI package name
    "scrapers": {
        "DEFAULT": YTDlpScraper,
        # Optional: Platform-specific scrapers
        "LINUX.DEFAULT": YTDlpScraper,
        "WINDOWS.DEFAULT": YTDlpScraper,
        "ANDROID.DEFAULT": PyTubeScraper,  # Lightweight for mobile
        # Non-default scrapers (alternative implementations)
        "alternative_scraper": AlternativeScraper,
    }
}
```

#### Plugin Installation

```bash
# Install plugin from PyPI
pip install mov-cli-youtube

# Add to config (~/.config/mov-cli/config.toml)
[mov-cli.plugins]
youtube = "mov-cli-youtube"

# List installed plugins
mov-cli --list-plugins

# Use in search
mov-cli -s youtube "blender studio"
```

#### Plugin Discovery & Loading

```python
# In mov_cli/plugins.py
def load_plugin(module_name: str) -> Optional[Plugin]:
    plugin_module = importlib.import_module(module_name.replace("-", "_"))
    plugin_data = getattr(plugin_module, "plugin", None)
    return Plugin(module=plugin_module, hook_data=plugin_data)
```

### Official/Supported Plugins

The mov-cli team maintains:

1. **mov-cli-youtube** - YouTube videos (uses yt-dlp)
2. **mov-cli-files** - Local filesystem browsing
3. **mov-cli-jellyplex** - JellyFin/Plex server integration

### Community Plugins

Listed on GitHub topic: `#mov-cli-plugin`

Examples:
- **mov-cli-anyanime** - Anime streaming
- **mov-cli-nyaa** - Anime torrenting
- **mov-cli-9anime** - Anime sources
- **mov-cli-hianime** - More anime
- Many others for various streaming services

### Scraper Namespacing

Scrapers can be addressed by namespace:

```
plugin-name.scraper-name

Examples:
- youtube.DEFAULT        → YouTube plugin's default scraper
- youtube.alternative    → Alternative YouTube scraper
- jellyplex.ANDROID.DEFAULT → Mobile JellyPlex scraper
```

### Scraper Options (Arguments)

Scrapers can accept CLI options:

```bash
# Custom scraper argument syntax
mov-cli -s youtube "query" --quality 1080p --subtitles auto

# Captured in scraper.options dict:
# {"quality": "1080p", "subtitles": "auto"}
```

---

## 6. COMPLETE LIST OF SUPPORTED PROVIDERS/SOURCES

Based on GitHub's `#mov-cli-plugin` topic and repository evidence:

### Official Plugins
1. **YouTube** (`mov-cli-youtube`)
   - Uses yt-dlp for extraction
   - Supported: Videos, Playlists, Streams

2. **Local Files** (`mov-cli-files`)
   - Browse filesystem
   - Support for: MP4, MKV, WebM, etc.
   - Use existing media libraries

3. **JellyFin/Plex** (`mov-cli-jellyplex`)
   - Connect to home media server
   - Stream from JellyFin or Plex

### Community Plugins (Examples)
4. **9Anime** (mov-cli-9anime)
5. **HiAnime** (mov-cli-hianime)
6. **Nyaa** (mov-cli-nyaa) - Anime torrent scraping
7. **AnyAnime** (mov-cli-anyanime)
8. And dozens more in the wild

### Notable Technology Stack Per Plugin
- **Scraping**: BeautifulSoup4 + lxml or html.parser
- **Video Extraction**: yt-dlp, pytube, ffmpeg
- **JavaScript Execution**: Some use Selenium/Playwright
- **API Access**: Direct API calls (YouTube, Plex, JellyFin)
- **Parsing**: HLS/DASH manifest parsing

---

## 7. COMPLETE DATA FLOW DIAGRAM

```
TERMINAL INPUT
│
├─────────────────────────────────────────────────┐
│ mov-cli "The Matrix" -s youtube -c 1 -p mpv    │
└──────────────┬──────────────────────────────────┘
               │
         [Parse Arguments]
               │
               ├─ query = "The Matrix"
               ├─ scraper = "youtube"
               ├─ auto_select = 1
               └─ player = "mpv"
               │
               ▼
         [Load Config]
               │
               ├─ ~/.config/mov-cli/config.toml
               ├─ Plugins: {youtube: mov-cli-youtube, ...}
               ├─ Scrapers: {default: youtube}
               └─ Player: mpv
               │
               ▼
         [Load & Initialize Plugin]
               │
               ├─ importlib.import_module("mov_cli_youtube")
               ├─ Get plugin.hook_data
               ├─ Extract YTDlpScraper class
               └─ Instantiate: scraper = YTDlpScraper(config, http_client)
               │
               ▼
         [SEARCH PHASE]
               │
               ├─ scraper.search("The Matrix", limit=20)
               │  │
               │  └─ Uses yt-dlp internally:
               │     ├─ Query YouTube API or scrape search page
               │     ├─ Extract: title, URL, duration, channel, etc.
               │     └─ Yield Metadata objects
               │
               ├─ Metadata Results:
               │  ├─ {id: "vid1", title: "The Matrix - Official Trailer", type: SINGLE, year: "1999", ...}
               │  ├─ {id: "vid2", title: "The Matrix Explained", type: SINGLE, year: "2020", ...}
               │  └─ {id: "vid3", title: "The Matrix - Full Movie (Clip)", type: SINGLE, year: "1999", ...}
               │
               ├─ [Auto-Select]
               │  └─ choice = results[0] (first result due to -c 1)
               │
               ├─ Result (if manual):
               │  └─ Present with fzf/inquirer → User selects
               │
               ▼
         [EPISODE HANDLING]
               │
               ├─ metadata.type == SINGLE (movie, not series)
               └─ episode_selector = EpisodeSelector()  # Defaults to ep 1
               │
               ▼
         [SCRAPING PHASE]
               │
               ├─ scraper.scrape(metadata, episode_selector)
               │  │
               │  └─ Inside YTDlpScraper:
               │     ├─ Use yt-dlp to extract video URL from metadata.id
               │     ├─ Resolve streaming URL (mp4 or m3u8)
               │     ├─ Extract subtitles (if available)
               │     └─ Return Media object
               │
               ├─ Media object returned:
               │  │
               │  └─ Single(
               │       url="https://youtube-cdn.example.com/video.mp4?sig=...",
               │       title="The Matrix - Official Trailer",
               │       referrer="https://youtube.com",
               │       subtitles=["https://youtube.com/captions.vtt"],
               │       year="1999"
               │     )
               │
               ▼
         [PLAYBACK]
               │
               ├─ player.play(media)  # Instantiate MPV
               │  │
               │  └─ MPV.play(media):
               │     ├─ Build command:
               │        mpv --force-media-title="The Matrix" \
               │            --referrer="https://youtube.com" \
               │            --sub-file="https://youtube.com/captions.vtt" \
               │            "https://youtube-cdn.example.com/video.mp4?sig=..."
               │     ├─ subprocess.Popen(args)
               │     └─ Launch MPV player with video
               │
               ├─ [Watch Options]
               │  ├─ If watch_options=true in config:
               │  │  ├─ "next" → Play next episode
               │  │  ├─ "previous" → Play previous
               │  │  ├─ "select" → Choose episode
               │  │  └─ "quit" → Exit
               │  │
               │  └─ Recursively call play() if needed
               │
               ▼
         [STREAMING]
               │
               └─ User watches video in MPV
                  ├─ HTTP stream with referrer header
                  ├─ Subtitles rendered by MPV
                  └─ Auto-continue to next episode if series


[ERROR HANDLING]
If scraper fails AND auto_try_next_scraper=true:
  └─ Find next scraper in same plugin or different plugin
  └─ Retry search/scrape with next scraper
  └─ Repeat until success or all scrapers exhausted
```

---

## 8. TECHNICAL STACK

### Core Dependencies
```toml
httpx                      # Async HTTP client
beautifulsoup4             # HTML/XML parsing
lxml                       # Fast HTML parsing (optional)
typer                      # CLI framework
toml                        # Configuration parsing
inquirer                   # Interactive prompts
thefuzz                    # String fuzzy matching (did you mean?)
python-decouple            # Environment variable loading
devgoldyutils              # Utility functions
deprecation                # Handle deprecated APIs
unidecode                  # Unicode normalization
```

### Media Players (Built-in Support)
- **MPV** (Default, recommended) - Linux, Windows, macOS
- **VLC** - Cross-platform
- **IINA** - macOS only
- **SyncPlay** - Synchronized group watching
- **Custom Player** - User-defined command

### Scrapers (Handled by Plugins)
- **yt-dlp** - YouTube, TikTok, Dailymotion, and 1000+ sites
- **pytube** - Lightweight YouTube for mobile
- **Selenium** - JavaScript execution (some plugins)
- **Playwright** - Modern browser automation
- **Direct API** - JellyFin, Plex APIs

### Quality Detection
- **ffprobe** - Optional, detects stream resolution

### Download Tools (Optional)
- **yt-dlp** - Preferred download tool
- **ffmpeg** - Fallback downloader

---

## 9. CONFIGURATION SYSTEM

### Config File Location
```
Linux:   ~/.config/mov-cli/config.toml
Windows: %APPDATA%\mov-cli\config.toml
macOS:   ~/Library/Application Support/mov-cli/config.toml
```

### Configuration Structure
```toml
[mov-cli]
version = 1
debug = false
player = "mpv"              # Default player
quality = "auto"            # "auto" or specific resolution
skip_update_checker = false
auto_try_next_scraper = false
hide_ip = true              # Enable IP hiding (VPN/proxy)

[mov-cli.ui]
fzf = true                  # Use fzf for selection
preview = true              # Image preview in fzf
watch_options = true        # Show next/prev/select during playback
display_quality = false     # Show detected stream quality
limit = 20                  # Max search results

[mov-cli.plugins]           # Installed plugins
youtube = "mov-cli-youtube"
files = "mov-cli-files"
jellyplex = "mov-cli-jellyplex"

[mov-cli.scrapers]
default = "youtube"         # Default scraper
# Override specific scraper namespace with options
test = { namespace = "youtube.DEFAULT", options = { quality = "1080p" } }

[mov-cli.http]
timeout = 15
# headers = { User-Agent = "Mozilla/5.0 ..." }

[mov-cli.quality]
resolution = 720            # Preferred resolution (if supported)

[mov-cli.subtitles]
language = "en"             # ISO 639-1 code

[mov-cli.downloads]
save_path = "~/Downloads"
yt_dlp = true              # Use yt-dlp for downloads
```

---

## 10. CACHING & STATE

### Cache Locations
```
Linux:   ~/.cache/mov-cli/
Windows: %LOCALAPPDATA%\mov-cli\cache\
macOS:   ~/Library/Caches/mov-cli/
```

### What's Cached
1. **Image URLs** - Cover art/thumbnails for fzf preview
2. **Continue Watching** - Last watched episode per series
3. **Metadata** - Search results (temporary)

### Clearing Cache
```bash
mov-cli --clear-cache
# or
mov-cli --no-cache
```

---

## 11. ERROR HANDLING & RESILIENCE

### Auto-Try-Next-Scraper (ATNS)
If a scraper fails, mov-cli can automatically retry with the next available scraper:

```bash
mov-cli "query" --auto-try-next-scraper
# or in config:
# auto_try_next_scraper = true
```

**Flow**:
```
Scraper 1 fails (search) → Try Scraper 2 (search)
                         → Try Scraper 3 (search)
                         → Try Scraper N (search)
                         → All failed → Error

Scraper 1 succeeds (search) but fails (scrape) → Try next Scraper (both)
```

### Error Types
- **InternalPluginError** - Exception in plugin code
- **SiteMaybeBlockedError** - SSL/Connection issues (site blocking?)
- **ReferrerNotSupportedError** - Player doesn't support referrer (e.g., Android MPV)

---

## 12. PLAYER INTEGRATION

### Player Interface

All players inherit from `Player` base class:

```python
class Player(ABC):
    @abstractmethod
    def play(self, media: Media) -> Optional[subprocess.Popen]:
        """Launch player with streaming URL and metadata"""
        ...
```

### MPV Example

```python
# From mov_cli/players/mpv.py
class MPV(Player):
    def play(self, media: Media) -> Optional[subprocess.Popen]:
        args = [
            "mpv", 
            media.url,
            f"--force-media-title={media.display_name}",
            f"--referrer={media.referrer}",  # Required for streaming
            f"--audio-file={media.audio_url}",  # Separate audio (if needed)
        ]
        
        # Add subtitles
        for subtitle in media.subtitles:
            args.append(f"--sub-file={subtitle}")
        
        return subprocess.Popen(args)
```

### Watch Options

While watching, users can:
- **next** → Play next episode (auto-scrape)
- **previous** → Play previous episode (auto-scrape)
- **select** → Choose specific episode
- **quit** → Exit

---

## 13. LIBRARY USAGE (Advanced)

mov-cli can be used as a Python library:

```python
from mov_cli.config import Config
from mov_cli.http_client import HTTPClient
from mov_cli.utils import EpisodeSelector
from mov_cli_youtube.yt_dlp import YTDlpScraper

# Setup
config = Config()
http_client = HTTPClient()

# Create scraper
scraper = YTDlpScraper(config, http_client)

# Search
results = scraper.search("blender tutorial", limit=5)

# Get first result
metadata = next(results)

# Scrape
media = scraper.scrape(metadata, EpisodeSelector())

# Get streaming URL
print(media.url)
```

**Note**: API is unstable in v4 (breaking changes expected in v4.5)

---

## 14. PROJECT STATUS & MAINTENANCE

### Current State
- **Version**: v4.4.20 (Latest)
- **Status**: Unmaintained (as of announcement)
- **Last Update**: March 2025 (v4.4.19)
- **Contributors**: 20+ (primary: THEGOLDENPRO, ananasmoe, Poseidon444)

### Future Plans
- **v4.5**: Complete rewrite (In progress, low priority)
- **Current**: Feature freeze on v4.4, bug fixes only
- **Plugins**: Many still work, but maintenance depends on plugin authors

### Why Unmaintained?
Developers shifted focus to other projects; insufficient time to maintain both core and ecosystem.

---

## 15. SECURITY & ETHICAL CONSIDERATIONS

### mov-cli is NOT a Piracy Tool
Per official disclaimer (disclaimer.md):
- Tool itself is neutral (framework)
- Plugins determine legality
- Official legal plugins exist:
  - **mov-cli-files** - Local files
  - **mov-cli-jellyplex** - Legitimate media servers (JellyFin, Plex)

### IP Hiding
- Optional `hide_ip: true` in config
- Integrates with VPN/proxy (user configurable)
- No built-in proxy, user must configure system-wide

### SSL/Certificate Handling
- Validates certificates by default
- Can be overridden (insecure)
- Detects blocked sites via SSL errors

---

## SUMMARY TABLE

| Aspect | Details |
|--------|---------|
| **Architecture** | Modular plugin-based framework |
| **Search** | Via plugin's scraper.search() → Metadata |
| **URL Resolution** | Via plugin's scraper.scrape() → Media |
| **Scrapers** | External plugins (not built-in) |
| **Players** | MPV, VLC, IINA, SyncPlay, Custom |
| **Config** | TOML file in user's config dir |
| **Caching** | Image URLs, continue watching, temp files |
| **HTTP** | httpx with configurable headers, timeout |
| **Error Handling** | Plugin errors caught, ATNS fallback |
| **CLI** | typer-based with rich feedback |
| **Download** | yt-dlp or ffmpeg support |
| **Status** | Unmaintained, feature-frozen at v4.4 |
