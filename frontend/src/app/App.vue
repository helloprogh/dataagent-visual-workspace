<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { RouterView, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import ConversationSidebar from '../features/conversation/components/ConversationSidebar.vue'
import { useSessions } from '../features/conversation/composables/useSessions'
import type { ConversationPage } from '../features/conversation/types'
import { applyTheme, readTheme, type AppTheme } from '../shared/theme/theme'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const page = computed<ConversationPage>(() => {
  const value = route.meta.page
  return value === 'history' || value === 'skills' || value === 'tools' ? value : 'chat'
})
const theme = ref<AppTheme>(readTheme())
const {
  rootSessions,
  activeId,
  activeSession,
  loading,
  error,
  refresh,
  startNew,
  select,
  rename,
  materialize,
} = useSessions()

function switchPage(next: ConversationPage) {
  const query = next === 'chat' && activeId.value ? { session: activeId.value } : undefined
  void router.push({ name: next, ...(query ? { query } : {}) })
}

function newConversation() {
  startNew()
  void router.push({ name: 'chat' })
}

function openConversation(id: string) {
  select(id)
  void router.push({ name: 'chat', query: { session: id } })
}

function onMaterialized(sessionId: string, displayName: string) {
  materialize(sessionId, displayName)
  void router.replace({ name: 'chat', query: { session: sessionId } })
  void refresh()
}

async function renameConversation(id: string) {
  const current = rootSessions.value.find(item => item.id === id)
  if (!current) return
  try {
    const { value } = await ElMessageBox.prompt(t('app.renamePrompt'), t('app.renameTitle'), {
      inputValue: current.displayName,
      inputPattern: /\S+/,
      inputErrorMessage: t('app.nameRequired'),
      confirmButtonText: t('app.save'),
      cancelButtonText: t('app.cancel'),
    })
    rename(id, value)
  } catch {
    // user cancelled
  }
}

watch(() => route.query.session, value => {
  if (page.value !== 'chat') return
  const sessionId = typeof value === 'string' ? value.trim() : ''
  if (sessionId === activeId.value) return
  if (sessionId) select(sessionId)
  else startNew()
}, { immediate: true })

watch(activeId, value => {
  if (page.value !== 'chat') return
  const routeSession = typeof route.query.session === 'string' ? route.query.session : ''
  if (routeSession === value) return
  void router.replace({ query: value ? { session: value } : {} })
})

function toggleTheme() {
  const root = document.documentElement
  root.classList.add('da-theme-anim')
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
  applyTheme(theme.value)
  window.setTimeout(() => root.classList.remove('da-theme-anim'), 320)
}

onMounted(async () => {
  await refresh(true)
  if (error.value) ElMessage.warning(error.value)
})
</script>

<template>
  <main class="dataagent-app">
    <aside class="dataagent-app__sidebar">
      <ConversationSidebar
        :sessions="rootSessions"
        :active-id="activeId"
        :active-page="page"
        :theme="theme"
        @create="newConversation"
        @select="openConversation"
        @rename="renameConversation"
        @page="switchPage"
        @toggle-theme="toggleTheme"
      />
    </aside>

    <section class="dataagent-app__main">
      <RouterView v-slot="{ Component }">
        <Transition name="da-page" mode="out-in">
        <div v-if="loading && page === 'chat'" key="loading" class="app-loading">
          <el-skeleton :rows="7" animated />
        </div>

        <component
          :is="Component"
          v-else-if="page === 'chat'"
          key="chat"
          :session-id="activeSession?.id"
          :display-name="activeSession?.displayName"
          @materialized="onMaterialized"
          @changed="refresh()"
        />

        <component
          :is="Component"
          v-else-if="page === 'history'"
          key="history"
          :sessions="rootSessions"
          :active-id="activeId"
          @create="newConversation"
          @select="openConversation"
          @rename="renameConversation"
          @refresh="refresh()"
        />

        <component :is="Component" v-else-if="page === 'skills'" key="skills" />
        <component :is="Component" v-else key="tools" :session-id="activeId" />
        </Transition>
      </RouterView>
    </section>
  </main>
</template>

<style scoped>
.dataagent-app {
  display: grid;
  grid-template-columns: var(--da-sidebar-width) minmax(0, 1fr);
  width: 100%;
  height: 100%;
  min-height: 0;
  background: var(--da-surface-0);
}

.dataagent-app__sidebar,
.dataagent-app__main {
  min-width: 0;
  min-height: 0;
}

.dataagent-app__sidebar {
  border-right: 0.0625rem solid var(--da-border);
}

.dataagent-app__main {
  position: relative;
  container: workspace / inline-size;
  overflow: hidden;
  background:
    radial-gradient(52rem 28rem at 75% -10%, var(--da-brand-glow), transparent 66%),
    radial-gradient(36rem 24rem at 100% 18%, var(--da-accent-orange-glow), transparent 72%),
    linear-gradient(180deg, color-mix(in srgb, var(--da-surface-1) 55%, transparent) 0%, transparent 14rem),
    var(--da-surface-0);
}

.app-loading {
  width: min(100% - 2rem, var(--da-content-max));
  margin: var(--da-space-8) auto;
  padding: var(--da-space-6);
  border: 0.0625rem solid var(--da-border);
  border-radius: var(--da-radius-lg);
  background: var(--da-surface-1);
}

.da-page-enter-active,
.da-page-leave-active {
  transition: opacity 180ms ease, transform 180ms cubic-bezier(0.22, 1, 0.36, 1);
}

.da-page-enter-from {
  opacity: 0;
  transform: translateY(0.375rem);
}

.da-page-leave-to {
  opacity: 0;
  transform: translateY(-0.25rem);
}

html.da-theme-anim,
html.da-theme-anim body,
html.da-theme-anim .dataagent-app {
  transition: background-color 260ms ease, border-color 260ms ease, color 260ms ease;
}

@media (prefers-reduced-motion: reduce) {
  .da-page-enter-active,
  .da-page-leave-active {
    transition: opacity 1ms ease;
  }

  .da-page-enter-from,
  .da-page-leave-to {
    transform: none;
  }

  html.da-theme-anim,
  html.da-theme-anim body,
  html.da-theme-anim .dataagent-app {
    transition: none;
  }
}

@media (max-width: 52rem) {
  .dataagent-app {
    grid-template-columns: var(--da-sidebar-collapsed-width) minmax(0, 1fr);
  }
}
</style>
