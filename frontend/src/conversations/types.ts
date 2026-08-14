import type { Message, State } from '@ag-ui/client'

export interface ConversationRecord {
  id: string
  displayName: string
  messages: Message[]
  state: State
  createdAt: number
  updatedAt: number
}

export interface ConversationRepository {
  list(): ConversationRecord[]
  get(id: string): ConversationRecord | undefined
  create(displayName?: string): ConversationRecord
  rename(id: string, displayName: string): void
  saveSnapshot(id: string, messages: Message[], state: State): void
  remove(id: string): void
}
