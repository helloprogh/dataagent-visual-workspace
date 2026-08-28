<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import {
  getDefaultModel,
  getSelectedModel,
  listAvailableModels,
  selectModel,
  setSelectedModel,
  type ModelCatalogItem,
  type ModelSelection,
} from '../model/model-selection'

const props = defineProps<{
  threadId: string
  disabled?: boolean
}>()

const models = ref<ModelCatalogItem[]>([])
const defaultModel = ref<ModelCatalogItem | null>(null)
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
const selectedKey = computed(() => {
  const current = getSelectedModel(props.threadId)
  return current ? keyOf(current.providerID, current.id) : ''
})

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

function supports(model: ModelCatalogItem, capability: 'tools' | 'image') {
  if (capability === 'tools') return model.capabilities?.tools === true
  return model.capabilities?.input?.includes('image') === true
}

async function handleSelect(value: string) {
  const next = selectionFromKey(value)
  if (!next || switching.value || props.disabled) return
  const previous = getSelectedModel(props.threadId)
  if (previous?.providerID === next.providerID && previous.id === next.id) return

  switching.value = true
  try {
    await selectModel(props.threadId, next)
  } catch (error) {
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

    const current = getSelectedModel(props.threadId)
    const exists = current && selectableModels.value.some(item => item.providerID === current.providerID && item.id === current.id)
    if (!exists) setSelectedModel(props.threadId, fallback)
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error)
  } finally {
    loading.value = false
  }
}

onMounted(loadModels)
</script>

<template>
  <div class="model-selector" :class="{ 'model-selector--error': loadError }" :title="loadError || '切换模型'">
    <span class="model-selector__mark" aria-hidden="true"><i></i></span>
    <el-select
      :model-value="selectedKey"
      class="model-selector__select"
      popper-class="model-selector-popper"
      :loading="loading || switching"
      filterable
      :disabled="disabled || switching || Boolean(loadError && !models.length)"
      placeholder="选择模型"
      aria-label="切换模型"
      @change="handleSelect"
    >
      <el-option-group v-for="group in groups" :key="group.providerID" :label="group.label">
        <el-option
          v-for="model in group.items"
          :key="keyOf(model.providerID, model.id)"
          :label="model.name"
          :value="keyOf(model.providerID, model.id)"
        >
          <div class="model-selector__option">
            <div class="model-selector__option-main">
              <span>{{ model.name }}</span>
              <i v-if="defaultModel && model.providerID === defaultModel.providerID && model.id === defaultModel.id">默认</i>
            </div>
            <div class="model-selector__option-meta">
              <small>{{ model.id }}</small>
              <em v-if="supports(model, 'tools')">TOOLS</em>
              <em v-if="supports(model, 'image')">VISION</em>
            </div>
          </div>
        </el-option>
      </el-option-group>
    </el-select>
    <button v-if="loadError" class="model-selector__retry" type="button" title="重新加载模型" @click.stop="loadModels">↻</button>
  </div>
</template>

<style scoped>
.model-selector{height:32px;display:flex;align-items:center;gap:5px;padding:0 7px 0 8px;border:1px solid rgba(171,191,211,.15);border-radius:10px;background:linear-gradient(180deg,rgba(255,255,255,.045),rgba(255,255,255,.018));box-shadow:0 1px 0 rgba(255,255,255,.025) inset;transition:border-color .16s ease,background .16s ease,box-shadow .16s ease}
.model-selector:hover{border-color:rgba(143,166,232,.3);background:linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.026))}
.model-selector:focus-within{border-color:rgba(143,166,232,.43);box-shadow:0 0 0 3px rgba(143,166,232,.07)}
.model-selector--error{border-color:rgba(232,132,146,.28)}
.model-selector__mark{position:relative;width:13px;height:13px;display:grid;place-items:center;flex:none;border:1px solid rgba(115,203,214,.34);border-radius:4px;background:rgba(115,203,214,.07);transform:rotate(45deg)}
.model-selector__mark i{width:3px;height:3px;border-radius:50%;background:var(--da-accent-cyan,#73cbd6);box-shadow:0 0 7px rgba(115,203,214,.42)}
.model-selector__select{width:158px;min-width:0}
.model-selector__select :deep(.el-select__wrapper){min-height:28px!important;padding:0 3px!important;background:transparent!important;box-shadow:none!important;overflow:hidden!important}
.model-selector__select :deep(.el-select__selected-item){display:block!important;min-width:0!important;max-width:126px!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;color:#e4eaf2!important;font-size:11.5px;font-weight:650;line-height:28px!important;letter-spacing:-.01em}
.model-selector__select :deep(.el-select__placeholder){overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;color:#b8c3d2!important;font-size:11.5px}
.model-selector__select :deep(.el-select__caret){color:#aab6c7!important;font-size:12px}
.model-selector__select :deep(.el-select__wrapper.is-disabled){opacity:1!important;cursor:not-allowed!important}
.model-selector__select :deep(.el-select__wrapper.is-disabled .el-select__selected-item){color:#b9c5d4!important;opacity:.9!important}
.model-selector__select :deep(.el-select__wrapper.is-disabled .el-select__caret){color:#98a7ba!important;opacity:.9!important}
.model-selector__retry{width:22px;height:22px;display:grid;place-items:center;flex:none;border:0;border-radius:6px;background:rgba(232,132,146,.07);color:var(--da-accent-red,#e88492);font-size:12px;cursor:pointer}
.model-selector__retry:hover{background:rgba(232,132,146,.13)}
@media(max-width:760px){.model-selector{padding-left:7px}.model-selector__select{width:116px}.model-selector__select :deep(.el-select__selected-item){max-width:84px!important}}
</style>

<style>
.model-selector-popper{border:1px solid rgba(171,191,211,.16)!important;border-radius:12px!important;background:#101923!important;box-shadow:0 18px 42px rgba(0,0,0,.36)!important}
.model-selector-popper .el-select-group__title{padding:8px 12px 5px!important;color:var(--da-text-subtle,#8793a6)!important;font-size:9px!important;font-weight:750!important;letter-spacing:.11em;text-transform:uppercase}
.model-selector-popper .el-select-dropdown__item{height:auto!important;min-height:48px!important;margin:2px 5px!important;padding:7px 9px!important;border-radius:8px!important}
.model-selector-popper .el-select-dropdown__item.is-selected{background:rgba(143,166,232,.1)!important}
.model-selector-popper .el-select-dropdown__item:hover,.model-selector-popper .el-select-dropdown__item.is-hovering{background:rgba(255,255,255,.045)!important}
.model-selector__option{min-width:0;display:flex;flex-direction:column;gap:4px;line-height:1.2}
.model-selector__option-main{display:flex;align-items:center;min-width:0;gap:6px}
.model-selector__option-main>span{overflow:hidden;text-overflow:ellipsis;color:var(--da-text-primary,#e3e8ef);font-size:12px;font-weight:650;white-space:nowrap}
.model-selector__option-main>i{display:inline-flex;padding:1px 5px;border:1px solid rgba(143,166,232,.22);border-radius:5px;color:var(--da-accent-blue,#8fa6e8);font-size:8px;font-style:normal;font-weight:750}
.model-selector__option-meta{display:flex;align-items:center;gap:5px;min-width:0}
.model-selector__option-meta>small{max-width:210px;overflow:hidden;text-overflow:ellipsis;color:var(--da-text-subtle,#8793a6);font-size:9.5px;white-space:nowrap}
.model-selector__option-meta>em{padding:1px 4px;border-radius:4px;background:rgba(115,203,214,.07);color:#8eced6;font-size:7px;font-style:normal;font-weight:750;letter-spacing:.05em}
</style>