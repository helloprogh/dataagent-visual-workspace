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
</script>

<template>
  <section class="gen-card trace-card">
    <div class="gen-title-row">
      <div>
        <span class="eyebrow">AGENT TRACE</span>
        <span class="gen-title">{{ title || '需求交付链路' }}</span>
      </div>
      <span v-if="durationMs !== undefined" class="trace-duration">{{ durationMs }} ms</span>
    </div>
    <div class="trace-flow">
      <div v-for="(step, index) in steps || []" :key="`${step.title}-${index}`" class="trace-step" :class="step.status || 'pending'">
        <span class="trace-index">{{ String(index + 1).padStart(2, '0') }}</span>
        <div class="trace-copy">
          <div><b>{{ step.title }}</b><span v-if="step.kind">{{ step.kind }}</span></div>
          <p v-if="step.description">{{ step.description }}</p>
        </div>
        <time v-if="step.durationMs !== undefined">{{ step.durationMs }}ms</time>
      </div>
    </div>
  </section>
</template>
