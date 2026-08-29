<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
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
  materialized: [sessionId: string]
  changed: []
  autoRename: [name: string]
}>()

const panelRoot = ref<HTMLElement | null>(null)

function scrollExistingConversationToLatest(sessionId: string) {
  void nextTick(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (props.activeConversation?.id !== sessionId) return
        const scroller = panelRoot.value?.querySelector<HTMLElement>('[data-testid="copilot-chat-view-scroll"]')
        if (!scroller) return
        scroller.scrollTop = scroller.scrollHeight
      })
    })
  })
}

watch(() => props.activeConversation?.id, sessionId => {
  if (sessionId) scrollExistingConversationToLatest(sessionId)
}, { immediate: true })
</script>

<template>
  <section
    ref="panelRoot"
    class="assistant-panel assistant-panel--center"
    :class="{ 'assistant-panel--existing': Boolean(activeConversation) }"
  >
    <div class="assistant-panel-glow"></div>

    <header class="assistant-header">
      <div class="assistant-identity">
        <div class="assistant-orb"><span></span></div>
        <div>
          <div class="assistant-name"><b>{{ agentDisplayName }}</b><span>在线</span></div>
          <small>SA 数据需求开发与交付助手</small>
        </div>
      </div>
      <div class="assistant-actions">
        <button title="新建会话" type="button" @click="emit('create')">＋</button>
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
      <span><i></i> 实时连接</span>
      <span>对话工作区</span>
    </footer>
  </section>
</template>

<style scoped>
/* An existing session is never a welcome/draft surface. Even if an older
   local snapshot temporarily reports zero messages, keep the normal chat
   composer anchored to the bottom and hide all welcome-state content. */
.assistant-panel.assistant-panel--existing :deep(.conversation-welcome){
  display:none!important;
}
.assistant-panel.assistant-panel--existing :deep(.conversation-input-layout--empty){
  width:100%!important;
  display:block!important;
}
.assistant-panel.assistant-panel--existing :deep(.conversation-chat.is-empty [data-testid="copilot-input-overlay"]){
  inset:auto 14px 14px 14px!important;
  width:auto!important;
  max-width:none!important;
  height:auto!important;
  padding:0!important;
  display:block!important;
  place-items:initial!important;
  transform:none!important;
  pointer-events:auto!important;
}
@media(max-width:540px){
  .assistant-panel.assistant-panel--existing :deep(.conversation-chat.is-empty [data-testid="copilot-input-overlay"]){
    inset:auto 14px 14px 14px!important;
    padding:0!important;
  }
}
</style>
