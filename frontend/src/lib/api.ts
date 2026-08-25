const API_BASE = import.meta.env.VITE_API_URL || '/api'

interface FetchOptions extends RequestInit {
  data?: any
}

async function request<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
  const token = localStorage.getItem('token')
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers,
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const config: RequestInit = {
    ...options,
    headers,
  }

  if (options.data) {
    config.body = JSON.stringify(options.data)
  }

  const response = await fetch(`${API_BASE}${endpoint}`, config)

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }))
    const err = new Error(error.error || 'Terjadi kesalahan')
    ;(err as any).status = response.status
    throw err
  }

  return response.json()
}

export const api = {
  get: <T>(endpoint: string): Promise<T> => request<T>(endpoint, { method: 'GET' }),
  post: <T>(endpoint: string, data: any): Promise<T> => request<T>(endpoint, { method: 'POST', data }),
  put: <T>(endpoint: string, data: any): Promise<T> => request<T>(endpoint, { method: 'PUT', data }),
  delete: <T>(endpoint: string): Promise<T> => request<T>(endpoint, { method: 'DELETE' }),
}
