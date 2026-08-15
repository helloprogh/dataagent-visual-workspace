<script setup lang="ts">
import { computed } from 'vue'
import { CopilotChatAssistantMessage } from '@copilotkit/vue/v2'
import type {
  CopilotChatAssistantMessageToolCallsViewSlotProps,
  CopilotChatMessageViewSlotProps,
  CopilotChatReasoningMessageLayoutSlotProps,
} from '@copilotkit/vue/v2'
import ReasoningProcessCard from './ReasoningProcessCard.vue'

type AssistantMessage = CopilotChatAssistantMessageToolCallsViewSlotProps['message']
type Message = CopilotChatMessageViewSlotProps['messages'][number]
type ReasoningMessage = CopilotChatReasoningMessageLayoutSlotProps['message']

const props = defineProps<{
  message: AssistantMessage
  messages: Message[]
  isRunning: boolean
}>()

function textContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map(part => part && typeof part === 'object' && 'type' in part && part.type === 'text' && 'text' in part && typeof part.text === 'string' ? part.text : '')
    .filter(Boolean)
    .join('\n')
}

function stripThinkStart(content: string): string {
  return content.replace(/^\s*<think>\s*/i, '')
}

const rawContent = computed(() => textContent(props.message.content))
const isLatestStreamingMessage = computed(() => (
  props.isRunning && props.messages[props.messages.length - 1]?.id === props.message.id
))

const splitContent = computed(() => {
  const raw = rawContent.value
  const closingTag = /<\/think>/i.exec(raw)

  if (closingTag?.index !== undefined) {
    return {
      hasReasoning: true,
      reasoning: stripThinkStart(raw.slice(0, closingTag.index)).trim(),
      answer: raw.slice(closingTag.index + closingTag[0].length).replace(/^\s+/, ''),
      reasoningStreaming: false,
    }
  }

  const hasOpeningTag = /^\s*<think>/i.test(raw)
  if ((hasOpeningTag || isLatestStreamingMessage.value) && raw.trim()) {
    return {
      hasReasoning: true,
      reasoning: stripThinkStart(raw),
      answer: '',
      reasoningStreaming: isLatestStreamingMessage.value,
    }
  }

  return {
    hasReasoning: false,
    reasoning: '',
    answer: raw,
    reasoningStreaming: false,
  }
})

const reasoningMessage = computed<ReasoningMessage | null>(() => {
  if (!splitContent.value.hasReasoning || !splitContent.value.reasoning.trim()) return null
  return {
    id: `reasoning-${props.message.id}`,
    role: 'reasoning',
    content: splitContent.value.reasoning,
  } as ReasoningMessage
})

const answerMessage = computed<AssistantMessage>(() => ({
  ...props.message,
  content: splitContent.value.answer,
}))

const showAssistantMessage = computed(() => (
  !splitContent.value.hasReasoning
  || splitContent.value.answer.trim().length > 0
  || Boolean(props.message.toolCalls?.length)
))
</script>

<template>
  <div class="reasoning-aware-message">
    <ReasoningProcessCard
      v-if="reasoningMessage"
      :message="reasoningMessage"
      :messages="[reasoningMessage]"
      :is-running="splitContent.reasoningStreaming"
    />

    <CopilotChatAssistantMessage
      v-if="showAssistantMessage"
      :message="answerMessage"
      :messages="messages"
      :is-running="isRunning"
    />
  </div>
</template>

<style scoped>
.reasoning-aware-message{display:contents}
</style>
