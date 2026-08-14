import { randomUUID } from 'node:crypto'
import {
  custom,
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

export class OpenCodeAguiConverter {
  constructor({ threadId, runId, sessionId }) {
    this.threadId = threadId
    this.runId = runId
    this.sessionId = sessionId
    this.messageIds = new Map()
    this.partIds = new Map()
    this.toolIds = new Map()
    this.openText = new Set()
    this.openReasoning = new Set()
    this.openTools = new Set()
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

    if (type === 'message.part.delta') {
      const field = raw.field ?? 'text'
      const delta = asText(raw.delta ?? raw.value)
      if (!delta) return []
      const messageId = this.partMessageId(raw)
      if (field === 'reasoning') return this.reasoningDelta(messageId, delta)
      if (field !== 'text') return []
      const events = []
      if (!this.openText.has(messageId)) {
        this.openText.add(messageId)
        events.push(textStart(messageId))
      }
      events.push(textContent(messageId, delta))
      return events
    }

    if (type === 'TEXT_MESSAGE_CONTENT') {
      const delta = asText(raw.delta ?? raw.text ?? raw.content)
      if (!delta) return []
      const messageId = this.partMessageId(raw)
      const events = []
      if (!this.openText.has(messageId)) {
        this.openText.add(messageId)
        events.push(textStart(messageId))
      }
      events.push(textContent(messageId, delta))
      return events
    }

    if (type === 'session.error') return this.fail(asText(raw.error?.message ?? raw.message ?? raw.error ?? 'OpenCode run failed'))
    if (type === 'session.idle' || (type === 'session.status' && (raw.status?.type ?? raw.status) === 'idle')) return this.finish()
    if (type === 'step-start' || type === 'step.started') return [event('STEP_STARTED', { stepName: raw.name ?? raw.title ?? 'OpenCode step' })]
    if (type === 'step-finish' || type === 'step.finished') return [event('STEP_FINISHED', { stepName: raw.name ?? raw.title ?? 'OpenCode step' })]
    return []
  }

  convertPart(part) {
    const kind = part.type ?? part.kind
    const messageId = this.partMessageId(part)
    if (kind === 'text') {
      const delta = asText(part.delta ?? part.text ?? part.content)
      const events = []
      if (!this.openText.has(messageId)) {
        this.openText.add(messageId)
        events.push(textStart(messageId))
      }
      if (delta) events.push(textContent(messageId, delta))
      if (part.time?.end || part.done || part.status === 'completed') {
        events.push(textEnd(messageId))
        this.openText.delete(messageId)
      }
      return events
    }

    if (kind === 'reasoning') {
      const events = this.reasoningDelta(messageId, asText(part.delta ?? part.text ?? part.content))
      if (part.time?.end || part.done || part.status === 'completed') events.push(...this.closeReasoning(messageId))
      return events
    }

    if (kind === 'tool' || kind === 'tool-invocation') return this.convertTool(part, messageId)
    if (kind === 'subtask') return [custom('subagent.started', {
      agentId: part.id ?? part.partID,
      name: part.name ?? part.agent ?? 'Sub Agent',
      task: part.prompt ?? part.description ?? '',
      status: 'running',
    })]
    return []
  }

  reasoningDelta(messageId, delta) {
    const events = []
    if (!this.openReasoning.has(messageId)) {
      this.openReasoning.add(messageId)
      events.push(event('REASONING_START', {}), event('REASONING_MESSAGE_START', { messageId, role: 'assistant' }))
    }
    if (delta) events.push(event('REASONING_MESSAGE_CONTENT', { messageId, delta }))
    return events
  }

  closeReasoning(messageId) {
    if (!this.openReasoning.delete(messageId)) return []
    return [event('REASONING_MESSAGE_END', { messageId }), event('REASONING_END', {})]
  }

  convertTool(part, parentMessageId) {
    const state = part.state ?? part.status ?? {}
    const status = typeof state === 'string' ? state : state.status
    const rawToolId = part.callID ?? part.callId ?? part.id ?? part.partID
    const toolCallId = idOf(rawToolId, `tool-${randomUUID()}`)
    this.toolIds.set(rawToolId, toolCallId)
    const name = part.tool ?? part.name ?? 'tool'
    const events = []
    if (!this.openTools.has(toolCallId) && ['pending', 'running', 'completed', 'success'].includes(status)) {
      this.openTools.add(toolCallId)
      events.push(toolStart(toolCallId, name, parentMessageId))
      const input = state.input ?? part.input ?? state.args ?? part.args
      if (input != null) events.push(toolArgs(toolCallId, asText(input)))
    }
    if (status === 'running' && (name === 'task' || part.type === 'subtask')) {
      events.push(custom('subagent.progress', {
        agentId: rawToolId,
        name: part.metadata?.agent ?? part.agent ?? 'Sub Agent',
        progress: part.metadata?.progress ?? 50,
        step: part.metadata?.step ?? 'Working',
        status: 'running',
      }))
    }
    if (['completed', 'success', 'error', 'failed'].includes(status)) {
      if (this.openTools.delete(toolCallId)) events.push(toolEnd(toolCallId))
      const output = state.output ?? state.result ?? part.output ?? state.error ?? ''
      events.push(toolResult(`result-${toolCallId}`, toolCallId, asText(output)))
      if (name === 'task' || part.type === 'subtask') {
        events.push(custom(status === 'error' || status === 'failed' ? 'subagent.failed' : 'subagent.completed', {
          agentId: rawToolId,
          name: part.metadata?.agent ?? part.agent ?? 'Sub Agent',
          status: status === 'error' || status === 'failed' ? 'failed' : 'completed',
          summary: asText(output),
          duration: part.time?.end && part.time?.start ? part.time.end - part.time.start : undefined,
        }))
      }
    }
    return events
  }

  closeOpenEvents() {
    const events = []
    for (const messageId of this.openText) events.push(textEnd(messageId))
    for (const messageId of this.openReasoning) events.push(...this.closeReasoning(messageId))
    for (const toolCallId of this.openTools) events.push(toolEnd(toolCallId))
    this.openText.clear()
    this.openTools.clear()
    return events
  }

  finish() {
    if (this.finished) return []
    this.finished = true
    return [...this.closeOpenEvents(), runFinished(this.threadId, this.runId)]
  }

  fail(message) {
    if (this.finished) return []
    this.finished = true
    return [...this.closeOpenEvents(), runError(message)]
  }
}

