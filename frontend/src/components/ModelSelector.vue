<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  getDefaultModel,
  listAvailableModels,
  storedModelForThread,
  switchThreadModel,
  type ModelCatalogItem,
  type ModelSelection,
} from '../model/model-selection'

const props = defineProps<{
  threadId: string
  disabled?: boolean
}>()

const models = ref<ModelCatalogItem[]>([])
const defaultModel = ref<ModelCatalogItem | null>(null)
const currentModel = ref<ModelSelection | null>(null)
const loading = ref(false)
const switching = ref(false)
const loadError = ref('')

const providerNames: Record<string, string> = {
  local: 'Local',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  'google-vertex': 'Google Vertex',
  openrouter: 'OpenRouter',
  mistral: 'Mistral',
  azure: 'Azure',
  'amazon-bedrock': 'Amazon Bedrock',
  'github-copilot': 'GitHub Copilot',
  opencode: 'OpenCode',
}

const keyOf = (providerID: string, id: string) => JSON.stringify([providerID, id])
const selectedKey = computed(() => currentModel.value ? keyOf(currentModel.value.providerID, currentModel.value.id) : '')

const selectableModels = computed(() => {
  const result = [...models.value]
  const fallback = defaultModel.value
  if (fallback && !result.some(item => item.providerID === fallback.providerID && item.id === fallback.id)) {
    result.unshift(fallback)
  }
  return result
})

const groups = computed(() => {
  const grouped = new Map<string, ModelCatalogItem[]>()
  for (const model of selectableModels.value) {
    const list = grouped.get(model.providerID) ?? []
    list.push(model)
    grouped.set(model.providerID, list)
  }
  return [...grouped.entries()].map(([providerID, items]) => ({
    providerID,
    label: providerNames[providerID] ?? providerID,
    items,
  }))
})

function selectionFromKey(value: string): ModelSelection | null {
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed) && typeof parsed[0] === 'string' && typeof parsed[1] === 'string') {
      return { providerID: parsed[0], id: parsed[1] }
    }
  } catch {
    // Invalid option values are ignored.
  }
  return null
}

async function selectModel(value: string) {
  const next = selectionFromKey(value)
  if (!next || switching.value || props.disabled) return
  const previous = currentModel.value
  if (previous?.providerID === next.providerID && previous.id === next.id) return

  switching.value = true
  try {
    await switchThreadModel(props.threadId, next)
    currentModel.value = next
  } catch (error) {
    currentModel.value = previous
    ElMessage.error(error instanceof Error ? error.message : String(error))
  } finally {
    switching.value = false
  }
}

async function loadModels() {
  loading.value = true
  loadError.value = ''
  try {
    const [catalog, fallback] = await Promise.all([
      listAvailableModels(),
      getDefaultModel(),
    ])
    models.value = catalog
    defaultModel.value = fallback

    const stored = storedModelForThread(props.threadId)
    const candidate = stored ?? fallback
    if (candidate) {
      currentModel.value = candidate
    } else {
      currentModel.value = null
    }
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error)
  } finally {
    loading.value = false
  }
}

watch(() => props.threadId, loadModels)
onMounted(loadModels)
</script>

<template>
  <div class="model-selector" :title="loadError || '切换当前会话模型'">
    <span class="model-selector__icon" aria-hidden="true">◇</span>
    <el-select
      :model-value="selectedKey"
      class="model-selector__select"
      popper-class="model-selector-popper"
      :loading="loading || switching"
      filterable
      :disabled="disabled || switching || Boolean(loadError && !models.length)"
      placeholder="加载默认模型…"
      aria-label="切换当前会话模型"
      @change="selectModel"
    >
      <el-option-group v-for="group in groups" :key="group.providerID" :label="group.label">
        <el-option
          v-for="model in group.items"
          :key="keyOf(model.providerID, model.id)"
          :label="model.name"
          :value="keyOf(model.providerID, model.id)"
        >
          <div class="model-selector__option">
            <span>
              {{ model.name }}
              <i v-if="defaultModel && model.providerID === defaultModel.providerID && model.id === defaultModel.id">默认</i>
            </span>
            <small>{{ model.id }}</small>
          </div>
        </el-option>
      </el-option-group>
    </el-select>
    <button v-if="loadError" class="model-selector__retry" type="button" title="重新加载模型" @click="loadModels">↻</button>
  </div>
</template>

<style scoped>
.model-selector{height:32px;display:flex;align-items:center;gap:6px;padding:0 7px;border:1px solid var(--da-border,rgba(171,191,211,.16));border-radius:8px;background:rgba(255,255,255,.022)}
.model-selector__icon{flex:none;color:var(--da-accent-blue,#8fa6e8);font-size:12px;line-height:1}
.model-selector__select{width:190px}
.model-selector__select :deep(.el-select__wrapper){min-height:28px!important;padding:0 5px!important;background:transparent!important;box-shadow:none!important}
.model-selector__select :deep(.el-select__selected-item){max-width:152px;color:var(--da-text-secondary,#c4ccd7)!important;font-size:11.5px;font-weight:600}
.model-selector__select :deep(.el-select__placeholder){color:var(--da-text-muted,#a4afbf)!important;font-size:11.5px}
.model-selector__retry{width:24px;height:24px;display:grid;place-items:center;border:0;border-radius:6px;background:transparent;color:var(--da-text-muted,#a4afbf);cursor:pointer}
.model-selector__retry:hover{background:rgba(255,255,255,.045);color:var(--da-text-primary,#e3e8ef)}
@media(max-width:760px){.model-selector__select{width:130px}.model-selector__select :deep(.el-select__selected-item){max-width:96px}}
</style>

<style>
.model-selector-popper .el-select-group__title{color:var(--da-text-muted,#a4afbf)!important;font-size:10px!important;font-weight:700!important;letter-spacing:.05em}
.model-selector-popper .el-select-dropdown__item{height:auto!important;min-height:36px!important;padding:6px 12px!important}
.model-selector__option{min-width:0;display:flex;flex-direction:column;gap:2px;line-height:1.25}
.model-selector__option>span{overflow:hidden;text-overflow:ellipsis;color:var(--da-text-primary,#e3e8ef);font-size:12px;font-weight:600;white-space:nowrap}
.model-selector__option>span i{display:inline-flex;margin-left:5px;padding:1px 4px;border:1px solid rgba(143,166,232,.22);border-radius:4px;color:var(--da-accent-blue,#8fa6e8);font-size:8px;font-style:normal;font-weight:700;vertical-align:1px}
.model-selector__option>small{overflow:hidden;text-overflow:ellipsis;color:var(--da-text-muted,#a4afbf);font-size:10px;white-space:nowrap}
</style>
