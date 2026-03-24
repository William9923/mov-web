/**
 * api/_lib.js
 * Shared library for mov-web Vercel serverless functions
 * Exports HTTP clients, parsers, and high-level API functions
 */

// ============================================================================
// CONFIGURATION & CONSTANTS
// ============================================================================

const FLIXHQ_BASE = 'https://flixhq.to'

const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0'

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

// ============================================================================
// WASM DECRYPTION HELPERS
// ============================================================================

/**
 * Fetch binary data (WASM/image) via HTTPS, returned as Buffer
 */
async function httpsBinary(urlStr, headers = {}, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const https = require('https')
    let redirectCount = 0

    function get(url) {
      if (redirectCount >= 5) return reject(new Error('Too many redirects'))
      const req = https.get(url, { headers, timeout: timeoutMs }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          redirectCount++
          return get(res.headers.location)
        }
        if (res.statusCode !== 200) {
          res.resume()
          return reject(new Error(`HTTP ${res.statusCode}`))
        }
        const chunks = []
        res.on('data', c => chunks.push(c))
        res.on('end', () => resolve(Buffer.concat(chunks)))
      })
      req.on('error', reject)
      req.on('timeout', () => req.destroy(new Error(`Timeout after ${timeoutMs}ms`)))
    }
    get(urlStr)
  })
}

/**
 * XOR a Uint8Array in-place with a 4-byte key derived from a kversion integer.
 * z(a) = [(a & 0xFF000000)>>24, (a & 0xFF0000)>>16, (a & 0xFF00)>>8, a & 0xFF]
 */
function xorWithKversion(bytes, kversion) {
  const key = [
    (kversion & 0xFF000000) >>> 24,
    (kversion & 0x00FF0000) >>> 16,
    (kversion & 0x0000FF00) >>> 8,
    (kversion & 0x000000FF)
  ]
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = bytes[i] ^ key[i % 4]
  }
}

/**
 * CryptoJS-compatible AES decrypt.
 * CryptoJS encodes: "Salted__" + salt(8) + ciphertext, all base64'd.
 * Key+IV are derived via OpenSSL EVP_BytesToKey (MD5, 1 iteration).
 */
function aesDecryptCryptoJS(encryptedB64, keyB64) {
  const crypto = require('crypto')

  const keyBytes = Buffer.from(keyB64, 'base64')
  const encBytes = Buffer.from(encryptedB64, 'base64')

  // Check for "Salted__" magic header
  const magic = encBytes.slice(0, 8).toString('ascii')
  if (magic !== 'Salted__') throw new Error('Missing Salted__ header')

  const salt = encBytes.slice(8, 16)
  const ciphertext = encBytes.slice(16)

  // OpenSSL EVP_BytesToKey: MD5-based KDF, key=32 bytes, iv=16 bytes
  function evpBytesToKey(password, salt, keyLen, ivLen) {
    const derived = []
    let prev = Buffer.alloc(0)
    while (derived.length < keyLen + ivLen) {
      prev = crypto.createHash('md5').update(Buffer.concat([prev, password, salt])).digest()
      derived.push(...prev)
    }
    const buf = Buffer.from(derived)
    return { key: buf.slice(0, keyLen), iv: buf.slice(keyLen, keyLen + ivLen) }
  }

  const { key, iv } = evpBytesToKey(keyBytes, salt, 32, 16)
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return JSON.parse(decrypted.toString('utf8'))
}

/**
 * Build the fake window environment needed by the Vidcloud/Megacloud WASM binary.
 * The WASM reads window.xrax, window.G, window.localStorage, window.performance,
 * window.location, window.crypto, the j_crt meta content, and a canvas fingerprint.
 * After calling groot() + jwt_plugin(), it populates localStorage with kid/kversion/ktime
 * and sets window.pid.
 */
function buildFakeWindow(embedUrl, jCrtContent, imageData, dateNow) {
  const { webcrypto } = require('crypto')
  const xrax = embedUrl.split('/').pop().split('?').shift()
  const baseUrl = embedUrl.match(/https?:\/\/[^/]*/)[0]

  const fakeLocalStorage = { setItem(k, v) { fakeLocalStorage[k] = v } }

  const fakeWindow = {
    localStorage: fakeLocalStorage,
    navigator: { webdriver: false, userAgent: USER_AGENT },
    document: { cookie: '' },
    origin: baseUrl,
    location: { href: embedUrl, origin: baseUrl },
    performance: { timeOrigin: dateNow },
    crypto: webcrypto,
    msCrypto: webcrypto,
    xrax,
    G: xrax,
    c: false,
    length: 0,
    z(a) {
      return [(0xFF000000 & a) >>> 24, (0x00FF0000 & a) >>> 16, (0xFF00 & a) >>> 8, 0xFF & a]
    },
    browser_version: 1676800512,
  }

  // Fake canvas (no-op drawing, fixed dataURL)
  const dataURL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAfQAAAH0CAYAAADL1t+KAAAABmJLR0QA/wD/AP+gvaeTAAAADUlEQVQI12NgYGBgAAAABQABXvMqGgAAAABJRU5ErkJggg=='
  const canvas = {
    baseUrl, width: 0, height: 0,
    style: { style: { display: 'inline' } },
    context2d: {},
  }

  const meta = { content: jCrtContent }

  const nodeList = {
    image: { src: '', height: imageData.height, width: imageData.width, complete: true },
    context2d: {},
    length: 1,
  }

  const image_data = {
    height: imageData.height,
    width: imageData.width,
    data: new Uint8ClampedArray(imageData.data),
  }

  return { fakeWindow, fakeLocalStorage, canvas, meta, nodeList, image_data, dataURL, xrax }
}

/**
 * Run the Vidcloud/Megacloud WASM in a fake Node.js environment.
 * Returns the Uint8Array Q5 output (the WASM key material) and the populated fakeLocalStorage.
 */
async function runWasm(wasmBytes, fakeEnv) {
  const { webcrypto } = require('crypto')
  const { fakeWindow, fakeLocalStorage, canvas, meta, nodeList, image_data, dataURL } = fakeEnv

  // Standard wasm-bindgen glue machinery
  const arr = new Array(128).fill(undefined)
  arr.push(undefined, null, true, false)
  let pointer = arr.length

  function addToArr(item) {
    if (pointer === arr.length) arr.push(arr.length + 1)
    const idx = pointer
    pointer = arr[idx]
    arr[idx] = item
    return idx
  }
  function get(idx) { return arr[idx] }
  function drop(idx) {
    if (idx >= 132) { arr[idx] = pointer; pointer = idx }
  }
  function dropGet(idx) { const v = get(idx); drop(idx); return v }

  let wasm, memBuf = null, dataViewCache = null, sz = 0

  const encoder = new TextEncoder()
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })

  function getMem() {
    memBuf = (!memBuf || memBuf.byteLength === 0) ? new Uint8Array(wasm.memory.buffer) : memBuf
    return memBuf
  }
  function getDV() {
    dataViewCache = (!dataViewCache || dataViewCache.buffer !== wasm.memory.buffer) ? new DataView(wasm.memory.buffer) : dataViewCache
    return dataViewCache
  }

  function writeStr(str, alloc, realloc) {
    if (!realloc) {
      const enc = encoder.encode(str)
      const ptr = alloc(enc.length, 1) >>> 0
      getMem().subarray(ptr, ptr + enc.length).set(enc)
      sz = enc.length
      return ptr
    }
    let len = str.length, ptr = alloc(len, 1) >>> 0, mem = getMem(), i = 0
    for (; i < len; i++) {
      const c = str.charCodeAt(i)
      if (c > 127) break
      mem[ptr + i] = c
    }
    if (i !== len) {
      if (i) str = str.slice(i)
      ptr = realloc(ptr, len, len = i + 3 * str.length, 1) >>> 0
      const sub = getMem().subarray(ptr + i, ptr + len)
      i += encoder.encodeInto(str, sub).written
      ptr = realloc(ptr, len, i, 1) >>> 0
    }
    sz = i
    return ptr
  }

  function readStr(ptr, len) {
    return decoder.decode(getMem().subarray(ptr >>> 0, (ptr >>> 0) + len))
  }

  function writeBuf(buf, alloc) {
    const ptr = alloc(buf.length, 1) >>> 0
    getMem().set(buf, ptr)
    sz = buf.length
    return ptr
  }

  function applyWin(fn, argz) {
    try { return fn.apply(fakeWindow, argz) } catch (e) { wasm.__wbindgen_export_6(addToArr(e)) }
  }

  function makeArgs(a, b, dtor, fn) {
    const ctx = { a, b, cnt: 1, dtor }
    const wrapper = (...args) => {
      ctx.cnt++
      try { return fn(ctx.a, ctx.b, ...args) }
      finally { if (--ctx.cnt === 0) { wasm.__wbindgen_export_2.get(ctx.dtor)(ctx.a, ctx.b); ctx.a = 0 } }
    }
    wrapper.original = ctx
    return wrapper
  }

  const imports = {
    wbg: {
      __wbindgen_is_function: i => typeof get(i) === 'function',
      __wbindgen_is_string: i => typeof get(i) === 'string',
      __wbindgen_is_object: i => { const v = get(i); return typeof v === 'object' && v !== null },
      __wbindgen_number_get(off, i) {
        const n = get(i)
        getDV().setFloat64(off + 8, n == null ? 0 : n, true)
        getDV().setInt32(off, n == null ? 0 : 1, true)
      },
      __wbindgen_string_get(off, i) {
        const s = get(i)
        const ptr = writeStr(s, wasm.__wbindgen_export_0, wasm.__wbindgen_export_1)
        getDV().setInt32(off + 4, sz, true)
        getDV().setInt32(off, ptr, true)
      },
      __wbindgen_object_drop_ref: i => dropGet(i),
      __wbindgen_cb_drop(i) { const o = dropGet(i).original; return o.cnt-- === 1 && !(o.a = 0) },
      __wbindgen_string_new: (ptr, len) => addToArr(readStr(ptr, len)),
      __wbindgen_is_null: i => get(i) === null,
      __wbindgen_is_undefined: i => get(i) === undefined,
      __wbindgen_boolean_get(i) { const v = get(i); return typeof v === 'boolean' ? (v ? 1 : 0) : 2 },
      __wbg_instanceof_CanvasRenderingContext2d_4ec30ddd3f29f8f9: () => true,
      __wbg_subarray_adc418253d76e2f1: (i, a, b) => addToArr(get(i).subarray(a >>> 0, b >>> 0)),
      __wbg_randomFillSync_5c9c955aa56b6049() {},
      __wbg_getRandomValues_3aa56aa6edec874c() {
        return applyWin(function(i1, i2) { get(i1).getRandomValues(get(i2)) }, arguments)
      },
      __wbg_msCrypto_eb05e62b530a1508: i => addToArr(get(i).msCrypto),
      __wbg_toString_6eb7c1f755c00453: () => addToArr('[object Storage]'),
      __wbg_toString_139023ab33acec36: i => addToArr(get(i).toString()),
      __wbg_require_cca90b1a94a0255b() {
        return applyWin(function() { return addToArr(module.require) }, arguments)
      },
      __wbg_crypto_1d1f22824a6a080c: i => addToArr(get(i).crypto),
      __wbg_process_4a72847cc503995b: i => addToArr(get(i).process),
      __wbg_versions_f686565e586dd935: i => addToArr(get(i).versions),
      __wbg_node_104a2ff8d6ea03a2: i => addToArr(get(i).node),
      __wbg_localStorage_3d538af21ea07fcc() {
        return applyWin(function(i) {
          const d = fakeWindow.localStorage
          return d == null ? 0 : addToArr(d)
        }, arguments)
      },
      __wbg_setfillStyle_59f426135f52910f() {},
      __wbg_setshadowBlur_229c56539d02f401() {},
      __wbg_setshadowColor_340d5290cdc4ae9d() {},
      __wbg_setfont_16d6e31e06a420a5() {},
      __wbg_settextBaseline_c3266d3bd4a6695c() {},
      __wbg_drawImage_cb13768a1bdc04bd() {},
      __wbg_getImageData_66269d289f37d3c7() {
        return applyWin(function() { return addToArr(image_data) }, arguments)
      },
      __wbg_rect_2fa1df87ef638738() {},
      __wbg_fillRect_4dd28e628381d240() {},
      __wbg_fillText_07e5da9e41652f20() {},
      __wbg_setProperty_5144ddce66bbde41() {},
      __wbg_createElement_03cf347ddad1c8c0() {
        return applyWin(function() { return addToArr(canvas) }, arguments)
      },
      __wbg_querySelector_118a0639aa1f51cd() {
        return applyWin(function() { return addToArr(meta) }, arguments)
      },
      __wbg_querySelectorAll_50c79cd4f7573825() {
        return applyWin(function() { return addToArr(nodeList) }, arguments)
      },
      __wbg_getAttribute_706ae88bd37410fa(off, i, ptrA, lenA) {
        const attr = meta.content
        const todo = attr == null ? 0 : writeStr(attr, wasm.__wbindgen_export_0, wasm.__wbindgen_export_1)
        getDV().setInt32(off + 4, sz, true)
        getDV().setInt32(off, todo, true)
      },
      __wbg_target_6795373f170fd786(i) {
        const t = get(i).target; return t == null ? 0 : addToArr(t)
      },
      __wbg_addEventListener_f984e99465a6a7f4() {},
      __wbg_instanceof_HtmlCanvasElement_1e81f71f630e46bc: () => true,
      __wbg_setwidth_233645b297bb3318: (i, v) => { get(i).width = v >>> 0 },
      __wbg_setheight_fcb491cf54e3527c: (i, v) => { get(i).height = v >>> 0 },
      __wbg_getContext_dfc91ab0837db1d1() {
        return applyWin(function(i) { return addToArr(get(i).context2d) }, arguments)
      },
      __wbg_toDataURL_97b108dd1a4b7454() {
        return applyWin(function(off, i) {
          const ptr = writeStr(dataURL, wasm.__wbindgen_export_0, wasm.__wbindgen_export_1)
          getDV().setInt32(off + 4, sz, true)
          getDV().setInt32(off, ptr, true)
        }, arguments)
      },
      __wbg_instanceof_HtmlDocument_1100f8a983ca79f9: () => true,
      __wbg_style_ca229e3326b3c3fb: i => addToArr(get(i).style),
      __wbg_instanceof_HtmlImageElement_9c82d4e3651a8533: () => true,
      __wbg_src_87a0e38af6229364(off, i) {
        const ptr = writeStr(get(i).src, wasm.__wbindgen_export_0, wasm.__wbindgen_export_1)
        getDV().setInt32(off + 4, sz, true)
        getDV().setInt32(off, ptr, true)
      },
      __wbg_width_e1a38bdd483e1283: i => get(i).width,
      __wbg_height_e4cc2294187313c9: i => get(i).height,
      __wbg_complete_1162c2697406af11: i => get(i).complete,
      __wbg_data_d34dc554f90b8652(off, i) {
        const ptr = writeBuf(get(i).data, wasm.__wbindgen_export_0)
        getDV().setInt32(off + 4, sz, true)
        getDV().setInt32(off, ptr, true)
      },
      __wbg_origin_305402044aa148ce() {
        return applyWin(function(off, i) {
          const ptr = writeStr(get(i).origin, wasm.__wbindgen_export_0, wasm.__wbindgen_export_1)
          getDV().setInt32(off + 4, sz, true)
          getDV().setInt32(off, ptr, true)
        }, arguments)
      },
      __wbg_length_8a9352f7b7360c37: i => get(i).length,
      __wbg_get_c30ae0782d86747f(i) { const img = get(i).image; return img == null ? 0 : addToArr(img) },
      __wbg_timeOrigin_f462952854d802ec: i => get(i).timeOrigin,
      __wbg_instanceof_Window_cee7a886d55e7df5: () => true,
      __wbg_document_eb7fd66bde3ee213(i) { const d = get(i).document; return d == null ? 0 : addToArr(d) },
      __wbg_location_b17760ac7977a47a: i => addToArr(get(i).location),
      __wbg_performance_4ca1873776fdb3d2(i) { const p = get(i).performance; return p == null ? 0 : addToArr(p) },
      __wbg_origin_e1f8acdeb3a39a2b(off, i) {
        const ptr = writeStr(get(i).origin, wasm.__wbindgen_export_0, wasm.__wbindgen_export_1)
        getDV().setInt32(off + 4, sz, true)
        getDV().setInt32(off, ptr, true)
      },
      __wbg_get_8986951b1ee310e0(i, p, l) {
        const v = get(i)[readStr(p, l)]; return v == null ? 0 : addToArr(v)
      },
      __wbg_setTimeout_6ed7182ebad5d297() {
        return applyWin(function() { return 7 }, arguments)
      },
      __wbg_self_05040bd9523805b9() { return applyWin(function() { return addToArr(fakeWindow) }, arguments) },
      __wbg_window_adc720039f2cb14f() { return applyWin(function() { return addToArr(fakeWindow) }, arguments) },
      __wbg_globalThis_622105db80c1457d() { return applyWin(function() { return addToArr(fakeWindow) }, arguments) },
      __wbg_global_f56b013ed9bcf359() { return applyWin(function() { return addToArr(fakeWindow) }, arguments) },
      __wbg_newnoargs_cfecb3965268594c: (ptr, len) => addToArr(new Function(readStr(ptr, len))),
      __wbindgen_object_clone_ref: i => addToArr(get(i)),
      __wbg_eval_c824e170787ad184() {
        return applyWin(function(ptr, len) {
          const name = 'fake_' + readStr(ptr, len)
          return addToArr(eval(name))  // eslint-disable-line no-eval
        }, arguments)
      },
      __wbg_call_3f093dd26d5569f8() {
        return applyWin(function(i, j) { return addToArr(get(i).call(get(j))) }, arguments)
      },
      __wbg_call_67f2111acd2dfdb6() {
        return applyWin(function(i, j, k) { return addToArr(get(i).call(get(j), get(k))) }, arguments)
      },
      __wbg_set_961700853a212a39() {
        return applyWin(function(i, j, k) { return Reflect.set(get(i), get(j), get(k)) }, arguments)
      },
      __wbg_buffer_b914fb8b50ebbc3e: i => addToArr(get(i).buffer),
      __wbg_newwithbyteoffsetandlength_0de9ee56e9f6ee6e: (i, a, b) => addToArr(new Uint8Array(get(i), a >>> 0, b >>> 0)),
      __wbg_newwithlength_0d03cef43b68a530: n => addToArr(new Uint8Array(n >>> 0)),
      __wbg_new_b1f2d6842d615181: i => addToArr(new Uint8Array(get(i))),
      __wbg_buffer_67e624f5a0ab2319: i => addToArr(get(i).buffer),
      __wbg_length_21c4b0ae73cba59d: i => get(i).length,
      __wbg_set_7d988c98e6ced92d: (i, j, off) => get(i).set(get(j), off >>> 0),
      __wbindgen_debug_string() {},
      __wbindgen_throw(ptr, len) { throw new Error(readStr(ptr, len)) },
      __wbindgen_memory: () => addToArr(wasm.memory),
      __wbindgen_closure_wrapper117: (a, b) => addToArr(makeArgs(a, b, 2, (x, y, ...r) => dropGet(wasm.__wbindgen_export_3(x, y)))),
      __wbindgen_closure_wrapper119: (a, b) => addToArr(makeArgs(a, b, 2, (x, y, ...r) => { wasm.__wbindgen_export_4(x, y, addToArr(r[0])) })),
      __wbindgen_closure_wrapper121: (a, b) => addToArr(makeArgs(a, b, 2, (x, y, ...r) => { wasm.__wbindgen_export_5(x, y) })),
      __wbindgen_closure_wrapper123: (a, b) => addToArr(makeArgs(a, b, 9, (x, y, ...r) => { wasm.__wbindgen_export_4(x, y, addToArr(r[0])) })),
    }
  }

  const mod = new WebAssembly.Module(wasmBytes)
  const instance = new WebAssembly.Instance(mod, imports)
  wasm = instance.exports

  // Boot sequence: groot() initialises the WASM, then jwt_plugin() runs the fingerprint
  wasm.groot()
  fakeWindow.jwt_plugin(wasmBytes)

  // navigate() returns the Q5 key material as an ArrayBuffer
  const q5 = await fakeWindow.navigate()
  return new Uint8Array(q5)
}

/**
 * Self-hosted decryption for Vidcloud/Megacloud embeds.
 *
 * Flow:
 *   1. Fetch embed page → extract j_crt meta content
 *   2. Fetch WASM binary (loading.png) + pixel image (image.png)
 *   3. Run WASM in fake window → get pid, kversion, kid from fakeLocalStorage
 *   4. Call getSources API
 *   5. Derive AES key: XOR(wasmOutput OR resp.k, z(kversion)) → base64
 *   6. AES-CBC decrypt sources → parsed JSON
 *
 * @param {string} embedLink - Full embed URL (e.g. https://megacloud.tv/embed-2/e-1/XYZ?k=1)
 * @returns {Promise<object>} { sources: [{file, type}], tracks: [{file, label, kind}] }
 */
async function decryptEmbed(embedLink) {
  const { URL } = require('url')

  const embedUrl = new URL(embedLink)
  const baseUrl = embedUrl.origin
  const pathParts = embedUrl.pathname.split('/')  // ['', 'embed-2', 'e-1', 'XYZ']
  const embedType = pathParts[1]   // e.g. 'embed-2'
  const embedKind = pathParts[2]   // e.g. 'e-1'
  const xrax = pathParts[pathParts.length - 1].split('?')[0]

  const embedHeaders = {
    'User-Agent': USER_AGENT,
    'Referer': embedLink,
  }

  // 1. Fetch embed page HTML and extract j_crt meta content
  const embedHtml = await httpsGet(embedLink, { ...embedHeaders, 'X-Requested-With': 'XMLHttpRequest' }, 15000)
  const jCrtMatch = embedHtml.match(/name="j_crt"\s+content="([A-Za-z0-9+/=]+)"/)
  if (!jCrtMatch) throw new Error('j_crt meta tag not found in embed page')
  const jCrtContent = jCrtMatch[1] + '=='

  const dateNow = Date.now()

  // 2. Fetch WASM binary and pixel data image in parallel
  const wasmUrl = `${baseUrl}/images/loading.png?v=0.0.9`
  const imgUrl = `${baseUrl}/images/image.png?v=0.0.9`

  const [wasmBytes, imgBytes] = await Promise.all([
    httpsBinary(wasmUrl, embedHeaders, 15000),
    httpsBinary(imgUrl, embedHeaders, 15000),
  ])

  // Decode the image into raw RGBA pixels (the WASM uses it for canvas fingerprinting)
  // We pass a fixed-size dummy buffer — the WASM XORs the pixel data for fingerprint only,
  // the actual decryption key comes from the WASM output, not the pixels.
  const imageData = {
    width: 65,
    height: 50,
    data: new Uint8Array(65 * 50 * 4).fill(0),  // zeroed canvas is fine for key derivation
  }

  // 3. Build fake window and run WASM
  const fakeEnv = buildFakeWindow(embedLink, jCrtContent, imageData, dateNow)
  const q5 = await runWasm(wasmBytes, fakeEnv)

  const { fakeWindow, fakeLocalStorage } = fakeEnv

  const pid = fakeWindow.pid
  const kversion = fakeLocalStorage.kversion
  const kid = fakeLocalStorage.kid

  if (!pid || !kversion || !kid) {
    throw new Error(`WASM did not populate keys: pid=${pid} kversion=${kversion} kid=${kid}`)
  }

  // 4. Call getSources API
  const browser_version = 1676800512
  let getSourcesUrl
  if (baseUrl.includes('mega')) {
    getSourcesUrl = `${baseUrl}/${embedType}/ajax/${embedKind}/getSources?id=${pid}&v=${kversion}&h=${kid}&b=${browser_version}`
  } else {
    getSourcesUrl = `${baseUrl}/ajax/${embedType}/${embedKind}/getSources?id=${pid}&v=${kversion}&h=${kid}&b=${browser_version}`
  }

  const sourcesRaw = await httpsGet(getSourcesUrl, {
    'User-Agent': USER_AGENT,
    'Referer': embedLink,
    'X-Requested-With': 'XMLHttpRequest',
  }, 15000)

  const resp = JSON.parse(sourcesRaw)

  // 5. Derive AES key
  // If resp.t != 0: use q5 (WASM output); if resp.t == 0: use resp.k array
  let keyBytes
  if (resp.t !== 0) {
    keyBytes = new Uint8Array(q5)
    xorWithKversion(keyBytes, kversion)
  } else {
    keyBytes = new Uint8Array(resp.k)
    xorWithKversion(keyBytes, kversion)
  }
  const aesKey = Buffer.from(keyBytes).toString('base64')

  // 6. AES-CBC decrypt sources
  const decryptedSources = aesDecryptCryptoJS(resp.sources, aesKey)

  return {
    sources: decryptedSources,
    tracks: resp.tracks || [],
  }
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

  // Decrypt embed — returns { sources: [{file, type}], tracks: [{file, label, kind}] }
  const decrypted = await decryptEmbed(embedLink)

  const m3u8Url = Array.isArray(decrypted.sources) && decrypted.sources[0]?.file
    ? decrypted.sources[0].file
    : ''

  return {
    sources: [{ url: m3u8Url, hls: true }],
    subtitles: decrypted.tracks || [],
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Constants
  FLIXHQ_BASE,
  USER_AGENT,
  FLIXHQ_HEADERS,
  AJAX_HEADERS,

  // HTTP Clients
  httpsGet,

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
