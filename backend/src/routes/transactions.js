const express = require('express')
const multer  = require('multer')
const { parse } = require('csv-parse/sync')
const db      = require('../db')

const router  = express.Router()
const upload  = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })

// GET /api/transactions?month=2024-06
router.get('/', (req, res) => {
  const { month } = req.query
  let rows
  if (month) {
    rows = db.prepare(`
      SELECT * FROM transactions
      WHERE strftime('%Y-%m', date) = ?
      ORDER BY date DESC
    `).all(month)
  } else {
    rows = db.prepare('SELECT * FROM transactions ORDER BY date DESC LIMIT 200').all()
  }
  res.json(rows)
})

// POST /api/transactions
router.post('/', (req, res) => {
  const { label, amount, date, category_id, source } = req.body
  if (!label || amount === undefined || !date) {
    return res.status(400).json({ error: 'label, amount, date requis' })
  }
  const result = db.prepare(
    'INSERT INTO transactions (label, amount, date, category_id, source) VALUES (?, ?, ?, ?, ?)'
  ).run(label, amount, date, category_id || null, source || 'manual')
  const row = db.prepare('SELECT * FROM transactions WHERE id = ?').get(result.lastInsertRowid)
  res.status(201).json(row)
})

// PATCH /api/transactions/:id
router.patch('/:id', (req, res) => {
  const { category_id, label, amount, date } = req.body
  const tx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id)
  if (!tx) return res.status(404).json({ error: 'Not found' })

  db.prepare(`
    UPDATE transactions SET
      category_id = ?,
      label       = ?,
      amount      = ?,
      date        = ?
    WHERE id = ?
  `).run(
    category_id !== undefined ? category_id : tx.category_id,
    label  || tx.label,
    amount !== undefined ? amount : tx.amount,
    date   || tx.date,
    tx.id
  )
  res.json(db.prepare('SELECT * FROM transactions WHERE id = ?').get(tx.id))
})

// DELETE /api/transactions/:id
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM transactions WHERE id = ?').run(req.params.id)
  res.status(204).send()
})

// POST /api/transactions/import  (CSV)
router.post('/import', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Fichier requis' })

  let records
  try {
    const text = req.file.buffer.toString('utf-8')
    // Try to auto-detect CSV format (semicolon or comma, with/without header)
    const delimiter = text.includes(';') ? ';' : ','
    records = parse(text, {
      delimiter,
      skip_empty_lines: true,
      trim: true,
      bom: true,
    })
  } catch (e) {
    return res.status(400).json({ error: 'CSV invalide: ' + e.message })
  }

  // Auto-detect columns: date, label/libelle, amount/montant/debit/credit
  const headers = records[0].map(h => h.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''))
  const hasHeader = isNaN(parseFloat(headers[0])) && !headers[0].match(/^\d{2}[/\-.]/)

  const getCol = (...names) => {
    for (const n of names) {
      const idx = headers.findIndex(h => h.includes(n))
      if (idx >= 0) return idx
    }
    return -1
  }

  let dateIdx, labelIdx, amountIdx, debitIdx, creditIdx
  if (hasHeader) {
    dateIdx   = getCol('date')
    labelIdx  = getCol('libelle', 'label', 'description', 'intitule', 'operation')
    amountIdx = getCol('montant', 'amount', 'valeur')
    debitIdx  = getCol('debit', 'debit')
    creditIdx = getCol('credit', 'credit')
  } else {
    // Fallback: assume date, label, amount
    dateIdx = 0; labelIdx = 1; amountIdx = 2
  }

  const dataRows = hasHeader ? records.slice(1) : records

  const insert = db.prepare(`
    INSERT OR IGNORE INTO transactions (label, amount, date, source, external_id)
    VALUES (?, ?, ?, 'csv', ?)
  `)

  let imported = 0
  const insertMany = db.transaction(() => {
    for (const row of dataRows) {
      if (!row.length || row.every(c => !c)) continue

      const rawDate  = row[dateIdx]?.trim()
      const label    = row[labelIdx]?.trim()
      if (!rawDate || !label) continue

      // Parse French date formats: dd/mm/yyyy, dd-mm-yyyy, yyyy-mm-dd
      let date = rawDate
      const m = rawDate.match(/^(\d{2})[/\-.](\d{2})[/\-.](\d{4})$/)
      if (m) date = `${m[3]}-${m[2]}-${m[1]}`

      let amount = 0
      if (amountIdx >= 0) {
        amount = parseFloat(row[amountIdx]?.replace(',', '.').replace(/\s/g,'') || '0')
      } else if (debitIdx >= 0 || creditIdx >= 0) {
        const debit  = parseFloat(row[debitIdx]?.replace(',', '.') || '0') || 0
        const credit = parseFloat(row[creditIdx]?.replace(',', '.') || '0') || 0
        amount = credit - debit
      }

      const externalId = `csv-${date}-${label}-${amount}`
      const r = insert.run(label, amount, date, externalId)
      if (r.changes) imported++
    }
  })
  insertMany()

  res.json({ imported, total: dataRows.length })
})

module.exports = router
