import { custom, event, runFinished, runStarted, textContent, textEnd, textStart, toolArgs, toolEnd, toolResult, toolStart } from './agui.mjs'

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const demoWorkspace = {
  title: '经营智能分析工作区',
  summary: '本月 GMV 保持增长，直播渠道与新客是主要驱动；退款率需要持续关注。',
  kpis: [
    { label: 'GMV', value: '¥12.86M', change: '+12.4%', tone: 'positive' },
    { label: '订单量', value: '86,420', change: '+8.7%', tone: 'positive' },
    { label: '客单价', value: '¥148.8', change: '+3.2%', tone: 'positive' },
    { label: '退款率', value: '4.6%', change: '+0.8%', tone: 'negative' },
  ],
  widgets: [
    {
      id: 'trend', type: 'trend', title: 'GMV 趋势',
      points: [42, 48, 45, 56, 61, 58, 72, 68, 79, 84, 91, 96],
    },
    {
      id: 'insights', type: 'insights', title: '关键洞察',
      items: ['直播渠道贡献 6.8 个百分点', '新客转化率提升 3.1%', '华东区域连续三周增长', '退款率较上月升高 0.8%'],
    },
  ],
}

const agents = [
  { id: 'orchestrator', name: 'Data Orchestrator', status: 'running', progress: 82, task: '编排经营分析任务' },
  { id: 'sql', name: 'SQL Agent', status: 'completed', progress: 100, task: '查询核心经营指标', duration: 1840 },
  { id: 'quality', name: 'Quality Agent', status: 'completed', progress: 100, task: '验证数据质量', duration: 2210 },
  { id: 'insight', name: 'Insight Agent', status: 'running', progress: 72, task: '分析增长驱动因素' },
  { id: 'forecast', name: 'Forecast Agent', status: 'waiting', progress: 0, task: '预测下月趋势' },
]

export function createMockEvents(input) {
  const threadId = input.threadId ?? `thread-${Date.now()}`
  const runId = input.runId ?? `run-${Date.now()}`
  const messageId = `assistant-${runId}`
  const toolCallId = `workspace-${runId}`
  return [
    runStarted(threadId, runId),
    event('STEP_STARTED', { stepName: '理解分析目标' }),
    textStart(messageId),
    textContent(messageId, '正在编排 SQL、数据质量与洞察 Agent，为你生成动态分析工作区。'),
    textEnd(messageId),
    event('STEP_FINISHED', { stepName: '理解分析目标' }),
    toolStart(toolCallId, 'workspace.render', messageId),
    toolArgs(toolCallId, JSON.stringify(demoWorkspace)),
    custom('workspace.render', demoWorkspace),
    custom('workspace.agents', agents),
    custom('subagent.activity', { agentId: 'sql', message: '查询完成，返回 1,284 行数据', status: 'completed' }),
    custom('subagent.activity', { agentId: 'quality', message: '质量检查完成，发现 2 个提示项', status: 'completed' }),
    custom('subagent.activity', { agentId: 'insight', message: '正在执行渠道与人群归因', status: 'running' }),
    toolEnd(toolCallId),
    toolResult(`result-${toolCallId}`, toolCallId, 'Workspace rendered'),
    runFinished(threadId, runId),
  ]
}

export async function streamMock(input, emit, delay = 55) {
  for (const item of createMockEvents(input)) {
    emit(item)
    if (delay) await pause(delay)
  }
}

export { demoWorkspace, agents }

