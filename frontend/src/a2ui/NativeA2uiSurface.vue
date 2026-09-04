<script setup lang="ts">
import { computed, defineComponent, h, onBeforeUnmount, onUnmounted, ref, shallowRef, toRaw, watch, type PropType, type VNode } from 'vue'
import { ComponentContext, MessageProcessor, type SurfaceModel } from '@a2ui/web_core/v0_9'
import { useI18n } from 'vue-i18n'
import { operationSurfaceId } from './sanitizeOperations'
import type { VueComponentImplementation } from './createVueComponent'

type Operation = Record<string, any>
const props = defineProps<{ operations: Operation[]; messageId: string; catalog: any; onAction?: (action: unknown) => Promise<void> | void }>()
const { t } = useI18n()

const DeferredChild = defineComponent({
  name: 'DataAgentA2uiDeferredChild',
  props: {
    surface: { type: Object as PropType<SurfaceModel<VueComponentImplementation>>, required: true },
    id: { type: String, required: true },
    basePath: { type: String, required: true },
  },
  setup(childProps) {
    const version = ref(0)
    const created = childProps.surface.componentsModel.onCreated.subscribe((component: any) => {
      if (component.id === childProps.id) version.value += 1
    })
    const deleted = childProps.surface.componentsModel.onDeleted.subscribe((id: string) => {
      if (id === childProps.id) version.value += 1
    })
    onUnmounted(() => { created.unsubscribe(); deleted.unsubscribe() })
    const buildChild = (id: string, path?: string): VNode => h(DeferredChild, {
      key: `${id}-${path || childProps.basePath}`, surface: childProps.surface, id, basePath: path || childProps.basePath,
    })
    return () => {
      void version.value
      const model = childProps.surface.componentsModel.get(childProps.id)
      if (!model) return h('div', { class: 'a2ui-shimmer', 'aria-label': t('a2ui.loading') })
      const implementation = childProps.surface.catalog.components.get(model.type)
      if (!implementation) return h('p', { class: 'a2ui-error' }, `Unknown component: ${model.type}`)
      return h(implementation.render, { context: new ComponentContext(childProps.surface, childProps.id, childProps.basePath), buildChild })
    }
  },
})

const SurfaceRoot = defineComponent({
  props: { surface: { type: Object as PropType<SurfaceModel<VueComponentImplementation>>, required: true } },
  setup(rootProps) { return () => h(DeferredChild, { surface: rootProps.surface, id: 'root', basePath: '/' }) },
})

const processor = shallowRef<MessageProcessor<VueComponentImplementation> | null>(null)
const version = ref(0)
const error = ref('')
let lastHash = ''

function ensureProcessor() {
  if (!processor.value) processor.value = new MessageProcessor<VueComponentImplementation>([toRaw(props.catalog)], action => { void props.onAction?.(action) })
  return processor.value
}

function process(operations: Operation[]) {
  if (!operations.length) return
  const hash = JSON.stringify(operations)
  if (hash === lastHash) return
  lastHash = hash
  try {
    const current = ensureProcessor()
    const grouped = new Map<string, Operation[]>()
    for (const operation of operations) {
      const id = operationSurfaceId(operation)
      grouped.set(id, [...(grouped.get(id) ?? []), operation])
    }
    for (const [id, group] of grouped) {
      current.processMessages((current.model.getSurface(id) ? group.filter(operation => !operation.createSurface) : group) as any)
    }
    error.value = ''
    version.value += 1
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  }
}

watch(() => [props.operations, props.catalog], () => process(props.operations), { deep: true, immediate: true })
onBeforeUnmount(() => { processor.value = null; lastHash = '' })
const surfaces = computed(() => {
  void version.value
  const current = processor.value
  if (!current) return []
  return [...new Set(props.operations.map(operationSurfaceId))].flatMap(id => {
    const surface = current.model.getSurface(id)
    return surface ? [{ id, surface }] : []
  })
})
</script>

<template>
  <div v-if="operations.length" class="native-a2ui" data-testid="a2ui-activity-renderer" :data-message-id="messageId">
    <p v-if="error" class="a2ui-error">{{ t('a2ui.renderFailed') }}：{{ error }}</p>
    <section v-for="entry in surfaces" v-else :key="entry.id" :data-surface-id="entry.id" class="a2ui-surface">
      <SurfaceRoot :surface="entry.surface" />
    </section>
  </div>
</template>

<style scoped>
.native-a2ui { display: grid; width: 100%; min-height: 0; gap: var(--da-space-3); }
.a2ui-surface { width: 100%; min-width: 0; }
.a2ui-error { margin: 0; padding: var(--da-space-3); border: 0.0625rem solid color-mix(in srgb, var(--da-accent-orange) 55%, var(--da-border)); border-radius: var(--da-radius-sm); color: var(--da-accent-orange); background: var(--da-surface-1); }
.a2ui-shimmer { min-height: 2rem; border-radius: var(--da-radius-sm); background: linear-gradient(90deg,var(--da-surface-1) 25%,var(--da-surface-2) 50%,var(--da-surface-1) 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; }
@keyframes shimmer { to { background-position: -200% 0; } }
@media (prefers-reduced-motion: reduce) { .a2ui-shimmer { animation: none; } }
</style>
