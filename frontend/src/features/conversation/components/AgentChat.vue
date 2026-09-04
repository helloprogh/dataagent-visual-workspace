<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Message, ResumeEntry } from '@ag-ui/client'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { Welcome, XSender } from 'vue-element-plus-x'
import type { ModelSelection } from '../../model/types'
import ModelSelector from '../../model/components/ModelSelector.vue'
import { useAgentConversation } from '../composables/useAgentConversation'
import AgentMark from './AgentMark.vue'
import ConversationMessage from './ConversationMessage.vue'
import ConversationProcessGroup from './ConversationProcessGroup.vue'
import DeliverablesPanel from './DeliverablesPanel.vue'
import AuditPanel, { type AuditEntry } from './AuditPanel.vue'
import FilePreviewPanel from './FilePreviewPanel.vue'
import GeneratedArtifactCard from './GeneratedArtifactCard.vue'
import InterruptCard from './InterruptCard.vue'
import type { ConversationFilePreview } from '../types/filePreview'
import { buildCancellationResumeEntry, buildConfirmationResumeEntry } from '../approval'
import { userFacingSessionName } from '../presentation'
import { buildPresentation, messageText } from '../processPresentation'
import { normalizeUiContent } from '../../../../../shared/generative-ui.mjs'
import { artifactPathKey, generatedArtifactsFromTool, removedArtifactPathsFromTool } from '../../../../../shared/generated-artifacts.mjs'
import { dataAgentWebApi } from '../../../shared/config/api'

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

const senderRef = ref<any>(null)
const selectedModel = ref<ModelSelection | null>(null)
const messageScroller = ref<HTMLElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const activePreview = ref<ConversationFilePreview | null>(null)
const deliverablesOpen = ref(false)
const auditOpen = ref(false)
const previewApprovalSubmitted = ref(false)
const showJumpToLatest = ref(false)
let followBottom = true
let previousScrollHeight = 0
let lastNotifiedError = ''

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

function previewFromPart(message: Message, part: any, index: number): ConversationFilePreview | null {
  if (!['image', 'audio', 'video', 'document', 'file'].includes(part?.type)) return null
  const url = String(part?.metadata?.clientPreviewUrl ?? part?.source?.value ?? '').trim()
  if (!url) return null
  return {
    id: String(part?.metadata?.fileId ?? `${message.id}-${index}`),
    name: String(part?.metadata?.filename ?? `${t('common.file')} ${index + 1}`),
    url,
    mimeType: String(part?.source?.mimeType ?? part?.mimeType ?? 'application/octet-stream'),
    ...(Number(part?.metadata?.size) > 0 ? { size: Number(part.metadata.size) } : {}),
    ...(String(part?.metadata?.approvalInterruptId ?? part?.metadata?.approval?.interruptId ?? '').trim()
      ? { approvalInterruptId: String(part.metadata.approvalInterruptId ?? part.metadata.approval.interruptId).trim() }
      : {}),
    category: message.role === 'user' ? 'input' : 'output',
  }
}

function generatedFilesFromTool(call: any, successfulToolIds: Set<string>, sourceMessageId: string): ConversationFilePreview[] {
  return generatedArtifactsFromTool(call, successfulToolIds).map((artifact: any) => {
    const query = new URLSearchParams({ path: artifact.sourcePath })
    const route = artifact.archive ? '/agui/workspace-archive' : '/agui/workspace-file'
    return {
      id: artifact.id,
      name: artifact.name,
      url: `${dataAgentWebApi(route)}?${query.toString()}`,
      mimeType: artifact.mimeType,
      category: 'output',
      sourceMessageId,
      sourcePath: artifact.sourcePath,
    }
  })
}

const deliverables = computed(() => {
  const result: ConversationFilePreview[] = []
  const known = new Set<string>()
  const successfulToolIds = new Set(messages.value
    .filter(message => message.role === 'tool' && !(message as any).error && (message as any).toolCallId)
    .map(message => String((message as any).toolCallId)))
  for (const message of messages.value) {
    const content = (message as any).content
    if ((message as any).activityType === 'dataagent.ui') {
      const delivery = normalizeUiContent(content)
      if (delivery && delivery.status !== 'removed') {
        for (const card of delivery.cards) {
          const id = `${message.id}-${card.id}`
          if (card.kind !== 'file' || known.has(id)) continue
          known.add(id)
          result.push({
            id,
            name: card.name,
            url: card.url,
            mimeType: card.mimeType,
            ...(card.approvalInterruptId ? { approvalInterruptId: card.approvalInterruptId } : {}),
            ...(card.approvalInterruptId ? { approvalResolved: !pendingInterrupts.value.some(interrupt => interrupt.id === card.approvalInterruptId) } : {}),
            category: 'output',
          })
        }
      }
      continue
    }
    if (Array.isArray(content)) {
      content.forEach((part, index) => {
        const file = previewFromPart(message, part, index)
        if (!file || known.has(file.id)) return
        known.add(file.id)
        result.push(file)
      })
    }
    for (const call of (message as any).toolCalls ?? []) {
      for (const removedPath of removedArtifactPathsFromTool(call, successfulToolIds)) {
        const key = artifactPathKey(removedPath)
        for (let index = result.length - 1; index >= 0; index -= 1) {
          if (!result[index]?.sourcePath || artifactPathKey(result[index].sourcePath) !== key) continue
          known.delete(result[index].id)
          result.splice(index, 1)
        }
      }
      for (const file of generatedFilesFromTool(call, successfulToolIds, message.id)) {
        if (known.has(file.id)) continue
        known.add(file.id)
        result.push(file)
      }
    }
  }
  for (const item of attachments.value) {
    if (known.has(item.id)) continue
    result.push({ id: item.id, name: item.file.name, url: item.previewUrl, mimeType: item.file.type || 'application/octet-stream', size: item.file.size, category: 'input' })
  }
  const approval = pendingInterrupts.value.length === 1
    && pendingInterrupts.value[0]?.metadata?.kind === 'form'
    && !result.some(file => file.approvalInterruptId)
    ? pendingInterrupts.value[0]
    : undefined
  const approvalTarget = approval ? [...result].reverse().find(file => file.category === 'output') : undefined
  const versions = new Map<string, number>()
  return result.map(file => {
    if (file.category === 'input') return file
    const key = file.name.trim().toLocaleLowerCase()
    const version = (versions.get(key) ?? 0) + 1
    versions.set(key, version)
    return { ...file, version, ...(file === approvalTarget ? { approvalInterruptId: approval!.id } : {}) }
  })
})

// A native write result can arrive a moment before its following form. Keep an
// already-open preview synchronized when the adapter later binds that form to
// the latest delivery, so the right-side approval footer does not disappear
// during this normal streaming race.
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
const deliveryApprovalIds = computed(() => new Set(deliverables.value
  .map(file => file.approvalInterruptId)
  .filter((id): id is string => Boolean(id))))
const pendingDelivery = computed(() => deliverables.value.find(file =>
  file.approvalInterruptId && pendingInterruptIds.value.includes(file.approvalInterruptId)))
// A single delivery approval can be acted on from its file card. When a run
// has multiple interrupts, keep the aggregate card visible because the API
// requires all decisions to be resumed together.
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

function scrollToBottom() {
  void nextTick().then(() => {
    const element = messageScroller.value
    if (!element) return
    element.scrollTop = element.scrollHeight
    followBottom = true
    showJumpToLatest.value = false
  })
}

function followTextReveal() {
  if (followBottom) scrollToBottom()
}

async function handleScroll() {
  const element = messageScroller.value
  if (!element) return
  followBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 5 * 16
  showJumpToLatest.value = !followBottom && Boolean(messages.value.length)
  if (element.scrollTop > 6 * 16 || !nextCursor.value || loadingOlder.value) return
  previousScrollHeight = element.scrollHeight
  await loadOlder()
  await nextTick()
  element.scrollTop += Math.max(0, element.scrollHeight - previousScrollHeight)
}

function chooseFiles() {
  if (!running.value && !pendingInterrupts.value.length) fileInput.value?.click()
}

function onFilesSelected(event: Event) {
  const target = event.target as HTMLInputElement
  if (target.files?.length) stageFiles(target.files)
  target.value = ''
}

async function submit() {
  if (running.value || hydrating.value || pendingInterrupts.value.length) return
  const text = String(senderRef.value?.getModelValue?.()?.text ?? '').trim()
  if (!selectedModel.value) {
    ElMessage.warning(t('chat.modelNotReady'))
    return
  }
  if (!text && !attachments.value.length) return
  try {
    followBottom = true
    await send(text, selectedModel.value, prepared => {
      if (String(senderRef.value?.getModelValue?.()?.text ?? '').trim() === text) senderRef.value?.clear?.()
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
  senderRef.value?.setText?.(prompt)
  void nextTick(() => senderRef.value?.focus?.('last'))
}

function openFilePreview(file: ConversationFilePreview) {
  deliverablesOpen.value = false
  auditOpen.value = false
  activePreview.value = file
  previewApprovalSubmitted.value = false
}

function openDeliverable(file: ConversationFilePreview) {
  deliverablesOpen.value = true
  auditOpen.value = false
  activePreview.value = file
  previewApprovalSubmitted.value = false
}

function toggleDeliverables() {
  activePreview.value = null
  auditOpen.value = false
  deliverablesOpen.value = !deliverablesOpen.value
}

function toggleAudit() {
  activePreview.value = null
  deliverablesOpen.value = false
  auditOpen.value = !auditOpen.value
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
  senderRef.value?.setText?.(t('chat.continuePrompt', { label }))
  void nextTick(() => senderRef.value?.focus?.('last'))
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
    closeFilePreview()
    deliverablesOpen.value = false
    auditOpen.value = false
    return
  }
  const target = event.target as HTMLElement | null
  if (event.key === '/' && !target?.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')) {
    event.preventDefault()
    senderRef.value?.focus?.('last')
  }
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLocaleLowerCase() === 'e' && props.sessionId) {
    event.preventDefault()
    exportConversation()
  }
}

function closeFilePreview() {
  activePreview.value = null
  previewApprovalSubmitted.value = false
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

function generatedFilesForProcess(steps: any[]) {
  const ids = new Set(steps.map(step => step?.message?.id).filter(Boolean))
  return deliverables.value.filter(file => file.sourceMessageId && ids.has(file.sourceMessageId))
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
  closeFilePreview()
  deliverablesOpen.value = false
  auditOpen.value = false
  selectedModel.value = null
  senderRef.value?.clear?.()
  void open(id ?? '')
}, { immediate: true })

watch(messages, () => {
  if (followBottom) scrollToBottom()
}, { deep: true })

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
onBeforeUnmount(() => {
  fileInput.value = null
  window.removeEventListener('keydown', onGlobalKeydown)
})
</script>

<template>
  <section class="agent-chat-layout" :class="{ 'agent-chat-layout--preview': activePreview || deliverablesOpen || auditOpen }">
  <section class="agent-chat" :class="{ 'agent-chat--empty': !sessionId && !messages.length }">
    <header v-if="sessionId" class="agent-chat__header">
      <div class="agent-chat__identity">
        <small>{{ t('chat.current') }}</small>
        <b>{{ userFacingSessionName(displayName) }}</b>
        <small>{{ sessionId }}</small>
      </div>
      <div class="agent-chat__header-actions">
        <button type="button" :class="{ active: auditOpen }" :aria-pressed="auditOpen" :aria-label="t('chat.record')" :title="t('chat.record')" @click="toggleAudit"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="6.5"/><path d="M10 6v4l2.5 1.5"/></svg><span>{{ t('chat.record') }}</span></button>
        <button type="button" :class="{ active: deliverablesOpen || activePreview }" :aria-pressed="Boolean(deliverablesOpen || activePreview)" :aria-label="`${t('chat.deliverables')} ${deliverables.length}`" :title="t('chat.deliverables')" @click="toggleDeliverables">
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 6.5h4l1.4 1.8h7.6v7.2h-13z"/><path d="M5.5 4.5h4l1.2 2"/></svg>
          <span>{{ t('chat.deliverables') }}</span> <small>{{ deliverables.length }}</small>
        </button>
        <span role="status" :class="{ active: running, pending: pendingInterrupts.length, failed: error && !running }"><i></i>{{ hydrating ? t('chat.restoring') : running ? t('chat.running') : pendingInterrupts.length ? t('interrupt.needsAction') : error ? t('chat.incomplete') : t('chat.ready') }}</span>
      </div>
    </header>

    <div
      ref="messageScroller"
      class="agent-chat__messages"
      @scroll.passive="handleScroll"
    >
      <div v-if="hydrating" class="agent-chat__loading">
        <el-skeleton :rows="6" animated />
      </div>

      <div v-else-if="!messages.length && !running" class="agent-welcome">
        <div class="agent-welcome__brand">
          <div class="agent-welcome__orbit" aria-hidden="true"><span></span><span></span><i></i><AgentMark /></div>
          <span class="agent-welcome__eyebrow">{{ t('chat.eyebrow') }}</span>
          <div class="agent-welcome__title">
            <h1>{{ t('chat.heroTitle') }}<span>{{ t('chat.heroAccent') }}</span></h1>
          </div>
          <Welcome
            variant="borderless"
            :description="welcomeDescription"
          />
          <ol class="welcome-workflow" :aria-label="t('chat.workflowAria')">
            <li v-for="(label, index) in (tm('chat.workflow') as string[])" :key="label"><span>{{ String(index + 1).padStart(2, '0') }}</span>{{ label }}</li>
          </ol>
          <div class="starter-prompts" :aria-label="t('chat.starterAria')">
            <button
              v-for="item in starterPrompts"
              :key="item.title"
              type="button"
              @click="useStarterPrompt(item.prompt)"
            >
              <span aria-hidden="true">{{ item.icon }}</span>
              <b>{{ item.title }}</b>
              <small>{{ item.description }}</small>
            </button>
          </div>
        </div>
      </div>

      <div v-else class="message-list">
        <div v-if="nextCursor" class="load-older">
          <el-button text :loading="loadingOlder" @click="loadOlder">{{ t('chat.loadEarlier') }}</el-button>
        </div>
        <template v-for="item in presentationItems" :key="item.key">
          <section v-if="item.kind === 'turn'" class="conversation-turn">
            <div :data-message-id="item.user.id"><ConversationMessage :message="item.user" :running="running" :pending-interrupt-ids="pendingInterruptIds" @preview="openFilePreview" @confirm="confirmDelivery" @cancel="cancelDelivery" @a2ui-action="handleA2uiAction" /></div>
            <div class="conversation-turn__response">
              <template v-for="child in item.children" :key="child.key">
                <template v-if="child.kind === 'process'">
                  <ConversationProcessGroup
                    :steps="child.steps"
                    :running="child.running"
                    :busy="running"
                    :settled="child.settled"
                    :active-reasoning-id="child.activeReasoningId"
                    @preview="openFilePreview"
                    @continue="continueFromStep"
                  />
                  <GeneratedArtifactCard
                    v-for="file in generatedFilesForProcess(child.steps)"
                    :key="`generated-card-${file.id}`"
                    :file="file"
                    :pending="file.approvalInterruptId ? pendingInterruptIds.includes(file.approvalInterruptId) : false"
                    :busy="running"
                    @preview="openFilePreview"
                    @confirm="confirmDelivery"
                    @cancel="cancelDelivery"
                  />
                </template>
                <ConversationMessage
                  v-else
                  :message="child.message"
                  :running="running"
                  :animate="animatedMessageIds.has(child.message.id)"
                  :streaming="running && activeTextId === child.message.id"
                  :pending-interrupt-ids="pendingInterruptIds"
                  @reveal="followTextReveal"
                  :data-message-id="child.message.id"
                  @preview="openFilePreview"
                  @confirm="confirmDelivery"
                  @cancel="cancelDelivery"
                  @a2ui-action="handleA2uiAction"
                />
              </template>
            </div>
          </section>
          <template v-else-if="item.kind === 'process'">
            <ConversationProcessGroup
              :steps="item.steps"
              :running="item.running"
              :busy="running"
              :settled="item.settled"
              :active-reasoning-id="item.activeReasoningId"
              @preview="openFilePreview"
              @continue="continueFromStep"
            />
            <GeneratedArtifactCard
              v-for="file in generatedFilesForProcess(item.steps)"
              :key="`generated-card-${file.id}`"
              :file="file"
              :pending="file.approvalInterruptId ? pendingInterruptIds.includes(file.approvalInterruptId) : false"
              :busy="running"
              @preview="openFilePreview"
              @confirm="confirmDelivery"
              @cancel="cancelDelivery"
            />
          </template>
          <ConversationMessage v-else :message="item.message" :running="running" :animate="animatedMessageIds.has(item.message.id)" :streaming="running && activeTextId === item.message.id" :pending-interrupt-ids="pendingInterruptIds" :data-message-id="item.message.id" @reveal="followTextReveal" @preview="openFilePreview" @confirm="confirmDelivery" @cancel="cancelDelivery" @a2ui-action="handleA2uiAction" />
        </template>
        <div v-if="showResponsePending" class="response-pending" role="status" aria-live="polite">
          <span class="response-pending__dots" aria-hidden="true"><i></i><i></i><i></i></span>
          <span>{{ responsePhase === 'responding' ? t('chat.responseOrganizing') : t('chat.responseWaiting') }}</span>
        </div>
      </div>
    </div>

    <Transition name="jump-latest">
      <button v-if="showJumpToLatest" class="jump-latest" type="button" @click="scrollToBottom">
        <span aria-hidden="true">↓</span> {{ t('chat.backLatest') }}
      </button>
    </Transition>

    <div class="agent-chat__composer-wrap">
      <div v-if="pendingDelivery && !running && !composerInterrupts.length" class="approval-dock" role="status">
        <span class="approval-dock__icon" aria-hidden="true">◇</span>
        <div><b>{{ t('chat.approvalDetail') }}</b><small>{{ pendingDelivery.name }}</small></div>
        <button type="button" @click="openFilePreview(pendingDelivery)">{{ t('chat.reviewApproval') }} <span aria-hidden="true">↗</span></button>
      </div>
      <div v-if="error && !running" class="run-recovery" role="status">
        <span><b>{{ t('chat.incomplete') }}</b><small>{{ error }}</small></span>
        <button type="button" @click="retryRun">{{ t('chat.retry') }}</button>
      </div>
      <InterruptCard
        v-if="composerInterrupts.length"
        :interrupts="composerInterrupts"
        :busy="running"
        @resume="resumeRun"
      />

      <div class="agent-chat__composer">
        <div v-if="attachments.length" class="attachment-queue">
          <div v-for="item in attachments" :key="item.id" class="attachment-chip">
            <span>{{ item.file.name }}</span>
            <small>{{ Math.max(1, Math.ceil(item.file.size / 1024)) }} KB</small>
            <button type="button" :aria-label="t('chat.removeAttachment')" @click="removeAttachment(item.id)">×</button>
          </div>
        </div>

        <XSender
          ref="senderRef"
          variant="updown"
          :loading="running"
          :disabled="Boolean(pendingInterrupts.length)"
          :placeholder="t('chat.placeholder')"
          :custom-style="{ maxHeight: '10rem' }"
          @submit="submit"
          @cancel="stopRun"
        >
          <template #prefix>
            <div class="composer-input-actions">
              <el-button
                class="composer-file-button"
                text
                :title="t('chat.addFile')"
                :aria-label="t('chat.addFile')"
                :disabled="running || Boolean(pendingInterrupts.length)"
                @click="chooseFiles"
              ><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 5v10M5 10h10"/></svg></el-button>
              <ModelSelector
                :session-id="sessionId"
                :draft="!sessionId"
                :disabled="running || Boolean(pendingInterrupts.length)"
                @selected="selectedModel = $event"
              />
            </div>
          </template>
        </XSender>

        <input
          ref="fileInput"
          class="file-input"
          type="file"
          multiple
          @change="onFilesSelected"
        />
        <div class="composer-assurance">
          <span><i></i> DATA AGENT WORKFLOW</span>
          <small>{{ t('chat.assurance') }}</small>
        </div>
      </div>
    </div>
  </section>

  <FilePreviewPanel
    v-if="activePreview"
    :file="activePreview"
    :interrupts="previewInterrupts"
    :busy="running"
    :approval-submitted="previewApprovalSubmitted"
    @close="closeFilePreview"
    @resume="resumeFileApproval"
  />
  <DeliverablesPanel
    v-else-if="deliverablesOpen"
    :files="deliverables"
    :pending-approvals="pendingInterrupts.length"
    @close="deliverablesOpen = false"
    @select="openDeliverable"
  />
  <AuditPanel
    v-else-if="auditOpen"
    :entries="auditEntries"
    @close="auditOpen = false"
  />
  </section>
</template>

<style scoped>
.agent-chat-layout { display: grid; grid-template-columns: minmax(0, 1fr); width: 100%; height: 100%; min-height: 0; overflow: hidden; transition: grid-template-columns 220ms ease; }
.agent-chat-layout--preview { grid-template-columns: minmax(28rem, 1fr) clamp(22rem, 38vw, 36rem); }
.agent-chat { position: relative; display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr) auto; width: 100%; height: 100%; min-width: 0; min-height: 0; overflow: hidden; background: var(--da-ambient), var(--da-surface-0); }
.agent-chat--empty { grid-template-rows: auto auto; align-content: safe center; gap: var(--da-space-8); padding-block: var(--da-space-8); overflow-y: auto; }
.agent-chat__header { display: flex; align-items: center; justify-content: space-between; gap: var(--da-space-4); min-height: 3.75rem; padding: 0 var(--da-space-6); border-bottom: 0.0625rem solid var(--da-border); background: color-mix(in srgb, var(--da-surface-0) 88%, transparent); }
.agent-chat__identity { min-width: 0; display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 0 var(--da-space-3); }
.agent-chat__identity > small:first-child { display: block; grid-row: 1; color: var(--da-accent-primary); font-size: 0.625rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
.agent-chat__identity > b { grid-row: 2; }
.agent-chat__header b { overflow: hidden; color: var(--da-text-emphasis); text-overflow: ellipsis; white-space: nowrap; }
.agent-chat__identity > small:last-child { display: none; }
.agent-chat__header > span { display: inline-flex; flex: 0 0 auto; align-items: center; gap: var(--da-space-2); color: var(--da-text-muted); font-size: var(--da-font-size-xs); white-space: nowrap; }
.agent-chat__header > span i { width: 0.375rem; height: 0.375rem; border-radius: 50%; background: var(--da-accent-green); }
.agent-chat__header > span.active i { background: var(--da-accent-orange); box-shadow: 0 0 0.75rem var(--da-accent-orange-glow); }
.agent-chat__header-actions { display: flex; flex: 0 0 auto; align-items: center; gap: var(--da-space-2); }
.agent-chat__header-actions > button { display: inline-flex; min-height: 1.875rem; align-items: center; gap: 0.375rem; padding: 0 var(--da-space-2); border: 0.0625rem solid transparent; border-radius: 999rem; color: var(--da-text-muted); background: transparent; cursor: pointer; font-size: var(--da-font-size-xs); }
.agent-chat__header-actions > button:hover, .agent-chat__header-actions > button.active { border-color: var(--da-border); color: var(--da-text-emphasis); background: var(--da-surface-2); }
.agent-chat__header-actions svg { width: 1rem; height: 1rem; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.35; }
.agent-chat__header-actions button small { display: inline-grid; min-width: 1.125rem; height: 1.125rem; place-items: center; border-radius: 999rem; color: var(--da-text-secondary); background: var(--da-surface-3); font-size: 0.625rem; }
.agent-chat__header-actions > span { display: inline-flex; min-height: 1.875rem; align-items: center; gap: var(--da-space-2); padding-inline: var(--da-space-2); border: 0.0625rem solid var(--da-border); border-radius: 999rem; color: var(--da-text-muted); background: color-mix(in srgb, var(--da-surface-2) 68%, transparent); font-size: var(--da-font-size-xs); }
.agent-chat__header-actions > span i { width: 0.375rem; height: 0.375rem; border-radius: 50%; background: var(--da-accent-green); }
.agent-chat__header-actions > span.active i { background: var(--da-accent-orange); box-shadow: 0 0 0.75rem var(--da-accent-orange-glow); }
.agent-chat__header-actions > span.pending { color: var(--da-accent-yellow); border-color: color-mix(in srgb, var(--da-accent-yellow) 28%, var(--da-border)); }
.agent-chat__header-actions > span.pending i { background: var(--da-accent-yellow); }
.agent-chat__header-actions > span.failed i { background: var(--da-accent-red); }
.agent-chat__messages { min-height: 0; overflow: auto; padding: var(--da-space-6) clamp(1rem, 4vw, 3.5rem) var(--da-space-8); scrollbar-gutter: stable; }
.agent-chat__loading, .message-list, .agent-welcome { width: min(100%, var(--da-content-max)); margin: 0 auto; }
.message-list { display: flex; flex-direction: column; gap: var(--da-space-5); }
.response-pending { display: flex; min-height: 2rem; align-items: center; gap: var(--da-space-3); color: var(--da-text-muted); font-size: var(--da-font-size-sm); }
.response-pending__dots { display: flex; align-items: center; gap: 0.25rem; }
.response-pending__dots i { width: 0.25rem; height: 0.25rem; border-radius: 50%; background: var(--da-accent-primary); animation: response-pulse 1s ease-in-out infinite; }
.response-pending__dots i:nth-child(2) { animation-delay: 150ms; }
.response-pending__dots i:nth-child(3) { animation-delay: 300ms; }
@keyframes response-pulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }
.conversation-turn { display: flex; min-width: 0; flex-direction: column; gap: var(--da-space-3); }
.conversation-turn__response { display: flex; min-width: 0; flex-direction: column; gap: var(--da-space-3); }
.load-older { display: flex; justify-content: center; min-height: 2.25rem; }
.agent-welcome { display: flex; min-height: 100%; align-items: center; justify-content: center; padding: var(--da-space-10) 0; }
.agent-welcome__brand { display: flex; width: min(100%, 64rem); flex-direction: column; align-items: center; gap: var(--da-space-3); text-align: center; }
.agent-welcome__eyebrow { color: var(--da-brand-cyan); font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 0.6875rem; font-weight: 700; letter-spacing: 0.16em; }
.agent-welcome__title { display: flex; align-items: center; justify-content: center; gap: var(--da-space-4); }
.agent-welcome__title h1 { margin: 0; color: var(--da-text-emphasis); font-size: clamp(1.75rem, 3vw, 2.75rem); font-weight: 650; letter-spacing: -0.045em; line-height: 1.35; }
.agent-welcome__title h1 > span { display: block; color: var(--da-accent-primary); background: var(--da-gradient-accent); background-clip: text; -webkit-text-fill-color: transparent; }
.agent-welcome__orbit { position: relative; display: grid; width: 8.5rem; height: 6.75rem; margin-bottom: var(--da-space-2); place-items: center; }
.agent-welcome__orbit::before { content: ''; position: absolute; inset: 0; border-radius: 50%; background: radial-gradient(ellipse, var(--da-brand-glow), transparent 70%); transform: scale(1.8); pointer-events: none; }
.agent-welcome__orbit > span { position: absolute; width: 8.25rem; height: 4.5rem; border: 0.0625rem solid color-mix(in srgb, var(--da-brand-cyan) 24%, transparent); border-radius: 50%; transform: rotate(-24deg); }
.agent-welcome__orbit > span:nth-child(2) { transform: rotate(35deg); border-color: color-mix(in srgb, var(--da-accent-primary) 24%, transparent); }
.agent-welcome__orbit > i { position: absolute; top: 1.45rem; right: 0.75rem; width: 0.375rem; height: 0.375rem; border-radius: 50%; background: var(--da-brand-cyan); box-shadow: 0 0 0.75rem var(--da-brand-cyan); }
.agent-welcome__orbit :deep(.agent-mark) { width: 3.5rem; height: 3.5rem; transform: rotate(-8deg); animation: brand-float 6s ease-in-out infinite; }
@keyframes brand-float { 0%, 100% { transform: translateY(0) rotate(-8deg); } 50% { transform: translateY(-0.3rem) rotate(-3deg); } }
.welcome-workflow { display: flex; flex-wrap: wrap; justify-content: center; gap: var(--da-space-3); margin: var(--da-space-4) 0 0; padding: 0; list-style: none; }
.welcome-workflow li { display: flex; align-items: center; gap: 0.375rem; color: var(--da-text-muted); font-size: 0.75rem; }
.welcome-workflow li > span { color: var(--da-brand-cyan); font-family: ui-monospace, Consolas, monospace; font-size: 0.625rem; }
.welcome-workflow li:not(:last-child)::after { content: ''; width: 1.25rem; height: 0.0625rem; margin-left: var(--da-space-2); background: var(--da-border-strong); }
.agent-welcome :deep(.elx-welcome) { width: 100%; min-width: 0; justify-content: center; padding: 0; --elx-welcome-filled-bg: transparent; --elx-welcome-filled-border: transparent; --elx-welcome-description-color: var(--da-text-muted); background: transparent; }
.agent-welcome :deep(.elx-welcome__content) { flex: 0 1 auto; }
.agent-welcome :deep(.elx-welcome__description) { font-size: var(--da-font-size-md); line-height: 1.75; text-align: center; white-space: nowrap; }
.starter-prompts { display: grid; width: min(100%, 46rem); grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--da-space-3); margin-top: var(--da-space-5); }
.starter-prompts button { position: relative; display: grid; min-width: 0; gap: 0.5rem; padding: var(--da-space-5) var(--da-space-4); border: 0.0625rem solid var(--da-border); border-radius: var(--da-radius-lg); color: var(--da-text-muted); background: linear-gradient(135deg, var(--da-accent-primary-soft), transparent 75%), var(--da-surface-1); box-shadow: var(--da-shadow-card); cursor: pointer; text-align: left; transition: transform 180ms ease, border-color 180ms ease, color 180ms ease, background-color 180ms ease, box-shadow 180ms ease; }
.starter-prompts button > span { position: absolute; top: var(--da-space-3); right: var(--da-space-3); color: var(--da-brand-cyan); font-size: var(--da-font-size-sm); transition: transform 180ms ease; }
.starter-prompts button b { color: var(--da-text-primary); font-size: var(--da-font-size-sm); font-weight: 600; }
.starter-prompts button small { overflow: hidden; font-size: var(--da-font-size-xs); line-height: 1.5; text-overflow: ellipsis; white-space: nowrap; }
.starter-prompts button:hover { border-color: color-mix(in srgb, var(--da-accent-primary) 38%, var(--da-border)); color: var(--da-text-secondary); background: var(--da-surface-2); box-shadow: 0 0.75rem 2rem var(--da-brand-glow); transform: translateY(-0.125rem); }
.starter-prompts button:hover > span { transform: translate(0.125rem, -0.125rem); }
.starter-prompts button:active { transform: translateY(0); }
.jump-latest { position: absolute; z-index: 4; bottom: 7.25rem; left: 50%; display: inline-flex; min-height: 2rem; align-items: center; gap: var(--da-space-2); padding: 0 var(--da-space-3); border: 0.0625rem solid var(--da-border-strong); border-radius: 999rem; color: var(--da-text-secondary); background: color-mix(in srgb, var(--da-surface-2) 92%, transparent); box-shadow: var(--da-shadow-card); cursor: pointer; font-size: var(--da-font-size-xs); transform: translateX(-50%); backdrop-filter: blur(0.75rem); }
.jump-latest:hover { border-color: var(--da-border-focus); color: var(--da-text-emphasis); }
.jump-latest-enter-active, .jump-latest-leave-active { transition: opacity 160ms ease, transform 160ms ease; }
.jump-latest-enter-from, .jump-latest-leave-to { opacity: 0; transform: translate(-50%, 0.5rem); }
.agent-chat__composer-wrap { z-index: 2; min-width: 0; padding: 0 clamp(1rem, 4vw, 3.5rem) var(--da-space-5); background: linear-gradient(180deg, transparent, var(--da-surface-0) 20%); }
.run-recovery { display: flex; width: min(100%, var(--da-content-max)); align-items: center; justify-content: space-between; gap: var(--da-space-4); margin: 0 auto var(--da-space-2); padding: var(--da-space-2) var(--da-space-3); border: 0.0625rem solid color-mix(in srgb, var(--da-accent-orange) 30%, var(--da-border)); border-radius: var(--da-radius-md); background: color-mix(in srgb, var(--da-accent-orange) 5%, var(--da-surface-1)); }
.run-recovery > span { display: grid; min-width: 0; gap: 0.125rem; }.run-recovery b { color: var(--da-text-primary); font-size: var(--da-font-size-xs); }.run-recovery small { overflow: hidden; color: var(--da-text-muted); font-size: 0.6875rem; text-overflow: ellipsis; white-space: nowrap; }
.run-recovery button { flex: 0 0 auto; padding: var(--da-space-1) var(--da-space-3); border: 0.0625rem solid var(--da-border-strong); border-radius: var(--da-radius-sm); color: var(--da-text-primary); background: var(--da-surface-2); cursor: pointer; font-size: var(--da-font-size-xs); }.run-recovery button:hover { border-color: var(--da-border-focus); }
.agent-chat__composer { width: min(100%, var(--da-content-max)); min-width: 0; margin: 0 auto; }
.approval-dock { display: flex; width: min(100%, var(--da-content-max)); align-items: center; gap: var(--da-space-3); margin: 0 auto var(--da-space-3); padding: var(--da-space-3); border: 0.0625rem solid color-mix(in srgb, var(--da-accent-yellow) 28%, var(--da-border)); border-radius: var(--da-radius-lg); background: var(--da-surface-2); box-shadow: var(--da-shadow-card); }
.approval-dock__icon { display: grid; width: 2rem; height: 2rem; flex: 0 0 auto; place-items: center; border-radius: var(--da-radius-md); color: var(--da-accent-yellow); background: var(--da-accent-yellow-soft); }
.approval-dock > div { display: grid; min-width: 0; flex: 1; gap: 0.2rem; }
.approval-dock b { font-size: var(--da-font-size-xs); font-weight: 600; }
.approval-dock small { overflow: hidden; color: var(--da-text-muted); font-size: 0.75rem; text-overflow: ellipsis; white-space: nowrap; }
.approval-dock button { flex: 0 0 auto; min-height: 2rem; padding: 0 var(--da-space-3); border: 0.0625rem solid var(--da-border); border-radius: var(--da-radius-md); color: var(--da-accent-primary); background: var(--da-accent-primary-soft); cursor: pointer; font-size: var(--da-font-size-xs); }
.approval-dock button:hover { border-color: var(--da-border-focus); }
.agent-chat--empty .agent-chat__messages { overflow: visible; padding-block: 0; }
.agent-chat--empty .agent-welcome { min-height: 0; padding: 0; }
.agent-chat--empty .agent-chat__composer-wrap { padding-bottom: 0; background: transparent; }
.agent-chat__composer :deep(.elx-x-sender .elx-x-sender__content.elx-x-sender__content--variant-updown .elx-x-sender__updown-action-list .elx-x-sender__prefix) { min-width: 0; flex: 1; padding-right: 0; }
.composer-input-actions { display: flex; width: 100%; min-width: 0; align-items: center; gap: var(--da-space-2); }
.composer-input-actions :deep(.model-selector) { margin-left: 0; }
.composer-file-button svg { width: 1rem; height: 1rem; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.45; }
.attachment-queue { display: flex; flex-wrap: wrap; gap: var(--da-space-2); margin-bottom: var(--da-space-2); }
.attachment-chip { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: var(--da-space-2); max-width: 24rem; padding: var(--da-space-2) var(--da-space-3); border: 0.0625rem solid var(--da-border); border-radius: var(--da-radius-md); background: var(--da-surface-2); }
.attachment-chip span { overflow: hidden; color: var(--da-text-primary); font-size: var(--da-font-size-sm); text-overflow: ellipsis; white-space: nowrap; }
.attachment-chip small { color: var(--da-text-muted); font-size: var(--da-font-size-xs); }
.attachment-chip button { width: 1.5rem; height: 1.5rem; padding: 0; border: 0; border-radius: 50%; color: var(--da-text-muted); background: transparent; cursor: pointer; }
.attachment-chip button:hover { color: var(--da-text-emphasis); background: var(--da-surface-3); }
.file-input { display: none; }
.composer-assurance { display: flex; align-items: center; justify-content: space-between; gap: var(--da-space-3); padding: var(--da-space-2) var(--da-space-2) 0; color: var(--da-text-subtle); font-size: 0.6875rem; }
.composer-assurance span { display: inline-flex; align-items: center; gap: var(--da-space-2); color: var(--da-text-muted); font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-weight: 600; letter-spacing: 0.06em; }
.composer-assurance i { width: 0.3125rem; height: 0.3125rem; border-radius: 50%; background: var(--da-accent-green); box-shadow: 0 0 0.5rem var(--da-accent-green-soft); }
.composer-assurance small { color: inherit; font-size: inherit; }
.agent-chat__composer :deep(.x-sender), .agent-chat__composer :deep(.elx-xsender), .agent-chat__composer :deep(.elx-x-sender) { border-color: var(--da-border-strong); background: var(--da-surface-1); box-shadow: var(--da-shadow-soft); }
.agent-chat__composer :deep([contenteditable='true']), .agent-chat__composer :deep(.chat-write-wrap), .agent-chat__composer :deep(.chat-write-input) { color: var(--da-text-primary); caret-color: var(--da-text-emphasis); }
.agent-chat-layout--preview .agent-chat__identity small { display: none; }

@media (max-width: 48rem) {
  .agent-chat-layout--preview { position: relative; display: block; }
  .agent-chat-layout--preview > :deep(.file-preview-panel), .agent-chat-layout--preview > :deep(.deliverables-panel), .agent-chat-layout--preview > :deep(.audit-panel) { position: absolute; inset: 0; z-index: 10; }
  .agent-chat__header { padding-inline: var(--da-space-4); }
  .agent-chat__header-actions { gap: 0; }
  .agent-chat__header-actions > button { padding-inline: var(--da-space-1); }
  .agent-chat__header-actions > span { display: none; }
  .agent-chat__identity small { display: none; }
  .agent-chat__messages { padding-inline: var(--da-space-4); }
  .agent-chat__composer-wrap { padding-inline: var(--da-space-4); }
  .composer-input-actions :deep(.model-selector) { max-width: min(17rem, 48vw); }
  .composer-assurance small { display: none; }
  .starter-prompts { grid-template-columns: 1fr; }
  .starter-prompts button { padding-block: var(--da-space-3); }
}

@media (max-width: 34rem) {
  .agent-chat__identity { max-width: 8rem; }
  .agent-chat__header-actions > button > span { display: none; }
  .agent-chat__header-actions > button { min-width: 2.25rem; min-height: 2.25rem; justify-content: center; }
  .welcome-workflow { gap: var(--da-space-2); }
  .welcome-workflow li:not(:last-child)::after { display: none; }
  .agent-welcome__orbit { height: 5.5rem; }
  .agent-chat__messages { padding-inline: var(--da-space-3); }
  .agent-chat__composer-wrap { padding-inline: var(--da-space-3); padding-bottom: var(--da-space-3); }
  .run-recovery small { max-width: 12rem; }
}

@media (max-width: 72rem) {
  .agent-welcome :deep(.elx-welcome__description) { white-space: normal; }
}

@container workspace (max-width: 56rem) {
  .agent-chat-layout--preview { position: relative; display: block; }
  .agent-chat-layout--preview > :deep(.file-preview-panel),
  .agent-chat-layout--preview > :deep(.deliverables-panel),
  .agent-chat-layout--preview > :deep(.audit-panel) { position: absolute; inset: 0; z-index: 10; }
}

@media (prefers-reduced-motion: reduce) {
  .agent-welcome__orbit :deep(.agent-mark) { animation: none; }
  .agent-chat-layout { transition: none; }
  .response-pending__dots i { animation: none; }
  .starter-prompts button, .starter-prompts button > span,
  .jump-latest-enter-active, .jump-latest-leave-active { transition: none; }
}
</style>
