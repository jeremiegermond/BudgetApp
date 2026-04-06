import { useMemo } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { ChevronLeft, ChevronRight, Tags, Clock } from 'lucide-react'

const MONTHS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']

function fmt(amount) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount)
}

function CustomTooltip({ active, payload, categories, transactions }) {
  if (!active || !payload?.length) return null
  const cat = payload[0].payload
  const catTransactions = transactions.filter(t => t.category_id === cat.id && t.amount < 0)
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-title">
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: cat.fill, display: 'inline-block' }} />
        {cat.name}
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', color: 'var(--coral)' }}>
          {fmt(Math.abs(cat.value))}
        </span>
      </div>
      {catTransactions.slice(0, 5).map(t => (
        <div key={t.id} className="chart-tooltip-item">
          <span className="chart-tooltip-label">{t.label}</span>
          <span className="chart-tooltip-amount">{fmt(Math.abs(t.amount))}</span>
        </div>
      ))}
      {catTransactions.length > 5 && (
        <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 4, textAlign: 'right' }}>
          +{catTransactions.length - 5} opérations
        </div>
      )}
    </div>
  )
}

export default function Dashboard({ categories, transactions, budget, forecast = [], month, setMonth, loading, CATEGORY_COLORS }) {
  const [year, mon] = month.split('-').map(Number)

  function changeMonth(delta) {
    const d = new Date(year, mon - 1 + delta)
    setMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`)
  }

  const transferCatIds = useMemo(
    () => new Set(categories.filter(c => c.is_transfer).map(c => c.id)),
    [categories]
  )

  // Pending recurring payments (not yet matched this month)
  const pendingRecurring = useMemo(
    () => forecast.filter(f => !f.matched_transaction_id),
    [forecast]
  )

  const stats = useMemo(() => {
    const nonTransfer = transactions.filter(t => !transferCatIds.has(t.category_id))
    const income  = nonTransfer.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)
    const expense = nonTransfer.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)

    // Add pending recurring debits to projected expense
    const pendingExpense = pendingRecurring
      .filter(f => f.amount < 0)
      .reduce((s, f) => s + Math.abs(f.amount), 0)

    const projectedBalance = income - expense - pendingExpense
    const uncategorized = transactions.filter(t => !t.category_id).length
    return { income, expense, pendingExpense, projectedBalance, uncategorized }
  }, [transactions, transferCatIds, pendingRecurring])

  const chartData = useMemo(() => {
    return categories.filter(c => !c.is_transfer).map((cat, i) => {
      const spent = transactions
        .filter(t => t.category_id === cat.id && t.amount < 0)
        .reduce((s, t) => s + Math.abs(t.amount), 0)
      return { ...cat, value: spent, fill: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }
    }).filter(d => d.value > 0)
  }, [categories, transactions, CATEGORY_COLORS])

  const recentTransactions = useMemo(() => {
    return [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 8)
  }, [transactions])

  if (loading) return <div className="page-body" style={{ color: 'var(--text-muted)', paddingTop: 40, textAlign: 'center' }}>Chargement...</div>

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Tableau de bord</h1>
          <p className="page-subtitle">Vue d'ensemble de vos finances</p>
        </div>
        <div className="month-nav">
          <button onClick={() => changeMonth(-1)}><ChevronLeft size={16} /></button>
          <span>{MONTHS_FR[mon-1]} {year}</span>
          <button onClick={() => changeMonth(1)}><ChevronRight size={16} /></button>
        </div>
      </div>

      <div className="page-body">
        {/* Stats */}
        <div className="stats-grid">
          <div className="stat-card positive">
            <div className="stat-label">Revenus</div>
            <div className="stat-value positive">{fmt(stats.income)}</div>
            <div className="stat-sub">{transactions.filter(t => t.amount > 0 && !transferCatIds.has(t.category_id)).length} opérations</div>
          </div>
          <div className="stat-card negative">
            <div className="stat-label">Dépenses réelles</div>
            <div className="stat-value negative">{fmt(stats.expense)}</div>
            <div className="stat-sub">{transactions.filter(t => t.amount < 0 && !transferCatIds.has(t.category_id)).length} opérations</div>
          </div>
          <div className="stat-card" style={{ borderTop: '2px solid var(--amber)' }}>
            <div className="stat-label">À venir (récurrents)</div>
            <div className="stat-value" style={{ color: 'var(--amber)' }}>{fmt(stats.pendingExpense)}</div>
            <div className="stat-sub">{pendingRecurring.filter(f => f.amount < 0).length} paiement(s)</div>
          </div>
          <div className={`stat-card ${stats.projectedBalance >= 0 ? 'neutral' : 'negative'}`}>
            <div className="stat-label">Solde projeté</div>
            <div className={`stat-value ${stats.projectedBalance >= 0 ? 'neutral' : 'negative'}`}>{fmt(stats.projectedBalance)}</div>
            <div className="stat-sub">Réel + prévisions</div>
          </div>
        </div>

        <div className="grid-2" style={{ alignItems: 'stretch' }}>
          {/* Chart */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="card-header">
              <span className="card-title">Répartition des dépenses</span>
            </div>
            {chartData.length > 0 ? (
              <div style={{ flex: 1, display: 'flex', gap: 20, alignItems: 'center' }}>
                <div style={{ flex: '0 0 180px', alignSelf: 'stretch', minHeight: 180 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={chartData} cx="50%" cy="50%" innerRadius={50} outerRadius={78} paddingAngle={2} dataKey="value" stroke="none">
                        {chartData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                      </Pie>
                      <Tooltip content={<CustomTooltip transactions={transactions} categories={categories} />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ flex: 1 }}>
                  {chartData.map((d, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: d.fill, flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: 12.5, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-primary)' }}>{fmt(d.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="empty-state" style={{ flex: 1 }}>
                <PieChart size={32} />
                <p>Aucune dépense catégorisée ce mois</p>
              </div>
            )}
          </div>

          {/* Budget progress */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Suivi du budget</span>
            </div>
            {budget.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {budget.map((b, i) => {
                  const cat = categories.find(c => c.id === b.category_id)
                  if (!cat) return null
                  const spent = transactions
                    .filter(t => t.category_id === b.category_id && t.amount < 0)
                    .reduce((s, t) => s + Math.abs(t.amount), 0)
                  // Add pending recurring for this category
                  const pendingForCat = pendingRecurring
                    .filter(f => f.category_id === b.category_id && f.amount < 0)
                    .reduce((s, f) => s + Math.abs(f.amount), 0)
                  const projected = spent + pendingForCat
                  const pctSpent = Math.min((spent / b.amount) * 100, 100)
                  const pctProjected = Math.min((projected / b.amount) * 100, 100)
                  const color = pctProjected > 90 ? 'var(--coral)' : pctProjected > 70 ? 'var(--amber)' : 'var(--green)'
                  return (
                    <div key={b.id}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                        <span style={{ fontSize: 13, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 7 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />
                          {cat.name}
                        </span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-secondary)' }}>
                          {fmt(spent)}{pendingForCat > 0 && <span style={{ color: 'var(--amber)' }}> +{fmt(pendingForCat)}</span>} / {fmt(b.amount)}
                        </span>
                      </div>
                      <div className="progress-bar" style={{ position: 'relative' }}>
                        {/* Projected (faded) */}
                        {pendingForCat > 0 && (
                          <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${pctProjected}%`, background: color, opacity: 0.25, borderRadius: 4 }} />
                        )}
                        {/* Real spent */}
                        <div className="progress-fill" style={{ width: `${pctSpent}%`, background: color }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="empty-state">
                <Tags size={32} />
                <p>Aucun budget défini</p>
              </div>
            )}
          </div>
        </div>

        {/* À venir — pending recurring */}
        {pendingRecurring.length > 0 && (
          <div className="card mt-4">
            <div className="card-header">
              <span className="card-title">À venir ce mois</span>
              <span style={{ fontSize: 12, color: 'var(--amber)', fontFamily: 'var(--font-mono)' }}>
                {fmt(stats.pendingExpense)} restants
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
              {pendingRecurring.map(f => {
                const cat = categories.find(c => c.id === f.category_id)
                return (
                  <div key={f.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
                    borderRadius: 'var(--radius)', border: '1px dashed rgba(245,166,35,0.35)',
                    background: 'rgba(245,166,35,0.05)',
                  }}>
                    <Clock size={13} style={{ color: 'var(--amber)', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {cat ? `${cat.icon} ${cat.name}` : 'Non catégorisé'} · le {new Date(f.expected_date).getDate()}
                      </div>
                    </div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: f.amount < 0 ? 'var(--coral)' : 'var(--green)', flexShrink: 0 }}>
                      {fmt(f.amount)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Recent transactions */}
        <div className="card mt-4">
          <div className="card-header">
            <span className="card-title">Dernières opérations</span>
          </div>
          {recentTransactions.length > 0 ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Libellé</th>
                  <th>Catégorie</th>
                  <th style={{ textAlign: 'right' }}>Montant</th>
                </tr>
              </thead>
              <tbody>
                {recentTransactions.map(t => {
                  const cat = categories.find(c => c.id === t.category_id)
                  return (
                    <tr key={t.id}>
                      <td className="text-mono" style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                        {new Date(t.date).toLocaleDateString('fr-FR')}
                      </td>
                      <td>{t.label}</td>
                      <td>
                        {cat ? (
                          <span className="badge" style={{ background: `${CATEGORY_COLORS[categories.indexOf(cat) % CATEGORY_COLORS.length]}20`, color: CATEGORY_COLORS[categories.indexOf(cat) % CATEGORY_COLORS.length] }}>
                            {cat.name}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <span className={t.amount >= 0 ? 'amount-positive' : 'amount-negative'}>
                          {t.amount >= 0 ? '+' : ''}{fmt(t.amount)}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : (
            <div className="empty-state">
              <p>Aucune opération ce mois</p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
