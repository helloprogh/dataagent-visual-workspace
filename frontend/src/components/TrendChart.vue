<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ points: number[] }>()
const width = 640
const height = 220
const padding = 10
const path = computed(() => {
  if (!props.points.length) return ''
  const min = Math.min(...props.points)
  const max = Math.max(...props.points)
  const range = max - min || 1
  return props.points.map((point, index) => {
    const x = padding + index * ((width - padding * 2) / Math.max(props.points.length - 1, 1))
    const y = height - padding - ((point - min) / range) * (height - padding * 2)
    return `${index ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)}`
  }).join(' ')
})
const area = computed(() => `${path.value} L ${width - padding} ${height} L ${padding} ${height} Z`)
</script>

<template>
  <svg class="trend-chart" :viewBox="`0 0 ${width} ${height}`" role="img" aria-label="趋势图">
    <defs>
      <linearGradient id="line" x1="0" x2="1"><stop stop-color="#58d7e7"/><stop offset=".5" stop-color="#7979f7"/><stop offset="1" stop-color="#d169e4"/></linearGradient>
      <linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#777cf5" stop-opacity=".28"/><stop offset="1" stop-color="#777cf5" stop-opacity="0"/></linearGradient>
    </defs>
    <g class="grid"><line v-for="i in 5" :key="i" x1="0" :y1="i * 40" :x2="width" :y2="i * 40" /></g>
    <path :d="area" fill="url(#area)" />
    <path :d="path" fill="none" stroke="url(#line)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
</template>

