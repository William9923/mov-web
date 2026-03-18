const https = require('https')
const { USER_AGENT, rewriteM3u8 } = require('./_lib')

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
}

function sendError(res, status, message) {
  if (!res.headersSent) {
    res.writeHead(status, { ...CORS_HEADERS, 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: message }))
  }
}

function proxyUrl(req, res, url) {
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
      return proxyUrl(req, res, upstreamRes.headers.location)
    }

    if (upstreamRes.statusCode !== 200) {
      upstreamRes.resume()
      return sendError(res, 502, `Upstream HTTP ${upstreamRes.statusCode}`)
    }

    const contentType = upstreamRes.headers['content-type'] || ''
    const isM3u8Content = isM3u8Url || contentType.includes('mpegurl') || contentType.includes('x-mpegURL')

    if (isM3u8Content) {
      let data = ''
      upstreamRes.setEncoding('utf8')
      upstreamRes.on('data', (chunk) => { data += chunk })
      upstreamRes.on('end', () => {
        const isActuallyM3u8 = data.trimStart().startsWith('#EXTM3U')
        if (isActuallyM3u8) {
          const rewritten = rewriteM3u8(data, url)
          res.writeHead(200, {
            ...CORS_HEADERS,
            'Content-Type': 'application/vnd.apple.mpegurl',
            'Cache-Control': 'no-cache'
          })
          res.end(rewritten)
        } else {
          res.writeHead(200, {
            ...CORS_HEADERS,
            'Content-Type': contentType || 'application/octet-stream',
            'Cache-Control': 'public, max-age=3600'
          })
          res.end(data)
        }
      })
      upstreamRes.on('error', (e) => sendError(res, 502, e.message))
    } else {
      // Binary: pipe directly
      res.writeHead(200, {
        ...CORS_HEADERS,
        'Content-Type': contentType || 'application/octet-stream',
        'Cache-Control': 'public, max-age=3600'
      })
      upstreamRes.pipe(res)
      upstreamRes.on('error', () => { if (!res.writableEnded) res.destroy() })
    }
  })

  upstreamReq.on('error', (e) => sendError(res, 502, 'Proxy fetch failed: ' + e.message))
  upstreamReq.setTimeout(15000, () => { upstreamReq.destroy(new Error('Timeout')) })
}

module.exports = function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(200, CORS_HEADERS)
    return res.end()
  }

  if (req.method !== 'GET') {
    return sendError(res, 405, 'Method not allowed')
  }

  const { url: encodedUrl } = req.query || {}

  if (!encodedUrl) {
    return sendError(res, 400, 'Missing url')
  }

  let url
  try {
    url = decodeURIComponent(encodedUrl)
  } catch (e) {
    return sendError(res, 400, 'Invalid URL encoding')
  }

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return sendError(res, 400, 'Invalid URL scheme')
  }

  proxyUrl(req, res, url)
}
