<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { CopilotChat, CopilotChatInput, CopilotChatMessageView, useAgent } from '@copilotkit/vue/v2'
import type { AbstractAgent, Message } from '@ag-ui/client'
import { ElMessage } from 'element-plus'
import { conversationRepository, deriveConversationName } from '../../conversations/local-repository'
import { createOpenCodeConversation, interruptOpenCodeConversation } from '../../conversations/opencode-session'
import { setSelectedModel, type ModelSelection } from '../../model/model-selection'
import { workspaceController } from '../../workspace/store'
import DraftModelSelector from '../DraftModelSelector.vue'
import ModelSelector from '../ModelSelector.vue'
import AguiInterruptCard from './AguiInterruptCard.vue'
import AguiInterruptController from './AguiInterruptController.vue'
import ReasoningAwareAssistantMessage from './ReasoningAwareAssistantMessage.vue'
import ReasoningProcessCard from './ReasoningProcessCard.vue'

const props = defineProps<{
  agentId: string
  threadId: string
  displayName: string
  agentDisplayName: string
  draft?: boolean
}>()

const emit = defineEmits<{
  changed: []
  rename: [name: string]
  materialized: [sessionId: string]
}>()

const hydrated = ref(false)
const hasMessages = ref(false)
// CopilotChat resolves the registry agent without a thread-specific clone and
// assigns agent.threadId itself. Use that same instance here so first-send
// materialization updates the exact agent that will issue the AG-UI run.
const { agent } = useAgent({
  agentId: () => props.agentId,
  throttleMs: 60,
  updates: [],
})
const hasInterrupts = ref(false)
const stopping = ref(false)
const creatingSession = ref(false)
const draftModel = ref<ModelSelection | null>(null)
const materializedSessionId = ref('')
let persistTimer: number | undefined
let currentAgent: AbstractAgent | null = null
let currentThreadId = ''
let agentSubscription: { unsubscribe: () => void } | null = null

const pendingDraftFiles = new Map<string, { file: File; previewUrl: string }>()
const chatLabels = computed(() => ({
  chatInputPlaceholder: '描述你的数据需求或业务目标',
  chatInputToolbarAddButtonLabel: '上传文件',
  welcomeMessageText: `我是 ${props.agentDisplayName}，你的 SA 数据需求开发与交付助手。`,
  modalHeaderTitle: props.agentDisplayName,
})) as any

const uploadUrl = '/dataagent/web/api/agui/file/upload'
const attachmentsConfig = computed(() => ({
  enabled: true,
  accept: '*/*',
  maxSize: 20 * 1024 * 1024,
  onUpload: prepareAttachment,
  onUploadFailed: ({ message }: { message: string }) => ElMessage.error(message),
}))

function effectiveSessionId() {
  return props.threadId.trim() || materializedSessionId.value
}

function draftToken() {
  const suffix = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `draft-upload:${suffix}`
}

function clearPendingDraftFiles() {
  for (const { previewUrl } of pendingDraftFiles.values()) URL.revokeObjectURL(previewUrl)
  pendingDraftFiles.clear()
}

async function prepareAttachment(file: File) {
  const sessionId = effectiveSessionId()
  if (sessionId) return uploadAttachment(file, sessionId)

  // A new conversation has no backend session yet. Keep the File only in
  // browser memory and give CopilotKit a local preview source. The real upload
  // is deferred until the first agent run, after the session has been created.
  const token = draftToken()
  const previewUrl = URL.createObjectURL(file)
  pendingDraftFiles.set(token, { file, previewUrl })
  return {
    type: 'url' as const,
    value: previewUrl,
    mimeType: file.type || 'application/octet-stream',
    metadata: {
      draftUploadToken: token,
      filename: file.name,
      size: file.size,
    },
  }
}

async function uploadAttachment(file: File, threadId: string) {
  const formData = new FormData()
  formData.append('file', file, file.name)
  formData.append('threadId', threadId)
  const headers = new Headers()
  const token = import.meta.env.VITE_AGUI_TOKEN
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers,
    body: formData,
  })
  if (!response.ok) {
    let detail = ''
    try {
      const body = await response.json()
      detail = body?.message ?? body?.error?.message ?? body?.error ?? ''
    } catch {
      detail = await response.text().catch(() => '')
    }
    throw new Error(`文件上传失败 (${response.status})${detail ? `: ${detail}` : ''}`)
  }

  const body = await response.json()
  const uploaded = body?.data ?? body?.file ?? body
  const fileId = uploaded?.fileId ?? uploaded?.file_id ?? uploaded?.id
  const source = uploaded?.url ?? uploaded?.uri ?? uploaded?.downloadUrl ?? uploaded?.download_url ?? uploaded?.path ?? fileId ?? file.name
  if (!source) throw new Error('上传接口未返回 fileId、文件地址或文件名')

  return {
    type: 'url' as const,
    value: String(source),
    mimeType: (uploaded?.mimeType ?? uploaded?.mime_type ?? uploaded?.contentType ?? file.type) || 'application/octet-stream',
    metadata: {
      ...(fileId ? { fileId: String(fileId) } : {}),
      filename: uploaded?.filename ?? uploaded?.name ?? file.name,
      size: uploaded?.size ?? file.size,
    },
  }
}

async function materializeDraftAttachments(threadId: string, messages: readonly Message[]): Promise<Message[] | undefined> {
  if (!pendingDraftFiles.size) return undefined
  const next = structuredClone(messages) as Message[]
  let changed = false

  for (const message of next) {
    if (!Array.isArray(message.content)) continue
    for (const rawPart of message.content) {
      if (!rawPart || typeof rawPart !== 'object') continue
      const part = rawPart as {
        source?: { type?: string; value?: string; mimeType?: string }
        metadata?: Record<string, unknown>
      }
      const token = part.metadata?.draftUploadToken
      if (typeof token !== 'string') continue
      const staged = pendingDraftFiles.get(token)
      if (!staged) continue

      const uploaded = await uploadAttachment(staged.file, threadId)
      part.source = {
        type: uploaded.type,
        value: uploaded.value,
        mimeType: uploaded.mimeType,
      }
      part.metadata = uploaded.metadata
      URL.revokeObjectURL(staged.previewUrl)
      pendingDraftFiles.delete(token)
      changed = true
    }
  }

  return changed ? next : undefined
}

function persistSnapshot(threadId: string, target: AbstractAgent, immediate = false) {
  if (!threadId) return
  const save = () => {
    conversationRepository.saveSnapshot(threadId, target.messages, target.state)
    emit('changed')
  }
  if (immediate) {
    if (persistTimer) window.clearTimeout(persistTimer)
    persistTimer = undefined
    save()
    return
  }
  if (persistTimer) window.clearTimeout(persistTimer)
  persistTimer = window.setTimeout(save, 100)
}

function releaseCurrentAgent() {
  const threadId = currentThreadId || materializedSessionId.value
  if (currentAgent && threadId) persistSnapshot(threadId, currentAgent, true)
  agentSubscription?.unsubscribe()
  agentSubscription = null
  currentAgent = null
  currentThreadId = ''
}

watch([agent, () => props.threadId, () => props.draft], ([nextAgent, nextThreadId, isDraft]) => {
  if (nextAgent && currentAgent === nextAgent && currentThreadId === nextThreadId) return

  hydrated.value = false
  hasInterrupts.value = false
  releaseCurrentAgent()
  if (!nextAgent) return

  if (!nextThreadId && isDraft) {
    materializedSessionId.value = ''
    draftModel.value = null
    clearPendingDraftFiles()
  } else if (nextThreadId && materializedSessionId.value && nextThreadId !== materializedSessionId.value) {
    materializedSessionId.value = ''
  }

  const threadId = nextThreadId
  currentAgent = nextAgent
  currentThreadId = threadId
  const conversation = threadId ? conversationRepository.get(threadId) : undefined
  hasMessages.value = Boolean(conversation?.messages.length)
  if (conversation) {
    nextAgent.setMessages(conversation.messages)
    nextAgent.setState(conversation.state)
  } else if (isDraft) {
    nextAgent.setMessages([])
    nextAgent.setState({})
  }

  // Never leak the previous conversation's workspace into the local-only draft.
  const workspace = threadId ? workspaceController.snapshot() : null
  if (workspace) nextAgent.setState({ ...(nextAgent.state ?? {}), workspace })
  agentSubscription = nextAgent.subscribe({
    onRunInitialized: async ({ messages }) => {
      const targetId = effectiveSessionId()
      if (!targetId || !pendingDraftFiles.size) return
      try {
        const nextMessages = await materializeDraftAttachments(targetId, messages)
        return nextMessages ? { messages: nextMessages } : undefined
      } catch (error) {
        ElMessage.error(error instanceof Error ? error.message : String(error))
        throw error
      }
    },
    onMessagesChanged: ({ agent: changedAgent }) => {
      const targetId = effectiveSessionId()
      if (targetId) persistSnapshot(targetId, changedAgent)
    },
    onStateChanged: ({ agent: changedAgent }) => {
      const targetId = effectiveSessionId()
      const workspace = (changedAgent.state as { workspace?: unknown })?.workspace
      if (targetId && workspace && typeof workspace === 'object') workspaceController.applyShared(workspace as any)
      if (targetId) persistSnapshot(targetId, changedAgent)
    },
  })
  hydrated.value = true
}, { immediate: true })

async function ensureSessionForFirstSend(value: string) {
  const existing = effectiveSessionId()
  if (existing) return existing
  if (!props.draft) throw new Error('当前会话缺少 sessionId')
  if (!draftModel.value) throw new Error('模型尚未加载完成，请稍后再发送')
  if (creatingSession.value) throw new Error('会话正在创建，请稍后重试')

  creatingSession.value = true
  try {
    const sessionId = await createOpenCodeConversation(draftModel.value)
    materializedSessionId.value = sessionId
    if (agent.value) agent.value.threadId = sessionId

    // The session already owns this model because it was supplied to the
    // creation API. Persist the selection locally without calling the separate
    // model-switch endpoint.
    setSelectedModel(sessionId, draftModel.value)
    conversationRepository.create(sessionId, deriveConversationName(value))
    emit('materialized', sessionId)
    return sessionId
  } finally {
    creatingSession.value = false
  }
}

async function handleInputSubmit(value: string, submit: (value: string) => void | Promise<void>) {
  try {
    await ensureSessionForFirstSend(value)
    await submit(value)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error))
  }
}

function onSubmitMessage(value: string) {
  hasMessages.value = true
  if (!props.draft && (props.displayName === '新需求' || props.displayName === '新对话' || props.displayName === '新分析')) {
    emit('rename', deriveConversationName(value))
  }
}

async function onStop() {
  if (stopping.value) return
  const sessionId = effectiveSessionId()
  if (!sessionId) return
  stopping.value = true
  try {
    // CopilotChat handles the AG-UI run abort internally. This companion call
    // stops the actual OpenCode session so backend model/tool work does not
    // continue after the UI stream has been cancelled.
    await interruptOpenCodeConversation(sessionId)
  } catch (error) {
    ElMessage.error(`对话已停止显示，但后端中断失败：${error instanceof Error ? error.message : String(error)}`)
  } finally {
    stopping.value = false
  }
}

function handleInputStop(stop?: () => void) {
  // Stop the CopilotKit/AG-UI run abort immediately, then explicitly interrupt the
  // matching OpenCode session. Do not rely solely on CopilotChat's outer stop
  // event bubbling when a custom input slot is used.
  stop?.()
  void onStop()
}

onBeforeUnmount(() => {
  if (persistTimer) window.clearTimeout(persistTimer)
  clearPendingDraftFiles()
  releaseCurrentAgent()
})
</script>

<template>
  <div
    class="conversation-chat visual-chat dark"
    :class="{
      'has-interrupts': hasInterrupts,
      'is-empty': hydrated && !hasMessages,
    }"
  >
    <div v-if="!hydrated" class="chat-loading"><el-skeleton :rows="5" animated /></div>
    <CopilotChat
      v-else
      :agent-id="agentId"
      :thread-id="threadId || undefined"
      :labels="chatLabels"
      :attachments="attachmentsConfig"
      :throttle-ms="60"
      @submit-message="onSubmitMessage"
      @stop="onStop"
    >
      <template #input="inputProps">
        <AguiInterruptController @active-change="hasInterrupts = $event" />
        <div class="conversation-input-layout" :class="{ 'conversation-input-layout--empty': !hasMessages }">
          <section v-if="!hasMessages" class="conversation-welcome">
            <span class="conversation-welcome__eyebrow"><i></i>DATA AGENT</span>
            <h2>从一个清晰的数据目标开始</h2>
            <p>描述你的数据业务目标，我将与你逐步澄清需求，并自主完成Specification、数据方案、数据集成、ETL开发、治理验证与交付。</p>
            <div class="conversation-welcome__capabilities" aria-label="可用能力">
              <span>经营分析</span>
              <span>SQL 与治理</span>
              <span>生成式工作区</span>
            </div>
          </section>

          <div class="conversation-composer">
            <div class="conversation-composer__controls">
              <DraftModelSelector
                v-if="draft && !threadId"
                :disabled="Boolean(inputProps.isRunning) || hasInterrupts || creatingSession"
                @selected="draftModel = $event"
              />
              <ModelSelector
                v-else
                :thread-id="threadId || materializedSessionId"
                :disabled="Boolean(inputProps.isRunning) || hasInterrupts || creatingSession"
              />
            </div>
            <CopilotChatInput
              :model-value="inputProps.modelValue"
              :is-running="inputProps.isRunning"
              :mode="inputProps.inputMode"
              :tools-menu="inputProps.inputToolsMenu"
              class="conversation-composer__input"
              positioning="static"
              @update:model-value="inputProps.onUpdateModelValue"
              @submit-message="handleInputSubmit($event, inputProps.onSubmitMessage)"
              @stop="handleInputStop(inputProps.onStop)"
              @add-file="inputProps.onAddFile"
              @start-transcribe="inputProps.onStartTranscribe"
              @cancel-transcribe="inputProps.onCancelTranscribe"
              @finish-transcribe="inputProps.onFinishTranscribe"
              @finish-transcribe-with-audio="inputProps.onFinishTranscribeWithAudio"
            >
              <template #send-button="{ disabled, isProcessing, onClick }">
                <div class="conversation-composer__send-wrap">
                  <button
                    type="button"
                    data-testid="copilot-chat-input-send"
                    :data-processing="isProcessing ? 'true' : 'false'"
                    :aria-label="isProcessing ? '停止生成' : '发送消息'"
                    :title="isProcessing ? '停止生成' : '发送消息'"
                    :disabled="!isProcessing && (disabled || creatingSession || Boolean(draft && !draftModel))"
                    @click="isProcessing ? handleInputStop(inputProps.onStop) : onClick()"
                  >
                    <span class="conversation-composer__send-icon" aria-hidden="true"></span>
                  </button>
                </div>
              </template>
            </CopilotChatInput>
          </div>
        </div>
      </template>

      <!-- CopilotChat@1.64.1 types its top-level interrupt slot too narrowly.
           The public CopilotChatMessageView exposes the complete native
           InterruptRenderProps, so render messages through that supported
           extension point instead of weakening local types or lifecycle. -->
      <template #message-view="{ messages, isRunning }">
        <CopilotChatMessageView :messages="messages" :is-running="isRunning">
          <template #assistant-message="{ message, messages: allMessages, isRunning: messageRunning }">
            <ReasoningAwareAssistantMessage
              :message="message"
              :messages="allMessages"
              :is-running="messageRunning"
            />
          </template>
          <template #reasoning-message="{ message, messages: allMessages, isRunning: messageRunning }">
            <ReasoningProcessCard
              :message="message"
              :messages="allMessages"
              :is-running="messageRunning"
            />
          </template>
          <template #interrupt="{ interrupt, interrupts, resolve, cancel }">
            <AguiInterruptCard
              :interrupt="interrupt"
              :interrupts="interrupts"
              :resolve="resolve"
              :cancel="cancel"
            />
          </template>
        </CopilotChatMessageView>
      </template>
    </CopilotChat>
  </div>
</template>

<style scoped>
.conversation-chat{position:relative;width:100%;height:100%;min-height:0}
.conversation-input-layout{width:100%;min-width:0}
.conversation-input-layout--empty{width:min(720px,100%);display:flex;flex-direction:column;gap:28px;pointer-events:auto}
.conversation-welcome{width:100%;max-width:680px;margin:0 auto;padding:0 20px;text-align:center;pointer-events:none}
.conversation-welcome__eyebrow{display:inline-flex;align-items:center;gap:8px;color:var(--da-text-muted);font-size:11px;font-weight:600;letter-spacing:.12em}
.conversation-welcome__eyebrow i{width:20px;height:1px;background:var(--da-accent-orange);box-shadow:0 0 12px var(--da-accent-orange-glow)}
.conversation-welcome h2{margin:16px 0 10px;color:var(--da-text-emphasis);font-family:Georgia,"Times New Roman","Songti SC",serif;font-size:34px;line-height:1.18;font-weight:400;letter-spacing:-.04em}
.conversation-welcome p{max-width:640px;margin:0 auto;color:var(--da-text-muted);font-size:13px;line-height:1.7;text-wrap:balance}
.conversation-welcome__capabilities{margin-top:21px;display:flex;justify-content:center;flex-wrap:wrap;gap:7px}
.conversation-welcome__capabilities span{padding:5px 9px;border:1px solid var(--da-border);border-radius:6px;background:var(--da-surface-deep);color:var(--da-text-secondary);font-size:11px}
:deep([data-testid="copilot-chat-view"]){height:100%!important;min-height:0!important}
:deep([data-testid="copilot-input-overlay"]){left:14px!important;right:14px!important;bottom:14px!important}
.conversation-chat.is-empty :deep([data-testid="copilot-input-overlay"]){inset:0!important;width:auto!important;max-width:none!important;padding:28px 40px!important;display:grid!important;place-items:center!important;transform:none!important;pointer-events:none}
:deep([data-testid="copilot-chat-view-scroll"]){padding-right:8px!important;scrollbar-gutter:stable;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.14) transparent}
:deep([data-testid="copilot-chat-view-scroll"]::-webkit-scrollbar){width:8px}
:deep([data-testid="copilot-chat-view-scroll"]::-webkit-scrollbar-track){background:transparent}
:deep([data-testid="copilot-chat-view-scroll"]::-webkit-scrollbar-thumb){min-height:44px;border:2px solid transparent;border-radius:999px;background:rgba(255,255,255,.14);background-clip:padding-box}
:deep([data-testid="copilot-chat-view-scroll"]::-webkit-scrollbar-thumb:hover){background:rgba(255,255,255,.26);background-clip:padding-box}

/* CopilotKit attachment queue — this component is the sole visual owner. */
:deep([data-testid="copilot-chat-attachment-queue"]){gap:8px!important;padding:0 12px 8px!important;margin:0!important;align-items:center}
:deep([data-testid="copilot-chat-attachment-item"]){position:relative!important;border:1px solid var(--da-border)!important;border-radius:10px!important;background:var(--da-surface-2)!important;box-shadow:none!important;overflow:hidden!important;transition:border-color .15s ease,background .15s ease}
:deep([data-testid="copilot-chat-attachment-item"]:hover){border-color:var(--da-border-strong)!important;background:var(--da-surface-3)!important}
:deep([data-testid="copilot-chat-attachment-item"][data-card-type="document"]){min-width:190px!important;max-width:258px!important;min-height:52px!important;padding:7px 32px 7px 8px!important}
:deep([data-testid="copilot-chat-attachment-item"][data-card-type="audio"]){min-width:224px!important;max-width:286px!important;padding:7px 32px 7px 8px!important}
:deep([data-testid="copilot-chat-attachment-item"][data-card-type="image"]),:deep([data-testid="copilot-chat-attachment-item"][data-card-type="video"]){width:56px!important;height:56px!important;border-radius:10px!important}
:deep([data-testid="copilot-chat-attachment-image-thumbnail"]),:deep([data-testid="copilot-chat-attachment-video-thumbnail"]),:deep([data-testid="copilot-chat-attachment-video-fallback"]){border-radius:9px!important}
:deep([data-testid="copilot-chat-attachment-document-button"]){gap:8px!important;color:var(--da-text-primary)!important;align-items:center!important;cursor:pointer!important}
:deep([data-testid="copilot-chat-attachment-document-button"]>div:first-child){width:34px!important;height:34px!important;border:1px solid rgba(139,159,210,.15)!important;border-radius:9px!important;background:rgba(139,159,210,.045)!important;box-shadow:none!important;color:var(--da-text-secondary)!important;font-size:9px!important;font-weight:700!important;letter-spacing:.03em!important}
:deep([data-testid="copilot-chat-attachment-document-filename"]){display:block!important;max-width:170px!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;color:var(--da-text-primary)!important;font-size:11px!important;font-weight:600!important;line-height:1.35!important}
:deep([data-testid="copilot-chat-attachment-document-button"]>div:last-child>span:last-child){display:flex!important;align-items:center!important;margin-top:3px!important;color:var(--da-text-muted)!important;font-size:10px!important;line-height:1!important}
:deep([data-testid="copilot-chat-attachment-document-button"]>div:last-child>span:last-child)::before{content:'';display:inline-block;width:4px;height:4px;margin-right:5px;border-radius:50%;background:var(--da-accent-green)}
:deep([data-testid="copilot-chat-attachment-item"]>button[aria-label="Remove attachment"]){top:7px!important;right:7px!important;width:18px!important;height:18px!important;border:1px solid transparent!important;background:transparent!important;color:var(--da-text-subtle)!important;font-size:9px!important;opacity:.8!important;transition:background .15s ease,color .15s ease,border-color .15s ease}
:deep([data-testid="copilot-chat-attachment-item"]>button[aria-label="Remove attachment"]:hover){border-color:var(--da-border)!important;background:rgba(255,255,255,.03)!important;color:var(--da-text-primary)!important;opacity:1!important}
:deep([data-testid="copilot-chat-attachment-uploading-overlay"]){gap:7px!important;background:rgba(10,17,24,.88)!important;backdrop-filter:blur(6px)}
:deep([data-testid="copilot-chat-attachment-uploading-overlay"]>div){width:14px!important;height:14px!important;border-width:1.5px!important;border-color:var(--da-accent-blue)!important;border-top-color:transparent!important}
:deep([data-testid="copilot-chat-attachment-uploading-overlay"])::after{content:'上传中';color:var(--da-text-secondary);font-size:10px;font-weight:600;letter-spacing:.02em}
:deep([data-testid="copilot-chat-drop-overlay"]){margin:10px!important;border:1px dashed rgba(139,159,210,.34)!important;border-radius:13px!important;background:rgba(14,23,31,.92)!important;box-shadow:none!important;backdrop-filter:blur(10px)}
:deep([data-testid="copilot-chat-drop-overlay"] span){color:var(--da-text-secondary)!important;font-size:12px!important;font-weight:580!important;letter-spacing:0!important}

.has-interrupts :deep([data-testid="copilot-chat-input-shell"]){opacity:1;pointer-events:auto}
.has-interrupts :deep([data-testid="copilot-chat-input-textarea"]),.has-interrupts :deep([data-testid="copilot-chat-input-add"]){opacity:.52;pointer-events:none;cursor:not-allowed}

@media(max-width:540px){
  .conversation-chat.is-empty :deep([data-testid="copilot-input-overlay"]){padding:18px 14px!important}
  .conversation-input-layout--empty{gap:22px}
  .conversation-welcome{width:100%;padding:0 8px}
  .conversation-welcome h2{font-size:28px}
  :deep([data-testid="copilot-chat-attachment-queue"]){padding-left:8px!important;padding-right:8px!important}
  :deep([data-testid="copilot-chat-attachment-item"][data-card-type="document"]){min-width:174px!important;max-width:100%!important}
  :deep([data-testid="copilot-chat-attachment-document-filename"]){max-width:142px!important}
}
</style>
