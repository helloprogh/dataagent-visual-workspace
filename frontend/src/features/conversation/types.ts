export type ConversationSession = {
  id: string
  parentId?: string
  displayName: string
  createdAt: number
  updatedAt: number
  archivedAt?: number
}

export type ConversationPage = 'chat' | 'history' | 'skills' | 'tools'
