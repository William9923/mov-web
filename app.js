/**
 * mov-web Watch Page Logic
 * Handles iframe video streaming, episode/season management
 */

// ============================================================================
// CONSTANTS & STATE
// ============================================================================

const HISTORY_KEY = 'mov-web-history'
const WATCHED_EPISODES_KEY = 'mov-web-watched-episodes'

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
// API CALLS
// ============================================================================

/**
 * Load and play an episode or movie
 */
async function resolveAndPlay(mediaId, dataId, type, season, episode) {
  showLoading()
  try {
    const params = new URLSearchParams({ mediaId, dataId, type })
    // pass title from page, season+episode if TV
    const titleEl = document.getElementById('title')
    if (titleEl?.textContent) params.set('title', titleEl.textContent)
    if (season) params.set('season', season)
    if (episode) params.set('episode', episode)

    const response = await fetch('/api/resolve?' + params)
    const data = await response.json()

    if (!response.ok) throw new Error(data.error || `API error ${response.status}`)
    if (!data.embedUrl) throw new Error('No embed URL returned')

    const iframe = document.getElementById('embed-iframe')
    iframe.src = data.embedUrl

    const vc = document.getElementById('video-container')
    if (vc) vc.style.display = ''

    hideLoading()
    markEpisodeWatched(mediaId, dataId)
    saveToHistory(mediaId, type, titleEl?.textContent || 'Unknown')

    const episodeBtn = document.getElementById(`episode-${dataId}`)
    if (episodeBtn) episodeBtn.classList.add('watched')

  } catch (error) {
    console.error('[resolveAndPlay] error:', error)
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

    const episodeList = document.getElementById('episode-list')
    if (!episodeList) return

    episodeList.innerHTML = ''

    const watched = getWatchedEpisodes(mediaId)

    episodes.forEach((episode, index) => {
      const btn = document.createElement('button')
      btn.id = `episode-${episode.id}`
      btn.className = 'episode-pill'
      btn.textContent = index + 1
      btn.dataset.title = episode.title || `Episode ${index + 1}`

      if (watched.includes(episode.id)) {
        btn.classList.add('watched')
      }

      btn.onclick = () => {
        // Mark previous active pill inactive
        episodeList.querySelectorAll('.episode-pill.active')
          .forEach(p => p.classList.remove('active'))
        btn.classList.add('active')
        btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
        
        // Extract season number from selected season option text
        const seasonText = document.getElementById('season-select')?.selectedOptions[0]?.textContent || ''
        const seasonNum = parseInt(seasonText.match(/\d+/)?.[0]) || 1
        
        resolveAndPlay(mediaId, episode.id, 'tv', seasonNum, index + 1)
      }

      episodeList.appendChild(btn)
    })

  } catch (error) {
    console.error('Load episodes error:', error)
    showError('Failed to load episodes: ' + error.message)
  }
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

  // Load based on type
  if (params.type === 'tv') {
    // For TV: show season/episode selection, then hide loader (user picks an episode)
    const tvControls = document.getElementById('tv-controls')
    if (tvControls) tvControls.style.display = 'flex'

    await loadSeasons(numericId)
    hideLoading()
  } else if (params.type === 'movie') {
    // For movies: auto-play immediately
    await resolveAndPlay(numericId, numericId, 'movie')
  }
}

// Run on DOM ready
document.addEventListener('DOMContentLoaded', initPage)
