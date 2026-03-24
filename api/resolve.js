const { httpsGet } = require('./_lib')

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(200, CORS_HEADERS)
    return res.end()
  }

  if (req.method !== 'GET') {
    res.writeHead(405, { ...CORS_HEADERS, 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({ error: 'Method not allowed' }))
  }

  const { type, title, season, episode } = req.query || {}

  if (!type || !title) {
    res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({ error: 'Missing type or title' }))
  }

  try {
    const token = process.env.TMDB_READ_TOKEN
    if (!token) {
      res.writeHead(500, { ...CORS_HEADERS, 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({ error: 'TMDB_READ_TOKEN not configured' }))
    }

    // Search TMDB for the media
    const endpoint = type === 'tv' ? 'search/tv' : 'search/movie'
    const tmdbUrl = `https://api.themoviedb.org/3/${endpoint}?query=${encodeURIComponent(title)}&page=1`

    const response = await httpsGet(tmdbUrl, {
      'Authorization': `Bearer ${token}`
    }, 10000)

    const data = JSON.parse(response)
    const result = data.results?.[0]

    if (!result || !result.id) {
      res.writeHead(404, { ...CORS_HEADERS, 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({ error: 'No TMDB results found' }))
    }

    // Build vsembed URL
    let embedUrl
    if (type === 'tv') {
      if (!season || !episode) {
        res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' })
        return res.end(JSON.stringify({ error: 'Missing season or episode for TV' }))
      }
      embedUrl = `https://vsembed.su/embed/tv/${result.id}/${season}/${episode}`
    } else {
      embedUrl = `https://vsembed.su/embed/movie/${result.id}`
    }

    res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ embedUrl }))
  } catch (e) {
    res.writeHead(500, { ...CORS_HEADERS, 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: e.message }))
  }
}
