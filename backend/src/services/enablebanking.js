const crypto = require('crypto')
const fs     = require('fs')
const path   = require('path')
const fetch  = require('node-fetch')

const APP_ID       = process.env.EB_APP_ID
const BASE         = 'https://api.enablebanking.com'
const REDIRECT_URL = process.env.EB_REDIRECT_URL || 'https://jeremiegermond.github.io/BudgetApp/callback'

// Load private key
let privateKey = null
if (!APP_ID) {
  console.warn('[enablebanking] EB_APP_ID non configuré — Enable Banking désactivé')
}

const keyPaths = APP_ID ? [
  path.join(__dirname, `../../config/${APP_ID}.pem`),
  process.env.RESOURCES_PATH && path.join(process.env.RESOURCES_PATH, `backend/config/${APP_ID}.pem`),
].filter(Boolean) : []

for (const p of keyPaths) {
  try { privateKey = fs.readFileSync(p, 'utf-8'); break } catch {}
}
if (!privateKey) console.warn('[enablebanking] Private key not found — Enable Banking disabled')

// ── JWT ──────────────────────────────────────────────────────────────────────

function createJWT() {
  if (!privateKey) throw new Error('Enable Banking private key not configured')

  const header = Buffer.from(JSON.stringify({
    typ: 'JWT', alg: 'RS256', kid: APP_ID
  })).toString('base64url')

  const now = Math.floor(Date.now() / 1000)
  const payload = Buffer.from(JSON.stringify({
    iss: 'enablebanking.com',
    aud: 'api.enablebanking.com',
    iat: now,
    exp: now + 3600,
  })).toString('base64url')

  const signature = crypto
    .sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), privateKey)
    .toString('base64url')

  return `${header}.${payload}.${signature}`
}

// ── API helpers ──────────────────────────────────────────────────────────────

async function call(method, urlPath, body) {
  const jwt = createJWT()
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers: {
      'Authorization': `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`EnableBanking ${method} ${urlPath} → ${res.status}: ${err}`)
  }

  return res.status === 204 ? null : res.json()
}

// ── Public API ───────────────────────────────────────────────────────────────

let _aspspsCache = null
let _aspspsCacheTime = 0

async function getAspsps(country = 'FR') {
  // Cache for 1 hour
  if (_aspspsCache && Date.now() - _aspspsCacheTime < 3600_000) return _aspspsCache
  const data = await call('GET', `/aspsps?country=${country}`)
  _aspspsCache = data
  _aspspsCacheTime = Date.now()
  return data
}

async function startAuth(aspspName, aspspCountry = 'FR', state) {
  const validUntil = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
  return call('POST', '/auth', {
    access: { valid_until: validUntil },
    aspsp: { name: aspspName, country: aspspCountry },
    state,
    redirect_url: REDIRECT_URL,
    psu_type: 'personal',
    language: 'fr',
  })
}

async function createSession(code) {
  return call('POST', '/sessions', { code })
}

async function getSession(sessionId) {
  return call('GET', `/sessions/${sessionId}`)
}

async function getSessionAccounts(sessionId) {
  return call('GET', `/sessions/${sessionId}/accounts`)
}

async function getTransactions(accountUid, dateFrom, dateTo) {
  let allTx = []
  let continuationKey = null

  do {
    let url = `/accounts/${accountUid}/transactions`
    const params = []
    if (dateFrom) params.push(`date_from=${dateFrom}`)
    if (dateTo) params.push(`date_to=${dateTo}`)
    if (continuationKey) params.push(`continuation_key=${encodeURIComponent(continuationKey)}`)
    if (params.length) url += '?' + params.join('&')

    const data = await call('GET', url)
    const page = data.transactions || []
    console.log(`[eb getTransactions] page: ${page.length} tx, continuation_key: ${data.continuation_key || 'none'}, keys in response: ${Object.keys(data).join(', ')}`)
    allTx = allTx.concat(page)
    continuationKey = data.continuation_key || null
  } while (continuationKey)

  console.log(`[eb getTransactions] total fetched: ${allTx.length}`)
  return allTx
}

async function getBalances(accountUid) {
  return call('GET', `/accounts/${accountUid}/balances`)
}

function isAvailable() {
  return !!privateKey && !!APP_ID
}

module.exports = { getAspsps, startAuth, createSession, getSession, getSessionAccounts, getTransactions, getBalances, isAvailable, REDIRECT_URL }
