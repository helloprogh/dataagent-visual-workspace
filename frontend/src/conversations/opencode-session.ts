import { dataAgentWebApi } from '../config/api'

async function responseError(response: Response, action: string) {
  let detail = ''
  try {
    const body = await response.json()
    detail = body?.message ?? body?.error?.message ?? body?.error ?? ''
  } catch {
    detail = await response.text().catch(() => '')
  }
  return new Error(`${action} (${response.status})${detail ? `: ${detail}` : ''}`)
}

export async function createOpenCodeConversation(): Promise<string> {
  const response = await fetch(dataAgentWebApi('/session'), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
    credentials: 'same-origin',
    cache: 'no-store',
  })

  if (!response.ok) throw await responseError(response, '新建对话失败')

  const body = await response.json()
  if (body?.code != null && body.code !== 20000) {
    throw new Error(`新建对话失败${body?.message ? `：${body.message}` : ''}`)
  }

  const sessionId = body?.data?.data?.id
    ?? body?.data?.id
    ?? body?.data?.sessionId
    ?? body?.sessionId

  if (typeof sessionId !== 'string' || !sessionId.trim()) {
    throw new Error('新建对话接口未返回 data.data.id')
  }
  return sessionId.trim()
}

export async function interruptOpenCodeConversation(sessionId: string): Promise<void> {
  const id = sessionId.trim()
  if (!id) throw new Error('中断对话失败：sessionId 为空')

  const response = await fetch(dataAgentWebApi(`/session/${encodeURIComponent(id)}/interrupt`), {
    method: 'POST',
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
    cache: 'no-store',
  })

  if (!response.ok) throw await responseError(response, '中断对话失败')

  if (response.status === 204) return
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) return

  const body = await response.json().catch(() => undefined)
  if (body?.code != null && body.code !== 20000) {
    throw new Error(`中断对话失败${body?.message ? `：${body.message}` : ''}`)
  }
}
