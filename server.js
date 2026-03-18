const http = require('node:http')
const https = require('node:https')
const { URL } = require('node:url')
const fs = require('node:fs')
const path = require('node:path')

// ============================================================================
// CONFIGURATION
// ============================================================================

require('dotenv').config()

const PORT = process.env.PORT || 9002
const NODE_ENV = process.env.NODE_ENV || 'development'

const FLIXHQ_BASE = process.env.FLIXHQ_BASE || 'flixhq.to'
const FLIXHQ_API = `https://api.${FLIXHQ_BASE}`

const DECRYPTION_API_PRIMARY = process.env.DECRYPTION_API_PRIMARY || 'https://dec.eatmynerds.live'
const DECRYPTION_API_FALLBACK = process.env.DECRYPTION_API_FALLBACK || 'https://decrypt.broggl.farm'

const HTTP_TIMEOUT = parseInt(process.env.HTTP_TIMEOUT || '8000')
const DECRYPTION_TIMEOUT = parseInt(process.env.DECRYPTION_TIMEOUT || '5000')

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0'
const REFERER = `https://${FLIXHQ_BASE}`

// ============================================================================
// UTILITIES
// ============================================================================

function log(message, data = '') {
  if (process.env.LOG_REQUESTS !== 'false') {
    const timestamp = new Date().toISOString()
    console.log(`[${timestamp}] ${message}`, data)
  }
}

function httpsGet(url, headers = {}, timeoutMs = HTTP_TIMEOUT) {
  return new Promise((resolve, reject) => {
    let redirectCount = 0
    const maxRedirects = 5

    function get(urlStr) {
      if (redirectCount >= maxRedirects) {
        return reject(new Error('Too many redirects'))
      }

      const req = https.get(urlStr, { headers }, (res) => {
        let data = ''

        // Handle redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          redirectCount++
          return get(res.headers.location)
        }

        if (res.statusCode !== 200) {
          res.resume()
          return reject(new Error(`HTTP ${res.statusCode}`))
        }

        res.on('data', (chunk) => {
          data += chunk
        })

        res.on('end', () => {
          resolve(data)
        })
      }).on('error', reject)

      req.setTimeout(timeoutMs, () => {
        req.destroy(new Error(`Timeout after ${timeoutMs}ms`))
      })
    }

    get(url)
  })
}

// ============================================================================
// HTML/JSON PARSING FUNCTIONS
// ============================================================================

/**
 * Parse search results HTML from FlixHQ
 * Extracts: img[data-src], href="/movie/...", title attr, year
 */
function parseSearchHTML(html) {
  const results = []
  
  // Match movie/show cards: class="fdi-item"
  const cardRegex = /<div[^>]*class="[^"]*fdi-item[^"]*"[^>]*>[\s\S]*?<\/div>\s*<\/div>/g
  const cards = html.match(cardRegex) || []

  cards.forEach((card) => {
    try {
      // Extract href and title
      const linkMatch = card.match(/<a[^>]*href="\/(?:movie|tv)\/([^"]+)"[^>]*>/)
      if (!linkMatch) return

      const id = linkMatch[1]
      const isMovie = card.includes('/movie/')
      const type = isMovie ? 'movie' : 'tv'

      // Extract title from aria-label or title attribute
      const titleMatch = card.match(/(?:title|aria-label)="([^"]+)"/) || card.match(/>([^<]+)</)
      const title = titleMatch ? titleMatch[1].trim() : 'Unknown'

      // Extract image URL from data-src
      const imageMatch = card.match(/data-src="([^"]+)"/)
      const image = imageMatch ? imageMatch[1] : ''

      // Extract year if present
      const yearMatch = card.match(/(\d{4})/)
      const year = yearMatch ? parseInt(yearMatch[1]) : null

      results.push({
        id,
        title,
        image,
        year,
        type
      })
    } catch (e) {
      // Skip malformed cards
    }
  })

  return results
}

/**
 * Parse media details (movie or TV show)
 */
function parseMediaHTML(html) {
  const media = {
    title: '',
    description: '',
    year: null,
    rating: null,
    image: '',
    type: 'movie',
    seasons: [],
    episodes: [],
    servers: []
  }

  // Extract title
  const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/)
  if (titleMatch) media.title = titleMatch[1].trim()

  // Extract description
  const descMatch = html.match(/<p[^>]*class="[^"]*description[^"]*"[^>]*>([^<]+)<\/p>/)
  if (descMatch) media.description = descMatch[1].trim()

  // Extract year
  const yearMatch = html.match(/(\d{4})/)
  if (yearMatch) media.year = parseInt(yearMatch[1])

  // Extract image
  const imageMatch = html.match(/poster[^>]*src="([^"]+)"/)
  if (imageMatch) media.image = imageMatch[1]

  // Detect if TV show by looking for seasons section
  if (html.includes('seasons')) {
    media.type = 'tv'
  }

  return media
}

/**
 * Parse servers list from HTML
 */
function parseServersHTML(html) {
  const servers = []

  // Match server entries: data-id="...", title="Vidcloud" or "UpCloud"
  const serverRegex = /<div[^>]*data-id="([^"]+)"[^>]*>\s*<div[^>]*>([^<]+)<\/div>/g
  let match

  while ((match = serverRegex.exec(html)) !== null) {
    const id = match[1]
    const name = match[2].trim()

    servers.push({ id, name })
  }

  return servers
}

/**
 * Extract embed link from JSON response
 */
function parseEmbedJSON(json) {
  try {
    const data = JSON.parse(json)
    return data.link || data.url || null
  } catch (e) {
    return null
  }
}

// ============================================================================
// DECRYPTION API
// ============================================================================

/**
 * Decrypt embed URL using decryption API
 */
async function decryptEmbed(embedLink, mediaId) {
  const apis = [
    { name: 'primary', url: DECRYPTION_API_PRIMARY },
    { name: 'fallback', url: DECRYPTION_API_FALLBACK }
  ]

  for (const api of apis) {
    try {
      log(`Attempting decryption via ${api.name}`, embedLink.slice(0, 50))

      const payload = JSON.stringify({
        url: embedLink,
        mediaId: mediaId
      })

      const decryptUrl = new URL(api.url)
      const req = https.request(decryptUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'User-Agent': USER_AGENT
        },
        timeout: DECRYPTION_TIMEOUT
      })

      return new Promise((resolve, reject) => {
        let data = ''

        req.on('response', (res) => {
          if (res.statusCode !== 200) {
            return reject(new Error(`HTTP ${res.statusCode}`))
          }

          res.on('data', (chunk) => {
            data += chunk
          })

          res.on('end', () => {
            try {
              const result = JSON.parse(data)
              log(`Decryption successful (${api.name})`)
              resolve(result)
            } catch (e) {
              reject(new Error('Invalid JSON response'))
            }
          })
        })

        req.on('error', reject)
        req.on('timeout', () => {
          req.destroy(new Error('Decryption timeout'))
        })

        req.write(payload)
        req.end()
      })
    } catch (e) {
      log(`Decryption failed (${api.name})`, e.message)
      continue
    }
  }

  throw new Error('All decryption APIs failed')
}

// ============================================================================
// API HANDLERS
// ============================================================================

/**
 * GET /api/search?query=<query>
 * Returns: [{id, title, image, year, type}]
 */
async function handleSearch(req, res, query) {
  try {
    if (!query || query.length < 2) {
      return sendJSON(res, 400, { error: 'Query too short' })
    }

    log('Search query:', query)

    const url = `${FLIXHQ_API}/v1/search?query=${encodeURIComponent(query)}`
    const html = await httpsGet(url, {
      'User-Agent': USER_AGENT,
      'Referer': REFERER
    })

    const results = parseSearchHTML(html)
    log(`Found ${results.length} results`)

    sendJSON(res, 200, results)
  } catch (e) {
    log('Search error:', e.message)
    sendJSON(res, 500, { error: e.message })
  }
}

/**
 * GET /api/media/:id?type=movie|tv
 * Returns: {title, description, year, type, seasons[], episodes[], servers[]}
 */
async function handleMedia(req, res, id, type = 'movie') {
  try {
    if (!id) {
      return sendJSON(res, 400, { error: 'Missing media ID' })
    }

    log(`Fetching ${type}:`, id)

    const url = `${FLIXHQ_API}/v1/${type === 'tv' ? 'tv' : 'movie'}/${id}`
    const html = await httpsGet(url, {
      'User-Agent': USER_AGENT,
      'Referer': REFERER
    })

    const media = parseMediaHTML(html)
    media.id = id
    media.type = type

    // For TV shows, you'd need to parse seasons here
    // For now, we'll defer season fetching to separate endpoint

    sendJSON(res, 200, media)
  } catch (e) {
    log('Media fetch error:', e.message)
    sendJSON(res, 500, { error: e.message })
  }
}

/**
 * GET /api/episodes/:seasonId?mediaId=<id>
 * Returns: [{id, number, title}]
 */
async function handleEpisodes(req, res, seasonId, mediaId) {
  try {
    if (!seasonId || !mediaId) {
      return sendJSON(res, 400, { error: 'Missing seasonId or mediaId' })
    }

    log(`Fetching episodes for season:`, seasonId)

    const url = `${FLIXHQ_API}/v1/episodes/${seasonId}?mediaId=${mediaId}`
    const html = await httpsGet(url, {
      'User-Agent': USER_AGENT,
      'Referer': REFERER
    })

    // Parse episodes from HTML
    const episodes = []
    const episodeRegex = /<div[^>]*data-id="([^"]+)"[^>]*>\s*<span>(\d+)<\/span>/g
    let match

    while ((match = episodeRegex.exec(html)) !== null) {
      episodes.push({
        id: match[1],
        number: parseInt(match[2]),
        title: `Episode ${match[2]}`
      })
    }

    sendJSON(res, 200, episodes)
  } catch (e) {
    log('Episodes fetch error:', e.message)
    sendJSON(res, 500, { error: e.message })
  }
}

/**
 * GET /api/servers/:episodeId?mediaId=<id>
 * Returns: [{id, name}]
 */
async function handleServers(req, res, episodeId, mediaId) {
  try {
    if (!episodeId || !mediaId) {
      return sendJSON(res, 400, { error: 'Missing episodeId or mediaId' })
    }

    log(`Fetching servers for episode:`, episodeId)

    const url = `${FLIXHQ_API}/v1/servers/${episodeId}?mediaId=${mediaId}`
    const html = await httpsGet(url, {
      'User-Agent': USER_AGENT,
      'Referer': REFERER
    })

    const servers = parseServersHTML(html)
    sendJSON(res, 200, servers)
  } catch (e) {
    log('Servers fetch error:', e.message)
    sendJSON(res, 500, { error: e.message })
  }
}

/**
 * GET /api/embed/:serverId?mediaId=<id>&episodeId=<id>
 * Returns: {url, quality[], subtitles[]}
 */
async function handleEmbed(req, res, serverId, mediaId, episodeId) {
  try {
    if (!serverId || !mediaId) {
      return sendJSON(res, 400, { error: 'Missing serverId or mediaId' })
    }

    log(`Fetching embed for server:`, serverId)

    // First, get embed link from FlixHQ
    const url = `${FLIXHQ_API}/v1/embed/${serverId}?mediaId=${mediaId}${episodeId ? `&episodeId=${episodeId}` : ''}`
    const json = await httpsGet(url, {
      'User-Agent': USER_AGENT,
      'Referer': REFERER
    })

    const embedLink = parseEmbedJSON(json)
    if (!embedLink) {
      return sendJSON(res, 404, { error: 'No embed link found' })
    }

    // Decrypt embed link
    const decrypted = await decryptEmbed(embedLink, mediaId)

    // Extract m3u8 URL and subtitles
    const result = {
      url: decrypted.file || '',
      quality: ['1080', '720', '480', '360'],
      subtitles: decrypted.subtitles || []
    }

    sendJSON(res, 200, result)
  } catch (e) {
    log('Embed fetch error:', e.message)
    sendJSON(res, 500, { error: e.message })
  }
}

/**
 * GET /api/proxy?url=<url>&quality=<quality>&subs_language=<language>
 * Applies quality rewriting and subtitle selection
 * Returns: {m3u8_url, subtitles: [{label, url}]}
 */
async function handleProxy(req, res, url, quality = '1080', subsLanguage = 'english', subtitles = []) {
  try {
    if (!url) {
      return sendJSON(res, 400, { error: 'Missing URL' })
    }

    log(`Proxying URL with quality ${quality}`)

    // Rewrite quality in m3u8 URL
    const m3u8Url = url.replace(/\/playlist\.m3u8$/, `/${quality}/index.m3u8`)

    // Filter subtitles by language (case-insensitive)
    const filteredSubs = subtitles.filter(sub =>
      sub.label && sub.label.toLowerCase().includes(subsLanguage.toLowerCase())
    )

    const result = {
      m3u8_url: m3u8Url,
      subtitles: filteredSubs
    }

    sendJSON(res, 200, result)
  } catch (e) {
    log('Proxy error:', e.message)
    sendJSON(res, 500, { error: e.message })
  }
}

// ============================================================================
// STATIC FILE SERVING
// ============================================================================

function serveStatic(res, filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8')
    const ext = path.extname(filePath)
    const mimeTypes = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml'
    }
    const contentType = mimeTypes[ext] || 'text/plain'
    res.writeHead(200, { 'Content-Type': contentType })
    res.end(content)
  } catch (e) {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'File not found' }))
  }
}

// ============================================================================
// RESPONSE HELPERS
// ============================================================================

function sendJSON(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  })
  res.end(JSON.stringify(data, null, 2))
}

// ============================================================================
// HTTP SERVER
// ============================================================================

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const pathname = url.pathname
  const searchParams = url.searchParams

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    })
    res.end()
    return
  }

  log(`${req.method} ${pathname}`)

  // ── API ROUTES ──
  if (pathname === '/api/search') {
    const query = searchParams.get('query')
    return handleSearch(req, res, query)
  }

  if (pathname.startsWith('/api/media/')) {
    const id = pathname.split('/').pop()
    const type = searchParams.get('type') || 'movie'
    return handleMedia(req, res, id, type)
  }

  if (pathname.startsWith('/api/episodes/')) {
    const seasonId = pathname.split('/').pop()
    const mediaId = searchParams.get('mediaId')
    return handleEpisodes(req, res, seasonId, mediaId)
  }

  if (pathname.startsWith('/api/servers/')) {
    const episodeId = pathname.split('/').pop()
    const mediaId = searchParams.get('mediaId')
    return handleServers(req, res, episodeId, mediaId)
  }

  if (pathname.startsWith('/api/embed/')) {
    const serverId = pathname.split('/').pop()
    const mediaId = searchParams.get('mediaId')
    const episodeId = searchParams.get('episodeId')
    return handleEmbed(req, res, serverId, mediaId, episodeId)
  }

  if (pathname === '/api/proxy') {
    const proxyUrl = searchParams.get('url')
    const quality = searchParams.get('quality') || '1080'
    const subsLanguage = searchParams.get('subs_language') || 'english'
    const subtitles = [] // Would be passed from frontend
    return handleProxy(req, res, proxyUrl, quality, subsLanguage, subtitles)
  }

  // ── STATIC FILES ──
  if (pathname === '/' || pathname === '/index.html') {
    return serveStatic(res, path.join(__dirname, 'index.html'))
  }

  if (pathname === '/anilist.js') {
    return serveStatic(res, path.join(__dirname, 'anilist.js'))
  }

  // 404
  sendJSON(res, 404, { error: 'Not found' })
})

server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║         🎬 mov-web Server Started 🎬  ║
║                                        ║
║   URL: http://localhost:${PORT}            ║
║   ENV: ${NODE_ENV}                   ║
║                                        ║
║  Base: ${FLIXHQ_BASE}          ║
║  API:  ${FLIXHQ_API.slice(0, 30)}... ║
╚════════════════════════════════════════╝
  `)
})

server.on('error', (e) => {
  console.error('Server error:', e)
})
