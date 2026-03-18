/**
 * mov-web Frontend Logic
 * Handles state management, API calls, and UI interactions
 */

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

const State = {
  currentSearch: '',
  currentResults: [],
  selectedMedia: null,
  currentSeason: null,
  currentEpisode: null,
  selectedServer: null,
  selectedQuality: '1080',
  selectedSubtitles: 'english',
  watchHistory: [],
  favorites: [],
  isSearching: false,
  currentlyPlaying: null,
  subtitlesArray: []
}

// ============================================================================
// DOM SELECTORS
// ============================================================================

const DOM = {
  searchInput: document.getElementById('search-input'),
  searchBtn: document.getElementById('search-btn'),
  loading: document.getElementById('loading'),
  results: document.getElementById('results'),
  emptyState: document.getElementById('empty-state'),

  // Modal
  modal: document.getElementById('media-modal'),
  modalTitle: document.getElementById('modal-title'),
  modalPoster: document.getElementById('modal-poster'),
  modalClose: document.getElementById('modal-close'),
  mediaTitle: document.getElementById('media-title'),
  mediaYear: document.getElementById('media-year'),
  mediaType: document.getElementById('media-type'),
  mediaDescription: document.getElementById('media-description'),
  tvSection: document.getElementById('tv-section'),
  seasonSelect: document.getElementById('season-select'),
  episodeList: document.getElementById('episode-list'),
  serverSelect: document.getElementById('server-select'),
  qualityModalSelect: document.getElementById('quality-modal-select'),
  subtitlesModalSelect: document.getElementById('subtitles-modal-select'),
  modalPlay: document.getElementById('modal-play'),
  modalCancel: document.getElementById('modal-cancel'),

  // Player
  playerContainer: document.getElementById('player-container'),
  video: document.getElementById('video'),
  playerTitle: document.getElementById('player-title'),
  playerBack: document.getElementById('player-back'),
  qualitySelect: document.getElementById('quality-select'),
  subtitlesSelect: document.getElementById('subtitles-select'),
  fullscreenBtn: document.getElementById('fullscreen-btn'),

  // FAB Menu
  fabMenu: document.getElementById('fab-menu'),
  fabToggle: document.getElementById('fab-toggle'),
  themeToggle: document.getElementById('theme-toggle'),
  historyBtn: document.getElementById('history-btn'),
  favoritesBtn: document.getElementById('favorites-btn'),
  settingsBtn: document.getElementById('settings-btn'),
  aboutBtn: document.getElementById('about-btn')
}

// ============================================================================
// LOCALSTORAGE PERSISTENCE
// ============================================================================

function loadState() {
  const saved = localStorage.getItem('mov-web-state')
  if (saved) {
    const parsed = JSON.parse(saved)
    State.watchHistory = parsed.watchHistory || []
    State.favorites = parsed.favorites || []
    State.selectedQuality = parsed.selectedQuality || '1080'
    State.selectedSubtitles = parsed.selectedSubtitles || 'english'
  }

  const theme = localStorage.getItem('mov-web-theme')
  if (theme) {
    document.documentElement.setAttribute('data-theme', theme)
  }
}

function saveState() {
  localStorage.setItem('mov-web-state', JSON.stringify({
    watchHistory: State.watchHistory,
    favorites: State.favorites,
    selectedQuality: State.selectedQuality,
    selectedSubtitles: State.selectedSubtitles
  }))
}

function addToWatchHistory(media) {
  // Remove if already exists
  State.watchHistory = State.watchHistory.filter(m => m.id !== media.id)
  // Add to beginning
  State.watchHistory.unshift(media)
  // Keep last 20
  State.watchHistory = State.watchHistory.slice(0, 20)
  saveState()
}

function addToFavorites(media) {
  if (!State.favorites.find(m => m.id === media.id)) {
    State.favorites.unshift(media)
    saveState()
  }
}

function removeFromFavorites(mediaId) {
  State.favorites = State.favorites.filter(m => m.id !== mediaId)
  saveState()
}

// ============================================================================
// API CALLS
// ============================================================================

async function apiCall(endpoint, params = {}) {
  try {
    const url = new URL(endpoint, window.location.origin)
    Object.entries(params).forEach(([key, value]) => {
      if (value) url.searchParams.set(key, value)
    })

    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    return await response.json()
  } catch (error) {
    console.error('API Error:', error, endpoint)
    throw error
  }
}

async function search(query) {
  if (!query || query.length < 2) return []
  try {
    State.isSearching = true
    DOM.loading.classList.add('active')
    const results = await apiCall('/api/search', { query })
    State.currentResults = results
    State.isSearching = false
    DOM.loading.classList.remove('active')
    return results
  } catch (error) {
    State.isSearching = false
    DOM.loading.classList.remove('active')
    console.error('Search error:', error)
    return []
  }
}

async function getMedia(id, type = 'movie') {
  try {
    return await apiCall(`/api/media/${id}`, { type })
  } catch (error) {
    console.error('Media fetch error:', error)
    return null
  }
}

async function getEpisodes(seasonId, mediaId) {
  try {
    return await apiCall(`/api/episodes/${seasonId}`, { mediaId })
  } catch (error) {
    console.error('Episodes fetch error:', error)
    return []
  }
}

async function getServers(episodeId, mediaId) {
  try {
    return await apiCall(`/api/servers/${episodeId}`, { mediaId })
  } catch (error) {
    console.error('Servers fetch error:', error)
    return []
  }
}

async function getEmbed(serverId, mediaId, episodeId = null) {
  try {
    const params = { mediaId }
    if (episodeId) params.episodeId = episodeId
    return await apiCall(`/api/embed/${serverId}`, params)
  } catch (error) {
    console.error('Embed fetch error:', error)
    return null
  }
}

async function proxyUrl(url, quality = '1080', subsLanguage = 'english') {
  try {
    return await apiCall('/api/proxy', {
      url,
      quality,
      subs_language: subsLanguage
    })
  } catch (error) {
    console.error('Proxy error:', error)
    return null
  }
}

// ============================================================================
// UI RENDERING
// ============================================================================

function renderSearchResults(results) {
  if (results.length === 0) {
    DOM.results.innerHTML = ''
    DOM.emptyState.style.display = State.currentSearch.length < 2 ? 'block' : 'none'
    return
  }

  DOM.emptyState.style.display = 'none'
  DOM.results.innerHTML = results.map(media => `
    <div class="result-card" data-id="${media.id}" data-type="${media.type}">
      <img 
        src="${media.image || 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22150%22 height=%22225%22%3E%3Crect fill=%22%23ccc%22 width=%22150%22 height=%22225%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%23999%22 font-size=%2214%22%3ENo Image%3C/text%3E%3C/svg%3E'}"
        alt="${media.title}"
        loading="lazy"
        onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22150%22 height=%22225%22%3E%3Crect fill=%22%23ddd%22 width=%22150%22 height=%22225%22/%3E%3C/svg%3E'"
      >
      <div class="result-card-info">
        <div class="result-card-title">${media.title}</div>
        <div class="result-card-meta">
          <span>${media.year || 'N/A'}</span>
          <span class="result-card-type">${media.type.toUpperCase()}</span>
        </div>
      </div>
    </div>
  `).join('')

  // Attach click handlers
  DOM.results.querySelectorAll('.result-card').forEach(card => {
    card.addEventListener('click', async () => {
      const id = card.dataset.id
      const type = card.dataset.type
      const title = card.querySelector('.result-card-title').textContent
      const image = card.querySelector('img').src
      const year = card.querySelector('.result-card-meta span').textContent

      await showMediaModal(id, type, title, image, year)
    })
  })
}

async function showMediaModal(id, type, title, image, year) {
  State.selectedMedia = { id, type, title, image, year }
  addToWatchHistory({ id, type, title, image, year })

  const media = await getMedia(id, type)
  if (!media) {
    alert('Failed to load media details')
    return
  }

  Object.assign(State.selectedMedia, media)

  // Update modal
  DOM.modalTitle.textContent = title
  DOM.mediaTitle.textContent = title
  DOM.mediaYear.textContent = year
  DOM.mediaType.textContent = type.toUpperCase()
  DOM.modalPoster.src = image
  DOM.mediaDescription.textContent = media.description || 'No description available'

  // Handle TV shows vs Movies
  if (type === 'tv') {
    DOM.tvSection.classList.add('active')
    // TODO: Populate seasons dropdown
    DOM.seasonSelect.innerHTML = '<option>Loading seasons...</option>'
  } else {
    DOM.tvSection.classList.remove('active')
    DOM.serverSelect.innerHTML = '<option>Select Server</option>'
    if (media.servers && media.servers.length > 0) {
      media.servers.forEach(server => {
        const option = document.createElement('option')
        option.value = server.id
        option.textContent = server.name
        DOM.serverSelect.appendChild(option)
      })
    }
  }

  DOM.modal.showModal()
}

function hideModal() {
  DOM.modal.close()
  State.selectedMedia = null
  State.currentSeason = null
  State.currentEpisode = null
  State.selectedServer = null
}

async function playMedia() {
  if (!State.selectedMedia) return

  if (State.selectedMedia.type === 'tv') {
    // For TV, require season, episode, and server selection
    if (!State.currentSeason || !State.currentEpisode || !State.selectedServer) {
      alert('Please select season, episode, and server')
      return
    }
  } else {
    // For movies, require server selection
    if (!State.selectedServer) {
      alert('Please select a server')
      return
    }
  }

  hideModal()
  await startPlayback()
}

async function startPlayback() {
  try {
    DOM.playerContainer.classList.add('active')
    DOM.playerTitle.textContent = State.selectedMedia.title

    // Get embed data
    const embed = await getEmbed(
      State.selectedServer,
      State.selectedMedia.id,
      State.currentEpisode
    )

    if (!embed || !embed.url) {
      alert('Failed to get video stream')
      DOM.playerContainer.classList.remove('active')
      return
    }

    // Store subtitles for later use
    State.subtitlesArray = embed.subtitles || []
    updateSubtitleSelect()

    // Apply quality rewriting
    const m3u8Url = embed.url.replace(/\/playlist\.m3u8$/, `/${State.selectedQuality}/index.m3u8`)

    // Load video
    if (HLS && m3u8Url.includes('.m3u8')) {
      // Use HLS.js for m3u8 streams
      if (DOM.video.hls) {
        DOM.video.hls.destroy()
      }
      const hls = new HLS()
      hls.loadSource(m3u8Url)
      hls.attachMedia(DOM.video)
      DOM.video.hls = hls
    } else {
      // Direct video source
      DOM.video.src = m3u8Url
    }

    DOM.video.play()
  } catch (error) {
    console.error('Playback error:', error)
    alert('Playback failed: ' + error.message)
    DOM.playerContainer.classList.remove('active')
  }
}

function updateSubtitleSelect() {
  DOM.subtitlesSelect.innerHTML = '<option value="">No Subtitles</option>'
  if (State.subtitlesArray.length > 0) {
    State.subtitlesArray.forEach((sub, i) => {
      const option = document.createElement('option')
      option.value = i
      option.textContent = sub.label || `Subtitle ${i + 1}`
      DOM.subtitlesSelect.appendChild(option)
    })
  }
}

function goBackToModal() {
  if (DOM.video.hls) {
    DOM.video.hls.destroy()
  }
  DOM.video.src = ''
  DOM.playerContainer.classList.remove('active')
  if (State.selectedMedia) {
    showMediaModal(
      State.selectedMedia.id,
      State.selectedMedia.type,
      State.selectedMedia.title,
      State.selectedMedia.image,
      State.selectedMedia.year
    )
  }
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'light'
  const newTheme = currentTheme === 'light' ? 'dark' : 'light'
  document.documentElement.setAttribute('data-theme', newTheme)
  localStorage.setItem('mov-web-theme', newTheme)

  // Update icon
  if (newTheme === 'dark') {
    DOM.themeToggle.innerHTML = '<i class="fas fa-sun"></i>'
  } else {
    DOM.themeToggle.innerHTML = '<i class="fas fa-moon"></i>'
  }
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

// Search
let searchTimeout
DOM.searchInput.addEventListener('input', (e) => {
  clearTimeout(searchTimeout)
  State.currentSearch = e.target.value

  if (State.currentSearch.length < 2) {
    DOM.results.innerHTML = ''
    DOM.emptyState.style.display = 'block'
    return
  }

  searchTimeout = setTimeout(async () => {
    const results = await search(State.currentSearch)
    renderSearchResults(results)
  }, 300)
})

DOM.searchBtn.addEventListener('click', async () => {
  const results = await search(State.currentSearch)
  renderSearchResults(results)
})

// Modal controls
DOM.modalClose.addEventListener('click', hideModal)
DOM.modalCancel.addEventListener('click', hideModal)
DOM.modalPlay.addEventListener('click', playMedia)

// Server selection
DOM.serverSelect.addEventListener('change', (e) => {
  State.selectedServer = e.target.value
})

// Quality selection (modal)
DOM.qualityModalSelect.addEventListener('change', (e) => {
  State.selectedQuality = e.target.value
  localStorage.setItem('mov-web-quality', State.selectedQuality)
})

// Subtitles selection (modal)
DOM.subtitlesModalSelect.addEventListener('change', (e) => {
  State.selectedSubtitles = e.target.value
})

// Quality selection (player)
DOM.qualitySelect.addEventListener('change', (e) => {
  State.selectedQuality = e.target.value
  if (DOM.video.hls) {
    // TODO: Switch quality in HLS.js
  }
})

// Subtitles selection (player)
DOM.subtitlesSelect.addEventListener('change', (e) => {
  const subIndex = parseInt(e.target.value)
  if (!isNaN(subIndex) && State.subtitlesArray[subIndex]) {
    // TODO: Load and display subtitles
    const sub = State.subtitlesArray[subIndex]
    console.log('Loading subtitle:', sub)
  }
})

// Player controls
DOM.playerBack.addEventListener('click', goBackToModal)
DOM.fullscreenBtn.addEventListener('click', () => {
  if (DOM.video.requestFullscreen) {
    DOM.video.requestFullscreen()
  }
})

// FAB Menu
DOM.fabToggle.addEventListener('click', () => {
  DOM.fabMenu.classList.toggle('open')
})

// Theme toggle
DOM.themeToggle.addEventListener('click', toggleTheme)

// History button
DOM.historyBtn.addEventListener('click', () => {
  console.log('Watch history:', State.watchHistory)
  // TODO: Show history modal
})

// Favorites button
DOM.favoritesBtn.addEventListener('click', () => {
  console.log('Favorites:', State.favorites)
  // TODO: Show favorites modal
})

// Settings button
DOM.settingsBtn.addEventListener('click', () => {
  console.log('Settings')
  // TODO: Show settings modal
})

// About button
DOM.aboutBtn.addEventListener('click', () => {
  alert('mov-web v0.1.0\nStream movies and TV shows from your browser\n\nBuilt with Node.js, vanilla JS, and Pico CSS')
})

// Close FAB menu when clicking outside
document.addEventListener('click', (e) => {
  if (!DOM.fabMenu.contains(e.target)) {
    DOM.fabMenu.classList.remove('open')
  }
})

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  loadState()
  DOM.emptyState.style.display = 'block'

  // Set initial theme icon
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'light'
  if (currentTheme === 'dark') {
    DOM.themeToggle.innerHTML = '<i class="fas fa-sun"></i>'
  } else {
    DOM.themeToggle.innerHTML = '<i class="fas fa-moon"></i>'
  }

  console.log('🎬 mov-web loaded!')
})
