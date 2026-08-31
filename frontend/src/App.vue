<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { AGENT_DISPLAY_NAME, AGENT_ID } from './agui/agent'
import { artifactController } from './artifacts/store'
import { fetchConversationSessions } from './conversations/history-api'
import { conversationRepository } from './conversations/local-repository'
import type { ConversationRecord } from './conversations/types'
import { applyTheme, readTheme, type AppTheme } from './theme'
import AssistantPanel from './components/AssistantPanel.vue'
import AppSidebar from './components/AppSidebar.vue'
import ArtifactPanel from './components/artifacts/ArtifactPanel.vue'
import HistoryView from './components/HistoryView.vue'
import SkillManagementView from './components/SkillManagementView.vue'
import ToolManagementView from './components/ToolManagementView.vue'
import ComponentGallery from './components/ComponentGallery.vue'

type AppPage = 'chat' | 'history' | 'skills' | 'tools'

const galleryMode = import.meta.env.VITE_COMPONENT_GALLERY === 'true'
  || new URLSearchParams(window.location.search).get('gallery') === 'components'
const ACTIVE_CONVERSATION_KEY = 'dataagent.conversations.active.v2.session-thread'
const conversations = ref<ConversationRecord[]>([])
const rootConversations = computed(() => conversations.value.filter(item => !item.parentId && item.archivedAt == null))
const activeId = ref(localStorage.getItem(ACTIVE_CONVERSATION_KEY) ?? '')
const theme = ref<AppTheme>(readTheme())
const conversationListLoading = ref(!galleryMode)
const activePage = ref<AppPage>('chat')

function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
  applyTheme(theme.value)
}

function refreshConversations() {
  conversations.value = conversationRepository.list()
}

function startNewConversation() {
  artifactController.close()
  activeId.value = ''
  activePage.value = 'chat'
}

function ensureConversation() {
  refreshConversations()
  if (rootConversations.value.length === 0) {
    startNewConversation()
    return
  }
  const active = activeId.value ? conversationRepository.get(activeId.value) : undefined
  if (!active || active.parentId || active.archivedAt != null) activeId.value = rootConversations.value[0].id
}

let conversationListRequest = 0
let conversationListAbort: AbortController | undefined

async function loadConversationList(initial = false) {
  const request = ++conversationListRequest
  conversationListAbort?.abort()
  conversationListAbort = new AbortController()
  if (initial) conversationListLoading.value = true
  try {
    const sessions = await fetchConversationSessions(conversationListAbort.signal)
    if (request !== conversationListRequest) return
    conversationRepository.syncSessions(sessions)
    ensureConversation()
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return
    if (request !== conversationListRequest) return
    ensureConversation()
    const detail = error instanceof Error ? error.message : String(error)
    if (rootConversations.value.length) ElMessage.warning(`对话列表刷新失败，已保留当前页面数据：${detail}`)
    else ElMessage.error(detail)
  } finally {
    if (initial && request === conversationListRequest) conversationListLoading.value = false
  }
}

function openHistory() {
  artifactController.close()
  activePage.value = 'history'
  void loadConversationList()
}

if (!galleryMode) {
  refreshConversations()
  void loadConversationList(true)
}

watch(activeId, id => {
  if (galleryMode) return
  artifactController.close()
  if (!id) {
    localStorage.removeItem(ACTIVE_CONVERSATION_KEY)
    return
  }
  localStorage.setItem(ACTIVE_CONVERSATION_KEY, id)
}, { immediate: true })

watch(activePage, page => {
  if (page !== 'chat') artifactController.close()
})

const activeConversation = computed(() => conversationRepository.get(activeId.value))

function materializeConversation(sessionId: string) {
  const id = sessionId.trim()
  if (!id) return
  if (!conversationRepository.get(id)) conversationRepository.create(id)
  activeId.value = id
  activePage.value = 'chat'
  refreshConversations()
}

function selectConversation(id: string) {
  artifactController.close()
  activeId.value = id
  activePage.value = 'chat'
}

async function renameConversation(id: string) {
  const current = conversationRepository.get(id)
  if (!current) return
  try {
    const { value } = await ElMessageBox.prompt('输入需求名称', '重命名', {
      inputValue: current.displayName,
      inputPattern: /\S+/,
      inputErrorMessage: '名称不能为空',
      confirmButtonText: '保存',
      cancelButtonText: '取消',
    })
    conversationRepository.rename(id, value)
    refreshConversations()
  } catch {
    // cancelled
  }
}

function autoRename(name: string) {
  if (!activeId.value) return
  conversationRepository.rename(activeId.value, name)
  refreshConversations()
}
</script>

<template>
  <ComponentGallery v-if="galleryMode" />
  <main v-else class="dataagent-shell dataagent-shell--conversation" :class="{ 'has-artifact-panel': artifactController.state.open }">
    <AppSidebar
      :conversations="rootConversations"
      :active-id="activeId"
      :active-page="activePage"
      :theme="theme"
      @create="startNewConversation"
      @select="selectConversation"
      @rename="renameConversation"
      @open-history="openHistory"
      @open-skills="activePage = 'skills'"
      @open-tools="activePage = 'tools'"
      @toggle-theme="toggleTheme"
    />

    <section class="app-main-stage" :class="{ 'app-main-stage--chat': activePage === 'chat' }">
      <div v-if="activePage === 'chat' && conversationListLoading" class="conversation-bootstrap-loading">
        <el-skeleton :rows="7" animated />
      </div>

      <AssistantPanel
        v-else-if="activePage === 'chat'"
        :active-id="activeId"
        :agent-id="AGENT_ID"
        :agent-display-name="AGENT_DISPLAY_NAME"
        :active-conversation="activeConversation"
        @materialized="materializeConversation"
        @changed="refreshConversations"
        @auto-rename="autoRename"
      />

      <HistoryView
        v-else-if="activePage === 'history'"
        :conversations="rootConversations"
        :active-id="activeId"
        @create="startNewConversation"
        @select="selectConversation"
        @rename="renameConversation"
      />

      <SkillManagementView v-else-if="activePage === 'skills'" />
      <ToolManagementView v-else :thread-id="activeId" />
    </section>

    <transition name="artifact-reveal">
      <ArtifactPanel v-if="activePage === 'chat'" />
    </transition>
  </main>
</template>

<style scoped>
.conversation-bootstrap-loading{position:relative;z-index:2;width:min(100%,1040px);height:100%;padding:34px;border:1px solid var(--da-border);border-radius:12px;background:var(--da-surface-1)}
</style>
