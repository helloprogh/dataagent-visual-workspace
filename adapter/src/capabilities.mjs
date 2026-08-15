export const supportedScenarios = [
  {
    id: 'main-agent',
    label: '主 Agent 对话',
    status: 'supported',
    description: 'RunAgentInput 映射到独立 OpenCode2 session，并把回答流转换为标准 AG-UI 文本事件。',
    events: ['RUN_STARTED', 'TEXT_MESSAGE_*', 'STEP_*', 'RUN_FINISHED'],
  },
  {
    id: 'sub-agent',
    label: '子 Agent / 委派任务',
    status: 'supported',
    description: 'task、subtask、agent、delegate 工具在同一 AG-UI Run 中以标准 Activity 生命周期呈现。',
    events: ['TOOL_CALL_*', 'ACTIVITY_SNAPSHOT'],
  },
  {
    id: 'tool-call',
    label: '工具调用',
    status: 'supported',
    description: '完整转换工具输入流、执行中状态、成功结果与失败结果；前端工具通过 RunAgentInput.tools 动态下发。',
    events: ['TOOL_CALL_START', 'TOOL_CALL_ARGS', 'TOOL_CALL_END', 'TOOL_CALL_RESULT'],
  },
  {
    id: 'reasoning',
    label: '思考过程',
    status: 'supported',
    description: 'OpenCode2 reasoning 事件转换为 AG-UI REASONING 生命周期；是否有内容取决于模型。',
    events: ['REASONING_START', 'REASONING_MESSAGE_*', 'REASONING_END'],
  },
  {
    id: 'permission',
    label: '工具授权',
    status: 'supported',
    description: 'OpenCode2 工具等待授权时保持运行，并在联调面板中支持单次允许、始终允许或拒绝。',
    events: ['permission.asked', 'ACTIVITY_SNAPSHOT'],
  },
  {
    id: 'task-status',
    label: '同步 / 异步任务状态',
    status: 'supported',
    description: '界面保持 AG-UI SSE 运行；OpenCode2 prompt 并发消费事件流，并以标准 Activity 保留 queued/running/retry/completed 状态。',
    events: ['ACTIVITY_SNAPSHOT', 'RUN_FINISHED', 'RUN_ERROR'],
  },
  {
    id: 'context',
    label: '上下文',
    status: 'supported',
    description: '每个 AG-UI thread 复用一个 OpenCode2 session；前端 workspace state 与 context 随 RunAgentInput 下发并由 STATE_SNAPSHOT 同步。',
    events: ['STATE_SNAPSHOT', 'RunAgentInput.context'],
  },
  {
    id: 'session-switch',
    label: '会话切换',
    status: 'supported',
    description: '前端 threadId 自动切换到对应 OpenCode2 session，映射持久化后可在 adapter 重启后恢复。',
    events: ['threadId → sessionID'],
  },
  {
    id: 'visual-workspace',
    label: '动态可视工作区',
    status: 'supported',
    description: 'CopilotKit 注册 workspace.render/upsert/remove/agents；Adapter 将工具 schema 暴露为动态 MCP，OpenCode2 原生调用后通过标准 AG-UI ToolMessage 续跑。',
    events: ['RunAgentInput.tools', 'TOOL_CALL_*', 'ToolMessage', 'STATE_SNAPSHOT'],
  },
]

export const interfaceCatalog = [
  {
    consumer: 'CopilotChat / 主 Agent',
    ui: 'POST /agent',
    upstream: ['POST /api/session', 'POST /api/session/:sessionID/prompt', 'GET /api/event'],
    purpose: '创建或复用会话，提交消息，返回标准 AG-UI SSE。',
  },
  {
    consumer: '可视工作区 / 前端工具',
    ui: 'POST /agent · RunAgentInput.tools / ToolMessage',
    upstream: ['POST /api/mcp/agui_frontend', 'POST /mcp/frontend', 'GET /api/event → session.tool.*'],
    purpose: '动态注册 workspace.render/upsert/remove/agents，让 OpenCode2 调用浏览器工具并用结果继续当前会话。',
  },
  {
    consumer: '子 Agent 与工具状态',
    ui: 'POST /agent（同一事件流）',
    upstream: ['GET /api/event → session.tool.*'],
    purpose: '显示工具参数、执行结果、委派 Agent 进度。',
  },
  {
    consumer: '思考过程',
    ui: 'POST /agent（同一事件流）',
    upstream: ['GET /api/event → session.reasoning.*'],
    purpose: '显示模型提供的 reasoning 流。',
  },
  {
    consumer: '异步任务控制',
    ui: 'POST /debug/sessions/:threadId/background | interrupt',
    upstream: ['POST /api/session/:sessionID/background', 'POST /api/session/:sessionID/interrupt', 'GET /api/session/:sessionID/inbox'],
    purpose: '后台化可后台运行工具、终止执行、查看排队任务。',
  },
  {
    consumer: '工具授权',
    ui: 'POST /debug/sessions/:threadId/permissions/:requestId/reply',
    upstream: ['GET /api/session/:sessionID/permission', 'POST /api/session/:sessionID/permission/:requestID/reply'],
    purpose: '处理工具执行期间的 once / always / reject 授权。',
  },
  {
    consumer: '上下文查看',
    ui: 'GET /debug/sessions/:threadId/context',
    upstream: ['GET /api/session/:sessionID/context'],
    purpose: '读取当前会话的活动上下文。',
  },
  {
    consumer: '会话切换 / 联调面板',
    ui: 'GET /debug/sessions',
    upstream: ['GET /api/session/:sessionID', 'GET /api/session/:sessionID/inbox'],
    purpose: '检查 threadId 与 OpenCode2 sessionID 的映射和当前状态。',
  },
  {
    consumer: '协议能力面板',
    ui: 'GET /debug/capabilities',
    upstream: ['GET /api/health'],
    purpose: '显示服务连接、版本、支持场景和接口目录。',
  },
]

export const nativeEventMapping = {
  'session.text.*': 'TEXT_MESSAGE_*',
  'session.reasoning.*': 'REASONING_*',
  'session.tool.*': 'TOOL_CALL_* + ACTIVITY_SNAPSHOT',
  'session.step.*': 'STEP_*',
  'session.execution.*': 'ACTIVITY_SNAPSHOT + RUN_FINISHED / RUN_ERROR',
  'session.status=idle': 'RUN_FINISHED',
  'session.retry.scheduled': 'ACTIVITY_SNAPSHOT(retry)',
}
