const { getEpisodes } = require('./_lib')

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

  const { seasonId } = req.query || {}

  if (!seasonId) {
    res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({ error: 'Missing seasonId' }))
  }

  try {
    const episodes = await getEpisodes(seasonId)
    res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' })
    res.end(JSON.stringify(episodes))
  } catch (e) {
    res.writeHead(500, { ...CORS_HEADERS, 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: e.message }))
  }
}
