<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { dataAgentWebApi } from '../config/api'
import { getDefaultModel, getSelectedModel } from '../model/model-selection'

const props = defineProps<{ threadId: string }>()

type CapabilityItem = {
  id: string
  name: string
  description: string
  category: string
  kind: 'tool' | 'mcp-server'
  status: 'ready' | 'registered' | 'attention' | 'disabled' | 'error'
  statusLabel: string
  source: string
  capabilities: string[]
}

type CapabilityCatalog = {
  items?: CapabilityItem[]
  warnings?: string[]
}

const tools = ref<CapabilityItem[]>([])
const keyword = ref('')
const loading = ref(false)
const loadError = ref('')
const warnings = ref<string[]>([])

const filteredTools = computed(() => {
  const query = keyword.value.trim().toLowerCase()
  if (!query) return tools.value
  return tools.value.filter(tool => [
    tool.name,
    tool.description,
    tool.id,
    tool.category,
    tool.source,
    ...tool.capabilities,
  ].some(value => String(value).toLowerCase().includes(query)))
})

const runtimeToolCount = computed(() => tools.value.filter(tool => tool.kind === 'tool').length)
const connectedMcpCount = computed(() => tools.value.filter(tool => tool.kind === 'mcp-server' && tool.status === 'ready').length)

function iconFor(tool: CapabilityItem) {
  if (tool.kind === 'mcp-server') return 'link'
  const value = `${tool.id} ${tool.name}`.toLowerCase()
  if (/read|file|glob|grep/.test(value)) return 'file'
  if (/web|http|fetch|search/.test(value)) return 'search'
  if (/bash|shell|python|code|edit|write|patch/.test(value)) return 'code'
  return 'tool'
}

async function loadTools() {
  loading.value = true
  loadError.value = ''
  try {
    let selected = getSelectedModel(props.threadId)
    if (!selected) selected = await getDefaultModel().catch(() => null)
    const query = new URLSearchParams()
    if (selected) {
      query.set('providerID', selected.providerID)
      query.set('modelID', selected.id)
    }
    const response = await fetch(`${dataAgentWebApi('/tools')}${query.size ? `?${query}` : ''}`, {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
    })
    if (!response.ok) throw new Error(`能力目录加载失败 (${response.status})`)
    const body = await response.json()
    const catalog = (body?.data ?? body) as CapabilityCatalog
    tools.value = Array.isArray(catalog?.items) ? catalog.items : []
    warnings.value = Array.isArray(catalog?.warnings) ? catalog.warnings : []
  } catch (error) {
    tools.value = []
    warnings.value = []
    loadError.value = error instanceof Error ? error.message : String(error)
  } finally {
    loading.value = false
  }
}

watch(() => props.threadId, () => void loadTools())
onMounted(() => void loadTools())
</script>

<template>
  <section class="tool-page">
    <header class="tool-page__header">
      <div>
        <span class="tool-page__eyebrow"><i></i>能力目录</span>
        <h1>工具</h1>
        <p>实时读取 OpenCode 注册工具与 MCP 连接状态。“已注册”表示运行时已发现该工具，实际执行仍受当前模型、Agent 与权限规则约束。</p>
      </div>
      <div class="tool-page__summary" aria-label="工具概览">
        <span><b>{{ runtimeToolCount }}</b> 项工具</span>
        <span><b>{{ connectedMcpCount }}</b> 个 MCP 已连接</span>
      </div>
    </header>

    <div class="tool-page__toolbar">
      <label class="tool-search">
        <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="4.5"/><path d="m12 12 4 4"/></svg>
        <input v-model="keyword" type="search" placeholder="搜索工具或能力" aria-label="搜索工具或能力">
        <button v-if="keyword" type="button" aria-label="清空搜索" @click="keyword = ''">×</button>
      </label>
      <button class="tool-refresh" type="button" :disabled="loading" @click="loadTools">{{ loading ? '刷新中' : '刷新' }}</button>
    </div>

    <div v-if="warnings.length" class="tool-warning" role="status">部分运行时能力未能读取完整；当前仅展示已确认的数据。</div>

    <div v-if="loading && !tools.length" class="tool-empty">
      <span>···</span>
      <h2>正在读取运行时能力</h2>
      <p>正在同步 OpenCode 工具与 MCP 状态。</p>
    </div>

    <div v-else-if="filteredTools.length" class="tool-grid">
      <article v-for="tool in filteredTools" :key="tool.id" class="tool-card" :data-kind="tool.kind">
        <div class="tool-card__top">
          <span class="tool-card__icon" aria-hidden="true">
            <svg v-if="iconFor(tool) === 'file'" viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5M9 12h6M9 16h6"/></svg>
            <svg v-else-if="iconFor(tool) === 'code'" viewBox="0 0 24 24"><path d="m8.5 7-5 5 5 5M15.5 7l5 5-5 5M14 4l-4 16"/></svg>
            <svg v-else-if="iconFor(tool) === 'search'" viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg>
            <svg v-else-if="iconFor(tool) === 'link'" viewBox="0 0 24 24"><path d="M8 8H6a4 4 0 0 0 0 8h2M16 8h2a4 4 0 0 1 0 8h-2M8 12h8"/></svg>
            <svg v-else viewBox="0 0 24 24"><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/><circle cx="12" cy="12" r="4"/></svg>
          </span>
          <span class="tool-status" :class="tool.status"><i></i>{{ tool.statusLabel }}</span>
        </div>

        <div class="tool-card__copy">
          <div><h2>{{ tool.name }}</h2><code>{{ tool.id }}</code></div>
          <p>{{ tool.description }}</p>
        </div>

        <div v-if="tool.capabilities.length" class="tool-capabilities">
          <span v-for="capability in tool.capabilities" :key="capability">{{ capability }}</span>
        </div>

        <footer>
          <span>{{ tool.category }}</span>
          <span>{{ tool.source }}</span>
        </footer>
      </article>
    </div>

    <div v-else class="tool-empty">
      <span>0</span>
      <h2>{{ loadError ? '能力目录不可用' : '没有匹配的工具' }}</h2>
      <p>{{ loadError || '换一个关键词再试。' }}</p>
      <button v-if="loadError" type="button" @click="loadTools">重新加载</button>
    </div>
  </section>
</template>

<style scoped>
.tool-page{height:100%;overflow:auto;padding:48px 48px 64px;color:var(--da-text-primary);scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.14) transparent}
.tool-page__header{width:min(1180px,100%);margin:0 auto 32px;display:flex;align-items:flex-end;justify-content:space-between;gap:40px}.tool-page__header>div:first-child{min-width:0}.tool-page__eyebrow{display:flex;align-items:center;gap:9px;color:var(--da-text-muted);font-size:12px;font-weight:600;letter-spacing:.08em}.tool-page__eyebrow i{width:22px;height:1px;background:var(--da-accent-orange)}.tool-page__header h1{margin:13px 0 10px;color:var(--da-text-emphasis);font-family:Georgia,"Times New Roman","Songti SC",serif;font-size:48px;line-height:1;font-weight:400;letter-spacing:-.045em}.tool-page__header p{max-width:700px;margin:0;color:var(--da-text-muted);font-size:14px;line-height:1.7}.tool-page__summary{flex:none;display:flex;align-items:center;border:1px solid var(--da-border);border-radius:12px;background:var(--da-surface-1)}.tool-page__summary span{min-width:126px;padding:15px 16px;color:var(--da-text-muted);font-size:12px;text-align:center}.tool-page__summary span+span{border-left:1px solid var(--da-border)}.tool-page__summary b{display:block;margin-bottom:3px;color:var(--da-text-emphasis);font-size:18px;font-weight:550}
.tool-page__toolbar{width:min(1180px,100%);margin:0 auto 16px;display:flex;align-items:center;gap:8px}.tool-search{width:min(440px,100%);height:40px;padding:0 12px;display:flex;align-items:center;gap:9px;border:1px solid var(--da-border);border-radius:8px;background:var(--da-surface-input);transition:border-color .15s ease,box-shadow .15s ease}.tool-search:focus-within{border-color:var(--da-border-strong);box-shadow:0 0 0 3px rgba(255,255,255,.035)}.tool-search svg{width:16px;height:16px;flex:none;fill:none;stroke:var(--da-text-muted);stroke-width:1.6;stroke-linecap:round}.tool-search input{min-width:0;flex:1;border:0;outline:0;background:transparent;color:var(--da-text-primary);font-size:13px}.tool-search input::placeholder{color:var(--da-text-subtle)}.tool-search input::-webkit-search-cancel-button{display:none}.tool-search button{width:22px;height:22px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--da-text-muted);cursor:pointer}.tool-refresh{height:40px;padding:0 13px;border:1px solid var(--da-border);border-radius:8px;background:var(--da-surface-1);color:var(--da-text-muted);font-size:12px;cursor:pointer}.tool-refresh:hover:not(:disabled){color:var(--da-text-primary);border-color:var(--da-border-strong)}.tool-refresh:disabled{opacity:.5;cursor:not-allowed}
.tool-warning{width:min(1180px,100%);margin:0 auto 12px;padding:10px 12px;border:1px solid color-mix(in srgb,var(--da-accent-yellow) 30%,var(--da-border));border-radius:8px;background:color-mix(in srgb,var(--da-accent-yellow) 5%,var(--da-surface-1));color:var(--da-text-secondary);font-size:12px}.tool-grid{width:min(1180px,100%);margin:0 auto;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.tool-card{min-height:238px;padding:22px;display:flex;flex-direction:column;border:1px solid var(--da-border);border-radius:12px;background:var(--da-surface-1);transition:border-color .16s ease,background .16s ease,transform .16s ease}.tool-card:hover{border-color:var(--da-border-strong);background:var(--da-surface-2);transform:translateY(-1px)}.tool-card__top{display:flex;align-items:center;justify-content:space-between}.tool-card__icon{width:38px;height:38px;display:grid;place-items:center;border:1px solid var(--da-border);border-radius:9px;background:var(--da-surface-deep);color:var(--da-text-secondary)}.tool-card__icon svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:1.45;stroke-linecap:round;stroke-linejoin:round}.tool-status{height:25px;padding:0 8px;display:inline-flex;align-items:center;gap:6px;border:1px solid var(--da-border);border-radius:999px;color:var(--da-text-muted);font-size:11px}.tool-status i{width:5px;height:5px;border-radius:50%;background:var(--da-text-subtle)}.tool-status.ready i{background:var(--da-accent-green);box-shadow:0 0 10px var(--da-accent-green-glow)}.tool-status.registered i{background:var(--da-accent-blue)}.tool-status.attention i{background:var(--da-accent-yellow)}.tool-status.error i{background:var(--da-accent-red)}.tool-card__copy{margin-top:22px}.tool-card__copy>div{display:flex;align-items:baseline;justify-content:space-between;gap:12px}.tool-card__copy h2{margin:0;color:var(--da-text-emphasis);font-size:18px;line-height:1.3;font-weight:570;letter-spacing:-.025em}.tool-card__copy code{overflow:hidden;text-overflow:ellipsis;color:var(--da-text-subtle);font:11px/1.4 ui-monospace,SFMono-Regular,Consolas,monospace}.tool-card__copy p{min-height:44px;margin:8px 0 0;color:var(--da-text-muted);font-size:13px;line-height:1.65}.tool-capabilities{margin:17px 0 20px;display:flex;flex-wrap:wrap;gap:6px}.tool-capabilities span{padding:4px 8px;border:1px solid var(--da-border);border-radius:6px;background:var(--da-surface-deep);color:var(--da-text-secondary);font-size:11px}.tool-card footer{margin-top:auto;padding-top:13px;display:flex;justify-content:space-between;border-top:1px solid var(--da-border);color:var(--da-text-subtle);font-size:11px}.tool-empty{width:min(1180px,100%);min-height:320px;margin:0 auto;display:grid;place-items:center;align-content:center;border:1px solid var(--da-border);border-radius:12px;background:var(--da-surface-1);text-align:center}.tool-empty span{color:var(--da-text-emphasis);font-family:Georgia,serif;font-size:48px}.tool-empty h2{margin:10px 0 4px;font-size:16px}.tool-empty p{margin:0;color:var(--da-text-muted);font-size:13px}.tool-empty button{margin-top:14px;height:34px;padding:0 12px;border:1px solid var(--da-border);border-radius:8px;background:var(--da-surface-2);color:var(--da-text-primary);cursor:pointer}
@media(max-width:980px){.tool-page{padding:36px 28px 48px}.tool-page__header{align-items:flex-start;flex-direction:column}.tool-page__summary{width:100%}.tool-page__summary span{flex:1}.tool-search{width:100%}.tool-grid{grid-template-columns:1fr}}@media(max-width:640px){.tool-page{padding:28px 18px 40px}.tool-page__header h1{font-size:40px}.tool-page__summary{display:none}.tool-page__toolbar{align-items:stretch}.tool-search{min-width:0}.tool-card{padding:18px}.tool-card__copy>div{align-items:flex-start;flex-direction:column;gap:5px}}@media(prefers-reduced-motion:reduce){.tool-card,.tool-search{transition:none}}
</style>
