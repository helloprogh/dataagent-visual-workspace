<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ConversationRecord } from '../conversations/types'
import ConversationChat from './conversation/ConversationChat.vue'

const props = defineProps<{
  conversations: ConversationRecord[]
  activeId: string
  agentId: string
  agentDisplayName: string
  activeConversation?: ConversationRecord
}>()

const emit = defineEmits<{
  create: []
  select: [id: string]
  rename: [id: string]
  remove: [id: string]
  changed: []
  autoRename: [name: string]
}>()

const showHistory = ref(false)
const keyword = ref('')
const filtered = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  return q ? props.conversations.filter(item => item.displayName.toLowerCase().includes(q)) : props.conversations
})

function timeLabel(timestamp: number) {
  const date = new Date(timestamp)
  const today = new Date().toDateString() === date.toDateString()
  return new Intl.DateTimeFormat('zh-CN', today ? { hour: '2-digit', minute: '2-digit' } : { month: '2-digit', day: '2-digit' }).format(date)
}

function toggleHistory() {
  showHistory.value = !showHistory.value
}

function select(id: string) {
  emit('select', id)
  showHistory.value = false
}
</script>

<template>
  <aside class="assistant-panel">
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
        <button title="历史对话" :class="{ active: showHistory }" @click="toggleHistory">◎</button>
        <button title="新建需求" @click="emit('create')">＋</button>
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

      <transition name="history-slide">
        <section v-if="showHistory" class="history-overlay">
          <div class="history-head">
            <div><span>REQUIREMENT MEMORY</span><h3>需求记录</h3></div>
            <button @click="showHistory = false">×</button>
          </div>
          <el-input v-model="keyword" clearable placeholder="搜索需求记录" class="history-search" />
          <div class="history-list">
            <article
              v-for="item in filtered"
              :key="item.id"
              class="history-item"
              :class="{ active: item.id === activeId }"
              @click="select(item.id)"
            >
              <div class="history-node"><i></i></div>
              <div class="history-copy">
                <b>{{ item.displayName }}</b>
                <small>{{ timeLabel(item.updatedAt) }} · {{ item.messages.length }} 条消息</small>
              </div>
              <el-dropdown trigger="click" @click.stop>
                <button class="history-more" @click.stop>•••</button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item @click="emit('rename', item.id)">重命名</el-dropdown-item>
                    <el-dropdown-item divided @click="emit('remove', item.id)">删除</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </article>
            <div v-if="filtered.length === 0" class="history-empty">没有匹配的需求记录</div>
          </div>
          <button class="history-new" @click="emit('create'); showHistory = false">＋ 创建新的数据需求</button>
        </section>
      </transition>
    </div>

    <footer class="assistant-footer">
      <span><i></i> AG-UI STREAM</span>
      <span>SA DELIVERY WORKSPACE</span>
    </footer>
  </aside>
</template>
