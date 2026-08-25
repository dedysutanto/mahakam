import { useState, useMemo } from 'react'
import { useAuth } from '../lib/AuthContext'

const backgrounds = [
  '/login-bg/1005.jpg',
  '/login-bg/1067.jpg',
  '/login-bg/1080.jpg',
  '/login-bg/119.jpg',
  '/login-bg/164.jpg',
  '/login-bg/342.jpg',
]

export default function Login() {
  const { login, isLoading, error } = useAuth()
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  })

  const bg = useMemo(() => backgrounds[Math.floor(Math.random() * backgrounds.length)], [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await login(formData.email, formData.password)
    } catch {
      // error is handled by context
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative">
      {/* Background image */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${bg})` }}
      />
      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Content */}
      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <img src="/favicon.svg" alt="Mahakam" className="w-16 h-16 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white">Mahakam</h1>
          <p className="text-white/70 mt-1">Sistem Keuangan</p>
        </div>

        {/* Card */}
        <div className="card rounded-2xl shadow-xl p-8">
          {/* Error */}
          {error && (
            <div className="mb-4 p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-sm">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
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
              {isLoading ? 'Memproses...' : 'Masuk'}
            </button>
          </form>

          <div className="mt-4 p-3 bg-accent rounded-lg text-xs text-accent-foreground">
            <p className="font-medium mb-1">Demo:</p>
            <p>Email: admin@majusejahtera.id</p>
            <p>Password: admin123</p>
          </div>
        </div>
      </div>
    </div>
  )
}
