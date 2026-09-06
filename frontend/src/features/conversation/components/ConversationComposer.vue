<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { XSender } from 'vue-element-plus-x'
import ModelSelector from '../../model/components/ModelSelector.vue'
import type { ModelSelection } from '../../model/types'
import type { PendingAttachment } from '../composables/useAgentConversation'

const props = defineProps<{
  sessionId?: string
  running: boolean
  pendingApprovalCount: number
  attachments: PendingAttachment[]
}>()
const emit = defineEmits<{
  submit: []
  stop: []
  selected: [model: ModelSelection]
  files: [files: File[]]
  removeAttachment: [id: string]
  retryAttachment: [id: string]
}>()
const { t } = useI18n()
const senderRef = ref<InstanceType<typeof XSender> | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const composerElement = ref<HTMLElement | null>(null)

function chooseFiles() {
  if (!props.running && !props.pendingApprovalCount) fileInput.value?.click()
}
function onFilesSelected(event: Event) {
  const target = event.target as HTMLInputElement
  if (target.files?.length) emit('files', Array.from(target.files))
  target.value = ''
}
function focus() {
  senderRef.value?.focus('last')
  // The editor's cursor API can restore a selection without DOM focus after
  // an outside click. Keep the fallback scoped to this enabled composer.
  const editor = composerElement.value?.querySelector<HTMLElement>('[contenteditable="true"]')
  if (editor && !editor.contains(document.activeElement)) {
    editor.focus()
    const range = document.createRange()
    range.selectNodeContents(editor)
    range.collapse(false)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  }
}
defineExpose({
  getText: () => String(senderRef.value?.getModelValue()?.text ?? ''),
  clear: () => senderRef.value?.clear(),
  setText: (text: string) => senderRef.value?.setText(text),
  focus,
})
</script>

<template>
      <div ref="composerElement" class="agent-chat__composer">
        <div v-if="attachments.length" class="attachment-queue">
          <div v-for="item in attachments" :key="item.id" class="attachment-chip">
            <span>{{ item.file.name }}</span>
            <small>{{ Math.max(1, Math.ceil(item.file.size / 1024)) }} KB</small>
            <small class="attachment-status" role="status" :title="item.error">{{ t(`chat.upload.${item.status}`) }}</small>
            <div class="attachment-actions">
            <button v-if="item.status === 'failed'" type="button" :disabled="running" :aria-label="`${t('chat.retry')} ${item.file.name}`" @click="emit('retryAttachment', item.id)">↻</button>
            <button type="button" :disabled="running" :aria-label="t('chat.removeAttachment')" @click="emit('removeAttachment', item.id)">×</button>
            </div>
          </div>
        </div>

        <XSender
          ref="senderRef"
          variant="updown"
          :loading="running"
          :disabled="Boolean(pendingApprovalCount)"
          :placeholder="t('chat.placeholder')"
          :custom-style="{ maxHeight: '10rem' }"
          @submit="emit('submit')"
          @cancel="emit('stop')"
        >
          <template #prefix>
            <div class="composer-input-actions">
              <el-button
                class="composer-file-button"
                text
                :title="t('chat.addFile')"
                :aria-label="t('chat.addFile')"
                :disabled="running || Boolean(pendingApprovalCount)"
                @click="chooseFiles"
              ><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 5v10M5 10h10"/></svg></el-button>
              <ModelSelector
                :session-id="sessionId"
                :draft="!sessionId"
                :disabled="running || Boolean(pendingApprovalCount)"
                @selected="emit('selected', $event)"
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
</template>

<style scoped>
.agent-chat__composer { width: min(100%, var(--da-content-max)); min-width: 0; margin: 0 auto; }
.agent-chat__composer :deep(.elx-x-sender .elx-x-sender__content.elx-x-sender__content--variant-updown .elx-x-sender__updown-action-list .elx-x-sender__prefix) { min-width: 0; flex: 1; padding-right: 0; }
.composer-input-actions { display: flex; width: 100%; min-width: 0; align-items: center; gap: var(--da-space-2); }
.composer-input-actions :deep(.model-selector) { margin-left: 0; }
.composer-file-button svg { width: 1rem; height: 1rem; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.45; }
.attachment-queue { display: flex; flex-wrap: wrap; gap: var(--da-space-2); margin-bottom: var(--da-space-2); }
.attachment-chip { display: grid; grid-template-columns: minmax(0, 1fr) auto auto auto; align-items: center; gap: var(--da-space-2); max-width: 24rem; padding: var(--da-space-2) var(--da-space-3); border: 0.0625rem solid var(--da-border); border-radius: var(--da-radius-md); background: var(--da-surface-2); }
.attachment-chip span { overflow: hidden; color: var(--da-text-primary); font-size: var(--da-font-size-sm); text-overflow: ellipsis; white-space: nowrap; }
.attachment-chip small { color: var(--da-text-muted); font-size: var(--da-font-size-xs); }
.attachment-actions { display: flex; }
.attachment-chip button:disabled { cursor: default; opacity: 0.5; }
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
  .composer-input-actions :deep(.model-selector) { max-width: min(17rem, 48vw); }
  .composer-assurance small { display: none; }
}
</style>
