import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

interface User {
  id: string
  email: string
  fullName: string
  role: string
  isSuperAdmin?: boolean
  scopes?: string[]
  tenant: { id: string; name: string } | null
}

interface AuthContextType {
  user: User | null
  token: string | null
  login: (email: string, password: string) => Promise<void>
  register: (data: RegisterData) => Promise<void>
  logout: () => void
  isLoading: boolean
  error: string | null
  /** true when role owner/admin, or the menu key is listed in the user's scopes */
  hasScope: (scope: string) => boolean
  refreshUser: () => Promise<void>
}

interface RegisterData {
  email: string
  password: string
  fullName: string
  tenantName: string
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'))
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Single effect to handle redirects based on token
  useEffect(() => {
    if (typeof window === 'undefined') return

    const pathname = window.location.pathname

    if (token) {
      // Authenticated: only redirect away from login page
      if (pathname === '/login') {
        window.location.href = '/'
      }
    } else {
      // Not authenticated: redirect to login unless already there
      if (pathname !== '/login') {
        window.location.href = '/login'
      }
    }
  }, [token])

  // Persist token to localStorage
  useEffect(() => {
    if (token) {
      localStorage.setItem('token', token)
    } else {
      localStorage.removeItem('token')
    }
  }, [token])

  const login = async (email: string, password: string) => {
    setIsLoading(true)
    setError(null)

    try {
      console.log('🔐 Attempting login for:', email)

      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      console.log('🔐 Login response status:', response.status)

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || `Login failed: ${response.status}`)
      }

      console.log('🔐 Login successful, redirecting...')

      // Set token and user
      setToken(data.token)
      setUser(data.user)

      // Force immediate redirect
      if (typeof window !== 'undefined') {
        // Super admin without company membership has no dashboard — go to Admin Sistem
        const target = data.user.isSuperAdmin && !data.user.tenant ? '/admin-sistem' : '/'
        console.log('🔐 Redirecting to', target)
        window.location.href = target
      }

      // Return a promise that will be resolved after a delay
      // This allows the UI to show loading state before redirect
      return new Promise(resolve => {
        setTimeout(() => resolve(), 500)
      })

    } catch (err: any) {
      console.error('🔐 Login error:', err)
      setError(err.message || 'Login failed')
      throw err
    } finally {
      setIsLoading(false)
    }
  }

  const register = async (data: RegisterData) => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      const json = await response.json()

      if (!response.ok) {
        throw new Error(json.message || 'Registration failed')
      }

      setToken(json.token)
      setUser(json.user)

      if (typeof window !== 'undefined') {
        window.location.href = '/'
      }

    } catch (err: any) {
      setError(err.message || 'Registration failed')
    } finally {
      setIsLoading(false)
    }
  }

  const logout = () => {
    localStorage.removeItem('token')
    setToken(null)
    setUser(null)
    if (typeof window !== 'undefined') {
      window.location.href = '/login'
    }
  }

  // Restore user profile after page refresh (token persisted, user state is not)
  useEffect(() => {
    if (!token || user) return
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((me) => setUser(me))
      .catch(() => {})
  }, [token])

  const refreshUser = async () => {
    try {
      const me = await fetch('/api/auth/me').then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      setUser(me)
    } catch {}
  }

  const hasScope = (scope: string): boolean => {
    if (!user) return false
    if (user.role === 'owner' || user.role === 'admin') return true
    return (user.scopes || []).includes(scope)
  }

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, isLoading, error, hasScope, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth harus digunakan di dalam AuthProvider')
  return context
}