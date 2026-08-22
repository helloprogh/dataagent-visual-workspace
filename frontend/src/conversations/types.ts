import type { Interrupt, Message, State } from '@ag-ui/client'

export interface ConversationRecord {
  id: string
  displayName: string
  messages: Message[]
  state: State
  pendingInterrupts?: Interrupt[]
  createdAt: number
  updatedAt: number
}

export interface ConversationRepository {
  list(): ConversationRecord[]
  get(id: string): ConversationRecord | undefined
  create(id: string, displayName?: string): ConversationRecord
  rename(id: string, displayName: string): void
  saveSnapshot(id: string, messages: Message[], state: State): void
  saveInterrupts(id: string, interrupts: Interrupt[]): void
  remove(id: string): void
}
