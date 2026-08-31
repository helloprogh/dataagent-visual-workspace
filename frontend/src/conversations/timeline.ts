import type { Interrupt, Message, ToolCall } from '@ag-ui/client'
import type { BubbleListItemProps } from 'vue-element-plus-x/types/BubbleList'
import { isArtifactReference, type ArtifactReference } from '../artifacts/types'

export type ConversationItemType = 'reasoning' | 'activity' | 'artifact' | 'tool' | 'interrupt'

export interface ConversationTimelineItem extends BubbleListItemProps {
  key: string
  role: 'user' | 'ai' | 'system'
  placement: 'start' | 'end'
  content: string
  noStyle?: boolean
  itemType?: ConversationItemType
  message?: Message
  interrupt?: Interrupt
  interrupts?: Interrupt[]
  artifact?: ArtifactReference
  toolCall?: ToolCall
  toolCallName?: string
}

export function messageText(message: Message): string {
  if (typeof message.content === 'string') return message.content
  if (!Array.isArray(message.content)) return ''
  return message.content
    .map(part => {
      if (!part || typeof part !== 'object') return ''
      if (part.type === 'text' && 'text' in part && typeof part.text === 'string') return part.text
      if (part.type === 'document' && 'metadata' in part) {
        const metadata = part.metadata as Record<string, unknown> | undefined
        return typeof metadata?.filename === 'string' ? `[文件: ${metadata.filename}]` : '[文件]'
      }
      return ''
    })
    .filter(Boolean)
    .join('\n')
}

function findToolCall(messages: readonly Message[], toolCallId?: string): ToolCall | undefined {
  if (!toolCallId) return undefined
  for (const message of messages) {
    if (message.role !== 'assistant' || !message.toolCalls?.length) continue
    const found = message.toolCalls.find(toolCall => toolCall.id === toolCallId)
    if (found) return found
  }
  return undefined
}

function messageItem(message: Message, interruptedToolIds: ReadonlySet<string>): ConversationTimelineItem[] {
  if (message.role === 'reasoning') {
    return [{
      key: `message:${message.id}`,
      role: 'system',
      placement: 'start',
      content: message.content,
      itemType: 'reasoning',
      message,
      noStyle: true,
    }]
  }

  if (message.role === 'activity') {
    const artifact = message.activityType === 'DATAAGENT_ARTIFACT' && isArtifactReference(message.content)
      ? message.content
      : undefined
    return [{
      key: `message:${message.id}`,
      role: 'system',
      placement: 'start',
      content: artifact?.title ?? '',
      itemType: artifact ? 'artifact' : 'activity',
      artifact,
      message,
      noStyle: true,
    }]
  }

  if (message.role === 'tool') {
    return [{
      key: `message:${message.id}`,
      role: 'system',
      placement: 'start',
      content: message.error || message.content,
      itemType: 'tool',
      message,
      noStyle: true,
    }]
  }

  const role = message.role === 'user' ? 'user' : 'ai'
  const base: ConversationTimelineItem = {
    key: `message:${message.id}`,
    role,
    placement: role === 'user' ? 'end' : 'start',
    content: messageText(message),
    message,
    shape: 'corner',
    variant: role === 'user' ? 'filled' : 'borderless',
    avatarSize: '28px',
  }

  if (message.role !== 'assistant' || !message.toolCalls?.length) return [base]

  return [
    base,
    ...message.toolCalls
      .filter(toolCall => !interruptedToolIds.has(toolCall.id))
      .map(toolCall => ({
        key: `tool-call:${message.id}:${toolCall.id}`,
        role: 'system' as const,
        placement: 'start' as const,
        content: toolCall.function.name,
        itemType: 'tool' as const,
        message,
        toolCall,
        toolCallName: toolCall.function.name,
        noStyle: true,
      })),
  ]
}

export function buildConversationTimeline(messages: readonly Message[], interrupts: readonly Interrupt[]): ConversationTimelineItem[] {
  const interruptedToolIds = new Set(interrupts.map(item => item.toolCallId).filter((id): id is string => Boolean(id)))
  const items = messages.flatMap(message => messageItem(message, interruptedToolIds))

  if (interrupts.length) {
    const primary = interrupts[0]
    const toolCall = findToolCall(messages, primary.toolCallId)
    items.push({
      key: `interrupts:${interrupts.map(item => item.id).join(':')}`,
      role: 'system',
      placement: 'start',
      content: primary.message ?? '需要你的确认',
      itemType: 'interrupt',
      interrupt: primary,
      interrupts: [...interrupts],
      toolCall,
      toolCallName: toolCall?.function.name,
      noStyle: true,
    })
  }

  return items
}
