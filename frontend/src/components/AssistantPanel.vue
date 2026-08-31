<script setup lang="ts">
import type { ConversationRecord } from '../conversations/types'
import ConversationChat from './conversation/ConversationChat.vue'

const props = defineProps<{
  activeId: string
  agentId: string
  agentDisplayName: string
  activeConversation?: ConversationRecord
}>()

const emit = defineEmits<{
  materialized: [sessionId: string]
  changed: []
  autoRename: [name: string]
}>()
</script>

<template>
  <section
    class="assistant-panel assistant-panel--center"
    :class="{ 'assistant-panel--existing': Boolean(activeConversation) }"
  >
    <div class="assistant-panel-glow"></div>

    <header class="assistant-header">
      <div class="assistant-identity">
        <div class="assistant-orb"><span></span></div>
        <div>
          <div class="assistant-name"><b>{{ agentDisplayName }}</b><span>在线</span></div>
          <small>DA 数据分析与交付助手</small>
        </div>
      </div>
    </header>

    <div class="assistant-context">
      <span>当前会话</span>
      <b>{{ activeConversation?.displayName || '新需求' }}</b>
      <i></i>
      <small>{{ activeId ? activeId.slice(0, 18) : '首次发送后创建' }}</small>
    </div>

    <div class="assistant-body">
      <ConversationChat
        :agent-id="agentId"
        :agent-display-name="agentDisplayName"
        :thread-id="activeConversation?.id ?? ''"
        :display-name="activeConversation?.displayName ?? '新需求'"
        :draft="!activeConversation"
        @materialized="emit('materialized', $event)"
        @changed="emit('changed')"
        @rename="emit('autoRename', $event)"
      />
    </div>

    <footer class="assistant-footer">
      <span><i></i> AG-UI 实时连接</span>
      <span>对话工作区</span>
    </footer>
  </section>
</template>
