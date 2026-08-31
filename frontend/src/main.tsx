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
    try {
      const res = await originalFetch(input, init)
      if (res.status === 401) {
        localStorage.removeItem('token')
        if (window.location.pathname !== '/login') {
          window.location.href = '/login'
        }
      }
      window.dispatchEvent(new CustomEvent('network-ok'))
      return res
    } catch (err) {
      window.dispatchEvent(new CustomEvent('network-error'))
      throw err
    }
  }
  return originalFetch(input, init)
}

// Register service worker for offline asset caching
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>
)