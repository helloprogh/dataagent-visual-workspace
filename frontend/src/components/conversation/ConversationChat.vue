<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { CopilotChat, CopilotChatInput, CopilotChatMessageView, useAgent } from '@copilotkit/vue/v2'
import type { AbstractAgent } from '@ag-ui/client'
import { ElMessage } from 'element-plus'
import { conversationRepository, deriveConversationName } from '../../conversations/local-repository'
import { interruptOpenCodeConversation } from '../../conversations/opencode-session'
import { workspaceController } from '../../workspace/store'
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
}>()

const emit = defineEmits<{ changed: []; rename: [name: string] }>()
const hydrated = ref(false)
// This hook is used only to resolve the per-thread agent instance. CopilotChat
// owns reactive rendering. Disabling hook update notifications prevents the
// same shallowRef from being re-triggered for every streamed message and then
// accidentally re-running the one-time local-history hydration below.
const { agent } = useAgent({
  agentId: () => props.agentId,
  threadId: () => props.threadId,
  throttleMs: 60,
  updates: [],
})
const hasInterrupts = ref(false)
const stopping = ref(false)
let persistTimer: number | undefined
let currentAgent: AbstractAgent | null = null
let currentThreadId = ''
let agentSubscription: { unsubscribe: () => void } | null = null
const chatLabels = computed(() => ({
  chatInputPlaceholder: '描述你的数据需求或业务目标',
  chatInputToolbarAddButtonLabel: '上传文件',
  welcomeMessageText: `我是 ${props.agentDisplayName}，你的 SA 数据需求开发与交付助手。`,
  modalHeaderTitle: props.agentDisplayName,
})) as any

const uploadUrl = '/dataagent/web/api/agui/upload'
const attachmentsConfig = computed(() => ({
  enabled: true,
  accept: '*/*',
  maxSize: 20 * 1024 * 1024,
  onUpload: uploadAttachment,
  onUploadFailed: ({ message }: { message: string }) => ElMessage.error(message),
}))

async function uploadAttachment(file: File) {
  const formData = new FormData()
  formData.append('file', file, file.name)
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
  const source = uploaded?.url ?? uploaded?.uri ?? uploaded?.downloadUrl ?? uploaded?.download_url ?? uploaded?.path ?? fileId
  if (!source) throw new Error('上传接口未返回 fileId 或文件地址')

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

function persistSnapshot(threadId: string, target: AbstractAgent, immediate = false) {
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
  if (currentAgent && currentThreadId) persistSnapshot(currentThreadId, currentAgent, true)
  agentSubscription?.unsubscribe()
  agentSubscription = null
  currentAgent = null
  currentThreadId = ''
}

watch([agent, () => props.threadId], ([nextAgent, nextThreadId]) => {
  // useAgent() uses triggerRef() for message updates. Hydration must only run
  // when the resolved agent instance/thread actually changes; otherwise an
  // older local snapshot can overwrite a just-streamed reasoning message.
  if (nextAgent && currentAgent === nextAgent && currentThreadId === nextThreadId) return

  hydrated.value = false
  hasInterrupts.value = false
  releaseCurrentAgent()
  if (!nextAgent) return

  const threadId = nextThreadId
  currentAgent = nextAgent
  currentThreadId = threadId
  const conversation = conversationRepository.get(threadId)
  if (conversation) {
    nextAgent.setMessages(conversation.messages)
    nextAgent.setState(conversation.state)
  }
  // Workspace tools persist synchronously in the dedicated per-thread store.
  // A throttled conversation snapshot can lag behind the latest tool result,
  // so it must not overwrite the newer workspace when a page is reloaded.
  const workspace = workspaceController.snapshot()
  if (workspace) nextAgent.setState({ ...(nextAgent.state ?? {}), workspace })
  agentSubscription = nextAgent.subscribe({
    onMessagesChanged: ({ agent: changedAgent }) => persistSnapshot(threadId, changedAgent),
    onStateChanged: ({ agent: changedAgent }) => {
      const workspace = (changedAgent.state as { workspace?: unknown })?.workspace
      if (workspace && typeof workspace === 'object') workspaceController.applyShared(workspace as any)
      persistSnapshot(threadId, changedAgent)
    },
  })
  hydrated.value = true
}, { immediate: true })

function onSubmitMessage(value: string) {
  if (props.displayName === '新需求' || props.displayName === '新对话' || props.displayName === '新分析') emit('rename', deriveConversationName(value))
}

async function onStop() {
  if (stopping.value) return
  stopping.value = true
  try {
    // CopilotChat handles the AG-UI run abort internally. This companion call
    // stops the actual OpenCode session so backend model/tool work does not
    // continue after the UI stream has been cancelled.
    await interruptOpenCodeConversation(props.threadId)
  } catch (error) {
    ElMessage.error(`对话已停止显示，但后端中断失败：${error instanceof Error ? error.message : String(error)}`)
  } finally {
    stopping.value = false
  }
}

function handleInputStop(stop?: () => void) {
  // Stop the CopilotKit/AG-UI run immediately, then explicitly interrupt the
  // matching OpenCode session. Do not rely solely on CopilotChat's outer stop
  // event bubbling when a custom input slot is used.
  stop?.()
  void onStop()
}

onBeforeUnmount(() => {
  if (persistTimer) window.clearTimeout(persistTimer)
  releaseCurrentAgent()
})
</script>

<template>
  <div class="conversation-chat visual-chat dark" :class="{ 'has-interrupts': hasInterrupts }">
    <div v-if="!hydrated" class="chat-loading"><el-skeleton :rows="5" animated /></div>
    <CopilotChat
      v-else
      :key="threadId"
      :agent-id="agentId"
      :thread-id="threadId"
      :labels="chatLabels"
      :attachments="attachmentsConfig"
      :throttle-ms="60"
      @submit-message="onSubmitMessage"
      @stop="onStop"
    >
      <template #input="inputProps">
        <AguiInterruptController @active-change="hasInterrupts = $event" />
        <div class="conversation-composer">
          <div class="conversation-composer__controls">
            <ModelSelector
              :thread-id="threadId"
              :disabled="Boolean(inputProps.isRunning) || hasInterrupts"
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
            @submit-message="inputProps.onSubmitMessage"
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
                  :disabled="!isProcessing && disabled"
                  @click="isProcessing ? handleInputStop(inputProps.onStop) : onClick()"
                >
                  <span class="conversation-composer__send-icon" aria-hidden="true"></span>
                </button>
              </div>
            </template>
          </CopilotChatInput>
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
.conversation-chat{position:relative}

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
  :deep([data-testid="copilot-chat-attachment-queue"]){padding-left:8px!important;padding-right:8px!important}
  :deep([data-testid="copilot-chat-attachment-item"][data-card-type="document"]){min-width:174px!important;max-width:100%!important}
  :deep([data-testid="copilot-chat-attachment-document-filename"]){max-width:142px!important}
}
</style>
