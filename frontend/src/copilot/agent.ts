import { HttpAgent } from '@ag-ui/client'
import { selectedModel } from '../model/model-selection'

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

  // AG-UI does not define a first-class `model` field on RunAgentInput.
  // forwardedProps is the protocol-standard extension point for runtime-specific
  // values that should be forwarded to the downstream agent implementation.
  agent.use((input, next) => next.run({
    ...input,
    forwardedProps: {
      ...(input.forwardedProps ?? {}),
      ...(selectedModel.value ? { model: { ...selectedModel.value } } : {}),
    },
  }))

  return {
    agentId: AGENT_ID,
    displayName: AGENT_DISPLAY_NAME,
    selfManagedAgents: {
      [AGENT_ID]: agent,
    },
  }
}
