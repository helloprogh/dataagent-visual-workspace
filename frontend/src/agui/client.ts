import { HttpAgent } from '@ag-ui/client'
import { AGENT_ID, AGUI_URL } from '../shared/config/api'

function headers() {
  const value: Record<string, string> = {}
  const token = import.meta.env.VITE_AGUI_TOKEN
  if (token) value.Authorization = `Bearer ${token}`
  return value
}

function createClient(threadId: string, url: string): HttpAgent {
  const id = threadId.trim()
  if (!id) throw new Error('threadId 不能为空')

  return new HttpAgent({
    url,
    agentId: AGENT_ID,
    threadId: id,
    headers: headers(),
    debug: import.meta.env.DEV,
  })
}

export function createAgentClient(threadId: string): HttpAgent {
  return createClient(threadId, AGUI_URL)
}

export function createHydrationClient(threadId: string): HttpAgent {
  const separator = AGUI_URL.includes('?') ? '&' : '?'
  return createClient(threadId, `${AGUI_URL}${separator}mode=hydrate`)
}
