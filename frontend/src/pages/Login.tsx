import { useState } from 'react'
import { useAuth } from '../lib/AuthContext'

type Tab = 'login' | 'register'

export default function Login() {
  const { login, register, isLoading, error } = useAuth()
  const [tab, setTab] = useState<Tab>('login')
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    fullName: '',
    tenantName: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (tab === 'login') {
        await login(formData.email, formData.password)
      } else {
        await register(formData)
      }
    } catch {
      // error is handled by context
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-accent via-background to-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary/25">
            <span className="text-primary-foreground font-bold text-2xl">SK</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Mahakam</h1>
          <p className="text-muted-foreground mt-1">Sistem Keuangan</p>
        </div>

        {/* Card */}
        <div className="card rounded-2xl shadow-xl p-8">
          {/* Tabs */}
          <div className="flex gap-1 bg-muted rounded-lg p-1 mb-6">
            <button
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                tab === 'login' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
              }`}
              onClick={() => setTab('login')}
            >
              Masuk
            </button>
            <button
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                tab === 'register' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
              }`}
              onClick={() => setTab('register')}
            >
              Daftar
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-sm">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {tab === 'register' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Nama Lengkap</label>
                  <input
                    type="text"
                    required
                    className="input"
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    placeholder="Nama lengkap Anda"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Nama Perusahaan</label>
                  <input
                    type="text"
                    required
                    className="input"
                    value={formData.tenantName}
                    onChange={(e) => setFormData({ ...formData, tenantName: e.target.value })}
                    placeholder="PT Maju Sejahtera"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Email</label>
              <input
                type="email"
                required
                className="input"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="email@perusahaan.co.id"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Password</label>
              <input
                type="password"
                required
                className="input"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="Minimal 6 karakter"
                minLength={6}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="btn btn-primary w-full py-2.5"
            >
              {isLoading ? 'Memproses...' : tab === 'login' ? 'Masuk' : 'Daftar'}
            </button>
          </form>

          {tab === 'login' && (
            <div className="mt-4 p-3 bg-accent rounded-lg text-xs text-accent-foreground">
              <p className="font-medium mb-1">Demo:</p>
              <p>Email: admin@majusejahtera.id</p>
              <p>Password: admin123</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
