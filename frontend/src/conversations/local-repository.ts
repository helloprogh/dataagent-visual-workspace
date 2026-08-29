import type { Interrupt, Message, State } from '@ag-ui/client'
import type { ConversationRecord, ConversationRepository, ConversationSessionSummary } from './types'

const LEGACY_STORAGE_KEY = 'dataagent.conversations.v3.session-thread'
const TITLE_OVERRIDES_KEY = 'dataagent.conversations.title-overrides.v1'
const DEFAULT_NAME = '新需求'
const GENERIC_NAMES = new Set([DEFAULT_NAME, '新对话', '新分析', 'AG-UI session'])

let records: ConversationRecord[] = []

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function isGenericName(value: string): boolean {
  return GENERIC_NAMES.has(value) || /^New session\s*-/i.test(value)
}

function readTitleOverrides(): Record<string, string> {
  try {
    const raw = localStorage.getItem(TITLE_OVERRIDES_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => (
        typeof entry[0] === 'string' && typeof entry[1] === 'string' && Boolean(entry[1].trim())
      )),
    )
  } catch {
    return {}
  }
}

function writeTitleOverrides(overrides: Record<string, string>) {
  try {
    if (Object.keys(overrides).length === 0) {
      localStorage.removeItem(TITLE_OVERRIDES_KEY)
      return
    }
    localStorage.setItem(TITLE_OVERRIDES_KEY, JSON.stringify(overrides))
  } catch {
    // Title overrides are optional UI preferences. Never fail conversation flows
    // because browser storage is unavailable or full.
  }
}

function purgeLegacyConversationCache() {
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY)
  } catch {
    // The application can operate without browser storage.
  }
}

purgeLegacyConversationCache()

export function compactReasoningMessages(messages: Message[]): Message[] {
  return messages.filter(message => {
    if (message.role !== 'reasoning') return true
    return typeof message.content === 'string' && message.content.trim().length > 0
  })
}

function readAll(): ConversationRecord[] {
  return clone(records)
}

function writeAll(next: ConversationRecord[]) {
  records = clone(next)
}

export class LocalConversationRepository implements ConversationRepository {
  list(): ConversationRecord[] {
    return readAll().sort((a, b) => b.updatedAt - a.updatedAt)
  }

  get(id: string): ConversationRecord | undefined {
    const found = records.find(item => item.id === id)
    return found ? clone({ ...found, messages: compactReasoningMessages(found.messages) }) : undefined
  }

  create(id: string, displayName = DEFAULT_NAME): ConversationRecord {
    const sessionId = id.trim()
    if (!sessionId) throw new Error('sessionId is required')
    const existing = records.find(item => item.id === sessionId)
    if (existing) return clone(existing)

    const now = Date.now()
    const record: ConversationRecord = {
      id: sessionId,
      displayName,
      messages: [],
      state: {},
      createdAt: now,
      updatedAt: now,
    }
    records.unshift(record)
    return clone(record)
  }

  syncSessions(sessions: ConversationSessionSummary[]): void {
    const existing = new Map(records.map(item => [item.id, item]))
    const titleOverrides = readTitleOverrides()
    const sessionIds = new Set(sessions.map(item => item.id))

    records = sessions.map(session => {
      const current = existing.get(session.id)
      const remoteName = session.displayName.trim() || DEFAULT_NAME
      const override = titleOverrides[session.id]?.trim()
      const keepTransientName = current
        && !isGenericName(current.displayName)
        && isGenericName(remoteName)

      return {
        id: session.id,
        ...(session.parentId ? { parentId: session.parentId } : {}),
        ...(session.archivedAt != null ? { archivedAt: session.archivedAt } : {}),
        displayName: override || (keepTransientName ? current.displayName : remoteName),
        messages: current?.messages ?? [],
        state: current?.state ?? {},
        ...(current?.pendingInterrupts ? { pendingInterrupts: current.pendingInterrupts } : {}),
        createdAt: session.createdAt,
        updatedAt: Math.max(session.updatedAt, current?.updatedAt ?? 0),
      }
    })

    const cleanedOverrides = Object.fromEntries(
      Object.entries(titleOverrides).filter(([id]) => sessionIds.has(id)),
    )
    if (Object.keys(cleanedOverrides).length !== Object.keys(titleOverrides).length) {
      writeTitleOverrides(cleanedOverrides)
    }
  }

  rename(id: string, displayName: string): void {
    const name = displayName.trim() || DEFAULT_NAME
    const item = records.find(record => record.id === id)
    if (!item) return
    item.displayName = name

    const overrides = readTitleOverrides()
    overrides[id] = name
    writeTitleOverrides(overrides)
  }

  saveSnapshot(id: string, messages: Message[], state: State): void {
    const item = records.find(record => record.id === id)
    if (!item) return
    item.messages = clone(compactReasoningMessages(messages))
    item.state = clone(state)
    item.updatedAt = Date.now()
  }

  saveHydratedMessages(id: string, messages: Message[]): void {
    const item = records.find(record => record.id === id)
    if (!item) return
    item.messages = clone(compactReasoningMessages(messages))
  }

  saveInterrupts(id: string, interrupts: Interrupt[]): void {
    const item = records.find(record => record.id === id)
    if (!item) return
    item.pendingInterrupts = clone(interrupts)
    item.updatedAt = Date.now()
  }

  remove(id: string): void {
    records = records.filter(record => record.id !== id)
  }
}

export const conversationRepository = new LocalConversationRepository()

export function deriveConversationName(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (!normalized) return DEFAULT_NAME
  return normalized.length > 28 ? `${normalized.slice(0, 28)}…` : normalized
}
