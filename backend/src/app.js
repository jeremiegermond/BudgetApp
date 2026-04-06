require('dotenv').config()
const express = require('express')
const cors    = require('cors')
const path    = require('path')

const app = express()

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }))
app.use(express.json())

// API Routes
app.use('/api/transactions', require('./routes/transactions'))
app.use('/api/categories',   require('./routes/categories'))
app.use('/api/budget',       require('./routes/budget'))
app.use('/api/bank',         require('./routes/bank'))
app.use('/api/recurring',    require('./routes/recurring'))
app.get('/api/health', (_, res) => res.json({ ok: true }))

// In production (Electron), serve the built React frontend
if (process.env.NODE_ENV === 'production') {
  const distPath = process.env.RESOURCES_PATH
    ? path.join(process.env.RESOURCES_PATH, 'frontend/dist')
    : path.join(__dirname, '../../../frontend/dist')
  app.use(express.static(distPath))
  app.get('*', (_, res) => res.sendFile(path.join(distPath, 'index.html')))
}

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`Budget API → http://localhost:${PORT}`))
