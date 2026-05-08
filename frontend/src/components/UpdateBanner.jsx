import { useEffect, useState } from 'react'
import { Download, Sparkles } from 'lucide-react'

export default function UpdateBanner() {
  const [state, setState]       = useState('idle')
  const [version, setVersion]   = useState(null)
  const [progress, setProgress] = useState(0)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!window.electron?.updater) return

    const offs = [
      window.electron.updater.on('available', ({ version }) => {
        setVersion(version); setState('downloading'); setDismissed(false)
      }),
      window.electron.updater.on('progress', ({ percent }) => setProgress(percent)),
      window.electron.updater.on('downloaded', ({ version }) => {
        setVersion(version); setState('ready'); setDismissed(false)
      }),
      window.electron.updater.on('error', () => setState('idle')),
    ]
    return () => offs.forEach(off => off && off())
  }, [])

  if (!window.electron?.updater || dismissed || state === 'idle') return null

  const ready = state === 'ready'

  return (
    <div className="modal-overlay" style={{ zIndex: 500 }}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{
            width: 44, height: 44, borderRadius: '50%',
            background: 'rgba(245,166,35,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--amber)', flexShrink: 0,
          }}>
            {ready ? <Download size={22} /> : <Sparkles size={22} />}
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.3px' }}>
              {ready ? 'Mise à jour prête à installer' : 'Nouvelle version disponible'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
              Version {version}
            </div>
          </div>
        </div>

        <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 18 }}>
          {ready
            ? 'La nouvelle version a été téléchargée. Clique sur « Installer maintenant » pour redémarrer et appliquer la mise à jour. Tes données seront conservées.'
            : 'Une nouvelle version de Budget vient d\'être publiée et est en cours de téléchargement. L\'installation sera proposée dès que ce sera prêt.'}
        </div>

        {!ready && (
          <div style={{
            height: 6,
            background: 'var(--bg-raised)',
            borderRadius: 3,
            overflow: 'hidden',
            marginBottom: 18,
          }}>
            <div style={{
              height: '100%',
              width: `${progress}%`,
              background: 'var(--amber)',
              transition: 'width 0.3s',
            }} />
          </div>
        )}

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={() => setDismissed(true)}>
            Plus tard
          </button>
          {ready && (
            <button className="btn btn-primary" onClick={() => window.electron.updater.install()}>
              <Download size={14} /> Installer maintenant
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
