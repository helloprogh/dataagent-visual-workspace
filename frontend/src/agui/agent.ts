import {
  HttpAgent,
  type Message,
  type RunAgentInput,
  type RunAgentParameters,
  type State,
} from '@ag-ui/client'
import { AGUI_URL } from '../config/api'

export const AGENT_ID = import.meta.env.VITE_AGENT_ID || 'data-agent'
export const AGENT_DISPLAY_NAME = import.meta.env.VITE_AGENT_DISPLAY_NAME || 'Data Agent'

type ResumeEntry = NonNullable<RunAgentInput['resume']>[number]

export class DataAgentHttpAgent extends HttpAgent {
  private queuedResume: ResumeEntry[] | undefined
  private queuedParentRunId: string | undefined

  async resumeInterrupts(entries: ResumeEntry[], parentRunId?: string) {
    if (!entries.length) return
    this.queuedResume = entries.map(entry => ({ ...entry }))
    this.queuedParentRunId = parentRunId
    try {
      return await this.runAgent()
    } finally {
      this.queuedResume = undefined
      this.queuedParentRunId = undefined
    }
  }

  protected override prepareRunAgentInput(parameters?: RunAgentParameters): RunAgentInput {
    const input = super.prepareRunAgentInput(parameters)
    if (this.queuedResume?.length) input.resume = this.queuedResume.map(entry => ({ ...entry }))
    if (this.queuedParentRunId) input.parentRunId = this.queuedParentRunId
    return input
  }
}

function agentHeaders() {
  const headers: Record<string, string> = {}
  const token = import.meta.env.VITE_AGUI_TOKEN
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

export function createDataAgent(threadId: string, initialMessages: Message[] = [], initialState: State = {}) {
  return new DataAgentHttpAgent({
    url: AGUI_URL,
    agentId: AGENT_ID,
    description: AGENT_DISPLAY_NAME,
    threadId,
    initialMessages,
    initialState,
    headers: agentHeaders(),
    debug: import.meta.env.DEV
      ? { events: true, lifecycle: true, verbose: false }
      : false,
  })
}
