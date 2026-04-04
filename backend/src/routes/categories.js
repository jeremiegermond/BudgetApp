const express = require('express')
const db      = require('../db')
const router  = express.Router()

router.get('/', (_, res) => {
  res.json(db.prepare('SELECT * FROM categories ORDER BY name').all())
})

router.post('/', (req, res) => {
  const { name, icon } = req.body
  if (!name) return res.status(400).json({ error: 'name requis' })
  const r = db.prepare('INSERT INTO categories (name, icon) VALUES (?, ?)').run(name, icon || '🏷️')
  res.status(201).json(db.prepare('SELECT * FROM categories WHERE id = ?').get(r.lastInsertRowid))
})

router.patch('/:id', (req, res) => {
  const { name, icon } = req.body
  const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id)
  if (!cat) return res.status(404).json({ error: 'Not found' })
  db.prepare('UPDATE categories SET name = ?, icon = ? WHERE id = ?')
    .run(name || cat.name, icon || cat.icon, cat.id)
  res.json(db.prepare('SELECT * FROM categories WHERE id = ?').get(cat.id))
})

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id)
  res.status(204).send()
})

module.exports = router
