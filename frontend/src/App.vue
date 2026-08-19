<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { CopilotKitProvider } from '@copilotkit/vue/v2'
import { createAgentRuntime } from './copilot/agent'
import { conversationRepository } from './conversations/local-repository'
import type { ConversationRecord } from './conversations/types'
import { workspaceController } from './workspace/store'
import GenUIBridge from './components/GenUIBridge.vue'
import WorkspaceCanvas from './components/WorkspaceCanvas.vue'
import AssistantPanel from './components/AssistantPanel.vue'
import AppSidebar from './components/AppSidebar.vue'

const runtime = createAgentRuntime()
const showDevConsole = import.meta.env.DEV
const ACTIVE_CONVERSATION_KEY = 'dataagent.conversations.active.v1'
const conversations = ref<ConversationRecord[]>([])
const activeId = ref(localStorage.getItem(ACTIVE_CONVERSATION_KEY) ?? '')
const workspaceDismissed = ref(false)

function refreshConversations() {
  conversations.value = conversationRepository.list()
}

function ensureConversation() {
  refreshConversations()
  if (conversations.value.length === 0) {
    const created = conversationRepository.create('新需求')
    refreshConversations()
    activeId.value = created.id
    return
  }
  if (!activeId.value || !conversationRepository.get(activeId.value)) {
    activeId.value = conversations.value[0].id
  }
}

ensureConversation()
watch(activeId, id => {
  workspaceDismissed.value = false
  if (!id) {
    localStorage.removeItem(ACTIVE_CONVERSATION_KEY)
    return
  }
  localStorage.setItem(ACTIVE_CONVERSATION_KEY, id)
  workspaceController.activate(id)
}, { immediate: true })

const activeConversation = computed(() => conversationRepository.get(activeId.value))
const workspaceCount = computed(() => workspaceController.state.document?.widgets.length ?? 0)
const workspaceVisible = computed(() => workspaceCount.value > 0 && !workspaceDismissed.value)

watch(workspaceCount, (next, previous) => {
  if (next > previous) workspaceDismissed.value = false
})

function createConversation() {
  const created = conversationRepository.create()
  activeId.value = created.id
  refreshConversations()
}

function selectConversation(id: string) {
  activeId.value = id
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
    ensureConversation()
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
  <CopilotKitProvider
    :self-managed-agents="runtime.selfManagedAgents"
    :show-dev-console="showDevConsole"
  >
    <GenUIBridge>
      <main class="dataagent-shell dataagent-shell--three-zone" :class="{ 'has-dynamic-workspace': workspaceVisible }">
        <AppSidebar
          :conversations="conversations"
          :active-id="activeId"
          :workspace-count="workspaceCount"
          :workspace-visible="workspaceVisible"
          @create="createConversation"
          @select="selectConversation"
          @rename="renameConversation"
          @remove="removeConversation"
          @open-workspace="workspaceDismissed = false"
        />

        <section class="chat-stage">
          <AssistantPanel
            :active-id="activeId"
            :agent-id="runtime.agentId"
            :agent-display-name="runtime.displayName"
            :active-conversation="activeConversation"
            @create="createConversation"
            @changed="refreshConversations"
            @auto-rename="autoRename"
          />
        </section>

        <transition name="workspace-reveal">
          <aside v-if="workspaceVisible" class="dynamic-workspace-shell">
            <button
              class="dynamic-workspace-close"
              type="button"
              title="收起动态工作空间"
              @click="workspaceDismissed = true"
            >×</button>
            <WorkspaceCanvas />
          </aside>
        </transition>
      </main>
    </GenUIBridge>
  </CopilotKitProvider>
</template>
