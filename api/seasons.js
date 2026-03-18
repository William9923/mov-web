const { getSeasons } = require('./_lib')

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

  const { mediaId } = req.query || {}

  if (!mediaId) {
    res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({ error: 'Missing mediaId' }))
  }

  try {
    const seasons = await getSeasons(mediaId)
    res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' })
    res.end(JSON.stringify(seasons))
  } catch (e) {
    res.writeHead(500, { ...CORS_HEADERS, 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: e.message }))
  }
}
