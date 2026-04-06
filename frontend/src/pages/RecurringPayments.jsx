import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2, CheckCircle2, Clock, Repeat2 } from 'lucide-react'
import { getRecurring, createRecurring, updateRecurring, deleteRecurring, getRecurringForecast, autoCategorize } from '../services/api.js'

function fmt(amount) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount)
}

const MONTHS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']

function RecurringModal({ rec, categories, onClose, onSave }) {
  const [form, setForm] = useState({
    name:          rec?.name          || '',
    amount:        rec?.amount        !== undefined ? String(rec.amount) : '',
    category_id:   rec?.category_id   || '',
    day_of_month:  rec?.day_of_month  || 1,
    label_pattern: rec?.label_pattern || '',
  })
  const [saving, setSaving] = useState(false)
  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function submit() {
    if (!form.name || !form.amount || !form.day_of_month) return
    setSaving(true)
    try {
      await onSave({
        ...form,
        amount: parseFloat(form.amount),
        category_id: form.category_id || null,
        day_of_month: parseInt(form.day_of_month),
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
        <div className="modal-title">{rec ? 'Modifier' : 'Nouveau paiement récurrent'}</div>

        <div className="form-group">
          <label className="form-label">Nom</label>
          <input className="form-input" value={form.name} onChange={e => upd('name', e.target.value)} placeholder="Ex: Loyer, EDF, Salle de sport..." autoFocus />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Montant (€)</label>
            <input className="form-input" type="number" step="0.01" value={form.amount} onChange={e => upd('amount', e.target.value)} placeholder="-694.00" />
          </div>
          <div className="form-group">
            <label className="form-label">Jour du mois</label>
            <input className="form-input" type="number" min="1" max="31" value={form.day_of_month} onChange={e => upd('day_of_month', e.target.value)} />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Catégorie</label>
          <select className="form-input" value={form.category_id} onChange={e => upd('category_id', e.target.value)}>
            <option value="">— Non catégorisée</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Mot-clé libellé (optionnel)</label>
          <input className="form-input" value={form.label_pattern} onChange={e => upd('label_pattern', e.target.value)} placeholder="Ex: LOYER, EDF, FREEMOBILE..." />
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Utilisé pour reconnaître automatiquement la transaction dans le relevé</div>
        </div>

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving || !form.name || !form.amount}>{rec ? 'Enregistrer' : 'Créer'}</button>
        </div>
      </div>
    </div>
  )
}

export default function RecurringPayments({ categories, month, setMonth, reload: reloadTransactions, showToast }) {
  const [recurrings, setRecurrings]   = useState([])
  const [forecast, setForecast]       = useState([])
  const [loading, setLoading]         = useState(true)
  const [showModal, setShowModal]     = useState(false)
  const [editing, setEditing]         = useState(null)
  const [categorizing, setCategorizing] = useState(false)

  const [year, mon] = month.split('-').map(Number)
  function changeMonth(delta) {
    const d = new Date(year, mon - 1 + delta)
    setMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`)
  }

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [rRes, fRes] = await Promise.all([
        getRecurring(),
        getRecurringForecast(month),
      ])
      setRecurrings(rRes.data)
      setForecast([...fRes.data].sort((a, b) => a.expected_date.localeCompare(b.expected_date)))
    } catch {
      showToast('Erreur de chargement', 'error')
    } finally {
      setLoading(false)
    }
  }, [month, showToast])

  useEffect(() => { loadAll() }, [loadAll])

  async function handleSave(data) {
    if (editing) {
      await updateRecurring(editing.id, data)
      showToast('Paiement mis à jour', 'success')
    } else {
      await createRecurring(data)
      showToast('Paiement récurrent créé', 'success')
    }
    setEditing(null)
    loadAll()
  }

  async function handleDelete(rec) {
    if (!confirm(`Supprimer "${rec.name}" ?`)) return
    await deleteRecurring(rec.id)
    showToast('Supprimé', 'success')
    loadAll()
  }

  async function handleAutoCategorize() {
    setCategorizing(true)
    try {
      const { data } = await autoCategorize(month)
      showToast(`${data.categorized} opération(s) catégorisée(s) automatiquement`, 'success')
      loadAll()
      reloadTransactions()
    } catch {
      showToast('Erreur', 'error')
    } finally {
      setCategorizing(false)
    }
  }

  const forecastById = Object.fromEntries(forecast.map(f => [f.id, f]))

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Paiements récurrents</h1>
          <p className="page-subtitle">Charges fixes — catégorisation automatique</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="btn btn-secondary" onClick={handleAutoCategorize} disabled={categorizing}>
            <Repeat2 size={14} />
            {categorizing ? 'En cours...' : 'Auto-catégoriser ce mois'}
          </button>
          <button className="btn btn-primary" onClick={() => { setEditing(null); setShowModal(true) }}>
            <Plus size={14} /> Ajouter
          </button>
        </div>
      </div>

      <div className="page-body">
        {/* Month forecast */}
        <div className="card mb-4">
          <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="card-title">Prévisions — {MONTHS_FR[mon-1]} {year}</span>
            <div className="month-nav" style={{ marginBottom: 0 }}>
              <button onClick={() => changeMonth(-1)}>‹</button>
              <span>{MONTHS_FR[mon-1]} {year}</span>
              <button onClick={() => changeMonth(1)}>›</button>
            </div>
          </div>
          {loading ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>Chargement...</div>
          ) : forecast.length === 0 ? (
            <div className="empty-state">
              <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Aucun paiement récurrent actif</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {forecast.map(f => {
                const matched = !!f.matched_transaction_id
                const cat = categories.find(c => c.id === f.category_id)
                return (
                  <div key={f.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                    borderRadius: 'var(--radius)',
                    background: matched ? 'rgba(62,207,142,0.06)' : 'rgba(245,166,35,0.06)',
                    border: matched ? '1px solid rgba(62,207,142,0.2)' : '1px dashed rgba(245,166,35,0.3)',
                    opacity: matched ? 1 : 0.85,
                  }}>
                    {matched
                      ? <CheckCircle2 size={15} style={{ color: 'var(--green)', flexShrink: 0 }} />
                      : <Clock size={15} style={{ color: 'var(--amber)', flexShrink: 0 }} />
                    }
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 500 }}>{f.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        Prévu le {new Date(f.expected_date).toLocaleDateString('fr-FR')}
                        {cat && <span> · {cat.icon} {cat.name}</span>}
                      </div>
                    </div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13.5, color: f.amount < 0 ? 'var(--coral)' : 'var(--green)', fontWeight: 500 }}>
                      {fmt(f.amount)}
                    </span>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: matched ? 'rgba(62,207,142,0.15)' : 'rgba(245,166,35,0.15)', color: matched ? 'var(--green)' : 'var(--amber)', whiteSpace: 'nowrap' }}>
                      {matched ? 'Reçu' : 'En attente'}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Rules list */}
        <div className="card">
          <div className="card-header"><span className="card-title">Règles configurées</span></div>
          {loading ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>Chargement...</div>
          ) : recurrings.length === 0 ? (
            <div className="empty-state">
              <Repeat2 size={36} style={{ display: 'block', margin: '0 auto 12px', color: 'var(--text-muted)' }} />
              <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 4 }}>Aucune règle configurée</p>
              <p>Ajoutez vos charges fixes pour les retrouver automatiquement</p>
              <button className="btn btn-primary" style={{ marginTop: 20 }} onClick={() => setShowModal(true)}>
                <Plus size={14} /> Ajouter une règle
              </button>
            </div>
          ) : recurrings.map(rec => {
            const cat = categories.find(c => c.id === rec.category_id)
            const f = forecastById[rec.id]
            return (
              <div key={rec.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 'var(--radius)', background: 'var(--bg-raised)', border: '1px solid var(--border)', marginBottom: 6, opacity: rec.active ? 1 : 0.5 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500 }}>{rec.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    Chaque mois, le {rec.day_of_month}
                    {cat && <span> · {cat.icon} {cat.name}</span>}
                    {rec.label_pattern && <span> · mot-clé: "{rec.label_pattern}"</span>}
                  </div>
                </div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13.5, color: rec.amount < 0 ? 'var(--coral)' : 'var(--green)', fontWeight: 500 }}>
                  {fmt(rec.amount)}
                </span>
                <button className="btn btn-secondary btn-sm" onClick={() => { setEditing(rec); setShowModal(true) }}>
                  <Pencil size={12} />
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(rec)}>
                  <Trash2 size={12} />
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {showModal && (
        <RecurringModal
          rec={editing}
          categories={categories}
          onClose={() => { setShowModal(false); setEditing(null) }}
          onSave={handleSave}
        />
      )}
    </>
  )
}
