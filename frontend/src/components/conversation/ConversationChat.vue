<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { CopilotChat, useAgent } from '@copilotkit/vue/v2'
import type { AbstractAgent } from '@ag-ui/client'
import { conversationRepository, deriveConversationName } from '../../conversations/local-repository'
import { workspaceController } from '../../workspace/store'

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
  chatInputPlaceholder: '告诉我你想分析什么，我会通过本地 OpenCode2 实时回答并更新工作区。',
  welcomeMessageText: `我是 ${props.agentDisplayName}。当前已通过 adapter 连接本地 OpenCode2 service。`,
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
    onCustomEvent: ({ event }) => {
      if (event.name === 'workspace.render') {
        const value = event.value as any
        workspaceController.replace({ title: value.title, subtitle: value.subtitle, widgets: value.widgets ?? [] })
      }
      if (event.name === 'workspace.agents') {
        const value = event.value as any
        workspaceController.upsert({ id:'agent-graph', component:'ui.agentGraph', colSpan:8, minHeight:350, props:{ title:'智能分析编排', orchestrator:value.orchestrator, agents:value.agents ?? [] } })
        workspaceController.upsert({ id:'agent-activity', component:'ui.agentActivity', colSpan:4, minHeight:350, props:{ title:'实时协作', items:value.activities ?? [] } })
        if (value.timeline?.length) {
          const totalMs = Math.max(...value.timeline.map((item: any) => item.startMs + item.durationMs), 1)
          workspaceController.upsert({ id:'agent-timeline', component:'ui.agentTimeline', colSpan:12, props:{ title:'并行执行时间线', totalMs, items:value.timeline } })
        }
      }
    },
  })
  hydrated.value = true
  onCleanup(() => {
    persistSnapshot(threadId, nextAgent, true)
    subscription.unsubscribe()
    if (currentAgent === nextAgent) { currentAgent = null; currentThreadId = '' }
  })
}, { immediate: true })

function onSubmitMessage(value: string) {
  if (props.displayName === '新对话' || props.displayName === '新分析') emit('rename', deriveConversationName(value))
}

onBeforeUnmount(() => {
  if (persistTimer) window.clearTimeout(persistTimer)
  if (currentAgent && currentThreadId) persistSnapshot(currentThreadId, currentAgent, true)
})
</script>

<template>
  <div class="conversation-chat visual-chat dark">
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
