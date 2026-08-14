<script setup lang="ts">
defineProps<{
  title?: string
  items?: Array<{
    label: string
    value: string | number
    unit?: string
    delta?: number
    description?: string
  }>
}>()
</script>

<template>
  <div class="gen-card">
    <div class="gen-title">{{ title || '核心指标' }}</div>
    <div class="kpi-grid">
      <div v-for="item in items || []" :key="item.label" class="kpi-cell">
        <span class="muted">{{ item.label }}</span>
        <strong>{{ item.value }}<small v-if="item.unit"> {{ item.unit }}</small></strong>
        <div class="metric-foot">
          <span v-if="item.delta !== undefined" :class="item.delta >= 0 ? 'up' : 'down'">
            {{ item.delta >= 0 ? '↑' : '↓' }} {{ Math.abs(item.delta) }}%
          </span>
          <span class="muted">{{ item.description }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
