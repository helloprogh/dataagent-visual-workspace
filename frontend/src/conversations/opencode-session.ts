const CREATE_CONVERSATION_URL = '/dataagent/opencode/api/session'

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
  if (body?.code != null && body.code !== 20000) {
    throw new Error(`新建对话失败${body?.message ? `：${body.message}` : ''}`)
  }

  // Current backend envelope:
  // { code: 20000, data: { data: { id: 'ses_...' } } }
  const sessionId = body?.data?.data?.id
    ?? body?.data?.id
    ?? body?.data?.sessionId
    ?? body?.sessionId

  if (typeof sessionId !== 'string' || !sessionId.trim()) {
    throw new Error('新建对话接口未返回 data.data.id')
  }
  return sessionId.trim()
}
