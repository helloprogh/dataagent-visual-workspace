<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { fileKindLabel, type ConversationFilePreview } from '../types/filePreview'

const props = withDefaults(defineProps<{
  file: ConversationFilePreview
  pending?: boolean
  busy?: boolean
}>(), {
  pending: false,
  busy: false,
})

const emit = defineEmits<{
  preview: [file: ConversationFilePreview]
  confirm: [interruptId: string]
  cancel: [interruptId: string]
}>()
const { t } = useI18n()

function preview() {
  emit('preview', props.file)
}
</script>

<template>
  <section class="generated-artifact-card" data-testid="generated-artifact-card" :aria-busy="busy">
    <button type="button" class="generated-artifact-card__main" @click="preview">
      <span class="generated-artifact-card__mark" aria-hidden="true">{{ fileKindLabel(file).slice(0, 3) }}</span>
      <span class="generated-artifact-card__body">
        <b>{{ file.name }}</b>
        <small>{{ t('artifact.generated') }}</small>
      </span>
      <span class="generated-artifact-card__open">{{ t('artifact.open') }}</span>
    </button>
    <div v-if="pending && file.approvalInterruptId" class="generated-artifact-card__actions">
      <button type="button" class="generated-artifact-card__confirm" :disabled="busy" @click="emit('confirm', file.approvalInterruptId)">{{ busy ? t('chat.responseOrganizing') : t('app.confirmContinue') }}</button>
      <button type="button" class="generated-artifact-card__cancel" :disabled="busy" @click="emit('cancel', file.approvalInterruptId)">{{ t('app.cancel') }}</button>
    </div>
    <span v-else-if="file.approvalResolved" class="generated-artifact-card__resolved">{{ t('artifact.handled') }}</span>
  </section>
</template>

<style scoped>
.generated-artifact-card { display: flex; width: min(100%, 48rem); align-items: stretch; gap: var(--da-space-2); margin: var(--da-space-3) 0 var(--da-space-4); padding: var(--da-space-2); border: 0.0625rem solid var(--da-border-strong); border-radius: var(--da-radius-lg); background: var(--da-surface-1); box-shadow: 0 0.5rem 1.5rem rgb(0 0 0 / 7%); }
.generated-artifact-card__main { display: flex; min-width: 0; flex: 1; align-items: center; gap: var(--da-space-3); padding: var(--da-space-3); border: 0; color: var(--da-text-primary); background: transparent; cursor: pointer; text-align: left; }
.generated-artifact-card__main:hover { background: var(--da-surface-2); }
.generated-artifact-card__mark { display: grid; width: 2.25rem; height: 2.25rem; flex: 0 0 auto; place-items: center; border: 0.0625rem solid var(--da-border); border-radius: var(--da-radius-sm); color: var(--da-accent-orange); font-size: 0.625rem; font-weight: 700; letter-spacing: 0.06em; }
.generated-artifact-card__body { display: grid; min-width: 0; flex: 1; gap: var(--da-space-1); }
.generated-artifact-card__body b { overflow: hidden; color: var(--da-text-emphasis); text-overflow: ellipsis; white-space: nowrap; }
.generated-artifact-card__body small, .generated-artifact-card__open { color: var(--da-text-muted); font-size: var(--da-font-size-xs); white-space: nowrap; }
.generated-artifact-card__actions { display: flex; align-items: center; gap: var(--da-space-2); padding: var(--da-space-2); }
.generated-artifact-card__actions button { min-width: 5.5rem; padding: var(--da-space-2) var(--da-space-3); border-radius: var(--da-radius-sm); cursor: pointer; font-size: var(--da-font-size-xs); }
.generated-artifact-card__confirm { border: 0.0625rem solid var(--da-accent-blue); color: white; background: var(--da-accent-blue); }
.generated-artifact-card__cancel { border: 0.0625rem solid var(--da-border-strong); color: var(--da-text-secondary); background: var(--da-surface-2); }
.generated-artifact-card__actions button:disabled { cursor: wait; opacity: 0.6; }
.generated-artifact-card__resolved { align-self: center; padding: 0 var(--da-space-3); color: var(--da-accent-green); font-size: var(--da-font-size-xs); white-space: nowrap; }
@media (max-width: 40rem) { .generated-artifact-card { flex-direction: column; } .generated-artifact-card__actions { padding-top: 0; } .generated-artifact-card__actions button { flex: 1; } }
</style>
