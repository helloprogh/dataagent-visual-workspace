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
  create: []
  changed: []
  autoRename: [name: string]
}>()
</script>

<template>
  <section class="assistant-panel assistant-panel--center">
    <div class="assistant-panel-glow"></div>

    <header class="assistant-header">
      <div class="assistant-identity">
        <div class="assistant-orb"><span></span></div>
        <div>
          <div class="assistant-name"><b>{{ agentDisplayName }}</b><span>ONLINE</span></div>
          <small>SA Data Delivery Copilot</small>
        </div>
      </div>
      <div class="assistant-actions">
        <button title="新建会话" type="button" @click="emit('create')">＋</button>
      </div>
    </header>

    <div class="assistant-context">
      <span>THREAD</span>
      <b>{{ activeConversation?.displayName || '新需求' }}</b>
      <i></i>
      <small>{{ activeId.slice(0, 18) }}</small>
    </div>

    <div class="assistant-body">
      <ConversationChat
        v-if="activeConversation"
        :key="activeConversation.id"
        :agent-id="agentId"
        :agent-display-name="agentDisplayName"
        :thread-id="activeConversation.id"
        :display-name="activeConversation.displayName"
        @changed="emit('changed')"
        @rename="emit('autoRename', $event)"
      />
    </div>

    <footer class="assistant-footer">
      <span><i></i> AG-UI STREAM</span>
      <span>CENTER CONVERSATION</span>
    </footer>
  </section>
</template>
