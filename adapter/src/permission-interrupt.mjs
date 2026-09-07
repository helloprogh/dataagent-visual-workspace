export function interruptFromPermission(raw, fallbackToolCallId) {
  const id = raw.id ?? raw.requestID ?? raw.requestId
  if (!id) return null
  const toolCallId = raw.toolCallID ?? raw.toolCallId ?? raw.callID ?? raw.callId ?? raw.partID ?? raw.source?.id ?? fallbackToolCallId
  const action = raw.action ?? raw.permission ?? raw.type ?? 'operation'
  const resources = raw.resources ?? raw.patterns ?? raw.paths
  return {
    id: String(id),
    reason: toolCallId ? 'tool_call' : 'input_required',
    message: `工具 ${action} 请求人工授权。`,
    ...(toolCallId ? { toolCallId: String(toolCallId) } : {}),
    responseSchema: {
      type: 'object', required: ['decision'],
      properties: { decision: { type: 'string', enum: ['once', 'always', 'reject'], 'x-enumNames': ['仅本次允许', '始终允许', '拒绝'], title: '授权决定' } },
      additionalProperties: false,
    },
    metadata: { source: 'opencode2', action, ...(resources ? { resources } : {}) },
  }
}
