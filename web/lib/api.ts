import { errorText } from '@/lib/utils'

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export async function api<T>(path: string, adminToken: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (adminToken) headers.set('X-Admin-Token', adminToken)
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const controller = new AbortController()
  const waitMs = path.includes('/audio') ? 180000 : 20000
  const timer = setTimeout(() => controller.abort(), waitMs)
  let response: Response
  try {
    response = await fetch(path, { ...init, headers, signal: controller.signal })
  } catch (err) {
    const name = err instanceof Error ? err.name : ''
    if (name === 'AbortError') throw new ApiError('This is taking too long. Please try again.', 0)
    throw new ApiError('Cannot reach the Kaanam server. Is it running?', 0)
  } finally {
    clearTimeout(timer)
  }
  if (!response.ok) {
    let detail: unknown = `Request failed (${response.status})`
    try {
      const data = (await response.json()) as { detail?: unknown }
      detail = data.detail ?? detail
    } catch {
      /* keep the status line */
    }
    throw new ApiError(errorText(detail), response.status)
  }
  const type = response.headers.get('content-type') ?? ''
  if (type.includes('application/json')) return (await response.json()) as T
  return (await response.text()) as T
}
