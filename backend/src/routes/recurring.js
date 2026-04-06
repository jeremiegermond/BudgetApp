const express = require('express')
const db      = require('../db')
const router  = express.Router()

// GET /api/recurring  — liste tous les paiements récurrents
router.get('/', (_, res) => {
  const rows = db.prepare(`
    SELECT r.*, c.name as category_name, c.icon as category_icon
    FROM recurring_payments r
    LEFT JOIN categories c ON r.category_id = c.id
    ORDER BY r.day_of_month
  `).all()
  res.json(rows)
})

// POST /api/recurring  — créer un paiement récurrent
router.post('/', (req, res) => {
  const { name, amount, category_id, day_of_month, label_pattern } = req.body
  if (!name || amount === undefined || !day_of_month)
    return res.status(400).json({ error: 'name, amount, day_of_month requis' })

  const r = db.prepare(`
    INSERT INTO recurring_payments (name, amount, category_id, day_of_month, label_pattern)
    VALUES (?, ?, ?, ?, ?)
  `).run(name, parseFloat(amount), category_id || null, parseInt(day_of_month), label_pattern || null)

  const row = db.prepare(`
    SELECT r.*, c.name as category_name, c.icon as category_icon
    FROM recurring_payments r LEFT JOIN categories c ON r.category_id = c.id
    WHERE r.id = ?
  `).get(r.lastInsertRowid)
  res.status(201).json(row)
})

// PATCH /api/recurring/:id
router.patch('/:id', (req, res) => {
  const rec = db.prepare('SELECT * FROM recurring_payments WHERE id = ?').get(req.params.id)
  if (!rec) return res.status(404).json({ error: 'Not found' })

  const { name, amount, category_id, day_of_month, label_pattern, active } = req.body
  db.prepare(`
    UPDATE recurring_payments SET
      name = ?, amount = ?, category_id = ?, day_of_month = ?, label_pattern = ?, active = ?
    WHERE id = ?
  `).run(
    name ?? rec.name,
    amount !== undefined ? parseFloat(amount) : rec.amount,
    category_id !== undefined ? (category_id || null) : rec.category_id,
    day_of_month !== undefined ? parseInt(day_of_month) : rec.day_of_month,
    label_pattern !== undefined ? (label_pattern || null) : rec.label_pattern,
    active !== undefined ? (active ? 1 : 0) : rec.active,
    rec.id
  )

  const row = db.prepare(`
    SELECT r.*, c.name as category_name, c.icon as category_icon
    FROM recurring_payments r LEFT JOIN categories c ON r.category_id = c.id
    WHERE r.id = ?
  `).get(rec.id)
  res.json(row)
})

// DELETE /api/recurring/:id
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM recurring_payments WHERE id = ?').run(req.params.id)
  res.status(204).send()
})

// GET /api/recurring/forecast/:month  — retourne les prévisions non matchées pour un mois (YYYY-MM)
router.get('/forecast/:month', (req, res) => {
  const month = req.params.month // YYYY-MM
  const [year, mon] = month.split('-').map(Number)

  const recurrings = db.prepare('SELECT * FROM recurring_payments WHERE active = 1 ORDER BY day_of_month').all()

  const forecasts = recurrings.map(rec => {
    // Expected date for this month
    const maxDay = new Date(year, mon, 0).getDate() // last day of month
    const day = Math.min(rec.day_of_month, maxDay)
    const expectedDate = `${month}-${String(day).padStart(2, '0')}`

    // Check if a real transaction already matches this recurring payment
    // Match by: amount within 1€, date within ±5 days, or label pattern
    const dateFrom = new Date(year, mon - 1, day - 5).toISOString().slice(0, 10)
    const dateTo   = new Date(year, mon - 1, day + 5).toISOString().slice(0, 10)

    let matched = null

    if (rec.label_pattern) {
      matched = db.prepare(`
        SELECT id FROM transactions
        WHERE date BETWEEN ? AND ?
          AND amount BETWEEN ? AND ?
          AND label LIKE ?
        LIMIT 1
      `).get(dateFrom, dateTo, rec.amount - 1, rec.amount + 1, `%${rec.label_pattern}%`)
    }

    if (!matched) {
      matched = db.prepare(`
        SELECT id FROM transactions
        WHERE date BETWEEN ? AND ?
          AND amount BETWEEN ? AND ?
        LIMIT 1
      `).get(dateFrom, dateTo, rec.amount - 1, rec.amount + 1)
    }

    return {
      ...rec,
      expected_date: expectedDate,
      matched_transaction_id: matched?.id || null,
    }
  })

  res.json(forecasts)
})

// POST /api/recurring/auto-categorize  — catégorise les transactions matchant les règles récurrentes
router.post('/auto-categorize', (req, res) => {
  const { month } = req.body
  if (!month) return res.status(400).json({ error: 'month requis (YYYY-MM)' })

  const [year, mon] = month.split('-').map(Number)
  const recurrings = db.prepare('SELECT * FROM recurring_payments WHERE active = 1 AND category_id IS NOT NULL ORDER BY day_of_month').all()

  let categorized = 0
  for (const rec of recurrings) {
    const maxDay = new Date(year, mon, 0).getDate()
    const day = Math.min(rec.day_of_month, maxDay)
    const dateFrom = new Date(year, mon - 1, day - 5).toISOString().slice(0, 10)
    const dateTo   = new Date(year, mon - 1, day + 5).toISOString().slice(0, 10)

    let tx = null
    if (rec.label_pattern) {
      tx = db.prepare(`
        SELECT id FROM transactions
        WHERE date BETWEEN ? AND ?
          AND amount BETWEEN ? AND ?
          AND label LIKE ?
          AND category_id IS NULL
        LIMIT 1
      `).get(dateFrom, dateTo, rec.amount - 1, rec.amount + 1, `%${rec.label_pattern}%`)
    }
    if (!tx) {
      tx = db.prepare(`
        SELECT id FROM transactions
        WHERE date BETWEEN ? AND ?
          AND amount BETWEEN ? AND ?
          AND category_id IS NULL
        LIMIT 1
      `).get(dateFrom, dateTo, rec.amount - 1, rec.amount + 1)
    }

    if (tx) {
      db.prepare('UPDATE transactions SET category_id = ? WHERE id = ?').run(rec.category_id, tx.id)
      categorized++
    }
  }

  res.json({ categorized })
})

module.exports = router
