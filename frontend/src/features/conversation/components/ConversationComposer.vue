<script setup lang="ts">
import { ref } from 'vue'
import type { Interrupt, ResumeEntry } from '@ag-ui/client'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { XSender } from 'vue-element-plus-x'
import type { ModelSelection } from '../../model/types'
import ModelSelector from '../../model/components/ModelSelector.vue'
import type { PendingAttachment } from '../composables/useAgentConversation'
import type { ConversationFilePreview } from '../types/filePreview'
import InterruptCard from './InterruptCard.vue'

const props = defineProps<{
  sessionId?: string
  running: boolean
  hydrating: boolean
  pendingInterrupts: Interrupt[]
  attachments: PendingAttachment[]
  pendingDelivery?: ConversationFilePreview
  composerInterrupts: Interrupt[]
  error?: string
}>()

const emit = defineEmits<{
  submit: [payload: { text: string; model: ModelSelection }]
  stop: []
  retry: []
  filesSelected: [files: FileList]
  removeAttachment: [id: string]
  resume: [entries: ResumeEntry[]]
  preview: [file: ConversationFilePreview]
}>()

const { t } = useI18n()
const senderRef = ref<any>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const selectedModel = ref<ModelSelection | null>(null)

function currentText() {
  return String(senderRef.value?.getModelValue?.()?.text ?? '').trim()
}

function chooseFiles() {
  if (!props.running && !props.pendingInterrupts.length) fileInput.value?.click()
}

function onFilesSelected(event: Event) {
  const target = event.target as HTMLInputElement
  if (target.files?.length) emit('filesSelected', target.files)
  target.value = ''
}

function submit() {
  if (props.running || props.hydrating || props.pendingInterrupts.length) return
  const text = currentText()
  if (!selectedModel.value) {
    ElMessage.warning(t('chat.modelNotReady'))
    return
  }
  if (!text && !props.attachments.length) return
  emit('submit', { text, model: selectedModel.value })
}

function setText(text: string) {
  senderRef.value?.setText?.(text)
}

function focusLast() {
  senderRef.value?.focus?.('last')
}

function clearIfText(text: string) {
  if (currentText() === text.trim()) senderRef.value?.clear?.()
}

function clear() {
  senderRef.value?.clear?.()
}

defineExpose({ setText, focusLast, clearIfText, clear })
</script>

<template>
  <div data-testid="conversation-composer" class="agent-chat__composer-wrap">
    <div v-if="pendingDelivery && !running && !composerInterrupts.length" class="approval-dock" role="status">
      <span class="approval-dock__icon" aria-hidden="true">◇</span>
      <div><b>{{ t('chat.approvalDetail') }}</b><small>{{ pendingDelivery.name }}</small></div>
      <button type="button" @click="emit('preview', pendingDelivery)">{{ t('chat.reviewApproval') }} <span aria-hidden="true">↗</span></button>
    </div>

    <div v-if="error && !running" class="run-recovery" role="status">
      <span><b>{{ t('chat.incomplete') }}</b><small>{{ error }}</small></span>
      <button type="button" @click="emit('retry')">{{ t('chat.retry') }}</button>
    </div>

    <InterruptCard
      v-if="composerInterrupts.length"
      :interrupts="composerInterrupts"
      :busy="running"
      @resume="emit('resume', $event)"
    />

    <div class="agent-chat__composer">
      <div v-if="attachments.length" class="attachment-queue">
        <div v-for="item in attachments" :key="item.id" class="attachment-chip">
          <span>{{ item.file.name }}</span>
          <small>{{ Math.max(1, Math.ceil(item.file.size / 1024)) }} KB</small>
          <button type="button" :aria-label="t('chat.removeAttachment')" @click="emit('removeAttachment', item.id)">×</button>
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
        @cancel="emit('stop')"
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
</template>

<style scoped>
.agent-chat__composer-wrap { z-index: 2; min-width: 0; padding: 0 clamp(1rem, 4vw, 3.5rem) var(--da-space-5); background: linear-gradient(180deg, transparent, var(--da-surface-0) 20%); }
.run-recovery { display: flex; width: min(100%, var(--da-content-max)); align-items: center; justify-content: space-between; gap: var(--da-space-4); margin: 0 auto var(--da-space-2); padding: var(--da-space-2) var(--da-space-3); border: 0.0625rem solid color-mix(in srgb, var(--da-accent-orange) 30%, var(--da-border)); border-radius: var(--da-radius-md); background: color-mix(in srgb, var(--da-accent-orange) 5%, var(--da-surface-1)); }
.run-recovery > span { display: grid; min-width: 0; gap: 0.125rem; }
.run-recovery b { color: var(--da-text-primary); font-size: var(--da-font-size-xs); }
.run-recovery small { overflow: hidden; color: var(--da-text-muted); font-size: 0.6875rem; text-overflow: ellipsis; white-space: nowrap; }
.run-recovery button { flex: 0 0 auto; padding: var(--da-space-1) var(--da-space-3); border: 0.0625rem solid var(--da-border-strong); border-radius: var(--da-radius-sm); color: var(--da-text-primary); background: var(--da-surface-2); cursor: pointer; font-size: var(--da-font-size-xs); }
.run-recovery button:hover { border-color: var(--da-border-focus); }
.agent-chat__composer { width: min(100%, var(--da-content-max)); min-width: 0; margin: 0 auto; }
.approval-dock { display: flex; width: min(100%, var(--da-content-max)); align-items: center; gap: var(--da-space-3); margin: 0 auto var(--da-space-3); padding: var(--da-space-3); border: 0.0625rem solid color-mix(in srgb, var(--da-accent-yellow) 28%, var(--da-border)); border-radius: var(--da-radius-lg); background: var(--da-surface-2); box-shadow: var(--da-shadow-card); }
.approval-dock__icon { display: grid; width: 2rem; height: 2rem; flex: 0 0 auto; place-items: center; border-radius: var(--da-radius-md); color: var(--da-accent-yellow); background: var(--da-accent-yellow-soft); }
.approval-dock > div { display: grid; min-width: 0; flex: 1; gap: 0.2rem; }
.approval-dock b { font-size: var(--da-font-size-xs); font-weight: 600; }
.approval-dock small { overflow: hidden; color: var(--da-text-muted); font-size: 0.75rem; text-overflow: ellipsis; white-space: nowrap; }
.approval-dock button { flex: 0 0 auto; min-height: 2rem; padding: 0 var(--da-space-3); border: 0.0625rem solid var(--da-border); border-radius: var(--da-radius-md); color: var(--da-accent-primary); background: var(--da-accent-primary-soft); cursor: pointer; font-size: var(--da-font-size-xs); }
.approval-dock button:hover { border-color: var(--da-border-focus); }
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
@media (max-width: 48rem) {
  .agent-chat__composer-wrap { padding-inline: var(--da-space-4); }
  .composer-input-actions :deep(.model-selector) { max-width: min(17rem, 48vw); }
  .composer-assurance small { display: none; }
}
@media (max-width: 34rem) {
  .agent-chat__composer-wrap { padding-inline: var(--da-space-3); padding-bottom: var(--da-space-3); }
  .run-recovery small { max-width: 12rem; }
}
</style>
