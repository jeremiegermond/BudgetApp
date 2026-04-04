import { useState, useEffect, useCallback } from 'react'
import Layout from './components/Layout.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Transactions from './pages/Transactions.jsx'
import Budget from './pages/Budget.jsx'
import BankSync from './pages/BankSync.jsx'
import { getCategories, getTransactions, getBudget } from './services/api.js'

const CATEGORY_COLORS = [
  '#f5a623','#3ecf8e','#4d9ef7','#a78bfa',
  '#2dd4bf','#fb7185','#38bdf8','#fbbf24',
  '#34d399','#818cf8','#f472b6','#60a5fa'
]

export default function App() {
  const [page, setPage]               = useState('dashboard')
  const [categories, setCategories]   = useState([])
  const [transactions, setTransactions] = useState([])
  const [budget, setBudget]           = useState([])
  const [month, setMonth]             = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
  })
  const [loading, setLoading]         = useState(true)
  const [toast, setToast]             = useState(null)

  const showToast = useCallback((msg, type = 'info') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }, [])

  const reload = useCallback(async () => {
    try {
      setLoading(true)
      const [cRes, tRes, bRes] = await Promise.all([
        getCategories(),
        getTransactions({ month }),
        getBudget(month),
      ])
      setCategories(cRes.data)
      setTransactions(tRes.data)
      setBudget(bRes.data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [month])

  useEffect(() => { reload() }, [reload])

  const ctx = { categories, transactions, budget, month, setMonth, reload, showToast, CATEGORY_COLORS }

  return (
    <Layout page={page} setPage={setPage}>
      {page === 'dashboard'    && <Dashboard    {...ctx} loading={loading} />}
      {page === 'transactions' && <Transactions {...ctx} loading={loading} />}
      {page === 'budget'       && <Budget       {...ctx} loading={loading} />}
      {page === 'bank'         && <BankSync     {...ctx} />}

      {toast && (
        <div className={`toast ${toast.type}`}>
          <span>{toast.type === 'success' ? '✓' : toast.type === 'error' ? '✕' : 'ℹ'}</span>
          {toast.msg}
        </div>
      )}
    </Layout>
  )
}
