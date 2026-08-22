const CREATE_CONVERSATION_URL = '/dataseek/web/opencode/api/create'

export async function createOpenCodeConversation(): Promise<string> {
  const response = await fetch(CREATE_CONVERSATION_URL, {
    method: 'POST',
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
    cache: 'no-store',
  })

  if (!response.ok) {
    let detail = ''
    try {
      const body = await response.json()
      detail = body?.message ?? body?.error?.message ?? body?.error ?? ''
    } catch {
      detail = await response.text().catch(() => '')
    }
    throw new Error(`新建对话失败 (${response.status})${detail ? `: ${detail}` : ''}`)
  }

  const body = await response.json()
  const sessionId = body?.data?.sessionId ?? body?.sessionId
  if (typeof sessionId !== 'string' || !sessionId.trim()) {
    throw new Error('新建对话接口未返回 sessionId')
  }
  return sessionId.trim()
}
