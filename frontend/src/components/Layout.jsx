import { LayoutDashboard, ArrowLeftRight, PieChart, Building2, Settings, Repeat2 } from 'lucide-react'

const nav = [
  { id: 'dashboard',    label: 'Tableau de bord',    icon: LayoutDashboard },
  { id: 'transactions', label: 'Opérations',          icon: ArrowLeftRight },
  { id: 'budget',       label: 'Budget',              icon: PieChart },
  { id: 'recurring',    label: 'Paiements récurrents', icon: Repeat2 },
  { id: 'bank',         label: 'Banque',              icon: Building2 },
]

export default function Layout({ children, page, setPage }) {
  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M12 6v2m0 8v2M9 9.5C9 8.1 10.3 7 12 7s3 1.1 3 2.5c0 1.3-1 2.2-2.5 2.5C11 12.3 9 13.2 9 14.5c0 1.4 1.3 2.5 3 2.5s3-1.1 3-2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          Budget
        </div>

        <div className="sidebar-section">
          <div className="sidebar-label">Navigation</div>
          {nav.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`sidebar-nav-item ${page === id ? 'active' : ''}`}
              onClick={() => setPage(id)}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>

        <div className="sidebar-divider" />

        <div className="sidebar-footer">
          <button className="sidebar-nav-item">
            <Settings size={15} />
            Paramètres
          </button>
        </div>
      </aside>

      <main className="main-content">
        {children}
      </main>
    </div>
  )
}
