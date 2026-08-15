import { randomUUID } from 'node:crypto'
import {
  activitySnapshot,
  event,
  runError,
  runFinished,
  runStarted,
  textContent,
  textEnd,
  textStart,
  toolArgs,
  toolEnd,
  toolResult,
  toolStart,
} from './agui.mjs'

const propsOf = (source) => source?.properties ?? source?.data ?? source ?? {}
const idOf = (value, fallback) => value ?? fallback ?? randomUUID()
const asText = (value) => (typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value))
const errorText = (value) => asText(value?.message ?? value?.data?.message ?? value?.name ?? value)
const isTerminal = (status) => ['completed', 'success', 'error', 'failed'].includes(status)
const isSubAgentTool = (name) => ['task', 'subtask', 'agent', 'delegate'].includes(String(name).toLowerCase())
const toolContentText = (content) => {
  if (!Array.isArray(content)) return asText(content)
  return content.map((item) => item?.text ?? item?.content ?? item?.data ?? asText(item)).filter(Boolean).join('\n')
}
const taskActivity = (runId, content) => activitySnapshot(`task-${runId}`, 'dataagent.task', content)
const subagentActivity = (id, content) => activitySnapshot(`subagent-${id}`, 'dataagent.subagent', content)

export class OpenCodeAguiConverter {
  constructor({ threadId, runId, sessionId, resumedToolCallIds = [] }) {
    this.threadId = threadId
    this.runId = runId
    this.sessionId = sessionId
    this.messageIds = new Map()
    this.partIds = new Map()
    this.openText = new Set()
    this.openReasoning = new Set()
    this.closedReasoning = new Set()
    this.openTools = new Set()
    this.resumedToolCallIds = new Set(resumedToolCallIds.map(String))
    this.textHasDelta = new Set()
    this.reasoningHasDelta = new Set()
    this.tools = new Map()
    this.stepNames = new Map()
    this.legacySteps = new Set()
    this.started = false
    this.finished = false
  }

  start() {
    if (this.started) return []
    this.started = true
    return [runStarted(this.threadId, this.runId)]
  }

  messageId(rawId) {
    if (!this.messageIds.has(rawId)) this.messageIds.set(rawId, idOf(rawId, `msg-${randomUUID()}`))
    return this.messageIds.get(rawId)
  }

  streamMessageId(raw, kind = 'text') {
    const sourceId = raw.assistantMessageID ?? raw.messageID ?? raw.messageId ?? `assistant-${this.runId}`
    // OpenCode2 may increment ordinal for multiple lifecycle notifications that
    // belong to one reasoning block. AG-UI requires those notifications to use
    // one stable messageId; otherwise every notification renders as an empty
    // "Thought for a few seconds" entry.
    if (kind === 'reasoning') return this.messageId(`${sourceId}-reasoning`)
    const ordinal = Number(raw.ordinal ?? 0)
    return this.messageId(ordinal > 0 ? `${sourceId}-${kind}-${ordinal}` : sourceId)
  }

  partMessageId(raw) {
    const rawPartId = raw.partID ?? raw.partId
    const rawMessageId = raw.messageID ?? raw.messageId ?? this.partIds.get(rawPartId)
    if (rawPartId && rawMessageId) this.partIds.set(rawPartId, rawMessageId)
    return this.messageId(rawMessageId ?? `part-${rawPartId ?? randomUUID()}`)
  }

  matchesSession(raw) {
    const eventSession = raw.sessionID ?? raw.sessionId ?? raw.session?.id
    return !eventSession || !this.sessionId || eventSession === this.sessionId
  }

  openTextMessage(messageId) {
    if (this.openText.has(messageId)) return []
    this.openText.add(messageId)
    return [textStart(messageId)]
  }

  convert(source) {
    if (this.finished) return []
    const type = source?.type ?? ''
    const raw = propsOf(source)
    if (!this.matchesSession(raw)) return []

    if (type === 'message.updated') {
      const info = raw.info ?? raw.message ?? raw
      if (info.role === 'assistant' && (info.id ?? info.messageID)) this.messageId(info.id ?? info.messageID)
      return []
    }
    if (type === 'message.part.updated') return this.convertPart(raw.part ?? raw)
    if (type === 'message.part.delta') return this.convertLegacyDelta(raw)
    if (type === 'TEXT_MESSAGE_CONTENT') return this.convertLegacyText(raw)

    if (type === 'session.text.started') return this.openTextMessage(this.streamMessageId(raw, 'text'))
    if (type === 'session.text.delta') {
      const messageId = this.streamMessageId(raw, 'text')
      const delta = asText(raw.delta)
      if (!delta) return []
      this.textHasDelta.add(messageId)
      return [...this.openTextMessage(messageId), textContent(messageId, delta)]
    }
    if (type === 'session.text.ended') {
      const messageId = this.streamMessageId(raw, 'text')
      const events = this.openTextMessage(messageId)
      if (!this.textHasDelta.has(messageId) && raw.text) events.push(textContent(messageId, raw.text))
      if (this.openText.delete(messageId)) events.push(textEnd(messageId))
      return events
    }

    if (type === 'session.reasoning.started') return this.openReasoningMessage(this.streamMessageId(raw, 'reasoning'))
    if (type === 'session.reasoning.delta') {
      const messageId = this.streamMessageId(raw, 'reasoning')
      if (this.closedReasoning.has(messageId)) return []
      const delta = asText(raw.delta)
      if (!delta) return []
      this.reasoningHasDelta.add(messageId)
      return [...this.openReasoningMessage(messageId), event('REASONING_MESSAGE_CONTENT', { messageId, delta })]
    }
    if (type === 'session.reasoning.ended') {
      const messageId = this.streamMessageId(raw, 'reasoning')
      if (this.closedReasoning.has(messageId)) return []
      const events = this.openReasoningMessage(messageId)
      if (!this.reasoningHasDelta.has(messageId) && raw.text) events.push(event('REASONING_MESSAGE_CONTENT', { messageId, delta: raw.text }))
      events.push(...this.closeReasoning(messageId))
      return events
    }

    if (type.startsWith('session.tool.')) return this.convertNativeTool(type, raw)

    if (type === 'session.step.started') {
      const key = raw.assistantMessageID ?? 'current'
      if (this.stepNames.has(key)) return []
      const stepName = `${raw.agent ?? 'OpenCode'} · ${raw.model?.id ?? 'step'}`
      this.stepNames.set(key, stepName)
      return [event('STEP_STARTED', { stepName })]
    }
    if (type === 'session.step.ended') {
      const key = raw.assistantMessageID ?? 'current'
      const stepName = this.stepNames.get(key)
      if (!stepName) return []
      this.stepNames.delete(key)
      return [event('STEP_FINISHED', { stepName, result: { finish: raw.finish, cost: raw.cost, tokens: raw.tokens } })]
    }
    if (type === 'session.step.failed') return this.fail(errorText(raw.error) || 'OpenCode step failed')

    if (type === 'session.execution.started') {
      return [taskActivity(this.runId, { mode: 'async', status: 'running', sessionId: this.sessionId, runId: this.runId })]
    }
    if (type === 'session.execution.succeeded') {
      return [taskActivity(this.runId, { mode: 'async', status: 'completed', sessionId: this.sessionId, runId: this.runId }), ...this.finish()]
    }
    if (type === 'session.execution.failed') return this.fail(errorText(raw.error) || 'OpenCode execution failed')
    if (type === 'session.execution.interrupted') return this.fail(`OpenCode execution interrupted: ${raw.reason ?? 'unknown'}`)
    if (type === 'session.retry.scheduled') {
      return [taskActivity(this.runId, { mode: 'async', status: 'retry', attempt: raw.attempt, nextAt: raw.at, error: errorText(raw.error) })]
    }
    if (type === 'session.inbox.enqueued') return [taskActivity(this.runId, { mode: 'async', status: 'queued', inboxId: raw.inboxID })]
    if (type === 'session.inbox.delivered') return [taskActivity(this.runId, { mode: 'async', status: 'delivered', inboxId: raw.inboxID })]
    if (type === 'permission.asked') return this.interrupt(raw)

    if (type === 'session.error') return this.fail(errorText(raw.error ?? raw.message) || 'OpenCode run failed')
    if (type === 'session.idle' || (type === 'session.status' && (raw.status?.type ?? raw.status) === 'idle')) return this.finish()
    if (type === 'step-start' || type === 'step.started') {
      const stepName = raw.name ?? raw.title ?? 'OpenCode step'
      if (this.legacySteps.has(stepName)) return []
      this.legacySteps.add(stepName)
      return [event('STEP_STARTED', { stepName })]
    }
    if (type === 'step-finish' || type === 'step.finished') {
      const stepName = raw.name ?? raw.title ?? 'OpenCode step'
      if (!this.legacySteps.delete(stepName)) return []
      return [event('STEP_FINISHED', { stepName })]
    }
    return []
  }

  convertLegacyDelta(raw) {
    const field = raw.field ?? 'text'
    const delta = asText(raw.delta ?? raw.value)
    if (!delta) return []
    const messageId = this.partMessageId(raw)
    if (field === 'reasoning') return this.reasoningDelta(messageId, delta)
    if (field !== 'text') return []
    this.textHasDelta.add(messageId)
    return [...this.openTextMessage(messageId), textContent(messageId, delta)]
  }

  convertLegacyText(raw) {
    const delta = asText(raw.delta ?? raw.text ?? raw.content)
    if (!delta) return []
    const messageId = this.partMessageId(raw)
    this.textHasDelta.add(messageId)
    return [...this.openTextMessage(messageId), textContent(messageId, delta)]
  }

  convertPart(part) {
    const kind = part.type ?? part.kind
    const messageId = this.partMessageId(part)
    if (kind === 'text') {
      const delta = asText(part.delta ?? part.text ?? part.content)
      const events = this.openTextMessage(messageId)
      if (delta) events.push(textContent(messageId, delta))
      if (part.time?.end || part.done || part.status === 'completed') {
        if (this.openText.delete(messageId)) events.push(textEnd(messageId))
      }
      return events
    }
    if (kind === 'reasoning') {
      const events = this.reasoningDelta(messageId, asText(part.delta ?? part.text ?? part.content))
      if (part.time?.end || part.done || part.status === 'completed') events.push(...this.closeReasoning(messageId))
      return events
    }
    if (kind === 'tool' || kind === 'tool-invocation') return this.convertLegacyTool(part, messageId)
    if (kind === 'subtask') return [subagentActivity(part.id ?? part.partID ?? randomUUID(), {
      agentId: part.id ?? part.partID,
      name: part.name ?? part.agent ?? 'Sub Agent',
      task: part.prompt ?? part.description ?? '',
      status: 'running',
    })]
    return []
  }

  openReasoningMessage(messageId) {
    if (this.closedReasoning.has(messageId)) return []
    if (this.openReasoning.has(messageId)) return []
    this.openReasoning.add(messageId)
    return [event('REASONING_START', { messageId }), event('REASONING_MESSAGE_START', { messageId, role: 'reasoning' })]
  }

  reasoningDelta(messageId, delta) {
    if (this.closedReasoning.has(messageId)) return []
    const events = this.openReasoningMessage(messageId)
    if (delta) events.push(event('REASONING_MESSAGE_CONTENT', { messageId, delta }))
    return events
  }

  closeReasoning(messageId) {
    if (!this.openReasoning.delete(messageId)) return []
    this.closedReasoning.add(messageId)
    return [event('REASONING_MESSAGE_END', { messageId }), event('REASONING_END', { messageId })]
  }

  toolState(raw) {
    const toolCallId = idOf(raw.id ?? raw.callID ?? raw.callId ?? raw.partID, `tool-${randomUUID()}`)
    if (!this.tools.has(toolCallId)) this.tools.set(toolCallId, {
      id: toolCallId,
      name: raw.name ?? raw.tool ?? 'tool',
      parentMessageId: this.messageId(raw.assistantMessageID ?? raw.messageID ?? raw.messageId ?? `assistant-${this.runId}`),
      args: '',
    })
    const state = this.tools.get(toolCallId)
    if (raw.name ?? raw.tool) state.name = raw.name ?? raw.tool
    return state
  }

  startTool(state) {
    if (this.openTools.has(state.id)) return []
    this.openTools.add(state.id)
    const events = [toolStart(state.id, state.name, state.parentMessageId)]
    if (isSubAgentTool(state.name)) events.push(subagentActivity(state.id, {
      agentId: state.id,
      name: state.name,
      task: state.args,
      status: 'running',
    }))
    return events
  }

  convertNativeTool(type, raw) {
    const state = this.toolState(raw)
    const resumed = this.resumedToolCallIds.has(String(state.id))
    if (resumed && type !== 'session.tool.success' && type !== 'session.tool.failed') return []
    if (type === 'session.tool.input.started') return this.startTool(state)
    if (type === 'session.tool.input.delta') {
      const delta = asText(raw.delta)
      state.args += delta
      return delta ? [...this.startTool(state), toolArgs(state.id, delta)] : this.startTool(state)
    }
    if (type === 'session.tool.input.ended') {
      const text = asText(raw.text)
      const events = resumed ? [] : this.startTool(state)
      if (!state.args && text) events.push(toolArgs(state.id, text))
      state.args = text || state.args
      return events
    }
    if (type === 'session.tool.called') {
      const events = this.startTool(state)
      if (!state.args && raw.input != null) {
        state.args = asText(raw.input)
        events.push(toolArgs(state.id, state.args))
      }
      return events
    }
    if (type === 'session.tool.progress') {
      return [activitySnapshot(
        `${isSubAgentTool(state.name) ? 'subagent' : 'tool'}-${state.id}`,
        isSubAgentTool(state.name) ? 'dataagent.subagent' : 'dataagent.tool',
        {
        agentId: state.id,
        toolCallId: state.id,
        name: state.name,
        status: 'running',
        ...raw.metadata,
        },
      )]
    }
    if (type === 'session.tool.success' || type === 'session.tool.failed') {
      const events = resumed ? [] : this.startTool(state)
      if (this.openTools.delete(state.id)) events.push(toolEnd(state.id))
      const failed = type === 'session.tool.failed'
      const output = failed ? errorText(raw.error) : toolContentText(raw.content)
      events.push(toolResult(`result-${state.id}`, state.id, output || (failed ? 'Tool failed' : 'Tool completed')))
      if (isSubAgentTool(state.name)) events.push(subagentActivity(state.id, {
        agentId: state.id,
        name: state.name,
        status: failed ? 'failed' : 'completed',
        summary: output,
      }))
      return events
    }
    return []
  }

  convertLegacyTool(part, parentMessageId) {
    const stateValue = part.state ?? part.status ?? {}
    const status = typeof stateValue === 'string' ? stateValue : stateValue.status
    const state = this.toolState({ ...part, assistantMessageID: parentMessageId })
    const events = []
    if (['pending', 'running', 'completed', 'success', 'error', 'failed'].includes(status)) {
      events.push(...this.startTool(state))
      const input = stateValue.input ?? part.input ?? stateValue.args ?? part.args
      if (!state.args && input != null) {
        state.args = asText(input)
        events.push(toolArgs(state.id, state.args))
      }
    }
    if (status === 'running' && isSubAgentTool(state.name)) {
      events.push(subagentActivity(state.id, {
        agentId: state.id,
        name: part.metadata?.agent ?? part.agent ?? state.name,
        progress: part.metadata?.progress ?? 50,
        step: part.metadata?.step ?? 'Working',
        status: 'running',
      }))
    }
    if (isTerminal(status)) {
      if (this.openTools.delete(state.id)) events.push(toolEnd(state.id))
      const output = stateValue.output ?? stateValue.result ?? part.output ?? stateValue.error ?? ''
      events.push(toolResult(`result-${state.id}`, state.id, asText(output)))
      if (isSubAgentTool(state.name)) events.push(subagentActivity(state.id, {
        agentId: state.id,
        name: part.metadata?.agent ?? part.agent ?? state.name,
        status: status === 'error' || status === 'failed' ? 'failed' : 'completed',
        summary: asText(output),
      }))
    }
    return events
  }

  closeOpenEvents() {
    const events = []
    for (const messageId of this.openText) events.push(textEnd(messageId))
    for (const messageId of [...this.openReasoning]) events.push(...this.closeReasoning(messageId))
    for (const toolCallId of this.openTools) events.push(toolEnd(toolCallId))
    for (const stepName of this.stepNames.values()) events.push(event('STEP_FINISHED', { stepName }))
    for (const stepName of this.legacySteps) events.push(event('STEP_FINISHED', { stepName }))
    this.openText.clear()
    this.openTools.clear()
    this.stepNames.clear()
    this.legacySteps.clear()
    return events
  }

  interrupt(raw) {
    const requestId = String(raw.id ?? raw.requestID ?? raw.requestId ?? randomUUID())
    const explicitToolCallId = raw.toolCallID ?? raw.toolCallId ?? raw.callID ?? raw.callId ?? raw.partID
    const toolCallId = explicitToolCallId ?? [...this.openTools].at(-1)
    const action = raw.action ?? raw.permission ?? raw.type ?? 'operation'
    const resources = raw.resources ?? raw.patterns ?? raw.paths
    const interrupt = {
      id: requestId,
      reason: toolCallId ? 'tool_call' : 'input_required',
      message: `工具 ${action} 请求人工授权。`,
      ...(toolCallId ? { toolCallId: String(toolCallId) } : {}),
      responseSchema: {
        type: 'object',
        required: ['decision'],
        properties: {
          decision: {
            type: 'string',
            enum: ['once', 'always', 'reject'],
            title: '授权决定',
          },
        },
        additionalProperties: false,
      },
      metadata: {
        source: 'opencode2',
        action,
        ...(resources ? { resources } : {}),
      },
    }
    return [
      taskActivity(this.runId, { mode: 'async', status: 'waiting_permission', permission: raw }),
      ...this.finish({ type: 'interrupt', interrupts: [interrupt] }),
    ]
  }

  finish(outcome) {
    if (this.finished) return []
    this.finished = true
    return [...this.closeOpenEvents(), runFinished(this.threadId, this.runId, outcome)]
  }

  fail(message) {
    if (this.finished) return []
    this.finished = true
    return [...this.closeOpenEvents(), runError(message)]
  }
}
