<script setup lang="ts">
import type { ConversationPage, ConversationSession } from '../types'
import type { AppTheme } from '../../../shared/theme/theme'

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
</script>

<template>
  <aside class="conversation-sidebar">
    <div class="sidebar-brand">
      <span class="sidebar-brand__mark">D</span>
      <div><b>DATA AGENT</b><small>Data Delivery</small></div>
    </div>

    <el-button class="new-chat" type="primary" @click="emit('create')">新建需求</el-button>

    <nav class="sidebar-nav" aria-label="主要导航">
      <button :class="{ active: activePage === 'chat' }" type="button" @click="emit('page', 'chat')"><span>◫</span><b>对话</b></button>
      <button :class="{ active: activePage === 'history' }" type="button" @click="emit('page', 'history')"><span>◷</span><b>历史</b></button>
      <button :class="{ active: activePage === 'skills' }" type="button" @click="emit('page', 'skills')"><span>◇</span><b>Skill</b></button>
      <button :class="{ active: activePage === 'tools' }" type="button" @click="emit('page', 'tools')"><span>⌘</span><b>工具</b></button>
    </nav>

    <div class="sidebar-section">
      <div class="sidebar-section__title"><span>最近对话</span><small>{{ sessions.length }}</small></div>
      <div class="session-list">
        <button
          v-for="session in sessions.slice(0, 20)"
          :key="session.id"
          type="button"
          class="session-item"
          :class="{ active: activePage === 'chat' && activeId === session.id }"
          @click="emit('select', session.id)"
          @dblclick.stop="emit('rename', session.id)"
        >
          <span class="session-item__dot"></span>
          <span class="session-item__name">{{ session.displayName }}</span>
        </button>
      </div>
    </div>

    <footer class="sidebar-footer">
      <button type="button" @click="emit('toggleTheme')">
        <span>{{ theme === 'dark' ? '☼' : '◐' }}</span>
        <b>{{ theme === 'dark' ? '浅色模式' : '深色模式' }}</b>
      </button>
    </footer>
  </aside>
</template>

<style scoped>
.conversation-sidebar { display: grid; grid-template-rows: auto auto auto minmax(0, 1fr) auto; width: 100%; height: 100%; min-height: 0; padding: var(--da-space-4); color: var(--da-text-primary); background: var(--da-surface-1); }
.sidebar-brand { display: flex; align-items: center; gap: var(--da-space-3); min-height: 3rem; margin-bottom: var(--da-space-4); }
.sidebar-brand__mark { display: grid; width: 2rem; height: 2rem; place-items: center; border: 0.0625rem solid var(--da-border-strong); border-radius: var(--da-radius-md); color: var(--da-accent-orange); background: var(--da-surface-2); font-weight: 700; }
.sidebar-brand > div { display: flex; min-width: 0; flex-direction: column; gap: 0.125rem; }
.sidebar-brand b { color: var(--da-text-emphasis); font-size: var(--da-font-size-sm); letter-spacing: 0.04em; }
.sidebar-brand small { color: var(--da-text-subtle); font-size: var(--da-font-size-xs); }
.new-chat { width: 100%; margin-bottom: var(--da-space-4); }
.sidebar-nav { display: grid; gap: var(--da-space-1); margin-bottom: var(--da-space-5); }
.sidebar-nav button, .sidebar-footer button { display: flex; align-items: center; gap: var(--da-space-3); width: 100%; min-height: 2.375rem; padding: 0 var(--da-space-3); border: 0; border-radius: var(--da-radius-md); color: var(--da-text-muted); background: transparent; cursor: pointer; text-align: left; }
.sidebar-nav button:hover, .sidebar-nav button.active, .sidebar-footer button:hover { color: var(--da-text-emphasis); background: var(--da-surface-3); }
.sidebar-nav button span, .sidebar-footer button span { width: 1rem; text-align: center; }
.sidebar-nav button b, .sidebar-footer button b { font-size: var(--da-font-size-sm); font-weight: 550; }
.sidebar-section { min-height: 0; overflow: hidden; }
.sidebar-section__title { display: flex; align-items: center; justify-content: space-between; padding: 0 var(--da-space-2) var(--da-space-2); color: var(--da-text-subtle); font-size: var(--da-font-size-xs); }
.session-list { height: calc(100% - 1.75rem); overflow: auto; scrollbar-width: thin; }
.session-item { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: var(--da-space-2); width: 100%; min-height: 2.25rem; padding: 0 var(--da-space-2); border: 0; border-radius: var(--da-radius-sm); color: var(--da-text-muted); background: transparent; cursor: pointer; text-align: left; }
.session-item:hover, .session-item.active { color: var(--da-text-emphasis); background: var(--da-surface-3); }
.session-item__dot { width: 0.3125rem; height: 0.3125rem; border-radius: 50%; background: var(--da-border-focus); }
.session-item.active .session-item__dot { background: var(--da-accent-orange); }
.session-item__name { overflow: hidden; font-size: var(--da-font-size-sm); text-overflow: ellipsis; white-space: nowrap; }
.sidebar-footer { padding-top: var(--da-space-3); border-top: 0.0625rem solid var(--da-border); }

@media (max-width: 52rem) {
  .conversation-sidebar { padding: var(--da-space-3) var(--da-space-2); }
  .sidebar-brand { justify-content: center; }
  .sidebar-brand > div, .sidebar-section, .sidebar-nav button b, .sidebar-footer button b { display: none; }
  .new-chat { min-width: 0; padding-inline: 0; font-size: 0; }
  .new-chat::after { content: '+'; font-size: 1.25rem; }
  .sidebar-nav button, .sidebar-footer button { justify-content: center; padding: 0; }
  .sidebar-nav button span, .sidebar-footer button span { width: auto; }
}
</style>
