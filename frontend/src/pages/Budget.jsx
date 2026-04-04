import { useState, useMemo } from 'react'
import { Plus, Pencil, Trash2, ChevronLeft, ChevronRight } from 'lucide-react'
import { createCategory, updateCategory, deleteCategory, setBudgetItem, deleteBudgetItem } from '../services/api.js'

const MONTHS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']

function fmt(amount) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount)
}

const ICONS = ['🛒','🚗','🎮','🏠','💊','📱','💰','🍽️','✈️','🎓','👔','🐾']

function CategoryModal({ initial, onClose, onSave }) {
  const [name, setName] = useState(initial?.name || '')
  const [icon, setIcon] = useState(initial?.icon || '🏷️')

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">{initial ? 'Modifier' : 'Nouvelle'} catégorie</div>
        <div className="form-group">
          <label className="form-label">Nom</label>
          <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Alimentation" autoFocus />
        </div>
        <div className="form-group">
          <label className="form-label">Icône</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {ICONS.map(ic => (
              <button key={ic} onClick={() => setIcon(ic)}
                style={{ width: 38, height: 38, borderRadius: 8, border: `2px solid ${icon === ic ? 'var(--amber)' : 'var(--border)'}`, background: icon === ic ? 'rgba(245,166,35,0.1)' : 'var(--bg-raised)', cursor: 'pointer', fontSize: 18 }}>
                {ic}
              </button>
            ))}
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={() => name.trim() && onSave({ name: name.trim(), icon })}>
            {initial ? 'Enregistrer' : 'Créer'}
          </button>
        </div>
      </div>
    </div>
  )
}

function BudgetModal({ category, current, onClose, onSave }) {
  const [amount, setAmount] = useState(current?.amount || '')

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">Budget — {category.name}</div>
        <div className="form-group">
          <label className="form-label">Montant alloué (€/mois)</label>
          <input className="form-input" type="number" step="10" min="0" value={amount}
            onChange={e => setAmount(e.target.value)} placeholder="Ex: 400" autoFocus />
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={() => amount && onSave(parseFloat(amount))}>
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Budget({ categories, transactions, budget, month, setMonth, reload, showToast, CATEGORY_COLORS }) {
  const [editCat, setEditCat]       = useState(null)
  const [newCat, setNewCat]         = useState(false)
  const [editBudget, setEditBudget] = useState(null)

  const [year, mon] = month.split('-').map(Number)
  function changeMonth(delta) {
    const d = new Date(year, mon - 1 + delta)
    setMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`)
  }

  const catStats = useMemo(() => categories.map((cat, i) => {
    const spent = transactions.filter(t => t.category_id === cat.id && t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)
    const budgetItem = budget.find(b => b.category_id === cat.id)
    const color = CATEGORY_COLORS[i % CATEGORY_COLORS.length]
    const pct = budgetItem ? Math.min((spent / budgetItem.amount) * 100, 100) : null
    const barColor = pct == null ? color : pct > 90 ? 'var(--coral)' : pct > 70 ? 'var(--amber)' : 'var(--green)'
    return { ...cat, spent, budgetItem, color, pct, barColor }
  }), [categories, transactions, budget, CATEGORY_COLORS])

  async function saveCategory(data) {
    try {
      if (editCat?.id) await updateCategory(editCat.id, data)
      else await createCategory(data)
      await reload()
      showToast(editCat?.id ? 'Catégorie mise à jour' : 'Catégorie créée', 'success')
    } catch { showToast('Erreur', 'error') }
    setEditCat(null); setNewCat(false)
  }

  async function removeCategory(id) {
    if (!confirm('Supprimer cette catégorie ? Les opérations associées seront décatégorisées.')) return
    try { await deleteCategory(id); await reload(); showToast('Catégorie supprimée', 'success') }
    catch { showToast('Erreur', 'error') }
  }

  async function saveBudget(catId, amount) {
    try {
      await setBudgetItem({ category_id: catId, month, amount })
      await reload()
      showToast('Budget mis à jour', 'success')
    } catch { showToast('Erreur', 'error') }
    setEditBudget(null)
  }

  async function removeBudget(id) {
    try { await deleteBudgetItem(id); await reload(); showToast('Budget supprimé', 'success') }
    catch { showToast('Erreur', 'error') }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Budget</h1>
          <p className="page-subtitle">Gérez vos catégories et allocations mensuelles</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="month-nav">
            <button onClick={() => changeMonth(-1)}><ChevronLeft size={16} /></button>
            <span>{MONTHS_FR[mon-1]} {year}</span>
            <button onClick={() => changeMonth(1)}><ChevronRight size={16} /></button>
          </div>
          <button className="btn btn-primary" onClick={() => setNewCat(true)}>
            <Plus size={14} /> Nouvelle catégorie
          </button>
        </div>
      </div>

      <div className="page-body">
        {catStats.length === 0 ? (
          <div className="empty-state" style={{ paddingTop: 80 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🏷️</div>
            <p style={{ fontSize: 15, marginBottom: 8, color: 'var(--text-secondary)' }}>Aucune catégorie</p>
            <p>Créez des catégories pour organiser vos dépenses</p>
            <button className="btn btn-primary" style={{ marginTop: 20 }} onClick={() => setNewCat(true)}>
              <Plus size={14} /> Créer ma première catégorie
            </button>
          </div>
        ) : (
          <div className="categories-grid">
            {catStats.map(cat => (
              <div key={cat.id} className="category-card">
                <div className="category-card-top">
                  <span style={{ fontSize: 20 }}>{cat.icon || '🏷️'}</span>
                  <span className="category-name">{cat.name}</span>
                  <div className="category-actions">
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setEditCat(cat)} title="Modifier">
                      <Pencil size={12} />
                    </button>
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => removeCategory(cat.id)} title="Supprimer">
                      <Trash2 size={12} style={{ color: 'var(--coral)' }} />
                    </button>
                  </div>
                </div>

                <div className="category-amounts">
                  <div>
                    <div className="category-spent" style={{ color: cat.color }}>{fmt(cat.spent)}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>dépensé ce mois</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {cat.budgetItem ? (
                      <>
                        <div className="category-budget">{fmt(cat.budgetItem.amount)}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>budget</div>
                      </>
                    ) : (
                      <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => setEditBudget(cat)}>
                        + Définir budget
                      </button>
                    )}
                  </div>
                </div>

                {cat.budgetItem && (
                  <>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${cat.pct}%`, background: cat.barColor }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{cat.pct.toFixed(0)}% utilisé</span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: '3px 6px' }} onClick={() => setEditBudget(cat)}>
                          <Pencil size={10} />
                        </button>
                        <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: '3px 6px' }} onClick={() => removeBudget(cat.budgetItem.id)}>
                          <Trash2 size={10} style={{ color: 'var(--coral)' }} />
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {(newCat || editCat) && (
        <CategoryModal
          initial={editCat}
          onClose={() => { setNewCat(false); setEditCat(null) }}
          onSave={saveCategory}
        />
      )}

      {editBudget && (
        <BudgetModal
          category={editBudget}
          current={editBudget.budgetItem}
          onClose={() => setEditBudget(null)}
          onSave={(amount) => saveBudget(editBudget.id, amount)}
        />
      )}
    </>
  )
}
