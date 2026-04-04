import { useState, useEffect } from 'react'
import { Building2, RefreshCw, Unlink, Plus, CheckCircle2, AlertCircle, Eye, EyeOff, Search, ChevronRight } from 'lucide-react'
import { getBankBackends, getBankConnections, checkBankCredentials, connectBank, disconnectBank } from '../services/api.js'

function ConnectModal({ onClose, onSuccess, showToast }) {
  const [step, setStep]               = useState('pick')
  const [backends, setBackends]       = useState([])
  const [woobOk, setWoobOk]           = useState(null)
  const [search, setSearch]           = useState('')
  const [selected, setSelected]       = useState(null)
  const [form, setForm]               = useState({ login: '', password: '', extra: {} })
  const [showPwd, setShowPwd]         = useState(false)
  const [checking, setChecking]       = useState(false)
  const [checkResult, setCheckResult] = useState(null)

  useEffect(() => {
    getBankBackends().then(r => {
      setBackends(r.data.backends || [])
      setWoobOk(r.data.woob_installed)
    }).catch(() => setWoobOk(false))
  }, [])

  const filtered = backends.filter(b => b.name.toLowerCase().includes(search.toLowerCase()))

  function pick(b) {
    setSelected(b)
    setStep('form')
    setForm({ login: '', password: '', extra: {} })
    setCheckResult(null)
  }

  async function test() {
    setChecking(true); setCheckResult(null)
    try {
      const res = await checkBankCredentials({ backend_id: selected.id, login: form.login, password: form.password, extra: form.extra })
      setCheckResult(res.data)
    } catch { setCheckResult({ ok: false, error: 'Erreur réseau' }) }
    finally { setChecking(false) }
  }

  async function save() {
    try {
      await connectBank({ backend_id: selected.id, bank_name: selected.name, login: form.login, password: form.password, extra: form.extra })
      showToast(`${selected.name} connecté !`, 'success')
      onSuccess(); onClose()
    } catch { showToast('Erreur lors de la sauvegarde', 'error') }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>

        {step === 'pick' && (
          <>
            <div className="modal-title">Connecter ma banque</div>
            {woobOk === false && (
              <div style={{ background: 'rgba(240,106,106,0.08)', border: '1px solid rgba(240,106,106,0.2)', borderRadius: 'var(--radius)', padding: '12px 14px', marginBottom: 16, fontSize: 12.5, color: 'var(--coral)' }}>
                <strong>Woob non installé.</strong> Lancez : <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: 4 }}>pip install woob</code>
              </div>
            )}
            <div style={{ position: 'relative', marginBottom: 12 }}>
              <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input className="form-input" style={{ paddingLeft: 30 }} placeholder="Rechercher une banque..." value={search} onChange={e => setSearch(e.target.value)} autoFocus />
            </div>
            <div style={{ maxHeight: 340, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {filtered.map(b => (
                <button key={b.id} onClick={() => pick(b)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 'var(--radius)', background: 'var(--bg-raised)', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text-primary)', transition: 'all 0.12s', width: '100%', textAlign: 'left' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor='var(--amber)'; e.currentTarget.style.background='var(--bg-hover)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)';  e.currentTarget.style.background='var(--bg-raised)' }}
                >
                  <span style={{ flex: 1, fontSize: 13.5, fontWeight: 500 }}>{b.name}</span>
                  <code style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-base)', padding: '2px 6px', borderRadius: 4 }}>{b.id}</code>
                  <ChevronRight size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                </button>
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={onClose}>Annuler</button>
            </div>
          </>
        )}

        {step === 'form' && selected && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setStep('pick')}>←</button>
              <div className="modal-title" style={{ marginBottom: 0 }}>{selected.name}</div>
            </div>

            <div className="form-group">
              <label className="form-label">Identifiant / Numéro client</label>
              <input className="form-input" value={form.login} onChange={e => setForm(f => ({ ...f, login: e.target.value }))} placeholder="Votre identifiant" autoFocus />
            </div>

            <div className="form-group">
              <label className="form-label">Mot de passe</label>
              <div style={{ position: 'relative' }}>
                <input className="form-input" type={showPwd ? 'text' : 'password'} value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="Votre mot de passe" style={{ paddingRight: 38 }} />
                <button onClick={() => setShowPwd(v => !v)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
                  {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {selected.extra_fields?.map(f => (
              <div className="form-group" key={f.key}>
                <label className="form-label">{f.label}</label>
                <input className="form-input" value={form.extra[f.key] || ''}
                  onChange={e => setForm(frm => ({ ...frm, extra: { ...frm.extra, [f.key]: e.target.value } }))}
                  placeholder={f.label} />
              </div>
            ))}

            <div style={{ background: 'rgba(77,158,247,0.07)', border: '1px solid rgba(77,158,247,0.15)', borderRadius: 'var(--radius)', padding: '10px 14px', marginBottom: 16, fontSize: 12, color: 'var(--blue)', lineHeight: 1.6 }}>
              🔒 Identifiants stockés <strong>localement</strong> — aucun envoi vers un serveur externe. Woob se connecte directement à votre banque.
            </div>

            {checkResult && (
              <div style={{ display: 'flex', gap: 10, padding: '10px 14px', borderRadius: 'var(--radius)', marginBottom: 12, background: checkResult.ok ? 'rgba(62,207,142,0.08)' : 'rgba(240,106,106,0.08)', border: `1px solid ${checkResult.ok ? 'rgba(62,207,142,0.2)' : 'rgba(240,106,106,0.2)'}` }}>
                {checkResult.ok ? <CheckCircle2 size={14} style={{ color: 'var(--green)', marginTop: 1, flexShrink: 0 }} /> : <AlertCircle size={14} style={{ color: 'var(--coral)', marginTop: 1, flexShrink: 0 }} />}
                <div style={{ fontSize: 12.5, color: checkResult.ok ? 'var(--green)' : 'var(--coral)' }}>
                  {checkResult.ok ? `Connexion OK — ${checkResult.accounts?.length || 0} compte(s) trouvé(s)` : checkResult.error}
                </div>
              </div>
            )}

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setStep('pick')}>Retour</button>
              <button className="btn btn-secondary" onClick={test} disabled={checking || !form.login || !form.password}>
                {checking ? 'Test...' : 'Tester'}
              </button>
              <button className="btn btn-primary" onClick={save} disabled={!form.login || !form.password}>
                Enregistrer
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function BankSync({ reload, showToast }) {
  const [connections, setConnections] = useState([])
  const [loading, setLoading]         = useState(true)
  const [syncing, setSyncing]         = useState({})
  const [syncStatus, setSyncStatus]   = useState({})
  const [showLink, setShowLink]       = useState(false)

  async function loadConnections() {
    try { setLoading(true); const r = await getBankConnections(); setConnections(r.data) }
    catch { showToast('Impossible de charger les connexions', 'error') }
    finally { setLoading(false) }
  }

  useEffect(() => { loadConnections() }, [])

  async function sync(conn) {
    setSyncing(s => ({ ...s, [conn.id]: true }))
    setSyncStatus(s => ({ ...s, [conn.id]: 'Démarrage...' }))

    await new Promise((resolve) => {
      const es = new EventSource(`/api/bank/sync/${conn.id}/stream`)

      es.addEventListener('progress', (e) => {
        const { message } = JSON.parse(e.data)
        setSyncStatus(s => ({ ...s, [conn.id]: message }))
      })

      es.addEventListener('done', (e) => {
        es.close()
        const { imported } = JSON.parse(e.data)
        setSyncing(s => ({ ...s, [conn.id]: false }))
        setSyncStatus(s => ({ ...s, [conn.id]: null }))
        reload()
        loadConnections()
        showToast(`${imported} nouvelle(s) opération(s) importée(s)`, 'success')
        resolve()
      })

      es.addEventListener('fail', (e) => {
        es.close()
        setSyncing(s => ({ ...s, [conn.id]: false }))
        setSyncStatus(s => ({ ...s, [conn.id]: null }))
        try {
          const { error } = JSON.parse(e.data)
          showToast(error || 'Erreur de synchronisation', 'error')
        } catch {
          showToast('Erreur de synchronisation', 'error')
        }
        resolve()
      })

      es.onerror = () => {
        if (es.readyState === EventSource.CLOSED) return
        es.close()
        setSyncing(s => ({ ...s, [conn.id]: false }))
        setSyncStatus(s => ({ ...s, [conn.id]: null }))
        showToast('Connexion interrompue', 'error')
        resolve()
      }
    })
  }

  async function disconnect(conn) {
    if (!confirm(`Déconnecter ${conn.bank_name} ?`)) return
    try { await disconnectBank(conn.id); loadConnections(); showToast('Déconnecté', 'success') }
    catch { showToast('Erreur', 'error') }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Connexion bancaire</h1>
          <p className="page-subtitle">Synchronisation locale via Woob — aucun serveur tiers</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowLink(true)}>
          <Plus size={14} /> Connecter une banque
        </button>
      </div>

      <div className="page-body">
        <div className="card mb-4">
          <div className="card-header"><span className="card-title">Comment ça marche</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20 }}>
            {[
              { n:'1', t:'Installez Woob',          d:'pip install woob — outil open-source français, gratuit, aucun compte requis.' },
              { n:'2', t:'Entrez vos identifiants', d:'Stockés localement sur votre machine. Woob se connecte directement à votre banque.' },
              { n:'3', t:'Synchronisation',         d:'Vos opérations arrivent dans "Non catégorisées". Synchronisez à la demande.' },
            ].map(({ n, t, d }) => (
              <div key={n} style={{ display: 'flex', gap: 14 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(245,166,35,0.15)', color: 'var(--amber)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 500, flexShrink: 0 }}>{n}</div>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 500, marginBottom: 4 }}>{t}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{d}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 16, padding: '10px 14px', background: 'var(--bg-raised)', borderRadius: 'var(--radius)', fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--green)', border: '1px solid var(--border-light)', display: 'flex', gap: 10 }}>
            <span style={{ color: 'var(--text-muted)' }}>$</span> pip install woob
          </div>
        </div>

        <div className="card">
          <div className="card-header"><span className="card-title">Banques connectées</span></div>
          {loading ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>Chargement...</div>
          ) : connections.length === 0 ? (
            <div className="empty-state">
              <Building2 size={36} style={{ display: 'block', margin: '0 auto 12px', color: 'var(--text-muted)' }} />
              <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 4 }}>Aucune banque connectée</p>
              <p>Cliquez sur "Connecter une banque" pour commencer</p>
              <button className="btn btn-primary" style={{ marginTop: 20 }} onClick={() => setShowLink(true)}>
                <Plus size={14} /> Connecter ma banque
              </button>
            </div>
          ) : connections.map(conn => (
            <div key={conn.id} className="bank-status connected" style={{ marginBottom: 10, flexWrap: 'wrap' }}>
              <span className="status-dot on" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, fontSize: 14 }}>{conn.bank_name}</div>
                <div style={{ fontSize: 11, opacity: 0.7 }}>
                  {conn.login} · Dernière sync : {conn.last_sync ? new Date(conn.last_sync).toLocaleString('fr-FR') : 'jamais'}
                  {conn.transaction_count > 0 && ` · ${conn.transaction_count} opérations`}
                </div>
                {syncing[conn.id] && syncStatus[conn.id] && (
                  <div style={{ fontSize: 11, color: 'var(--amber)', marginTop: 4, fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    ↳ {syncStatus[conn.id]}
                  </div>
                )}
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => sync(conn)} disabled={syncing[conn.id]}>
                <RefreshCw size={12} style={{ animation: syncing[conn.id] ? 'spin 1s linear infinite' : 'none' }} />
                {syncing[conn.id] ? 'Sync...' : 'Synchroniser'}
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => disconnect(conn)}>
                <Unlink size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {showLink && <ConnectModal onClose={() => setShowLink(false)} onSuccess={loadConnections} showToast={showToast} />}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  )
}
