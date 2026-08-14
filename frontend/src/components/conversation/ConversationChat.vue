<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { CopilotChat, useAgent } from '@copilotkit/vue/v2'
import type { AbstractAgent } from '@ag-ui/client'
import { conversationRepository, deriveConversationName } from '../../conversations/local-repository'

const props = defineProps<{
  agentId: string
  threadId: string
  displayName: string
  agentDisplayName: string
}>()

const emit = defineEmits<{ changed: []; rename: [name: string] }>()
const hydrated = ref(false)
const { agent } = useAgent({ agentId: () => props.agentId, threadId: () => props.threadId, throttleMs: 60 })
let persistTimer: number | undefined
let currentAgent: AbstractAgent | null = null
let currentThreadId = ''
const chatLabels = computed(() => ({
  chatInputPlaceholder: '告诉我你想看什么数据，我会直接更新左侧工作区…',
  welcomeMessageText: `我是 ${props.agentDisplayName}。你可以让我重构左侧分析界面、追踪异常、拆解原因或展示 SQL。`,
  modalHeaderTitle: props.agentDisplayName,
})) as any

function persistSnapshot(threadId: string, target: AbstractAgent, immediate = false) {
  const save = () => {
    conversationRepository.saveSnapshot(threadId, target.messages, target.state)
    emit('changed')
  }
  if (immediate) {
    if (persistTimer) window.clearTimeout(persistTimer)
    persistTimer = undefined
    save()
    return
  }
  if (persistTimer) window.clearTimeout(persistTimer)
  persistTimer = window.setTimeout(save, 100)
}

watch([agent, () => props.threadId], ([nextAgent, nextThreadId], _, onCleanup) => {
  hydrated.value = false
  if (!nextAgent) return
  const threadId = nextThreadId
  currentAgent = nextAgent
  currentThreadId = threadId
  const conversation = conversationRepository.get(threadId)
  if (conversation) {
    nextAgent.setMessages(conversation.messages)
    nextAgent.setState(conversation.state)
  }
  const subscription = nextAgent.subscribe({
    onMessagesChanged: ({ agent: changedAgent }) => persistSnapshot(threadId, changedAgent),
    onStateChanged: ({ agent: changedAgent }) => persistSnapshot(threadId, changedAgent),
  })
  hydrated.value = true
  onCleanup(() => {
    persistSnapshot(threadId, nextAgent, true)
    subscription.unsubscribe()
    if (currentAgent === nextAgent) { currentAgent = null; currentThreadId = '' }
  })
}, { immediate: true })

function onSubmitMessage(value: string) {
  if (props.displayName === '新对话') emit('rename', deriveConversationName(value))
}

onBeforeUnmount(() => {
  if (persistTimer) window.clearTimeout(persistTimer)
  if (currentAgent && currentThreadId) persistSnapshot(currentThreadId, currentAgent, true)
})
</script>

<template>
  <div class="conversation-chat visual-chat">
    <div v-if="!hydrated" class="chat-loading"><el-skeleton :rows="5" animated /></div>
    <CopilotChat
      v-else
      :key="threadId"
      :agent-id="agentId"
      :thread-id="threadId"
      :labels="chatLabels"
      :throttle-ms="60"
      @submit-message="onSubmitMessage"
    />
  </div>
</template>
