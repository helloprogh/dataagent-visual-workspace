type JsonRecord = Record<string, any>

export async function responseError(response: Response, action: string): Promise<Error> {
  let detail = ''
  try {
    const body = await response.json() as JsonRecord
    detail = body?.message ?? body?.error?.message ?? body?.error ?? ''
  } catch {
    detail = await response.text().catch(() => '')
  }
  return new Error(`${action} (${response.status})${detail ? `：${detail}` : ''}`)
}

export async function requestJson<T = unknown>(
  url: string,
  init: RequestInit = {},
  action = '请求失败',
): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  if (init.body != null && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')

  const response = await fetch(url, {
    ...init,
    headers,
    credentials: 'same-origin',
    cache: 'no-store',
  })

  if (!response.ok) throw await responseError(response, action)
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export function unwrapData<T = unknown>(body: any): T {
  if (body?.data?.data != null) return body.data.data as T
  if (body?.data != null) return body.data as T
  return body as T
}
