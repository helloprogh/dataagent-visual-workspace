<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { getDefaultModel, getSelectedModel, listModels, switchSessionModel } from '../api/model'
import type { ModelCatalogItem, ModelSelection } from '../types'

const props = defineProps<{
  sessionId?: string
  draft?: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{ selected: [model: ModelSelection] }>()
const models = ref<ModelCatalogItem[]>([])
const selectedKey = ref('')
const loading = ref(false)
const changing = ref(false)
const { t } = useI18n()

const disabled = computed(() => Boolean(props.disabled || loading.value || changing.value))
const modelByKey = computed(() => new Map(models.value.map(model => [`${model.providerID}::${model.id}`, model])))
const selectedModelName = computed(() => modelByKey.value.get(selectedKey.value)?.name ?? t('model.select'))

function keyOf(model: ModelSelection) {
  return `${model.providerID}::${model.id}`
}

async function load() {
  loading.value = true
  try {
    const [catalog, defaultModel] = await Promise.all([listModels(), getDefaultModel()])
    models.value = catalog
    const remembered = props.sessionId ? getSelectedModel(props.sessionId) : null
    const initial = remembered ?? defaultModel ?? catalog[0] ?? null
    if (initial) {
      selectedKey.value = keyOf(initial)
      // Reading an existing session must never call the switch API. Emit the
      // effective UI selection so the composer can submit, but only `change`
      // below mutates an existing session's model.
      emit('selected', initial)
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error))
  } finally {
    loading.value = false
  }
}

async function change(key: string) {
  const model = modelByKey.value.get(key)
  if (!model) return
  const previousKey = selectedKey.value
  selectedKey.value = key
  if (props.draft || !props.sessionId) {
    emit('selected', model)
    return
  }
  changing.value = true
  try {
    await switchSessionModel(props.sessionId, model)
    emit('selected', model)
  } catch (error) {
    selectedKey.value = previousKey
    ElMessage.error(error instanceof Error ? error.message : String(error))
  } finally {
    changing.value = false
  }
}

watch(() => props.sessionId, () => {
  if (!loading.value) void load()
})

onMounted(load)
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
</template>

<style scoped>
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
