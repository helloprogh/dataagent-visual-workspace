import type { Message, State } from '@ag-ui/client'
import type { ConversationRecord, ConversationRepository } from './types'

const STORAGE_KEY = 'dataagent.conversations.v1'
const DEFAULT_NAME = '新对话'
const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function createThreadId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(26))
  const suffix = Array.from(bytes, value => ALPHABET[value % ALPHABET.length]).join('')
  return `thread-${suffix}`
}

function readAll(): ConversationRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as ConversationRecord[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeAll(records: ConversationRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
}

export class LocalConversationRepository implements ConversationRepository {
  list(): ConversationRecord[] {
    return readAll().sort((a, b) => b.updatedAt - a.updatedAt)
  }

  get(id: string): ConversationRecord | undefined {
    const found = readAll().find(item => item.id === id)
    return found ? clone(found) : undefined
  }

  create(displayName = DEFAULT_NAME): ConversationRecord {
    const now = Date.now()
    const record: ConversationRecord = {
      id: createThreadId(),
      displayName,
      messages: [],
      state: {},
      createdAt: now,
      updatedAt: now,
    }
    const all = readAll()
    all.unshift(record)
    writeAll(all)
    return clone(record)
  }

  rename(id: string, displayName: string): void {
    const name = displayName.trim() || DEFAULT_NAME
    const all = readAll()
    const item = all.find(record => record.id === id)
    if (!item) return
    item.displayName = name
    item.updatedAt = Date.now()
    writeAll(all)
  }

  saveSnapshot(id: string, messages: Message[], state: State): void {
    const all = readAll()
    const item = all.find(record => record.id === id)
    if (!item) return
    item.messages = clone(messages)
    item.state = clone(state)
    item.updatedAt = Date.now()
    writeAll(all)
  }

  remove(id: string): void {
    writeAll(readAll().filter(record => record.id !== id))
  }
}

export const conversationRepository = new LocalConversationRepository()

export function deriveConversationName(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (!normalized) return DEFAULT_NAME
  return normalized.length > 28 ? `${normalized.slice(0, 28)}…` : normalized
}
