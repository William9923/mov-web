/**
 * api/_lib.js
 * Shared library for mov-web Vercel serverless functions
 * Exports HTTP clients, parsers, and high-level API functions
 */

// ============================================================================
// CONFIGURATION & CONSTANTS
// ============================================================================

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
// HTTP CLIENTS
// ============================================================================

/**
 * Make HTTPS GET request with automatic redirect handling
 * @param {string} urlStr - URL to fetch
 * @param {object} headers - HTTP headers
 * @param {number} timeoutMs - Request timeout in milliseconds
 * @returns {Promise<string>} Response body
 */
async function httpsGet(urlStr, headers = {}, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const https = require('https')
    let redirectCount = 0
    const maxRedirects = 5

    function get(url) {
      if (redirectCount >= maxRedirects) {
        return reject(new Error('Too many redirects'))
      }

      let req
      try {
        req = https.get(url, { headers, timeout: timeoutMs }, (res) => {
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
        req.on('timeout', () => {
          req.destroy(new Error(`Timeout after ${timeoutMs}ms`))
        })
      } catch (e) {
        reject(e)
      }
    }

    get(urlStr)
  })
}

/**
 * Make HTTPS POST request
 * @param {string} urlStr - URL to post to
 * @param {object} payload - Request body (will be JSON stringified)
 * @param {object} headers - Additional HTTP headers
 * @param {number} timeoutMs - Request timeout in milliseconds
 * @returns {Promise<string>} Response body
 */
async function httpsPost(urlStr, payload, headers = {}, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const https = require('https')
    const { URL } = require('url')

    try {
      const url = new URL(urlStr)
      const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload)

      const req = https.request(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payloadStr),
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

      req.write(payloadStr)
      req.end()
    } catch (e) {
      reject(e)
    }
  })
}

// ============================================================================
// HTML PARSING
// ============================================================================

/**
 * Parse search results HTML
 * @param {string} html - HTML content
 * @returns {array} [{id, numericId, title, image, year, type}]
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
      const imageMatch = precedingHtml.match(/data-src="([^"]+)"(?!.*data-src)/);
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
 * Parse seasons HTML
 * @param {string} html - HTML content
 * @returns {array} [{id, title}]
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
 * Parse episodes HTML
 * @param {string} html - HTML content
 * @returns {array} [{id, title}]
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
 * Parse servers HTML
 * @param {string} html - HTML content
 * @returns {array} [{id, name}]
 */
function parseServersHTML(html) {
  const servers = []

  // Match elements with data-id and title in proximity
  const serverRegex = /data-id="([^"]+)"[^>]*title="([^"]+)"/g
  let match

  while ((match = serverRegex.exec(html)) !== null) {
    const id = match[1]
    const name = match[2]

    servers.push({ id, name })
  }

  return servers
}

// ============================================================================
// M3U8 REWRITING
// ============================================================================

/**
 * Rewrite M3U8 manifest URLs to use proxy
 * @param {string} content - M3U8 content
 * @param {string} originalUrl - Original M3U8 URL for resolving relative paths
 * @returns {string} Rewritten M3U8
 */
function rewriteM3u8(content, originalUrl) {
  const { URL } = require('url')
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

    // Absolute path on same domain
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
 * Decrypt embed URL using primary and fallback decryption APIs
 * @param {string} embedLink - Embed URL to decrypt
 * @param {string} mediaId - Media ID for decryption context
 * @returns {Promise<object>} {file, subtitles}
 */
async function decryptEmbed(embedLink, mediaId) {
  const apis = [
    { name: 'primary', url: DECRYPT_PRIMARY },
    { name: 'fallback', url: DECRYPT_FALLBACK }
  ]

  for (const api of apis) {
    try {
      const payload = {
        url: embedLink,
        mediaId: mediaId
      }

      const response = await httpsPost(api.url, payload, {
        'User-Agent': USER_AGENT
      }, 10000)

      const result = JSON.parse(response)
      return result
    } catch (e) {
      // Try next API
      continue
    }
  }

  throw new Error('All decryption APIs failed')
}

// ============================================================================
// HIGH-LEVEL API FUNCTIONS
// ============================================================================

/**
 * Search for movies/TV shows
 * @param {string} q - Search query
 * @returns {Promise<array>} Search results
 */
async function search(q) {
  if (!q || q.length < 2) {
    throw new Error('Query too short')
  }

  const slug = q
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')

  const url = `${FLIXHQ_BASE}/search/${slug}`
  const html = await httpsGet(url, FLIXHQ_HEADERS, 10000)

  return parseSearchHTML(html)
}

/**
 * Get seasons for a TV show
 * @param {string} mediaId - Numeric media ID
 * @returns {Promise<array>} Seasons
 */
async function getSeasons(mediaId) {
  if (!mediaId) {
    throw new Error('Missing mediaId')
  }

  const url = `${FLIXHQ_BASE}/ajax/v2/tv/seasons/${mediaId}`
  const html = await httpsGet(url, AJAX_HEADERS, 10000)

  return parseSeasonsHTML(html)
}

/**
 * Get episodes for a season
 * @param {string} seasonId - Season ID
 * @returns {Promise<array>} Episodes
 */
async function getEpisodes(seasonId) {
  if (!seasonId) {
    throw new Error('Missing seasonId')
  }

  const url = `${FLIXHQ_BASE}/ajax/v2/season/episodes/${seasonId}`
  const html = await httpsGet(url, AJAX_HEADERS, 10000)

  return parseEpisodesHTML(html)
}

/**
 * Resolve media to playable sources
 * @param {string} mediaId - Numeric media ID
 * @param {string} dataId - Data ID (for TV episodes)
 * @param {string} type - 'movie' or 'tv'
 * @returns {Promise<object>} {sources, subtitles}
 */
async function resolve(mediaId, dataId, type) {
  if (!mediaId || !type) {
    throw new Error('Missing mediaId or type')
  }

  let episodeId = null
  let embedLink = null

  try {
    // For TV: get servers, pick first Vidcloud/available, get episode_id
    if (type === 'tv' && dataId) {
      const serversUrl = `${FLIXHQ_BASE}/ajax/v2/episode/servers/${dataId}`
      const serversHtml = await httpsGet(serversUrl, AJAX_HEADERS, 10000)

      const servers = parseServersHTML(serversHtml)

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
    }

    if (!episodeId) {
      throw new Error('No episode ID found')
    }

    // Get embed link from sources
    const sourcesUrl = `${FLIXHQ_BASE}/ajax/episode/sources/${episodeId}`
    const sourcesJson = await httpsGet(sourcesUrl, AJAX_HEADERS, 10000)

    try {
      const sourcesData = JSON.parse(sourcesJson)
      embedLink = sourcesData.link || sourcesData.url
    } catch (e) {
      embedLink = null
    }

    if (!embedLink) {
      throw new Error('No embed link found')
    }
  } catch (e) {
    throw new Error(`Sources error: ${e.message}`)
  }

  // Decrypt embed
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

  return {
    sources: [{ url: m3u8Url, hls: true }],
    subtitles
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Constants
  FLIXHQ_BASE,
  DECRYPT_PRIMARY,
  DECRYPT_FALLBACK,
  USER_AGENT,
  FLIXHQ_HEADERS,
  AJAX_HEADERS,

  // HTTP Clients
  httpsGet,
  httpsPost,

  // Parsing
  parseSearchHTML,
  parseSeasonsHTML,
  parseEpisodesHTML,
  parseServersHTML,
  rewriteM3u8,

  // Decryption
  decryptEmbed,

  // High-level API
  search,
  getSeasons,
  getEpisodes,
  resolve
}
