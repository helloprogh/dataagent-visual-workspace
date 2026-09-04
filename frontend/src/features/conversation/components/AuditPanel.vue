<script setup lang="ts">
import { useI18n } from 'vue-i18n'
export type AuditEntry = { id: string; label: string; detail: string; tone?: 'success' | 'warning' | 'active' }

defineProps<{ entries: AuditEntry[] }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
</script>

<template>
  <aside class="audit-panel" :aria-label="t('audit.label')">
    <header><div><small>{{ t('audit.eyebrow') }}</small><b>{{ t('audit.label') }}</b></div><button type="button" :aria-label="t('audit.close')" @click="emit('close')">×</button></header>
    <div class="audit-panel__body">
      <div v-for="entry in entries" :key="entry.id" class="audit-entry">
        <i :class="entry.tone"></i><div><b>{{ entry.label }}</b><small>{{ entry.detail }}</small></div>
      </div>
      <div v-if="!entries.length" class="audit-empty">{{ t('audit.empty') }}</div>
    </div>
  </aside>
</template>

<style scoped>
.audit-panel { display: grid; grid-template-rows: auto minmax(0, 1fr); min-width: 0; min-height: 0; border-left: 0.0625rem solid var(--da-border-strong); background: var(--da-surface-1); box-shadow: -1.5rem 0 4rem rgb(0 0 0 / 18%); animation: audit-enter 200ms ease-out; }
.audit-panel > header { display: flex; min-height: 3.75rem; align-items: center; justify-content: space-between; padding: 0 var(--da-space-4); border-bottom: 0.0625rem solid var(--da-border); }
.audit-panel > header > div { display: grid; gap: 0.125rem; }
.audit-panel header small { color: var(--da-brand-cyan); font: 700 0.625rem ui-monospace, SFMono-Regular, Consolas, monospace; letter-spacing: 0.1em; }
.audit-panel header b { color: var(--da-text-emphasis); font-size: var(--da-font-size-sm); }
.audit-panel header button { display: grid; width: 2rem; height: 2rem; padding: 0; place-items: center; border: 0; border-radius: var(--da-radius-sm); color: var(--da-text-muted); background: transparent; cursor: pointer; font-size: 1.25rem; }
.audit-panel header button:hover { color: var(--da-text-emphasis); background: var(--da-surface-3); }
.audit-panel__body { min-height: 0; overflow: auto; padding: var(--da-space-5); }
.audit-entry { position: relative; display: grid; grid-template-columns: auto minmax(0, 1fr); gap: var(--da-space-3); padding-bottom: var(--da-space-5); }
.audit-entry:not(:last-child)::before { position: absolute; top: 0.75rem; bottom: 0; left: 0.21875rem; width: 0.0625rem; background: var(--da-border); content: ''; }
.audit-entry > i { z-index: 1; width: 0.5rem; height: 0.5rem; margin-top: 0.25rem; border-radius: 50%; background: var(--da-text-subtle); }
.audit-entry > i.success { background: var(--da-accent-green); }.audit-entry > i.warning { background: var(--da-accent-orange); }.audit-entry > i.active { background: var(--da-accent-primary); }
.audit-entry div { display: grid; gap: 0.25rem; }.audit-entry b { color: var(--da-text-primary); font-size: var(--da-font-size-sm); }.audit-entry small { color: var(--da-text-muted); font-size: var(--da-font-size-xs); line-height: 1.5; }
.audit-empty { color: var(--da-text-muted); font-size: var(--da-font-size-sm); text-align: center; }
@keyframes audit-enter { from { opacity: 0; transform: translateX(0.75rem); } }
@media (prefers-reduced-motion: reduce) { .audit-panel { animation: none; } }
</style>
