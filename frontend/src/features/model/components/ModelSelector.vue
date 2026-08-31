<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
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

const disabled = computed(() => Boolean(props.disabled || loading.value || changing.value))
const modelByKey = computed(() => new Map(models.value.map(model => [`${model.providerID}::${model.id}`, model])))

function keyOf(model: ModelSelection) {
  return `${model.providerID}::${model.id}`
}

async function load() {
  loading.value = true
  try {
    const [catalog, defaultModel] = await Promise.all([listModels(), getDefaultModel()])
    models.value = catalog
    const remembered = props.sessionId ? getSelectedModel(props.sessionId) : null
    const initial = remembered
      ?? defaultModel
      ?? catalog[0]
      ?? null
    if (initial) {
      selectedKey.value = keyOf(initial)
      if (props.draft) emit('selected', initial)
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
  selectedKey.value = key
  if (props.draft || !props.sessionId) {
    emit('selected', model)
    return
  }
  changing.value = true
  try {
    await switchSessionModel(props.sessionId, model)
  } catch (error) {
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
    :model-value="selectedKey"
    :disabled="disabled"
    :loading="loading"
    placeholder="选择模型"
    @update:model-value="change"
  >
    <el-option
      v-for="model in models"
      :key="`${model.providerID}::${model.id}`"
      :value="`${model.providerID}::${model.id}`"
      :label="model.name"
    >
      <span>{{ model.name }}</span>
      <small>{{ model.providerID }}</small>
    </el-option>
  </el-select>
</template>

<style scoped>
.model-selector { width: 11rem; }
.model-selector :deep(.el-select-dropdown__item) { display: flex; justify-content: space-between; gap: var(--da-space-3); }
.model-selector small { margin-left: var(--da-space-2); color: var(--da-text-muted); font-size: var(--da-font-size-xs); }
</style>
