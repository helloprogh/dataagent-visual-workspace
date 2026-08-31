import { HttpAgent } from '@ag-ui/client'
import { AGENT_ID, AGUI_URL } from '../shared/config/api'

export function createAgentClient(threadId: string): HttpAgent {
  const id = threadId.trim()
  if (!id) throw new Error('threadId 不能为空')

  const headers: Record<string, string> = {}
  const token = import.meta.env.VITE_AGUI_TOKEN
  if (token) headers.Authorization = `Bearer ${token}`

  return new HttpAgent({
    url: AGUI_URL,
    agentId: AGENT_ID,
    threadId: id,
    headers,
    debug: import.meta.env.DEV,
  })
}
