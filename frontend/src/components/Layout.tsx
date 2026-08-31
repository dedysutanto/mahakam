import { useState, useEffect } from 'react'
import { useAuth } from '../lib/AuthContext'
import { useTheme } from '../lib/ThemeContext'
import { useNavigate } from 'react-router-dom'
import { Moon, Sun, LogOut } from 'lucide-react'
import { WifiOff } from 'lucide-react'
import { APP_VERSION, GITHUB_URL } from '../config'

// scope = '' means always visible (no backend module behind it)
const navItems = [
  { label: 'Dasbor', icon: '📈', path: '/', scope: '' },
  { label: 'Buku Besar', icon: '📖', path: '/buku-besar', scope: 'buku-besar' },
  { label: 'Faktur', icon: '📄', path: '/faktur', scope: 'faktur' },
  { label: 'Penawaran', icon: '📋', path: '/penawaran', scope: 'penawaran' },
  { label: 'Pembelian', icon: '🛒', path: '/pembelian', scope: 'pembelian' },
  { label: 'Pengeluaran', icon: '🧾', path: '/pengeluaran', scope: 'pengeluaran' },
  { label: 'Produk', icon: '📦', path: '/produk', scope: 'produk' },
  { label: 'Pelanggan & Vendor', icon: '👥', path: '/pelanggan', scope: 'pelanggan' },
  { label: 'Pajak', icon: '🧮', path: '/pajak', scope: 'pajak' },
  { label: 'Laporan', icon: '📊', path: '/laporan', scope: 'laporan' },
  { label: 'Pengaturan', icon: '⚙️', path: '/pengaturan', scope: 'pengaturan' },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, hasScope } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar_collapsed') === 'true')
  const [offline, setOffline] = useState(!navigator.onLine)
  // Persisted so the logo doesn't flash between fallback and image on every navigation
  const [tenantData, setTenantData] = useState<{ id: string; name: string } | null>(() => {
    try {
      const raw = localStorage.getItem('tenant_data')
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  })
  // Per-session logo state: 'pending' hides the img until it actually loads,
  // so neither a wrong-logo flash nor a permanent SK-stuck can happen.
  const [logoState, setLogoState] = useState<'pending' | 'ok' | 'failed'>(
    () => (sessionStorage.getItem('logo_ok') === '1' ? 'ok' : 'pending')
  )

  useEffect(() => {
    localStorage.setItem('sidebar_collapsed', String(collapsed))
  }, [collapsed])
  const [currentPath, setCurrentPath] = useState(location.pathname)

  useEffect(() => {
    const onPopState = () => setCurrentPath(location.pathname)
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [mobileOpen])

  useEffect(() => {
    fetch('/api/tenants/')
      .then((r) => r.json())
      .then((data) => {
        if (data?.[0]) {
          setTenantData(data[0])
          localStorage.setItem('tenant_data', JSON.stringify({ id: data[0].id, name: data[0].name }))
          document.title = `${data[0].name} - Sistem Keuangan`

          // Company logo doubles as the browser tab favicon (skipped when logo known missing)
          const bust = localStorage.getItem('logo_bust') || '1'
          let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']")
          if (!link) {
            link = document.createElement('link')
            link.rel = 'icon'
            document.head.appendChild(link)
          }
          link.type = 'image/png'
          link.href = `/uploads/logos/${data[0].id}.png?b=${bust}`
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const onOffline = () => setOffline(true)
    const onOnline = () => setOffline(false)
    const onNetworkError = () => setOffline(true)
    const onNetworkOk = () => setOffline(false)
    window.addEventListener('offline', onOffline)
    window.addEventListener('online', onOnline)
    window.addEventListener('network-error', onNetworkError)
    window.addEventListener('network-ok', onNetworkOk)
    return () => {
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('network-error', onNetworkError)
      window.removeEventListener('network-ok', onNetworkOk)
    }
  }, [])

    const navigate = useNavigate()

  const currentPage = navItems.find((n) => n.path === currentPath)?.label || 'Dasbor'

  return (
    <div className="min-h-screen bg-background flex flex-col lg:flex-row">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar - mobile: slide-out drawer, desktop: collapsible */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 lg:z-0 lg:sticky lg:top-0 lg:h-screen
          bg-card border-r border-border flex flex-col
          transform transition-transform duration-200 ease-in-out
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          ${collapsed ? 'lg:w-16' : 'lg:w-64'}
          w-72 shadow-xl lg:shadow-none`}
      >
        {/* Logo */}
        <div className="p-4 border-b border-border flex items-center gap-3">
          {tenantData?.id && logoState !== 'failed' && (
            <img
              key={tenantData.id}
              src={`/uploads/logos/${tenantData.id}.png?b=${localStorage.getItem('logo_bust') || '1'}`}
              alt="Logo"
              className="w-9 h-9 rounded-lg object-contain flex-shrink-0 bg-card border border-border"
              style={{ display: logoState === 'ok' ? 'block' : 'none' }}
              onLoad={() => {
                setLogoState('ok')
                sessionStorage.setItem('logo_ok', '1')
              }}
              onError={() => {
                setLogoState('failed')
                sessionStorage.removeItem('logo_ok')
              }}
            />
          )}
          {(!tenantData?.id || logoState === 'failed') && (
            <img src="/favicon.svg" alt="Mahakam" className="w-9 h-9 flex-shrink-0" />
          )}
          {(!collapsed || mobileOpen) && (
            <div className="min-w-0 flex-1">
              <h1 className="font-semibold text-sm text-foreground truncate">{tenantData?.name || 'Mahakam'}</h1>
              <p className="text-xs text-muted-foreground truncate">Sistem Keuangan</p>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {navItems.filter((item) => (!item.scope || hasScope(item.scope)) && (user?.tenant || item.path !== '/')).map((item) => {
            const isActive = currentPath === item.path
            return (
              <a
                key={item.path}
                href={item.path}
                onClick={(e) => {
                  e.preventDefault()
                  navigate(item.path)
                  setMobileOpen(false)
                }}
                title={collapsed && !mobileOpen ? item.label : undefined}
                className={`flex items-center gap-3 rounded-lg text-sm font-medium transition-colors
                  min-h-[44px] px-3 py-2.5
                  ${isActive
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
              >
                <span className="text-lg flex-shrink-0">{item.icon}</span>
                {(!collapsed || mobileOpen) && <span className="truncate">{item.label}</span>}
              </a>
            )
          })}
          {user?.isSuperAdmin && (
            <a
              href="/admin-sistem"
              onClick={(e) => {
                e.preventDefault()
                navigate('/admin-sistem')
                setMobileOpen(false)
              }}
              title={collapsed && !mobileOpen ? 'Admin Sistem' : undefined}
              className={`flex items-center gap-3 rounded-lg text-sm font-medium transition-colors
                min-h-[44px] px-3 py-2.5
                ${currentPath === '/admin-sistem'
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
            >
              <span className="text-lg flex-shrink-0">🛡️</span>
              {(!collapsed || mobileOpen) && <span className="truncate">Admin Sistem</span>}
            </a>
          )}
        </nav>

        {/* User */}
        <div className={`border-t border-border ${(!collapsed || mobileOpen) ? 'p-3' : 'py-3 px-1'}`}>
          <div className={`flex ${(!collapsed || mobileOpen) ? 'items-center gap-3' : 'flex-col items-center gap-2'}`}>
            <button
              onClick={() => navigate('/profil')}
              title="Profil Saya"
              aria-label="Profil Saya"
              className="flex-shrink-0"
            >
              <div className="w-9 h-9 bg-secondary rounded-full flex items-center justify-center hover:bg-accent transition-colors">
                <span className="text-xs font-medium text-secondary-foreground">
                  {user?.fullName?.charAt(0).toUpperCase()}
                </span>
              </div>
            </button>
            <button
              onClick={() => navigate('/profil')}
              title="Profil Saya"
              className={`min-w-0 text-left ${(!collapsed || mobileOpen) ? 'flex-1' : 'hidden'}`}
            >
              <p className="text-xs font-medium text-foreground truncate hover:text-primary transition-colors">{user?.fullName}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            </button>
            <button
              onClick={logout}
              className={`${(!collapsed || mobileOpen)
                ? 'ml-auto min-w-[44px] min-h-[44px]'
                : 'w-9 h-9'} flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-muted transition-colors flex-shrink-0`}
              title="Keluar"
              aria-label="Keluar"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="bg-card/80 backdrop-blur border-b border-border px-4 py-3 flex items-center justify-between sticky top-0 z-30 lg:z-10">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden min-w-[44px] min-h-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground text-xl"
              aria-label="Toggle menu"
            >
              ☰
            </button>
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="hidden lg:block min-w-[44px] min-h-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground text-xl"
              aria-label="Toggle sidebar"
            >
              ☰
            </button>
            <h2 className="text-lg font-semibold text-foreground truncate">{currentPage}</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title={theme === 'dark' ? 'Mode terang' : 'Mode gelap'}
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-success/10 text-success">
              Aktif
            </span>
          </div>
        </header>

        {/* Offline banner */}
        {offline && (
          <div className="bg-destructive/10 border-b border-destructive/20 px-4 py-2 flex items-center gap-2 text-sm text-destructive">
            <WifiOff className="w-4 h-4 flex-shrink-0" />
            <span>Koneksi terputus — periksa jaringan Anda</span>
          </div>
        )}

        {/* Page Content */}
        <main className="flex-1 overflow-auto p-4 lg:p-6">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>

        {/* Footer */}
        <footer className="sticky bottom-0 z-30 lg:z-10 border-t border-border bg-card/80 backdrop-blur px-4 py-2 text-center text-xs text-muted-foreground">
          Mahakam v{APP_VERSION} ·{' '}
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
            GitHub
          </a>
          {' '}· AGPL v3
        </footer>
      </div>
    </div>
  )
}
