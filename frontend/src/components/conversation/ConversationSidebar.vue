<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ConversationRecord } from '../../conversations/types'

const props = defineProps<{
  conversations: ConversationRecord[]
  activeId: string
}>()

const emit = defineEmits<{
  create: []
  select: [id: string]
  rename: [id: string]
  remove: [id: string]
}>()

const keyword = ref('')
const filtered = computed(() => {
  const value = keyword.value.trim().toLowerCase()
  if (!value) return props.conversations
  return props.conversations.filter(item => item.displayName.toLowerCase().includes(value))
})

function timeLabel(timestamp: number) {
  const date = new Date(timestamp)
  const now = new Date()
  const sameDay = date.toDateString() === now.toDateString()
  return sameDay
    ? new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(date)
    : new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' }).format(date)
}
</script>

<template>
  <aside class="conversation-sidebar">
    <div class="sidebar-brand">
      <div class="brand-mark">D</div>
      <div>
        <b>Data Agent</b>
        <span>数据编排作业台</span>
      </div>
    </div>

    <el-button class="new-chat" type="primary" @click="emit('create')">+ 新建需求</el-button>
    <el-input v-model="keyword" clearable placeholder="搜索需求记录" class="conversation-search" />

    <div class="conversation-section-title">需求记录</div>
    <div class="conversation-list">
      <div
        v-for="item in filtered"
        :key="item.id"
        class="conversation-item"
        :class="{ active: item.id === activeId }"
        role="button"
        tabindex="0"
        @click="emit('select', item.id)"
        @keydown.enter="emit('select', item.id)"
      >
        <div class="conversation-main">
          <span class="conversation-name">{{ item.displayName }}</span>
          <span class="conversation-time">{{ timeLabel(item.updatedAt) }}</span>
        </div>
        <el-dropdown trigger="click" @click.stop>
          <span class="conversation-more" @click.stop>•••</span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item @click="emit('rename', item.id)">重命名</el-dropdown-item>
              <el-dropdown-item divided @click="emit('remove', item.id)">删除</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
      <div v-if="filtered.length === 0" class="conversation-empty">暂无匹配需求</div>
    </div>
  </aside>
</template>
