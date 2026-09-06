<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
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

const { t, locale } = useI18n()
const query = ref('')
const fromDate = ref('')
const toDate = ref('')
const page = ref(1)
const pageSize = 50
const formatter = computed(() => new Intl.DateTimeFormat(locale.value, {
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
}))
function dayKey(timestamp: number) {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
const filtered = computed(() => {
  const keyword = query.value.trim().toLocaleLowerCase(locale.value)
  return props.sessions.filter(session => {
    if (keyword && !session.displayName.toLocaleLowerCase(locale.value).includes(keyword)) return false
    const day = dayKey(session.updatedAt)
    return (!fromDate.value || day >= fromDate.value) && (!toDate.value || day <= toDate.value)
  })
})
const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize)))
const visible = computed(() => filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize))
watch([query, fromDate, toDate], () => { page.value = 1 }, { flush: 'sync' })
watch(pageCount, count => { page.value = Math.min(page.value, count) }, { flush: 'sync' })

function timeLabel(timestamp: number) {
  return formatter.value.format(new Date(timestamp))
}
</script>

<template>
  <section class="app-page history-page">
    <div class="app-page__inner">
      <header class="app-page__header">
        <div>
          <h1>{{ t('history.title') }}</h1>
          <p>{{ t('history.description') }}</p>
        </div>
        <div class="history-page__actions">
          <el-button @click="emit('refresh')">{{ t('app.refresh') }}</el-button>
          <el-button type="primary" @click="emit('create')">{{ t('app.newRequest') }}</el-button>
        </div>
      </header>

      <div class="history-filters">
        <label>{{ t('history.search') }}<input v-model="query" type="search" :aria-label="t('history.search')" /></label>
        <label>{{ t('history.fromDate') }}<input v-model="fromDate" type="date" :aria-label="t('history.fromDate')" /></label>
        <label>{{ t('history.toDate') }}<input v-model="toDate" type="date" :aria-label="t('history.toDate')" /></label>
      </div>
      <p role="status">{{ t('history.total', { count: filtered.length }) }}</p>
      <div class="history-list">
        <template v-for="(session, index) in visible" :key="session.id">
        <h2 v-if="index === 0 || dayKey(session.updatedAt) !== dayKey(visible[index - 1]!.updatedAt)" class="history-day">{{ dayKey(session.updatedAt) }}</h2>
        <article
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
          <el-button text @click="emit('rename', session.id)">{{ t('history.rename') }}</el-button>
        </article>
        </template>

        <div v-if="!filtered.length" class="empty-state">
          {{ props.sessions.length ? t('history.noMatches') : t('history.empty') }}
        </div>
      </div>
      <nav class="history-pagination" :aria-label="t('history.pagination')">
        <el-button :disabled="page <= 1" @click="page--">{{ t('history.previous') }}</el-button>
        <span>{{ t('history.page', { page, total: pageCount }) }}</span>
        <el-button :disabled="page >= pageCount" @click="page++">{{ t('history.next') }}</el-button>
      </nav>
    </div>
  </section>
</template>

<style scoped>
.history-filters { display: flex; flex-wrap: wrap; gap: var(--da-space-3); }
.history-filters label { display: grid; gap: var(--da-space-1); color: var(--da-text-muted); font-size: var(--da-font-size-sm); }
.history-filters input { min-width: 0; padding: var(--da-space-2); border: 0.0625rem solid var(--da-border); border-radius: var(--da-radius-md); color: var(--da-text-primary); background: var(--da-surface-1); font: inherit; }
.history-day { margin: 0; padding: var(--da-space-2) var(--da-space-3); color: var(--da-text-muted); background: var(--da-surface-2); font-size: var(--da-font-size-sm); }
.history-pagination { display: flex; align-items: center; justify-content: center; gap: var(--da-space-3); padding: var(--da-space-4); }
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
