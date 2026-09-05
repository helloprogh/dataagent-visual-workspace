<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Message, ResumeEntry } from '@ag-ui/client'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { useAgentConversation } from '../composables/useAgentConversation'
import { useConversationPanels } from '../composables/useConversationPanels'
import { useConversationScroll } from '../composables/useConversationScroll'
import { useDeliverables } from '../composables/useDeliverables'
import { buildCancellationResumeEntry, buildConfirmationResumeEntry } from '../approval'
import { userFacingSessionName } from '../presentation'
import { buildPresentation, messageText } from '../processPresentation'
import type { AuditEntry } from './AuditPanel.vue'
import ConversationComposer from './ConversationComposer.vue'
import ConversationHeader from './ConversationHeader.vue'
import ConversationInspector from './ConversationInspector.vue'
import ConversationViewport from './ConversationViewport.vue'

const props = defineProps<{
  sessionId?: string
  displayName?: string
}>()

const { t, tm } = useI18n()
const emit = defineEmits<{
  materialized: [sessionId: string, displayName: string]
  changed: []
}>()

const {
  threadId,
  messages,
  running,
  activeReasoningId,
  activeTextId,
  animatedMessageIds,
  responsePhase,
  hydrating,
  loadingOlder,
  nextCursor,
  pendingInterrupts,
  attachments,
  error,
  open,
  loadOlder,
  stageFiles,
  removeAttachment,
  send,
  resume,
  retry,
  sendA2uiAction,
  stop,
} = useAgentConversation()

const composerRef = ref<any>(null)
let lastNotifiedError = ''

const {
  deliverables,
  pendingDelivery,
  deliveryApprovalIds,
  generatedFilesForProcess,
} = useDeliverables(messages, attachments, pendingInterrupts)

const {
  activePreview,
  previewApprovalSubmitted,
  deliverablesOpen,
  auditOpen,
  anyInspectorOpen,
  openPreview,
  openDeliverable,
  toggleDeliverables,
  toggleAudit,
  closeInspector,
} = useConversationPanels()

const {
  messageScroller,
  showJumpToLatest,
  scrollToBottom,
  followTextReveal,
  handleScroll,
  resetFollowBottom,
} = useConversationScroll({
  hasMessages: () => Boolean(messages.value.length),
  hasOlder: () => Boolean(nextCursor.value),
  loadingOlder: () => loadingOlder.value,
  loadOlder,
})

const welcomeDescription = computed(() => t('chat.welcomeDescription'))
const starterPrompts = computed(() => [
  { icon: '↗', ...(tm('chat.starters.analyze') as any) },
  { icon: '◇', ...(tm('chat.starters.plan') as any) },
  { icon: '✓', ...(tm('chat.starters.quality') as any) },
])
const presentationItems = computed(() => buildPresentation(messages.value, running.value, activeReasoningId.value))
const showResponsePending = computed(() => {
  if (!running.value) return false
  if (responsePhase.value === 'waiting') return true
  if (responsePhase.value === 'responding') return Boolean(activeTextId.value) && !messages.value.some(message => message.id === activeTextId.value && messageText(message))
  return false
})

watch(deliverables, files => {
  const current = activePreview.value
  if (!current) return
  const latest = files.find(file => file.id === current.id)
  if (!latest) return
  if (latest.url === current.url
    && latest.name === current.name
    && latest.mimeType === current.mimeType
    && latest.approvalInterruptId === current.approvalInterruptId
    && latest.approvalResolved === current.approvalResolved
    && latest.version === current.version) return
  activePreview.value = { ...current, ...latest }
}, { deep: true })

const auditEntries = computed<AuditEntry[]>(() => {
  const entries: AuditEntry[] = []
  for (const message of messages.value) {
    const raw = message as any
    if (message.role === 'user') entries.push({ id: message.id, label: t('chat.submitted'), detail: messageText(message).slice(0, 72) || t('chat.attachmentSubmitted'), tone: 'active' })
    else if (message.role === 'tool') entries.push({ id: message.id, label: raw.error ? t('chat.toolFailed') : t('chat.toolCompleted'), detail: raw.error ? t('chat.canContinue') : t('chat.resultRecorded'), tone: raw.error ? 'warning' : 'success' })
    else if (message.role === 'assistant' && messageText(message).trim()) entries.push({ id: message.id, label: t('chat.generatedAnswer'), detail: messageText(message).slice(0, 72), tone: 'success' })
  }
  pendingInterrupts.value.forEach(interrupt => entries.push({ id: `approval-${interrupt.id}`, label: t('chat.waitingApproval'), detail: t('chat.approvalDetail'), tone: 'warning' }))
  return entries.reverse()
})

const previewInterrupts = computed(() => {
  const interruptId = activePreview.value?.approvalInterruptId
  if (!interruptId) return []
  return pendingInterrupts.value.filter(interrupt => interrupt.id === interruptId)
})
const pendingInterruptIds = computed(() => pendingInterrupts.value.map(interrupt => interrupt.id))
const composerInterrupts = computed(() => {
  if (pendingInterrupts.value.length !== 1) return pendingInterrupts.value
  return pendingInterrupts.value.filter(interrupt => !deliveryApprovalIds.value.has(interrupt.id))
})

function notifyError(reason: unknown) {
  const message = reason instanceof Error ? reason.message : String(reason)
  if (!message || message === lastNotifiedError) return
  lastNotifiedError = message
  ElMessage.error(message)
}

function setScroller(element: HTMLElement | null) {
  messageScroller.value = element
}

async function submit(payload: { text: string; model: any }) {
  try {
    resetFollowBottom()
    await send(payload.text, payload.model, prepared => {
      composerRef.value?.clearIfText?.(payload.text)
      if (prepared.created) emit('materialized', prepared.sessionId, prepared.initialName ?? t('app.newRequest'))
      scrollToBottom()
    })
    emit('changed')
    scrollToBottom()
  } catch (reason) {
    notifyError(reason)
  }
}

async function resumeRun(entries: ResumeEntry[]) {
  try {
    await resume(entries)
    emit('changed')
    return true
  } catch (reason) {
    notifyError(reason)
    return false
  }
}

function useStarterPrompt(prompt: string) {
  composerRef.value?.setText?.(prompt)
  void nextTick(() => composerRef.value?.focusLast?.())
}

async function retryRun() {
  try {
    await retry()
    emit('changed')
  } catch (reason) {
    notifyError(reason)
  }
}

function continueFromStep(message: Message) {
  const raw = message as any
  const role = String(raw.role ?? '')
  const labels: Record<string, string> = { ...tm('chat.toolLabels') as any }
  const firstTool = Array.isArray(raw.toolCalls) ? raw.toolCalls[0]?.function?.name : ''
  const label = role === 'reasoning' ? t('chat.reasoningStep')
    : role === 'tool' ? (raw.error ? t('chat.failedToolStep') : t('chat.toolResult'))
      : firstTool ? (labels[String(firstTool).toLowerCase()] ?? t('chat.toolStep'))
        : role === 'activity' ? t('chat.runStatus')
          : messageText(message).replace(/\s+/g, ' ').trim().slice(0, 48) || t('chat.stepFallback')
  composerRef.value?.setText?.(t('chat.continuePrompt', { label }))
  void nextTick(() => composerRef.value?.focusLast?.())
}

function exportConversation() {
  const title = userFacingSessionName(props.displayName) || t('chat.exportTitle')
  const body = messages.value.map(message => {
    const role = message.role === 'user' ? t('chat.roleUser') : message.role === 'assistant' ? t('chat.roleAgent') : message.role === 'reasoning' ? t('chat.roleProcess') : t('chat.roleTool')
    return `## ${role}\n\n${messageText(message) || String((message as any).content ?? '')}`
  }).join('\n\n')
  const blob = new Blob([`# ${title}\n\n${body}\n`], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${title.replace(/[\\/:*?"<>|]/g, '_')}.md`
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  ElMessage.success(t('chat.exported'))
}

function onGlobalKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    closeInspector()
    return
  }
  const target = event.target as HTMLElement | null
  if (event.key === '/' && !target?.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')) {
    event.preventDefault()
    composerRef.value?.focusLast?.()
  }
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLocaleLowerCase() === 'e' && props.sessionId) {
    event.preventDefault()
    exportConversation()
  }
}

async function resumeFileApproval(entries: ResumeEntry[]) {
  if (await resumeRun(entries)) previewApprovalSubmitted.value = true
}

async function confirmDelivery(interruptId: string) {
  if (running.value) return
  if (pendingInterrupts.value.length !== 1) {
    ElMessage.warning(t('chat.multipleApprovals'))
    return
  }
  const interrupt = pendingInterrupts.value.find(item => item.id === interruptId)
  if (!interrupt) return
  const entry = buildConfirmationResumeEntry(interrupt)
  if (!entry) {
    ElMessage.warning(t('chat.fullApproval'))
    return
  }
  await resumeRun([entry])
}

async function cancelDelivery(interruptId: string) {
  if (running.value) return
  if (pendingInterrupts.value.length !== 1) {
    ElMessage.warning(t('chat.multipleApprovals'))
    return
  }
  const interrupt = pendingInterrupts.value.find(item => item.id === interruptId)
  if (!interrupt) return
  const entry = buildCancellationResumeEntry(interrupt)
  if (!entry) return
  await resumeRun([entry])
}

async function handleA2uiAction(action: unknown) {
  try {
    if (await sendA2uiAction(action)) {
      emit('changed')
      scrollToBottom()
    }
  } catch (reason) {
    notifyError(reason)
  }
}

async function stopRun() {
  try {
    await stop()
    ElMessage.success(t('chat.stopped'))
  } catch {
    ElMessage.warning(t('chat.stopPending'))
  }
}

watch(() => props.sessionId, id => {
  if ((id ?? '') === threadId.value) return
  closeInspector()
  composerRef.value?.clear?.()
  void open(id ?? '')
}, { immediate: true })

watch(messages, () => followTextReveal(), { deep: true })
watch(error, value => {
  if (!value) {
    lastNotifiedError = ''
    return
  }
  notifyError(value)
}, { flush: 'sync' })

onMounted(() => {
  scrollToBottom()
  window.addEventListener('keydown', onGlobalKeydown)
})
onBeforeUnmount(() => window.removeEventListener('keydown', onGlobalKeydown))
</script>

<template>
  <section data-testid="conversation-chat" class="agent-chat-layout" :class="{ 'agent-chat-layout--preview': anyInspectorOpen }">
    <section class="agent-chat" :class="{ 'agent-chat--empty': !sessionId && !messages.length }">
      <ConversationHeader
        v-if="sessionId"
        :session-id="sessionId"
        :display-name="displayName"
        :deliverable-count="deliverables.length"
        :running="running"
        :hydrating="hydrating"
        :pending-count="pendingInterrupts.length"
        :error="error"
        :deliverables-active="Boolean(deliverablesOpen || activePreview)"
        :audit-active="auditOpen"
        @toggle-audit="toggleAudit"
        @toggle-deliverables="toggleDeliverables"
      />

      <ConversationViewport
        :hydrating="hydrating"
        :messages="messages"
        :running="running"
        :next-cursor="nextCursor"
        :loading-older="loadingOlder"
        :presentation-items="presentationItems"
        :pending-interrupt-ids="pendingInterruptIds"
        :active-text-id="activeTextId"
        :animated-message-ids="animatedMessageIds"
        :show-response-pending="showResponsePending"
        :response-phase="responsePhase"
        :show-jump-to-latest="showJumpToLatest"
        :welcome-description="welcomeDescription"
        :starter-prompts="starterPrompts"
        :generated-files-for-process="generatedFilesForProcess"
        @scroller="setScroller"
        @scroll="handleScroll"
        @load-older="loadOlder"
        @starter="useStarterPrompt"
        @preview="openPreview"
        @confirm="confirmDelivery"
        @cancel="cancelDelivery"
        @a2ui-action="handleA2uiAction"
        @reveal="followTextReveal"
        @continue="continueFromStep"
        @jump-latest="scrollToBottom"
      />

      <ConversationComposer
        ref="composerRef"
        :session-id="sessionId"
        :running="running"
        :hydrating="hydrating"
        :pending-interrupts="pendingInterrupts"
        :attachments="attachments"
        :pending-delivery="pendingDelivery"
        :composer-interrupts="composerInterrupts"
        :error="error"
        @submit="submit"
        @stop="stopRun"
        @retry="retryRun"
        @files-selected="stageFiles"
        @remove-attachment="removeAttachment"
        @resume="resumeRun"
        @preview="openPreview"
      />
    </section>

    <ConversationInspector
      :active-preview="activePreview"
      :deliverables-open="deliverablesOpen"
      :audit-open="auditOpen"
      :deliverables="deliverables"
      :pending-approvals="pendingInterrupts.length"
      :preview-interrupts="previewInterrupts"
      :running="running"
      :preview-approval-submitted="previewApprovalSubmitted"
      :audit-entries="auditEntries"
      @close="closeInspector"
      @select="openDeliverable"
      @resume="resumeFileApproval"
    />
  </section>
</template>

<style scoped>
.agent-chat-layout { display: grid; grid-template-columns: minmax(0, 1fr); width: 100%; height: 100%; min-height: 0; overflow: hidden; transition: grid-template-columns 220ms ease; }
.agent-chat-layout--preview { grid-template-columns: minmax(28rem, 1fr) clamp(22rem, 38vw, 36rem); }
.agent-chat { position: relative; display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr) auto; width: 100%; height: 100%; min-width: 0; min-height: 0; overflow: hidden; background: var(--da-ambient), var(--da-surface-0); }
.agent-chat--empty { grid-template-rows: auto auto; align-content: safe center; gap: var(--da-space-8); padding-block: var(--da-space-8); overflow-y: auto; }
.agent-chat--empty :deep(.agent-chat__messages) { overflow: visible; padding-block: 0; }
.agent-chat--empty :deep(.agent-welcome) { min-height: 0; padding: 0; }
.agent-chat--empty :deep(.agent-chat__composer-wrap) { padding-bottom: 0; background: transparent; }
.agent-chat-layout--preview :deep(.agent-chat__identity small) { display: none; }
@media (max-width: 48rem) {
  .agent-chat-layout--preview { position: relative; display: block; }
  .agent-chat-layout--preview :deep(.file-preview-panel),
  .agent-chat-layout--preview :deep(.deliverables-panel),
  .agent-chat-layout--preview :deep(.audit-panel) { position: absolute; inset: 0; z-index: 10; }
}
@container workspace (max-width: 56rem) {
  .agent-chat-layout--preview { position: relative; display: block; }
  .agent-chat-layout--preview :deep(.file-preview-panel),
  .agent-chat-layout--preview :deep(.deliverables-panel),
  .agent-chat-layout--preview :deep(.audit-panel) { position: absolute; inset: 0; z-index: 10; }
}
@media (prefers-reduced-motion: reduce) { .agent-chat-layout { transition: none; } }
</style>
