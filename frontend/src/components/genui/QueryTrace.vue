<script setup lang="ts">
defineProps<{
  title?: string
  durationMs?: number
  steps?: Array<{
    title: string
    description?: string
    status?: 'pending' | 'running' | 'done' | 'error'
    durationMs?: number
    kind?: 'intent' | 'semantic' | 'sql' | 'execute' | 'insight'
  }>
}>()

const kindLabel = (kind?: string) => ({
  intent: '意图',
  semantic: '语义',
  sql: 'SQL',
  execute: '执行',
  insight: '洞察',
}[kind || ''] || kind || '')
</script>

<template>
  <section class="gen-card trace-card">
    <div class="gen-title-row">
      <div>
        <span class="eyebrow">执行链路</span>
        <span class="gen-title">{{ title || '需求交付链路' }}</span>
      </div>
      <span v-if="durationMs !== undefined" class="trace-duration">{{ durationMs }} ms</span>
    </div>
    <div class="trace-flow">
      <div v-for="(step, index) in steps || []" :key="`${step.title}-${index}`" class="trace-step" :class="step.status || 'pending'">
        <span class="trace-index">{{ String(index + 1).padStart(2, '0') }}</span>
        <div class="trace-copy">
          <div><b>{{ step.title }}</b><span v-if="step.kind">{{ kindLabel(step.kind) }}</span></div>
          <p v-if="step.description">{{ step.description }}</p>
        </div>
        <time v-if="step.durationMs !== undefined">{{ step.durationMs }}ms</time>
      </div>
    </div>
  </section>
</template>
