const express = require('express')
const db      = require('../db')
const woob    = require('../services/woob')
const eb      = require('../services/enablebanking')
const router  = express.Router()

// ── Woob routes ───────────────────────────────────────────────────────────────

router.get('/backends', async (req, res) => {
  try {
    const result = await woob.listBackends()
    res.json(result)
  } catch (e) {
    res.status(200).json({ backends: woob.FALLBACK_BACKENDS || [], woob_installed: false, error: e.message })
  }
})

router.get('/connections', (req, res) => {
  const rows = db.prepare(
    'SELECT id, backend_id, bank_name, login, last_sync, transaction_count, created_at FROM bank_connections ORDER BY created_at DESC'
  ).all()
  res.json(rows)
})

router.post('/check', async (req, res) => {
  const { backend_id, login, password, extra } = req.body
  if (!backend_id || !login || !password)
    return res.status(400).json({ error: 'backend_id, login, password requis' })
  try {
    const result = await woob.checkConnection({ backend: backend_id, login, password, extra: extra || {} })
    res.json(result)
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message })
  }
})

router.post('/connect', (req, res) => {
  const { backend_id, bank_name, login, password, extra } = req.body
  if (!backend_id || !login || !password)
    return res.status(400).json({ error: 'backend_id, login, password requis' })

  db.prepare(`
    INSERT INTO bank_connections (backend_id, bank_name, login, password, extra)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(backend_id, login) DO UPDATE SET
      password  = excluded.password,
      bank_name = excluded.bank_name,
      extra     = excluded.extra
  `).run(backend_id, bank_name || backend_id, login, password, JSON.stringify(extra || {}))

  const conn = db.prepare(
    'SELECT id, backend_id, bank_name, login, last_sync FROM bank_connections WHERE backend_id = ? AND login = ?'
  ).get(backend_id, login)
  res.status(201).json(conn)
})

router.get('/sync/:id/stream', async (req, res) => {
  const conn = db.prepare('SELECT * FROM bank_connections WHERE id = ?').get(req.params.id)
  if (!conn) return res.status(404).json({ error: 'Connexion introuvable' })

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  send('progress', { message: 'Démarrage de la synchronisation...' })

  try {
    let days = 90
    if (conn.last_sync) {
      const diff = Math.ceil((Date.now() - new Date(conn.last_sync)) / 86400000)
      days = Math.min(Math.max(diff + 1, 7), 90)
    }

    const extra  = conn.extra ? JSON.parse(conn.extra) : {}
    const result = await woob.fetchTransactionsStream(
      { backend: conn.backend_id, login: conn.login, password: conn.password, extra },
      days,
      (msg) => send('progress', { message: msg })
    )

    if (!result.ok) {
      const errMsg = result.error || 'Erreur inconnue (voir logs backend)'
      console.error('[woob sync] Échec:', errMsg)
      send('fail', { error: errMsg })
      return res.end()
    }

    send('progress', { message: 'Import des opérations en base...' })

    const insert = db.prepare(
      "INSERT OR IGNORE INTO transactions (label, amount, date, source, external_id) VALUES (?, ?, ?, 'bank', ?)"
    )
    let imported = 0
    db.transaction((txList) => {
      for (const tx of txList) {
        const extId = tx.id
          ? `woob-${conn.backend_id}-${tx.id}`
          : `woob-${conn.backend_id}-${tx.date}-${tx.label}-${tx.amount}`
        const r = insert.run(tx.label, tx.amount, tx.date, extId)
        if (r.changes) imported++
      }
    })(result.transactions)

    db.prepare(
      "UPDATE bank_connections SET last_sync = datetime('now'), transaction_count = transaction_count + ? WHERE id = ?"
    ).run(imported, conn.id)

    send('done', { ok: true, imported, total: result.transactions.length })
    res.end()
  } catch (e) {
    console.error(e)
    send('fail', { error: e.message })
    res.end()
  }
})

router.delete('/connection/:id', (req, res) => {
  db.prepare('DELETE FROM bank_connections WHERE id = ?').run(req.params.id)
  res.status(204).send()
})

// ── Enable Banking routes ─────────────────────────────────────────────────────

// GET /api/bank/eb/banks  — liste les banques disponibles
router.get('/eb/banks', async (req, res) => {
  if (!eb.isAvailable()) return res.status(503).json({ error: 'Enable Banking non configuré' })
  try {
    const data   = await eb.getAspsps('FR')
    const list   = Array.isArray(data) ? data : (data.aspsps || data.data || [])
    const banks  = list.map(a => ({
      name:    a.name,
      country: a.country,
      logo:    a.logo || null,
    }))
    res.json(banks)
  } catch (e) {
    console.error('[eb/banks]', e.message)
    res.status(502).json({ error: e.message })
  }
})

// POST /api/bank/eb/start-auth  — démarre le flow OAuth
router.post('/eb/start-auth', async (req, res) => {
  if (!eb.isAvailable()) return res.status(503).json({ error: 'Enable Banking non configuré' })
  const { bank_name } = req.body
  if (!bank_name) return res.status(400).json({ error: 'bank_name requis' })

  try {
    const state  = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const result = await eb.startAuth(bank_name, 'FR', state)
    res.json({ url: result.url, state })
  } catch (e) {
    res.status(502).json({ error: e.message })
  }
})

// POST /api/bank/eb/complete-auth  — échange le code contre une session
router.post('/eb/complete-auth', async (req, res) => {
  if (!eb.isAvailable()) return res.status(503).json({ error: 'Enable Banking non configuré' })
  const { code, bank_name } = req.body
  if (!code) return res.status(400).json({ error: 'code requis' })

  try {
    const session = await eb.createSession(code)

    // Accounts may be populated asynchronously — poll up to 5 times
    let rawAccounts = session.accounts || []
    if (rawAccounts.length === 0) {
      for (let i = 0; i < 5; i++) {
        await new Promise(r => setTimeout(r, 2000))
        try {
          const s = await eb.getSession(session.session_id)
          rawAccounts = s.accounts || []
          console.log(`[eb complete-auth] poll ${i + 1}: ${rawAccounts.length} compte(s)`)
          if (rawAccounts.length > 0) break
        } catch (e) {
          console.warn('[eb complete-auth] poll error:', e.message)
          break
        }
      }
    }

    if (rawAccounts.length > 0) console.log('[eb complete-auth] account sample:', JSON.stringify(rawAccounts[0], null, 2))
    const accounts = rawAccounts.map(a => ({
      uid:   a.uid || a.id || a.account_uid || a.resourceId || null,
      iban:  a.account_id?.iban || a.iban || null,
      name:  a.name || a.label || 'Compte',
    })).filter(a => a.uid)

    db.prepare(`
      INSERT INTO eb_sessions (session_id, bank_name, country, accounts, valid_until)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(session_id) DO UPDATE SET
        accounts    = excluded.accounts,
        valid_until = excluded.valid_until
    `).run(
      session.session_id,
      bank_name || session.aspsp?.name || 'Banque',
      session.aspsp?.country || 'FR',
      JSON.stringify(accounts),
      session.access?.valid_until || null
    )

    const row = db.prepare('SELECT * FROM eb_sessions WHERE session_id = ?').get(session.session_id)
    res.status(201).json(row)
  } catch (e) {
    console.error('[eb complete-auth]', e.message)
    res.status(502).json({ error: e.message })
  }
})

// GET /api/bank/eb/connections  — liste les sessions Enable Banking
router.get('/eb/connections', (req, res) => {
  const rows = db.prepare(
    'SELECT id, session_id, bank_name, valid_until, last_sync, transaction_count, created_at FROM eb_sessions ORDER BY created_at DESC'
  ).all()
  res.json(rows)
})

// GET /api/bank/eb/sync/:id/stream  — synchronise via SSE
router.get('/eb/sync/:id/stream', async (req, res) => {
  const sess = db.prepare('SELECT * FROM eb_sessions WHERE id = ?').get(req.params.id)
  if (!sess) return res.status(404).json({ error: 'Session introuvable' })

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  send('progress', { message: 'Connexion à la banque...' })

  try {
    const accounts = JSON.parse(sess.accounts || '[]')
    if (!accounts.length) {
      send('fail', { error: 'Aucun compte associé à cette session' })
      return res.end()
    }

    const dateFrom = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)
    const dateTo = new Date().toISOString().slice(0, 10)
    console.log(`[eb sync] session=${sess.session_id}, dateFrom=${dateFrom}, dateTo=${dateTo}, accounts=${JSON.stringify(accounts)}`)

    const upsert = db.prepare(`
      INSERT INTO transactions (label, amount, date, source, external_id)
      VALUES (?, ?, ?, 'bank', ?)
      ON CONFLICT(external_id) DO UPDATE SET
        label  = excluded.label,
        amount = excluded.amount,
        date   = excluded.date
    `)
    let imported = 0
    let total    = 0

    for (let i = 0; i < accounts.length; i++) {
      const acc = accounts[i]
      send('progress', { message: `Récupération — ${acc.name} (${i + 1}/${accounts.length})...` })

      const txList = await eb.getTransactions(acc.uid, dateFrom, dateTo)
      total += txList.length

      // Log all CRDT transactions to diagnose income inflation
      const credits = txList.filter(t => t.credit_debit_indicator === 'CRDT')
      console.log(`[eb sync] CRDT transactions (${credits.length}):`)
      credits.forEach(t => console.log(`  ${t.booking_date} | ${t.transaction_amount?.amount} EUR | ${t.remittance_information?.[0] || '(no label)'}`))

      db.transaction((list) => {
        for (const tx of list) {
          const label     = tx.remittance_information?.[0] || tx.creditor?.name || tx.debtor?.name || 'Opération'
          const rawAmount = parseFloat(tx.transaction_amount?.amount || 0)
          const amount    = tx.credit_debit_indicator === 'DBIT' ? -Math.abs(rawAmount) : Math.abs(rawAmount)
          const date      = tx.booking_date || tx.transaction_date || dateTo
          const indicator = tx.credit_debit_indicator === 'DBIT' ? 'D' : 'C'
          const baseId    = tx.transaction_id ? `${tx.transaction_id}-${indicator}` : `${date}-${rawAmount}-${indicator}`
          const extId     = `eb-${acc.uid}-${baseId}`
          upsert.run(label, amount, date, extId)
          imported++
        }
      })(txList)
    }

    db.prepare(
      "UPDATE eb_sessions SET last_sync = datetime('now'), transaction_count = transaction_count + ? WHERE id = ?"
    ).run(imported, sess.id)

    send('done', { ok: true, imported, total })
    res.end()
  } catch (e) {
    console.error('[eb sync]', e.message)
    send('fail', { error: e.message })
    res.end()
  }
})

// DELETE /api/bank/eb/connection/:id
router.delete('/eb/connection/:id', (req, res) => {
  db.prepare('DELETE FROM eb_sessions WHERE id = ?').run(req.params.id)
  res.status(204).send()
})

module.exports = router
