<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  title?: string
  items?: Array<{ label: string; value: number }>
  centerText?: string
}>()

const palette = ['#3b82f6', '#14b8a6', '#8b5cf6', '#f59e0b', '#ef4444', '#64748b']
const total = computed(() => (props.items || []).reduce((sum, item) => sum + Math.max(0, item.value), 0))
const gradient = computed(() => {
  let cursor = 0
  const parts = (props.items || []).map((item, index) => {
    const ratio = total.value ? Math.max(0, item.value) / total.value : 0
    const start = cursor
    const end = cursor + ratio * 100
    cursor = end
    return `${palette[index % palette.length]} ${start}% ${end}%`
  })
  return parts.length ? `conic-gradient(${parts.join(',')})` : '#eef2f7'
})
</script>

<template>
  <div class="gen-card">
    <div class="gen-title">{{ title || '占比分析' }}</div>
    <div class="donut-layout">
      <div class="donut" :style="{ background: gradient }">
        <div class="donut-center">{{ centerText || total }}</div>
      </div>
      <div class="donut-legend">
        <div v-for="(item, index) in items || []" :key="item.label" class="legend-row">
          <span class="legend-dot" :style="{ background: palette[index % palette.length] }"></span>
          <span>{{ item.label }}</span>
          <b>{{ item.value }}</b>
        </div>
      </div>
    </div>
  </div>
</template>
