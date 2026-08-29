import type { Message } from '@ag-ui/client'
import { dataAgentWebApi } from '../config/api'
import type { ConversationSessionSummary } from './types'

type UnknownRecord = Record<string, unknown>
type SortOrder = 'asc' | 'desc'

type V2Page = {
  data: unknown[]
  cursor: {
    previous?: string
    next?: string
  }
}

type NormalizedTool = {
  id: string
  call: {
    id: string
    type: 'function'
    function: {
      name: string
      arguments: string
    }
  }
  state: UnknownRecord
}

const SESSION_PAGE_LIMIT = 200
const MESSAGE_PAGE_LIMIT = 200

export type RemoteConversationSession = ConversationSessionSummary

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized || undefined
}

function requiredString(value: unknown, field: string, action: string): string {
  const normalized = optionalString(value)
  if (!normalized) throw new Error(`${action}：OpenCode V2 ${field} 缺失`)
  return normalized
}

function requiredText(value: unknown, field: string, action: string): string {
  if (typeof value !== 'string') throw new Error(`${action}：OpenCode V2 ${field} 不是字符串`)
  return value
}

function requiredTimestamp(value: unknown, field: string, action: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${action}：OpenCode V2 ${field} 不是有效时间戳`)
  }
  return value
}

function optionalTimestamp(value: unknown, field: string, action: string): number | undefined {
  if (value == null) return undefined
  return requiredTimestamp(value, field, action)
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

function appendQuery(url: string, params: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value != null) query.set(key, String(value))
  }
  const suffix = query.toString()
  if (!suffix) return url
  return `${url}${url.includes('?') ? '&' : '?'}${suffix}`
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
      const error = isRecord(body?.error) ? body.error.message : body?.error
      detail = optionalString(body?.message) ?? optionalString(error) ?? ''
    } catch {
      detail = await response.text().catch(() => '')
    }
    throw new Error(`${action} (${response.status})${detail ? `：${detail}` : ''}`)
  }
  return response.json()
}

function parseV2Page(body: unknown, action: string): V2Page {
  if (!isRecord(body) || !Array.isArray(body.data) || !isRecord(body.cursor)) {
    throw new Error(`${action}：接口返回不是 OpenCode V2 { data, cursor } 结构`)
  }
  return {
    data: body.data,
    cursor: {
      ...(optionalString(body.cursor.previous) ? { previous: optionalString(body.cursor.previous) } : {}),
      ...(optionalString(body.cursor.next) ? { next: optionalString(body.cursor.next) } : {}),
    },
  }
}

async function fetchAllV2Pages(
  path: string,
  action: string,
  options: { order: SortOrder; limit: number },
  signal?: AbortSignal,
): Promise<unknown[]> {
  const items: unknown[] = []
  const seenCursors = new Set<string>()
  let cursor: string | undefined

  for (;;) {
    if (cursor) {
      if (seenCursors.has(cursor)) throw new Error(`${action}：OpenCode V2 返回了重复 cursor`)
      seenCursors.add(cursor)
    }

    const url = appendQuery(dataAgentWebApi(path), cursor
      ? { limit: options.limit, cursor }
      : { limit: options.limit, order: options.order })
    const page = parseV2Page(await requestJson(url, action, signal), action)
    items.push(...page.data)

    if (page.data.length < options.limit || !page.cursor.next) return items
    cursor = page.cursor.next
  }
}

function normalizeSession(value: unknown, index: number): RemoteConversationSession {
  const action = `解析第 ${index + 1} 个会话失败`
  if (!isRecord(value)) throw new Error(`${action}：OpenCode V2 Session.Info 不是对象`)
  if (!isRecord(value.time)) throw new Error(`${action}：OpenCode V2 time 缺失`)

  const id = requiredString(value.id, 'session.id', action)
  const parentId = optionalString(value.parentID)
  const archivedAt = optionalTimestamp(value.time.archived, 'session.time.archived', action)
  const title = requiredText(value.title, 'session.title', action).trim() || '新需求'

  return {
    id,
    ...(parentId ? { parentId } : {}),
    ...(archivedAt != null ? { archivedAt } : {}),
    displayName: title,
    createdAt: requiredTimestamp(value.time.created, 'session.time.created', action),
    updatedAt: requiredTimestamp(value.time.updated, 'session.time.updated', action),
  }
}

function userFileContent(value: unknown, messageId: string, index: number): UnknownRecord {
  const action = `解析用户消息 ${messageId} 的第 ${index + 1} 个附件失败`
  if (!isRecord(value)) throw new Error(`${action}：OpenCode V2 FileAttachment 不是对象`)

  const uri = requiredString(value.uri, 'file.uri', action)
  const mimeType = requiredString(value.mime, 'file.mime', action)
  const filename = optionalString(value.name)
  const type = mimeType.startsWith('image/')
    ? 'image'
    : mimeType.startsWith('audio/')
      ? 'audio'
      : mimeType.startsWith('video/')
        ? 'video'
        : 'document'

  return {
    type,
    source: { type: 'url', value: uri, mimeType },
    ...(filename ? { metadata: { filename } } : {}),
  }
}

function normalizeUserMessage(value: UnknownRecord, id: string): Message {
  const text = requiredText(value.text, 'user.text', `解析用户消息 ${id} 失败`)
  const files = value.files == null
    ? []
    : Array.isArray(value.files)
      ? value.files
      : (() => { throw new Error(`解析用户消息 ${id} 失败：OpenCode V2 user.files 不是数组`) })()

  if (!files.length) return { id, role: 'user', content: text } as Message

  const content: UnknownRecord[] = []
  if (text) content.push({ type: 'text', text })
  files.forEach((file, index) => content.push(userFileContent(file, id, index)))
  return { id, role: 'user', content } as Message
}

function normalizeTool(part: UnknownRecord, messageId: string, index: number): NormalizedTool {
  const action = `解析 assistant ${messageId} 的第 ${index + 1} 个 tool 失败`
  const state = isRecord(part.state) ? part.state : (() => { throw new Error(`${action}：OpenCode V2 tool.state 缺失`) })()
  const id = requiredString(part.id, 'tool.id', action)
  const name = requiredString(part.name, 'tool.name', action)
  requiredString(state.status, 'tool.state.status', action)

  return {
    id,
    call: {
      id,
      type: 'function',
      function: {
        name,
        arguments: textOf(state.input ?? {}),
      },
    },
    state,
  }
}

function toolErrorText(state: UnknownRecord): string {
  const error = state.error
  if (isRecord(error) && typeof error.message === 'string') return error.message
  return textOf(error)
}

function toolResultText(state: UnknownRecord): string {
  if (state.result != null) return textOf(state.result)
  if (state.structured != null) return textOf(state.structured)
  if (state.content != null) return textOf(state.content)
  return ''
}

function normalizeAssistantMessages(value: UnknownRecord, id: string): Message[] {
  if (!Array.isArray(value.content)) {
    throw new Error(`解析 assistant ${id} 失败：OpenCode V2 assistant.content 不是数组`)
  }

  const parts = value.content.map((part, index) => {
    if (!isRecord(part)) throw new Error(`解析 assistant ${id} 失败：content[${index}] 不是对象`)
    return part
  })
  const reasoning = parts
    .filter(part => part.type === 'reasoning')
    .map(part => requiredText(part.text, 'reasoning.text', `解析 assistant ${id} 失败`))
    .filter(Boolean)
    .join('\n')
  const content = parts
    .filter(part => part.type === 'text')
    .map(part => requiredText(part.text, 'text.text', `解析 assistant ${id} 失败`))
    .filter(Boolean)
    .join('\n')
  const tools = parts
    .filter(part => part.type === 'tool')
    .map((part, index) => normalizeTool(part, id, index))
  const topLevelError = isRecord(value.error) && typeof value.error.message === 'string'
    ? value.error.message
    : ''

  const result: Message[] = []
  if (reasoning) result.push({ id: `${id}-reasoning`, role: 'reasoning', content: reasoning } as Message)
  if (content || tools.length || topLevelError) {
    result.push({
      id,
      role: 'assistant',
      content: content || topLevelError,
      ...(tools.length ? { toolCalls: tools.map(item => item.call) } : {}),
      ...(topLevelError ? { error: topLevelError } : {}),
    } as Message)
  }

  for (const tool of tools) {
    const status = requiredString(tool.state.status, 'tool.state.status', `解析 tool ${tool.id} 失败`)
    if (status !== 'completed' && status !== 'error') continue
    const error = status === 'error' ? toolErrorText(tool.state) : ''
    result.push({
      id: `${tool.id}-result`,
      role: 'tool',
      toolCallId: tool.id,
      content: error || toolResultText(tool.state),
      ...(error ? { error } : {}),
    } as Message)
  }

  return result
}

function normalizeMessage(value: unknown, index: number): Message[] {
  const action = `解析第 ${index + 1} 个历史消息失败`
  if (!isRecord(value)) throw new Error(`${action}：OpenCode V2 SessionMessage 不是对象`)

  const id = requiredString(value.id, 'message.id', action)
  const type = requiredString(value.type, 'message.type', action)

  if (type === 'user') return [normalizeUserMessage(value, id)]
  if (type === 'assistant') return normalizeAssistantMessages(value, id)

  // OpenCode V2 also projects system/synthetic/shell/compaction/switch events.
  // They belong to the session timeline rather than the user-facing chat history.
  return []
}

export async function fetchConversationSessions(signal?: AbortSignal): Promise<RemoteConversationSession[]> {
  const sessions = await fetchAllV2Pages(
    '/session',
    '查询对话列表失败',
    { order: 'desc', limit: SESSION_PAGE_LIMIT },
    signal,
  )

  // OpenCode V2 pages by creation time. Fetch every page first, then order the
  // complete set by remote activity time so an old session updated today is not lost.
  return sessions
    .map(normalizeSession)
    .sort((left, right) => right.updatedAt - left.updatedAt || right.createdAt - left.createdAt)
}

export async function fetchConversationMessages(sessionId: string, signal?: AbortSignal): Promise<Message[]> {
  const id = sessionId.trim()
  if (!id) throw new Error('查询历史消息失败：sessionId 为空')

  const messages = await fetchAllV2Pages(
    `/session/${encodeURIComponent(id)}/message`,
    '查询历史消息失败',
    { order: 'asc', limit: MESSAGE_PAGE_LIMIT },
    signal,
  )
  return messages.flatMap(normalizeMessage)
}
