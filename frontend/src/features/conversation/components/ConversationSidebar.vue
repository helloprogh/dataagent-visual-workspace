<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ConversationPage, ConversationSession } from '../types'
import type { AppTheme } from '../../../shared/theme/theme'
import AgentMark from './AgentMark.vue'
import { presentSessions } from '../presentation'

const props = defineProps<{
  sessions: ConversationSession[]
  activeId: string
  activePage: ConversationPage
  theme: AppTheme
}>()

const emit = defineEmits<{
  create: []
  select: [id: string]
  rename: [id: string]
  page: [page: ConversationPage]
  toggleTheme: []
}>()

const query = ref('')

const visibleSessions = computed(() => {
  const keyword = query.value.trim().toLocaleLowerCase()
  const source = keyword
    ? props.sessions.filter(session => session.displayName.toLocaleLowerCase().includes(keyword))
    : props.sessions
  return presentSessions(source.slice(0, 20))
})

function relativeTime(timestamp: number) {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
  if (seconds < 60) return '刚刚'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} 天前`
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' }).format(new Date(timestamp))
}
</script>

<template>
  <aside class="conversation-sidebar">
    <div class="sidebar-brand">
      <AgentMark size="compact" />
      <div><b>DATA AGENT</b><small>数据交付工作台</small></div>
      <span class="sidebar-brand__edition">WORKSPACE</span>
    </div>

    <el-button class="new-chat" type="primary" @click="emit('create')">
      <span class="new-chat__icon" aria-hidden="true">+</span>
      <span>新建需求</span>
    </el-button>

    <div class="sidebar-section">
      <label class="sidebar-search">
        <span aria-hidden="true">
          <svg viewBox="0 0 20 20"><circle cx="8.5" cy="8.5" r="4.75"/><path d="m12 12 4 4"/></svg>
        </span>
        <input v-model="query" type="search" placeholder="搜索需求" aria-label="搜索需求" />
      </label>
      <div class="sidebar-section__title">
        <span>最近需求</span>
        <button v-if="sessions.length" type="button" @click="emit('page', 'history')">查看全部</button>
      </div>
      <div class="session-list">
        <button
          v-for="session in visibleSessions"
          :key="session.id"
          type="button"
          class="session-item"
          :class="{ active: activePage === 'chat' && activeId === session.id }"
          @click="emit('select', session.id)"
          @dblclick.stop="emit('rename', session.id)"
        >
          <span class="session-item__mark" aria-hidden="true"></span>
          <span class="session-item__copy">
            <span class="session-item__name">{{ session.presentationName }}</span>
            <small>{{ relativeTime(session.updatedAt) }}</small>
          </span>
        </button>
        <div v-if="!visibleSessions.length" class="session-empty">{{ query ? '没有匹配的需求' : '还没有历史需求' }}</div>
      </div>
    </div>

    <nav class="sidebar-nav" aria-label="管理导航">
      <button :class="{ active: activePage === 'skills' }" type="button" @click="emit('page', 'skills')">
        <span class="sidebar-icon" aria-hidden="true">
          <svg viewBox="0 0 20 20"><path d="M6.5 3.5h7v3h3v7h-3v3h-7v-3h-3v-7h3v-3Z"/><path d="M8 8h4v4H8z"/></svg>
        </span>
        <b>Skills</b>
      </button>
      <button :class="{ active: activePage === 'tools' }" type="button" @click="emit('page', 'tools')">
        <span class="sidebar-icon" aria-hidden="true">
          <svg viewBox="0 0 20 20"><path d="M7.2 5.1a3.5 3.5 0 0 0 4.5 4.5l4.1 4.1-2.1 2.1-4.1-4.1a3.5 3.5 0 0 0-4.5-4.5L7.4 8.4 5.6 6.6 7.2 5.1Z"/></svg>
        </span>
        <b>工具</b>
      </button>
    </nav>

    <footer class="sidebar-footer">
      <button type="button" @click="emit('toggleTheme')">
        <span class="sidebar-icon" aria-hidden="true">
          <svg v-if="theme === 'dark'" viewBox="0 0 20 20"><circle cx="10" cy="10" r="3.25"/><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4"/></svg>
          <svg v-else viewBox="0 0 20 20"><path d="M15.8 12.5A6.2 6.2 0 0 1 7.5 4.2 6.2 6.2 0 1 0 15.8 12.5Z"/></svg>
        </span>
        <b>{{ theme === 'dark' ? '浅色模式' : '深色模式' }}</b>
      </button>
    </footer>
  </aside>
</template>

<style scoped>
.conversation-sidebar { display: grid; grid-template-rows: auto auto minmax(0, 1fr) auto auto; width: 100%; height: 100%; min-height: 0; padding: var(--da-space-4); color: var(--da-text-primary); background: linear-gradient(180deg, var(--da-surface-sidebar) 0%, var(--da-surface-1) 38%); }
.sidebar-brand { display: flex; align-items: center; gap: var(--da-space-3); min-height: 3rem; margin-bottom: var(--da-space-4); }
.sidebar-brand > div { display: flex; min-width: 0; flex-direction: column; gap: 0.125rem; }
.sidebar-brand b { color: var(--da-text-emphasis); font-size: var(--da-font-size-sm); letter-spacing: 0.04em; }
.sidebar-brand small { color: var(--da-text-subtle); font-size: var(--da-font-size-xs); }
.sidebar-brand__edition { margin-left: auto; padding: 0.1875rem 0.3125rem; border: 0.0625rem solid var(--da-border); border-radius: 0.25rem; color: var(--da-brand-cyan); font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 0.5rem; font-weight: 700; letter-spacing: 0.08em; }
.new-chat { width: 100%; min-height: 2.5rem; margin-bottom: var(--da-space-5); box-shadow: 0 0.375rem 1.25rem var(--da-accent-primary-soft), var(--da-shadow-card); font-weight: 600; }
.new-chat__icon { margin-right: var(--da-space-1); font-size: 1.15rem; font-weight: 400; line-height: 1; }
.sidebar-section { min-height: 0; overflow: hidden; }
.sidebar-search { display: flex; min-height: 2.25rem; align-items: center; gap: var(--da-space-2); margin-bottom: var(--da-space-3); padding: 0 var(--da-space-3); border: 0.0625rem solid var(--da-border); border-radius: var(--da-radius-md); color: var(--da-text-subtle); background: color-mix(in srgb, var(--da-surface-2) 72%, transparent); transition: border-color 140ms ease, background-color 140ms ease; }
.sidebar-search:focus-within { border-color: var(--da-border-focus); background: var(--da-surface-2); box-shadow: var(--da-ring-accent); }
.sidebar-search span { display: grid; width: 0.875rem; height: 0.875rem; flex: 0 0 auto; place-items: center; }
.sidebar-search svg { width: 100%; height: 100%; fill: none; stroke: currentColor; stroke-linecap: round; stroke-width: 1.4; }
.sidebar-search input { width: 100%; min-width: 0; padding: 0; border: 0; outline: 0; color: var(--da-text-primary); background: transparent; font-size: var(--da-font-size-xs); }
.sidebar-search input::placeholder { color: var(--da-text-subtle); }
.sidebar-section__title { display: flex; align-items: center; justify-content: space-between; padding: 0 var(--da-space-2) var(--da-space-2); color: var(--da-text-subtle); font-size: var(--da-font-size-xs); }
.sidebar-section__title button { padding: 0; border: 0; color: var(--da-text-muted); background: transparent; cursor: pointer; font-size: inherit; }
.sidebar-section__title button:hover { color: var(--da-accent-primary); }
.session-list { height: calc(100% - 4.75rem); overflow: auto; scrollbar-width: thin; }
.session-item { position: relative; display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: var(--da-space-2); width: 100%; min-height: 3.125rem; padding: var(--da-space-2); border: 0; border-radius: var(--da-radius-md); color: var(--da-text-muted); background: transparent; cursor: pointer; text-align: left; transition: color 140ms ease, background-color 140ms ease; }
.session-item:hover { color: var(--da-text-primary); background: var(--da-surface-hover); }
.session-item.active { color: var(--da-text-emphasis); background: var(--da-accent-primary-soft); }
.session-item.active::before { position: absolute; top: 0.625rem; bottom: 0.625rem; left: 0; width: 0.1875rem; border-radius: 999rem; background: var(--da-accent-primary); box-shadow: 0 0 0.5rem var(--da-accent-primary-soft); content: ''; }
.session-item__mark { width: 0.375rem; height: 1.5rem; border-radius: 999rem; background: var(--da-border-strong); }
.session-item.active .session-item__mark { background: var(--da-gradient-brand); box-shadow: 0 0 0.75rem var(--da-brand-glow); }
.session-item__copy { display: grid; min-width: 0; gap: 0.1875rem; }
.session-item__name { overflow: hidden; font-size: var(--da-font-size-sm); text-overflow: ellipsis; white-space: nowrap; }
.session-item__copy small { color: var(--da-text-subtle); font-size: 0.6875rem; }
.session-empty { padding: var(--da-space-3) var(--da-space-2); color: var(--da-text-subtle); font-size: var(--da-font-size-xs); }
.sidebar-nav { display: grid; gap: var(--da-space-1); margin-top: var(--da-space-4); padding-top: var(--da-space-3); border-top: 0.0625rem solid var(--da-border); }
.sidebar-nav button, .sidebar-footer button { display: flex; align-items: center; gap: var(--da-space-3); width: 100%; min-height: 2.375rem; padding: 0 var(--da-space-3); border: 0; border-radius: var(--da-radius-md); color: var(--da-text-muted); background: transparent; cursor: pointer; text-align: left; transition: color 140ms ease, background-color 140ms ease; }
.sidebar-nav button:hover, .sidebar-footer button:hover { color: var(--da-text-emphasis); background: var(--da-surface-hover); }
.sidebar-nav button.active { color: var(--da-accent-primary); background: var(--da-accent-primary-soft); }
.sidebar-icon { display: grid; width: 1rem; height: 1rem; flex: 0 0 auto; place-items: center; }
.sidebar-icon svg { width: 1rem; height: 1rem; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.35; }
.sidebar-nav button b, .sidebar-footer button b { font-size: var(--da-font-size-sm); font-weight: 550; }
.sidebar-footer { padding-top: var(--da-space-2); }

@media (max-width: 52rem) {
  .conversation-sidebar { padding: var(--da-space-3) var(--da-space-2); }
  .sidebar-brand { justify-content: center; }
  .sidebar-brand > div, .sidebar-brand__edition, .sidebar-section, .sidebar-nav button b, .sidebar-footer button b { display: none; }
  .new-chat { min-width: 0; padding-inline: 0; font-size: 0; }
  .new-chat__icon { margin: 0; font-size: 1.25rem; }
  .sidebar-nav button, .sidebar-footer button { justify-content: center; padding: 0; }
}
</style>
