import { custom, event, runFinished, runStarted, textContent, textEnd, textStart, toolArgs, toolEnd, toolResult, toolStart } from './agui.mjs'

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export const demoWorkspace = {
  title: 'OpenCode2 × AG-UI 联调工作区',
  subtitle: '真实主 Agent 对话 + 标准工具调用 + 多 Agent 编排场景',
  widgets: [
    {
      id: 'capability-summary',
      component: 'ui.executiveSummary',
      colSpan: 12,
      props: {
        title: '协议链路已连接',
        summary: '前端通过 AG-UI 与 adapter 通信，adapter 自动发现本地 OpenCode2 service，并转换文本、思考、工具、步骤和异步执行状态。',
        confidence: 100,
        tags: ['OpenCode2', 'AG-UI', 'SSE', 'Session Context'],
        highlights: [
          { label: '主 Agent', value: '已接入', tone: 'positive' },
          { label: '子 Agent', value: '工具事件驱动', tone: 'positive' },
          { label: '会话切换', value: 'threadId 映射', tone: 'positive' },
        ],
      },
    },
    {
      id: 'protocol-plan',
      component: 'ui.analysisPlan',
      colSpan: 5,
      props: {
        title: '同步 / 异步执行状态',
        steps: [
          { title: 'AG-UI 请求已建立', description: '浏览器保持 SSE 连接', status: 'done' },
          { title: 'OpenCode2 消息已入队', description: 'prompt 接口立即返回 inbox item', status: 'done' },
          { title: 'Agent 异步执行', description: 'event stream 持续回传状态', status: 'running' },
          { title: 'AG-UI 运行收口', description: 'execution succeeded / idle 后 RUN_FINISHED', status: 'pending' },
        ],
      },
    },
    {
      id: 'protocol-trace',
      component: 'ui.queryTrace',
      colSpan: 7,
      props: {
        title: '事件转换链路',
        durationMs: 128,
        steps: [
          { title: 'RunAgentInput', description: 'threadId / runId / messages / tools / context', status: 'done', kind: 'intent' },
          { title: 'Session Mapping', description: 'threadId → OpenCode2 sessionID', status: 'done', kind: 'semantic' },
          { title: 'Prompt Queue', description: 'POST /api/session/:id/prompt', status: 'done', kind: 'execute' },
          { title: 'Native Event Stream', description: 'GET /api/event', status: 'running', kind: 'execute' },
          { title: 'AG-UI Events', description: 'TEXT / REASONING / TOOL / STEP / RUN', status: 'running', kind: 'insight' },
        ],
      },
    },
  ],
}

export const agentScenario = {
  orchestrator: {
    id: 'main-agent',
    name: 'OpenCode2 Main Agent',
    role: 'orchestrator',
    task: '理解用户问题并编排工具与子 Agent',
    status: 'running',
    progress: 68,
    tools: ['reasoning', 'task', 'workspace.render'],
  },
  agents: [
    { id: 'context-agent', name: 'Context Agent', role: 'context', task: '读取当前会话上下文', status: 'done', progress: 100, durationMs: 460, tools: ['session.context'] },
    { id: 'tool-agent', name: 'Tool Agent', role: 'executor', task: '执行本地工具调用', status: 'running', progress: 72, tools: ['shell', 'read', 'search'] },
    { id: 'insight-agent', name: 'Insight Agent', role: 'analysis', task: '整理结果并生成回答', status: 'waiting', progress: 0 },
  ],
  timeline: [
    { id: 'context-agent', name: 'Context Agent', label: '加载上下文', startMs: 0, durationMs: 460, status: 'done' },
    { id: 'tool-agent', name: 'Tool Agent', label: '工具执行', startMs: 260, durationMs: 1320, status: 'running' },
    { id: 'insight-agent', name: 'Insight Agent', label: '结果整理', startMs: 1420, durationMs: 760, status: 'waiting' },
  ],
  activities: [
    { id: 'a1', time: 'NOW', agent: 'Main Agent', message: 'RunAgentInput 已接收，开始异步调度', status: 'success', meta: 'queued' },
    { id: 'a2', time: '+0.4s', agent: 'Context Agent', message: '活动上下文加载完成', status: 'success', meta: 'context' },
    { id: 'a3', time: '+0.7s', agent: 'Tool Agent', message: '正在等待真实 OpenCode2 工具事件', status: 'running', meta: 'tool stream' },
  ],
}

export function createScenarioEvents(input) {
  const runId = input.runId ?? `run-${Date.now()}`
  const messageId = `scenario-${runId}`
  const workspaceToolId = `workspace-${runId}`
  const agentsToolId = `agents-${runId}`
  return [
    event('REASONING_START', { messageId: `reasoning-${runId}` }),
    event('REASONING_MESSAGE_START', { messageId: `reasoning-${runId}`, role: 'reasoning' }),
    event('REASONING_MESSAGE_CONTENT', { messageId: `reasoning-${runId}`, delta: '先验证会话映射与上下文，再并行观察工具、子 Agent 和任务状态。' }),
    event('REASONING_MESSAGE_END', { messageId: `reasoning-${runId}` }),
    event('REASONING_END', { messageId: `reasoning-${runId}` }),
    textStart(messageId),
    textContent(messageId, '联调场景已加载。下面的主回答仍来自本地 OpenCode2 service。'),
    textEnd(messageId),
    toolStart(workspaceToolId, 'workspace.render', messageId),
    toolArgs(workspaceToolId, JSON.stringify(demoWorkspace)),
    toolEnd(workspaceToolId),
    toolResult(`result-${workspaceToolId}`, workspaceToolId, 'Workspace scenario rendered'),
    custom('workspace.render', demoWorkspace),
    toolStart(agentsToolId, 'workspace.agents', messageId),
    toolArgs(agentsToolId, JSON.stringify(agentScenario)),
    toolEnd(agentsToolId),
    toolResult(`result-${agentsToolId}`, agentsToolId, 'Agent scenario rendered'),
    custom('workspace.agents', agentScenario),
  ]
}

export function createMockEvents(input) {
  const threadId = input.threadId ?? `thread-${Date.now()}`
  const runId = input.runId ?? `run-${Date.now()}`
  return [
    runStarted(threadId, runId),
    event('STEP_STARTED', { stepName: '协议能力联调' }),
    ...createScenarioEvents({ ...input, runId }),
    event('STEP_FINISHED', { stepName: '协议能力联调' }),
    runFinished(threadId, runId),
  ]
}

export async function streamMock(input, emit, delay = 55) {
  for (const item of createMockEvents(input)) {
    emit(item)
    if (delay) await pause(delay)
  }
}
