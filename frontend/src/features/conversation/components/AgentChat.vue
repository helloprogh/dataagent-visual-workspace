<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, toRef, watch } from 'vue'
import type { Message, ResumeEntry } from '@ag-ui/client'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { Welcome } from 'vue-element-plus-x'
import type { ModelSelection } from '../../model/types'
import ConversationComposer from './ConversationComposer.vue'
import { useAgentConversation } from '../composables/useAgentConversation'
import { useConversationArtifacts } from '../composables/useConversationArtifacts'
import { useConversationScroll } from '../composables/useConversationScroll'
import { useConversationPanels } from '../composables/useConversationPanels'
import { useConversationPresentation } from '../composables/useConversationPresentation'
import AgentMark from './AgentMark.vue'
import ConversationMessage from './ConversationMessage.vue'
import ConversationProcessGroup from './ConversationProcessGroup.vue'
import ConversationHeader from './ConversationHeader.vue'
import ConversationInspector from './ConversationInspector.vue'
import A2uiArtifactCard from './A2uiArtifactCard.vue'
import InterruptCard from './InterruptCard.vue'
import { buildCancellationResumeEntry, buildConfirmationResumeEntry } from '../approval'
import { userFacingSessionName } from '../presentation'
import { messageText } from '../processPresentation'

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
  retryAttachment,
  pendingSend,
  send,
  resume,
  retry,
  sendA2uiAction,
  stop,
} = useAgentConversation()

const composerRef = ref<InstanceType<typeof ConversationComposer> | null>(null)
const selectedModel = ref<ModelSelection | null>(null)
const { messageScroller, showJumpToLatest, enableFollowing, scrollToBottom, followTextReveal, handleScroll, loadEarlier } = useConversationScroll({
  sessionId: toRef(props, 'sessionId'), messages, hydrating, loadingOlder, nextCursor, loadOlder,
})
const { activePreview, deliverablesOpen, auditOpen, previewApprovalSubmitted,
  openFilePreview, openDeliverable, toggleDeliverables, toggleAudit, closeFilePreview, closePanels, resumePreviewApproval,
} = useConversationPanels()
let lastNotifiedError = ''

const welcomeDescription = computed(() => t('chat.welcomeDescription'))
const starterPrompts = computed(() => [
  { icon: '↗', ...(tm('chat.starters.analyze') as any) },
  { icon: '◇', ...(tm('chat.starters.plan') as any) },
  { icon: '✓', ...(tm('chat.starters.quality') as any) },
])

const { deliverables, auditEntries } = useConversationArtifacts(messages, pendingInterrupts, attachments, activePreview)
const { presentationItems, showResponsePending, previewInterrupts, pendingInterruptIds, pendingDelivery, composerInterrupts, generatedFilesForProcess } = useConversationPresentation({
  messages, running, activeReasoningId, activeTextId, responsePhase, pendingInterrupts, deliverables, activePreview,
})

function notifyError(reason: unknown) {
  const message = reason instanceof Error ? reason.message : String(reason)
  if (!message || message === lastNotifiedError) return
  lastNotifiedError = message
  ElMessage.error(message)
}

async function submit() {
  if (running.value || hydrating.value || pendingInterrupts.value.length) return
  const text = (composerRef.value?.getText() ?? '').trim()
  if (!selectedModel.value) {
    ElMessage.warning(t('chat.modelNotReady'))
    return
  }
  if (!text && !attachments.value.length) return
  try {
    enableFollowing()
    await send(text, selectedModel.value, prepared => {
      if ((composerRef.value?.getText() ?? '').trim() === text) composerRef.value?.clear()
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
  composerRef.value?.setText(prompt)
  void nextTick(() => composerRef.value?.focus())
}

async function retryRun() {
  if (pendingSend.value) return submit()
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
  composerRef.value?.setText(t('chat.continuePrompt', { label }))
  void nextTick(() => composerRef.value?.focus())
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
    closePanels()
    return
  }
  const target = event.target as HTMLElement | null
  if (event.key === '/' && !target?.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')) {
    event.preventDefault()
    composerRef.value?.focus()
  }
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLocaleLowerCase() === 'e' && props.sessionId) {
    event.preventDefault()
    exportConversation()
  }
}

async function resumeFileApproval(entries: ResumeEntry[]) {
  await resumePreviewApproval(entries, resumeRun)
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
  closePanels()
  selectedModel.value = null
  composerRef.value?.clear()
  void open(id ?? '')
}, { immediate: true })

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
  window.removeEventListener('keydown', onGlobalKeydown)
})
</script>

<template>
  <section class="agent-chat-layout" :class="{ 'agent-chat-layout--preview': activePreview || deliverablesOpen || auditOpen }">
  <section class="agent-chat" :class="{ 'agent-chat--empty': !sessionId && !messages.length }">
    <ConversationHeader
      v-if="sessionId"
      :session-id="sessionId"
      :display-name="displayName"
      :audit-open="auditOpen"
      :deliverables-active="Boolean(deliverablesOpen || activePreview)"
      :compact="Boolean(activePreview || deliverablesOpen || auditOpen)"
      :deliverable-count="deliverables.length"
      :pending-approval-count="pendingInterrupts.length"
      :running="running"
      :hydrating="hydrating"
      :error="error"
      @toggle-audit="toggleAudit"
      @toggle-deliverables="toggleDeliverables"
    />

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
          <el-button text :loading="loadingOlder" @click="loadEarlier">{{ t('chat.loadEarlier') }}</el-button>
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
                  <A2uiArtifactCard
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
            <A2uiArtifactCard
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

      <ConversationComposer
        ref="composerRef"
        :session-id="threadId || sessionId"
        :running="running"
        :pending-approval-count="pendingInterrupts.length"
        :attachments="attachments"
        @submit="submit"
        @stop="stopRun"
        @selected="selectedModel = $event"
        @files="stageFiles"
        @remove-attachment="removeAttachment"
        @retry-attachment="id => retryAttachment(id).catch(notifyError)"
      />
    </div>
  </section>

  <ConversationInspector
    :active-preview="activePreview"
    :preview-interrupts="previewInterrupts"
    :running="running"
    :preview-approval-submitted="previewApprovalSubmitted"
    :deliverables-open="deliverablesOpen"
    :deliverables="deliverables"
    :pending-approval-count="pendingInterrupts.length"
    :audit-open="auditOpen"
    :audit-entries="auditEntries"
    @close-preview="closeFilePreview"
    @resume="resumeFileApproval"
    @close-panels="closePanels"
    @select="openDeliverable"
  />
  </section>
</template>

<style scoped>
.agent-chat-layout { display: grid; grid-template-columns: minmax(0, 1fr); width: 100%; height: 100%; min-height: 0; overflow: hidden; transition: grid-template-columns 220ms ease; }
.agent-chat-layout--preview { grid-template-columns: minmax(28rem, 1fr) clamp(22rem, 38vw, 36rem); }
.agent-chat { position: relative; display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr) auto; width: 100%; height: 100%; min-width: 0; min-height: 0; overflow: hidden; background: var(--da-ambient), var(--da-surface-0); }
.agent-chat--empty { grid-template-rows: auto auto; align-content: safe center; gap: var(--da-space-8); padding-block: var(--da-space-8); overflow-y: auto; }
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

@media (max-width: 48rem) {
  .agent-chat-layout--preview { position: relative; display: block; }
  .agent-chat-layout--preview > :deep(.file-preview-panel), .agent-chat-layout--preview > :deep(.deliverables-panel), .agent-chat-layout--preview > :deep(.audit-panel) { position: absolute; inset: 0; z-index: 10; }
  .agent-chat__messages { padding-inline: var(--da-space-4); }
  .agent-chat__composer-wrap { padding-inline: var(--da-space-4); }
  .starter-prompts { grid-template-columns: 1fr; }
  .starter-prompts button { padding-block: var(--da-space-3); }
}

@media (max-width: 34rem) {
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
