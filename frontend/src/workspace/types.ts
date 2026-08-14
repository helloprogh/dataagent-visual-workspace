export type Tone = 'positive' | 'negative' | 'neutral'

export interface Kpi {
  label: string
  value: string
  change?: string
  tone?: Tone
}

export interface Widget {
  id: string
  type: 'trend' | 'insights' | 'table' | string
  title: string
  points?: number[]
  items?: string[]
  columns?: string[]
  rows?: Array<Array<string | number>>
}

export interface AgentNode {
  id: string
  name: string
  task?: string
  status: 'waiting' | 'running' | 'completed' | 'failed'
  progress?: number
  duration?: number
}

export interface Activity {
  id: string
  agentId: string
  message: string
  status?: string
  timestamp: string
}

export interface Workspace {
  title: string
  summary?: string
  kpis: Kpi[]
  widgets: Widget[]
  agents: AgentNode[]
  activities: Activity[]
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

export interface AguiEvent {
  type: string
  [key: string]: unknown
}

