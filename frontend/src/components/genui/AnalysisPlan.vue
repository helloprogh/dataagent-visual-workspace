<script setup lang="ts">
defineProps<{
  title?: string
  steps?: Array<{
    title: string
    description?: string
    status?: 'pending' | 'running' | 'done' | 'error'
  }>
}>()
</script>

<template>
  <div class="gen-card">
    <div class="gen-title">{{ title || '交付计划' }}</div>
    <div class="analysis-plan">
      <div v-for="(step, index) in steps || []" :key="`${step.title}-${index}`" class="plan-step">
        <span class="plan-node" :class="step.status || 'pending'">{{ index + 1 }}</span>
        <div>
          <b>{{ step.title }}</b>
          <p v-if="step.description">{{ step.description }}</p>
        </div>
      </div>
    </div>
  </div>
</template>
