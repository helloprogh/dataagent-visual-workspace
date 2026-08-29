import type { Message } from '@ag-ui/client'
import { dataAgentWebApi } from '../config/api'
import type { ConversationSessionSummary } from './types'

type UnknownRecord = Record<string, unknown>

export type RemoteConversationSession = ConversationSessionSummary

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function stringValue(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function timestamp(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 0 && value < 10_000_000_000 ? value * 1000 : value
  }
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value)
    if (Number.isFinite(numeric)) return timestamp(numeric, fallback)
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function applicationError(body: unknown, action: string): Error | undefined {
  if (!isRecord(body) || body.code == null) return undefined
  if (['0', '200', '20000'].includes(String(body.code))) return undefined
  const detail = stringValue(body.message, isRecord(body.error) ? body.error.message : body.error)
  return new Error(`${action}${detail ? `：${detail}` : ''}`)
}

function arrayPayload(body: unknown, action: string): unknown[] {
  let current = body
  for (let depth = 0; depth < 5; depth += 1) {
    if (Array.isArray(current)) return current
    if (!isRecord(current)) break
    const error = applicationError(current, action)
    if (error) throw error
    for (const key of ['items', 'sessions', 'messages']) {
      if (Array.isArray(current[key])) return current[key]
    }
    if (!('data' in current)) break
    current = current.data
  }
  throw new Error(`${action}：接口未返回数组`)
}

async function requestJson(url: string, action: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
    cache: 'no-store',
    signal,
  })
  if (!response.ok) {
    let detail = ''
    try {
      const body = await response.json()
      detail = stringValue(body?.message, body?.error?.message, body?.error)
    } catch {
      detail = await response.text().catch(() => '')
    }
    throw new Error(`${action} (${response.status})${detail ? `：${detail}` : ''}`)
  }
  return response.json()
}

function normalizeSession(value: unknown): RemoteConversationSession | undefined {
  if (!isRecord(value)) return undefined
  const id = stringValue(value.id, value.sessionID, value.sessionId)
  if (!id) return undefined
  const parentId = stringValue(value.parentID, value.parentId, value.parentSessionID, value.parentSessionId)
  const now = Date.now()
  const time = isRecord(value.time) ? value.time : {}
  const createdAt = timestamp(value.createdAt ?? time.created, now)
  const updatedAt = timestamp(value.updatedAt ?? time.updated, createdAt)
  return {
    id,
    ...(parentId ? { parentId } : {}),
    displayName: stringValue(value.title, value.displayName, value.name) || '新需求',
    createdAt,
    updatedAt,
  }
}

function textOf(value: unknown): string {
  if (typeof value === 'string') return value
  if (value == null) return ''
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function partType(part: UnknownRecord): string {
  return stringValue(part.type, part.kind).toLowerCase()
}

function partText(part: UnknownRecord): string {
  return textOf(part.text ?? part.content ?? part.delta)
}

function fileContent(part: UnknownRecord): UnknownRecord | undefined {
  const source = isRecord(part.source) ? part.source : {}
  const file = isRecord(part.file) ? part.file : {}
  const mimeType = stringValue(part.mime, part.mimeType, source.mimeType, file.mimeType) || 'application/octet-stream'
  const filename = stringValue(part.filename, part.name, source.filename, file.filename)
  const url = stringValue(part.url, source.url, source.value, file.url)
  const data = stringValue(part.data, source.data, file.data)
  const metadata = filename ? { filename } : undefined

  if (url) {
    const type = mimeType.startsWith('image/')
      ? 'image'
      : mimeType.startsWith('audio/')
        ? 'audio'
        : mimeType.startsWith('video/')
          ? 'video'
          : 'document'
    return {
      type,
      source: { type: 'url', value: url, mimeType },
      ...(metadata ? { metadata } : {}),
    }
  }
  if (data) return { type: 'binary', mimeType, data, ...(filename ? { filename } : {}) }
  return filename ? { type: 'text', text: `[附件：${filename}]` } : undefined
}

function userMessage(id: string, parts: UnknownRecord[]): Message {
  const content: UnknownRecord[] = []
  for (const part of parts) {
    const type = partType(part)
    if (type === 'text') {
      const text = partText(part)
      if (text) content.push({ type: 'text', text })
      continue
    }
    if (type === 'file' || type === 'image' || type === 'audio' || type === 'video') {
      const file = fileContent(part)
      if (file) content.push(file)
    }
  }
  if (!content.some(part => part.type !== 'text')) {
    return { id, role: 'user', content: content.map(part => String(part.text ?? '')).join('\n') } as Message
  }
  return { id, role: 'user', content } as Message
}

function toolCall(part: UnknownRecord, fallbackId: string) {
  const state = isRecord(part.state) ? part.state : {}
  const id = stringValue(part.callID, part.callId, part.id, part.partID, part.partId) || fallbackId
  const name = stringValue(part.tool, part.name) || 'tool'
  const input = state.input ?? part.input ?? part.args ?? {}
  return {
    id,
    call: {
      id,
      type: 'function' as const,
      function: { name, arguments: textOf(input) },
    },
    state,
  }
}

function assistantMessages(id: string, parts: UnknownRecord[]): Message[] {
  const reasoning = parts
    .filter(part => partType(part) === 'reasoning')
    .map(partText)
    .filter(Boolean)
    .join('\n')
  const content = parts
    .filter(part => partType(part) === 'text')
    .map(partText)
    .filter(Boolean)
    .join('\n')
  const tools = parts
    .filter(part => ['tool', 'tool-invocation'].includes(partType(part)))
    .map((part, index) => toolCall(part, `${id}-tool-${index}`))

  const result: Message[] = []
  if (reasoning) result.push({ id: `${id}-reasoning`, role: 'reasoning', content: reasoning } as Message)
  if (content || tools.length) {
    result.push({
      id,
      role: 'assistant',
      content,
      ...(tools.length ? { toolCalls: tools.map(item => item.call) } : {}),
    } as Message)
  }

  for (const tool of tools) {
    const status = stringValue(tool.state.status).toLowerCase()
    const output = tool.state.output ?? tool.state.result
    const failure = tool.state.error
    if (!['completed', 'success', 'error', 'failed'].includes(status) && output == null && failure == null) continue
    result.push({
      id: `${tool.id}-result`,
      role: 'tool',
      toolCallId: tool.id,
      content: textOf(output ?? failure),
      ...(failure != null ? { error: textOf(failure) } : {}),
    } as Message)
  }
  return result
}

function normalizeMessage(value: unknown, index: number): Message[] {
  if (!isRecord(value)) return []
  const info = isRecord(value.info) ? value.info : value
  const parts = (Array.isArray(value.parts) ? value.parts : [])
    .filter(isRecord)
  const id = stringValue(info.id, info.messageID, info.messageId, value.id) || `history-message-${index}`
  const role = stringValue(info.role, value.role).toLowerCase()

  if (role === 'user') return [userMessage(id, parts)]
  if (role === 'assistant') return assistantMessages(id, parts)
  if (role === 'system' || role === 'developer') {
    const content = parts.filter(part => partType(part) === 'text').map(partText).filter(Boolean).join('\n')
    return content ? [{ id, role, content } as Message] : []
  }
  return []
}

export async function fetchConversationSessions(signal?: AbortSignal): Promise<RemoteConversationSession[]> {
  const body = await requestJson(dataAgentWebApi('/session'), '查询对话列表失败', signal)
  return arrayPayload(body, '查询对话列表失败')
    .map(normalizeSession)
    .filter((item): item is RemoteConversationSession => Boolean(item))
    .sort((left, right) => right.updatedAt - left.updatedAt)
}

export async function fetchConversationMessages(sessionId: string, signal?: AbortSignal): Promise<Message[]> {
  const id = sessionId.trim()
  if (!id) throw new Error('查询历史消息失败：sessionId 为空')
  const body = await requestJson(
    dataAgentWebApi(`/session/${encodeURIComponent(id)}/message`),
    '查询历史消息失败',
    signal,
  )
  return arrayPayload(body, '查询历史消息失败').flatMap(normalizeMessage)
}
