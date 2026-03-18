/**
 * mov-web Watch Page Logic
 * Handles HLS video streaming, episode/season management, quality selection, subtitles
 */

// ============================================================================
// CONSTANTS & STATE
// ============================================================================

const HISTORY_KEY = 'mov-web-history'
const WATCHED_EPISODES_KEY = 'mov-web-watched-episodes'

let currentHls = null
let currentMediaId = null
let currentDataId = null
let currentType = null

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Extract numeric ID from slug ID
 * "movie/watch-the-matrix-12345" → "12345"
 * "tv/watch-breaking-bad-67890" → "67890"
 */
function getNumericId(slugId) {
  const match = slugId.match(/(\d+)$/)
  return match ? match[1] : null
}

/**
 * Wrap URL in /api/proxy for CORS bypass
 */
function proxyUrl(url) {
  return '/api/proxy?url=' + encodeURIComponent(url)
}

/**
 * Get URL parameters from current page
 */
function getUrlParams() {
  const params = new URLSearchParams(window.location.search)
  return {
    id: params.get('id'),
    type: params.get('type'),
    title: params.get('title')
  }
}

/**
 * Save item to watch history
 */
function saveToHistory(id, type, title) {
  try {
    let history = JSON.parse(localStorage.getItem(HISTORY_KEY)) || []
    
    // Remove if already exists (to update timestamp)
    history = history.filter(item => item.id !== id)
    
    // Add to front
    history.unshift({
      id,
      type,
      title,
      timestamp: new Date().toISOString()
    })
    
    // Keep last 50 items
    history = history.slice(0, 50)
    
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history))
  } catch (e) {
    console.error('Failed to save to history:', e)
  }
}

/**
 * Get watched episodes for a media item
 */
function getWatchedEpisodes(mediaId) {
  try {
    const watched = JSON.parse(localStorage.getItem(WATCHED_EPISODES_KEY)) || {}
    return watched[mediaId] || []
  } catch (e) {
    console.error('Failed to get watched episodes:', e)
    return []
  }
}

/**
 * Mark episode as watched
 */
function markEpisodeWatched(mediaId, episodeId) {
  try {
    const watched = JSON.parse(localStorage.getItem(WATCHED_EPISODES_KEY)) || {}
    if (!watched[mediaId]) {
      watched[mediaId] = []
    }
    if (!watched[mediaId].includes(episodeId)) {
      watched[mediaId].push(episodeId)
    }
    localStorage.setItem(WATCHED_EPISODES_KEY, JSON.stringify(watched))
  } catch (e) {
    console.error('Failed to mark episode watched:', e)
  }
}

/**
 * Show loading overlay
 */
function showLoading() {
  const overlay = document.getElementById('loading-overlay')
  if (overlay) overlay.style.display = 'flex'
}

/**
 * Hide loading overlay
 */
function hideLoading() {
  const overlay = document.getElementById('loading-overlay')
  if (overlay) overlay.style.display = 'none'
}

/**
 * Show error message
 */
function showError(message) {
  const errorDiv = document.getElementById('error-message')
  if (errorDiv) {
    errorDiv.textContent = message
    errorDiv.style.display = 'block'
    setTimeout(() => {
      errorDiv.style.display = 'none'
    }, 5000)
  }
}

// ============================================================================
// HLS & VIDEO PLAYER SETUP
// ============================================================================

/**
 * Setup HLS player with quality selection and subtitles
 */
function setupHls(m3u8Url, video, subtitles = []) {
  return new Promise((resolve, reject) => {
    try {
      // Destroy previous HLS instance
      if (currentHls) {
        currentHls.destroy()
      }

      if (!Hls.isSupported()) {
        showError('HLS is not supported by your browser')
        reject(new Error('HLS not supported'))
        return
      }

      const hls = new Hls({
        maxBufferLength: 30,
        maxMaxBufferLength: 90,
        autoStartLoad: true
      })

      const proxiedUrl = proxyUrl(m3u8Url)
      hls.loadSource(proxiedUrl)
      hls.attachMedia(video)

      currentHls = hls

      // When manifest is parsed, setup quality levels
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        renderQualityBar(hls.levels)
        renderSubtitleSelector(subtitles, video)
        video.play()
        hideLoading()
        resolve(hls)
      })

      // Handle quality switch
      hls.on(Hls.Events.LEVEL_SWITCHED, () => {
        updateQualityButtonStyles()
      })

      // Handle errors
      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          console.error('Fatal HLS error:', data)
          showError('Playback error: ' + data.details)
          hls.destroy()
          reject(new Error('HLS error: ' + data.details))
        }
      })

    } catch (error) {
      console.error('HLS setup error:', error)
      showError('Failed to setup video player')
      reject(error)
    }
  })
}

/**
 * Render quality selection buttons
 */
function renderQualityBar(levels) {
  const qualityBar = document.getElementById('quality-bar')
  if (!qualityBar) return

  qualityBar.innerHTML = ''

  // Auto button
  const autoBtn = document.createElement('button')
  autoBtn.textContent = 'Auto'
  autoBtn.className = 'quality-btn'
  autoBtn.id = 'quality-auto'
  autoBtn.onclick = () => {
    currentHls.currentLevel = -1
    updateQualityButtonStyles()
  }
  qualityBar.appendChild(autoBtn)

  // Per-level buttons
  levels.forEach((level, index) => {
    const btn = document.createElement('button')
    btn.textContent = `${level.height}p`
    btn.className = 'quality-btn'
    btn.id = `quality-${index}`
    btn.onclick = () => {
      currentHls.currentLevel = index
      updateQualityButtonStyles()
    }
    qualityBar.appendChild(btn)
  })

  updateQualityButtonStyles()
}

/**
 * Update quality button active states
 */
function updateQualityButtonStyles() {
  if (!currentHls) return

  const buttons = document.querySelectorAll('.quality-btn')
  buttons.forEach(btn => btn.classList.remove('active'))

  if (currentHls.currentLevel === -1) {
    const autoBtn = document.getElementById('quality-auto')
    if (autoBtn) autoBtn.classList.add('active')
  } else {
    const levelBtn = document.getElementById(`quality-${currentHls.currentLevel}`)
    if (levelBtn) levelBtn.classList.add('active')
  }
}

/**
 * Render subtitle selector
 */
function renderSubtitleSelector(subtitles, video) {
  const subtitleSelect = document.getElementById('subtitle-select')
  if (!subtitleSelect) return

  subtitleSelect.innerHTML = '<option value="">No Subtitles</option>'

  subtitles.forEach((sub, index) => {
    const option = document.createElement('option')
    option.value = index
    option.textContent = sub.label || `Subtitle ${index + 1}`
    subtitleSelect.appendChild(option)
  })

  subtitleSelect.onchange = (e) => {
    // Remove existing tracks
    Array.from(video.querySelectorAll('track')).forEach(t => t.remove())

    if (e.target.value !== '') {
      const subIndex = parseInt(e.target.value)
      const sub = subtitles[subIndex]

      const track = document.createElement('track')
      track.kind = 'subtitles'
      track.src = sub.file
      track.label = sub.label || `Subtitle ${subIndex + 1}`
      track.default = true
      video.appendChild(track)
    }
  }
}

// ============================================================================
// API CALLS
// ============================================================================

/**
 * Load and play an episode or movie
 */
async function resolveAndPlay(mediaId, dataId, type) {
  showLoading()
  try {
    const response = await fetch(
      `/api/resolve?mediaId=${mediaId}&dataId=${dataId}&type=${type}`
    )

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }

    const data = await response.json()

    if (!data.sources || !data.sources.length) {
      throw new Error('No video sources available')
    }

    // Find HLS source (or use first source)
    const source = data.sources.find(s => s.hls) || data.sources[0]
    const m3u8Url = source.url

    currentMediaId = mediaId
    currentDataId = dataId
    currentType = type

    // Setup video player
    const video = document.getElementById('video')
    await setupHls(m3u8Url, video, data.subtitles || [])

    // Mark as watched and save to history
    markEpisodeWatched(mediaId, dataId)
    const title = document.getElementById('title')?.textContent || 'Unknown'
    saveToHistory(mediaId, type, title)

    // Update UI if showing episodes (mark watched)
    const episodeBtn = document.getElementById(`episode-${dataId}`)
    if (episodeBtn) {
      episodeBtn.classList.add('watched')
    }

  } catch (error) {
    console.error('Resolve and play error:', error)
    showError('Failed to load video: ' + error.message)
    hideLoading()
  }
}

/**
 * Load seasons for TV show
 */
async function loadSeasons(mediaId) {
  try {
    const response = await fetch(`/api/seasons?mediaId=${mediaId}`)

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }

    const seasons = await response.json()

    const seasonSelect = document.getElementById('season-select')
    if (!seasonSelect) return

    seasonSelect.innerHTML = ''

    seasons.forEach(season => {
      const option = document.createElement('option')
      option.value = season.id
      option.textContent = season.title
      seasonSelect.appendChild(option)
    })

    // Load first season's episodes
    if (seasons.length > 0) {
      seasonSelect.value = seasons[0].id
      await loadEpisodes(seasons[0].id, mediaId)
    }

    // Setup season change handler
    seasonSelect.onchange = async (e) => {
      await loadEpisodes(e.target.value, mediaId)
    }

  } catch (error) {
    console.error('Load seasons error:', error)
    showError('Failed to load seasons: ' + error.message)
  }
}

/**
 * Load episodes for a season
 */
async function loadEpisodes(seasonId, mediaId) {
  try {
    const response = await fetch(`/api/episodes?seasonId=${seasonId}`)

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }

    const episodes = await response.json()

    const episodeGrid = document.getElementById('episode-grid')
    if (!episodeGrid) return

    episodeGrid.innerHTML = ''

    const watched = getWatchedEpisodes(mediaId)

    episodes.forEach(episode => {
      const btn = document.createElement('button')
      btn.id = `episode-${episode.id}`
      btn.className = 'episode-btn'
      btn.textContent = episode.title

      if (watched.includes(episode.id)) {
        btn.classList.add('watched')
      }

      btn.onclick = () => {
        resolveAndPlay(mediaId, episode.id, 'tv')
      }

      episodeGrid.appendChild(btn)
    })

  } catch (error) {
    console.error('Load episodes error:', error)
    showError('Failed to load episodes: ' + error.message)
  }
}

// ============================================================================
// KEYBOARD SHORTCUTS
// ============================================================================

/**
 * Setup keyboard shortcuts
 */
function setupKeyboardShortcuts(video) {
  document.addEventListener('keydown', (e) => {
    if (!video) return

    // Don't interfere with form inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') {
      return
    }

    switch (e.code) {
      case 'Space':
        e.preventDefault()
        video.paused ? video.play() : video.pause()
        break

      case 'ArrowRight':
        e.preventDefault()
        video.currentTime = Math.min(video.currentTime + 10, video.duration)
        break

      case 'ArrowLeft':
        e.preventDefault()
        video.currentTime = Math.max(video.currentTime - 10, 0)
        break

      case 'KeyM':
        e.preventDefault()
        video.muted = !video.muted
        break

      case 'KeyF':
        e.preventDefault()
        if (document.fullscreenElement) {
          document.exitFullscreen()
        } else {
          video.requestFullscreen()
        }
        break
    }
  })
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Main initialization on page load
 */
async function initPage() {
  const params = getUrlParams()

  if (!params.id || !params.type) {
    showError('Invalid URL parameters')
    return
  }

  // Display title
  const titleEl = document.getElementById('title')
  if (titleEl) {
    titleEl.textContent = params.title || 'Watch'
  }

  // Get numeric ID from slug
  const numericId = getNumericId(params.id)
  if (!numericId) {
    showError('Invalid media ID')
    return
  }

  // Setup keyboard shortcuts
  const video = document.getElementById('video')
  if (video) {
    setupKeyboardShortcuts(video)
  }

  // Load based on type
  if (params.type === 'tv') {
    // For TV: show season/episode selection
    const tvControls = document.getElementById('tv-controls')
    if (tvControls) tvControls.style.display = 'block'
    
    await loadSeasons(numericId)
  } else if (params.type === 'movie') {
    // For movies: auto-play immediately
    await resolveAndPlay(numericId, numericId, 'movie')
  }
}

// Run on DOM ready
document.addEventListener('DOMContentLoaded', initPage)
