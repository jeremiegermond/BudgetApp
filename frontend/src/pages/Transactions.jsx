import { useState, useMemo } from 'react'
import { DndContext, DragOverlay, useDraggable, useDroppable, closestCenter } from '@dnd-kit/core'
import { Plus, Upload, ChevronLeft, ChevronRight, GripVertical, FolderPlus, Clock } from 'lucide-react'
import { updateTransaction, createTransaction, importCSV, createCategory } from '../services/api.js'

const MONTHS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']

function fmt(amount) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount)
}

function DraggableItem({ transaction }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: transaction.id })
  const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: 50 } : {}
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}
      className={`dnd-item ${isDragging ? 'dragging' : ''}`}>
      <GripVertical size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
      <span className="dnd-item-label">{transaction.label}</span>
      <span className="dnd-item-date">{new Date(transaction.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}</span>
      <span className={`dnd-item-amount ${transaction.amount < 0 ? 'amount-negative' : 'amount-positive'}`}>
        {fmt(transaction.amount)}
      </span>
    </div>
  )
}

function DroppableColumn({ id, title, color, transactions, count }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div className="dnd-column" style={{ borderTop: `2px solid ${color}` }}>
      <div className="dnd-column-header">
        <div className="dnd-column-title">
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
          {title}
        </div>
        <span className="dnd-column-count">{count}</span>
      </div>
      <div ref={setNodeRef} className={`dnd-items ${isOver ? 'dnd-drop-zone over' : ''}`} style={{ minHeight: 80 }}>
        {transactions.map(t => <DraggableItem key={t.id} transaction={t} />)}
        {transactions.length === 0 && (
          <div className="dnd-drop-zone" style={{ margin: 4 }}>Déposer ici</div>
        )}
      </div>
    </div>
  )
}

const COMMON_EMOJIS = ['🏷️','🛒','🚗','🏠','💊','📱','💰','🍽️','🎮','✈️','👗','🎓','🐾','🎁','⚡','🏋️','🚇','🎬','📚','🏥','🔧','💻','🌍','↔️']

function AddCategoryModal({ onClose, onSave }) {
  const [name, setName]         = useState('')
  const [icon, setIcon]         = useState('🏷️')
  const [isTransfer, setIsTransfer] = useState(false)
  const [saving, setSaving]     = useState(false)

  async function submit() {
    if (!name.trim()) return
    setSaving(true)
    try { await onSave({ name: name.trim(), icon, is_transfer: isTransfer }); onClose() }
    finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
        <div className="modal-title">Nouvelle catégorie</div>
        <div className="form-group">
          <label className="form-label">Nom</label>
          <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Vacances" autoFocus />
        </div>
        <div className="form-group">
          <label className="form-label">Icône</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {COMMON_EMOJIS.map(e => (
              <button key={e} onClick={() => setIcon(e)}
                style={{ width: 34, height: 34, borderRadius: 6, border: `1.5px solid ${icon === e ? 'var(--amber)' : 'var(--border)'}`, background: icon === e ? 'rgba(245,166,35,0.1)' : 'var(--bg-raised)', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {e}
              </button>
            ))}
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer', marginBottom: 16 }}>
          <input type="checkbox" checked={isTransfer} onChange={e => setIsTransfer(e.target.checked)} />
          Catégorie virement (exclue des stats revenus/dépenses)
        </label>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving || !name.trim()}>Créer</button>
        </div>
      </div>
    </div>
  )
}

function AddTransactionModal({ onClose, onSave, categories }) {
  const [form, setForm] = useState({ label: '', amount: '', date: new Date().toISOString().slice(0,10), category_id: '' })
  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function submit() {
    if (!form.label || !form.amount || !form.date) return
    await onSave({ ...form, amount: parseFloat(form.amount) })
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">Ajouter une opération</div>
        <div className="form-group">
          <label className="form-label">Libellé</label>
          <input className="form-input" value={form.label} onChange={e => upd('label', e.target.value)} placeholder="Ex: Courses Leclerc" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Montant (€)</label>
            <input className="form-input" type="number" step="0.01" value={form.amount} onChange={e => upd('amount', e.target.value)} placeholder="-45.20" />
          </div>
          <div className="form-group">
            <label className="form-label">Date</label>
            <input className="form-input" type="date" value={form.date} onChange={e => upd('date', e.target.value)} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Catégorie (optionnel)</label>
          <select className="form-input" value={form.category_id} onChange={e => upd('category_id', e.target.value)}>
            <option value="">— Non catégorisée</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={submit}>Ajouter</button>
        </div>
      </div>
    </div>
  )
}

export default function Transactions({ categories, transactions, forecast = [], month, setMonth, reload, showToast, CATEGORY_COLORS }) {
  const [activeId, setActiveId]     = useState(null)
  const [showAdd, setShowAdd]       = useState(false)
  const [showAddCat, setShowAddCat] = useState(false)
  const [importing, setImporting]   = useState(false)

  const [year, mon] = month.split('-').map(Number)
  function changeMonth(delta) {
    const d = new Date(year, mon - 1 + delta)
    setMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`)
  }

  const grouped = useMemo(() => {
    const uncategorized = transactions.filter(t => !t.category_id)
    const byCat = categories.map((cat, i) => ({
      ...cat,
      color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
      transactions: transactions.filter(t => t.category_id === cat.id)
    }))
    return { uncategorized, byCat }
  }, [transactions, categories, CATEGORY_COLORS])

  const activeTransaction = activeId ? transactions.find(t => t.id === activeId) : null
  const pendingRecurring  = useMemo(() => forecast.filter(f => !f.matched_transaction_id), [forecast])

  async function handleDragEnd({ active, over }) {
    setActiveId(null)
    if (!over) return
    const targetCatId = over.id === 'uncategorized' ? null : over.id
    const tx = transactions.find(t => t.id === active.id)
    if (!tx || tx.category_id === targetCatId) return
    try {
      await updateTransaction(active.id, { category_id: targetCatId })
      await reload()
      showToast('Catégorie mise à jour', 'success')
    } catch {
      showToast('Erreur lors de la mise à jour', 'error')
    }
  }

  async function handleCSV(e) {
    const file = e.target.files[0]
    if (!file) return
    setImporting(true)
    try {
      const res = await importCSV(file)
      await reload()
      showToast(`${res.data.imported} opérations importées`, 'success')
    } catch {
      showToast("Erreur d'import CSV", 'error')
    } finally {
      setImporting(false)
      e.target.value = ''
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Opérations</h1>
          <p className="page-subtitle">Triez vos opérations par glisser-déposer</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="month-nav">
            <button onClick={() => changeMonth(-1)}><ChevronLeft size={16} /></button>
            <span>{MONTHS_FR[mon-1]} {year}</span>
            <button onClick={() => changeMonth(1)}><ChevronRight size={16} /></button>
          </div>
          <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
            <Upload size={14} />
            {importing ? 'Import...' : 'Import CSV'}
            <input type="file" accept=".csv" style={{ display: 'none' }} onChange={handleCSV} />
          </label>
          <button className="btn btn-secondary" onClick={() => setShowAddCat(true)}>
            <FolderPlus size={14} /> Catégorie
          </button>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
            <Plus size={14} /> Ajouter
          </button>
        </div>
      </div>

      <div className="page-body">
        <DndContext
          collisionDetection={closestCenter}
          onDragStart={({ active }) => setActiveId(active.id)}
          onDragEnd={handleDragEnd}
        >
          <div className="dnd-board">
            <div>
              <DroppableColumn
                id="uncategorized"
                title="Non catégorisées"
                color="var(--amber)"
                transactions={grouped.uncategorized}
                count={grouped.uncategorized.length}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
              {grouped.byCat.map(cat => (
                <DroppableColumn
                  key={cat.id}
                  id={cat.id}
                  title={cat.name}
                  color={cat.color}
                  transactions={cat.transactions}
                  count={cat.transactions.length}
                />
              ))}
            </div>
          </div>

          <DragOverlay>
            {activeTransaction && (
              <div className="dnd-item" style={{ boxShadow: 'var(--shadow-lg)', opacity: 0.95 }}>
                <GripVertical size={12} style={{ color: 'var(--text-muted)' }} />
                <span className="dnd-item-label">{activeTransaction.label}</span>
                <span className={`dnd-item-amount ${activeTransaction.amount < 0 ? 'amount-negative' : 'amount-positive'}`}>
                  {fmt(activeTransaction.amount)}
                </span>
              </div>
            )}
          </DragOverlay>
        </DndContext>

        {pendingRecurring.length > 0 && (
          <div className="card mt-4">
            <div className="card-header">
              <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Clock size={14} style={{ color: 'var(--amber)' }} /> À venir ce mois
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {pendingRecurring.map(f => {
                const cat = categories.find(c => c.id === f.category_id)
                return (
                  <div key={f.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                    borderRadius: 'var(--radius)', border: '1px dashed rgba(245,166,35,0.35)',
                    background: 'rgba(245,166,35,0.05)',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{f.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        Prévu le {new Date(f.expected_date).toLocaleDateString('fr-FR')}
                        {cat && <span> · {cat.icon} {cat.name}</span>}
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
      </div>

      {showAdd && (
        <AddTransactionModal
          categories={categories}
          onClose={() => setShowAdd(false)}
          onSave={async (data) => { await createTransaction(data); await reload(); showToast('Opération ajoutée', 'success') }}
        />
      )}
      {showAddCat && (
        <AddCategoryModal
          onClose={() => setShowAddCat(false)}
          onSave={async (data) => { await createCategory(data); await reload(); showToast('Catégorie créée', 'success') }}
        />
      )}
    </>
  )
}
