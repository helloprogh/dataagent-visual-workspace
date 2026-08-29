<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  getDefaultModel,
  listAvailableModels,
  type ModelCatalogItem,
  type ModelSelection,
} from '../model/model-selection'

const props = defineProps<{ disabled?: boolean }>()
const emit = defineEmits<{ selected: [model: ModelSelection] }>()

const models = ref<ModelCatalogItem[]>([])
const defaultModel = ref<ModelCatalogItem | null>(null)
const selected = ref<ModelSelection | null>(null)
const loading = ref(false)
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
const selectedKey = computed(() => selected.value ? keyOf(selected.value.providerID, selected.value.id) : '')
const selectableModels = computed(() => {
  const result = [...models.value]
  const fallback = defaultModel.value
  if (fallback && !result.some(item => item.providerID === fallback.providerID && item.id === fallback.id)) result.unshift(fallback)
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

function fromKey(value: string): ModelSelection | null {
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed) && typeof parsed[0] === 'string' && typeof parsed[1] === 'string') {
      return { providerID: parsed[0], id: parsed[1] }
    }
  } catch {
    // Ignore invalid option values.
  }
  return null
}

function choose(model: ModelSelection | null) {
  if (!model) return
  selected.value = { providerID: model.providerID, id: model.id }
  emit('selected', selected.value)
}

function handleSelect(value: string) {
  if (props.disabled) return
  choose(fromKey(value))
}

async function loadModels() {
  loading.value = true
  loadError.value = ''
  try {
    const [catalog, fallback] = await Promise.all([listAvailableModels(), getDefaultModel()])
    models.value = catalog
    defaultModel.value = fallback
    choose(fallback ?? catalog[0] ?? null)
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error)
  } finally {
    loading.value = false
  }
}

onMounted(loadModels)
</script>

<template>
  <div class="draft-model-selector" :class="{ 'draft-model-selector--error': loadError }" :title="loadError || '选择新会话模型'">
    <span class="draft-model-selector__mark" aria-hidden="true"><i></i></span>
    <el-select
      :model-value="selectedKey"
      class="draft-model-selector__select"
      popper-class="model-selector-popper"
      :loading="loading"
      filterable
      :disabled="disabled || Boolean(loadError && !models.length)"
      placeholder="选择模型"
      aria-label="选择新会话模型"
      @change="handleSelect"
    >
      <el-option-group v-for="group in groups" :key="group.providerID" :label="group.label">
        <el-option
          v-for="model in group.items"
          :key="keyOf(model.providerID, model.id)"
          :label="model.name"
          :value="keyOf(model.providerID, model.id)"
        />
      </el-option-group>
    </el-select>
    <button v-if="loadError" class="draft-model-selector__retry" type="button" title="重新加载模型" @click.stop="loadModels">↻</button>
  </div>
</template>

<style scoped>
.draft-model-selector{height:32px;display:flex;align-items:center;gap:5px;padding:0 7px 0 8px;border:1px solid rgba(171,191,211,.15);border-radius:10px;background:linear-gradient(180deg,rgba(255,255,255,.045),rgba(255,255,255,.018));box-shadow:0 1px 0 rgba(255,255,255,.025) inset;transition:border-color .16s ease,background .16s ease,box-shadow .16s ease}
.draft-model-selector:hover{border-color:rgba(143,166,232,.3);background:linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.026))}
.draft-model-selector:focus-within{border-color:rgba(143,166,232,.43);box-shadow:0 0 0 3px rgba(143,166,232,.07)}
.draft-model-selector--error{border-color:rgba(232,132,146,.28)}
.draft-model-selector__mark{position:relative;width:13px;height:13px;display:grid;place-items:center;flex:none;border:1px solid rgba(115,203,214,.34);border-radius:4px;background:rgba(115,203,214,.07);transform:rotate(45deg)}
.draft-model-selector__mark i{width:3px;height:3px;border-radius:50%;background:var(--da-accent-cyan,#73cbd6);box-shadow:0 0 7px rgba(115,203,214,.42)}
.draft-model-selector__select{width:158px;min-width:0}
.draft-model-selector__select :deep(.el-select__wrapper){min-height:28px!important;padding:0 3px!important;background:transparent!important;box-shadow:none!important;overflow:hidden!important}
.draft-model-selector__select :deep(.el-select__selected-item){display:block!important;min-width:0!important;max-width:126px!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;color:#e4eaf2!important;font-size:11.5px;font-weight:650;line-height:28px!important;letter-spacing:-.01em}
.draft-model-selector__retry{width:22px;height:22px;display:grid;place-items:center;flex:none;border:0;border-radius:6px;background:rgba(232,132,146,.07);color:var(--da-accent-red,#e88492);font-size:12px;cursor:pointer}
@media(max-width:760px){.draft-model-selector{padding-left:7px}.draft-model-selector__select{width:116px}.draft-model-selector__select :deep(.el-select__selected-item){max-width:84px!important}}
</style>
