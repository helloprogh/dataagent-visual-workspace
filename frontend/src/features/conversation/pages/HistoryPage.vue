<script setup lang="ts">
import type { ConversationSession } from '../types'

const props = defineProps<{
  sessions: ConversationSession[]
  activeId: string
}>()

const emit = defineEmits<{
  create: []
  select: [id: string]
  rename: [id: string]
  refresh: []
}>()

function timeLabel(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp))
}
</script>

<template>
  <section class="app-page history-page">
    <div class="app-page__inner">
      <header class="app-page__header">
        <div>
          <h1>历史需求</h1>
          <p>继续之前的数据需求，或回顾已经完成的分析与交付记录。</p>
        </div>
        <div class="history-page__actions">
          <el-button @click="emit('refresh')">刷新</el-button>
          <el-button type="primary" @click="emit('create')">新建需求</el-button>
        </div>
      </header>

      <div class="history-list">
        <article
          v-for="session in props.sessions"
          :key="session.id"
          class="history-item"
          :class="{ active: session.id === activeId }"
        >
          <button class="history-item__main" type="button" @click="emit('select', session.id)">
            <span class="history-item__mark"></span>
            <span class="history-item__copy">
              <b>{{ session.displayName }}</b>
              <small>{{ timeLabel(session.updatedAt) }}</small>
            </span>
          </button>
          <el-button text @click="emit('rename', session.id)">重命名</el-button>
        </article>

        <div v-if="!props.sessions.length" class="empty-state">
          暂无历史需求
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.app-page__header p {
  margin: var(--da-space-2) 0 0;
  color: var(--da-text-muted);
}

.history-page__actions {
  display: flex;
  gap: var(--da-space-2);
}

.history-list {
  overflow: hidden;
  border: 0.0625rem solid var(--da-border);
  border-radius: var(--da-radius-lg);
  background: var(--da-surface-1);
}

.history-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--da-space-2);
  padding: var(--da-space-2) var(--da-space-3);
  transition: background-color 140ms ease;
}

.history-item + .history-item {
  border-top: 0.0625rem solid var(--da-border);
}

.history-item:hover {
  background: var(--da-surface-2);
}

.history-item.active {
  background: var(--da-accent-primary-soft);
}

.history-item__main {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: var(--da-space-3);
  min-width: 0;
  padding: var(--da-space-2);
  border: 0;
  color: inherit;
  background: transparent;
  cursor: pointer;
  text-align: left;
}

.history-item__mark {
  width: 0.375rem;
  height: 0.375rem;
  border-radius: 50%;
  background: var(--da-border-focus);
}

.history-item.active .history-item__mark {
  background: var(--da-accent-primary);
  box-shadow: 0 0 0 0.1875rem var(--da-accent-primary-soft);
}

.history-item__copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: var(--da-space-1);
}

.history-item__copy b {
  overflow: hidden;
  color: var(--da-text-emphasis);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-item__copy small {
  color: var(--da-text-muted);
  font-size: var(--da-font-size-xs);
}
</style>
