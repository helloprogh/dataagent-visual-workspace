export const WORKFLOW_STAGES = [
  { id: 'clarify', label: '需求澄清', prompt: '请先澄清需求、约束和验收标准。' },
  { id: 'plan', label: '方案', prompt: '请根据当前需求制定实施方案，说明步骤、风险和验证方式。' },
  { id: 'develop', label: '开发', prompt: '请按已确认的方案开始开发，完成必要的文件修改，并说明实际改动。' },
  { id: 'verify', label: '验证', prompt: '请验证当前实现，执行相关测试和构建，如实报告通过项与失败项。' },
  { id: 'deliver', label: '交付', prompt: '请整理本次交付，列出改动、验证结果、生成文件以及未完成事项。' },
] as const
export type WorkflowStage = typeof WORKFLOW_STAGES[number]['id']
type Evidence = { messageId: string; description: string; source: 'request' | 'tool' | 'file' | 'message'; index: number; failed?: boolean }
type WorkflowMessage = { id: string; role: string; content?: unknown; toolCalls?: Array<{ id: string; function?: { name?: string; arguments?: string } }>; toolCallId?: string; error?: unknown }
export type WorkflowOptions = { running?: boolean; waiting?: boolean; stopped?: boolean; error?: string }

function textOf(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.filter(part => part?.type === 'text').map(part => String(part.text ?? '')).join('')
}

function requestedStage(text: string): WorkflowStage | undefined {
  if (/不要|别|暂不|不需要/.test(text)) return undefined
  if (/^(?:请)?(?:怎么|如何|为什么|解释|说明)/.test(text.trim())) return undefined
  if (/(?:开始|继续|进入|进行|执行|请先|请)\s*(?:开发|实现|编写|编码)/.test(text)) return 'develop'
  if (/(?:开始|继续|进入|进行|执行|请先|请)\s*(?:验证|测试|构建)/.test(text)) return 'verify'
  if (/(?:开始|整理|准备|请).{0,12}交付/.test(text)) return 'deliver'
  if (/(?:制定|设计|梳理|请).{0,12}(?:方案|计划)/.test(text)) return 'plan'
  if (/(?:请|先).{0,8}澄清/.test(text)) return 'clarify'
  return undefined
}

export function toolWorkflowStage(name: string, args = ''): WorkflowStage | undefined {
  const tool = name.toLowerCase()
  if (['write', 'edit', 'apply_patch', 'multiedit', 'notebookedit'].includes(tool)) return 'develop'
  if (['read', 'glob', 'grep', 'list', 'webfetch', 'websearch', 'todowrite', 'todoread'].includes(tool)) return 'plan'
  if (['bash', 'shell', 'exec', 'exec_command'].includes(tool)) {
    let command = ''
    try {
      const input = JSON.parse(args)
      command = String(input.command ?? input.cmd ?? '')
    } catch { return undefined }
    if (/(?:^|[\s;&|])(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test|check|build|typecheck|lint)(?:[\s:;&|]|$)|\b(?:pytest|vitest|jest|vue-tsc|tsc)\b|\b(?:cargo|go|dotnet)\s+(?:test|build|check)\b/.test(command)) return 'verify'
  }
  return undefined
}

// Replay persisted messages as well as live messages; no timer or running=>develop shortcut.
export function deriveWorkflow(messages: readonly WorkflowMessage[], options: WorkflowOptions = {}) {
  const evidence: Partial<Record<WorkflowStage, Evidence>> = {}
  const calls = new Map<string, WorkflowStage>()
  let active: WorkflowStage = 'clarify'
  let latestUser = -1
  let developed = false
  messages.forEach((message, index) => {
    if (message.role === 'user') {
      latestUser = index
      const requested = requestedStage(textOf(message.content))
      if (requested) {
        active = requested
        evidence[active] = { messageId: message.id, description: '已请求，等待实际执行', source: 'request', index }
      } else if (!Object.keys(evidence).length) {
        evidence.clarify = { messageId: message.id, description: '需求已提交', source: 'message', index }
      }
    }
    if (message.role === 'assistant') {
      const requested = evidence[active]
      if (textOf(message.content).trim() && requested?.source === 'request' && requested.index >= latestUser && ['clarify', 'plan', 'deliver'].includes(active)) {
        evidence[active] = { messageId: message.id, description: '已收到阶段回复，点击查看', source: 'message', index }
      }
      for (const call of message.toolCalls ?? []) {
        const phase = toolWorkflowStage(call.function?.name ?? '', call.function?.arguments)
        if (!phase) continue
        calls.set(call.id, phase)
        if (phase === 'plan' && (developed || active === 'develop' || active === 'verify' || active === 'deliver')) continue
        if (phase === 'develop') developed = true
        active = phase
        evidence[phase] = {
          messageId: message.id, index, source: 'tool',
          description: phase === 'develop' ? '已调用文件修改工具' : phase === 'verify' ? '已发起测试或构建' : '已读取方案依据',
        }
      }
      if (Array.isArray(message.content) && message.content.some(part => ['file', 'document', 'image', 'audio', 'video'].includes(part?.type) && part?.source?.value)) {
        active = 'deliver'
        evidence.deliver = { messageId: message.id, index, source: 'file', description: '已生成交付文件' }
      }
    }
    if (message.role === 'tool') {
      const phase = calls.get(message.toolCallId ?? '')
      const previous = phase && evidence[phase]
      if (phase && previous && previous.source === 'tool') {
        evidence[phase] = { ...previous, index, failed: Boolean(message.error), description: message.error ? '该阶段存在执行失败' : '已收到执行结果，请查看步骤详情' }
      }
    }
  })
  const current = evidence[active]
  const currentTurn = current && current.index >= latestUser
  const status = options.waiting ? 'waiting' : options.error ? 'failed' : options.stopped ? 'stopped'
    : current?.failed ? 'failed'
      : options.running && currentTurn && current?.source !== 'request' ? 'running'
        : current?.source === 'request' ? 'requested' : current ? 'recorded' : 'idle'
  return { active, evidence, status } as const
}
export type WorkflowSnapshot = ReturnType<typeof deriveWorkflow>
