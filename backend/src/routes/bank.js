const express = require('express')
const db      = require('../db')
const woob    = require('../services/woob')
const router  = express.Router()

// GET /api/bank/backends
router.get('/backends', async (req, res) => {
  try {
    const result = await woob.listBackends()
    res.json(result)
  } catch (e) {
    res.status(200).json({
      backends: require('../services/woob').FALLBACK_BACKENDS || [],
      woob_installed: false,
      error: e.message,
    })
  }
})

// GET /api/bank/connections
router.get('/connections', (req, res) => {
  const rows = db.prepare(
    'SELECT id, backend_id, bank_name, login, last_sync, transaction_count, created_at FROM bank_connections ORDER BY created_at DESC'
  ).all()
  res.json(rows)
})

// POST /api/bank/check
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

// POST /api/bank/connect
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

// GET /api/bank/sync/:id/stream  — SSE, streams progress to the frontend
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

// DELETE /api/bank/connection/:id
router.delete('/connection/:id', (req, res) => {
  db.prepare('DELETE FROM bank_connections WHERE id = ?').run(req.params.id)
  res.status(204).send()
})

module.exports = router
