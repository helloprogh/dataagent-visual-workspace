import { HttpAgent } from '@ag-ui/client'
import { selectedModel } from '../model/model-selection'

export const AGENT_ID = import.meta.env.VITE_AGENT_ID || 'data-agent'
export const AGENT_DISPLAY_NAME = import.meta.env.VITE_AGENT_DISPLAY_NAME || 'Data Agent'

const stopUrl = import.meta.env.VITE_OPENCODE_STOP_URL || '/dataagent/opencode/api/model/default'
const stopMethod = (import.meta.env.VITE_OPENCODE_STOP_METHOD || 'POST').toUpperCase()

export interface AgentRuntime {
  agentId: string
  displayName: string
  selfManagedAgents: Record<string, HttpAgent>
}

async function stopOpenCodeRun(headers: Record<string, string>) {
  const response = await fetch(stopUrl, {
    method: stopMethod,
    headers: {
      ...headers,
      Accept: 'application/json',
    },
    credentials: 'same-origin',
    cache: 'no-store',
    keepalive: true,
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`OpenCode stop failed (${response.status})${detail ? `: ${detail}` : ''}`)
  }
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

  // Keep CopilotKit/AG-UI's standard abort semantics, but also terminate the
  // actual OpenCode2 execution through the existing frontend stop endpoint.
  // The stop request is started first and intentionally not awaited: abortRun()
  // immediately closes the current AG-UI HTTP/SSE stream so the UI stops
  // receiving tokens without waiting for the backend termination response.
  const abortRun = agent.abortRun.bind(agent)
  agent.abortRun = () => {
    void stopOpenCodeRun(headers).catch((error) => {
      console.warn('[Data Agent] OpenCode stop request failed:', error)
    })
    abortRun()
  }

  return {
    agentId: AGENT_ID,
    displayName: AGENT_DISPLAY_NAME,
    selfManagedAgents: {
      [AGENT_ID]: agent,
    },
  }
}
