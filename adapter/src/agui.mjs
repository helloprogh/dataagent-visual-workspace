import { randomUUID } from 'node:crypto'

export const event = (type, payload = {}) => ({ type, ...payload })

const parseSerializedValue = (value) => {
  let parsed = value
  for (let attempt = 0; attempt < 2 && typeof parsed === 'string'; attempt += 1) {
    try {
      parsed = JSON.parse(parsed)
    } catch {
      return value
    }
  }
  return parsed
}

export const normalizeState = (snapshot) => {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return {}
  const workspace = snapshot.workspace
  if (!workspace || typeof workspace !== 'object' || Array.isArray(workspace)) return snapshot
  return {
    ...snapshot,
    workspace: {
      ...workspace,
      widgets: parseSerializedValue(workspace.widgets),
    },
  }
}

export const runStarted = (threadId, runId) => event('RUN_STARTED', { threadId, runId })
export const runFinished = (threadId, runId) => event('RUN_FINISHED', { threadId, runId })
export const runError = (message, code = 'OPENCODE_ERROR') => event('RUN_ERROR', { message, code })

export const textStart = (messageId = randomUUID(), role = 'assistant') =>
  event('TEXT_MESSAGE_START', { messageId, role })
export const textContent = (messageId, delta) => event('TEXT_MESSAGE_CONTENT', { messageId, delta })
export const textEnd = (messageId) => event('TEXT_MESSAGE_END', { messageId })

export const toolStart = (toolCallId, toolCallName, parentMessageId) =>
  event('TOOL_CALL_START', { toolCallId, toolCallName, parentMessageId })
export const toolArgs = (toolCallId, delta) => event('TOOL_CALL_ARGS', { toolCallId, delta })
export const toolEnd = (toolCallId) => event('TOOL_CALL_END', { toolCallId })
export const toolResult = (messageId, toolCallId, content, role = 'tool') =>
  event('TOOL_CALL_RESULT', { messageId, toolCallId, content, role })

export const stateSnapshot = (snapshot) => event('STATE_SNAPSHOT', { snapshot: normalizeState(snapshot) })
export const stateDelta = (delta) => event('STATE_DELTA', { delta })
export const activitySnapshot = (messageId, activityType, content, replace = true) =>
  event('ACTIVITY_SNAPSHOT', { messageId, activityType, content, replace })
export const activityDelta = (messageId, activityType, patch) =>
  event('ACTIVITY_DELTA', { messageId, activityType, patch })

export const custom = (name, value) => event('CUSTOM', { name, value })
