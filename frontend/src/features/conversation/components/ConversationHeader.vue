<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { userFacingSessionName } from '../presentation'

const props = defineProps<{
  sessionId: string
  displayName?: string
  deliverableCount: number
  running: boolean
  hydrating: boolean
  pendingCount: number
  error?: string
  deliverablesActive: boolean
  auditActive: boolean
}>()

const emit = defineEmits<{ toggleAudit: []; toggleDeliverables: [] }>()
const { t } = useI18n()
</script>

<template>
  <header class="agent-chat__header">
    <div class="agent-chat__identity">
      <small>{{ t('chat.current') }}</small>
      <b>{{ userFacingSessionName(displayName) }}</b>
      <small>{{ sessionId }}</small>
    </div>
    <div class="agent-chat__header-actions">
      <button type="button" :class="{ active: auditActive }" :aria-pressed="auditActive" :aria-label="t('chat.record')" :title="t('chat.record')" @click="emit('toggleAudit')">
        <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="6.5"/><path d="M10 6v4l2.5 1.5"/></svg><span>{{ t('chat.record') }}</span>
      </button>
      <button type="button" :class="{ active: deliverablesActive }" :aria-pressed="deliverablesActive" :aria-label="`${t('chat.deliverables')} ${deliverableCount}`" :title="t('chat.deliverables')" @click="emit('toggleDeliverables')">
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 6.5h4l1.4 1.8h7.6v7.2h-13z"/><path d="M5.5 4.5h4l1.2 2"/></svg>
        <span>{{ t('chat.deliverables') }}</span> <small>{{ deliverableCount }}</small>
      </button>
      <span role="status" :class="{ active: running, pending: pendingCount, failed: error && !running }"><i></i>{{ hydrating ? t('chat.restoring') : running ? t('chat.running') : pendingCount ? t('interrupt.needsAction') : error ? t('chat.incomplete') : t('chat.ready') }}</span>
    </div>
  </header>
</template>

<style scoped>
.agent-chat__header { display: flex; align-items: center; justify-content: space-between; gap: var(--da-space-4); min-height: 3.75rem; padding: 0 var(--da-space-6); border-bottom: 0.0625rem solid var(--da-border); background: color-mix(in srgb, var(--da-surface-0) 88%, transparent); }
.agent-chat__identity { min-width: 0; display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 0 var(--da-space-3); }
.agent-chat__identity > small:first-child { display: block; grid-row: 1; color: var(--da-accent-primary); font-size: 0.625rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
.agent-chat__identity > b { grid-row: 2; overflow: hidden; color: var(--da-text-emphasis); text-overflow: ellipsis; white-space: nowrap; }
.agent-chat__identity > small:last-child { display: none; }
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
@media (max-width: 48rem) {
  .agent-chat__header { padding-inline: var(--da-space-4); }
  .agent-chat__header-actions { gap: 0; }
  .agent-chat__header-actions > button { padding-inline: var(--da-space-1); }
  .agent-chat__header-actions > span { display: none; }
  .agent-chat__identity small { display: none; }
}
@media (max-width: 34rem) {
  .agent-chat__identity { max-width: 8rem; }
  .agent-chat__header-actions > button > span { display: none; }
  .agent-chat__header-actions > button { min-width: 2.25rem; min-height: 2.25rem; justify-content: center; }
}
</style>
