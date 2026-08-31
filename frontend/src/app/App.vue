<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import ConversationSidebar from '../features/conversation/components/ConversationSidebar.vue'
import AgentChat from '../features/conversation/components/AgentChat.vue'
import HistoryPage from '../features/conversation/pages/HistoryPage.vue'
import SkillPage from '../features/skill/pages/SkillPage.vue'
import ToolPage from '../features/tool/pages/ToolPage.vue'
import { useSessions } from '../features/conversation/composables/useSessions'
import type { ConversationPage } from '../features/conversation/types'
import { applyTheme, readTheme, type AppTheme } from '../shared/theme/theme'

const page = ref<ConversationPage>('chat')
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
  page.value = next
}

function newConversation() {
  startNew()
  page.value = 'chat'
}

function openConversation(id: string) {
  select(id)
  page.value = 'chat'
}

function onMaterialized(sessionId: string, displayName: string) {
  materialize(sessionId, displayName)
  page.value = 'chat'
  void refresh()
}

async function renameConversation(id: string) {
  const current = rootSessions.value.find(item => item.id === id)
  if (!current) return
  try {
    const { value } = await ElMessageBox.prompt('输入需求名称', '重命名', {
      inputValue: current.displayName,
      inputPattern: /\S+/,
      inputErrorMessage: '名称不能为空',
      confirmButtonText: '保存',
      cancelButtonText: '取消',
    })
    rename(id, value)
  } catch {
    // user cancelled
  }
}

function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
  applyTheme(theme.value)
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
      <div v-if="loading && page === 'chat'" class="app-loading">
        <el-skeleton :rows="7" animated />
      </div>

      <AgentChat
        v-else-if="page === 'chat'"
        :session-id="activeSession?.id"
        :display-name="activeSession?.displayName"
        @materialized="onMaterialized"
        @changed="refresh()"
      />

      <HistoryPage
        v-else-if="page === 'history'"
        :sessions="rootSessions"
        :active-id="activeId"
        @create="newConversation"
        @select="openConversation"
        @rename="renameConversation"
        @refresh="refresh()"
      />

      <SkillPage v-else-if="page === 'skills'" />
      <ToolPage v-else :session-id="activeId" />
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
  overflow: hidden;
}

.app-loading {
  width: min(100% - 2rem, var(--da-content-max));
  margin: var(--da-space-8) auto;
  padding: var(--da-space-6);
  border: 0.0625rem solid var(--da-border);
  border-radius: var(--da-radius-lg);
  background: var(--da-surface-1);
}

@media (max-width: 52rem) {
  .dataagent-app {
    grid-template-columns: var(--da-sidebar-collapsed-width) minmax(0, 1fr);
  }
}
</style>
