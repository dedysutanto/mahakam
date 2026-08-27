import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ThemeProvider } from './lib/ThemeContext'
import 'flatpickr/dist/flatpickr.min.css'
import './index.css'

// Auto-attach JWT token to all /api/ requests, and handle 401 responses
const originalFetch = window.fetch.bind(window)
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if (url.includes('/api/')) {
    const token = localStorage.getItem('token')
    if (token) {
      const headers = new Headers(init?.headers)
      if (!headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`)
      }
      init = { ...init, headers }
    }
    const res = await originalFetch(input, init)
    if (res.status === 401) {
      localStorage.removeItem('token')
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }
    return res
  }
  return originalFetch(input, init)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>
)