import { useState, useEffect, useCallback, useRef } from 'react'
import Layout from './components/Layout.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Transactions from './pages/Transactions.jsx'
import Budget from './pages/Budget.jsx'
import BankSync from './pages/BankSync.jsx'
import RecurringPayments from './pages/RecurringPayments.jsx'
import { getCategories, getTransactions, getBudget, getEBConnections, getRecurringForecast } from './services/api.js'

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
  const [forecast, setForecast]       = useState([])
  const [month, setMonth]             = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
  })
  const [loading, setLoading]         = useState(true)
  const [toast, setToast]             = useState(null)
  const autoSyncDone = useRef(false)

  const showToast = useCallback((msg, type = 'info') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }, [])

  const reload = useCallback(async () => {
    try {
      setLoading(true)
      const [cRes, tRes, bRes, fRes] = await Promise.all([
        getCategories(),
        getTransactions({ month }),
        getBudget(month),
        getRecurringForecast(month),
      ])
      setCategories(cRes.data)
      setTransactions(tRes.data)
      setBudget(bRes.data)
      setForecast(fRes.data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [month])

  useEffect(() => { reload() }, [reload])

  // Auto-sync all EB connections on startup
  useEffect(() => {
    if (autoSyncDone.current) return
    autoSyncDone.current = true

    async function runAutoSync() {
      try {
        const { data: conns } = await getEBConnections()
        if (!conns.length) return

        let totalImported = 0
        await Promise.all(conns.map(conn => new Promise(resolve => {
          const es = new EventSource(`/api/bank/eb/sync/${conn.id}/stream`)
          es.addEventListener('done', (e) => {
            es.close()
            try { totalImported += JSON.parse(e.data).imported || 0 } catch {}
            resolve()
          })
          es.addEventListener('fail', () => { es.close(); resolve() })
          es.onerror = () => { es.close(); resolve() }
        })))

        if (totalImported > 0) {
          reload()
          showToast(`${totalImported} nouvelle(s) opération(s) importée(s)`, 'success')
        }
      } catch {}
    }

    runAutoSync()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const ctx = { categories, transactions, budget, forecast, month, setMonth, reload, showToast, CATEGORY_COLORS }

  return (
    <Layout page={page} setPage={setPage}>
      {page === 'dashboard'    && <Dashboard    {...ctx} loading={loading} />}
      {page === 'transactions' && <Transactions {...ctx} loading={loading} />}
      {page === 'budget'       && <Budget       {...ctx} loading={loading} />}
      {page === 'recurring'    && <RecurringPayments {...ctx} />}
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
