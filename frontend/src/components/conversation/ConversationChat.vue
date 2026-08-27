<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { CopilotChat, CopilotChatInput, useAgent } from '@copilotkit/vue/v2'
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
            <span>当前会话模型</span>
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
      <template #assistant-message="{ message, messages, isRunning }">
        <ReasoningAwareAssistantMessage
          :message="message"
          :messages="messages"
          :is-running="isRunning"
        />
      </template>
      <template #reasoning-message="{ message, messages, isRunning }">
        <ReasoningProcessCard
          :message="message"
          :messages="messages"
          :is-running="isRunning"
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
    </CopilotChat>
  </div>
</template>

<style scoped>
.conversation-chat{position:relative}
.conversation-composer{overflow:hidden;border:1px solid var(--da-border-strong);border-radius:14px;background:var(--da-surface-input);box-shadow:0 8px 24px rgba(0,0,0,.17)}
.conversation-composer__controls{height:36px;display:flex;align-items:center;gap:8px;padding:7px 10px 0;border-bottom:1px solid var(--da-border)}
.conversation-composer__controls>span{color:var(--da-text-subtle);font-size:10px;letter-spacing:.02em}
.conversation-composer :deep(.model-selector){height:26px;padding:0 5px;border-color:var(--da-border);background:rgba(255,255,255,.018)}
.conversation-composer :deep(.model-selector__select){width:176px}
.conversation-composer :deep([data-testid="copilot-chat-input-shell"]){border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important}
.conversation-composer :deep([data-testid="copilot-chat-input-shell"]:focus-within){box-shadow:none!important}

/* CopilotKit attachment queue — component-specific presentation. */
:deep([data-testid="copilot-chat-attachment-queue"]){gap:8px!important;padding:0 14px 9px!important;margin:0!important;align-items:center}
:deep([data-testid="copilot-chat-attachment-item"]){position:relative!important;border:1px solid var(--da-border)!important;border-radius:12px!important;background:linear-gradient(145deg,var(--da-surface-2),var(--da-surface-1))!important;box-shadow:0 8px 22px rgba(0,0,0,.22),inset 0 1px 0 rgba(255,255,255,.035)!important;overflow:hidden!important;transition:border-color .18s ease,box-shadow .18s ease,transform .18s ease}
:deep([data-testid="copilot-chat-attachment-item"]:hover){border-color:var(--da-border-strong)!important;box-shadow:0 10px 28px rgba(0,0,0,.28),0 0 0 1px rgba(255,255,255,.025) inset!important;transform:translateY(-1px)}
:deep([data-testid="copilot-chat-attachment-item"][data-card-type="document"]){min-width:196px!important;max-width:264px!important;min-height:54px!important;padding:8px 34px 8px 9px!important}
:deep([data-testid="copilot-chat-attachment-item"][data-card-type="audio"]){min-width:230px!important;max-width:290px!important;padding:8px 34px 8px 9px!important}
:deep([data-testid="copilot-chat-attachment-item"][data-card-type="image"]),:deep([data-testid="copilot-chat-attachment-item"][data-card-type="video"]){width:58px!important;height:58px!important;border-radius:12px!important}
:deep([data-testid="copilot-chat-attachment-image-thumbnail"]),:deep([data-testid="copilot-chat-attachment-video-thumbnail"]),:deep([data-testid="copilot-chat-attachment-video-fallback"]){border-radius:11px!important}
:deep([data-testid="copilot-chat-attachment-document-button"]){gap:9px!important;color:var(--da-text-primary)!important;align-items:center!important;cursor:pointer!important}
:deep([data-testid="copilot-chat-attachment-document-button"]>div:first-child){width:36px!important;height:36px!important;border:1px solid color-mix(in srgb,var(--da-accent-yellow) 24%,transparent)!important;border-radius:10px!important;background:color-mix(in srgb,var(--da-accent-yellow) 12%,var(--da-surface-2))!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.05)!important;color:#F1D992!important;font-size:9px!important;font-weight:800!important;letter-spacing:.04em!important}
:deep([data-testid="copilot-chat-attachment-document-filename"]){display:block!important;max-width:170px!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;color:var(--da-text-primary)!important;font-size:11px!important;font-weight:650!important;line-height:1.35!important;letter-spacing:.005em!important}
:deep([data-testid="copilot-chat-attachment-document-button"]>div:last-child>span:last-child){display:flex!important;align-items:center!important;margin-top:3px!important;color:var(--da-text-muted)!important;font-size:10px!important;line-height:1!important;letter-spacing:.03em!important}
:deep([data-testid="copilot-chat-attachment-document-button"]>div:last-child>span:last-child)::before{content:'';display:inline-block;width:5px;height:5px;margin-right:5px;border-radius:50%;background:var(--da-accent-green);box-shadow:0 0 8px color-mix(in srgb,var(--da-accent-green) 38%,transparent)}
:deep([data-testid="copilot-chat-attachment-item"]>button[aria-label="Remove attachment"]){top:7px!important;right:7px!important;width:18px!important;height:18px!important;border:1px solid var(--da-border)!important;background:rgba(9,10,13,.58)!important;color:var(--da-text-muted)!important;font-size:9px!important;opacity:.85!important;backdrop-filter:blur(8px);transition:.16s ease}
:deep([data-testid="copilot-chat-attachment-item"]>button[aria-label="Remove attachment"]:hover){border-color:color-mix(in srgb,var(--da-accent-red) 40%,transparent)!important;background:color-mix(in srgb,var(--da-accent-red) 35%,#0A1119)!important;color:#fff!important;opacity:1!important;transform:scale(1.06)}
:deep([data-testid="copilot-chat-attachment-uploading-overlay"]){gap:7px!important;background:linear-gradient(135deg,rgba(15,16,20,.90),rgba(29,27,23,.88))!important;backdrop-filter:blur(7px)}
:deep([data-testid="copilot-chat-attachment-uploading-overlay"]>div){width:15px!important;height:15px!important;border-width:1.5px!important;border-color:var(--da-accent-yellow)!important;border-top-color:transparent!important}
:deep([data-testid="copilot-chat-attachment-uploading-overlay"])::after{content:'UPLOADING';color:var(--da-text-secondary);font-size:9px;font-weight:750;letter-spacing:.1em}
:deep([data-testid="copilot-chat-drop-overlay"]){margin:10px!important;border:1px dashed color-mix(in srgb,var(--da-accent-yellow) 55%,transparent)!important;border-radius:16px!important;background:radial-gradient(circle at 50% 44%,color-mix(in srgb,var(--da-accent-yellow) 13%,transparent),rgba(17,18,22,.90) 66%)!important;box-shadow:inset 0 0 0 1px rgba(255,255,255,.025),0 18px 48px rgba(0,0,0,.32)!important;backdrop-filter:blur(12px)}
:deep([data-testid="copilot-chat-drop-overlay"] span){color:var(--da-text-primary)!important;font-size:10px!important;font-weight:700!important;letter-spacing:.06em}

.has-interrupts :deep([data-testid="copilot-chat-input-shell"]){opacity:1;pointer-events:auto}
.has-interrupts :deep([data-testid="copilot-chat-input-textarea"]),.has-interrupts :deep([data-testid="copilot-chat-input-add"]){opacity:.52;pointer-events:none;cursor:not-allowed}
@media(max-width:540px){.conversation-composer__controls>span{display:none}.conversation-composer :deep(.model-selector__select){width:132px}:deep([data-testid="copilot-chat-attachment-queue"]){padding-left:8px!important;padding-right:8px!important}:deep([data-testid="copilot-chat-attachment-item"][data-card-type="document"]){min-width:178px!important;max-width:100%!important}:deep([data-testid="copilot-chat-attachment-document-filename"]){max-width:145px!important}}
</style>
