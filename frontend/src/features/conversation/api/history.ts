import type { Message } from '@ag-ui/client'
import { dataAgentWebApi } from '../../../shared/config/api'
import { requestJson } from '../../../shared/api/http'
import type { ConversationSession } from '../types'

type UnknownRecord = Record<string, unknown>
type SortOrder = 'asc' | 'desc'

type V2Page = {
  data: unknown[]
  cursor: { previous?: string; next?: string }
}

const SESSION_PAGE_LIMIT = 200
const MESSAGE_PAGE_LIMIT = 100

export type ConversationMessagePage = {
  messages: Message[]
  nextCursor?: string
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  return value.trim() || undefined
}

function requiredString(value: unknown, field: string, action: string): string {
  const result = optionalString(value)
  if (!result) throw new Error(`${action}：${field} 缺失`)
  return result
}

function requiredText(value: unknown, field: string, action: string): string {
  if (typeof value !== 'string') throw new Error(`${action}：${field} 不是字符串`)
  return value
}

function timestamp(value: unknown, field: string, action: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${action}：${field} 无效`)
  return value
}

function textOf(value: unknown): string {
  if (typeof value === 'string') return value
  if (value == null) return ''
  try { return JSON.stringify(value) } catch { return String(value) }
}

function appendQuery(url: string, params: Record<string, string | number | undefined>) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value != null) query.set(key, String(value))
  })
  return query.size ? `${url}?${query.toString()}` : url
}

function parsePage(body: unknown, action: string): V2Page {
  if (!isRecord(body) || !Array.isArray(body.data) || !isRecord(body.cursor)) {
    throw new Error(`${action}：接口返回不是 OpenCode V2 { data, cursor }`)
  }
  return {
    data: body.data,
    cursor: {
      ...(optionalString(body.cursor.previous) ? { previous: optionalString(body.cursor.previous) } : {}),
      ...(optionalString(body.cursor.next) ? { next: optionalString(body.cursor.next) } : {}),
    },
  }
}

async function fetchAllPages(path: string, order: SortOrder, limit: number, signal?: AbortSignal) {
  const result: unknown[] = []
  const seen = new Set<string>()
  let cursor: string | undefined
  for (;;) {
    if (cursor) {
      if (seen.has(cursor)) throw new Error('OpenCode V2 返回重复 cursor')
      seen.add(cursor)
    }
    const url = appendQuery(dataAgentWebApi(path), cursor ? { limit, cursor } : { limit, order })
    const page = parsePage(await requestJson(url, { signal }, '查询数据失败'), '查询数据失败')
    result.push(...page.data)
    if (page.data.length < limit || !page.cursor.next) return result
    cursor = page.cursor.next
  }
}

function normalizeSession(value: unknown): ConversationSession {
  if (!isRecord(value) || !isRecord(value.time)) throw new Error('OpenCode Session.Info 无效')
  const id = requiredString(value.id, 'session.id', '解析会话失败')
  const parentId = optionalString(value.parentID)
  const archivedAt = value.time.archived == null ? undefined : timestamp(value.time.archived, 'time.archived', '解析会话失败')
  return {
    id,
    displayName: optionalString(value.title) ?? '新需求',
    createdAt: timestamp(value.time.created, 'time.created', '解析会话失败'),
    updatedAt: timestamp(value.time.updated, 'time.updated', '解析会话失败'),
    ...(parentId ? { parentId } : {}),
    ...(archivedAt != null ? { archivedAt } : {}),
  }
}

function normalizeFile(value: unknown, messageId: string): UnknownRecord {
  if (!isRecord(value)) throw new Error(`消息 ${messageId} 的附件无效`)
  const uri = requiredString(value.uri, 'file.uri', '解析附件失败')
  const mimeType = requiredString(value.mime, 'file.mime', '解析附件失败')
  const filename = optionalString(value.name)
  const type = mimeType.startsWith('image/') ? 'image'
    : mimeType.startsWith('audio/') ? 'audio'
      : mimeType.startsWith('video/') ? 'video'
        : 'document'
  return {
    type,
    source: { type: 'url', value: uri, mimeType },
    ...(filename ? { metadata: { filename } } : {}),
  }
}

function normalizeUser(value: UnknownRecord, id: string): Message {
  const text = requiredText(value.text, 'user.text', `解析消息 ${id} 失败`)
  const files = value.files == null ? [] : Array.isArray(value.files) ? value.files : []
  if (!files.length) return { id, role: 'user', content: text } as Message
  const content: UnknownRecord[] = []
  if (text) content.push({ type: 'text', text })
  files.forEach(file => content.push(normalizeFile(file, id)))
  return { id, role: 'user', content } as Message
}

function toolResultText(state: UnknownRecord) {
  if (state.result != null) return textOf(state.result)
  if (state.structured != null) return textOf(state.structured)
  if (state.content != null) return textOf(state.content)
  return ''
}

function toolErrorText(state: UnknownRecord) {
  if (isRecord(state.error) && typeof state.error.message === 'string') return state.error.message
  return textOf(state.error)
}

function normalizeAssistant(value: UnknownRecord, id: string): Message[] {
  if (!Array.isArray(value.content)) throw new Error(`assistant ${id}.content 无效`)
  const parts = value.content.filter(isRecord)
  const reasoning = parts
    .filter(part => part.type === 'reasoning')
    .map(part => requiredText(part.text, 'reasoning.text', `解析 assistant ${id} 失败`))
    .filter(Boolean)
    .join('\n')
  const text = parts
    .filter(part => part.type === 'text')
    .map(part => requiredText(part.text, 'text.text', `解析 assistant ${id} 失败`))
    .filter(Boolean)
    .join('\n')
  const tools = parts
    .filter(part => part.type === 'tool')
    .map(part => {
      const state = isRecord(part.state) ? part.state : {}
      const toolId = requiredString(part.id, 'tool.id', `解析 assistant ${id} tool 失败`)
      const name = requiredString(part.name, 'tool.name', `解析 assistant ${id} tool 失败`)
      return {
        id: toolId,
        state,
        call: {
          id: toolId,
          type: 'function' as const,
          function: { name, arguments: textOf(state.input ?? {}) },
        },
      }
    })

  const result: Message[] = []
  if (reasoning) result.push({ id: `${id}-reasoning`, role: 'reasoning', content: reasoning } as Message)
  if (text || tools.length) {
    result.push({
      id,
      role: 'assistant',
      content: text,
      ...(tools.length ? { toolCalls: tools.map(tool => tool.call) } : {}),
    } as Message)
  }
  for (const tool of tools) {
    const status = optionalString(tool.state.status)
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

function normalizeMessage(value: unknown): Message[] {
  if (!isRecord(value)) return []
  const id = requiredString(value.id, 'message.id', '解析历史消息失败')
  const type = requiredString(value.type, 'message.type', '解析历史消息失败')
  if (type === 'user') return [normalizeUser(value, id)]
  if (type === 'assistant') return normalizeAssistant(value, id)
  return []
}

export async function fetchConversationSessions(signal?: AbortSignal): Promise<ConversationSession[]> {
  const sessions = await fetchAllPages('/session', 'desc', SESSION_PAGE_LIMIT, signal)
  return sessions
    .map(normalizeSession)
    .sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt)
}

export async function fetchConversationMessagePage(
  sessionId: string,
  cursor?: string,
  signal?: AbortSignal,
): Promise<ConversationMessagePage> {
  const id = sessionId.trim()
  if (!id) throw new Error('sessionId 不能为空')
  const path = `/session/${encodeURIComponent(id)}/message`
  let pageCursor = optionalString(cursor)
  const seen = new Set<string>()

  for (;;) {
    if (pageCursor) {
      if (seen.has(pageCursor)) throw new Error('OpenCode V2 返回重复 cursor')
      seen.add(pageCursor)
    }
    const url = appendQuery(dataAgentWebApi(path), pageCursor
      ? { limit: MESSAGE_PAGE_LIMIT, cursor: pageCursor }
      : { limit: MESSAGE_PAGE_LIMIT, order: 'desc' })
    const page = parsePage(await requestJson(url, { signal }, '查询历史消息失败'), '查询历史消息失败')
    const messages = [...page.data].reverse().flatMap(normalizeMessage)
    const nextCursor = page.data.length === MESSAGE_PAGE_LIMIT ? optionalString(page.cursor.next) : undefined
    if (messages.length || !nextCursor) return { messages, ...(nextCursor ? { nextCursor } : {}) }
    pageCursor = nextCursor
  }
}
