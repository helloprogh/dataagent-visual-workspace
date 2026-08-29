import type { Interrupt, Message, State } from '@ag-ui/client'

export interface ConversationRecord {
  id: string
  parentId?: string
  archivedAt?: number
  displayName: string
  messages: Message[]
  state: State
  pendingInterrupts?: Interrupt[]
  createdAt: number
  updatedAt: number
}

export interface ConversationSessionSummary {
  id: string
  parentId?: string
  archivedAt?: number
  displayName: string
  createdAt: number
  updatedAt: number
}

export interface ConversationRepository {
  list(): ConversationRecord[]
  get(id: string): ConversationRecord | undefined
  create(id: string, displayName?: string): ConversationRecord
  syncSessions(sessions: ConversationSessionSummary[]): void
  rename(id: string, displayName: string): void
  saveSnapshot(id: string, messages: Message[], state: State): void
  saveHydratedMessages(id: string, messages: Message[]): void
  saveInterrupts(id: string, interrupts: Interrupt[]): void
  remove(id: string): void
}
