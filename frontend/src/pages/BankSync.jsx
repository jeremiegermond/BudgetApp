import { useState, useEffect } from 'react'
import { Building2, RefreshCw, Unlink, Plus, AlertCircle, Search, ChevronRight, ShieldCheck } from 'lucide-react'
import { getEBBanks, startEBAuth, completeEBAuth, getEBConnections, disconnectEBBank } from '../services/api.js'

// ── Connect modal ─────────────────────────────────────────────────────────────

function ConnectModal({ onClose, onSuccess, showToast }) {
  const [banks, setBanks]       = useState([])
  const [search, setSearch]     = useState('')
  const [loading, setLoading]   = useState(true)
  const [connecting, setConnecting] = useState(null) // bank name being connected
  const [error, setError]       = useState(null)

  useEffect(() => {
    getEBBanks()
      .then(r => setBanks(r.data))
      .catch(e => setError(e?.response?.data?.error || e.message || 'Impossible de charger la liste des banques'))
      .finally(() => setLoading(false))
  }, [])

  const filtered = banks.filter(b => b.name.toLowerCase().includes(search.toLowerCase()))

  async function connect(bank) {
    setConnecting(bank.name)
    setError(null)
    try {
      // 1. Obtenir l'URL d'authentification
      const { data } = await startEBAuth({ bank_name: bank.name })

      // 2. Ouvrir la fenêtre d'auth bancaire (Electron uniquement)
      let result = null
      if (window.electron?.openBankAuth) {
        result = await window.electron.openBankAuth(data.url)
      } else {
        // En mode dev sans Electron, ouvrir dans le navigateur système
        window.open(data.url, '_blank')
        showToast('Authentification ouverte dans le navigateur. Copiez le code de la redirection.', 'info')
        setConnecting(null)
        return
      }

      if (!result?.code) {
        setError('Authentification annulée ou échouée')
        setConnecting(null)
        return
      }

      // 3. Échanger le code contre une session
      await completeEBAuth({ code: result.code, bank_name: bank.name })
      showToast(`${bank.name} connecté !`, 'success')
      onSuccess()
      onClose()
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Erreur de connexion')
    } finally {
      setConnecting(null)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
        <div className="modal-title">Connecter ma banque</div>

        <div style={{ background: 'rgba(77,158,247,0.07)', border: '1px solid rgba(77,158,247,0.15)', borderRadius: 'var(--radius)', padding: '10px 14px', marginBottom: 16, fontSize: 12, color: 'var(--blue)', lineHeight: 1.6, display: 'flex', gap: 8 }}>
          <ShieldCheck size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>Tu seras redirigé vers le site officiel de ta banque pour te connecter. Tes identifiants ne transitent jamais par cette app.</span>
        </div>

        {error && (
          <div style={{ display: 'flex', gap: 8, padding: '10px 14px', borderRadius: 'var(--radius)', marginBottom: 12, background: 'rgba(240,106,106,0.08)', border: '1px solid rgba(240,106,106,0.2)', fontSize: 12.5, color: 'var(--coral)' }}>
            <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>Chargement des banques...</div>
        ) : (
          <>
            <div style={{ position: 'relative', marginBottom: 12 }}>
              <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input className="form-input" style={{ paddingLeft: 30 }} placeholder="Rechercher une banque..." value={search} onChange={e => setSearch(e.target.value)} autoFocus />
            </div>

            <div style={{ maxHeight: 340, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {filtered.map(b => (
                <button key={b.name} onClick={() => connect(b)} disabled={!!connecting}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 'var(--radius)', background: 'var(--bg-raised)', border: '1px solid var(--border)', cursor: connecting ? 'wait' : 'pointer', color: 'var(--text-primary)', transition: 'all 0.12s', width: '100%', textAlign: 'left', opacity: connecting && connecting !== b.name ? 0.5 : 1 }}
                  onMouseEnter={e => { if (!connecting) { e.currentTarget.style.borderColor='var(--amber)'; e.currentTarget.style.background='var(--bg-hover)' }}}
                  onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.background='var(--bg-raised)' }}
                >
                  {b.logo && <img src={b.logo} alt="" style={{ width: 24, height: 24, objectFit: 'contain', flexShrink: 0 }} />}
                  <span style={{ flex: 1, fontSize: 13.5, fontWeight: 500 }}>{b.name}</span>
                  {connecting === b.name
                    ? <RefreshCw size={14} style={{ color: 'var(--amber)', animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                    : <ChevronRight size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  }
                </button>
              ))}
              {filtered.length === 0 && (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Aucune banque trouvée</div>
              )}
            </div>
          </>
        )}

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Annuler</button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BankSync({ reload, showToast }) {
  const [connections, setConnections] = useState([])
  const [loading, setLoading]         = useState(true)
  const [syncing, setSyncing]         = useState({})
  const [syncStatus, setSyncStatus]   = useState({})
  const [showLink, setShowLink]       = useState(false)

  async function loadConnections() {
    try {
      setLoading(true)
      const r = await getEBConnections()
      setConnections(r.data)
    } catch {
      showToast('Impossible de charger les connexions', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadConnections() }, [])

  async function sync(conn) {
    setSyncing(s => ({ ...s, [conn.id]: true }))
    setSyncStatus(s => ({ ...s, [conn.id]: 'Démarrage...' }))

    await new Promise((resolve) => {
      const es = new EventSource(`/api/bank/eb/sync/${conn.id}/stream`)

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
        try { showToast(JSON.parse(e.data).error || 'Erreur de synchronisation', 'error') }
        catch { showToast('Erreur de synchronisation', 'error') }
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
    try {
      await disconnectEBBank(conn.id)
      loadConnections()
      showToast('Déconnecté', 'success')
    } catch { showToast('Erreur', 'error') }
  }

  function validUntilLabel(conn) {
    if (!conn.valid_until) return null
    const d = new Date(conn.valid_until)
    const days = Math.ceil((d - Date.now()) / 86400000)
    if (days < 0) return { text: 'Accès expiré — reconnectez-vous', warn: true }
    if (days < 10) return { text: `Accès expire dans ${days} jour(s)`, warn: true }
    return { text: `Accès valide jusqu'au ${d.toLocaleDateString('fr-FR')}`, warn: false }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Connexion bancaire</h1>
          <p className="page-subtitle">Synchronisation via Enable Banking — authentification sécurisée</p>
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
              { n:'1', t:'Choisissez votre banque', d:'Sélectionnez votre banque dans la liste.' },
              { n:'2', t:'Authentification sécurisée', d:'Vous êtes redirigé vers le site officiel de votre banque. Validez avec votre téléphone.' },
              { n:'3', t:'Synchronisation automatique', d:'Vos opérations arrivent automatiquement. L\'accès est valable 90 jours.' },
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
          ) : connections.map(conn => {
            const validity = validUntilLabel(conn)
            return (
              <div key={conn.id} className="bank-status connected" style={{ marginBottom: 10, flexWrap: 'wrap' }}>
                <span className="status-dot on" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{conn.bank_name}</div>
                  <div style={{ fontSize: 11, opacity: 0.7 }}>
                    Dernière sync : {conn.last_sync ? new Date(conn.last_sync).toLocaleString('fr-FR') : 'jamais'}
                    {conn.transaction_count > 0 && ` · ${conn.transaction_count} opérations`}
                  </div>
                  {validity && (
                    <div style={{ fontSize: 11, color: validity.warn ? 'var(--coral)' : 'var(--text-muted)', marginTop: 2 }}>
                      {validity.text}
                    </div>
                  )}
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
            )
          })}
        </div>
      </div>

      {showLink && <ConnectModal onClose={() => setShowLink(false)} onSuccess={loadConnections} showToast={showToast} />}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  )
}
