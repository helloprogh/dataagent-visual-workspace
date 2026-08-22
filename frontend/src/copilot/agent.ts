import { HttpAgent } from '@ag-ui/client'

export const AGENT_ID = import.meta.env.VITE_AGENT_ID || 'data-agent'
export const AGENT_DISPLAY_NAME = import.meta.env.VITE_AGENT_DISPLAY_NAME || 'Data Agent'

export interface AgentRuntime {
  agentId: string
  displayName: string
  selfManagedAgents: Record<string, HttpAgent>
}

export function createAgentRuntime(): AgentRuntime {
  const headers: Record<string, string> = {}
  const token = import.meta.env.VITE_AGUI_TOKEN
  if (token) headers.Authorization = `Bearer ${token}`

  const agent = new HttpAgent({
    url: import.meta.env.VITE_AGUI_URL || '/api/agui',
    agentId: AGENT_ID,
    headers,
    debug: import.meta.env.DEV
      ? { events: true, lifecycle: true, verbose: false }
      : false,
  })

  return {
    agentId: AGENT_ID,
    displayName: AGENT_DISPLAY_NAME,
    selfManagedAgents: {
      [AGENT_ID]: agent,
    },
  }
}
