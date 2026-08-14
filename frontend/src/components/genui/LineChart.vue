<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  title?: string
  points?: Array<{ label: string; value: number }>
  unit?: string
}>()

const width = 640
const height = 220
const padX = 38
const padY = 26
const values = computed(() => (props.points || []).map(p => p.value))
const min = computed(() => Math.min(...values.value, 0))
const max = computed(() => Math.max(...values.value, 1))
const range = computed(() => Math.max(1, max.value - min.value))
const coordinates = computed(() => {
  const data = props.points || []
  return data.map((point, index) => {
    const x = data.length <= 1 ? width / 2 : padX + index * ((width - padX * 2) / (data.length - 1))
    const y = height - padY - ((point.value - min.value) / range.value) * (height - padY * 2)
    return { ...point, x, y }
  })
})
const polyline = computed(() => coordinates.value.map(p => `${p.x},${p.y}`).join(' '))
</script>

<template>
  <div class="gen-card">
    <div class="gen-title-row">
      <span class="gen-title">{{ title || '趋势分析' }}</span>
      <span v-if="unit" class="muted">单位：{{ unit }}</span>
    </div>
    <svg class="line-chart" :viewBox="`0 0 ${width} ${height}`" role="img">
      <line v-for="i in 4" :key="i" :x1="padX" :x2="width - padX" :y1="padY + (i - 1) * 52" :y2="padY + (i - 1) * 52" class="chart-grid" />
      <polyline v-if="coordinates.length" :points="polyline" fill="none" class="chart-line" />
      <g v-for="point in coordinates" :key="point.label">
        <circle :cx="point.x" :cy="point.y" r="4" class="chart-dot" />
        <text :x="point.x" :y="height - 7" text-anchor="middle" class="chart-label">{{ point.label }}</text>
      </g>
    </svg>
  </div>
</template>
