<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { listAvailableModels, selectedModel, setSelectedModel, type ModelCatalogItem } from '../model/model-selection'

const models = ref<ModelCatalogItem[]>([])
const loading = ref(false)
const loadError = ref('')

const providerNames: Record<string, string> = {
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

const keyOf = (providerID: string, modelID: string) => JSON.stringify([providerID, modelID])
const selectedKey = computed({
  get: () => selectedModel.value ? keyOf(selectedModel.value.providerID, selectedModel.value.modelID) : '',
  set: (value: string) => {
    if (!value) return setSelectedModel(null)
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed) && typeof parsed[0] === 'string' && typeof parsed[1] === 'string') {
        setSelectedModel({ providerID: parsed[0], modelID: parsed[1] })
      }
    } catch {
      setSelectedModel(null)
    }
  },
})

const groups = computed(() => {
  const grouped = new Map<string, ModelCatalogItem[]>()
  for (const model of models.value) {
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

async function loadModels() {
  loading.value = true
  loadError.value = ''
  try {
    models.value = await listAvailableModels()
    const selected = selectedModel.value
    if (selected && models.value.length && !models.value.some(item => item.providerID === selected.providerID && item.modelID === selected.modelID)) {
      setSelectedModel(null)
    }
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error)
  } finally {
    loading.value = false
  }
}

onMounted(loadModels)
</script>

<template>
  <div class="model-selector" :title="loadError || '选择当前会话下一轮使用的模型'">
    <span class="model-selector__icon" aria-hidden="true">◇</span>
    <el-select
      v-model="selectedKey"
      class="model-selector__select"
      popper-class="model-selector-popper"
      :loading="loading"
      filterable
      :disabled="Boolean(loadError && !models.length)"
      placeholder="自动模型"
      aria-label="选择模型"
    >
      <el-option label="自动 · 服务默认" value="" />
      <el-option-group v-for="group in groups" :key="group.providerID" :label="group.label">
        <el-option
          v-for="model in group.items"
          :key="keyOf(model.providerID, model.modelID)"
          :label="model.name"
          :value="keyOf(model.providerID, model.modelID)"
        >
          <div class="model-selector__option">
            <span>{{ model.name }}</span>
            <small>{{ model.modelID }}</small>
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
.model-selector__option>small{overflow:hidden;text-overflow:ellipsis;color:var(--da-text-muted,#a4afbf);font-size:10px;white-space:nowrap}
</style>
