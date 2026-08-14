<script setup lang="ts">
defineProps<{ title?: string; value?: string | number; delta?: number; unit?: string; description?: string }>()
</script>
<template>
  <div class="gen-card metric-card">
    <div class="muted">{{ title || '指标' }}</div>
    <div class="metric-value">{{ value ?? '--' }}<small v-if="unit"> {{ unit }}</small></div>
    <div class="metric-foot"><span v-if="delta !== undefined" :class="delta >= 0 ? 'up' : 'down'">{{ delta >= 0 ? '↑' : '↓' }} {{ Math.abs(delta) }}%</span><span class="muted">{{ description }}</span></div>
  </div>
</template>
