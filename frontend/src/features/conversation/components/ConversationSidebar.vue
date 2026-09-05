<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ConversationPage, ConversationSession } from '../types'
import type { AppTheme } from '../../../shared/theme/theme'
import AgentMark from './AgentMark.vue'
import { presentSessions } from '../presentation'
import { toggleLocale } from '../../../i18n'

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

const { t, locale } = useI18n()
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
  if (seconds < 60) return t('common.justNow')
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return t('common.minutesAgo', { count: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('common.hoursAgo', { count: hours })
  const days = Math.floor(hours / 24)
  if (days < 7) return t('common.daysAgo', { count: days }, days)
  return new Intl.DateTimeFormat(locale.value, { month: '2-digit', day: '2-digit' }).format(new Date(timestamp))
}
</script>

<template>
  <aside class="conversation-sidebar">
    <div class="sidebar-brand">
      <span class="sidebar-brand__mark"><AgentMark /></span>
      <div><b>DATA AGENT</b><small>{{ t('sidebar.subtitle') }}</small></div>
      <span class="sidebar-brand__edition">WORKSPACE</span>
    </div>

    <el-button class="new-chat" type="primary" :aria-label="t('app.newRequest')" :title="t('app.newRequest')" @click="emit('create')">
      <span class="new-chat__icon" aria-hidden="true">+</span>
      <span>{{ t('app.newRequest') }}</span>
    </el-button>

    <div class="sidebar-section">
      <label class="sidebar-search">
        <span aria-hidden="true">
          <svg viewBox="0 0 20 20"><circle cx="8.5" cy="8.5" r="4.75"/><path d="m12 12 4 4"/></svg>
        </span>
        <input v-model="query" type="search" :placeholder="t('sidebar.search')" :aria-label="t('sidebar.search')" />
      </label>
      <div class="sidebar-section__title">
        <span>{{ t('sidebar.recent') }}</span>
        <button v-if="sessions.length" type="button" @click="emit('page', 'history')">{{ t('sidebar.viewAll') }}</button>
      </div>
      <div class="session-list">
        <button
          v-for="session in visibleSessions"
          :key="session.id"
          type="button"
          class="session-item"
          :class="{ active: activePage === 'chat' && activeId === session.id }"
          :aria-current="activePage === 'chat' && activeId === session.id ? 'page' : undefined"
          :title="session.presentationName"
          @click="emit('select', session.id)"
          @dblclick.stop="emit('rename', session.id)"
        >
          <span class="session-item__mark" aria-hidden="true"></span>
          <span class="session-item__copy">
            <span class="session-item__name">{{ session.presentationName }}</span>
            <small>{{ relativeTime(session.updatedAt) }}</small>
          </span>
        </button>
        <div v-if="!visibleSessions.length" class="session-empty">{{ query ? t('sidebar.noMatches') : t('sidebar.empty') }}</div>
      </div>
    </div>

    <nav class="sidebar-nav" :aria-label="t('sidebar.navigation')">
      <button :class="{ active: activePage === 'skills' }" :aria-current="activePage === 'skills' ? 'page' : undefined" :aria-label="t('app.skills')" :title="t('app.skills')" type="button" @click="emit('page', 'skills')">
        <span class="sidebar-icon" aria-hidden="true">
          <svg viewBox="0 0 20 20"><path d="M6.5 3.5h7v3h3v7h-3v3h-7v-3h-3v-7h3v-3Z"/><path d="M8 8h4v4H8z"/></svg>
        </span>
        <b>{{ t('app.skills') }}</b>
      </button>
      <button :class="{ active: activePage === 'tools' }" :aria-current="activePage === 'tools' ? 'page' : undefined" :aria-label="t('app.tools')" :title="t('app.tools')" type="button" @click="emit('page', 'tools')">
        <span class="sidebar-icon" aria-hidden="true">
          <svg viewBox="0 0 20 20"><path d="M7.2 5.1a3.5 3.5 0 0 0 4.5 4.5l4.1 4.1-2.1 2.1-4.1-4.1a3.5 3.5 0 0 0-4.5-4.5L7.4 8.4 5.6 6.6 7.2 5.1Z"/></svg>
        </span>
        <b>{{ t('app.tools') }}</b>
      </button>
    </nav>

    <footer class="sidebar-footer">
      <button type="button" @click="emit('toggleTheme')" :aria-label="theme === 'dark' ? t('app.lightMode') : t('app.darkMode')" :title="theme === 'dark' ? t('app.lightMode') : t('app.darkMode')">
        <span class="sidebar-icon" aria-hidden="true">
          <svg v-if="theme === 'dark'" viewBox="0 0 20 20"><circle cx="10" cy="10" r="3.25"/><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4"/></svg>
          <svg v-else viewBox="0 0 20 20"><path d="M15.8 12.5A6.2 6.2 0 0 1 7.5 4.2 6.2 6.2 0 1 0 15.8 12.5Z"/></svg>
        </span>
        <b>{{ theme === 'dark' ? t('app.lightMode') : t('app.darkMode') }}</b>
      </button>
      <button type="button" :aria-label="t('app.switchLanguage')" :title="t('app.switchLanguage')" @click="toggleLocale()">
        <span class="sidebar-icon sidebar-icon__language" aria-hidden="true">{{ t('app.languageGlyph') }}</span>
        <b>{{ t('app.language') }}</b>
      </button>
    </footer>
  </aside>
</template>

<style scoped>
.conversation-sidebar { position: relative; display: grid; grid-template-rows: auto auto minmax(0, 1fr) auto auto; width: 100%; height: 100%; min-height: 0; padding: var(--da-space-4); color: var(--da-text-primary); background: radial-gradient(ellipse at 0 0, var(--da-accent-primary-soft), transparent 42%), linear-gradient(180deg, var(--da-surface-sidebar), var(--da-surface-1)); }
.conversation-sidebar::after { position: absolute; top: 3rem; right: 0; width: 0.0625rem; height: 10rem; background: linear-gradient(transparent, color-mix(in srgb, var(--da-brand-cyan) 35%, transparent), transparent); pointer-events: none; content: ''; }
.sidebar-brand { display: flex; align-items: center; gap: var(--da-space-3); min-height: 3.125rem; margin-bottom: var(--da-space-5); }
.sidebar-brand__mark { position: relative; width: 2.25rem; height: 2.25rem; flex: 0 0 auto; }
.sidebar-brand__mark :deep(.agent-mark) { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) scale(0.75); transform-origin: center; }
.sidebar-brand > div { display: flex; min-width: 0; flex-direction: column; gap: 0.125rem; }
.sidebar-brand b { color: var(--da-text-emphasis); font-size: var(--da-font-size-sm); letter-spacing: 0.065em; white-space: nowrap; }
.sidebar-brand small { color: var(--da-text-subtle); font-size: var(--da-font-size-xs); }
.sidebar-brand__edition { margin-left: auto; padding: 0.1875rem 0.3125rem; border: 0.0625rem solid color-mix(in srgb, var(--da-brand-cyan) 20%, var(--da-border)); border-radius: 0.3125rem; color: var(--da-brand-cyan); background: color-mix(in srgb, var(--da-brand-cyan) 5%, transparent); font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 0.5rem; font-weight: 700; letter-spacing: 0.08em; }
.new-chat { position: relative; width: 100%; min-height: 2.75rem; margin-bottom: var(--da-space-5); overflow: hidden; border: 0.0625rem solid color-mix(in srgb, var(--da-accent-primary) 75%, var(--da-brand-cyan)); border-radius: var(--da-radius-lg); color: var(--da-text-on-accent); background: linear-gradient(120deg, var(--da-accent-primary-active), var(--da-accent-primary)); box-shadow: inset 0 0.0625rem rgb(255 255 255 / 18%), 0 0.375rem 1.25rem var(--da-accent-primary-soft); font-weight: 600; transition: transform 180ms ease, box-shadow 180ms ease, filter 180ms ease; }
.new-chat::after { position: absolute; inset: 0; background: linear-gradient(110deg, transparent 35%, rgb(255 255 255 / 10%), transparent 70%); transform: translateX(-100%); transition: transform 500ms ease; pointer-events: none; content: ''; }
.new-chat:hover { transform: translateY(-0.0625rem); filter: brightness(1.08); box-shadow: inset 0 0.0625rem rgb(255 255 255 / 20%), 0 0.5rem 1.5rem var(--da-brand-glow); }
.new-chat:hover::after { transform: translateX(100%); }
.new-chat:active { transform: translateY(0); }
.new-chat__icon { display: inline-grid; width: 1.25rem; height: 1.25rem; margin-right: var(--da-space-2); place-items: center; border: 0.0625rem solid rgb(255 255 255 / 25%); border-radius: 0.375rem; background: rgb(255 255 255 / 9%); font-size: 1rem; font-weight: 400; line-height: 1; }
.sidebar-section { min-height: 0; overflow: hidden; }
.sidebar-search { display: flex; min-height: 2.375rem; align-items: center; gap: var(--da-space-2); margin-bottom: var(--da-space-4); padding: 0 var(--da-space-3); border: 0.0625rem solid var(--da-border); border-radius: var(--da-radius-md); color: var(--da-text-subtle); background: color-mix(in srgb, var(--da-surface-2) 55%, transparent); transition: border-color 140ms ease, background-color 140ms ease; }
.sidebar-search:hover { border-color: var(--da-border-strong); }
.sidebar-search:focus-within { border-color: var(--da-border-focus); background: var(--da-surface-2); box-shadow: var(--da-ring-accent); }
.sidebar-search span { display: grid; width: 0.875rem; height: 0.875rem; flex: 0 0 auto; place-items: center; }
.sidebar-search svg { width: 100%; height: 100%; fill: none; stroke: currentColor; stroke-linecap: round; stroke-width: 1.4; }
.sidebar-search input { width: 100%; min-width: 0; padding: 0; border: 0; outline: 0; color: var(--da-text-primary); background: transparent; font-size: var(--da-font-size-xs); }
.sidebar-search input::placeholder { color: var(--da-text-subtle); }
.sidebar-section__title { display: flex; align-items: center; justify-content: space-between; padding: 0 var(--da-space-2) var(--da-space-2); color: var(--da-text-subtle); font-size: var(--da-font-size-xs); }
.sidebar-section__title button { padding: 0; border: 0; color: var(--da-text-muted); background: transparent; cursor: pointer; font-size: inherit; }
.sidebar-section__title button:hover { color: var(--da-accent-primary); }
.session-list { display: grid; height: calc(100% - 5rem); align-content: start; gap: var(--da-space-1); padding: 0.125rem; overflow: auto; scrollbar-width: thin; }
.session-item { position: relative; display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: var(--da-space-3); width: 100%; min-height: 3.5rem; padding: var(--da-space-2) var(--da-space-3); border: 0.0625rem solid transparent; border-radius: var(--da-radius-md); color: var(--da-text-muted); background: transparent; cursor: pointer; text-align: left; transition: color 160ms ease, background-color 160ms ease, border-color 160ms ease; }
.session-item:hover { border-color: var(--da-border); color: var(--da-text-primary); background: var(--da-surface-hover); }
.session-item.active { border-color: color-mix(in srgb, var(--da-accent-primary) 24%, transparent); color: var(--da-text-emphasis); background: linear-gradient(105deg, var(--da-accent-primary-soft), color-mix(in srgb, var(--da-accent-primary-soft) 35%, var(--da-surface-2))); box-shadow: inset 0 0.0625rem rgb(255 255 255 / 4%); }
.session-item.active::before { position: absolute; top: 0.875rem; bottom: 0.875rem; left: -0.0625rem; width: 0.1875rem; border-radius: 999rem; background: linear-gradient(var(--da-brand-cyan), var(--da-accent-primary)); box-shadow: 0 0 0.5rem var(--da-brand-glow); content: ''; }
.session-item__mark { width: 0.4375rem; height: 0.4375rem; border: 0.0625rem solid var(--da-text-subtle); border-radius: 50%; background: transparent; opacity: 0.55; }
.session-item.active .session-item__mark { border-color: transparent; background: var(--da-accent-primary); box-shadow: 0 0 0 0.1875rem var(--da-accent-primary-soft), 0 0 0.75rem var(--da-brand-glow); opacity: 1; }
.session-item__copy { display: grid; min-width: 0; gap: 0.1875rem; }
.session-item__name { overflow: hidden; font-size: var(--da-font-size-sm); text-overflow: ellipsis; white-space: nowrap; }
.session-item__copy small { color: var(--da-text-subtle); font-size: 0.6875rem; }
.session-empty { padding: var(--da-space-3) var(--da-space-2); color: var(--da-text-subtle); font-size: var(--da-font-size-xs); }
.sidebar-nav { display: grid; gap: var(--da-space-1); margin-top: var(--da-space-4); padding-top: var(--da-space-3); border-top: 0.0625rem solid var(--da-border); }
.sidebar-nav button, .sidebar-footer button { display: flex; align-items: center; gap: var(--da-space-3); width: 100%; min-height: 2.375rem; padding: 0 var(--da-space-3); border: 0; border-radius: var(--da-radius-md); color: var(--da-text-muted); background: transparent; cursor: pointer; text-align: left; transition: color 140ms ease, background-color 140ms ease; }
.sidebar-nav button:hover, .sidebar-footer button:hover { color: var(--da-text-emphasis); background: var(--da-surface-hover); }
.sidebar-nav button.active { color: var(--da-accent-primary); background: var(--da-accent-primary-soft); box-shadow: inset 0.125rem 0 var(--da-accent-primary); }
.conversation-sidebar button:focus-visible { outline: var(--da-focus-outline); outline-offset: 0.125rem; }
.sidebar-icon { display: grid; width: 1rem; height: 1rem; flex: 0 0 auto; place-items: center; }
.sidebar-icon svg { width: 1rem; height: 1rem; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.35; }
.sidebar-nav button b, .sidebar-footer button b { font-size: var(--da-font-size-sm); font-weight: 550; }
.sidebar-footer { display: grid; gap: var(--da-space-1); padding-top: var(--da-space-2); }
.sidebar-icon__language { color: var(--da-brand-cyan); font-size: var(--da-font-size-xs); font-weight: 700; }

@media (max-width: 52rem) {
  .conversation-sidebar { padding: var(--da-space-3) var(--da-space-2); }
  .sidebar-brand { justify-content: center; }
  .sidebar-brand > div, .sidebar-brand__edition, .sidebar-section, .sidebar-nav button b, .sidebar-footer button b { display: none; }
  .new-chat { min-width: 0; padding-inline: 0; font-size: 0; }
  .new-chat__icon { margin: 0; font-size: 1.25rem; }
  .sidebar-nav { grid-row: 4; }
  .sidebar-footer { grid-row: 5; }
  .sidebar-nav button, .sidebar-footer button { justify-content: center; padding: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .new-chat, .new-chat::after, .sidebar-search, .session-item, .sidebar-nav button, .sidebar-footer button { transition: none; }
  .new-chat:hover, .new-chat:hover::after { transform: none; }
  .new-chat::after { display: none; }
}
</style>
