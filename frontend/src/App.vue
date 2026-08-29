<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { CopilotKitProvider } from '@copilotkit/vue/v2'
import { createAgentRuntime } from './copilot/agent'
import { conversationRepository } from './conversations/local-repository'
import { createOpenCodeConversation } from './conversations/opencode-session'
import type { ConversationRecord } from './conversations/types'
import { workspaceController } from './workspace/store'
import GenUIBridge from './components/GenUIBridge.vue'
import WorkspaceCanvas from './components/WorkspaceCanvas.vue'
import AssistantPanel from './components/AssistantPanel.vue'
import AppSidebar from './components/AppSidebar.vue'
import HistoryView from './components/HistoryView.vue'
import SkillManagementView from './components/SkillManagementView.vue'
import ToolManagementView from './components/ToolManagementView.vue'
import ComponentGallery from './components/ComponentGallery.vue'

type AppPage = 'chat' | 'history' | 'skills' | 'tools'

const galleryMode = import.meta.env.VITE_COMPONENT_GALLERY === 'true'
  || new URLSearchParams(window.location.search).get('gallery') === 'components'
const runtime = createAgentRuntime()
const ACTIVE_CONVERSATION_KEY = 'dataagent.conversations.active.v2.session-thread'
const conversations = ref<ConversationRecord[]>([])
const activeId = ref(localStorage.getItem(ACTIVE_CONVERSATION_KEY) ?? '')
const renderAreaRequested = ref(false)
const renderAreaDismissed = ref(false)
const activePage = ref<AppPage>('chat')
const creatingConversation = ref(false)

function refreshConversations() {
  conversations.value = conversationRepository.list()
}

async function ensureConversation() {
  refreshConversations()
  if (conversations.value.length === 0) {
    activeId.value = ''
    await createConversation()
    return
  }
  if (!activeId.value || !conversationRepository.get(activeId.value)) {
    activeId.value = conversations.value[0].id
  }
}

if (!galleryMode) void ensureConversation()
watch(activeId, id => {
  if (galleryMode) return
  renderAreaRequested.value = false
  renderAreaDismissed.value = false
  if (!id) {
    localStorage.removeItem(ACTIVE_CONVERSATION_KEY)
    return
  }
  localStorage.setItem(ACTIVE_CONVERSATION_KEY, id)
  workspaceController.activate(id)
}, { immediate: true })

const activeConversation = computed(() => conversationRepository.get(activeId.value))
const renderWidgetCount = computed(() => workspaceController.state.document?.widgets.length ?? 0)
const renderAreaVisible = computed(() => (
  activePage.value === 'chat'
  && renderAreaRequested.value
  && renderWidgetCount.value > 0
  && !renderAreaDismissed.value
))

watch(() => workspaceController.state.presentationEpoch, () => {
  if (workspaceController.state.presentationThreadId !== activeId.value) return
  renderAreaRequested.value = true
  renderAreaDismissed.value = false
})

async function createConversation() {
  if (creatingConversation.value) return
  creatingConversation.value = true
  try {
    const sessionId = await createOpenCodeConversation()
    const created = conversationRepository.create(sessionId)
    activeId.value = created.id
    activePage.value = 'chat'
    refreshConversations()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error))
  } finally {
    creatingConversation.value = false
  }
}

function selectConversation(id: string) {
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

async function removeConversation(id: string) {
  try {
    await ElMessageBox.confirm('删除后将清除当前浏览器保存的需求记录与消息，是否继续？', '删除需求', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
    conversationRepository.remove(id)
    if (activeId.value === id) activeId.value = ''
    await ensureConversation()
    ElMessage.success('已删除')
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
  <CopilotKitProvider
    v-else
    :self-managed-agents="runtime.selfManagedAgents"
    :show-dev-console="false"
  >
    <GenUIBridge>
      <main class="dataagent-shell dataagent-shell--three-zone" :class="{ 'has-dynamic-workspace': renderAreaVisible }">
        <AppSidebar
          :conversations="conversations"
          :active-id="activeId"
          :active-page="activePage"
          @create="createConversation"
          @select="selectConversation"
          @rename="renameConversation"
          @remove="removeConversation"
          @open-history="activePage = 'history'"
          @open-skills="activePage = 'skills'"
          @open-tools="activePage = 'tools'"
        />

        <section class="app-main-stage" :class="{ 'app-main-stage--chat': activePage === 'chat' }">
          <AssistantPanel
            v-if="activePage === 'chat'"
            :active-id="activeId"
            :agent-id="runtime.agentId"
            :agent-display-name="runtime.displayName"
            :active-conversation="activeConversation"
            @create="createConversation"
            @changed="refreshConversations"
            @auto-rename="autoRename"
          />

          <HistoryView
            v-else-if="activePage === 'history'"
            :conversations="conversations"
            :active-id="activeId"
            @create="createConversation"
            @select="selectConversation"
            @rename="renameConversation"
            @remove="removeConversation"
          />

          <SkillManagementView v-else-if="activePage === 'skills'" />
          <ToolManagementView v-else :thread-id="activeId" />
        </section>

        <transition name="workspace-reveal">
          <aside v-if="renderAreaVisible" class="dynamic-workspace-shell">
            <button
              class="dynamic-workspace-close"
              type="button"
              title="收起动态渲染区"
              @click="renderAreaDismissed = true"
            >×</button>
            <WorkspaceCanvas />
          </aside>
        </transition>
      </main>
    </GenUIBridge>
  </CopilotKitProvider>
</template>