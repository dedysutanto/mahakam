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

export type PdfResult = { bytes: Uint8Array } | MahakamError

// V53: only HTTP 200 + application/pdf yields bytes; anything else is an error object, never a file.
export async function mahakamFetchPdf(
  path: string,
  scope: string,
  method: "GET" | "POST" = "GET",
  body?: unknown
): Promise<PdfResult> {
  const url = new URL(`/api${path}`, config.baseUrl)
  const res = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })

  if (res.status === 403) {
    return {
      error: true,
      message: `Scope '${scope}' required but not granted on this API key. Add scope in Settings → API Keys.`,
      statusCode: 403,
    }
  }
  const contentType = res.headers.get("content-type") || ""
  if (res.status !== 200 || !contentType.includes("application/pdf")) {
    const snippet = await res.text().catch(() => "")
    return {
      error: true,
      message: `Mahakam API error ${res.status}: ${snippet.slice(0, 300) || res.statusText}`,
      statusCode: res.status,
    }
  }
  return { bytes: new Uint8Array(await res.arrayBuffer()) }
}
