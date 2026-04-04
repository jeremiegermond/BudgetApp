const fetch = require('node-fetch')

const BASE = 'https://ob.nordigen.com/api/v2'

let _token     = null
let _tokenExp  = 0

async function getToken() {
  if (_token && Date.now() < _tokenExp - 30_000) return _token

  const res = await fetch(`${BASE}/token/new/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({
      secret_id:  process.env.NORDIGEN_SECRET_ID,
      secret_key: process.env.NORDIGEN_SECRET_KEY,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Nordigen auth failed: ${err}`)
  }

  const data = await res.json()
  _token    = data.access
  _tokenExp = Date.now() + data.access_expires * 1000
  return _token
}

async function call(method, path, body) {
  const token = await getToken()
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Nordigen ${method} ${path} → ${res.status}: ${err}`)
  }

  return res.status === 204 ? null : res.json()
}

// List institutions for a country (e.g. 'FR')
async function getInstitutions(country = 'FR') {
  return call('GET', `/institutions/?country=${country}`)
}

// Create a requisition (End-User Agreement + Requisition)
async function createRequisition(institutionId, redirectUrl) {
  // 1. Create end-user agreement
  const agreement = await call('POST', '/agreements/enduser/', {
    institution_id:      institutionId,
    max_historical_days: 180,
    access_valid_for_days: 90,
    access_scope: ['balances', 'details', 'transactions'],
  })

  // 2. Create requisition
  const req = await call('POST', '/requisitions/', {
    redirect:       redirectUrl,
    institution_id: institutionId,
    agreement:      agreement.id,
    reference:      `budget-${Date.now()}`,
    user_language:  'FR',
  })

  return req
}

// Get a requisition by id
async function getRequisition(reqId) {
  return call('GET', `/requisitions/${reqId}/`)
}

// Get transactions for an account
async function getAccountTransactions(accountId, dateFrom, dateTo) {
  let url = `/accounts/${accountId}/transactions/`
  const params = []
  if (dateFrom) params.push(`date_from=${dateFrom}`)
  if (dateTo)   params.push(`date_to=${dateTo}`)
  if (params.length) url += '?' + params.join('&')
  return call('GET', url)
}

// Delete a requisition (disconnect)
async function deleteRequisition(reqId) {
  return call('DELETE', `/requisitions/${reqId}/`)
}

module.exports = { getInstitutions, createRequisition, getRequisition, getAccountTransactions, deleteRequisition }
