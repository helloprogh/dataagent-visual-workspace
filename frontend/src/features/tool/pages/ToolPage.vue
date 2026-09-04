<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { loadCapabilityCatalog, type CapabilityItem } from '../api/tool'

const props = defineProps<{ sessionId?: string }>()
const tools = ref<CapabilityItem[]>([])
const warnings = ref<string[]>([])
const loading = ref(false)
const keyword = ref('')
const { t } = useI18n()

const filtered = computed(() => {
  const query = keyword.value.trim().toLowerCase()
  if (!query) return tools.value
  return tools.value.filter(item => [item.id, item.name, item.description, item.category, item.source, ...item.capabilities]
    .some(value => String(value ?? '').toLowerCase().includes(query)))
})
const toolCount = computed(() => tools.value.filter(item => item.kind === 'tool').length)
const mcpCount = computed(() => tools.value.filter(item => item.kind === 'mcp-server' && item.status === 'ready').length)

async function refresh() {
  loading.value = true
  try {
    const catalog = await loadCapabilityCatalog(props.sessionId)
    tools.value = catalog.items
    warnings.value = catalog.warnings
  } catch (error) {
    tools.value = []
    warnings.value = []
    ElMessage.error(error instanceof Error ? error.message : String(error))
  } finally { loading.value = false }
}

watch(() => props.sessionId, refresh)
onMounted(refresh)
</script>

<template>
  <section class="app-page">
    <div class="app-page__inner tool-page">
      <header class="app-page__header">
        <div>
          <h1>{{ t('tool.title') }}</h1>
          <p>{{ t('tool.description') }}</p>
        </div>
        <div class="tool-summary">
          <span><b>{{ toolCount }}</b> {{ t('tool.tools') }}</span>
          <span><b>{{ mcpCount }}</b> {{ t('tool.mcp') }}</span>
        </div>
      </header>

      <div class="tool-toolbar">
        <el-input v-model="keyword" clearable :placeholder="t('tool.search')" />
        <el-button :loading="loading" @click="refresh">{{ t('app.refresh') }}</el-button>
      </div>

      <el-alert
        v-if="warnings.length"
        type="warning"
        :closable="false"
        :title="t('tool.warning')"
        class="tool-warning"
      />

      <div v-loading="loading" class="tool-grid">
        <article v-for="tool in filtered" :key="tool.id" class="tool-card">
          <header>
            <span class="tool-kind">{{ tool.kind === 'mcp-server' ? 'MCP' : 'TOOL' }}</span>
            <span class="tool-status" :class="tool.status"><i></i>{{ tool.statusLabel }}</span>
          </header>
          <h2>{{ tool.name }}</h2>
          <code>{{ tool.id }}</code>
          <p>{{ tool.description }}</p>
          <div v-if="tool.capabilities?.length" class="tool-capabilities">
            <span v-for="capability in tool.capabilities" :key="capability">{{ capability }}</span>
          </div>
          <footer><span>{{ tool.category }}</span><span>{{ tool.source }}</span></footer>
        </article>
        <div v-if="!loading && !filtered.length" class="empty-state tool-empty">{{ t('tool.empty') }}</div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.app-page__header p { margin: var(--da-space-2) 0 0; color: var(--da-text-muted); }
.tool-summary { display: flex; overflow: hidden; border: 0.0625rem solid var(--da-border); border-radius: var(--da-radius-md); background: var(--da-surface-1); }
.tool-summary span { min-width: 6rem; padding: var(--da-space-3); color: var(--da-text-muted); font-size: var(--da-font-size-xs); text-align: center; }
.tool-summary span + span { border-left: 0.0625rem solid var(--da-border); }
.tool-summary b { display: block; color: var(--da-text-emphasis); font-size: var(--da-font-size-lg); }
.tool-toolbar { display: flex; gap: var(--da-space-2); margin-bottom: var(--da-space-4); }
.tool-toolbar .el-input { max-width: 28rem; }
.tool-warning { margin-bottom: var(--da-space-4); }
.tool-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--da-space-3); min-height: 12rem; }
.tool-card { min-width: 0; padding: var(--da-space-5); border: 0.0625rem solid var(--da-border); border-radius: var(--da-radius-lg); background: var(--da-surface-1); }
.tool-card header, .tool-card footer { display: flex; align-items: center; justify-content: space-between; gap: var(--da-space-2); }
.tool-kind { color: var(--da-text-subtle); font-size: var(--da-font-size-xs); letter-spacing: 0.08em; }
.tool-status { display: inline-flex; align-items: center; gap: var(--da-space-2); color: var(--da-text-muted); font-size: var(--da-font-size-xs); }
.tool-status i { width: 0.375rem; height: 0.375rem; border-radius: 50%; background: var(--da-text-subtle); }
.tool-status.ready i { background: var(--da-accent-green); }
.tool-status.registered i { background: var(--da-accent-blue); }
.tool-status.attention i { background: var(--da-accent-yellow); }
.tool-status.error i { background: var(--da-accent-red); }
.tool-card h2 { margin: var(--da-space-5) 0 var(--da-space-1); color: var(--da-text-emphasis); font-size: var(--da-font-size-lg); }
.tool-card code { color: var(--da-text-subtle); font-size: var(--da-font-size-xs); }
.tool-card p { min-height: 3rem; margin: var(--da-space-3) 0; color: var(--da-text-muted); line-height: 1.65; }
.tool-capabilities { display: flex; flex-wrap: wrap; gap: var(--da-space-2); margin: var(--da-space-4) 0; }
.tool-capabilities span { padding: var(--da-space-1) var(--da-space-2); border: 0.0625rem solid var(--da-border); border-radius: var(--da-radius-sm); color: var(--da-text-secondary); font-size: var(--da-font-size-xs); background: var(--da-surface-2); }
.tool-card footer { padding-top: var(--da-space-3); border-top: 0.0625rem solid var(--da-border); color: var(--da-text-subtle); font-size: var(--da-font-size-xs); }
.tool-empty { grid-column: 1 / -1; border: 0.0625rem solid var(--da-border); border-radius: var(--da-radius-lg); background: var(--da-surface-1); }
@media (max-width: 54rem) { .tool-grid { grid-template-columns: 1fr; } .tool-summary { display: none; } }
</style>
