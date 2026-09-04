<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { Message } from '@ag-ui/client'
import { useI18n } from 'vue-i18n'
import { Bubble } from 'vue-element-plus-x'
import { MarkdownRenderer } from 'x-markdown-vue'
import { appTheme } from '../../../shared/theme/theme'
import { fileKindLabel, formatFileSize, type ConversationFilePreview } from '../types/filePreview'
import { nextRevealLength } from '../textReveal'
import GenerativeUiCard from './GenerativeUiCard.vue'
import A2uiSurfaceCard from './A2uiSurfaceCard.vue'

const props = withDefaults(defineProps<{ message: Message; running?: boolean; animate?: boolean; streaming?: boolean; pendingInterruptIds?: string[] }>(), {
  pendingInterruptIds: () => [],
})
const emit = defineEmits<{ preview: [file: ConversationFilePreview]; reveal: []; confirm: [interruptId: string]; cancel: [interruptId: string]; a2uiAction: [action: unknown] }>()
const { t, tm } = useI18n()
const raw = computed(() => props.message as any)
const role = computed(() => String(raw.value.role ?? ''))

const text = computed(() => {
  const content = raw.value.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter((part: any) => part?.type === 'text')
    .map((part: any) => String(part.text ?? part.content ?? ''))
    .join('')
})

const files = computed(() => {
  const content = raw.value.content
  if (!Array.isArray(content)) return []
  return content.filter((part: any) => ['image', 'audio', 'video', 'document', 'file'].includes(part?.type))
})

const toolCalls = computed(() => Array.isArray(raw.value.toolCalls) ? raw.value.toolCalls : [])
const isUser = computed(() => role.value === 'user')
const isAssistant = computed(() => role.value === 'assistant')
const isReasoning = computed(() => role.value === 'reasoning')
const isTool = computed(() => role.value === 'tool')
const isActivity = computed(() => role.value === 'activity')

function toolDisplayName(name: unknown) {
  const value = String(name ?? '').trim()
  const labels: Record<string, string> = { ...tm('chat.toolLabels') as any }
  return labels[value.toLowerCase()] ?? (value.startsWith('mcp_') ? t('message.externalCapability') : value || t('message.executeTool'))
}

const activity = computed(() => {
  const content = raw.value.content && typeof raw.value.content === 'object' && !Array.isArray(raw.value.content)
    ? raw.value.content
    : {}
  const type = String(raw.value.activityType ?? '')
  const status = String(content.status ?? '')
  if (type === 'dataagent.task') {
    const labels: Record<string, string> = {
      queued: t('message.queued'),
      delivered: t('message.delivered'),
      running: t('message.running'),
      waiting_permission: t('message.waitingPermission'),
      retry: t('message.retrying'),
      completed: t('message.completed'),
    }
    const detail = status === 'waiting_permission'
      ? String(content.permission?.action ? t('message.pendingAction', { action: content.permission.action }) : t('message.continueAfterConfirm'))
      : status === 'retry'
        ? String(content.attempt ? t('message.retryCount', { count: content.attempt }) : '')
        : ''
    return {
      title: labels[status] ?? t('message.statusUpdated'),
      detail,
      tone: status === 'retry' ? 'warning' : status === 'completed' ? 'success' : 'active',
      visible: status !== 'completed',
    }
  }
  if (type === 'dataagent.tool') {
    const name = toolDisplayName(content.name)
    return {
      title: status === 'completed' ? t('message.completedNamed', { name }) : status === 'error' ? t('message.failedNamed', { name }) : t('message.runningNamed', { name }),
      detail: '',
      tone: status === 'error' ? 'warning' : status === 'completed' ? 'success' : 'active',
      visible: true,
    }
  }
  return { title: t('message.runUpdated'), detail: '', tone: 'active', visible: true }
})

const displayedText = ref('')
let revealTimer: ReturnType<typeof setTimeout> | undefined
let revealId = ''
let previousText = ''
let characters: string[] = []
let revealed = 0
let deadline = 0
let previousTick = 0
const isRevealing = computed(() => displayedText.value !== text.value)
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

function cancelReveal() {
  if (revealTimer !== undefined) clearTimeout(revealTimer)
  revealTimer = undefined
}

function finishReveal() {
  cancelReveal()
  revealed = characters.length
  displayedText.value = text.value
  emit('reveal')
}

function tickReveal() {
  revealTimer = undefined
  if (document.hidden || reducedMotion.matches) return finishReveal()
  const now = performance.now()
  revealed = nextRevealLength(revealed, characters.length, now - previousTick, deadline - previousTick)
  previousTick = now
  displayedText.value = characters.slice(0, revealed).join('')
  emit('reveal')
  if (revealed < characters.length) revealTimer = setTimeout(tickReveal, 24)
}

watch([() => props.message.id, text, () => props.animate], ([id, value, animate]) => {
  const append = revealId === id && value.startsWith(previousText)
  revealId = id
  previousText = value
  characters = Array.from(value)
  if (!animate || role.value !== 'assistant' || reducedMotion.matches || document.hidden) return finishReveal()
  if (!append) { cancelReveal(); revealed = 0; displayedText.value = '' }
  deadline = performance.now() + 240
  if (revealTimer === undefined && revealed < characters.length) {
    previousTick = performance.now()
    revealTimer = setTimeout(tickReveal, 24)
  }
}, { immediate: true })

function onRevealPreferenceChange() {
  if (document.hidden || reducedMotion.matches) finishReveal()
}
reducedMotion.addEventListener('change', onRevealPreferenceChange)
document.addEventListener('visibilitychange', onRevealPreferenceChange)
onBeforeUnmount(() => {
  cancelReveal()
  reducedMotion.removeEventListener('change', onRevealPreferenceChange)
  document.removeEventListener('visibilitychange', onRevealPreferenceChange)
})

const reasoningDuration = computed(() => {
  const duration = Number(raw.value.reasoningDurationMs)
  if (!Number.isFinite(duration) || duration < 0) return ''
  return duration < 1000 ? t('message.lessThanSecond') : t('message.seconds', { count: Math.round(duration / 1000) })
})

function previewFile(file: any, index: number) {
  const url = String(file?.metadata?.clientPreviewUrl ?? file?.source?.value ?? '').trim()
  if (!url) return
  emit('preview', {
    id: String(file?.metadata?.fileId ?? `${props.message.id}-${index}`),
    name: String(file?.metadata?.filename ?? t('message.attachment', { count: index + 1 })),
    url,
    mimeType: String(file?.source?.mimeType ?? file?.mimeType ?? 'application/octet-stream'),
    ...(Number(file?.metadata?.size) > 0 ? { size: Number(file.metadata.size) } : {}),
    ...(String(file?.metadata?.approvalInterruptId ?? file?.metadata?.approval?.interruptId ?? '').trim()
      ? { approvalInterruptId: String(file.metadata.approvalInterruptId ?? file.metadata.approval.interruptId).trim() }
      : {}),
  })
}
</script>

<template>
  <Bubble
    v-if="isUser"
    placement="end"
    variant="filled"
    shape="corner"
    avatar-size="0rem"
    avatar-gap="0rem"
    class="message-bubble message-bubble--user"
  >
    <template #content>
      <div class="user-content">
        <p v-if="text">{{ text }}</p>
        <div v-if="files.length" class="attachment-list">
          <button
            v-for="(file, index) in files"
            :key="index"
            type="button"
            class="attachment-card"
            @click="previewFile(file, index)"
          >
            <span class="attachment-card__mark">{{ fileKindLabel({ name: file.metadata?.filename || t('message.attachment', { count: index + 1 }), mimeType: file.source?.mimeType || '' }).slice(0, 2) }}</span>
            <span class="attachment-card__body">
              <b>{{ file.metadata?.filename || t('message.attachment', { count: index + 1 }) }}</b>
              <small>{{ [fileKindLabel({ name: file.metadata?.filename || t('message.attachment', { count: index + 1 }), mimeType: file.source?.mimeType || '' }), formatFileSize(file.metadata?.size)].filter(Boolean).join(' · ') }}</small>
            </span>
            <span class="attachment-card__action">{{ t('message.preview') }}</span>
          </button>
        </div>
      </div>
    </template>
  </Bubble>

  <Bubble
    v-else-if="isAssistant"
    placement="start"
    variant="borderless"
    avatar-size="0rem"
    avatar-gap="0rem"
    class="message-bubble message-bubble--assistant"
  >
    <template #content>
      <div class="assistant-content">
        <MarkdownRenderer
          v-if="displayedText"
          :markdown="displayedText"
          :sanitize="true"
          :is-dark="appTheme === 'dark'"
          :enable-shiki="false"
          :enable-mermaid="false"
        />
        <span v-if="streaming || isRevealing" class="response-caret" :aria-label="t('message.generatingAnswer')"></span>
        <div v-if="files.length" class="attachment-list">
          <button
            v-for="(file, index) in files"
            :key="index"
            type="button"
            class="attachment-card"
            @click="previewFile(file, index)"
          >
            <span class="attachment-card__mark">{{ fileKindLabel({ name: file.metadata?.filename || t('message.attachment', { count: index + 1 }), mimeType: file.source?.mimeType || '' }).slice(0, 2) }}</span>
            <span class="attachment-card__body">
              <b>{{ file.metadata?.filename || t('message.attachment', { count: index + 1 }) }}</b>
              <small>{{ [fileKindLabel({ name: file.metadata?.filename || t('message.attachment', { count: index + 1 }), mimeType: file.source?.mimeType || '' }), formatFileSize(file.metadata?.size)].filter(Boolean).join(' · ') }}</small>
            </span>
            <span class="attachment-card__action">{{ t('message.preview') }}</span>
          </button>
        </div>
        <div v-if="toolCalls.length" class="tool-call-list">
          <details v-for="call in toolCalls" :key="call.id" class="tool-call">
            <summary>
              <span class="tool-mark" aria-hidden="true">
                <svg viewBox="0 0 16 16"><path d="M3.25 4.75 6.5 8l-3.25 3.25M8 11.25h4.75" /></svg>
              </span>
              <span>{{ toolDisplayName(call.function?.name) }}</span>
              <span class="disclosure-icon" aria-hidden="true"></span>
            </summary>
            <pre>{{ call.function?.arguments || '{}' }}</pre>
          </details>
        </div>
      </div>
    </template>
  </Bubble>

  <section v-else-if="isReasoning" class="reasoning-card" :class="{ 'reasoning-card--running': running }">
    <details :open="Boolean(running)">
      <summary>
        <span class="reasoning-node" aria-hidden="true"><i></i></span>
        <span>{{ running ? t('message.thinking') : text ? t('message.thoughtProcess') : t('message.thoughtDone') }}</span>
        <small v-if="!running && reasoningDuration">{{ reasoningDuration }}</small>
        <span class="disclosure-icon" aria-hidden="true"></span>
      </summary>
      <div class="reasoning-content">{{ text || (running ? t('message.analyzing') : t('message.noReasoning')) }}</div>
    </details>
  </section>

  <details v-else-if="isTool" class="tool-result-card">
    <summary>
      <span class="tool-mark" :class="raw.error ? 'tool-mark--error' : 'tool-mark--success'" aria-hidden="true">
        <svg viewBox="0 0 16 16"><path d="M3.25 4.75 6.5 8l-3.25 3.25M8 11.25h4.75" /></svg>
      </span>
      <span>{{ raw.error ? t('message.toolFailed') : t('message.toolResult') }}</span>
      <span class="disclosure-icon" aria-hidden="true"></span>
    </summary>
    <pre>{{ text }}</pre>
  </details>

  <GenerativeUiCard
    v-else-if="isActivity && raw.activityType === 'dataagent.ui'"
    :content="raw.content"
    :message-id="message.id"
    :pending-interrupt-ids="pendingInterruptIds"
    :busy="running"
    @preview="emit('preview', $event)"
    @confirm="emit('confirm', $event)"
    @cancel="emit('cancel', $event)"
  />

  <A2uiSurfaceCard
    v-else-if="isActivity && raw.activityType === 'a2ui-surface'"
    :content="raw.content"
    :message-id="message.id"
    :busy="running"
    @action="emit('a2uiAction', $event)"
  />

  <section v-else-if="isActivity && activity.visible" class="activity-card">
    <i :class="`activity-card__dot activity-card__dot--${activity.tone}`"></i>
    <div>
      <b>{{ activity.title }}</b>
      <small v-if="activity.detail">{{ activity.detail }}</small>
    </div>
  </section>
</template>

<style scoped>
.message-bubble { width: 100%; }
.message-bubble--user { --elx-bubble-bg-color: var(--da-surface-3); }
.message-bubble--assistant :deep(.elx-bubble__content) {
  width: 100%;
  min-width: 0;
  max-width: none;
  padding: 0;
  border: 0;
  background: transparent;
}
.user-content { max-width: 38rem; color: var(--da-text-emphasis); }
.user-content p { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.attachment-list { display: grid; gap: var(--da-space-2); margin-top: var(--da-space-3); }
.attachment-card { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; width: min(100%, 32rem); align-items: center; gap: var(--da-space-3); padding: var(--da-space-3); border: 0.0625rem solid var(--da-border); border-radius: var(--da-radius-md); color: var(--da-text-primary); background: var(--da-surface-2); cursor: pointer; text-align: left; transition: border-color 160ms ease, background-color 160ms ease, transform 160ms ease; }
.attachment-card:hover { border-color: var(--da-border-strong); background: var(--da-surface-3); transform: translateY(-0.0625rem); }
.attachment-card__mark { display: grid; width: 2rem; height: 2rem; place-items: center; border: 0.0625rem solid var(--da-border-strong); border-radius: var(--da-radius-sm); color: var(--da-accent-orange); background: var(--da-surface-1); font-size: 0.625rem; font-weight: 700; letter-spacing: 0.04em; }
.attachment-card__body { display: grid; min-width: 0; gap: 0.125rem; }
.attachment-card__body b { overflow: hidden; color: var(--da-text-emphasis); font-size: var(--da-font-size-sm); font-weight: 550; text-overflow: ellipsis; white-space: nowrap; }
.attachment-card__body small { color: var(--da-text-muted); font-size: var(--da-font-size-xs); }
.attachment-card__action { color: var(--da-text-muted); font-size: var(--da-font-size-xs); white-space: nowrap; }
.attachment-card:hover .attachment-card__action { color: var(--da-text-emphasis); }
.message-bubble--assistant :deep(.elx-bubble__content-wrapper) { min-width: 0; }
.assistant-content { width: 100%; min-width: 0; color: var(--da-text-primary); overflow-wrap: anywhere; }
.response-caret { display: inline-block; width: 0.375rem; height: 0.875rem; margin-left: 0.125rem; border-radius: 0.125rem; background: var(--da-accent-primary); animation: response-caret-blink 900ms ease-in-out infinite; }
@keyframes response-caret-blink { 0%, 100% { opacity: 0.25; } 50% { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .response-caret { animation: none; } }
.assistant-content :deep(.x-md-renderer) {
  padding: 0 !important;
  color: var(--da-text-primary) !important;
  background: transparent !important;
}
.assistant-content :deep(.x-md-core) { color: inherit; line-height: 1.75; }
.assistant-content :deep(.x-md-core > :first-child) { margin-top: 0; }
.assistant-content :deep(.x-md-core > :last-child) { margin-bottom: 0; }
.tool-call-list { display: grid; gap: var(--da-space-1); margin-top: var(--da-space-3); }
.tool-call, .tool-result-card { width: min(100%, 48rem); border: 0; background: transparent; }
.tool-call summary, .tool-result-card summary {
  display: flex;
  width: fit-content;
  min-height: 1.75rem;
  align-items: center;
  gap: var(--da-space-2);
  padding: var(--da-space-1) var(--da-space-2);
  border-radius: var(--da-radius-sm);
  color: var(--da-text-muted);
  cursor: pointer;
  font-size: var(--da-font-size-xs);
  list-style: none;
  transition: color 160ms ease, background-color 160ms ease;
}
.tool-call summary::-webkit-details-marker, .tool-result-card summary::-webkit-details-marker { display: none; }
.tool-call summary:hover, .tool-result-card summary:hover { color: var(--da-text-secondary); background: var(--da-surface-1); }
.tool-call pre, .tool-result-card pre {
  max-height: 14rem;
  margin: var(--da-space-1) 0 0 var(--da-space-2);
  overflow: auto;
  padding: var(--da-space-2) 0 var(--da-space-2) var(--da-space-4);
  border-left: 0.0625rem solid var(--da-border);
  color: var(--da-text-muted);
  font-size: var(--da-font-size-xs);
  line-height: 1.6;
  white-space: pre-wrap;
}
.tool-mark { display: grid; width: 1rem; height: 1rem; flex: 0 0 auto; place-items: center; color: var(--da-accent-blue); }
.tool-mark svg { width: 0.875rem; height: 0.875rem; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.4; }
.tool-mark--success { color: var(--da-accent-green); }
.tool-mark--error { color: var(--da-accent-orange); }
.disclosure-icon {
  position: relative;
  width: 0.75rem;
  height: 0.75rem;
  flex: 0 0 auto;
  color: var(--da-text-subtle);
  transition: transform 160ms ease, color 160ms ease;
}
.disclosure-icon::before {
  position: absolute;
  top: 0.1875rem;
  left: 0.125rem;
  width: 0.3125rem;
  height: 0.3125rem;
  border-top: 0.0625rem solid currentColor;
  border-right: 0.0625rem solid currentColor;
  content: '';
  transform: rotate(45deg);
}
.tool-call[open] .disclosure-icon, .tool-result-card[open] .disclosure-icon, .reasoning-card details[open] .disclosure-icon { transform: rotate(90deg); }
.reasoning-card {
  position: relative;
  width: min(100%, 48rem);
  padding-left: var(--da-space-6);
  border: 0;
  background: transparent;
}
.reasoning-card::before {
  position: absolute;
  top: 1.125rem;
  bottom: 0.125rem;
  left: 0.4375rem;
  width: 0.0625rem;
  background: linear-gradient(180deg, color-mix(in srgb, var(--da-accent-orange) 52%, var(--da-border)) 0%, var(--da-border) 74%, transparent 100%);
  content: '';
}
.reasoning-card details { min-width: 0; }
.reasoning-card summary {
  position: relative;
  display: flex;
  min-height: 1.375rem;
  align-items: center;
  gap: var(--da-space-2);
  color: var(--da-text-muted);
  cursor: pointer;
  font-size: var(--da-font-size-xs);
  font-weight: 550;
  letter-spacing: 0.04em;
  list-style: none;
  transition: color 160ms ease;
}
.reasoning-card summary::-webkit-details-marker { display: none; }
.reasoning-card summary:hover { color: var(--da-text-secondary); }
.reasoning-node {
  position: absolute;
  left: calc(-1 * var(--da-space-6));
  display: grid;
  width: 0.9375rem;
  height: 0.9375rem;
  place-items: center;
  border: 0.0625rem solid color-mix(in srgb, var(--da-accent-orange) 62%, var(--da-border));
  border-radius: 50%;
  background: var(--da-surface-0);
}
.reasoning-node i { width: 0.25rem; height: 0.25rem; border-radius: 50%; background: var(--da-accent-orange); }
.reasoning-card--running .reasoning-node { animation: reasoning-pulse 1.8s ease-in-out infinite; }
.reasoning-content {
  max-width: 44rem;
  padding: var(--da-space-3) 0 var(--da-space-1);
  color: var(--da-text-muted);
  font-size: var(--da-font-size-sm);
  line-height: 1.75;
  white-space: pre-wrap;
}
@keyframes reasoning-pulse {
  0%, 100% { box-shadow: 0 0 0 0 transparent; }
  50% { box-shadow: 0 0 0 0.25rem color-mix(in srgb, var(--da-accent-orange) 12%, transparent); }
}
@media (prefers-reduced-motion: reduce) {
  .reasoning-card--running .reasoning-node { animation: none; }
}
.activity-card { width: min(100%, 48rem); padding: var(--da-space-3) var(--da-space-4); border: 0.0625rem solid var(--da-border); border-radius: var(--da-radius-md); background: var(--da-surface-1); }
.activity-card { display: flex; align-items: center; gap: var(--da-space-3); }
.activity-card__dot { width: 0.5rem; height: 0.5rem; flex: 0 0 auto; border-radius: 50%; background: var(--da-text-subtle); }
.activity-card__dot--active { background: var(--da-accent-blue); box-shadow: 0 0 0.75rem color-mix(in srgb, var(--da-accent-blue) 45%, transparent); }
.activity-card__dot--warning { background: var(--da-accent-orange); }
.activity-card__dot--success { background: var(--da-accent-green); }
.activity-card div { display: grid; gap: var(--da-space-1); }
.activity-card b { color: var(--da-text-secondary); font-size: var(--da-font-size-sm); font-weight: 500; }
.activity-card small { color: var(--da-text-muted); font-size: var(--da-font-size-xs); }
</style>
