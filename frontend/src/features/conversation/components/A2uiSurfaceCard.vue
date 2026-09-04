<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { dataAgentCatalog, A2UI_ALLOWED_COMPONENTS } from '../../../a2ui/catalog'
import { containsRetiredA2uiApproval, operationSurfaceId, sanitizeA2uiOperations } from '../../../a2ui/sanitizeOperations'
import NativeA2uiSurface from '../../../a2ui/NativeA2uiSurface.vue'

const props = withDefaults(defineProps<{
  content: { operations?: unknown; a2ui_operations?: unknown }
  messageId: string
  busy?: boolean
}>(), { busy: false })
const emit = defineEmits<{ action: [action: unknown] }>()
const { t } = useI18n()
const expanded = ref(true)
watch(() => props.messageId, () => { expanded.value = true })

const rawOperations = computed(() => props.content?.operations ?? props.content?.a2ui_operations ?? [])
const blocked = computed(() => containsRetiredA2uiApproval(rawOperations.value))
const operations = computed(() => sanitizeA2uiOperations(rawOperations.value, new Set(A2UI_ALLOWED_COMPONENTS)))
const surfaceIds = computed(() => [...new Set(operations.value.map(operationSurfaceId))])
const componentCount = computed(() => operations.value.reduce((total, operation) => total
  + (Array.isArray(operation.updateComponents?.components) ? operation.updateComponents.components.length : 0)
  + (Array.isArray(operation.surfaceUpdate?.components) ? operation.surfaceUpdate.components.length : 0), 0))
const removed = computed(() => operations.value.length > 0
  && operations.value.every(operation => Boolean(operation.deleteSurface)))

function handleAction(action: unknown) {
  if (!props.busy) emit('action', action)
}
</script>

<template>
  <section v-if="blocked" class="a2ui-card a2ui-card--warning" role="status">
    <b>{{ t('a2ui.retiredTitle') }}</b>
    <p>{{ t('a2ui.retiredDescription') }}</p>
  </section>
  <section v-else-if="!removed" class="a2ui-card" :aria-busy="busy" :data-message-id="messageId">
    <button class="a2ui-card__header" type="button" :aria-expanded="expanded" @click="expanded = !expanded">
      <span class="a2ui-card__mark" aria-hidden="true">▦</span>
      <span class="a2ui-card__heading">
        <b>{{ surfaceIds.length === 1 ? surfaceIds[0].replace(/[-_]+/g, ' ') : t('a2ui.generated') }}</b>
        <small>{{ t('a2ui.interaction') }} · {{ t('a2ui.components', { count: componentCount }) }}{{ busy ? t('a2ui.busy') : '' }}</small>
      </span>
      <span class="a2ui-card__status"><i></i>{{ busy ? t('a2ui.processing') : t('a2ui.interactive') }}</span>
      <span class="a2ui-card__chevron" :class="{ expanded }" aria-hidden="true">›</span>
    </button>
    <div v-show="expanded" class="a2ui-card__body">
      <NativeA2uiSurface
        v-if="operations.length"
        :operations="operations"
        :message-id="messageId"
        :catalog="dataAgentCatalog"
        :on-action="handleAction"
      />
      <p v-else class="a2ui-card__empty">{{ t('a2ui.invalid') }}</p>
    </div>
  </section>
</template>

<style scoped>
.a2ui-card { width: 100%; min-width: 0; overflow: hidden; border: 0.0625rem solid var(--da-border); border-radius: var(--da-radius-lg); background: var(--da-surface-1); animation: a2ui-arrive 180ms ease-out; }
.a2ui-card__header { display: flex; width: 100%; align-items: center; gap: var(--da-space-3); padding: var(--da-space-4); border: 0; color: var(--da-text-primary); background: transparent; text-align: left; cursor: pointer; }
.a2ui-card__header:hover { background: var(--da-surface-2); }
.a2ui-card__mark { display: grid; width: 2rem; height: 2rem; flex: 0 0 auto; place-items: center; border: 0.0625rem solid var(--da-border); border-radius: var(--da-radius-sm); color: var(--da-accent-blue); font-size: 1.25rem; }
.a2ui-card__heading { display: grid; min-width: 0; flex: 1; gap: var(--da-space-1); text-transform: capitalize; }
.a2ui-card__heading b { overflow: hidden; font-size: var(--da-font-size-sm); text-overflow: ellipsis; white-space: nowrap; }
.a2ui-card__heading small, .a2ui-card__status { color: var(--da-text-muted); font-size: var(--da-font-size-xs); }
.a2ui-card__status { display: flex; align-items: center; gap: var(--da-space-2); white-space: nowrap; }
.a2ui-card__status i { width: 0.375rem; height: 0.375rem; border-radius: 50%; background: var(--da-accent-green); }
.a2ui-card[aria-busy='true'] .a2ui-card__status i { background: var(--da-accent-blue); animation: a2ui-pulse 1.2s ease-in-out infinite; }
.a2ui-card__chevron { font-size: 1.25rem; transition: transform 160ms ease; }
.a2ui-card__chevron.expanded { transform: rotate(90deg); }
.a2ui-card__body { min-width: 0; overflow: auto; padding: 0 var(--da-space-4) var(--da-space-4); }
.a2ui-card__empty { margin: 0; padding: var(--da-space-3); color: var(--da-text-muted); }
.a2ui-card--warning { padding: var(--da-space-4); color: var(--da-text-primary); }
.a2ui-card--warning p { margin: var(--da-space-2) 0 0; color: var(--da-text-muted); }
@keyframes a2ui-arrive { from { opacity: 0; transform: translateY(0.25rem); } to { opacity: 1; transform: translateY(0); } }
@keyframes a2ui-pulse { 50% { opacity: 0.35; } }
@media (max-width: 40rem) { .a2ui-card__mark { display: none; } }
@media (prefers-reduced-motion: reduce) { .a2ui-card, .a2ui-card[aria-busy='true'] .a2ui-card__status i { animation: none; } }
</style>
