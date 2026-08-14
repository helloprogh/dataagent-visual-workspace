import { computed, reactive, watch } from 'vue'
import { demoWorkspace } from './demo-data'
import type { Activity, AgentNode, AguiEvent, ChatMessage, Workspace } from './types'

const demoMode = import.meta.env.VITE_DEMO_MODE === 'true'
const storageKey = demoMode ? 'dataagent.workspace.v3.demo' : 'dataagent.workspace.v3.prod'
const emptyWorkspace = (): Workspace => ({ title: '智能分析工作区', kpis: [], widgets: [], agents: [], activities: [] })

const load = (): Workspace => {
  const saved = localStorage.getItem(storageKey)
  if (saved) {
    try { return JSON.parse(saved) as Workspace } catch { localStorage.removeItem(storageKey) }
  }
  return demoMode ? structuredClone(demoWorkspace) : emptyWorkspace()
}

export const state = reactive({
  workspace: load(),
  messages: [] as ChatMessage[],
  running: false,
  error: '',
  activeRunId: '',
})

watch(() => state.workspace, (workspace) => localStorage.setItem(storageKey, JSON.stringify(workspace)), { deep: true })

export const isEmpty = computed(() => !state.workspace.kpis.length && !state.workspace.widgets.length && !state.workspace.agents.length)
export { demoMode }

const mergeAgent = (value: Partial<AgentNode> & { id?: string; agentId?: string }) => {
  const id = value.id ?? value.agentId
  if (!id) return
  const existing = state.workspace.agents.find((agent) => agent.id === id)
  const next = { ...value, id, status: value.status ?? 'running' } as AgentNode
  if (existing) Object.assign(existing, next)
  else state.workspace.agents.push(next)
}

export const handleAguiEvent = (event: AguiEvent) => {
  if (event.type === 'RUN_STARTED') {
    state.running = true
    state.error = ''
    state.activeRunId = String(event.runId ?? '')
  }
  if (event.type === 'RUN_FINISHED') state.running = false
  if (event.type === 'RUN_ERROR') {
    state.running = false
    state.error = String(event.message ?? 'Agent run failed')
  }
  if (event.type === 'TEXT_MESSAGE_START') {
    state.messages.push({ id: String(event.messageId), role: 'assistant', content: '' })
  }
  if (event.type === 'TEXT_MESSAGE_CONTENT') {
    const message = state.messages.find((item) => item.id === String(event.messageId))
    if (message) message.content += String(event.delta ?? '')
  }
  if (event.type !== 'CUSTOM') return

  const name = String(event.name ?? '')
  const value = event.value as Record<string, unknown>
  if (name === 'workspace.render') {
    state.workspace = {
      ...emptyWorkspace(),
      ...(value as unknown as Workspace),
      agents: state.workspace.agents,
      activities: state.workspace.activities,
    }
  } else if (name === 'workspace.upsert') {
    const widget = value as unknown as Workspace['widgets'][number]
    const index = state.workspace.widgets.findIndex((item) => item.id === widget.id)
    if (index >= 0) state.workspace.widgets[index] = widget
    else state.workspace.widgets.push(widget)
  } else if (name === 'workspace.agents') {
    state.workspace.agents = value as unknown as AgentNode[]
  } else if (name.startsWith('subagent.') && name !== 'subagent.activity') {
    mergeAgent({ ...value, status: name.endsWith('completed') ? 'completed' : name.endsWith('failed') ? 'failed' : 'running' })
  } else if (name === 'subagent.activity') {
    state.workspace.activities.unshift({
      id: crypto.randomUUID(),
      agentId: String(value.agentId ?? 'agent'),
      message: String(value.message ?? ''),
      status: String(value.status ?? 'running'),
      timestamp: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
    } as Activity)
  }
}

export const resetWorkspace = () => {
  localStorage.removeItem(storageKey)
  state.workspace = demoMode ? structuredClone(demoWorkspace) : emptyWorkspace()
  state.messages = []
  state.running = false
  state.error = ''
}

