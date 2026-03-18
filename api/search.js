const { search } = require('./_lib')

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

  const { q } = req.query || {}

  if (!q || q.length < 2) {
    res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({ error: 'Query too short' }))
  }

  try {
    const results = await search(q)
    res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' })
    res.end(JSON.stringify(results))
  } catch (e) {
    res.writeHead(500, { ...CORS_HEADERS, 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: e.message }))
  }
}
