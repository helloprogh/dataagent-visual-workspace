<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import AgentGraph from './components/AgentGraph.vue'
import WidgetRenderer from './components/WidgetRenderer.vue'
import { runAgent } from './workspace/agui-client'
import { demoMode, handleAguiEvent, isEmpty, resetWorkspace, state } from './workspace/store'

const prompt = ref('')
const chatScroll = ref<HTMLElement>()
const endpoint = ref(import.meta.env.VITE_AGUI_URL ?? 'http://127.0.0.1:3001/agui/mock')
const threadId = crypto.randomUUID()
const suggested = ['分析本月经营情况', '找出 GMV 增长的主要原因', '检查数据质量并给出建议']
const runLabel = computed(() => state.running ? 'Agent 正在构建工作区' : 'Workspace ready')

const submit = async (value?: string) => {
  const text = (value ?? prompt.value).trim()
  if (!text || state.running) return
  prompt.value = ''
  state.messages.push({ id: crypto.randomUUID(), role: 'user', content: text })
  await nextTick(); chatScroll.value?.scrollTo({ top: chatScroll.value.scrollHeight, behavior: 'smooth' })
  try {
    await runAgent(endpoint.value, {
      threadId,
      runId: crypto.randomUUID(),
      messages: state.messages,
      state: { workspace: state.workspace },
    }, handleAguiEvent)
  } catch (error) {
    state.running = false
    state.error = error instanceof Error ? error.message : String(error)
  }
  await nextTick(); chatScroll.value?.scrollTo({ top: chatScroll.value.scrollHeight, behavior: 'smooth' })
}
</script>

<template>
  <div class="app-shell">
    <aside class="rail">
      <div class="brand">D<span>AI</span></div>
      <nav><button class="active">⌁</button><button>◫</button><button>⌘</button><button>◇</button></nav>
      <button class="rail-bottom">?</button>
    </aside>

    <main class="workspace">
      <header class="topbar">
        <div><span class="product-kicker">DATA INTELLIGENCE</span><h1>{{ state.workspace.title }}</h1></div>
        <div class="top-actions"><span class="mode-pill"><i />{{ demoMode ? 'DEMO MODE' : 'LIVE WORKSPACE' }}</span><button class="ghost" @click="resetWorkspace">重置</button></div>
      </header>

      <div class="workspace-scroll">
        <section v-if="isEmpty" class="empty-state">
          <div class="empty-glow"><span>✦</span></div>
          <span class="eyebrow">GENERATIVE WORKSPACE</span>
          <h2>从一个问题开始，<br />让 Agent 构建你的分析界面。</h2>
          <p>工作区当前为空。发送分析请求后，AG-UI 事件会动态生成指标、图表、洞察和子 Agent 执行状态。</p>
          <div class="suggestions"><button v-for="item in suggested" :key="item" @click="submit(item)">{{ item }} <span>↗</span></button></div>
        </section>

        <template v-else>
          <section class="executive surface">
            <div><span class="eyebrow">AI EXECUTIVE SUMMARY</span><h2>关键经营信号</h2></div>
            <p>{{ state.workspace.summary }}</p><span class="ai-badge">✦ AI GENERATED</span>
          </section>

          <section class="kpi-grid">
            <article v-for="kpi in state.workspace.kpis" :key="kpi.label" class="kpi surface">
              <span>{{ kpi.label }}</span><strong>{{ kpi.value }}</strong><small :class="kpi.tone">{{ kpi.change }}</small><i />
            </article>
          </section>

          <AgentGraph v-if="state.workspace.agents.length" :agents="state.workspace.agents" />

          <section class="widget-grid">
            <WidgetRenderer v-for="widget in state.workspace.widgets" :key="widget.id" :widget="widget" />
          </section>

          <section v-if="state.workspace.activities.length" class="surface activity-surface">
            <div class="surface-heading"><div><span class="eyebrow">REAL-TIME ACTIVITY</span><h2>Agent 活动</h2></div><span class="live"><i /> STREAMING</span></div>
            <div class="activity-list"><article v-for="activity in state.workspace.activities" :key="activity.id"><time>{{ activity.timestamp }}</time><span class="activity-dot" :class="activity.status"/><strong>{{ activity.agentId }}</strong><p>{{ activity.message }}</p></article></div>
          </section>
        </template>
      </div>
    </main>

    <aside class="agent-panel">
      <header><div class="agent-avatar">✦</div><div><span>DATA AGENT</span><strong>Intelligence Copilot</strong></div><span class="online" /></header>
      <div class="run-status"><i :class="{ pulsing: state.running }"/><div><small>AG-UI STATUS</small><strong>{{ runLabel }}</strong></div></div>
      <div ref="chatScroll" class="chat-scroll">
        <div v-if="!state.messages.length" class="chat-intro"><span>✦</span><h3>有什么需要分析？</h3><p>我会调用专业 Agent，并在左侧动态构建可视工作区。</p></div>
        <article v-for="message in state.messages" :key="message.id" class="message" :class="message.role"><span>{{ message.role === 'assistant' ? '✦' : 'YOU' }}</span><p>{{ message.content || '…' }}</p></article>
        <p v-if="state.error" class="error">{{ state.error }}</p>
      </div>
      <footer>
        <select v-model="endpoint" aria-label="AG-UI endpoint"><option value="http://127.0.0.1:3001/agui/mock">Mock · 标准 AG-UI</option><option value="http://127.0.0.1:3001/agui">OpenCode2 · 实时转换</option><option value="http://127.0.0.1:3001/agui/hybrid">Hybrid · 联合调试</option></select>
        <form @submit.prevent="submit()"><textarea v-model="prompt" placeholder="询问数据、指标或业务问题…" rows="3" @keydown.enter.exact.prevent="submit()"/><div><span>Enter 发送 · Shift+Enter 换行</span><button :disabled="state.running || !prompt.trim()">↗</button></div></form>
      </footer>
    </aside>
  </div>
</template>

