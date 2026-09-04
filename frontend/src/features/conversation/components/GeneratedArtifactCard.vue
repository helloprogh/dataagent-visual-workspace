<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { fileBadgeLabel, type ConversationFilePreview } from '../types/filePreview'

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
const fileBadge = computed(() => fileBadgeLabel(props.file))

function preview() {
  emit('preview', props.file)
}
</script>

<template>
  <section class="generated-artifact-card" :class="{ 'generated-artifact-card--pending': pending && file.approvalInterruptId }" data-testid="generated-artifact-card" :aria-busy="busy">
    <button type="button" class="generated-artifact-card__main" @click="preview">
      <span class="generated-artifact-card__mark" :data-kind="fileBadge" aria-hidden="true">{{ fileBadge }}</span>
      <span class="generated-artifact-card__body">
        <b :title="file.name">{{ file.name }}</b>
        <small>{{ t('artifact.generated') }}</small>
      </span>
      <span class="generated-artifact-card__open">{{ t('artifact.open') }}</span>
    </button>
    <div v-if="pending && file.approvalInterruptId" class="generated-artifact-card__actions">
      <button type="button" class="generated-artifact-card__confirm" :disabled="busy" @click="emit('confirm', file.approvalInterruptId)">{{ busy ? t('chat.responseOrganizing') : t('app.confirmContinue') }}</button>
      <button type="button" class="generated-artifact-card__cancel" :disabled="busy" @click="emit('cancel', file.approvalInterruptId)">{{ t('app.cancel') }}</button>
    </div>
    <span v-else-if="file.approvalResolved" class="generated-artifact-card__resolved"><i aria-hidden="true">✓</i>{{ t('artifact.handled') }}</span>
  </section>
</template>

<style scoped>
.generated-artifact-card { display: grid; width: min(100%, 48rem); min-width: 0; overflow: hidden; margin: var(--da-space-3) 0 var(--da-space-4); border: 0.0625rem solid var(--da-border-strong); border-radius: var(--da-radius-lg); background: linear-gradient(115deg, color-mix(in srgb, var(--da-accent-blue) 4%, var(--da-surface-2)), var(--da-surface-1)); box-shadow: var(--da-shadow-card); transition: border-color 180ms ease, box-shadow 180ms ease, transform 180ms ease; }
.generated-artifact-card:hover { border-color: color-mix(in srgb, var(--da-accent-blue) 45%, var(--da-border)); box-shadow: var(--da-shadow-card), 0 0.5rem 1.75rem color-mix(in srgb, var(--da-accent-blue) 8%, transparent); transform: translateY(-0.125rem); }
.generated-artifact-card--pending { border-color: color-mix(in srgb, var(--da-accent-blue) 40%, var(--da-border)); box-shadow: inset 0.1875rem 0 0 var(--da-accent-blue), var(--da-shadow-card); }
.generated-artifact-card__main { display: flex; width: 100%; min-width: 0; align-items: center; gap: var(--da-space-4); padding: var(--da-space-5); border: 0; color: var(--da-text-primary); background: transparent; cursor: pointer; text-align: left; }
.generated-artifact-card__mark { position: relative; display: grid; width: 2.75rem; height: 3rem; flex: 0 0 auto; place-items: center; border: 0.0625rem solid color-mix(in srgb, var(--da-accent-blue) 22%, var(--da-border)); border-radius: var(--da-radius-md); color: var(--da-accent-blue); background: color-mix(in srgb, var(--da-accent-blue) 8%, var(--da-surface-2)); font-size: 0.6875rem; font-weight: 750; letter-spacing: 0.04em; }
.generated-artifact-card__mark::after { position: absolute; top: 0.25rem; right: 0.25rem; width: 0.375rem; height: 0.375rem; border-top: 0.0625rem solid currentColor; border-right: 0.0625rem solid currentColor; border-radius: 0 0.125rem 0 0; opacity: 0.5; content: ''; }
.generated-artifact-card__mark[data-kind='ZIP'], .generated-artifact-card__mark[data-kind='SQL'] { color: var(--da-brand-cyan); border-color: color-mix(in srgb, var(--da-brand-cyan) 22%, var(--da-border)); background: color-mix(in srgb, var(--da-brand-cyan) 8%, var(--da-surface-2)); }
.generated-artifact-card__body { display: grid; min-width: 0; flex: 1; gap: var(--da-space-1); }
.generated-artifact-card__body b { overflow: hidden; color: var(--da-text-emphasis); font-size: var(--da-font-size-sm); font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.generated-artifact-card__body small { color: var(--da-text-muted); font-size: var(--da-font-size-xs); line-height: 1.5; }
.generated-artifact-card__open { flex: 0 0 auto; color: var(--da-text-link); font-size: var(--da-font-size-xs); white-space: nowrap; transition: transform 180ms ease; }
.generated-artifact-card__main:hover .generated-artifact-card__open { transform: translateX(0.125rem); }
.generated-artifact-card__actions { display: flex; align-items: center; gap: var(--da-space-2); padding: var(--da-space-3) var(--da-space-5); border-top: 0.0625rem solid color-mix(in srgb, var(--da-accent-blue) 15%, var(--da-border)); background: color-mix(in srgb, var(--da-accent-blue) 4%, var(--da-surface-1)); }
.generated-artifact-card__actions button { min-width: 6rem; min-height: 2.25rem; padding: var(--da-space-2) var(--da-space-4); border-radius: var(--da-radius-sm); cursor: pointer; font-size: var(--da-font-size-xs); transition: background-color 160ms ease, box-shadow 160ms ease; }
.generated-artifact-card__confirm { border: 0.0625rem solid var(--da-accent-blue); color: var(--da-text-on-accent); background: var(--da-accent-blue); box-shadow: 0 0.25rem 0.75rem var(--da-accent-primary-soft); font-weight: 600; }
.generated-artifact-card__confirm:hover:not(:disabled) { background: var(--da-accent-primary-hover); box-shadow: 0 0.25rem 1rem var(--da-brand-glow); }
.generated-artifact-card__cancel { border: 0.0625rem solid var(--da-border-strong); color: var(--da-text-secondary); background: transparent; }
.generated-artifact-card__cancel:hover:not(:disabled) { color: var(--da-text-emphasis); background: var(--da-surface-hover); }
.generated-artifact-card button:focus-visible { outline: var(--da-focus-outline); outline-offset: -0.1875rem; }
.generated-artifact-card__actions button:disabled { cursor: wait; opacity: 0.6; }
.generated-artifact-card__resolved { display: flex; align-items: center; gap: var(--da-space-2); padding: 0 var(--da-space-5) var(--da-space-3); color: var(--da-text-muted); font-size: var(--da-font-size-xs); white-space: nowrap; }
.generated-artifact-card__resolved i { display: grid; width: 1rem; height: 1rem; place-items: center; border-radius: 50%; color: var(--da-brand-cyan); background: color-mix(in srgb, var(--da-brand-cyan) 10%, transparent); font-size: 0.625rem; font-style: normal; }
@media (max-width: 40rem) { .generated-artifact-card__main { flex-wrap: wrap; gap: var(--da-space-3); padding: var(--da-space-4); } .generated-artifact-card__body { flex-basis: calc(100% - 4rem); } .generated-artifact-card__open { margin-left: 3.5rem; } .generated-artifact-card__actions { padding: var(--da-space-3) var(--da-space-4); } .generated-artifact-card__actions button { flex: 1; } }
@media (prefers-reduced-motion: reduce) { .generated-artifact-card, .generated-artifact-card__open, .generated-artifact-card__actions button { transition: none; } .generated-artifact-card:hover, .generated-artifact-card__main:hover .generated-artifact-card__open { transform: none; } }
</style>
