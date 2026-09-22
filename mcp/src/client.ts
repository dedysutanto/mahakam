import { config } from "./config.js"

interface MahakamError {
  error: true
  message: string
  statusCode: number
}

interface MahakamResponse<T> {
  data: T
  pagination?: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export async function mahakamFetch<T>(
  path: string,
  scope: string,
  params?: Record<string, string | undefined>
): Promise<T | MahakamError> {
  const url = new URL(`/api${path}`, config.baseUrl)
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) url.searchParams.set(k, v)
    }
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
  })

  if (res.status === 403) {
    return {
      error: true,
      message: `Scope '${scope}' required but not granted on this API key. Add scope in Settings → API Keys.`,
      statusCode: 403,
    }
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    return {
      error: true,
      message: `Mahakam API error ${res.status}: ${body || res.statusText}`,
      statusCode: res.status,
    }
  }

  return (await res.json()) as T
}

export async function mahakamFetchPaginated<T>(
  path: string,
  scope: string,
  params?: Record<string, string | undefined>,
  limit = 50
): Promise<{ items: T[]; totalCount: number; hasMore: boolean; page: number } | MahakamError> {
  const page = params?.page || "1"
  const merged = { ...params, page, limit: String(limit) }

  const result = await mahakamFetch<MahakamResponse<T[]>>(path, scope, merged)
  if ("error" in result) return result

  const total = result.pagination?.total ?? result.data.length
  const currentPage = result.pagination?.page ?? parseInt(page)
  const totalPages = result.pagination?.totalPages ?? Math.ceil(total / limit)

  return {
    items: result.data,
    totalCount: total,
    hasMore: currentPage < totalPages,
    page: currentPage,
  }
}
