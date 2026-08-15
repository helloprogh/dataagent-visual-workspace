<script setup lang="ts">
import { computed, ref } from 'vue'
type AgentStatus = 'pending' | 'running' | 'done' | 'error' | 'waiting'
type AgentNode = { id:string; name:string; role?:string; task?:string; status?:AgentStatus; progress?:number; durationMs?:number; summary?:string; tools?:string[]; output?:string }
const props = defineProps<{ title?:string; orchestrator?:AgentNode; agents?:AgentNode[] }>()
const selectedId = ref('')
const selected = computed(() => {
  const nodes=[props.orchestrator,...(props.agents||[])].filter(Boolean) as AgentNode[]
  return nodes.find(item=>item.id===selectedId.value) || props.agents?.find(item=>item.status==='running') || props.orchestrator
})
const statusLabel=(status?:AgentStatus)=>({pending:'PENDING',running:'RUNNING',done:'COMPLETED',error:'ERROR',waiting:'WAITING'} as Record<string,string>)[status||'pending']
</script>
<template>
<section class="gen-card agent-graph-card">
  <div class="gen-title-row agent-module-head"><div><span class="eyebrow">MULTI-AGENT ORCHESTRATION</span><span class="gen-title">{{ title || 'Agent 编排' }}</span></div><div class="agent-network-status"><i></i><span>{{ (agents || []).filter(item => item.status === 'running').length }} ACTIVE</span></div></div>
  <div class="agent-topology">
    <div class="agent-root-wrap"><button v-if="orchestrator" class="agent-root-node" :class="orchestrator.status || 'running'" @click="selectedId = orchestrator.id"><span class="agent-node-orbit"><i></i></span><span class="agent-node-copy"><small>{{ orchestrator.role || 'ORCHESTRATOR' }}</small><b>{{ orchestrator.name }}</b><em>{{ orchestrator.task || '协调数据需求开发与交付依赖' }}</em></span><span class="agent-status-pill">{{ statusLabel(orchestrator.status) }}</span></button></div>
    <div class="agent-connector" aria-hidden="true"><span></span></div>
    <div class="agent-children" :style="{ '--agent-count': String(Math.max(1, (agents || []).length)) }">
      <button v-for="agent in agents || []" :key="agent.id" class="agent-child-node" :class="[agent.status || 'pending', { selected: selected?.id === agent.id }]" @click="selectedId = agent.id"><div class="agent-child-head"><span class="agent-mini-orb"><i></i></span><span class="agent-status-dot"></span></div><small>{{ agent.role || 'SUB AGENT' }}</small><b>{{ agent.name }}</b><p>{{ agent.task || '等待任务' }}</p><div class="agent-progress"><i :style="{ width: `${agent.progress ?? (agent.status === 'done' ? 100 : 0)}%` }"></i></div><div class="agent-child-foot"><span>{{ statusLabel(agent.status) }}</span><time v-if="agent.durationMs !== undefined">{{ (agent.durationMs / 1000).toFixed(1) }}s</time></div></button>
    </div>
  </div>
  <transition name="agent-detail"><div v-if="selected" class="agent-inspector"><div class="agent-inspector-title"><div><small>ACTIVE NODE</small><b>{{ selected.name }}</b></div><span>{{ selected.role || 'AGENT' }}</span></div><div class="agent-inspector-grid"><div><small>任务</small><strong>{{ selected.task || '—' }}</strong></div><div><small>状态</small><strong>{{ statusLabel(selected.status) }}</strong></div><div><small>输出</small><strong>{{ selected.output || selected.summary || '处理中…' }}</strong></div><div><small>工具</small><strong>{{ selected.tools?.join(' · ') || '—' }}</strong></div></div></div></transition>
</section>
</template>
