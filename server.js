const http = require('node:http')
const https = require('node:https')
const { URL } = require('node:url')
const fs = require('node:fs')
const path = require('node:path')

// ============================================================================
// CONFIGURATION
// ============================================================================

const PORT = process.env.PORT || 9001
const NODE_ENV = process.env.NODE_ENV || 'development'

const FLIXHQ_BASE = 'https://flixhq.to'
const DECRYPT_PRIMARY = 'https://decrypt.broggl.farm'
const DECRYPT_FALLBACK = 'https://dec.eatmynerds.live'

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0'
const FLIXHQ_HEADERS = {
  'User-Agent': USER_AGENT,
  'Referer': 'https://flixhq.to'
}

const AJAX_HEADERS = {
  ...FLIXHQ_HEADERS,
  'X-Requested-With': 'XMLHttpRequest'
}

// ============================================================================
// UTILITIES
// ============================================================================

function log(message, data = '') {
  const timestamp = new Date().toISOString()
  console.log(`[${timestamp}] ${message}`, data)
}

function httpsGet(urlStr, headers = {}, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    let redirectCount = 0
    const maxRedirects = 5

    function get(url) {
      if (redirectCount >= maxRedirects) {
        return reject(new Error('Too many redirects'))
      }

      let req
      try {
        req = https.get(url, { headers }, (res) => {
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
        })

        req.on('error', reject)
        req.setTimeout(timeoutMs, () => {
          req.destroy(new Error(`Timeout after ${timeoutMs}ms`))
        })
      } catch (e) {
        reject(e)
      }
    }

    get(urlStr)
  })
}

function httpsPost(urlStr, payload, headers = {}, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    try {
      const url = new URL(urlStr)
      const req = https.request(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          ...headers
        },
        timeout: timeoutMs
      })

      let data = ''

      req.on('response', (res) => {
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
      })

      req.on('error', reject)
      req.on('timeout', () => {
        req.destroy(new Error(`Timeout after ${timeoutMs}ms`))
      })

      req.write(payload)
      req.end()
    } catch (e) {
      reject(e)
    }
  })
}

// ============================================================================
// HTML PARSING FUNCTIONS
// ============================================================================

/**
 * Parse search results HTML from FlixHQ
 * Looks for links with /movie/watch-* or /tv/watch-* paths
 */
function parseSearchHTML(html) {
  const results = []

  // Find all links with /movie/watch-* or /tv/watch-* paths
  // More flexible pattern that works with various HTML structures
  const linkRegex = /href="\/((tv|movie)\/watch-[^"]*-(\d+))"[^>]*(?:title|aria-label)="([^"]*)"/g
  let match

  while ((match = linkRegex.exec(html)) !== null) {
    try {
      const fullId = match[1]
      const type = match[2] === 'tv' ? 'tv' : 'movie'
      const numericId = match[3]
      const title = match[4]

      // Find the film-poster div that contains this link
      // Look backwards in the HTML to find associated data-src
      const linkPos = match.index
      const precedingHtml = html.substring(Math.max(0, linkPos - 500), linkPos)

      // Extract image from nearest data-src before the link
      const imageMatch = precedingHtml.match(/data-src="([^"]+)"(?!.*data-src)/)
      const image = imageMatch ? imageMatch[1] : ''

      // Extract year from title if present (4-digit number)
      const yearMatch = title.match(/(\d{4})/)
      const year = yearMatch ? parseInt(yearMatch[1], 10) : null

      results.push({
        id: fullId,
        numericId,
        title,
        image,
        year,
        type
      })
    } catch (e) {
      // Skip malformed entries
    }
  }

  // Deduplicate by id (FlixHQ has duplicate links per card)
  const seen = new Set()
  return results.filter(item => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

/**
 * Parse seasons HTML from FlixHQ
 * Looks for <a> elements with href containing season ID and title
 */
function parseSeasonsHTML(html) {
  const seasons = []

  // Match <a> elements with href pattern like href="...-1">Season 1</a>
  const seasonRegex = /<a[^>]*href="[^"]*-(\d+)"[^>]*>([^<]+)<\/a>/g
  let match

  while ((match = seasonRegex.exec(html)) !== null) {
    const id = match[1]
    const title = match[2].trim()

    seasons.push({ id, title })
  }

  return seasons
}

/**
 * Parse episodes HTML from FlixHQ
 * Looks for nav-item elements with data-id and title attributes
 */
function parseEpisodesHTML(html) {
  const episodes = []

  // Match elements with data-id="..." and title="..."
  const episodeRegex = /data-id="([^"]+)"[^>]*title="([^"]+)"/g
  let match

  while ((match = episodeRegex.exec(html)) !== null) {
    const id = match[1]
    const title = match[2]

    episodes.push({ id, title })
  }

  return episodes
}

/**
 * Parse servers HTML from FlixHQ
 * Looks for elements with data-id and title attributes
 */
function parseServersHTML(html) {
  const servers = []

  // Match elements with data-id and title in any order
  const dataIdMatch = html.match(/data-id="([^"]+)"/g) || []
  const titleMatch = html.match(/title="([^"]+)"/g) || []

  // Simple approach: find data-id followed by title in proximity
  const serverRegex = /data-id="([^"]+)"[^>]*title="([^"]+)"/g
  let match

  while ((match = serverRegex.exec(html)) !== null) {
    const id = match[1]
    const name = match[2]

    servers.push({ id, name })
  }

  return servers
}

/**
 * Parse JSON response to extract embed link
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
// M3U8 REWRITING
// ============================================================================

/**
 * Rewrite M3U8 manifest to proxy all media URLs
 * Converts relative/absolute URLs to /api/proxy?url=...
 */
function rewriteM3u8(content, originalUrl) {
  const originalBaseUrl = new URL(originalUrl).href.split('/').slice(0, -1).join('/')

  const lines = content.split('\n')
  const rewritten = lines.map((line) => {
    // Keep comments and empty lines as-is
    if (line.startsWith('#') || !line.trim()) {
      return line
    }

    // Already a proxied URL
    if (line.includes('/api/proxy?url=')) {
      return line
    }

    // Absolute URL (http/https)
    if (line.startsWith('http://') || line.startsWith('https://')) {
      return `/api/proxy?url=${encodeURIComponent(line)}`
    }

    // Relative URL - resolve against base
    if (line.startsWith('/')) {
      const absoluteUrl = new URL(line, originalBaseUrl).href
      return `/api/proxy?url=${encodeURIComponent(absoluteUrl)}`
    }

    // Relative path
    const absoluteUrl = `${originalBaseUrl}/${line}`
    return `/api/proxy?url=${encodeURIComponent(absoluteUrl)}`
  })

  return rewritten.join('\n')
}

// ============================================================================
// DECRYPTION
// ============================================================================

/**
 * Decrypt embed URL using decryption APIs
 */
async function decryptEmbed(embedLink, mediaId) {
  const apis = [
    { name: 'primary', url: DECRYPT_PRIMARY },
    { name: 'fallback', url: DECRYPT_FALLBACK }
  ]

  for (const api of apis) {
    try {
      log(`[Decrypt] Trying ${api.name}:`, embedLink.slice(0, 50))

      const payload = JSON.stringify({
        url: embedLink,
        mediaId: mediaId
      })

      const response = await httpsPost(api.url, payload, {
        'User-Agent': USER_AGENT
      }, 10000)

      const result = JSON.parse(response)
      log(`[Decrypt] Success via ${api.name}`)
      return result
    } catch (e) {
      log(`[Decrypt] Failed ${api.name}:`, e.message)
      continue
    }
  }

  throw new Error('All decryption APIs failed')
}

// ============================================================================
// API HANDLERS
// ============================================================================

/**
 * GET /api/search?q=<query>
 */
async function handleSearch(req, res, query) {
  try {
    if (!query || query.length < 2) {
      return sendJSON(res, 400, { error: 'Query too short' })
    }

    log('[Search]', query)

    // Convert query to slug: lowercase, spaces to dashes, trim
    const slug = query
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')

    const url = `${FLIXHQ_BASE}/search/${slug}`
    const html = await httpsGet(url, FLIXHQ_HEADERS, 10000)

    const results = parseSearchHTML(html)
    log(`[Search] Found ${results.length} results`)

    sendJSON(res, 200, results)
  } catch (e) {
    log('[Search] Error:', e.message)
    sendJSON(res, 500, { error: e.message })
  }
}

/**
 * GET /api/seasons?mediaId=<numeric_id>
 */
async function handleSeasons(req, res, mediaId) {
  try {
    if (!mediaId) {
      return sendJSON(res, 400, { error: 'Missing mediaId' })
    }

    log('[Seasons]', mediaId)

    const url = `${FLIXHQ_BASE}/ajax/v2/tv/seasons/${mediaId}`
    const html = await httpsGet(url, AJAX_HEADERS, 10000)

    const seasons = parseSeasonsHTML(html)
    log(`[Seasons] Found ${seasons.length} seasons`)

    sendJSON(res, 200, seasons)
  } catch (e) {
    log('[Seasons] Error:', e.message)
    sendJSON(res, 500, { error: e.message })
  }
}

/**
 * GET /api/episodes?seasonId=<id>
 */
async function handleEpisodes(req, res, seasonId) {
  try {
    if (!seasonId) {
      return sendJSON(res, 400, { error: 'Missing seasonId' })
    }

    log('[Episodes]', seasonId)

    const url = `${FLIXHQ_BASE}/ajax/v2/season/episodes/${seasonId}`
    const html = await httpsGet(url, AJAX_HEADERS, 10000)

    const episodes = parseEpisodesHTML(html)
    log(`[Episodes] Found ${episodes.length} episodes`)

    sendJSON(res, 200, episodes)
  } catch (e) {
    log('[Episodes] Error:', e.message)
    sendJSON(res, 500, { error: e.message })
  }
}

/**
 * GET /api/resolve?mediaId=<numeric_id>&dataId=<data_id>&type=movie|tv
 */
async function handleResolve(req, res, mediaId, dataId, type) {
  try {
    if (!mediaId || !type) {
      return sendJSON(res, 400, { error: 'Missing mediaId or type' })
    }

    log('[Resolve]', `${type}:${mediaId}`)

    let episodeId = null
    let embedLink = null

    try {
      // For TV: get servers, pick first Vidcloud/available, get episode_id
      if (type === 'tv' && dataId) {
        const serversUrl = `${FLIXHQ_BASE}/ajax/v2/episode/servers/${dataId}`
        const serversHtml = await httpsGet(serversUrl, AJAX_HEADERS, 10000)

        const servers = parseServersHTML(serversHtml)
        log(`[Resolve] Found ${servers.length} servers`)

        // Pick first "Vidcloud" or first available
        const server = servers.find((s) => s.name.toLowerCase().includes('vidcloud')) || servers[0]
        if (server) {
          episodeId = server.id
        }
      }
      // For movies: get episode_id directly from media_id
      else if (type === 'movie') {
        const episodesUrl = `${FLIXHQ_BASE}/ajax/movie/episodes/${mediaId}`
        const episodesHtml = await httpsGet(episodesUrl, AJAX_HEADERS, 10000)

        // Movie endpoint returns a server list with data-linkid attributes
        // e.g. <a id="watch-5361022" data-linkid="5361022" ... title="Vidcloud">
        const serverRegex = /data-linkid="([^"]+)"[^>]*title="([^"]+)"/g
        const servers = []
        let m
        while ((m = serverRegex.exec(episodesHtml)) !== null) {
          servers.push({ id: m[1], name: m[2] })
        }

        // Prefer Vidcloud, else first available
        const server = servers.find(s => s.name.toLowerCase().includes('vidcloud')) || servers[0]
        if (server) {
          episodeId = server.id
        }
        log(`[Resolve] Movie servers found: ${servers.length}, using: ${server?.name}`)
      }

      if (!episodeId) {
        throw new Error('No episode ID found')
      }

      // Get embed link from sources
      const sourcesUrl = `${FLIXHQ_BASE}/ajax/episode/sources/${episodeId}`
      const sourcesJson = await httpsGet(sourcesUrl, AJAX_HEADERS, 10000)

      embedLink = parseEmbedJSON(sourcesJson)
      if (!embedLink) {
        throw new Error('No embed link found')
      }
    } catch (e) {
      log('[Resolve] Sources error:', e.message)
      throw e
    }

    // Decrypt embed
    try {
      const decrypted = await decryptEmbed(embedLink, mediaId)

      // Handle both response shapes:
      // broggl.farm: { sources: [{file}], tracks: [{file, label}] }
      // eatmynerds:  { file, subtitles: [{file, label}] }
      const m3u8Url =
        decrypted.file ||
        (Array.isArray(decrypted.sources) && decrypted.sources[0]?.file) ||
        ''

      const subtitles =
        decrypted.subtitles ||
        decrypted.tracks ||
        []

      const result = {
        sources: [{ url: m3u8Url, hls: true }],
        subtitles
      }

      sendJSON(res, 200, result)
    } catch (decryptError) {
      log('[Resolve] Decrypt error:', decryptError.message)
      sendJSON(res, 500, { error: 'Decryption failed: ' + decryptError.message })
    }
  } catch (e) {
    log('[Resolve] Error:', e.message)
    sendJSON(res, 500, { error: e.message })
  }
}

/**
 * GET /api/proxy?url=<encoded_url>
 * Proxies M3U8 manifests (rewriting URLs) and pipes binary media segments directly.
 */
function handleProxy(req, res, encodedUrl) {
  if (!encodedUrl) {
    return sendJSON(res, 400, { error: 'Missing url' })
  }

  let url
  try {
    url = decodeURIComponent(encodedUrl)
  } catch (e) {
    return sendJSON(res, 400, { error: 'Invalid URL encoding' })
  }

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return sendJSON(res, 400, { error: 'Invalid URL scheme' })
  }

  log('[Proxy]', url.slice(0, 80))

  const isM3u8Url = url.includes('.m3u8')

  const upstreamReq = https.get(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Referer': 'https://flixhq.to',
      'Origin': 'https://flixhq.to'
    }
  }, (upstreamRes) => {
    // Follow redirects
    if (upstreamRes.statusCode >= 300 && upstreamRes.statusCode < 400 && upstreamRes.headers.location) {
      upstreamRes.resume()
      return handleProxy(req, res, encodeURIComponent(upstreamRes.headers.location))
    }

    if (upstreamRes.statusCode !== 200) {
      upstreamRes.resume()
      return sendJSON(res, 502, { error: `Upstream HTTP ${upstreamRes.statusCode}` })
    }

    const contentType = upstreamRes.headers['content-type'] || ''
    const isM3u8Content = isM3u8Url || contentType.includes('mpegurl') || contentType.includes('x-mpegURL')

    if (isM3u8Content) {
      // Buffer as text, rewrite URLs
      let data = ''
      upstreamRes.setEncoding('utf8')
      upstreamRes.on('data', (chunk) => { data += chunk })
      upstreamRes.on('end', () => {
        const isActuallyM3u8 = data.trimStart().startsWith('#EXTM3U')
        if (isActuallyM3u8) {
          const rewritten = rewriteM3u8(data, url)
          res.writeHead(200, {
            'Content-Type': 'application/vnd.apple.mpegurl',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-cache'
          })
          res.end(rewritten)
        } else {
          // Not actually M3U8 — send as-is
          res.writeHead(200, {
            'Content-Type': contentType || 'application/octet-stream',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=3600'
          })
          res.end(data)
        }
      })
      upstreamRes.on('error', (e) => {
        log('[Proxy] Stream error:', e.message)
        if (!res.headersSent) sendJSON(res, 502, { error: e.message })
      })
    } else {
      // Binary: pipe directly without buffering
      res.writeHead(200, {
        'Content-Type': contentType || 'application/octet-stream',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600'
      })
      upstreamRes.pipe(res)
      upstreamRes.on('error', (e) => {
        log('[Proxy] Pipe error:', e.message)
        if (!res.writableEnded) res.destroy()
      })
    }
  })

  upstreamReq.on('error', (e) => {
    log('[Proxy] Request error:', e.message)
    if (!res.headersSent) sendJSON(res, 502, { error: 'Proxy fetch failed: ' + e.message })
  })

  upstreamReq.setTimeout(15000, () => {
    upstreamReq.destroy(new Error('Timeout'))
  })
}

// ============================================================================
// STATIC FILE SERVING
// ============================================================================

function serveStatic(filePath, contentType) {
  return (res) => {
    try {
      const content = fs.readFileSync(filePath, 'utf8')
      res.writeHead(200, {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*'
      })
      res.end(content)
    } catch (e) {
      sendJSON(res, 404, { error: 'File not found' })
    }
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

  // Only allow GET for now
  if (req.method !== 'GET') {
    return sendJSON(res, 405, { error: 'Method not allowed' })
  }

  log(`${req.method} ${pathname}`)

  // ── API ROUTES ──
  if (pathname === '/api/search') {
    const query = searchParams.get('q')
    return handleSearch(req, res, query)
  }

  if (pathname === '/api/seasons') {
    const mediaId = searchParams.get('mediaId')
    return handleSeasons(req, res, mediaId)
  }

  if (pathname === '/api/episodes') {
    const seasonId = searchParams.get('seasonId')
    return handleEpisodes(req, res, seasonId)
  }

  if (pathname === '/api/resolve') {
    const mediaId = searchParams.get('mediaId')
    const dataId = searchParams.get('dataId')
    const type = searchParams.get('type')
    return handleResolve(req, res, mediaId, dataId, type)
  }

  if (pathname === '/api/proxy') {
    const proxyUrl = searchParams.get('url')
    return handleProxy(req, res, proxyUrl)
  }

  // ── STATIC FILES ──
  if (pathname === '/' || pathname === '/index.html') {
    return serveStatic(path.join(__dirname, 'index.html'), 'text/html')(res)
  }

  if (pathname === '/watch' || pathname === '/watch.html') {
    return serveStatic(path.join(__dirname, 'watch.html'), 'text/html')(res)
  }

  if (pathname === '/app.js') {
    return serveStatic(path.join(__dirname, 'app.js'), 'application/javascript')(res)
  }

  // 404
  sendJSON(res, 404, { error: 'Not found' })
})

server.listen(PORT, () => {
  console.log(`
╔═════════════════════════════════════╗
║     🎬 mov-web Server Started 🎬    ║
║                                     ║
║   URL: http://localhost:${PORT}         ║
║   ENV: ${NODE_ENV}                 ║
║                                     ║
║   Source: FlixHQ                    ║
╚═════════════════════════════════════╝
  `)
})

server.on('error', (e) => {
  console.error('[Server Error]', e)
})
