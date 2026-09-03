import type { Message } from '@ag-ui/client'

export type ToolStep = {
  kind: 'tool'; key: string; message: Message
  call: { id: string; function: { name?: string; arguments?: string } }
  result?: Message
}
export type ProcessStep = ToolStep | { kind: 'message'; key: string; message: Message }
export type ProcessGroup = { kind: 'process'; key: string; steps: ProcessStep[]; settled: boolean; running: boolean; activeReasoningId: string }
export type ResponseItem = ProcessGroup | { kind: 'message'; key: string; message: Message }
export type PresentationItem = ResponseItem | { kind: 'turn'; key: string; user: Message; children: ResponseItem[] }

export function messageText(message: Message) {
  const content = (message as any).content
  if (typeof content === 'string') return content
  return Array.isArray(content) ? content.filter(part => part?.type === 'text').map(part => String(part.text ?? part.content ?? '')).join('') : ''
}

export function toolDisplayName(name: unknown) {
  const value = String(name ?? '').trim()
  const labels: Record<string, string> = { read: '读取文件', write: '保存文件', edit: '修改文件', glob: '查找文件', grep: '搜索内容', bash: '执行命令', shell: '执行命令', task: '协同处理' }
  return labels[value.toLowerCase()] ?? (value.startsWith('mcp_') ? '调用外部能力' : value || '执行工具')
}

export function toolOutputText(message: Message) {
  const text = messageText(message)
  try {
    const parts = JSON.parse(text)
    if (Array.isArray(parts) && parts.length && parts.every(part => part?.type === 'text' && typeof part.text === 'string')) {
      return parts.map(part => part.text).join('\n')
    }
  } catch { /* Plain text and partially streamed outputs are already readable. */ }
  return text
}

function hasBody(message: Message) {
  const content = (message as any).content
  return Boolean(messageText(message).trim()) || (Array.isArray(content) && content.some(part => ['image', 'audio', 'video', 'document', 'file'].includes(part?.type)))
}

// Only project the view: original messages remain intact for export, retry and approvals.
export function buildPresentation(messages: Message[], running = false, activeReasoningId?: string): PresentationItem[] {
  const result: PresentationItem[] = []
  const chunks: { user?: Message; messages: Message[] }[] = [{ messages: [] }]
  for (const message of messages) {
    if (message.role === 'user') chunks.push({ user: message, messages: [] })
    else chunks[chunks.length - 1]!.messages.push(message)
  }

  chunks.forEach((chunk, chunkIndex) => {
    const children: ResponseItem[] = []
    const calls = new Map<string, ToolStep>()
    // Pre-index results so late or parallel results update their original call row.
    const results = new Map<string, Message>()
    const knownCalls = new Set<string>()
    for (const message of chunk.messages) {
      const raw = message as any
      if (raw.role === 'tool' && raw.toolCallId) results.set(raw.toolCallId, message)
      for (const call of raw.toolCalls ?? []) knownCalls.add(call.id)
    }
    let group: ProcessGroup | undefined
    let latestStep: ProcessStep | undefined
    const settle = () => {
      if (group) group.settled = true
      group = undefined
      latestStep = undefined
    }
    const append = (step: ProcessStep) => {
      if (!group) {
        group = { kind: 'process', key: `process-${step.key}`, steps: [], settled: false, running: false, activeReasoningId: '' }
        children.push(group)
      }
      group.steps.push(step)
      latestStep = step
    }

    for (const message of chunk.messages) {
      const raw = message as any
      if (message.role === 'assistant') {
        if (hasBody(message)) {
          settle()
          children.push({ kind: 'message', key: `message-${message.id}`, message: { ...message, toolCalls: [] } as Message })
        }
        for (const call of raw.toolCalls ?? []) {
          if (calls.has(call.id)) continue
          const step: ToolStep = { kind: 'tool', key: `tool-${call.id}`, message: { ...message, content: '', toolCalls: [call] } as Message, call, result: results.get(call.id) }
          calls.set(call.id, step)
          append(step)
        }
      } else if (message.role === 'tool') {
        if (knownCalls.has(raw.toolCallId)) continue
        // A paginated history may contain a result whose call is not loaded yet.
        append({ kind: 'message', key: message.id, message })
      } else if (message.role === 'activity') {
        const content = raw.content ?? {}
        if (['dataagent.tool', 'dataagent.subagent'].includes(raw.activityType)
          && knownCalls.has(content.toolCallId ?? content.agentId)) continue
        if (raw.activityType === 'dataagent.task'
          && ['completed', 'delivered', 'running', 'queued'].includes(content.status)) continue
        append({ kind: 'message', key: message.id, message })
      } else if (message.role === 'reasoning') {
        append({ kind: 'message', key: message.id, message })
      } else if (hasBody(message)) {
        settle()
        children.push({ kind: 'message', key: `message-${message.id}`, message })
      }
    }
    if (chunkIndex < chunks.length - 1) settle()
    if (group && running && chunkIndex === chunks.length - 1) {
      group.running = true
      if (latestStep?.kind === 'message' && latestStep.message.role === 'reasoning'
        && (activeReasoningId === undefined || activeReasoningId === latestStep.message.id)) group.activeReasoningId = latestStep.message.id
    }
    if (chunk.user) result.push({ kind: 'turn', key: `turn-${chunk.user.id}`, user: chunk.user, children })
    else result.push(...children)
  })
  return result
}
