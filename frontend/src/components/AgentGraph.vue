<script setup lang="ts">
import type { AgentNode } from '../workspace/types'
defineProps<{ agents: AgentNode[] }>()
</script>

<template>
  <section class="surface agent-surface">
    <div class="surface-heading"><div><span class="eyebrow">ORCHESTRATION</span><h2>Agent 协作网络</h2></div><span class="live"><i /> LIVE</span></div>
    <div class="agent-grid">
      <article v-for="agent in agents" :key="agent.id" class="agent-card" :class="agent.status">
        <div class="agent-top"><span class="agent-orb">✦</span><span class="status-label">{{ agent.status }}</span></div>
        <strong>{{ agent.name }}</strong><p>{{ agent.task }}</p>
        <div class="progress"><i :style="{ width: `${agent.progress ?? 0}%` }" /></div>
        <div class="agent-meta"><span>{{ agent.progress ?? 0 }}%</span><span v-if="agent.duration">{{ (agent.duration / 1000).toFixed(1) }}s</span></div>
      </article>
    </div>
  </section>
</template>

