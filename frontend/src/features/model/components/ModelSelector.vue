<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { getDefaultModel, getSessionModel, listModels, switchSessionModel } from '../api/model'
import type { ModelCatalogItem, ModelSelection } from '../types'

const props = defineProps<{
  sessionId?: string
  draft?: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{ selected: [model: ModelSelection | null] }>()
const models = ref<ModelCatalogItem[]>([])
const selectedKey = ref('')
const loading = ref(false)
const changing = ref(false)
const loadError = ref('')
const { t, locale } = useI18n()
let generation = 0
let pending: AbortController | null = null
onBeforeUnmount(() => { generation += 1; pending?.abort() })

const disabled = computed(() => Boolean(props.disabled || loading.value || changing.value))
const modelByKey = computed(() => new Map(models.value.map(model => [`${model.providerID}::${model.id}`, model])))
const selectedModelName = computed(() => modelByKey.value.get(selectedKey.value)?.name ?? t('model.select'))

function keyOf(model: ModelSelection) {
  return `${model.providerID}::${model.id}`
}

async function load() {
  pending?.abort()
  const controller = new AbortController()
  pending = controller
  const request = ++generation
  const sessionId = props.sessionId
  loading.value = true
  changing.value = false
  selectedKey.value = ''
  models.value = []
  loadError.value = ''
  emit('selected', null)
  try {
    const sessionModel = sessionId ? await getSessionModel(sessionId, controller.signal) : null
    let catalog: ModelCatalogItem[] = []
    let defaultModel: ModelCatalogItem | null = null
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await Promise.allSettled([listModels(controller.signal), getDefaultModel(controller.signal)])
      controller.signal.throwIfAborted()
      catalog = result[0].status === 'fulfilled' ? result[0].value : []
      defaultModel = result[1].status === 'fulfilled' ? result[1].value : null
      if (defaultModel && defaultModel.enabled !== false && !catalog.some(item => keyOf(item) === keyOf(defaultModel!))) catalog.push(defaultModel)
      if (catalog.length) break
      if (attempt === 2) {
        const failure = result.find(item => item.status === 'rejected')
        throw failure?.status === 'rejected' ? failure.reason : new Error(locale.value === 'zh-CN' ? '模型服务尚未就绪，请刷新重试' : 'Model service is not ready. Refresh to retry.')
      }
      await new Promise<void>((resolve, reject) => {
        const abort = () => { clearTimeout(timer); reject(controller.signal.reason) }
        const timer = setTimeout(() => { controller.signal.removeEventListener('abort', abort); resolve() }, 500 * (attempt + 1))
        controller.signal.addEventListener('abort', abort, { once: true })
      })
    }
    if (request !== generation) return
    if (sessionModel && !catalog.some(model => keyOf(model) === keyOf(sessionModel))) catalog.push(sessionModel)
    models.value = catalog
    const initial = catalog.find(model => sessionModel && keyOf(model) === keyOf(sessionModel))
      ?? catalog.find(model => defaultModel && keyOf(model) === keyOf(defaultModel))
      ?? catalog[0] ?? null
    if (initial) {
      selectedKey.value = keyOf(initial)
      // Reading an existing session must never call the switch API. Emit the
      // effective UI selection so the composer can submit, but only `change`
      // below mutates an existing session's model.
      emit('selected', initial)
    }
  } catch (error) {
    if (request !== generation) return
    loadError.value = error instanceof Error ? error.message : String(error)
  } finally {
    if (request === generation) loading.value = false
  }
}

async function change(key: string) {
  if (disabled.value) return
  const model = modelByKey.value.get(key)
  if (!model) return
  const request = generation
  const previousKey = selectedKey.value
  const sessionId = props.sessionId
  selectedKey.value = key
  if (props.draft || !props.sessionId) {
    emit('selected', model)
    return
  }
  changing.value = true
  try {
    await switchSessionModel(sessionId!, model)
    if (request !== generation) return
    emit('selected', model)
  } catch (error) {
    if (request !== generation) return
    selectedKey.value = previousKey
    ElMessage.error(error instanceof Error ? error.message : String(error))
  } finally {
    if (request === generation) changing.value = false
  }
}

watch(() => props.sessionId, load, { immediate: true })
</script>

<template>
  <el-select
    class="model-selector"
    popper-class="model-selector-popper"
    :model-value="selectedKey"
    :disabled="disabled"
    :loading="loading"
    :placeholder="t('model.select')"
    :aria-label="t('model.select')"
    :title="selectedModelName"
    @click.stop
    @mousedown.stop
    @update:model-value="change"
  >
    <el-option
      v-for="model in models"
      :key="`${model.providerID}::${model.id}`"
      :value="`${model.providerID}::${model.id}`"
      :label="model.name"
    >
      <span class="model-option__name">{{ model.name }}</span>
      <small class="model-option__provider">{{ model.providerID }}</small>
    </el-option>
  </el-select>
  <el-button v-if="loadError" class="model-retry" text :disabled="props.disabled || loading" :title="loadError" :aria-label="`${t('app.refresh')} ${t('model.select')}`" @click="load">{{ t('app.refresh') }}</el-button>
  <span v-if="loadError" class="model-load-error" role="status">{{ loadError }}</span>
</template>

<style scoped>
.model-load-error { color: var(--da-text-muted); font-size: var(--da-font-size-xs); }
.model-selector {
  width: max-content;
  min-width: 0;
  max-width: 17rem;
}

/* Let the visible label provide intrinsic width instead of an absolute overlay. */
.model-selector :deep(.el-select__selection) { flex: 0 1 auto; }
.model-selector :deep(.el-select__placeholder) {
  position: static;
  width: auto;
  transform: none;
}

.model-option__name {
  min-width: 0;
  overflow: hidden;
  color: var(--da-text-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-option__provider {
  margin-left: var(--da-space-3);
  color: var(--da-text-subtle);
  font-size: var(--da-font-size-xs);
}
</style>
