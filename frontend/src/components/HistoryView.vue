<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ConversationRecord } from '../conversations/types'

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
  const q = keyword.value.trim().toLowerCase()
  return q
    ? props.conversations.filter(item => item.displayName.toLowerCase().includes(q))
    : props.conversations
})

function fullTime(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(new Date(timestamp))
}
</script>

<template>
  <section class="management-page history-page">
    <header class="management-page__header">
      <div>
        <span class="management-page__eyebrow">历史记录</span>
        <h1>历史对话</h1>
        <p>查看、搜索和管理全部 Data Agent 会话记录。</p>
      </div>
      <button class="management-page__primary" type="button" @click="emit('create')">
        <svg viewBox="0 0 20 20"><path d="M10 4v12M4 10h12" /></svg>
        新建会话
      </button>
    </header>

    <div class="management-page__toolbar">
      <el-input v-model="keyword" clearable placeholder="搜索全部历史会话" class="management-page__search" />
      <span class="management-page__count">共 {{ filtered.length }} 条</span>
    </div>

    <div class="history-table">
      <div class="history-table__head">
        <span>会话</span><span>消息</span><span>更新时间</span><span></span>
      </div>
      <article
        v-for="item in filtered"
        :key="item.id"
        role="button"
        tabindex="0"
        :aria-current="item.id === activeId ? 'page' : undefined"
        class="history-table__row"
        :class="{ active: item.id === activeId }"
        @click="emit('select', item.id)"
        @keydown.enter.prevent="emit('select', item.id)"
        @keydown.space.prevent="emit('select', item.id)"
      >
        <div class="history-table__title">
          <span class="history-table__icon"><svg viewBox="0 0 20 20"><path d="M4 5.5h12v8H9l-3.8 2.4V13.5H4z" /></svg></span>
          <div><b>{{ item.displayName }}</b><small>{{ item.id }}</small></div>
        </div>
        <span>{{ item.messages.length }} 条</span>
        <span>{{ fullTime(item.updatedAt) }}</span>
        <el-dropdown trigger="click" @click.stop>
          <button class="history-table__more" type="button" aria-label="会话操作" @click.stop>
            <svg viewBox="0 0 20 20"><circle cx="4" cy="10" r="1"/><circle cx="10" cy="10" r="1"/><circle cx="16" cy="10" r="1"/></svg>
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item @click="emit('rename', item.id)">重命名</el-dropdown-item>
              <el-dropdown-item divided @click="emit('remove', item.id)">删除</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </article>
      <div v-if="filtered.length === 0" class="management-page__empty">没有匹配的历史会话</div>
    </div>
  </section>
</template>
