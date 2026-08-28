<script setup lang="ts">
import { computed, ref } from 'vue'

type ToolStatus = 'ready' | 'beta' | 'pending'
type ToolCategory = '全部' | '数据' | '开发' | '内容' | '网络'

interface ToolDefinition {
  id: string
  name: string
  description: string
  category: Exclude<ToolCategory, '全部'>
  status: ToolStatus
  statusLabel: string
  source: string
  capabilities: string[]
  icon: 'database' | 'file' | 'code' | 'chart' | 'search' | 'http'
}

const tools: ToolDefinition[] = [
  {
    id: 'database-query',
    name: '数据库查询',
    description: '执行结构化查询并返回可用于分析的数据集。',
    category: '数据',
    status: 'ready',
    statusLabel: '可用',
    source: '内置工具',
    capabilities: ['SQL 查询', '结果采样', 'Schema 读取'],
    icon: 'database',
  },
  {
    id: 'file-reader',
    name: '文件读取',
    description: '读取工作目录中的表格、文本和结构化文件。',
    category: '内容',
    status: 'ready',
    statusLabel: '可用',
    source: '内置工具',
    capabilities: ['CSV / Excel', 'JSON', '文本文件'],
    icon: 'file',
  },
  {
    id: 'python-runtime',
    name: 'Python 分析',
    description: '运行数据处理、统计建模和轻量自动化代码。',
    category: '开发',
    status: 'ready',
    statusLabel: '可用',
    source: '运行时',
    capabilities: ['数据处理', '统计计算', '脚本执行'],
    icon: 'code',
  },
  {
    id: 'visual-renderer',
    name: '可视化渲染',
    description: '将分析结果转换为图表、指标卡和数据表。',
    category: '数据',
    status: 'ready',
    statusLabel: '可用',
    source: '工作台',
    capabilities: ['图表', '指标卡', '数据表'],
    icon: 'chart',
  },
  {
    id: 'web-search',
    name: '网页搜索',
    description: '检索公开网页，为分析补充外部信息与来源。',
    category: '网络',
    status: 'beta',
    statusLabel: '试用',
    source: '连接器',
    capabilities: ['网页检索', '来源引用', '内容摘要'],
    icon: 'search',
  },
  {
    id: 'http-request',
    name: 'HTTP 请求',
    description: '连接业务 API；鉴权、域名白名单与接口协议待配置。',
    category: '网络',
    status: 'pending',
    statusLabel: '待配置',
    source: '接口待定',
    capabilities: ['REST API', '自定义请求头', '结构化响应'],
    icon: 'http',
  },
]

const categories: ToolCategory[] = ['全部', '数据', '开发', '内容', '网络']
const keyword = ref('')
const activeCategory = ref<ToolCategory>('全部')

const filteredTools = computed(() => {
  const query = keyword.value.trim().toLowerCase()
  return tools.filter(tool => {
    const matchesCategory = activeCategory.value === '全部' || tool.category === activeCategory.value
    const matchesQuery = !query || [tool.name, tool.description, tool.id, tool.category, ...tool.capabilities]
      .some(value => value.toLowerCase().includes(query))
    return matchesCategory && matchesQuery
  })
})

const readyCount = computed(() => tools.filter(tool => tool.status === 'ready').length)
const categoryCount = computed(() => new Set(tools.map(tool => tool.category)).size)
</script>

<template>
  <section class="tool-page">
    <header class="tool-page__header">
      <div>
        <span class="tool-page__eyebrow"><i></i>能力目录</span>
        <h1>工具</h1>
        <p>查看助手当前能够调用的执行能力。工具接口接入后，这里将同步展示实时可用状态与配置入口。</p>
      </div>
      <div class="tool-page__summary" aria-label="工具概览">
        <span><b>{{ tools.length }}</b> 项工具</span>
        <span><b>{{ readyCount }}</b> 项可用</span>
        <span><b>{{ categoryCount }}</b> 个分类</span>
      </div>
    </header>

    <div class="tool-page__toolbar">
      <label class="tool-search">
        <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="4.5"/><path d="m12 12 4 4"/></svg>
        <input v-model="keyword" type="search" placeholder="搜索工具或能力" aria-label="搜索工具或能力">
        <button v-if="keyword" type="button" aria-label="清空搜索" @click="keyword = ''">×</button>
      </label>

      <div class="tool-filters" aria-label="工具分类">
        <button
          v-for="category in categories"
          :key="category"
          type="button"
          :class="{ active: activeCategory === category }"
          @click="activeCategory = category"
        >{{ category }}</button>
      </div>
    </div>

    <div v-if="filteredTools.length" class="tool-grid">
      <article v-for="tool in filteredTools" :key="tool.id" class="tool-card">
        <div class="tool-card__top">
          <span class="tool-card__icon" aria-hidden="true">
            <svg v-if="tool.icon === 'database'" viewBox="0 0 24 24"><ellipse cx="12" cy="5.5" rx="7" ry="3"/><path d="M5 5.5v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6M5 11.5v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/></svg>
            <svg v-else-if="tool.icon === 'file'" viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5M9 12h6M9 16h6"/></svg>
            <svg v-else-if="tool.icon === 'code'" viewBox="0 0 24 24"><path d="m8.5 7-5 5 5 5M15.5 7l5 5-5 5M14 4l-4 16"/></svg>
            <svg v-else-if="tool.icon === 'chart'" viewBox="0 0 24 24"><path d="M4 20V5M4 20h16"/><path d="m7 16 4-5 3 2 5-7"/></svg>
            <svg v-else-if="tool.icon === 'search'" viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg>
            <svg v-else viewBox="0 0 24 24"><path d="M8 8H6a4 4 0 0 0 0 8h2M16 8h2a4 4 0 0 1 0 8h-2M8 12h8"/></svg>
          </span>
          <span class="tool-status" :class="tool.status"><i></i>{{ tool.statusLabel }}</span>
        </div>

        <div class="tool-card__copy">
          <div><h2>{{ tool.name }}</h2><code>{{ tool.id }}</code></div>
          <p>{{ tool.description }}</p>
        </div>

        <div class="tool-capabilities">
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
      <h2>没有匹配的工具</h2>
      <p>调整搜索词或切换工具分类后再试。</p>
    </div>
  </section>
</template>

<style scoped>
.tool-page{height:100%;overflow:auto;padding:48px 48px 64px;color:var(--da-text-primary);scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.14) transparent}
.tool-page__header{width:min(1180px,100%);margin:0 auto 32px;display:flex;align-items:flex-end;justify-content:space-between;gap:40px}
.tool-page__header>div:first-child{min-width:0}
.tool-page__eyebrow{display:flex;align-items:center;gap:9px;color:var(--da-text-muted);font-size:12px;font-weight:600;letter-spacing:.08em}
.tool-page__eyebrow i{width:22px;height:1px;background:var(--da-accent-orange)}
.tool-page__header h1{margin:13px 0 10px;color:var(--da-text-emphasis);font-family:Georgia,"Times New Roman","Songti SC",serif;font-size:48px;line-height:1;font-weight:400;letter-spacing:-.045em}
.tool-page__header p{max-width:680px;margin:0;color:var(--da-text-muted);font-size:14px;line-height:1.7}
.tool-page__summary{flex:none;display:flex;align-items:center;border:1px solid var(--da-border);border-radius:12px;background:var(--da-surface-1)}
.tool-page__summary span{min-width:102px;padding:15px 16px;color:var(--da-text-muted);font-size:12px;text-align:center}
.tool-page__summary span+span{border-left:1px solid var(--da-border)}
.tool-page__summary b{display:block;margin-bottom:3px;color:var(--da-text-emphasis);font-size:18px;font-weight:550}
.tool-page__toolbar{width:min(1180px,100%);margin:0 auto 16px;display:flex;align-items:center;justify-content:space-between;gap:16px}
.tool-search{width:min(340px,100%);height:40px;padding:0 12px;display:flex;align-items:center;gap:9px;border:1px solid var(--da-border);border-radius:8px;background:var(--da-surface-input);transition:border-color .15s ease,box-shadow .15s ease}
.tool-search:focus-within{border-color:var(--da-border-strong);box-shadow:0 0 0 3px rgba(255,255,255,.035)}
.tool-search svg{width:16px;height:16px;flex:none;fill:none;stroke:var(--da-text-muted);stroke-width:1.6;stroke-linecap:round}
.tool-search input{min-width:0;flex:1;border:0;outline:0;background:transparent;color:var(--da-text-primary);font-size:13px}
.tool-search input::placeholder{color:var(--da-text-subtle)}
.tool-search input::-webkit-search-cancel-button{display:none}
.tool-search button{width:22px;height:22px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--da-text-muted);cursor:pointer}
.tool-filters{padding:3px;display:flex;gap:2px;border:1px solid var(--da-border);border-radius:9px;background:var(--da-surface-1)}
.tool-filters button{height:32px;padding:0 13px;border:0;border-radius:6px;background:transparent;color:var(--da-text-muted);font-size:12px;cursor:pointer;transition:background .15s ease,color .15s ease}
.tool-filters button:hover{color:var(--da-text-primary)}
.tool-filters button.active{background:var(--da-surface-3);color:var(--da-text-emphasis)}
.tool-grid{width:min(1180px,100%);margin:0 auto;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.tool-card{min-height:258px;padding:22px;display:flex;flex-direction:column;border:1px solid var(--da-border);border-radius:12px;background:var(--da-surface-1);transition:border-color .16s ease,background .16s ease,transform .16s ease}
.tool-card:hover{border-color:var(--da-border-strong);background:var(--da-surface-2);transform:translateY(-1px)}
.tool-card__top{display:flex;align-items:center;justify-content:space-between}
.tool-card__icon{width:38px;height:38px;display:grid;place-items:center;border:1px solid var(--da-border);border-radius:9px;background:var(--da-surface-deep);color:var(--da-text-secondary)}
.tool-card__icon svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:1.45;stroke-linecap:round;stroke-linejoin:round}
.tool-status{height:25px;padding:0 8px;display:inline-flex;align-items:center;gap:6px;border:1px solid var(--da-border);border-radius:999px;color:var(--da-text-muted);font-size:11px}
.tool-status i{width:5px;height:5px;border-radius:50%;background:var(--da-text-subtle)}
.tool-status.ready i{background:var(--da-accent-green);box-shadow:0 0 10px var(--da-accent-green-glow)}
.tool-status.beta{color:var(--da-text-secondary)}.tool-status.beta i{background:var(--da-accent-blue)}
.tool-status.pending i{background:var(--da-accent-yellow)}
.tool-card__copy{margin-top:22px}
.tool-card__copy>div{display:flex;align-items:baseline;justify-content:space-between;gap:12px}
.tool-card__copy h2{margin:0;color:var(--da-text-emphasis);font-size:18px;line-height:1.3;font-weight:570;letter-spacing:-.025em}
.tool-card__copy code{overflow:hidden;text-overflow:ellipsis;color:var(--da-text-subtle);font:11px/1.4 ui-monospace,SFMono-Regular,Consolas,monospace}
.tool-card__copy p{min-height:44px;margin:8px 0 0;color:var(--da-text-muted);font-size:13px;line-height:1.65}
.tool-capabilities{margin:17px 0 20px;display:flex;flex-wrap:wrap;gap:6px}
.tool-capabilities span{padding:4px 8px;border:1px solid var(--da-border);border-radius:6px;background:var(--da-surface-deep);color:var(--da-text-secondary);font-size:11px}
.tool-card footer{margin-top:auto;padding-top:13px;display:flex;justify-content:space-between;border-top:1px solid var(--da-border);color:var(--da-text-subtle);font-size:11px}
.tool-empty{width:min(1180px,100%);min-height:320px;margin:0 auto;display:grid;place-items:center;align-content:center;border:1px solid var(--da-border);border-radius:12px;background:var(--da-surface-1);text-align:center}
.tool-empty span{color:var(--da-text-emphasis);font-family:Georgia,serif;font-size:48px}.tool-empty h2{margin:10px 0 4px;font-size:16px}.tool-empty p{margin:0;color:var(--da-text-muted);font-size:13px}
@media(max-width:980px){.tool-page{padding:36px 28px 48px}.tool-page__header{align-items:flex-start;flex-direction:column}.tool-page__summary{width:100%}.tool-page__summary span{flex:1}.tool-page__toolbar{align-items:stretch;flex-direction:column}.tool-search{width:100%}.tool-filters{width:max-content;max-width:100%;overflow:auto}.tool-grid{grid-template-columns:1fr}}
@media(max-width:640px){.tool-page{padding:28px 18px 40px}.tool-page__header h1{font-size:40px}.tool-page__summary{display:none}.tool-card{padding:18px}.tool-card__copy>div{align-items:flex-start;flex-direction:column;gap:5px}}
@media(prefers-reduced-motion:reduce){.tool-card,.tool-filters button,.tool-search{transition:none}}
</style>
