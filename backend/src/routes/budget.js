const express = require('express')
const db      = require('../db')
const router  = express.Router()

// GET /api/budget?month=2024-06
router.get('/', (req, res) => {
  const { month } = req.query
  if (!month) return res.status(400).json({ error: 'month requis (YYYY-MM)' })
  res.json(db.prepare('SELECT * FROM budget WHERE month = ?').all(month))
})

// POST /api/budget  { category_id, month, amount }
router.post('/', (req, res) => {
  const { category_id, month, amount } = req.body
  if (!category_id || !month || amount === undefined)
    return res.status(400).json({ error: 'category_id, month, amount requis' })

  db.prepare(`
    INSERT INTO budget (category_id, month, amount) VALUES (?, ?, ?)
    ON CONFLICT(category_id, month) DO UPDATE SET amount = excluded.amount
  `).run(category_id, month, amount)

  const row = db.prepare('SELECT * FROM budget WHERE category_id = ? AND month = ?').get(category_id, month)
  res.status(201).json(row)
})

// DELETE /api/budget/:id
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM budget WHERE id = ?').run(req.params.id)
  res.status(204).send()
})

module.exports = router
