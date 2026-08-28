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
const baseline = height - padY
const values = computed(() => (props.points || []).map(point => point.value))
const min = computed(() => Math.min(...values.value, 0))
const max = computed(() => Math.max(...values.value, 1))
const range = computed(() => Math.max(1, max.value - min.value))
const coordinates = computed(() => {
  const data = props.points || []
  return data.map((point, index) => ({
    ...point,
    x: data.length <= 1 ? width / 2 : padX + index * ((width - padX * 2) / (data.length - 1)),
    y: height - padY - ((point.value - min.value) / range.value) * (height - padY * 2),
  }))
})
const polyline = computed(() => coordinates.value.map(point => `${point.x},${point.y}`).join(' '))
const area = computed(() => coordinates.value.length
  ? `${padX},${baseline} ${polyline.value} ${width - padX},${baseline}`
  : '')
</script>

<template>
  <div class="gen-card">
    <div class="gen-title-row">
      <span class="gen-title">{{ title || '区域趋势' }}</span>
      <span v-if="unit" class="muted">单位：{{ unit }}</span>
    </div>
    <svg class="line-chart" :viewBox="`0 0 ${width} ${height}`" role="img" :aria-label="title || '区域趋势图'">
      <defs>
        <linearGradient id="area-chart-fill" x1="0" y1="0" x2="0" y2="1">
          <stop class="area-fill-start" offset="0%" />
          <stop class="area-fill-end" offset="100%" />
        </linearGradient>
      </defs>
      <line v-for="i in 4" :key="i" :x1="padX" :x2="width - padX" :y1="padY + (i - 1) * 52" :y2="padY + (i - 1) * 52" class="chart-grid" />
      <polygon v-if="coordinates.length" :points="area" fill="url(#area-chart-fill)" />
      <polyline v-if="coordinates.length" :points="polyline" fill="none" class="chart-line" />
      <g v-for="point in coordinates" :key="point.label">
        <circle :cx="point.x" :cy="point.y" r="4" class="chart-dot" />
        <text :x="point.x" :y="height - 7" text-anchor="middle" class="chart-label">{{ point.label }}</text>
      </g>
    </svg>
  </div>
</template>
